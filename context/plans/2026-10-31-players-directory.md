# Plan: Players directory v1 (unique names, search, player profile, stats)

**Status:** CONFIRMED — developer approved 2026-10-31
**CONFIRMED:** true
**Base branch:** `feature/2026-10-30-friends` (PR #2, stacked on private tables). Proposed branch for this work: `feature/2026-10-31-players-directory`.
**Prototype (agreed direction):** `context/ui/chkobba-users.html` + `context/ui/chkobba-users-app.js`

**Goal:**

- A display name becomes a player's unique, public, searchable handle; the generated friend code leaves the UI.
- A players directory searches by name prefix (case- and accent-insensitive, minimum 2 characters), exact match first, paginated, with an unlisted state for players who never chose a name. It is reached from a lobby **Players** tile and from the Friends screen's "Find players" card; Ranking becomes its second tab.
- A player profile shows availability, a competitive stat block and a practice stat block, plus the right friend actions, and is where ranking and more stats will hang off later.

## Prerequisite

This plan branches from the friends branch.

- **Phase 1** extends `apps/server/src/account/hooks.ts` (`beforeUpdateAccount` / `afterUpdateAccount`), reusing the existing format check and cooldown.
- **Phase 2** reuses the versioned-record pattern from `apps/server/src/rpc/roomStore.ts` and the rate-limit pattern from `apps/server/src/rpc/roomLimits.ts`.
- **Phase 3** hooks the same finish transition that writes recent players (`apps/server/src/match/tableMatch.ts:310-317`).
- **Phases 5 to 8** reuse the friends controller, `FriendRow`, the confirm sheet, the name gate, the social socket's availability, the lobby Settings screen and the `/friends` screen.

## Decisions already settled (developer; not re-opened)

1. **Display name is the unique, public, searchable handle.** It is enforced by its own server-owned record, not by Nakama (which has no unique index on `display_name`).
2. **Everyone is a guest until they link a social login**, and guests keep full friend rights. Linking links Apple/Google onto the same account; a second device's guest is abandoned, never merged.
3. **Friendship and searchability are separate.** Only players who chose a name are listed and searchable. Unlisted guests can still be friends, be invited, and add people from recent players.
4. **Block is mutual invisibility.** Neither side can find the other in search or open their profile, and the blocked player sees no distinguishable signal (an empty result is an ordinary miss). The blocker manages blocks from a dedicated **Blocked players** list with Unblock, reachable from Friends.
5. **Search is normalized prefix**: case- and accent-insensitive, minimum 2 characters, exact match ranked first, paginated.
6. **Stats are split**: a competitive block (server-verified online games; abandoned games and offline bot games excluded) and a practice block (device-reported bot games), never summed, practice never used for ranking.
7. **The unlisted state shows in two places**: a persistent card on the Friends screen plus the dismissible callout on the directory.
8. **Profile "Invite to table" exists only while the caller is in a live private room** (the invite carries the room code). Absent, not disabled, elsewhere. Unlisted players can still be invited.
9. **Entry point (decided 2026-10-31).** The lobby's "Ranking — Soon" tile becomes **Players**. Ranking is promised as the second tab inside the directory (the Players / Ranking switch the prototype draws), not as a lobby destination. The Friends screen keeps its "Find players" card as a secondary entry. Both entries reach the same screen.
10. **Presence visibility (decided 2026-10-31).** A setting saved with the profile, default **Everyone**.
    - **Everyone**: status as today; the directory may temporarily follow visible results and dots every row.
    - **Nobody**: the social socket connects with appear-offline (`createStatus false`), so Nakama hides the player from everyone, friends included. It is the only state Nakama enforces.
    - A truly enforceable "friends only" needs a server-owned presence record (client reports lobby/room/playing, server filters reads). That is out of scope for v1, is not promised in UI copy, and is recorded as a future note in ADR-0004.

## Open questions, with proposed defaults

The two live questions (entry point, presence visibility) are answered above. These remain, each with a proposed default to confirm or overturn.

1. **Practice-stats sync path.** Proposal: an authenticated `report_practice_game` RPC writes a server-owned practice record, one game per call, chkobbas clamped, per-user fixed window; it is display-only and never read by ranking. Alternative if that is judged too fake: keep practice local and show the block only on your own profile.
2. **Unique-name record and collisions.** Proposal: the claim happens in `beforeUpdateAccount` with a create-only version write (`roomStore`'s `CREATE_ONLY` pattern) on a hashed claim key, the old claim is released in `afterUpdateAccount`, and a stale claim is reclaimed lazily when its owner's live display name no longer folds to it. A backfill collision leaves the account unlisted rather than blocking sign-in.
3. **Search RPC shape.** Proposal: one `search_players` RPC with a Nakama storage cursor, a hard page size, a hard per-query result cap, and an exact-key read prepended ahead of the scanned rows; a separate `get_player_profile` RPC keeps profiles out of search responses. The storage route is the value-field prefix index, with the bounded scan only as the Phase 0 contingency.
4. **"Friends since" and "Met at a table".** nakama-js drops the friend edge's `update_time` (stored as 0 today), so "Friends since" cannot be shown. Proposal: drop it; derive "Met at a table … ago" from the caller's own recent players record, which already carries `endedAt`.
5. **Away-but-seated players in competitive stats.** Proposal: an away player still seated counts (their team played the game); a player who left the match does not.
6. **Invite on the profile vs the prototype.** The prototype disables Invite for offline friends. Since an invite is a persistent notification that reaches an offline friend later, proposal: within a live room, Invite is offered for every mutual friend regardless of availability.
7. **Legacy friend-code links.** Proposal: keep `/f/[code]` and the code lookup backend so links from shipped builds still resolve; only the code *UI* retires.

## Architecture Decisions

- **New ADR-0004 "Unique display names, the players directory and presence visibility"**: the claim record, the hashed claim key and its versioned write, fold rules and collisions, the value-field index as the search route (the scan as contingency), block mutual invisibility, rate limits and enumeration posture, what the directory exposes, and the presence setting — stating plainly that **Everyone is public by design**, that **Nobody is the only state Nakama enforces** (appear-offline, from friends too), that a server-side friends-only presence is future work, and that UI copy must not promise it.
- **New ADR-0005 "Stats provenance"**: competitive (server-observed, written at finish, abandoned excluded) vs practice (device-reported, display-only, clamped), why they are never summed, and the ranking rule.
- **Amend ADR-0001** with a dated note: `display_name` is no longer "non-unique"; it is now the unique public handle, still server-validated, and the `profile/name` record keeps its role.
- **Amend ADR-0003** with a dated note: the friend code and `/f/` link are retained for shipped builds but are no longer offered in the UI; the username is still the code and the add-by-username hook still works.
- Related: ADR-0002 (versioned system-owned record, rate-limit record shapes).

## Current state (key discoveries)

**Identity and names (server)**

- `beforeUpdateAccount` is the single enforcement point: locked fields, format via `checkDisplayNameFormat`, profanity and reserved words, one-hour cooldown from `profile/name` (`apps/server/src/account/hooks.ts:46-66`).
- The format allow-list is one regex with explicit `\uXXXX` ranges — ASCII and Latin-1 letters, Arabic letters plus `پ ڤ ڨ`, Arabic-Indic digits, single spaces (`packages/protocol/src/names.ts:58`). Length counts UTF-16 units, which equals characters for this allow-list.
- `afterUpdateAccount` writes `NameRecord { pickedAt, changedAt }`, owner read 1, write 0 (`hooks.ts:73-103`). A rejected name never starts a cooldown.
- `afterAuthenticateDevice` gives a new account `PlayerNNNN` with no `NameRecord`, so "no record" already means "name not picked" (`hooks.ts:151-170`).
- There is no uniqueness anywhere: two accounts can hold the same display name today.

**Versioned records, keys and limits (the pattern to copy)**

- Nakama storage `collection` and `key` are restricted to ASCII alphanumerics plus `-_.` (≤128 bytes each); the exact rule is re-verified on 3.40 in Phase 0. The display-name allow-list includes Arabic letters, so the folded name can never be a storage key.
- `CREATE_ONLY = '*'`, a create-only write that returns null on rejection, callers catch and re-read rather than inspecting the rejection (`apps/server/src/rpc/roomStore.ts:23`, `:45-65`). The rejection's JavaScript shape is unverified on Nakama 3.40 — the same caveat applies to a name claim.
- Fixed-window limits are pure functions over a stored record, with a parser that treats malformed records as empty (`apps/server/src/rpc/roomLimits.ts`, whole file). `social/inviteLimits.ts` follows the same shape.

**RPC and hook conventions**

- Numeric gRPC codes as local consts (`3/5/7/8/9/16`); errors thrown as `{ message: <code>, code }`; hooks must return `data`. Order checks so a rejection reveals little (`apps/server/src/social/inviteToTable.ts:37-105`).
- Server IDs are user ids; ids are not secret (already a `getUsers` and follow target). Display names are read with `nk.usersGetId` and fall back name → username → `Player`.

**Friend graph and blocking**

- Nakama owns the graph. Blocking removes the edge in both directions, drops a pending request, and a re-request from the blocked side is a 200 no-op (`docs/reference/wire-protocol.md`, "Blocking").
- `nk.friendsList(userId, limit, state)` is usable server-side for **any** user id, so "did this candidate block the caller" is answerable per candidate at the cost of one call each. There is no server-side "who blocked me" index.
- The caller's own blocked set is `friendsList(caller, 3)`; the friends screen already renders it as a section.

**Match and finish**

- `recordFinished` writes every unwritten roster member when the table reaches `finished`, guarded per player per `gameKey` (`apps/server/src/match/tableMatch.ts:310-317`); `recordLeaver` writes on `matchLeave` while playing (`:287-307`).
- `GameRoster` is pure and tracks `gameKey`, `roster`, `recentWritten` (`apps/server/src/social/gameRoster.ts:9-58`). A private table's game n has key `${seed}:${n}`.
- At finish the engine has everything competitive stats need: `scores`, `chkobbas` per team, `winner` (`packages/rules/src/types.ts:78-83`). Seats 0+2 and 1+3 are teams.

**Mobile**

- `/friends` renders `MyCodeCard` + `AddByCode` + `FriendsSections` (`apps/mobile/src/app/friends.tsx:25-29`); `/f/[code]` exists for shared links.
- `FriendsBackend` exposes `list`, `recentPlayers`, `lookupCode`, `add`, `remove`, `block`, `invite` (`apps/mobile/src/online/friends.ts:64-85`); the controller keeps optimistic overrides and derives sections (`apps/mobile/src/friends/useFriendsController.ts`).
- The social socket follows **mutual friends only**, in 50-id chunks, and publishes availability (`apps/mobile/src/online/socialSocket.ts:622-683`); the friend list is the source of truth, notifications only trigger refreshes.
- The game socket connects with status off and the social socket with status on (`apps/mobile/src/online/nakama.ts`); the social socket's connect flag is where appear-offline hooks in.
- Presence is `{ v: 1, a: 'lobby' | 'room' | 'playing' }` and is public to any follower (`apps/mobile/src/online/presence.ts`). `decodeAvailability` maps an absent status to `offline`, so today "no presence" and "offline" are the same thing on screen — the hidden state needs a third value carried by the directory/profile payloads, not by presence.
- `Profile` carries `displayName`, `namePicked`, `renameAvailableAt`, `friendCode` and is cached locally (`apps/mobile/src/online/profile.ts:27-43`).
- The room code lives only inside the room screens (`apps/mobile/src/components/room/PrivateRoom.tsx:40`); there is no app-level "I am in room X" value today.
- The lobby shows tiles for bots, quick match, private tables, join-by-code, friends (with the incoming-request badge) and ranking "Soon" (`apps/mobile/src/app/index.tsx:160-171`); the ranking tile is the one that becomes Players.
- The lobby Settings screen hosts the sound preferences via `SoundControls`; a privacy row belongs beside them.
- Names are shown as `<bdi>`-like isolated values in RTL; every new string needs `en` and `aeb`, and `en.ts` defines the `Translation` type.

## Desired end state

- **Entry points:**
  - A lobby **Players** tile opens the directory. Ranking appears as the directory's second tab, not as a lobby destination.
  - The Friends screen's "Find players" card opens the same directory.
- **Directory (`/players`):**
  - Empty query shows recent players, or a prompt when there are none.
  - One character shows "type at least 2 characters"; two or more shows a skeleton, then results.
  - Results are one row per unique name: avatar, name, availability, and an action chip that reflects the current edge (Add friend, Request sent, Friends).
  - A row whose player chose **Nobody** shows a neutral "no availability" state, never an offline dot.
  - No match shows "No player named …" with a way back to recent players.
  - An unlisted caller sees a dismissible callout with Choose a name.
  - The Players / Ranking switch shows Players as the active tab and Ranking as "Soon".
- **Profile:**
  - Availability with the same hidden state, a relation line, and two stat blocks labelled Competitive and Practice with a clear "practice is device-reported" marker.
  - Actions: Add friend (name-gated), Request sent with Cancel, Friends with Remove and Block (confirm sheet), Blocked with Unblock, and Invite to table only while the caller is in a live private room.
  - Not-found and self states.
- **Settings:**
  - A **Who can see you** row (Everyone / Nobody) in the lobby Settings, saved with the profile, defaulting to Everyone, with copy that says Nobody hides you from everyone and promises nothing more.
- **Friends screen:**
  - One "Find players" card replaces the code card and add-by-code.
  - A persistent "you are not listed" card with Choose a name until the player is listed.
  - A **Blocked players** screen reached from the Friends screen lists every blocked player with Unblock.
- **Everywhere:** no friend code in the UI; legacy `/f/CODE` links still resolve; `en` and `aeb`; phone and desktop; skins via tokens and slots only; names and numbers isolated in RTL.

## What we are NOT doing

- Ranking, leaderboards, seasons, rating or matchmaking by skill (the Ranking tab stays "Soon").
- A server-owned presence record, and a friends-only visibility state. Not promised in UI copy.
- Social login / account linking / account merge (step 2 of identity, not this plan).
- Renaming *rules* changes: format, profanity, one-hour cooldown stay as they are.
- Removing the friend-code mechanism from the server or the wire; only its UI retires.
- Report/abuse flows beyond block; chat; groups.
- Presence beyond availability (no "last seen", no custom status).
- Per-IP limits (`ctx.clientIp`) — noted as later hardening.
- Migrating existing accounts' names; local dev accounts are reset instead.
- Reworking the friends screen's existing sections beyond the entry card, the unlisted card and the Blocked players entry.
- Deploying the web build or the backend.

---

## Data-structure proposals

### `@chkobba/protocol` additions (additive only)

```ts
// packages/protocol/src/directory.ts (re-exported from index.ts)
// Pure, dependency-free helpers: foldName (uniqueness + search key), nameClaimKey,
// normalizeQuery, isSearchableQuery. No String.prototype.normalize, no \p{}, no u-flag regex.

export const NAME_FOLD_VERSION = 1;

/** Folded form: lowercase, Latin-1 accents and Arabic letter variants mapped to one
 *  base character, Arabic-Indic digits to ASCII, runs of spaces collapsed, trimmed.
 *  Two names that fold equal are the same name. */
export function foldName(name: string): string;

export const SEARCH_MIN_CHARS = 2;
export const SEARCH_MAX_CHARS = 16;
export const SEARCH_PAGE_SIZE = 20;   // rows per page
export const SEARCH_MAX_RESULTS = 60; // hard cap per query, across pages
export const SEARCH_MAX_QUERY_INPUT = 64; // raw characters accepted before folding
export const SEARCH_SCAN_MAX_PAGES = 6;   // bounded-scan contingency only

export const DIRECTORY_COLLECTION = 'player_directory';
/** Nakama storage keys are ASCII alphanumerics plus `-_.` only (re-verified in Phase 0),
 *  and the display-name allow-list includes Arabic letters, so the folded name can never be
 *  the key. The claim key is `NAME_CLAIM_KEY_PREFIX` + the lowercase SHA-256 hex of the
 *  folded name: 65 ASCII characters, inside any charset Nakama accepts. */
export const NAME_CLAIM_KEY_PREFIX = 'n';
/** hex(SHA-256(foldName(name))): the uniqueness key and the exact-match lookup key. */
export function nameClaimKey(folded: string): string;

/** Key = `n<sha256hex>`; owned by the system user; read 0 / write 0 (RPC only). */
export interface NameClaim {
  readonly userId: string;
  /** Display name as written when claimed (public string; used by the liveness check). */
  readonly name: string;
  /** The folded form this claim was taken under. A claim whose owner's live name folds
   *  differently is stale: reclaimable, and dropped from search results. */
  readonly fold: string;
  readonly claimedAt: number;
}
/** Key = `own/<userId>`; owner read 1 (the client needs its own listing state), write 0. */
export const OWN_CLAIM_KEY_PREFIX = 'own/';
export interface OwnClaim {
  /** The claim key this user holds, so a release never has to rehash. */
  readonly claimKey: string;
  /** The folded form the claim was taken under (the release guard compares this). */
  readonly fold: string;
  /** Display name as written. */
  readonly name: string;
  readonly claimedAt: number;
}

/** Whether a player publishes presence to anyone. Default `everyone`. */
export const PRESENCE_VISIBILITY = ['everyone', 'nobody'] as const;
export type PresenceVisibility = (typeof PRESENCE_VISIBILITY)[number];
export const DEFAULT_PRESENCE_VISIBILITY: PresenceVisibility = 'everyone';
/** What other players learn about it. `hidden` means "publishes nothing", not "offline". */
export type PresenceVisibilityLabel = 'visible' | 'hidden';

/** Key = `prefs`, collection `profile`; owner read 1 (the client renders its own setting),
 *  write 0: only the `set_presence_visibility` RPC writes it. */
export const PROFILE_PREFS_KEY = 'prefs';
export interface PresencePrefsRecord {
  readonly visibility: PresenceVisibility;
  readonly updatedAt: number;
}

export interface DirectoryPlayer {
  readonly userId: string;
  readonly name: string;
  /** `hidden` when the player chose Nobody; never a presence signal by itself. */
  readonly presence: PresenceVisibilityLabel;
}

// RPC: search_players   request SearchPlayersRequest   response SearchPlayersResponse
export interface SearchPlayersRequest {
  readonly q: string;
  /** Opaque storage cursor from the previous page. */
  readonly cursor?: string;
}
export interface SearchPlayersResponse {
  readonly players: readonly DirectoryPlayer[];
  /** Null when this is the last page, or the result cap was reached. */
  readonly nextCursor: string | null;
  /** True when more matches exist than the cap returned. */
  readonly capped: boolean;
}

// RPC: get_player_profile   request GetPlayerProfileRequest   response PlayerProfileResponse
export interface GetPlayerProfileRequest {
  readonly userId: string;
}
export interface PlayerProfileResponse {
  readonly userId: string;
  readonly name: string;
  readonly presence: PresenceVisibilityLabel;
  readonly stats: PlayerStats;
}

// RPC: set_presence_visibility   request / response
export interface SetPresenceVisibilityRequest {
  readonly visibility: PresenceVisibility;
}
export interface SetPresenceVisibilityResponse {
  readonly visibility: PresenceVisibility;
  readonly updatedAt: number;
}

/** `search_players` / `get_player_profile` error `message` values. */
export const DIRECTORY_RPC_ERROR_CODES = [
  'directory_bad_query',    // malformed or too-short query, bad cursor, bad id (INVALID_ARGUMENT 3)
  'directory_rate_limited', // over the per-caller window (RESOURCE_EXHAUSTED 8)
  'directory_not_found',    // no such listed player, or a block in either direction (NOT_FOUND 5)
  'presence_bad_request',   // unknown visibility value (INVALID_ARGUMENT 3)
] as const;
export type DirectoryRpcErrorCode = (typeof DIRECTORY_RPC_ERROR_CODES)[number];
```

```ts
// packages/protocol/src/stats.ts (re-exported from index.ts)

export const STATS_COLLECTION = 'player_stats';
export const COMPETITIVE_STATS_KEY = 'competitive'; // owned by the player; read 0 / write 0
export const PRACTICE_STATS_KEY = 'practice';       // owned by the player; read 0 / write 0

/** One block. Competitive carries streaks; practice does not (display-only). */
export interface CompetitiveStats {
  readonly games: number;
  readonly wins: number;
  /** Team chkobba sweeps across counted games. */
  readonly chkobbas: number;
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly updatedAt: number;
}
export interface PracticeStats {
  readonly games: number;
  readonly wins: number;
  readonly chkobbas: number;
  readonly updatedAt: number;
}
/** What a profile renders. Absent records read as all-zero blocks. */
export interface PlayerStats {
  readonly competitive: CompetitiveStats;
  readonly practice: PracticeStats;
}

/** RPC: report_practice_game   request ReportPracticeGameRequest   response ReportPracticeGameResponse */
export interface ReportPracticeGameRequest {
  /** One finished offline bot game. */
  readonly win: boolean;
  /** Clamped server-side. */
  readonly chkobbas: number;
}
export interface ReportPracticeGameResponse {
  readonly practice: PracticeStats;
}
export const PRACTICE_MAX_CHKOBBA_PER_GAME = 21;
export const PRACTICE_REPORT_LIMIT = 60;      // reports per caller per window
export const PRACTICE_WINDOW_MS = 3600000;    // 1 h fixed window
export const PRACTICE_RPC_ERROR_CODES = [
  'practice_bad_request', // malformed payload (INVALID_ARGUMENT 3)
  'practice_rate_limited', // over PRACTICE_REPORT_LIMIT (RESOURCE_EXHAUSTED 8)
] as const;
export type PracticeRpcErrorCode = (typeof PRACTICE_RPC_ERROR_CODES)[number];
```

**Additions to existing protocol files:**

```ts
// packages/protocol/src/names.ts
// NAME_ERROR_CODES gains 'name_taken' (additive). Old builds read an unknown message as
// `network` and show a generic error; acceptable for a pre-release window.
```

**Unchanged:** opcodes, `Snapshot`, `PlayerInfo`, `RoomInfo`, `FRIEND_LIMITS`, notification codes, existing RPC payloads.

### Server

```ts
// apps/server/src/directory/ (new)
/** Pure: the caller's block sets and a candidate's verdict. */
export interface BlockView {
  /** Ids the caller blocked (Nakama state 3). */
  readonly blocked: readonly string[];
  /** Ids the caller must not see because they blocked the caller. */
  readonly blockedBy: readonly string[];
}
/** The per-caller directory limits record, `player_directory/limits`, read 0 / write 0. */
export const DIRECTORY_LIMITS_KEY = 'limits';
export interface DirectoryLimitsRecord {
  readonly searchWindowStart: number;
  readonly searches: number;
  readonly profileWindowStart: number;
  readonly profiles: number;
}

// apps/server/src/match/tableMatch.ts (TableMatchState gains, optional in older state)
//   readonly statsWritten: readonly string[];  // userIds whose competitive record has this gameKey
```

`DirectoryLimitsRecord` lives in `directory.ts` in the protocol (server-only record, but the shape is shared like `RoomLimitsRecord`).

### Mobile (`apps/mobile/src/online/`)

```ts
// directory.ts
export type DirectoryError = DirectoryRpcErrorCode | 'network';
export interface DirectorySearchResult {
  readonly players: readonly DirectoryPlayer[];
  readonly nextCursor: string | null;
  readonly capped: boolean;
}
export interface DirectoryBackend {
  /** Rejects on a network or server failure; a bad query is a returned reason, not a throw. */
  search(q: string, cursor?: string): Promise<DirectorySearchResult | { readonly error: DirectoryError }>;
  profile(userId: string): Promise<PlayerProfileResponse | { readonly error: DirectoryError }>;
}

// profile.ts: Profile gains
//   /** True when the player holds a live name claim and is therefore listed. */
//   readonly listed: boolean;
//   /** The player's own presence setting; everyone until the server says otherwise. */
//   readonly presenceVisibility: PresenceVisibility;

// socialSocket.ts: SocialSocket gains
//   /** Reconnect with status on or off; appear-offline hides the player from everyone. */
//   setVisibility(visibility: PresenceVisibility): Promise<void>;
//   /** Follows ids for the directory's on-screen results (capped, merged with mutual friends). */
//   setTemporaryFollows(ids: readonly string[]): void;

// roomSession.ts (new): the live private room, published by the room screens
export interface RoomSession {
  readonly code: string;
  readonly matchId: string;
}
```

---

## Phase 0: Contracts, storage route and decision records

**Goal:** fix the storage route, the claim key and the fold before any record shape or RPC depends on them, and record the unique-name, presence and stats decisions.

**Tasks**

- **Verify first** on Nakama 3.40, before the record shape is fixed: the exact storage `collection`/`key` charset (`A-Za-z0-9-_.`, 128-byte limit); whether `nk.sha256Hex` exists in goja; whether `storageList` can filter on a value field by prefix; how cursors behave; whether that index is case-sensitive. Record all of it in ADR-0004.
- Fix the claim key from the verification: `n` + lowercase SHA-256 hex of the folded name. If `nk.sha256Hex` is absent, add a dependency-free SHA-256 to `@chkobba/protocol` (ES2017, no `u`-flag regex) and test it against known vectors.
- Fix the search route with a stated preference: **value-field prefix index on the folded form**, recorded in ADR-0004 as the primary route; the bounded paginated scan (page 100, `SEARCH_SCAN_MAX_PAGES` pages, stop at the cap, set `capped`) is a contingency that applies only if the verification fails, with its scaling limit written into the ADR.
- Add `directory.ts` to `@chkobba/protocol`: fold rules, `nameClaimKey`, search constants, query gating, claim and own-claim records, presence visibility values and the prefs record, search/profile/setting payloads, error lists; re-export from `index.ts`.
- Add `stats.ts`: both stat blocks, the practice report payload and its limits; re-export.
- Add `name_taken` to `NAME_ERROR_CODES`, with a compatibility note for shipped builds.
- Implement `foldName` as one explicit character map (Latin-1 accents, Arabic alef/yaa/taa-marbuta variants, Arabic-Indic digits to ASCII, space collapse), ES2017 and goja-safe.
- Unit tests: fold vectors across Latin and Arabic (Hédi / HEDI / Hedi, alef and yaa variants, mixed scripts), claim-key vectors (ASCII for Latin and Arabic names alike, stable across runs), query gating boundaries, and the shared fixtures module under `protocol/testing/`.
- Write ADR-0004 (unique names, the hashed claim key, the search route, presence visibility and its limits) and ADR-0005 (stats provenance) with the ADR skill; add both to `docs/adr/README.md`.
- Add dated amendment notes to ADR-0001 and ADR-0003.

**Success criteria**

- The storage route, the claim-key scheme and the presence model are decided and written down before any record or RPC shape is final.
- Every claim key is ASCII for Latin and Arabic names alike; the folded form lives in a value field, never in a key.
- ADR-0004 states, in plain terms, that Everyone is public by design, that Nobody is the only state Nakama enforces, and that friends-only presence is future work not to be promised in copy.
- The protocol builds and both apps typecheck with no existing field changing shape.
- The fold and hash helpers bundle into the ES5 server module and produce identical results in Node and goja.
- Both ADRs are merged and the amendments are dated.

**Risks**

- Fold collapses visually distinct names (Hedi / Hédi) into one; intended, but the copy must say "this name is taken" rather than "invalid".
- A fold table is a maintenance surface: any future script outside the allow-list stays unfolded by construction.
- If `nk.sha256Hex` is missing, a hand-rolled SHA-256 is a correctness-critical piece of code; it needs published vectors in the tests.
- If the index route fails verification, search cost grows with the number of claims; the scan contingency and its limit are stated in ADR-0004 rather than discovered later.

---

## Phase 1: Unique-name registry and the name claim

**Goal:** a picked display name is unique and listed, claimed atomically, and released on rename; a collision is refused with a localized reason.

**Tasks**

- Storage module for the claim records: claim `player_directory/n<sha256 hex of the folded name>`, system-owned read 0 / write 0; own record `player_directory/own/<userId>`, owner read 1 / write 0.
- Extend `beforeUpdateAccount` to reserve the hashed claim key with a create-only version write; a clash throws `name_taken`; a storage failure is distinguished from a clash and fails the update safely.
- Capture the previous `fold` and `claimKey` in the before hook and pass them to the after hook.
- **Release guard:** `afterUpdateAccount` releases the old claim **only when `oldFold !== newFold`**. A rename that only changes casing or accent spelling folds to the same key, so releasing it would delete the claim the before hook just wrote and silently unlist the player.
- Write the new own record (`claimKey`, `fold`, `name`) in `afterUpdateAccount`; the release deletes the old key only while it still points at this user.
- Lazy reconciliation: a claim whose owner's live display name folds differently from the claim's `fold` is stale and reclaimable; a claim with no owner account is reclaimable the same way.
- Lazy backfill for accounts that have a `NameRecord` but no claim, on sign-in, best effort: success lists them, a clash leaves them unlisted without blocking sign-in.
- Preserve every existing rule: format, profanity, reserved words, cooldown, locked fields, hooks returning `data`.
- Server Vitest: first pick; rename to a new fold; rename that only changes casing or accents (claim kept, still listed); clash across casing and accents; stale-claim reclaim; backfill success and collision; storage failure; cooldown untouched.
- Note in `docs/how-to/local-backend.md` that a database wipe gives every account a clean claim.

**Success criteria**

- On a fresh local stack, two accounts cannot hold the same folded name.
- A rename frees the old name and takes the new one; a rename that only changes casing or accents keeps the claim and stays listed; a rejected rename keeps the old claim.
- Existing named testers are listed on their next sign-in, or stay unlisted when their name clashes, and are never blocked from signing in.
- The module still loads in goja.

**Risks**

- The before/after split is not transactional: a crash between them can orphan a claim. Lazy reconciliation bounds the damage, and the claim carries the owner id.
- A create-only rejection's shape is unverified on Nakama 3.40; follow `roomStore`'s catch-and-re-read instead of inspecting it.
- The release guard is the difference between "rename works" and "rename silently unlists"; it is a tested requirement, not an implementation detail.
- A released name can be taken by someone else seconds later; that is the point, but the rename UI must not promise otherwise.
- Two simultaneous picks of one name: one wins at the write, the loser gets `name_taken`.

---

## Phase 2: Search, profile and presence RPCs

**Goal:** an authenticated, rate-limited prefix search and a profile read that never reveals a block in either direction and never mistakes hidden presence for offline.

**Tasks**

- Consume the route fixed in Phase 0: value-field prefix index, with the bounded paginated scan as the contingency.
- **Exact match is an exact read, not a page sort:** hash the folded query and `storageRead` that claim key; skip it when stale or invisible; otherwise prepend it to the first page and dedupe it out of the scanned rows. A cursor page cannot be sorted globally, so this is the only way "exact first" holds once the exact match would land on a later page.
- Drop stale claims from results: a row whose owner's live display name folds to a different key is skipped and left reclaimable, so reconciliation covers what search returns and not only what a rename touches.
- Presence prefs module: read `profile/prefs` in one batched read per page (and one for the profile target), defaulting to Everyone when absent or malformed; map to `visible` / `hidden` only.
- Pure search module: query normalization and gating, page size, result cap and `capped` flag, dedupe against the exact read, presence labels, malformed payload and cursor handling.
- Block-visibility module: the caller's own state-3 list, and a per-candidate "did this candidate block the caller" check through `nk.friendsList(candidate, 3)`; a failed or truncated check fails closed (treat as blocked).
- `search_players` RPC: authentication, per-caller fixed-window limits, registry query, exact read first, presence labels, drop self and any candidate invisible under either block direction, return players plus cursor.
- `get_player_profile` RPC: authentication, limits, target must hold a live claim, either block direction answered exactly like an unknown id (`directory_not_found`), return name, id, presence label and both stat blocks (all-zero when absent).
- `set_presence_visibility` RPC: authentication, validate against `PRESENCE_VISIBILITY`, write `profile/prefs` (owner read 1, write 0), return the saved value. No client path writes the record directly.
- Directory limits record and its pure window functions, modelled on `roomLimits.ts`; errors thrown as `{ message, code }` in the `DIRECTORY_RPC_ERROR_CODES`.
- Register the three RPCs as top-level named functions in `main.ts`.
- Server Vitest: query gating and caps, scan cap and `capped`, exact-read-first with more matches than one page, stale rows skipped, self exclusion, block filtering in both directions, identical not-found answers, presence labels for Everyone/Nobody/absent/malformed, the setting round trip and its rejection, rate windows, malformed payloads and cursors.

**Success criteria**

- With curl or the console: a claimed name is found by its folded prefix; an unlisted display name is never returned; and with more matches than one page, the exact name is the first row even though the scan would have placed it later.
- A name whose owner renamed and whose claim is stale never appears as a result.
- A blocked pair cannot find each other, and both profile reads answer `directory_not_found` — identical to a random id.
- A player who set Nobody comes back as `presence: "hidden"` from both search and profile, indistinguishable from another hidden player and never labelled offline.
- The 2-character minimum and the result cap hold, and the window rejects the call after its limit.
- Old builds are unaffected: no existing endpoint changes.

**Risks**

- **Cost per search.** One candidate blocked-check per returned row (page size 20), plus the exact read and one batched prefs read. Accepted at v1 scale; a reverse-block index is the later optimisation if it hurts.
- **The scan contingency** reads page 100 across the collection up to the cap; stated in ADR-0004 with the indexed query as the fix before it hurts.
- **Fail-closed blocking** can hide an innocent player when a blocked list is truncated; the list cap is 1000 and block lists are expected to be tiny.
- **Enumeration.** Prefix search with a 2-character minimum, a page cap and a per-user window limits scraping, but a determined script can still walk short prefixes with throwaway guests. Mitigation to record: a per-IP window via `ctx.clientIp` later, and no bulk listing endpoint.
- **The presence label is a privacy choice, not a status.** Exposing `hidden` tells others "this player opted out", which is the intended product behaviour; ADR-0004 must say so, and the copy must not imply more.
- **What a profile exposes**: name, presence label, aggregated counters, and the caller's own relation. No codes, session ids, storage records or ids of other players.

---

## Phase 3: Competitive stats at game finish

**Goal:** each human seated when an online game finishes gets one competitive result; abandoned games are excluded and offline bot games never touch the block.

**Tasks**

- Pure stats reducer over one result (win/loss, the team's chkobbas, timestamp) maintaining games, wins, chkobbas, current and best streak.
- Storage module for `player_stats/competitive`, server-owned read 0 / write 0, read-modify-write, best effort, logging only.
- Match adapter: a `statsWritten` guard per `gameKey` next to `recentWritten`, written only on the transition to `finished`, for human seats still seated; never on leave; reset with a new game.
- Map seat to team (0+2, 1+3) and read the winner and team chkobbas from the finished engine state.
- Record the provenance rules in ADR-0005 (away-but-seated counts, leaver excluded, bots excluded, private tables count).
- Server Vitest: win and loss for the right team, chkobbas accumulation, streak growth and reset, one write per player per game, a leaver with no stats write, a reconnect counted once, private-table game two recorded separately, storage failure not failing the loop.

**Success criteria**

- A finished quick-match game raises each seated human's competitive games by one, and wins only for the winning team.
- A player who left mid-game gains nothing; a player who was away but seated gains one.
- No bot ever gets a record.

**Risks**

- Team chkobbas are counted for both partners, so the counter is team-level by design; the label must read "Chkobba sweeps", not "your sweeps".
- A crash between finish and write loses one game for a player; acceptable and consistent with recent players' best-effort stance.
- A disconnecting player whose seat is played by a bot is still "in" the game; confirming the away-but-seated rule (open question 5) is part of this phase.

---

## Phase 4: Practice stats reporting

**Goal:** offline bot games show a clearly marked practice block that can never be mistaken for competitive play or used for ranking.

**Tasks**

- `report_practice_game` RPC: authentication, per-caller fixed window, one finished game per call, chkobbas clamped to `PRACTICE_MAX_CHKOBBA_PER_GAME`, returns the updated block.
- Storage module for `player_stats/practice`, server-owned read 0 / write 0, last write wins.
- Client: report a finished offline bot game when a stored session exists, drop it silently otherwise; never queue.
- Server Vitest and mobile Jest for the payload mapping, the clamp, the window boundary, and the offline drop.

**Success criteria**

- An offline bot game shows up in the practice block on the next online profile read, and leaves the competitive block untouched.
- The profile renders both blocks without ever summing them.

**Risks**

- Practice counts are trivially inflatable by any client. This is accepted because they are display-only; ADR-0005 must state it plainly, and the profile must label the block as device-reported.
- Local offline play with no stored session reports nothing until the player goes online once; acceptable for a display-only block.

---

## Phase 5: Mobile directory and presence services

**Goal:** the app can search, read profiles, know whether it is listed, apply the presence setting to the social socket, and show availability on directory rows.

**Tasks**

- `DirectoryBackend` over nakama-js with the shared error mapping style of `friends.ts`, registered as a singleton in `services.ts`.
- `Profile` gains `listed` (from the own-claim record) and `presenceVisibility` (from `profile/prefs`), read in parallel with the account and name record and cached with the profile; absent or malformed prefs mean Everyone.
- Social socket: an appear-offline path so the socket connects with `createStatus false` for Nobody, and a `setVisibility` that reconnects when the value changes; the profile read applies it at startup before the socket may connect.
- Social socket: a capped temporary-follow set for the directory's on-screen results, merged with mutual friends and cleared when the directory closes; presence is public to any follower under Everyone, so this follows the developer's answer rather than a friends-only rule.
- App-level room session: a small store the room screens publish on mount and clear on leave, so "am I in a live room" is available to the profile screen.
- Decoder and derived-state work stays in the services layer, not the screens.
- Jest: search and profile mapping and error cases, `listed` for both states, presence prefs for both values plus absent, socket reconnect on change, temporary follows added and cleared, room session lifecycle, and that friends presence is unchanged.

**Success criteria**

- Mobile Jest and typecheck pass.
- Quick match, friends, invites and offline play are unchanged.
- Switching the setting to Nobody reconnects the social socket with status off and stops publishing availability; switching back restores it.
- Opening and leaving the directory follows and unfollows only the visible result ids.

**Risks**

- Follow churn when typing quickly; debounce plus a diff against the previous set, not a clear-then-follow.
- A setting change mid-session briefly drops the social socket; invites and presence resume on reconnect, and no notification is lost.
- A stale room code after a crash: the invite RPC remains the authority and answers `invite_room_not_found`.
- Temporary follows make availability visible to strangers in the same way as any follower; public by design under Everyone, and recorded in ADR-0004.

---

## Phase 6: Directory UI and the presence setting

**Goal:** players find each other by name on phone and desktop, in English and Derja, with honest loading, empty, no-result and hidden-presence states, and with the Players / Ranking tab inside the screen.

**Tasks**

- `/players` route: search field, 2-character gate, debounce, skeleton, results list, no-results state with "Search recent players", recent players when the query is empty.
- Players / Ranking switch inside the directory: Players active, Ranking a "Soon" placeholder tab; the route carries the tab so a deep link opens the right one.
- One row per player: avatar, name, availability, and the edge chip (Add friend, Request sent, Friends) reusing the friends action helpers and the name gate.
- Availability rendering has three outcomes, not two: online/room/playing as today, offline only for a visible player with no status, and a neutral "no availability" state for `presence: 'hidden'` — no dot, muted label, distinct from offline in both languages.
- Unlisted callout with Choose a name, dismissible, dismissal remembered locally.
- Settings: a "Who can see you" row in the lobby Settings beside the sound controls, Everyone / Nobody, saving through `set_presence_visibility` and applying through the social socket; copy states that Nobody hides you from everyone and promises nothing further.
- Desktop adaptation: list plus a detail panel at the 900 px breakpoint, matching the friends screen's two-column behaviour.
- `useDirectoryController`: query state, paging, result cap copy ("20+ results"), in-flight actions, optimistic edges with rollback, and the temporary-follow lifecycle.
- i18n keys for every string in `en` and `aeb` (including the hidden state and the setting), with the Derja copy flagged for sign-off; names and counts isolated in RTL.
- RNTL tests for the gate, each state, the hidden availability state, adding from a row, the callout, the setting row, the tab and both widths; regenerate typed routes.

**Success criteria**

- With two browsers at 1280 px and 390 px, in both languages: an accent-folded prefix finds the other player, Add sends a request, the chip moves to Request sent, and the unlisted callout disappears once a name is picked.
- A player on Nobody shows the neutral state in the other browser's row and profile, never an offline dot, and disappears from friends' presence entirely.
- With more matches than one page, the exact-match row is first and paging reaches the rest.
- Switching tabs keeps the search state and shows Ranking as "Soon".
- No result state is reached with a nonsense query, and the way back to recent players works.
- Nothing renders hard-coded text.

**Risks**

- Fast typing can land responses out of order; the controller needs a request sequence guard (the friends controller already models this).
- Only the exact-match row is globally first; later pages follow the storage order and cannot be re-sorted, so the list must not promise alphabetical order.
- The hidden state must not be rendered as "offline" anywhere; a single shared availability component avoids the drift.
- Derja copy for the setting and the hidden state needs a native check before merge.
- Web keyboard focus inside the search field must not trigger table keyboard shortcuts (that hook is table-only today; verify).

---

## Phase 7: Player profile UI

**Goal:** a profile that shows availability (including hidden), both stat blocks and the right actions, and becomes the place ranking and more stats attach to.

**Tasks**

- `/p/[userId]` on phone and the right panel on desktop, sharing one profile component; states for loading, found, not found and self.
- Header: avatar, name, availability with the same three outcomes as the directory, and the relation line (friends, request sent, blocked, or "met at a table … ago" from recent players).
- Hidden availability renders as its own line ("Availability hidden by this player"), not as offline, in both languages.
- Stats: two blocks with distinct labels, the practice block visibly marked as device-reported, zero states for new players.
- Actions by relation: Add friend (name-gated), Request sent plus Cancel, Friends with Invite, Remove and Block, Blocked with Unblock; Remove and Block through the existing confirm sheet.
- Invite to table rendered only when the shared room session exists (absent, not disabled); on send, reuse the room's invite path and the existing success/duplicate feedback.
- Block from the profile refreshes the friends controller so the player drops out of lists, search results, recent players and the Blocked players screen consistently.
- i18n for all strings; RTL-safe name and number rendering.
- RNTL tests for every relation, both availability outcomes including hidden, both stat blocks, the invite presence rule, the confirmations and the not-found state.

**Success criteria**

- Every prototype state is reachable: Add, Request sent, Friends, Blocked, hidden, offline, not found, self.
- Invite is absent outside a room and present inside one, for any mutual friend.
- A blocked pair never reaches a profile.
- Stats read from the server blocks and never from local data for other players.

**Risks**

- "Friends since" is unavailable (nakama-js drops the edge time); the prototype line must shrink to "You are friends" or "Met at a table".
- The room session is client memory; a profile opened after the room closed could briefly offer Invite until the RPC refuses. Acceptable, since the invite RPC is authoritative.
- A profile opened from the directory while the friend snapshot is stale may show a wrong relation for one render; the controller refresh on open bounds it.
- The friends list still renders a Nobody player as offline (no presence arrives); the directory and profile are honest, the friends list is not yet. Accepted for v1 and recorded as the case for server-owned presence.

---

## Phase 8: Lobby tile, Friends screen, Blocked players and the unlisted state

**Goal:** the directory gets its lobby entry, the code UI retires, and blocking has an explicit management surface.

**Tasks**

- Replace the lobby's "Ranking — Soon" tile with a **Players** tile routing to `/players`; ranking is no longer a lobby destination, since it lives inside the directory as a tab (`apps/mobile/src/app/index.tsx:160-171`).
- Keep the Friends screen's "Find players" card as the secondary entry to the same screen.
- Replace the code card and add-by-code on `/friends` with that card, keeping the legacy code path working for shipped builds only.
- Keep `/f/[code]` and the code lookup backend for legacy links; remove the code from everything new builds render.
- Persistent unlisted card on `/friends` with Choose a name, shown while `Profile.listed` is false and hidden once it flips.
- Add a dedicated **Blocked players** screen (`/blocked`) reached from the Friends screen, listing every blocked player with an avatar, name and an Unblock action per row; the inline Blocked section on `/friends` stays as the summary. Unblocking refreshes the friends controller so the player returns to lists, search, recent players and profiles without a reload.
- Remove now-unused i18n keys from both catalogs and add the new ones; check `en.ts` still defines the full type.
- RNTL tests: the Players tile opening the directory, the Find players card opening the same screen, the friends screen without code UI, a legacy `/f/CODE` preview still resolving, the unlisted card in both states, the Blocked players screen listing and unblocking, and block/unblock from the friends lists.

**Success criteria**

- The lobby Players tile and the Friends "Find players" card both open the directory, and the lobby no longer advertises ranking as a separate destination.
- No friend code or add-by-code appears anywhere in the app.
- A shipped build's share link still opens a preview with Add friend.
- A brand-new account sees the unlisted state in both agreed places until it picks a name.
- The Blocked players screen is reachable from Friends, lists every block, and Unblock restores the player everywhere in one step.

**Risks**

- Deleting `/f/[code]` would break links already shared; keep the route and treat it as legacy.
- Removing the code card removes the only offline-visible identity; the lobby's name chip still covers that need.
- Trading the Ranking tile for Players means a new lobby tile layout on both the two-column and stacked lobby; verify both at the 900 px breakpoint and in RTL.
- Two block surfaces (the summary section and the screen) can drift; both must read the same friends snapshot.

---

## Phase 9: End-to-end and finalization

**Goal:** prove the directory, the registry, presence visibility and both stat blocks on real Nakama, and leave the docs matching the code.

**Tasks**

- Extend `apps/server/scripts/e2e.ts` with a `--directory-only` scenario: two accounts claim distinct names, a folded clash is refused, a rename that only changes casing keeps the player listed, a rename to a new fold frees the old name, prefix search finds them, the exact name is first when more matches than one page exist, an unlisted account is not found, the profile returns stats, a block hides both directions identically, unblock restores.
- Presence scenario: one account sets Nobody, the other sees `presence: "hidden"` from search and profile, friends no longer receive its status, and setting Everyone restores it.
- Stats scenario: a finished quick-match game updates both seated humans' competitive blocks and not a leaver's; a practice report moves only the practice block.
- A rate-limit check behind a flag, in the style of the existing limit checks.
- Wire protocol reference: directory constants and fold rules, the claim key format, the three RPCs and their errors, the claim, prefs and stat records, the per-query cap and the scan contingency, and the presence labels with their exact meaning.
- Architecture explanation: a "Players directory" section linking ADR-0004 and ADR-0005, covering the claim lifecycle and its release guard, block invisibility, presence visibility and its limit, enumeration posture and stats provenance.
- How-to: testing the directory with two browsers or LAN devices, and resetting local accounts so every claim is clean.
- Merge the `context/docs/` staging notes into `docs/` and delete the staging file.
- CLAUDE.md: status line, Identity (the name is now unique and public), Key Patterns (the hashed claim key and release guard, block invisibility, presence visibility, stats provenance), Project Structure (`src/directory/`, `src/stats/`, the new routes).
- Flip the ADR status lines.

**Success criteria**

- Build, test, lint and e2e pass, and existing scenarios are unchanged.
- The docs match the shipped behaviour, and a two-window manual pass in both languages confirms the end state.

**Risks**

- Account creation and claims add time to e2e; keep the new scenario behind its own flag.
- Two ADRs plus two amendments must agree with each other on block visibility, the claim key, presence visibility and stats provenance.

---

## Risks (cross-cutting)

- **Public-surface enumeration.** A searchable directory is inherently scrippable. Bounded by: authentication, a 2-character minimum, a per-query cap, page size 20, a per-user window, and no endpoint that lists everyone. Per-IP limits and monitoring are the next step, not v1.
- **What a profile reveals.** Name, presence label, aggregated counters, and the caller's own relation. No codes, session ids, emails or other players' ids.
- **Storage keys constrain the model.** Keys are ASCII-only, so the claim key is a hash and the folded name lives in a value field. Every future query must follow the value field; a query written against the key will silently match nothing for Arabic names.
- **Block invisibility depends on per-candidate checks.** A failed check fails closed, which can hide someone innocent; a truncated block list is the same failure. Both are preferable to revealing a block.
- **Exact-first is an exact read.** A hash lookup is the only way the exact match can precede the scan; losing it leaves a page sort that cannot hold across cursors.
- **Presence is only as private as Nakama allows.** Nobody works by appearing offline, which hides the player from friends too; Everyone is public to any follower. A friends-only state needs server-owned presence and is explicitly not promised. The friends list does not yet show the hidden state, so a Nobody player reads as offline there.
- **Unique names lock out popular names permanently** and make fold collisions user-visible. The rename cooldown means a collision discovered after a rename costs an hour.
- **The claim lifecycle is not transactional.** Orphan claims are possible; lazy reconciliation is the safety net and must run before declaring a name taken. The release guard (release only when the fold changes) is what keeps a cosmetic rename from unlisting a player.
- **Practice stats are unverifiable** and must stay display-only; the risk is a future product decision to rank on them.
- **Two writers per player at finish** (recent players and stats) double the storage round trips; both are best effort and must never fail the loop.
- **Wire additivity.** New RPCs, new optional fields on the profile and directory payloads, one new name error value and one new presence error value. Old builds keep working: they never call the new RPCs, and unknown error messages map to a generic error.
- **Account deletion (future)** must remove the claim, the own and prefs records and both stats records, plus the friend edges it already must remove.
- **Name freshness.** Search reads live display names while tables refresh on join/reclaim; a renamed player can appear under two names in two places until the next rejoin.

## Testing strategy

- **Protocol:** fold vectors (Latin and Arabic), claim-key vectors (ASCII and stable), query normalization boundaries, presence value parsing, the shared fixtures module, and a no-`normalize`/no-`\p{}` guard in the build.
- **Server (Vitest):** the claim lifecycle and every collision path, including a rename that only changes casing (claim kept, still listed); backfill; search gating, the scan contingency, exact-read-first across pages, stale-row skipping, caps; presence labels for Everyone, Nobody, absent and malformed prefs, and the setting round trip; block filtering in both directions with identical errors; the rate windows; competitive accumulation, guards and the leaver exclusion; practice clamping and windows; storage failures not breaking hooks or the match loop.
- **Mobile (Jest, RNTL):** the directory backend and error mapping; `listed` and `presenceVisibility` for every value; the socket reconnect on a setting change; temporary follows; the room session; the directory controller (sequence guard, paging, optimistic edges); the directory screen states including hidden availability; the tab switch; the profile relations, availability outcomes, stats and invite presence; the lobby Players tile; the friends screen without codes; the legacy `/f/CODE`; the Blocked players screen.
- **End to end:** the `--directory-only` scenario, the presence scenario, the stats and limit checks.
- **Manual:** two or three browsers at 1280 px and 390 px in `en` and `aeb`; one native device for the unlisted card before and after picking a name; one Derja name claimed and searched to prove the key charset; one account switched to Nobody and checked from a second device.

## References

- `context/ui/chkobba-users.html`, `context/ui/chkobba-users-app.js`: the agreed directory and profile direction.
- `apps/server/src/account/hooks.ts:46-66`, `:73-103`, `:151-170`: the update hooks and the default name.
- `apps/server/src/rpc/roomStore.ts:23`, `:45-65`: create-only versioned writes and catch-and-re-read.
- `apps/server/src/rpc/roomLimits.ts`: pure fixed-window records.
- `apps/server/src/social/inviteToTable.ts:37-105`, `:127-151`: RPC order, error mapping, friend checks.
- `apps/server/src/match/tableMatch.ts:287-317`: leave and finish writes.
- `apps/server/src/social/gameRoster.ts:9-58`: the per-game roster and guards.
- `packages/protocol/src/names.ts:19-28`, `:58`, `:72-78`: error codes, the allow-list, the format check.
- `packages/protocol/src/room.ts`: `RoomMember.userId`, code helpers, `ROOM_MAX_MEMBERS`.
- `packages/protocol/src/friends.ts`: friend states, limits, notification codes, the social records.
- `packages/protocol/src/index.ts:12-35`, `:52-65`: opcodes, `TablePhase`, `PlayerInfo.userId`.
- `packages/rules/src/types.ts:78-83`: scores, chkobbas, winner at game end.
- `apps/mobile/src/app/friends.tsx:25-29`: the code card and add-by-code to replace.
- `apps/mobile/src/online/friends.ts:64-85`: the backend port shape to mirror.
- `apps/mobile/src/friends/useFriendsController.ts`: optimistic overrides and load sequencing.
- `apps/mobile/src/online/socialSocket.ts:622-683`: following and availability.
- `apps/mobile/src/online/nakama.ts`: the game/social socket connect flags, where appear-offline applies.
- `apps/mobile/src/online/presence.ts`: the availability vocabulary and the absent-to-offline default.
- `apps/mobile/src/online/profile.ts:27-43`: the profile shape to extend with `listed` and `presenceVisibility`.
- `apps/mobile/src/components/room/PrivateRoom.tsx:40`: where the room code currently lives.
- `apps/mobile/src/app/index.tsx:160-171`: the lobby tiles, including the ranking tile that becomes Players.
- `docs/reference/wire-protocol.md`: "Display names", "Friends" (codes, optional ids, blocking), "Private tables" (storage records, limits).
- `docs/adr/0001-durable-guest-identity-and-display-names.md`, `0002-private-tables-room-codes-and-host-model.md`, `0003-friend-codes-social-socket-and-presence.md`.
- `context/plans/2026-10-30-friends.md`: format and altitude reference.
- `apps/server/scripts/e2e.ts:103-107`: the scenario flag style.
