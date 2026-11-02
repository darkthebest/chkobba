# ADR-0004: Unique display names, the players directory and presence visibility

**Status:** Accepted
**Date:** 2026-10-31
**Plan:** `context/plans/2026-10-31-players-directory.md`

## Context

- Display names are not unique today: two accounts can hold the same name. A searchable players directory (prefix search, exact match first, paginated) needs one claim per name.
- The server runs in goja: ES5-bundled, no SQL, no `require`. App code never writes Postgres; it uses Nakama storage, so the uniqueness key and the search route must both be Nakama storage primitives.
- The plan sketched two storage assumptions: a `storageList` value-field prefix filter, and claim and own records in one collection. Both were checked against a live stack before any record or RPC shape was fixed.
- Every `@chkobba/protocol` change is additive; shipped builds must keep working.
- The folded name can contain Arabic letters (up to 128 characters / 256 UTF-8 bytes), so it is not a safe storage key by default.
- Presence is public to any follower today (ADR-0003), and players need a visibility choice that is actually enforced rather than cosmetic.
- A searchable directory makes players findable, so it must not become a way to see through a block, and its exposure to enumeration needs a stated limit.

**Observed on Nakama 3.40 (2026-10-31).** Live probes ran on `heroiclabs/nakama:3.40.0+d4d92f9` with `postgres:16-alpine` and were then reverted. The decision below records what was observed, not what the plan assumed.

| Question | Observed |
|---|---|
| Storage key/collection charset | No runtime charset restriction: `ABCDEF`, `a b`, `a/b`, `aب` all wrote and read. The only limit is **128 characters** (Postgres `varchar(128)`), not 128 bytes; a 128-character Arabic key (256 bytes) succeeded, 129 failed |
| `nk.sha256Hex` | Does not exist (`typeof === 'undefined'`) |
| `nk.sha256Hash` | Exists; hashes UTF-8 and returns lowercase hex (`sha256Hash('abc')` = `ba7816bf…15ad`, matches `sha256sum`) |
| `storageList` value-field prefix query | **Not possible**: `storageList` has no query argument |
| Storage index prefix query | Works: `registerStorageIndex` + `storageIndexList` |
| Index cursor | Offset-based (`indexListCursor`), unlike `storageList`'s keyset cursor |
| `CREATE_ONLY` rejection | `GoError` with own props `stack`, `message`, `value`; **no `code`** |

## Decision

This revision fixes the storage route, the claim key, the fold and the claim lifecycle, block visibility, the directory's limits and exposure, and presence visibility.

### 1. The search route is a Nakama storage index

The plan's "`storageList` value-field prefix filter" is not implementable. `storageList` takes `(collection, userId, limit, cursor)` with no query parameter: passing `'+value.fold:chkobba*'` in the caller id slot throws `TypeError: expects caller id to be valid identifier`, and passing it beyond the signature is silently ignored (unfiltered rows returned). The same intent is available through the storage-index API.

- `InitModule` registers one index over the claim collection:
  ```ts
  initializer.registerStorageIndex(DIRECTORY_INDEX_NAME, DIRECTORY_COLLECTION, undefined, ['fold'], [], SEARCH_INDEX_MAX_ENTRIES, false);
  ```
  `key` is `undefined`, so the index covers the whole collection; `['fold']` is the only indexed value field; `indexOnly: false` returns full records, so the folded value comes back with the row.
- Search queries it with the folded prefix and a trailing `*`:
  ```ts
  nk.storageIndexList(name, '+value.fold:' + foldedPrefix + '*', limit);
  ```
- Observed query semantics, which the search module depends on:
  - `+value.fold:chkobba*` matches by prefix.
  - `+value.fold:chkobba` (no `*`) matches exactly only, so the `*` is required for prefix search.
  - Matching is **case-sensitive on the raw indexed value**: `+value.fold:CHKOBBA*` against a lowercase value returns no rows.
  - Writes made in the same RPC are visible to the index immediately (synchronous updates).
- Therefore the indexed value is the **lowercase folded form** (`NameClaim.fold`), and every query runs the same `foldName` before building the prefix. Writer and reader share one fold implementation in `@chkobba/protocol`.

### 2. The claim key is `n` + lowercase SHA-256 hex of the folded name

`nameClaimKey(folded)` = `NAME_CLAIM_KEY_PREFIX` (`'n'`) + `sha256Hex(folded)`: **65 ASCII characters**.

- The probe showed Nakama accepts any key characters up to 128 characters, so a stricter key is a deliberate choice, not a limit:
  - uniform length and ASCII for every name, Latin or Arabic;
  - the folded Arabic name (up to 128 characters / 256 bytes) never becomes a key;
  - keys stay stable if Nakama later tightens the charset to what its documentation implies.
- The folded form lives in a **value field only** (`fold`), where the index can read it. It is never in a key.
- Exact-match reads use the same derived key (`storageRead` on `n<sha256hex>`), so "exact first" does not need a query.

### 3. Own records live in a separate collection

- With `key` omitted, the index entry is `{"key":"*"}`: a **whole-collection** index. Any record in that collection carrying a `fold` field would be indexed, including the user's own-claim record.
- So own records move to `player_directory_own` (same permissions: owner read 1 / write 0). They are per-user bookkeeping, not search data.
- Claim records (keys `n<sha256hex>`) and the per-caller limits record stay in `player_directory`.
- The limits record carries no `fold`, so it is not indexed even though it shares the claim collection. Records without the indexed field do not enter the index.

### 4. Index pagination is offset-based

- `storageIndexList` cursors are `indexListCursor`, which encodes an integer offset, not a keyset position.
- An insert, update or delete before the current offset shifts the window: a traversal can **skip or duplicate** rows. The search module dedupes by user/claim key and tolerates gaps; it must not assume a stable total.
- A `null` cursor ends traversal. Calling again with it restarts from page 1, so the client treats `nextCursor: null` as the last page.

### 5. A create-only rejection is handled by catch-and-re-read

- The claim write uses `version: '*'` (`CREATE_ONLY`) so only one account can take a folded name.
- The second write throws a `GoError` whose own properties are `stack`, `message`, `value`; it has **no `code`**, and `JSON.stringify(err)` is `{"value":{}}`. The only usable signal is the message: `failed to write storage objects: Storage write rejected - version check failed.`
- Follow `apps/server/src/rpc/roomStore.ts`: catch, re-read the claim, and decide. Never inspect the rejection for a numeric code, and never treat the message as an API contract.

### 6. Hashing: `nk.sha256Hash` is the goja reference

- `nk.sha256Hex` is absent; `nk.sha256Hash` is present and returns lowercase hex over UTF-8. It is the reference for parity testing.
- `@chkobba/protocol` ships its own dependency-free SHA-256 because `nameClaimKey` lives in the protocol and both server and client derive the same key from it. A server-only `nk.sha256Hash` cannot serve that shared helper.
- The hand-rolled hash is ES2017/goja-safe and tested against published vectors. A Node/goja parity check against `nk.sha256Hash` is a later task (Task 1.11), not assumed here.

### 7. `maxEntries` is an explicit choice with an untested overflow policy

- The index is registered with `SEARCH_INDEX_MAX_ENTRIES` (a named constant, not an accidental default). The probe used 1000 and never reached the limit.
- What happens on overflow — whether the oldest entries are evicted, new writes stop being indexed, or registration fails — was **not tested**. Any of these would silently shrink search results.
- This is accepted as a v1 risk: the constant is explicit and reviewable, and the overflow policy must be probed before the directory is relied on at scale. The bounded scan below is the ready fallback if the index proves unreliable.

### 8. The bounded scan is a documented contingency only

- If the index route had failed, search would page `storageList` over the claim collection at 100 records per page for up to `SEARCH_SCAN_MAX_PAGES` pages (`6`), stop at `SEARCH_MAX_RESULTS`, and set `capped`.
- Its scaling limit is the reason it is not primary: cost grows with the **total number of claims** and every page is a full collection read, so it is only viable at early scale.
- Because the index route verified, the scan is **not implemented**. It stays documented so the fallback its limit is known, rather than discovered under load.

### 9. Name folding: one explicit map, and collisions are by design

`foldName` in `packages/protocol/src/directory.ts` is the single key for uniqueness and search. It is one explicit character map over UTF-16 code units — not `String.prototype.normalize`, not a `u`-flag regex and not case methods — so it bundles into goja, and scripts outside the display-name allow-list stay unchanged by construction.

| Rule | Example |
|---|---|
| Uppercase `A-Z` → lowercase | `HEDI` → `hedi` |
| Latin-1 accented letters → base letter (`Æ`/`æ` → `ae`, `Þ`/`þ` → `th`, `ß` → `ss`; `×` and `÷` are not folded) | `Hédi` → `hedi` |
| Arabic alef variants `آ أ إ ٱ` → `ا` | one base letter |
| Arabic `ئ ى` → `ي`, `ة` → `ه`, `ؤ` → `و` | one base letter |
| Arabic-Indic digits `٠-٩` → ASCII `0-9` | one digit set |
| Runs of spaces collapsed to one; leading and trailing spaces trimmed | ` Abu   Bakr ` → `abu bakr` |
| Every other code unit passes through unchanged | a future script is never silently folded |

- **Two names that fold equal are the same name.** `Hédi`, `HEDI` and `Hedi` all fold to `hedi`, so only the first claim succeeds and the next is refused. That is intended: one handle, and no lookalike squatting.
- **Consequence:** a player can lose a visually distinct spelling. The copy must therefore say "this name is taken", never "invalid" — the spelling is valid, the claim is not free.
- The map is versioned (`NAME_FOLD_VERSION`); changing it changes claim keys and requires claims to be re-derived.
- The map is written against the display-name allow-list in `packages/protocol/src/names.ts`; anything outside that allow-list passes through unchanged.

### 10. Claim lifecycle and the release guard

| Record | Collection / key | Permissions | Written by |
|---|---|---|---|
| Claim | `player_directory/n<sha256hex(fold)>` | system-owned, read 0 / write 0 | the name hooks (create-only write) |
| Own claim | `player_directory_own/own/<userId>` | owner read 1 / write 0 | the name hooks |
| Limits | `player_directory/limits` | read 0 / write 0 | the directory RPCs |

- **Acquire:** `beforeUpdateAccount` writes the claim with `version: '*'` (`CREATE_ONLY`) on the deterministic key. A rejection means another account holds it: catch, re-read and throw `name_taken` (section 5). A storage failure that is not a clash fails the update safely rather than claiming the name is taken.
- **Release guard:** `afterUpdateAccount` deletes the old claim **only when the fold changed** (`oldFold !== newFold`). A rename that only changes casing or accent spelling folds to the same key; releasing it would delete the claim the before hook just wrote and silently unlist the player. The guard is the difference between "rename works" and "rename silently unlists", so it is a tested requirement, not an implementation detail.
- The old key is deleted only while it still points at this user, so a stale release never removes a claim another account has since taken.
- **Own record:** `afterUpdateAccount` rewrites `own/<userId>` with `claimKey`, `fold` and `name`, so a client learns that it is listed without scanning the claim collection.
- **Lazy reconciliation:** a claim whose owner's live display name folds differently, or whose owner account is gone, is stale. It is skipped by search and reclaimable by the next claimant. This is what bounds the non-transactional window.
- **Backfill:** accounts with a `NameRecord` but no claim are listed on their next sign-in, best effort. A clash leaves the account unlisted; a storage failure does nothing. Backfill never blocks sign-in.
- **Not transactional.** The before and after hooks are two separate writes with no transaction between them. A crash in the window can orphan a claim; because the claim carries the owner id and the fold, reconciliation can identify and reclaim it. Orphan claims are bounded by reconciliation, not prevented.

**Self-healing on sign-in.** Sign-in also verifies the own record's pointer: when the claim row it names is missing or now belongs to another account, the account re-acquires its live name through the same bounded, reclaim-only path and rewrites the own record. A lost claim therefore repairs itself on the next sign-in, so a player cannot be stranded unlisted with no route back short of a rename; a live foreign holder is still left untouched and the account stays unlisted.

### 11. Block is mutual invisibility with one indistinguishable answer

- A block in either direction removes the pair from each other's view: neither appears in the other's search results, and neither can open the other's profile.
- The refusals are **identical to an unknown id**: search returns an ordinary miss (no row), and a profile read throws `directory_not_found` (NOT_FOUND 5). There is no "blocked" answer, so a blocked player cannot confirm the block, nor tell it from a deleted account or a typo.
- The caller's own blocks are Nakama state 3 (`friendsList(caller, 3)`). There is no reverse index for "who blocked me", so each returned candidate is checked with `friendsList(candidate, 3)` — one call per row, at page size 20.
- A per-candidate reverse check that fails or is truncated **fails closed**: the candidate is treated as blocked and omitted. The cost is a rare hidden innocent player; the alternative is leaking the block.
- Blocking already removes the friend edge in both directions in Nakama; this ADR does not change that.
- Self is always excluded from results.

### 12. Limits and the enumeration posture

| Control | Value |
|---|---|
| Authentication | required for every directory RPC |
| Query bounds | `SEARCH_MIN_CHARS` = 2 folded characters, `SEARCH_MAX_CHARS` = 16, at most `SEARCH_MAX_QUERY_INPUT` = 64 raw characters before folding |
| Page size | `SEARCH_PAGE_SIZE` = 20 |
| Result cap | `SEARCH_MAX_RESULTS` = 60 per query across pages; `capped` says more matches exist |
| Rate limit | per-caller fixed window, in the server-owned `player_directory/limits` record (`DirectoryLimitsRecord`) |

- **No endpoint lists everyone.** Search requires a qualifying prefix. An empty query is not a browse: the client shows the caller's own recent players instead, which is not a server-side listing of accounts.
- The query path is `normalizeQuery` (cap the raw input, then fold) and `isSearchableQuery` (folded length within bounds), the same `foldName` the writer uses; a query that fails either gate is `directory_bad_query`, not an empty result.
- **A determined script can still walk short prefixes with throwaway guests.** Guest accounts are free (ADR-0001, ADR-0003), so a per-caller limit is dodgeable. Two characters, a 20-row page and a 60-result cap make the full walk large but not impossible; this is accepted for v1.
- **Later hardening, not v1:** a per-IP window through `ctx.clientIp` (as ADR-0002 already notes for room codes), plus monitoring. Nothing in v1 depends on it.

### 13. What the directory exposes

| Field | Search row | Profile | Notes |
|---|---|---|---|
| `userId` | yes | yes | not secret: already a follow target (ADR-0003) |
| display name | yes | yes | the chosen, claimed spelling |
| presence label (`visible` / `hidden`) | yes | yes | a privacy choice, never an online/offline signal |
| competitive and practice stats | no | yes | aggregated counters only (ADR-0005) |

- Never exposed: friend codes/usernames, session ids, emails, storage records or keys, and other players' ids (a friend list, for example).
- The caller's own relation (friend, pending, blocked) is not a directory field: the client derives it from its own friend list, so the directory never tells a caller who blocked them.

### 14. Presence visibility

The setting is saved with the profile (`profile/prefs`, `PresencePrefsRecord`), defaults to Everyone, and is written only by the `set_presence_visibility` RPC. There are two states, and their limits are explicit.

- **Everyone is public by design.** It is the default, and it is what the product means by presence: the player's status is published to any follower, and the directory and profile may follow visible results to show availability. Choosing Everyone means being visible to people the player has not met; a temporary follow of an on-screen result is the same public access as any other follower, not a leak.
- **Nobody is the only state Nakama enforces.** The social socket connects with `createStatus: false` (appear-offline), so Nakama hides the player from **everyone, friends included**. It is not "invisible to strangers only". There is no third state in v1.
- **Friends-only presence is future work and must not be promised in UI copy.** Nakama cannot express it; it would need a server-owned presence record (the client reports lobby/room/playing and the server filters reads). It is explicitly out of scope for v1. Settings copy says only that Nobody hides you from everyone and promises nothing further.

Recorded limits:

- The wire label `hidden` means "publishes nothing", **not** "offline". Search (`DirectoryPlayer.presence`) and profile (`PlayerProfileResponse.presence`) carry it, and the UI renders a neutral "no availability" state — never an offline dot and never the offline text.
- Exposing `hidden` tells others that this player opted out. That is intended: the label is a privacy choice, not a status, and the copy must not imply more.
- The friends list still renders a Nobody player as offline for v1, because no status arrives and the list has no hidden slot. This is accepted: the directory and profile are honest, the friends list is not yet. It is the concrete case for server-owned presence later.
- Switching the setting reconnects the social socket with status on or off, so it takes effect on the next connection. Only the server writes the prefs record; a client cannot publish a value the server did not save.

## Consequences

**Positive**

- Search cost is proportional to the prefix's matches, not the collection size; no per-query full scan.
- Every claim key is 65 ASCII characters for Latin and Arabic names alike, and the folded form stays in a value field.
- A separate own-record collection keeps the whole-collection index free of bookkeeping rows.
- The offset-cursor behaviour is known up front, so dedupe and gap tolerance are built in rather than discovered in production.
- Claim collisions are handled without depending on an unverified error shape.
- The route was verified on the exact Nakama image used in development, not inferred from documentation.
- One fold gives every handle a canonical key, so lookalike spellings cannot claim the same name twice.
- Rename is one deterministic key, one create-only write and one guarded release: no scan, no lock, no index lookup.
- Blocks reuse Nakama's own edges and answer exactly like an unknown id, so a block cannot be confirmed from the outside.
- The directory is authenticated, prefix-only, page-capped and rate-limited, with no endpoint that lists everyone.
- Presence visibility has an enforceable default and an honest hidden label that is never mistaken for offline.

**Negative and mitigations**

| Consequence | Mitigation |
|---|---|
| Index matching is case-sensitive on the raw value | Both writer and reader use the same protocol `foldName`; a mismatched fold would silently return nothing, so fold vectors and e2e search cover it |
| Offset cursors can skip or duplicate rows | Dedupe by user/claim key and tolerate gaps; `null` means last page |
| `maxEntries` overflow policy is untested | Named constant, stated risk, probe before scale, bounded scan as fallback |
| The 128-character storage limit is characters, not bytes; 128 Arabic characters are 256 bytes | No key contains the folded name; values are validated and tested at the maximum name length |
| A hand-rolled SHA-256 is correctness-critical | Published test vectors in the protocol package; Node/goja parity check planned against `nk.sha256Hash` |
| The hashed key is not reversible, so release needs the folded form and claim key stored alongside | The claim's value field carries the fold; the own record carries `claimKey`, `fold` and `name` (`OwnClaim`) |
| Two collections instead of one | Confined to claim writes and reads; the split is what keeps the index clean |
| Registration is a startup step; a missing index breaks search | Registered once in `InitModule`; smoke/e2e search exercises it after every module rebuild |
| A collection or index rename is a migration | Names are shared constants, and the index name is versioned in code |
| Fold collapses visually distinct names, so a player can lose a preferred spelling | Intended (one handle, no lookalike squatting); the copy says "this name is taken", never "invalid" |
| The claim lifecycle is not transactional; a crash between the before and after hooks can orphan a claim | The claim carries the owner id and the fold; lazy reconciliation treats a mismatched or ownerless claim as stale and reclaimable |
| Releasing the old claim unconditionally would silently unlist a casing or accent-only rename | Release guard: delete only when `oldFold !== newFold`; covered by a dedicated test |
| The fold table is a maintenance surface: a script outside the allow-list stays unfolded by construction | Accepted; the fold is versioned (`NAME_FOLD_VERSION`) and the allow-list and the map change together |
| One reverse-block check per returned row, and a fail-closed check can hide an innocent player | Accepted at page size 20; block lists are expected to be tiny (cap 1000); a reverse index is the later optimisation |
| The directory is still walkable with throwaway guests | Two-character minimum, 60-result cap and per-caller window; per-IP limits and monitoring are stated later hardening |
| Everyone is public to any follower, including the directory's temporary follows | Product decision, not an accident; the copy says Everyone is visible and Nobody hides from everyone |
| Friends-only presence cannot be offered in v1, and a Nobody player reads as offline in the friends list | Stated in the UI copy and recorded here; the concrete case for server-owned presence later |
| `hidden` reveals that a player opted out | Intended: it is a privacy choice, not a status; the label never means offline |
| `name_taken` is a new wire message; shipped builds map an unknown message to a generic error | Additive and acceptable in the pre-release window (noted in `names.ts`) |

## Alternatives considered

| Alternative | Why not |
|---|---|
| `storageList` with a value-field prefix filter (the plan's sketch) | Nakama 3.40 `storageList` has no query argument; it throws or silently ignores the filter. The storage index is the equivalent route |
| The folded name as the storage key | It works on the runtime path (no charset check), but Arabic names run to 128 characters / 256 bytes, lengths vary, and the key would depend on an undocumented permissiveness. The hashed ASCII key is uniform and future-proof |
| Reusing `storageList` keyset-cursor semantics for the index | The index cursor is offset-based; assuming keyset stability would skip or duplicate rows. Dedupe and gap tolerance are built against the observed cursor |
| Inspecting the `CREATE_ONLY` rejection for a numeric code | The rejection is a `GoError` with no `code`; `roomStore`'s catch-and-re-read is the only reliable handling |
| `nk.sha256Hex` for the claim key | It does not exist in goja. `nk.sha256Hash` is used as the parity reference, and the protocol ships its own hash for both sides |
| Claim and own records in one collection | A whole-collection index (`"key":"*"`) would also index the own record's `fold`, polluting search results. Own records get `player_directory_own` |
| The bounded paginated scan as the primary search | Cost grows with the number of claims and each page is a full collection read. Kept as a documented contingency only |
| A separate search service or a dedicated Postgres table | App code never writes SQL; Nakama storage plus its index is the supported surface |
| Registering the index per user or per key range | The prefix is over a value field, not the key; a whole-collection value index is the only shape that supports a folded-prefix query |
| A client-side "invisible" flag, hidden from the server | Nakama publishes whatever status a connection creates; only `createStatus: false` hides it. A client-only flag would hide nothing from a follower |
| A friends-only presence state in v1 | Nakama has no such filter. It needs a server-owned presence record, a client report path and filtered reads; the plan explicitly scopes it out |
| Emitting `offline` for a player who chose Nobody | "Publishes nothing" is not "not connected". A separate `hidden` label and a neutral UI state keep the two honest |
| A distinct `directory_blocked` error, or a "not found or blocked" message | A distinct answer lets a blocked player confirm the block. Both directions answer `directory_not_found`, identical to an unknown id |
| A reverse-block index (`blockedBy` records) in storage | Saves one `friendsList` call per row but creates a second source of truth over Nakama's graph, to keep in sync on every block and unblock. Per-candidate checks are accepted at page size 20 |
| Releasing the claim on every rename | A casing or accent-only rename folds to the same key, so the release would delete the claim just written and unlist the player. Release only when the fold changes |
| Case-sensitive or exact-name uniqueness with no fold | "The same name" would become keyboard-dependent. The explicit fold defines it once for writers and readers |
| An "all players" or browse endpoint | It is the scrape target. Prefix search with a 2-character minimum and a hard result cap keeps the surface smaller |
| Per-IP limits in v1 (`ctx.clientIp`) | There is no trusted proxy story in local and LAN setups. The per-caller window and caps come first; per-IP is recorded as later hardening |
| Reusing the friend list as the directory | Friendship and searchability are separate (settled plan decision): unlisted guests can be friends and still not be searchable |
| A separate presence service for friends-only visibility | Would duplicate Nakama's socket and status ownership. A server-owned presence record is the smaller future step |

## Amendment (2026-11-01): where the shipped code differs from this text

Accepting this ADR with the code as it stands. These are the places where the decision sections above describe the intent more simply than the implementation does; the code is taken as authoritative and the differences are recorded here rather than edited into the decision text.

- **The fold map is not literally the display-name allow-list.** The header comment of `packages/protocol/src/directory.ts` and section 9 say a code unit outside the allow-list "passes through unchanged". True for claims (no valid name can contain it), but `foldArabicLetter` also folds alef wasla (U+0671), which is *not* in `ALLOWED_NAME`, so a *query* containing it collapses to `ا`. No listing can be claimed under the folded form, so the practical effect is limited to search, where it is the intended behaviour.
- **Acquire is not "catch, re-read, throw `name_taken`".** A rejected create-only write is re-read and *judged*: a live foreign holder is `name_taken`, but a **stale or malformed** holder is cleared and the write retried once (section 5 and the "Lazy reconciliation" bullet agree with the code; only the one "Acquire" bullet and the header comment of `directory.ts` are simplified).
- **`capped` states less than it implies.** The shared type says "more matches exist than the cap returned"; the server computes `capped || (atCap && !exhausted)` and stops after `SEARCH_SCAN_MAX_PAGES` index fetches, so `capped` can mean "the scan bound was hit", not "an extra match was proven". The wire reference states only what the code guarantees.
- **The query bound is 64 UTF-16 code units**, not "64 characters" (section 12): the two differ only for surrogate pairs.
- **A fold-only rename keeps the original spelling.** `acquireClaim` treats an existing claim owned by the caller as acquired without rewriting `name`, so search and profile show the spelling written at claim time. Section 13 does not say this; the wire reference does.
- **Account deletion is not covered.** No deletion hook releases the claim, which is system-owned; today it reads stale and is reclaimable, but nothing guarantees the write. This is the open carry-forward before release.
- **Error codes.** All three directory RPCs also throw `directory_storage_error` (gRPC 13) and their own auth message (16); `DIRECTORY_RPC_ERROR_CODES` intentionally lists only the four business codes. The reference documents this.


## Related

- [ADR-0001](0001-durable-guest-identity-and-display-names.md)
- [ADR-0002](0002-private-tables-room-codes-and-host-model.md) (versioned, system-owned record pattern)
- [ADR-0003](0003-friend-codes-social-socket-and-presence.md)
- Plan: `context/plans/2026-10-31-players-directory.md`
