# Multiplayer architecture

How online 2v2 tables work and why they are built this way. Exact values: [Wire protocol](../reference/wire-protocol.md). Running it: [Local backend](../how-to/local-backend.md).

## Server-authoritative tables

The server holds the deck and every hand. Clients send intents (`PLAY`, `CUT`, `BACK`); the server checks seat, phase, turn and legality through `@chkobba/rules`, then applies them. Each presence gets only its own `PlayerView`. Snapshots never carry `hands`, `stock`, `deck` or `rng`, and a kept cut card never appears in a public event. Tests scan full games on several seeds for leaks, and the e2e script checks live snapshots.

## Pure table core, thin Nakama adapter

| Layer | Location | Responsibility |
|---|---|---|
| Table core | `apps/server/src/table/` | Pure functions over JSON-serializable `TableState`: `createTable`, `join`/`leave`, `intent`, `tick`, `nextWakeAt`, `snapshotFor`, `label`. No `nkruntime` |
| Adapter | `apps/server/src/match/tableMatch.ts` | The `chkobba_table` match handler: maps Nakama hooks, presences and messages onto the core |
| RPC | `apps/server/src/rpc/quickMatch.ts` | Table discovery |

The core is testable offline and deterministic per seed. The adapter is tested with a fake `nk`, dispatcher and logger.

Adapter details:
- `matchJoinAttempt` claims the seat immediately so concurrent joins cannot double-book it; the reservation expires after 10 s.
- `matchJoin` kicks any older session of the same user and sends a full snapshot from seq 0.
- `matchLoop` runs `tick` until state stops changing (max 8 steps). `tick` does at most one game action per call and returns the same object when nothing is due, so the adapter can skip broadcasts.
- Change-only sends use a fingerprint of canonical JSON with sorted keys, because Nakama round-trips match state through Go maps and reorders keys. `serverTime` is excluded.
- `tickRate` is 1, so intents are applied within about 1 s.

## Why a custom `quick_match` instead of the Nakama matchmaker

The matchmaker forms a match from tickets and has no notion of a table that fills while bots wait to backfill. We want: join a half-full table instantly, start with bots after a short wait, keep seats reserved. A small RPC listing open tables by label (fullest first, else create) gives that with little code. Cost: the match index lags about 1 s. A table it returns may have just filled, so the client retries on `table_full`. A table created moments ago is not listed yet, so the RPC also records the newest table in storage (versioned write, system user) and offers it for 5 s; two players pressing together share one table instead of each creating one.

## Seats, timers, away, backfill

- Seats are `HumanSeat`, `BotSeat` or empty. A human seat is bound to `userId` and the current `sessionId`; stale sessions are ignored or rejected.
- Humans take the lowest free seat, so the first two humans are opponents (seats 0 and 1).
- Backfill: 15 s after the first waiting human sits (not table creation). A table with no humans never backfills. Server bots play at Normal level.
- Leaving while waiting frees the seat; after start the seat stays reserved and a bot plays it.
- A turn has either a `turnDeadline` (connected, non-away human) or a `nextActionAt` (bot, disconnected or away seat), never both. A rejoin or BACK never extends a running deadline.
- A timeout counts as a miss; after 2 in a row the seat is `away` and a bot plays it. Because the bot acts within about 1 s, BACK must be explicit (an "I'm back" button or the first touch on a hand card), not sent right before a move.
- The match ends 60 s after the game finishes, or after 60 s with no sessions.

## Private tables

A private table is the same `chkobba_table` handler with a room attached. Players create one, share a 6-character code (or a link), and choose when to start. Why it is built this way, including the rejected alternatives: [ADR-0002](../adr/0002-private-tables-room-codes-and-host-model.md). Exact values and wire shapes: [Wire protocol](../reference/wire-protocol.md#private-tables).

**Membership is separate from seats.** The table tracks the humans present as `members` in join order. A member is seated or standing. Joining a room and sitting down are different actions, which is what makes free seat choice, host handover and late join fall out of one model instead of three special cases. `SIT` does all three: it takes an empty seat while waiting, switches seats in the waiting room, and lets a standing member take over a bot seat mid-game. At most `ROOM_MAX_MEMBERS` (8) are present.

**The host is the earliest present member.** Only the host may press `START`; nobody else can make the table deal. A private table never backfills bots while it waits and never auto-starts. When the host leaves, the crown moves to the next present member — even mid-game, a deliberate exception to "nothing changes during a game", because the host must always be a member. A host who drops and rejoins loses the crown, because rejoining puts them at the end of the join order; accepted for v1.

**Standing members get no view.** Someone who arrives mid-game sees the seats, the team scores and a Take over button, but the server never builds them a `PlayerView`: their snapshot is `seat: -1` with `view: null`. That keeps hidden information out of reach by construction rather than by filtering a view.

**Returning to the room.** When a game finishes, the final scores stay up for `ROOM_RESET_MS`, then the table resets to `waiting` with the same code, members and seats. Seated humans keep their seats; absent members are dropped and their seats freed. The next game is a fresh deal, not a rematch on the old state.

**Take over is a reconnect.** A seated member who disconnects stays a member and keeps the reserved seat while a bot covers it; reconnecting hands the seat back. Taking over a bot seat follows the same path, so if that seat is to act the pending bot move is cancelled and the person gets a fresh turn timer — otherwise their first play would race the bot's. A standing member who reconnects stays standing: only newcomers auto-sit, so a reload mid-game does not silently put someone in a seat. Emotes come from a seat, so standing members cannot send them.

**Codes live in storage, never in the label.** Any client can list authoritative matches and read their labels, so a code in the label would hand out every live room. The label only carries `private: true` and `open: false`; the mapping is a system-owned `private_table/<code>` record with read and write permission 0. A version-checked write keeps two simultaneous creates from claiming one code, and the create reserves a placeholder before creating the match so a crash can never map a code to a table it does not own.

**Cleanup and lazy liveness.** A closing match deletes its own mapping, but only while the record still points at that match, so a code that was reused is not clobbered. A Nakama restart kills matches without running that cleanup, so `join_by_code` also treats a record whose match is gone (or whose label is no longer private) as stale and deletes it on the next lookup. Nothing sweeps storage in the background.

**The join gate.** Resolving a code is not the only way in: a match id can be joined directly, and ids appear in match listings. So the table admits a newcomer only if the join metadata carries the code. Members reclaiming their seat by `userId` skip the check. A missing or wrong code is refused as `room_not_found`, exactly like a dead code, so a listed id confirms nothing. This is hardening on top of ADR-0002's original text; the ADR records it as an amendment.

**Abuse limits.** Failed lookups and creates are limited per user in a server-owned `private_table/limits` record: 10 failed lookups and 5 creates per 10 minutes. Guests are free to mint, so a script can dodge a per-user limit; the defence that matters is the code space (32^6, about 1e9) against the number of live tables. A per-IP limit through `ctx.clientIp` is the next step if abuse shows up.

## Reconnect and clock offset

- The client reconnects with backoff and rejoins the same `matchId`. It gets the same seat and the full log (log merged by `seq`). While the socket is gone the seat shows `connected: false` and a bot plays.
- Server deadlines are epoch ms on the server clock. The client estimates offset as the largest `serverTime - receipt time` over the last 16 snapshots (the largest value approximates the least network delay) and converts deadlines to local time.

## Shared `@chkobba/protocol`

Server and mobile import the same types and opcode constants from `packages/protocol`, so the wire contract cannot drift. Apps still never import from each other. The mobile side treats incoming data as untrusted (`decodeSnapshot`, `decodeError` return null on bad data). The UI depends only on `GameClient`; `NakamaGameClient` implements it beside `LocalGameClient`.

## Guest identity

The guest account is keyed by a device id that must outlive a reinstall, so each platform stores it durably: the iOS Keychain, a hash of the Android `ANDROID_ID` (stable across reinstall, never sent raw), and `localStorage` on web (unchanged). Formats and keys: `docs/reference/wire-protocol.md`. Rationale: [ADR 0001](../adr/0001-durable-guest-identity-and-display-names.md).

Earlier builds kept a random id in AsyncStorage. `GuestAuth` migrates it once, guarded by `chkobba.online.deviceIdMigrated`:

- **iOS**: a valid legacy id is copied into an empty Keychain. If both exist and differ, the Keychain wins and the cached session is dropped (it belongs to the legacy account).
- **Android**: sign in with the legacy id (`create=false`), `linkDevice` the hashed id to that account, then use the hashed id.
  - 409 (hashed id already belongs to another account): keep the legacy account, pin the legacy id as the fallback id, no retry.
  - 404 (legacy account gone): use the hashed id and drop the cached session.
  - Any other error: use the legacy id now and retry next launch (flag not set).
- **Web**: unchanged.

The migration runs before the cached session is restored, so long-lived sessions migrate too. The legacy AsyncStorage id stays for one release as a rollback path.

## Display names

Players pick a display name; it is what peers see at the table. Rules, error codes and the storage record: [Wire protocol](../reference/wire-protocol.md#display-names). Rationale: [ADR 0001](../adr/0001-durable-guest-identity-and-display-names.md).

- **One enforcement point.** A single `registerBeforeUpdateAccount` hook validates every name change, so no client (current, old, or hand-made) can bypass the rules. The client runs the same format check (`@chkobba/protocol`) only to avoid a round trip; profanity and the cooldown stay server-only, and the lists never ship to the client. The same hook locks `username`, `avatarUrl` and `location`.
- **Cooldown in a storage record, not account metadata.** Account metadata is readable by other users through `getUsers`, which would leak when someone last renamed; a storage object with owner-only read and write permission 0 is private and only the server can write it. `afterUpdateAccount` writes it only after Nakama accepted the update, so a rejected name never starts a cooldown. The first pick is free and leaves `changedAt` null, which also marks "name picked". Two simultaneous renames may both pass; accepted, to avoid version-check retries.
- **New accounts get `PlayerNNNN`** (`afterAuthenticateDevice`), so a table never shows `Guest-XXXX` usernames. It writes no record, so the first-visit gate still appears.
- **Names refresh only on join and reclaim.** The adapter reads the display name once per join attempt and the core's reclaim path replaces the seat name. Mid-game renames are not pushed: it avoids a per-tick lookup, and a renamed reconnect reaches peers through the snapshot fingerprint.
- **Client flow.** `/finding` gates the search: it loads the profile and, if no name was picked, shows the name form (Continue always calls the server, even when the name is unchanged) before `QuickMatch` mounts, so leaving mid-step never searches. Settings has a rename form (disabled while cooling down; it reads only the cached profile on open). Both go through shared lazy singletons in `apps/mobile/src/online/services.ts` (one Nakama client, one `GuestAuth`), so they share a session.
- **`/finding` gate states.** `loading`, then `failed` (retry), `name` (form, then search) or `ready` (the private `QuickMatch`, the old flow). A search starts only when `QuickMatch` mounts.
- **Name form (`NameForm`).** Presentational, no network. Mode `continue` is enabled even when unchanged (the first pick must reach the server); mode `save` is disabled when unchanged or cooling down. It submits the normalized name. A format error shows after blur or submit; server error or "saved" feedback hides once the sent name is edited. The cooldown line shows only while `renameAvailableAt > now()` (15 s tick). Input direction is `auto` (web) or natural (native). Errors use the `warn*` tokens. Messages live in `name.*` i18n keys; `name.errors` is typed `Record<NameErrorCode | 'network', string>`, so a new protocol code fails typecheck until translated. The 3 and 16 limits in the hint text are literals: edit them by hand if the protocol limits change.

## Friends

Friends v1 adds friend codes, a friend list, presence, table invites and recent players. Why it is built this way: [ADR-0003](../adr/0003-friend-codes-social-socket-and-presence.md). Wire shapes, error codes, limits and the `social` storage records: [Wire protocol](../reference/wire-protocol.md).

### Friend codes and the AddFriends hook

The friend code is the account's Nakama `username`, generated by the server in the `beforeAuthenticateDevice` hook (`apps/server/src/account/hooks.ts`). Nakama only uses that username when it creates the account, so a code is fixed once and never changes; a client-sent username is overwritten on create. Codes are 8 characters from the room-code alphabet, stored uppercase and looked up exactly. The display name is still what peers see; the code is only the add-by handle.

Requests pass through `beforeAddFriends` (`apps/server/src/social/friendHooks.ts`), the single enforcement point for friend limits:

- At most `FRIEND_LIMITS.MAX_TARGETS_PER_REQUEST` (10) ids and usernames per call.
- Usernames are normalized (`normalizeFriendCode`: uppercase, whitespace and dashes removed) and resolved with `nk.usersGetUsername`. Malformed and unknown codes are dropped, as is the caller's own id.
- `friendRules.ts` classifies the rest against the caller's edges: no edge is a new outgoing request, an incoming request is an accept, and friends, already-sent requests and blocked users are no-ops.
- Limits: 50 outgoing pending (`MAX_OUTGOING_PENDING`), 200 friends (`MAX_FRIENDS`, checked on both sides for an accept). A failure throws a `friend_*` code with a numeric gRPC status.

Blocked users are left to Nakama: a blocked target's request is a silent no-op (a re-request returns 200 and is dropped, verified on 3.40), so the hook does not filter them. The hook always returns a request: when at least one target is valid it rewrites `ids` and `usernames`; when nothing valid remains (only the caller, unknown or malformed codes) it returns the data unchanged, so Nakama gives its own 400 instead of a silent success.

### Recent players

The adapter tracks who sat in the current game in `apps/server/src/social/gameRoster.ts`. The roster is seeded when a game starts, appends humans who take a seat over mid-game, and resets on a new game key (the table seed for a public game, `${seed}:${gameNo}` for a private one). `recentWritten` makes each write happen once per player per game.

The writes live in `tableMatch.ts`, not in the pure core:

- `recordLeaver` in `matchLeave` records a seated human who leaves while the game is `playing` or `between`, at the moment of the leave.
- `recordFinished` in `matchLoop` records every roster member not yet written when the phase reaches `finished`.

Each write is a read-modify-write of the player's `social/recent_players` record (owner read, server write) in `recentStore.ts`. It is best effort: a storage failure is logged and swallowed, so it can never fail a match. The record holds the other humans, never bots or the owner, newest first.

Known gap: a player only gets records for games they were present for. Someone who leaves before the game finishes is recorded at leave time with the roster as of then, so their record does not include anyone who sat down later. A player who was never in the game gets nothing.

### The social socket

Presence and notifications need a socket in the lobby, but the game socket exists only while a table is open and connects with `createStatus: false` (`nakama.ts`). Friends therefore uses a second, app-level socket (`apps/mobile/src/online/socialSocket.ts`) that connects with status on. Keeping the game socket's status off means the two sockets never fight over it. Deployment dependency: Nakama must not enable `single_socket`, or the game socket would kick the social one.

Connection rules:

- `start()` at launch connects only when a stored session exists. Opening the app for offline play never creates an account.
- `ensureConnected()` on the first Friends or online use may sign in or create the guest.
- The socket disconnects when the app goes to the background and reconnects on return. After a drop it retries with exponential backoff from 1 s to 30 s (equal jitter). `stop()` never reconnects.
- Mutual friends are followed in chunks of 50. `socket.max_message_size_bytes` is 4096 and one oversized call closes the whole socket, so 50 ids stay well below the limit (verified in Task 4.1).
- Presence is tracked by session id, not by user: a status change arrives as a leave and a join of the same session, and leaves are applied before joins. With several sessions, the busiest activity wins.

### Presence privacy

`PresenceStatus` is `{ v: 1, a: 'lobby' | 'room' | 'playing' }` (`packages/protocol`). It carries availability only, never a room code or a match id: anyone can follow any user id, so a code in a status would let strangers walk into private tables. Status is also not what opens a table; a friend joins only through an invite.

### Invites

`invite_to_table` is a member's way to bring a friend into a private room. `apps/server/src/social/inviteToTable.ts` runs the checks in order, so a rejection reveals as little as possible:

1. The payload is `{ userId, code }`; a malformed id or code is `invite_bad_request`.
2. The target must be a mutual friend (`invite_not_friend`).
3. The code must resolve to a live private match (`invite_room_not_found`).
4. The caller must be a present member of that room (`invite_not_member`), checked with `nk.matchSignal` and `{ type: 'is_member', userId }`. The table's `matchSignal` handler answers `'yes'` or `'no'`; unknown or malformed signals answer `'no'`.
5. The per-(friend, code) dedupe in the sender's `social/invite_limits` record answers `{ sent: false }` without consuming the window.
6. The per-sender window (20 invites per 10 minutes) is checked; a repeat neither reads nor counts toward it.
7. One persistent `TABLE_INVITE` notification is sent with the room code and sender name.

`matchSignal` waits for the match loop, so an invite can take up to about 1 s. The client shows an invite older than `INVITE_TTL_MS` (10 minutes) as expired. The server never deletes the notification, and joining is always the final liveness check: a dead table answers `room_not_found` from the room screen, whatever the invite said.

On the client, the inviter's friend picker belongs to the waiting room (`PrivateSession` renders only `GameTable`), so a player who is already in a hand must use another device to invite. The invitee mid-hand sees the in-game badge instead of the lobby banner, and the banner on the lobby once the hand ends. An invite whose table has closed renders as a closed notice with **Dismiss** only and no **Join**.

### Client structure

- `apps/mobile/src/online/friends.ts` defines the `FriendsBackend` port and its nakama-js implementation; the UI goes through it, next to `ProfileBackend`.
- `socialSocket.ts` owns the socket, the friend follows, presence and notifications, and exposes `SocialState`.
- `SocialProvider.tsx` at the app root starts the socket and provides `useSocial()`. It shares the one client and `GuestAuth` with the rest of the app through `services.ts`, so games, profile and friends use one session.
- `useSocialActivity` maps the current screen to presence: `room` in a private room, `playing` once a hand is in progress, and back to `lobby` on unmount. It also holds invite banners and toasts back while a hand is being played.

## Players directory

The directory makes the display name a public handle: players can search by prefix, open a profile, and read two kinds of stats. The runtime constraint shapes the route — no SQL — so search is a Nakama storage index over the claim's folded name. Why it is shaped this way: [ADR-0004](../adr/0004-unique-display-names-players-directory-and-presence-visibility.md) and [ADR-0005](../adr/0005-stats-provenance.md). Constants, record shapes and the RPCs: [Wire protocol](../reference/wire-protocol.md#players-directory).

### Unique names and the claim lifecycle

Claiming a name is what lists an account. An account that never picked one still carries the generated `PlayerNNNN`, holds no claim, and cannot be found; the first pick creates the claim.

- **Acquire.** `beforeUpdateAccount` remains the single enforcement point for name rules. After format, profanity and cooldown pass, it takes `n<sha256hex(fold)>` with a create-only write, so two accounts cannot hold spellings that fold equally. A rejection is re-read, never inspected for an error code. A live foreign holder is `name_taken` — the spelling is valid, the name is not free — while a stale or malformed record is cleared and the write retried once. The claim is taken before the account update is applied, so a refused reservation leaves the request untouched.
- **Stale is the only licence to reclaim.** A claim is stale when its owner's live display name folds differently, or the owner account is gone. A live claim always reads as taken; an unreadable record is reclaimable rather than a permanent lock.
- **Release guard.** `afterUpdateAccount` deletes the old claim only when the fold genuinely changed, and only while the row still names that user. A casing- or accent-only rename folds to the same key, so releasing it would delete the claim the update just secured and silently unlist the player. The guard is the difference between "rename works" and "rename silently unlists".
- **The spelling is fixed at claim time.** The claim stores the name as written when it was taken. A fold-equal rename changes the account's live name but not the directory's: search and profile keep the old spelling until a genuinely different name is claimed.
- **Best effort around the edges.** A named account from before claims existed is backfilled on its next sign-in, and an own record whose claim row vanished repairs itself the same way; a clash leaves the account unlisted and sign-in still succeeds. The before and after hooks are not one transaction, so a crash can orphan a claim; reconciliation — not prevention — bounds that.
- **Account deletion leaves the claim.** The row is written as the system user, not as the account, and the module registers no account-deletion hook, so nothing here removes it. It is not a permanent lock: with the owner gone the claim reads stale, search drops it, and the next claimant of that exact folded name may take it. Until then it stays in the index.

The fold is one explicit map shared by writer and reader — case, Latin-1 accents, Arabic letter variants, Arabic-Indic digits and space runs. It is not literally the display-name allow-list: it also folds U+0671 (alef wasla), which no claimable name can contain, so the difference is visible only in queries. ADR-0004's 2026-11-01 amendment records this and the other places the decision text is simpler than the code.

### Block invisibility

A block removes the pair from each other's directory view: the blocked player's row is dropped from search, and their profile answers `directory_not_found`, byte-identical to an unknown id. There is no "blocked" answer, so neither side can confirm the block or tell it from a deleted account or a typo.

Enforcement is one shared predicate, `isCandidateVisible` in `apps/server/src/directory/blocks.ts`, called by both `searchPlayers.ts` and `getPlayerProfile.ts`, so a search row and a profile cannot disagree about the same pair. Nakama keeps only the blocker's edge and has no "who blocked me" index, so the check reads both directions: the caller's own blocked list once per request, and the candidate's own list once per candidate.

The reverse read fails closed. A thrown call, a malformed page, or a page with a cursor — the 1000-edge cap was hit and the caller may sit on the unread remainder — all count as blocked. An ambiguous read that counted as "not blocked" would leak the block by omission. The cost is a rare innocent player hidden for one request, which is the accepted trade at page size 20.

That is the whole of what the directory enforces. Blocking itself is Nakama's friend graph; these hooks only choose the directory's two answers, and do not make the pair invisible to each other anywhere else.

### Presence visibility, and what it does not hide

Presence has two choices, saved in `profile/prefs` and written only by `set_presence_visibility` (owner read, server write). Everyone is the default, including for an account that never saved a choice or whose record is malformed.

- **Everyone is public to any follower.** That is the product's definition, not an accident. The status is published to any follower, friends and strangers alike, and the directory screen temporarily follows up to 30 on-screen results so availability can arrive. Choosing Everyone means being visible to people you have not met.
- **Nobody is enforced at connection time.** The social socket connects with the status off, so Nakama publishes no presence for that session to anyone, friends included. There is no friends-only state in v1, and the copy must not promise one. Changing the choice reconnects.
- **`hidden` is not anonymity.** It means "publishes nothing", never "offline", and the directory and profile render it as a neutral no-availability state. A hidden player still appears in search, still has a readable profile, and still exposes their userId, claimed name and both stat blocks. What is withheld is availability only.
- **The label says they opted out.** Exposing `hidden` is intended: it is a privacy choice, and the label never claims otherwise.
- **The friends list is not yet honest.** For v1 it shows a Nobody player as offline because no status arrives and the list has no hidden slot. The directory and profile are honest; that gap is the concrete case for a server-owned presence record later.

### Enumeration posture

There is no browse endpoint. Search needs a prefix of 2 to 16 folded characters, taken from at most 64 raw UTF-16 code units before folding; an empty, short or over-long query is `directory_bad_query`, not an empty page. The client shows the caller's own recent players on an empty query, but that is not a listing of accounts.

- **Cap.** Twenty rows per page and sixty matches per query across all pages. `capped` means the cap was reached and the query may have more; it is not proof that more exist. The server does at most six index fetches per call before returning a page, so the work per request is bounded; an unfinished traversal carries a residual cursor to resume from.
- **Rate limit.** One hundred searches and two hundred profile views per caller per ten minutes, counted before the lookup, so a fruitless attempt still costs a slot.
- **No fallback.** The storage index is the only search route. Index exhaustion returns the last page; an index or storage fault is `directory_storage_error`, never an empty result. The `storageList` scan is a documented contingency and is not implemented.
- **Honest attack picture.** Guests are free, so a per-caller window is dodgeable with throwaway accounts. Two characters, a 20-row page and a 60-result cap make a full walk large but not impossible; a per-IP window is stated later hardening, not a v1 guarantee. What an attacker cannot do is list everyone in one call, skip the cap, confirm a block, or find an unlisted account.
- **Index capacity is a stated risk.** The index is registered with 100000 entries and the code defines no behaviour past it; that is recorded, not tested.

### Stats provenance

A profile shows two blocks with separate provenance, and no total.

- **Competitive is server-observed.** At the finish transition the match adapter scans the seats, takes the team from seat parity and the result from the winner, and writes one result for each seated human. A leaver counts: their seat stays human and a bot plays it out, so the game's actual outcome is recorded for them. Bots and empty seats are skipped, and `statsWritten` limits each player to one attempt per game. The chkobba figure is the team's sweeps, so the label reads "Chkobba sweeps", never "your sweeps".
- **Practice is device-reported.** An offline bot game runs entirely on the device, so `report_practice_game` takes the device's word for one finished game, clamps chkobbas to 21 and windows the caller to 60 reports an hour. It is display-only.
- **Both are server-owned.** The records are read 0 / write 0: no client writes or reads its counters through storage, and an absent or malformed record reads as an all-zero block.

Why they are never summed: a practice number is an assertion, a competitive number an observation. A combined total would present device-claimed games as if the server had verified them — two hundred claimed wins would outrank twenty verified ones — and it is exactly the shape a ranking would later consume. The split lives in the type, where `PlayerStats` has two named blocks and no total, so a combined figure would be a visible API change rather than a quiet UI tweak. Ranking is not shipped; when it lands it may read the competitive block only.

Why practice exists at all: offline play is the game's first mode, and players expect it to count somewhere. A profile that ignored it would read as broken; the trust cost is contained by labelling it device-reported and keeping it off every ranking path. The competitive write is best effort in the other direction: a crash or storage fault between finish and write loses one game and is not retried, because a 1 Hz retry loop is the worse failure.

## Known limitations

- Guest identity is tied to the device id. It survives reinstall on iOS and Android, not on web (clearing site data loses it) or after an Android factory reset (until social login, milestone 3).
- Tokens are in AsyncStorage; move to `expo-secure-store` before release.
- Server bots are Normal only.
- Up to about 1 s turn latency from `tickRate` 1.
- The log is never trimmed, so a rejoin resends the whole game log.
- `sameCapture` in `packages/rules/src/engine.ts` accepts duplicate capture ids. The server rejects them as `bad_payload`; the engine needs its own ticket.
- The Docker image ships `local.yml` with Nakama's default server and http keys; a deployment needs its own config.
