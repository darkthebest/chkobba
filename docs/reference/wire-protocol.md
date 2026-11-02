# Wire protocol

Source of truth: `packages/protocol/src/index.ts` (`@chkobba/protocol`, shared by server and mobile). Types, `const` objects (no `enum`) and pure helpers only (e.g. the display-name format check in `names.ts`); helpers must stay dependency-free and goja-safe (ES2017, no `\p{}`/`u`-flag regex). Changing it breaks shipped mobile builds, so changes stay additive. Design background: [Multiplayer architecture](../explanation/multiplayer-architecture.md).

## Opcodes

| Name | Value | Direction | Payload |
|---|---|---|---|
| `PLAY` | 1 | client to server | `PlayIntent` |
| `CUT` | 2 | client to server | `CutIntent` |
| `BACK` | 3 | client to server | none (empty body); clears `away` |
| `EMOTE` | 4 | client to server | `EmoteIntent` |
| `SIT` | 5 | client to server | `SitIntent` (private tables only; `not_private` on a public one) |
| `START` | 6 | client to server | none (empty body); host only (`not_host`) |
| `SNAPSHOT` | 100 | server to one presence | `Snapshot` |
| `ERROR` | 101 | server to the sender only | `ErrorPayload` |
| `EMOTE_SHOWN` | 102 | server to every seated session, sender included | `EmoteShown` |

Payloads are JSON. Messages over 2048 bytes (`MAX_MESSAGE_BYTES`) or with bad JSON get `ERROR bad_payload`.

## Intents

| Type | Fields |
|---|---|
| `PlayIntent` | `cardId`, `capture` (card ids, at most 40; engine `PlayMove` without `seat`) |
| `CutIntent` | `keep: boolean` (keep the cut card, or throw it on the table) |
| `SitIntent` | `seat: 0-3` — take an empty seat in the waiting room (switching from the current one), or take over a bot seat during a game |

Server validation order: seat, opcode, phase, turn, payload, engine legality. A rejected intent leaves state untouched. Duplicate capture ids are rejected as `bad_payload`.

`SIT` and `START` are private-table intents and never reach the engine. `SIT` answers `not_private` on a public table, `not_seated` when the sender is not a member, `seat_taken` when the target seat is occupied (or is not a bot seat during a game), and `already_seated` when a seated member asks for the seat they already hold. `START` needs the host's userId; anyone else gets `not_host`, and a start while a game is already running is ignored.

## Snapshot

Sent per presence, only when that presence's fingerprint changed. The fingerprint is canonical JSON (sorted keys) and excludes `serverTime`.

| Field | Type | Notes |
|---|---|---|
| `seat` | number | Recipient's seat index; `-1` for a standing member of a private table (who then gets `view: null`) |
| `phase` | `waiting \| playing \| between \| finished` | Table lifecycle (wider than the engine phase) |
| `view` | `PlayerView \| null` | Recipient's own view; null until the game starts |
| `players` | `(PlayerInfo \| null)[]` | By seat; null = empty seat |
| `log` | `{ seq, event }[]` | Delta: entries with `seq` above what the presence has; `seq` starts at 1 |
| `turnDeadline` | epoch ms or null | Current human turn timeout; null when no human timer runs |
| `backfillAt` | epoch ms or null | When bots fill empty seats; null with no human seated and after start |
| `nextRoundAt` | epoch ms or null | Only in `between` |
| `serverTime` | epoch ms | Server clock at send; used for client clock offset. Not a heartbeat |
| `room` | `RoomInfo` | Private tables only; absent on a public table |

`RoomInfo`: `code` (never mirrored in the UI), `members` in join order (`RoomMember { name, userId?, seat: 0-3 \| null, isHost }`; members are always humans and `userId` is the only id on the wire — session ids never are), `you` (the recipient's index into `members`), `scores: [number, number] \| null` (team scores while a game runs, for standing members who get no `view`), `resetAt: epoch ms \| null` (when a finished private table returns to its room). A standing member's snapshot has `view: null` and no hand, so nothing hidden can reach them. Old builds accept only seats 0-3 and drop a `seat: -1` snapshot rather than misread it; they cannot reach a private table in the first place.

`PlayerInfo`: `name` (the player's display name, see [Display names](#display-names)), `isBot`, `away` (missed turns in a row; a bot plays until they act), `connected` (false while the socket is gone), `userId` (optional; human seats only, absent for bots and in old payloads; see [Friends](#friends)).

All engine events in `log` are public. A kept cut card never appears in an event. Snapshots never contain `hands`, `stock`, `deck` or `rng`.

## Emotes

Source: `packages/protocol/src/emotes.ts`. A fixed set, no free text; only ids travel, and each client shows them in its own language.

| Item | Value |
|---|---|
| `EMOTE_IDS` | `thumbs`, `laugh`, `facepalm`, `fire`, `wow`, `pray` (emoji); `yalla`, `sahha`, `mabrouk`, `bravo`, `khsara`, `chwaya` (phrases). Append only: removing or renaming an id breaks shipped builds |
| `EmoteIntent` | `{ id }` |
| `EmoteShown` | `{ seat, id }`. Not part of the snapshot, so it never changes the fingerprint |
| `EMOTE_COOLDOWN_MS` | 3 s per seat |

Server handling (`table/emote.ts`, routed by the adapter before `intent`): a sender without a current seat gets `ERROR not_seated`; an unknown id or a malformed payload gets `ERROR bad_payload`; an emote inside the seat's cooldown is dropped silently; otherwise it is relayed. Emotes work in every table phase and never touch `TableState`. The adapter keeps each seat's last send time in `TableMatchState.emoteAt`. Clients ignore the echo of their own seat (they already showed it). Server bots don't emote.

## Error codes

`ErrorPayload { code }`.

| Code | Meaning |
|---|---|
| `bad_opcode` | Unknown opcode |
| `bad_payload` | Oversized, bad JSON, or malformed or duplicate ids |
| `not_seated` | Sender has no seat or a stale session |
| `table_full` | Join rejected: no free seat, or game already started and sender is a stranger |
| `wrong_phase` | Intent not valid in the current phase |
| `not_your_turn` | Not the sender's turn |
| `illegal_move` | Engine rejected the move |
| `not_host` | `START` from anyone but the host |
| `seat_taken` | `SIT` on an occupied seat, or on a non-bot seat during a game |
| `already_seated` | `SIT` from a member who already holds a seat |
| `not_private` | `SIT` or `START` on a public table |
| `room_full` | Join rejected: `ROOM_MAX_MEMBERS` already present |

## Display names

Source: `packages/protocol/src/names.ts` (format, shared by client and server), `apps/server/src/account/` (profanity, cooldown, hooks). Why it works this way: [Multiplayer architecture](../explanation/multiplayer-architecture.md#display-names).

### Rules and constants

| Constant | Value |
|---|---|
| `DISPLAY_NAME_MIN_LENGTH` | 3 |
| `DISPLAY_NAME_MAX_LENGTH` | 16 |
| `RENAME_COOLDOWN_MS` | 1 h (first pick is free) |
| `PROFILE_COLLECTION` / `PROFILE_NAME_KEY` | `profile` / `name` |

- `normalizeDisplayName`: `trim()`, then runs of ASCII spaces collapse to one.
- `checkDisplayNameFormat` checks characters before length (an emoji gives `name_bad_chars`, not `name_too_short`). Empty or all-space input gives `name_too_short`.
- Allowed: `A-Za-z0-9`, Latin-1 letters `U+00C0-U+00FF` except `×` `÷`, Arabic `U+0621-U+063A` and `U+0641-U+064A`, `پ ڤ ڨ`, Arabic-Indic digits `U+0660-U+0669`, single spaces. Eastern Arabic-Indic digits (`U+06F0-U+06F9`), tatweel, harakat, zero-width and bidi controls are rejected.
- Server-only on top of the format check: profanity and reserved words (`checkName`) and the cooldown. Client and server share `NAME_FORMAT_VECTORS` (`@chkobba/protocol/testing`, never bundled into the module).

### Error codes (`NAME_ERROR_CODES`)

Sent as the `message` of a rejected `PUT /v2/account` (verified on Nakama 3.40). nakama-js throws the fetch `Response`: read `status` and `await error.json()`, branch on `message`.

| Case | `message` | HTTP | Body |
|---|---|---|---|
| Under 3 characters, or empty | `name_too_short` | 400 | `{"code":3,"message":"name_too_short"}` |
| Over 16 characters | `name_too_long` | 400 | `{"code":3,"message":"name_too_long"}` |
| Character outside the allow-list | `name_bad_chars` | 400 | `{"code":3,"message":"name_bad_chars"}` |
| Profane or reserved word | `name_not_allowed` | 400 | `{"code":3,"message":"name_not_allowed"}` |
| Rename within the hour | `name_rate_limited` | 429 | `{"code":8,"message":"name_rate_limited"}` |
| `username` sent | `username_locked` | 400 | `{"code":3,"message":"username_locked"}` |
| `avatar_url` or `location` sent | `field_locked` | 400 | `{"code":3,"message":"field_locked"}` |
| `lang_tag` only, or a valid name | none | 200 | `{}` |

- `name_too_long` shares the `name_too_short` path (unit-tested, not live-probed).
- A client write to `profile/name` is refused: 400 `{"code":3,"message":"Storage write rejected - permission denied."}`.

### `profile/name` record

`NameRecord { pickedAt: number; changedAt: number | null }` in collection `profile`, key `name`, owned by the user. Permissions: owner read (1), write 0 (server only).

| State | Record | Cooldown |
|---|---|---|
| Never picked | none | none |
| First pick | `{ pickedAt: now, changedAt: null }` | none (first pick is free) |
| Rename | `{ pickedAt, changedAt: now }` | allowed once `now >= changedAt + RENAME_COOLDOWN_MS`, else `name_rate_limited` |

`pickedAt` present means "name picked" (clients use it to skip the first-visit gate). Renaming to the same name still starts the cooldown. A malformed record is logged and treated as absent.

### Account hooks

Registered in `apps/server/src/main.ts`.

| Hook | Behaviour |
|---|---|
| `beforeUpdateAccount` | Rejects locked fields. With `displayName`: `checkName`, read `profile/name`, check the cooldown, store the normalized name. A storage read failure refuses the update. Must return `data` (null makes Nakama answer 404) |
| `afterUpdateAccount` | Only when the request had `displayName`: writes the `NameRecord` per the table above. Failures are logged, not thrown |
| `afterAuthenticateDevice` | On a newly created account, sets `displayName` to `PlayerNNNN` (`Player` + 4 digits). No `NameRecord`, so the player is still asked to pick |

Locked fields: `username` (`username_locked`), `avatarUrl` and `location` (`field_locked`). `langTag` and `timezone` pass. Only `undefined`/`null` count as absent; `""` is a change and is judged. The hooks use numeric gRPC codes (3, 8, 16) because `nkruntime.Codes` cannot be inlined.

### Names at the table

- `PlayerInfo.name` is the account display name. `tableMatch.ts` reads it with `nk.usersGetId` once per join attempt; fallback display name, then username, then `Player`. A failed lookup never rejects the join.
- `cleanName` (`table/seats.ts`) trims and caps it at `MAX_NAME_LENGTH` (24).
- Names refresh on join and on reclaim of a seat, not mid-game: a rename shows to peers after the player reconnects.

### Client cache

The mobile profile service caches the last `Profile` as JSON under `chkobba.online.profile` (AsyncStorage), on every successful read or write. Client error mapping: response body `message` in `NAME_ERROR_CODES`, anything else is `network` (HTTP status ignored).

## Friends

Source: `packages/protocol/src/friends.ts`; server side `apps/server/src/social/` and `apps/server/src/account/friendCode.ts`. Design background: [ADR-0003](../adr/0003-friend-codes-social-socket-and-presence.md).

### Friend codes and links

The account's Nakama `username` **is** the friend code. The server sets it on account creation; the player never picks or changes it.

| Constant | Value |
|---|---|
| `FRIEND_CODE_ALPHABET` | `ROOM_CODE_ALPHABET` — 32 symbols, no `I`/`O`/`0`/`1` |
| `FRIEND_CODE_LENGTH` | 8 (32^8 ≈ 1.1e12 codes) |
| `FRIEND_LINK_PATH` | `/f/` — share link `${EXPO_PUBLIC_WEB_BASE_URL}/f/<CODE>` |

- `friendCodeFromBytes` builds a code from `FRIEND_CODE_LENGTH` random bytes (`byte & 31` maps every byte onto the alphabet with no bias); fewer than 8 bytes throws `RangeError`. The server feeds it `nk.secureRandomBytes` through the existing `byteSource`, then screens candidates against the profanity list and `nk.usersGetUsername`.
- `normalizeFriendCode` uppercases and strips all whitespace and dashes; `isFriendCode` then checks length and alphabet. Codes are stored uppercase, and every lookup (client and server) normalizes first, so `abcd-2345` and `ABCD 2345` both resolve.
- `formatFriendCode` renders the display form `XXXX-XXXX`; anything that is not a valid code is returned unchanged. The share link and the wire use the normalized 8-character code, without the dash.
- Address a request by code (Nakama `addFriends?usernames=` is exact-match) or by user id. Old accounts keep their `Guest-XXXX` username and have no code; `friendCodeOf` (`apps/mobile/src/online/profile.ts`) returns null for them.

### Optional `userId` fields

| Field | Type | Notes |
|---|---|---|
| `PlayerInfo.userId` | `string` (optional) | Human seats only. A human seat keeps its `userId` while the player is disconnected (a bot plays for them, but `isBot` stays false). Bots have no key at all. |
| `RoomMember.userId` | `string` (optional) | Every room member is a human. Absent from old payloads. |

Both are additive: old decoders drop a field they do not know, so shipped builds keep working. A user id is not secret (it is already a `getUsers` and follow target); it enables "Add friend" from a table seat or a standing member.

### Notification codes

`NOTIFICATION_CODES`: Nakama's own codes are negative, ours positive.

| Constant | Value | Meaning |
|---|---|---|
| `FRIEND_REQUEST` | `-2` | Nakama: someone sent you a friend request |
| `FRIEND_ACCEPT` | `-3` | Nakama: someone accepted your request |
| `TABLE_INVITE` | `1` | Ours: a friend invites you to a private table |

`invite_to_table` sends the `TABLE_INVITE` notification with `nk.notificationSend`:

- subject `table_invite`, persistent (not deleted by the server);
- sender = the inviter's user id;
- `content` = `TableInviteContent { v: 1, code, fromName }`, where `code` is the room code and `fromName` is the inviter's display name at send time (fallback username, then `Player`).

The content may arrive as an object (nakama-js parses it) or as a JSON string; a malformed one is ignored. Clients keep an invite until the recipient joins or dismisses it, and show it as expired once it is older than `INVITE_TTL_MS`.

### `PresenceStatus`

The socket status string is `JSON.stringify(PresenceStatus)`: `{ v: 1, a: 'lobby' | 'room' | 'playing' }` (`PRESENCE_ACTIVITIES`). The separate app-level social socket is created with `appearOnline: true`; the per-game socket stays `createStatus: false`, so the two never fight over status (Nakama must not enable `single_socket`).

The status is public: anyone can follow any user id and read it. It therefore carries availability only — **never a room code or a match id**. Joining a friend goes through an invite, not through status. A client reads an absent presence as offline and an unknown, missing or malformed status as online (still connected).

### `invite_to_table` RPC

- Request: `InviteToTableRequest { userId: string, code: string }`. The code is normalized (uppercase; whitespace and dashes stripped) and validated, so a lowercase or dashed code is accepted. A malformed body, id or code is `invite_bad_request`.
- Response: `InviteToTableResponse { sent: boolean }`. `sent: false` (HTTP 200) means an invite to the same friend for the same room is still pending within `INVITE_TTL_MS`: no notification is sent and no window slot is counted. `sent: true` means one persistent notification was sent.
- Order, so a rejection reveals little and a repeat never counts: authentication, payload, mutual friend, live room, caller membership, dedupe, window, send, record.

Errors are thrown as `{ message, code }`; nakama-js surfaces the HTTP status (verified live on Nakama 3.40).

| Case | HTTP | gRPC | `message` |
|---|---|---|---|
| Malformed body, id or code | 400 | 3 | `invite_bad_request` |
| Target is not a mutual friend | 400 | 9 | `invite_not_friend` |
| Code unknown, or the match is gone | 404 | 5 | `invite_room_not_found` |
| Caller is not a present member of that room | 403 | 7 | `invite_not_member` |
| More than `INVITE_LIMIT` invites in the window | 429 | 8 | `invite_rate_limited` |
| No authenticated user | 401 | 16 | (not an `invite_*` code) |

| Limit | Value |
|---|---|
| `INVITE_LIMIT` | 20 per sender per `INVITE_WINDOW_MS` |
| `INVITE_WINDOW_MS` | 600000 ms (10 min), fixed window from the first send after the previous one expired |
| `INVITE_TTL_MS` | 600000 ms (10 min): dedupe window per (friend, room code), and invite display expiry |

A member of a live private room is the only sender; the target must be a mutual friend (`FRIEND_STATE.FRIEND`). `join_by_code` remains the final liveness check, so a dead table answers `room_not_found` whatever the invite said.

- `matchSignal` is answered by the match loop, so a call can take up to about 1 s; it is not on the tap-to-Join path.
- A newcomer who joins a waiting room by code is auto-seated (see [Membership and the host](#membership-and-the-host)); a standing member (`seat: -1`) only occurs when the room is full or a game is running.

### Storage records

Server-owned, in collection `social` (`SOCIAL_COLLECTION`).

| Record | Collection / key | Permissions | Holds |
|---|---|---|---|
| Recent players | `social/recent_players`, owned by the player | read 1 (owner), write 0 (server) | `RecentPlayersRecord { tables: [{ endedAt, players: [{ userId, name }] }] }` — newest first, at most `RECENT_TABLES_MAX` (20) |
| Invite limits | `social/invite_limits`, owned by the sender | read 0, write 0 (server only) | `InviteLimitsRecord { windowStart, sent, pending }` |

- `recent_players`: each table lists the other humans who sat in that game (never the owner, never bots). `endedAt` is epoch ms at game finish, or the moment the owner left; `name` is the name at game start. A write is read-modify-write, last writer wins, and best effort (a failure is logged, never thrown). A read returns `200 {}` when absent, another user's read also returns `200 {}` (owner read hides it), and a client write is refused.
- `invite_limits`: `windowStart`/`sent` are the fixed window; `pending` maps `${friendUserId}:${roomCode}` → sentAt epoch ms, pruned once entries reach `INVITE_TTL_MS`. The record is last-write-wins and server-only; a failed write is logged without failing the call (the notification has already gone out).

### `FRIEND_ERROR_CODES` and `FRIEND_LIMITS`

The server `beforeAddFriends` hook enforces limits and throws `{ message, code }`; Nakama maps the numeric code to HTTP.

| Case | HTTP | gRPC | `message` |
|---|---|---|---|
| More than `MAX_TARGETS_PER_REQUEST` targets, or malformed ids/usernames | 400 | 3 | `friend_bad_request` |
| New requests would exceed `MAX_OUTGOING_PENDING` | 429 | 8 | `friend_outgoing_limit` |
| Accepting would exceed the caller's `MAX_FRIENDS` | 429 | 8 | `friend_limit` |
| Accepting would push the other user over `MAX_FRIENDS` | 429 | 8 | `friend_their_limit` |

| Limit | Value | Meaning |
|---|---|---|
| `MAX_TARGETS_PER_REQUEST` | 10 | ids + usernames in one `AddFriends` call (before dedupe) |
| `MAX_OUTGOING_PENDING` | 50 | outgoing requests still pending (state 1) |
| `MAX_FRIENDS` | 200 | mutual friends (state 0) |

- Friend-code usernames in an `AddFriends` call are normalized and resolved with `nk.usersGetUsername`; unknown or malformed codes and the caller's own id are dropped. Already friends, already requested and blocked targets are no-ops left to Nakama.
- When nothing valid remains, the hook returns the original request so Nakama answers with its own 400 rather than a silent success. A blocked target's re-request is a 200 no-op (Nakama).

### Blocking

Nakama's friend graph owns blocking; the server adds no filter of its own.

- Blocking removes the edge in both directions: both players' friend lists drop each other, and a pending request goes too. The blocked player is not notified.
- Unblocking does not restore the friendship; it only allows a new request to be sent and accepted. Each side blocks and unblocks independently.
- While blocked, an `AddFriends` call naming the blocker answers 200 `{}` but creates no request and sends no notification. The caller's UI still shows the player as found with an enabled **Add friend**, deliberately: a block must never be revealed to the blocked player.
- Adding someone you blocked is also a silent no-op and does not unblock them; the UI offers **Unblock** instead of **Add friend**.
- A `FRIEND_REQUEST` (`-2`) that arrived before the block stays in the inbox; the client deletes it without a toast.

## Players directory

Source: `packages/protocol/src/directory.ts` and `packages/protocol/src/stats.ts`; server side `apps/server/src/directory/` and `apps/server/src/stats/`. Design background: [ADR-0004](../adr/0004-unique-display-names-players-directory-and-presence-visibility.md) and [ADR-0005](../adr/0005-stats-provenance.md).

Search is prefix-only and authenticated. There is no endpoint that lists every player: an empty query, or a query that folds to fewer than `SEARCH_MIN_CHARS` characters, is `directory_bad_query`.

### Directory constants

| Constant | Value |
|---|---|
| `NAME_FOLD_VERSION` | 1 |
| `SEARCH_MIN_CHARS` | 2 (folded) |
| `SEARCH_MAX_CHARS` | 16 (folded) |
| `SEARCH_MAX_QUERY_INPUT` | 64 raw UTF-16 code units, capped before folding |
| `SEARCH_PAGE_SIZE` | 20 rows per page |
| `SEARCH_MAX_RESULTS` | 60 matches per query, across all pages |
| `SEARCH_SCAN_MAX_PAGES` | 6 (documented contingency only; not implemented) |
| `DIRECTORY_COLLECTION` | `player_directory` |
| `DIRECTORY_OWN_COLLECTION` | `player_directory_own` |
| `DIRECTORY_INDEX_NAME` | `player_names` |
| `SEARCH_INDEX_MAX_ENTRIES` | 100000 |
| `DIRECTORY_LIMITS_KEY` | `limits` |
| `NAME_CLAIM_KEY_PREFIX` | `n` |
| `OWN_CLAIM_KEY_PREFIX` | `own/` |

### Name folding

`foldName` is the single key for uniqueness and search. Two names that fold equal are the same name: only the first claim succeeds and the other is refused as `name_taken`. The folded form is what the `player_names` index holds (`NameClaim.fold`), and every query is folded the same way before its prefix is built. The fold is idempotent, versioned by `NAME_FOLD_VERSION`, and is one explicit map over UTF-16 code units (no `normalize`, no `u`-flag regex, no case methods); a code unit outside the map passes through unchanged.

| Characters (code units) | Folds to |
|---|---|
| `A-Z` | lowercase |
| `À Á Â Ã Ä Å à á â ã ä å` | `a` |
| `Æ æ` | `ae` |
| `Ç ç` | `c` |
| `È É Ê Ë è é ê ë` | `e` |
| `Ì Í Î Ï ì í î ï` | `i` |
| `Ð ð` | `d` |
| `Ñ ñ` | `n` |
| `Ò Ó Ô Õ Ö Ø ò ó ô õ ö ø` | `o` |
| `Ù Ú Û Ü ù ú û ü` | `u` |
| `Ý ý ÿ` | `y` |
| `Þ þ` | `th` |
| `ß` | `ss` |
| `×` (`U+00D7`) and `÷` (`U+00F7`) | unchanged |
| `آ أ إ ٱ` (`U+0622`, `U+0623`, `U+0625`, `U+0671`) | `ا` (`U+0627`) |
| `ئ` (`U+0626`) and `ى` (`U+0649`) | `ي` (`U+064A`) |
| `ة` (`U+0629`) | `ه` (`U+0647`) |
| `ؤ` (`U+0624`) | `و` (`U+0648`) |
| `٠-٩` (`U+0660-U+0669`, Arabic-Indic digits) | ASCII `0-9` |
| space (`U+0020`) | leading and trailing spaces trimmed; a run collapses to one |
| every other code unit | unchanged |

`normalizeQuery` caps raw input at `SEARCH_MAX_QUERY_INPUT` before folding; `isSearchableQuery` accepts only 2 to 16 folded characters.

### Claim key

`nameClaimKey(folded)` = `NAME_CLAIM_KEY_PREFIX` (`'n'`) + lowercase SHA-256 hex of the folded name's UTF-8 bytes: 65 ASCII characters. The folded name itself is never a storage key.

| Name | Fold | Claim key |
|---|---|---|
| `Hédi` (also `HEDI`, `HÉDI`) | `hedi` | `n4b0bd6e85d5c1c28d395dee7e9ba23fc01d8fb2a5af344ff937940afd6373ab0` |

Exact-match reads use the same derived key (`storageRead` on `n<sha256hex>`). The claim record's `fold` value field is what the storage index indexes.

### `search_players` RPC

- Request: `SearchPlayersRequest { q: string, cursor?: string }`. `q` is raw text, at most `SEARCH_MAX_QUERY_INPUT` (64) UTF-16 units before folding, and must fold to 2-16 characters. `cursor` is the previous response's `nextCursor`; omit it on the first page (a JSON `null` is treated as absent).
- Response: `SearchPlayersResponse { players: DirectoryPlayer[], nextCursor: string | null, capped: boolean }`, where `DirectoryPlayer { userId, name, presence }` and `presence` is `visible` or `hidden`. `name` is the spelling stored in the claim record.
- Authentication: required. An http_key-only call has no user and gets HTTP 401 / gRPC 16.
- Results exclude the caller, a claim whose owner's live display name no longer folds to that claim's `fold` or whose account is gone (a stale claim), and either direction of a block. An admissible exact folded match leads the first page; all matches are folded prefixes.
- Each call is counted against `SEARCH_LIMIT` (100 searches per `LIMIT_WINDOW_MS`, 10 min) before the index is read, so a query that finds nothing still counts.

| Case | HTTP | gRPC | `message` |
|---|---|---|---|
| Bad JSON, non-object body, missing or non-string `q`, malformed cursor, or a folded query outside 2-16 characters | 400 | 3 | `directory_bad_query` |
| The 101st search in the current 10-minute window | 429 | 8 | `directory_rate_limited` |
| Storage or index fault | 500 | 13 | `directory_storage_error` |
| No authenticated user | 401 | 16 | `search_players requires an authenticated user` |

`directory_storage_error` is thrown but is not a member of `DIRECTORY_RPC_ERROR_CODES`; like `name_storage_error` it is a fault, never an empty result page.

### `get_player_profile` RPC

- Request: `GetPlayerProfileRequest { userId: string }`; non-empty, at most 128 characters.
- Response: `PlayerProfileResponse { userId, name, presence, stats: PlayerStats }`.
  - `CompetitiveStats { games, wins, chkobbas, currentStreak, bestStreak, updatedAt }`: server-observed online results.
  - `PracticeStats { games, wins, chkobbas, updatedAt }`: device-reported offline results, display-only.
  - A missing or malformed record reads as an all-zero block. The two blocks have separate provenance and are never summed, compared or ranked together ([ADR-0005](../adr/0005-stats-provenance.md)).
- Authentication: required. An http_key-only call gets HTTP 401 / gRPC 16.
- A caller may always open its own profile. For anyone else, a block in either direction answers exactly like an unknown id.
- Each call is counted against `PROFILE_LIMIT` (200 profile views per `LIMIT_WINDOW_MS`, 10 min) before the lookup.

| Case | HTTP | gRPC | `message` |
|---|---|---|---|
| Bad JSON, non-object body, or a missing, non-string, empty or oversized `userId` | 400 | 3 | `directory_bad_query` |
| The 201st profile view in the current 10-minute window | 429 | 8 | `directory_rate_limited` |
| Unknown id, a stale claim, or a block in either direction | 404 | 5 | `directory_not_found` |
| Storage fault | 500 | 13 | `directory_storage_error` |
| No authenticated user | 401 | 16 | `get_player_profile requires an authenticated user` |

### `set_presence_visibility` RPC

- Request: `SetPresenceVisibilityRequest { visibility: 'everyone' | 'nobody' }`.
- Response: `SetPresenceVisibilityResponse { visibility, updatedAt }`; `updatedAt` is epoch ms of the stored change.
- Authentication: required. An http_key-only call gets HTTP 401 / gRPC 16.
- This RPC is the only writer of `profile/prefs`. There is no rate limit on it.

| Case | HTTP | gRPC | `message` |
|---|---|---|---|
| Bad JSON, non-object body, missing `visibility`, or any value other than the two states | 400 | 3 | `presence_bad_request` |
| Storage fault | 500 | 13 | `directory_storage_error` |
| No authenticated user | 401 | 16 | `set_presence_visibility requires an authenticated user` |

### Directory storage records

No client path writes any of these records. The own-claim and preference records are owner-readable; every other record is server-read only, so clients learn its contents through the RPCs.

| Record | Collection / key | Permissions | Written by |
|---|---|---|---|
| Claim (`NameClaim { userId, name, fold, claimedAt }`) | `player_directory/n<sha256hex(fold)>`, owned by the system user | read 0 / write 0 | server account hooks: `beforeUpdateAccount` (create-only acquire), `afterUpdateAccount` (release on a fold change), `afterAuthenticateDevice` (reconcile/backfill) |
| Own claim (`OwnClaim { claimKey, fold, name, claimedAt }`) | `player_directory_own/own/<userId>`, owned by the player | owner read 1 / write 0 | server account hooks (`afterUpdateAccount`, `afterAuthenticateDevice`) |
| Limits (`DirectoryLimitsRecord { searchWindowStart, searches, profileWindowStart, profiles }`) | `player_directory/limits`, owned by the caller | read 0 / write 0 | `search_players` and `get_player_profile` |
| Presence prefs (`PresencePrefsRecord { visibility, updatedAt }`) | `profile/prefs`, owned by the player | owner read 1 / write 0 | `set_presence_visibility` only |
| Competitive stats (`CompetitiveStats`) | `player_stats/competitive`, owned by the player | read 0 / write 0 | the match adapter at the finish transition |
| Practice stats (`PracticeStats`) | `player_stats/practice`, owned by the player | read 0 / write 0 | `report_practice_game` only |

- The claim record is owned by the system user, so even the claiming player cannot read it directly with the storage API; `read 0 / write 0` applies to clients. The own record is the client-readable pointer.
- `report_practice_game` is the only write path to practice stats: request `{ win: boolean, chkobbas: number }`, response `{ practice: PracticeStats }`. `chkobbas` is clamped to `PRACTICE_MAX_CHKOBBA_PER_GAME` (21), and one caller may send `PRACTICE_REPORT_LIMIT` (60) reports per `PRACTICE_WINDOW_MS` (1 h). Errors: `practice_bad_request` (400/3), `practice_rate_limited` (429/8), `practice_storage_error` (500/13). The stored window fields (`windowStart`, `windowReports`) are never returned.
- A malformed stored value reads as absent or as an all-zero block; it is never trusted through a cast.

### Result cap and scan contingency

- One query returns at most `SEARCH_MAX_RESULTS` (60) players across all pages; one page returns at most `SEARCH_PAGE_SIZE` (20).
- `nextCursor` is opaque: a client only echoes it back with the same query. The current encoding is JSON `{ "c": string | null, "s": number, "a": string[] }`, which also carries the ids already returned so repeats from the offset-based index cursor are deduped.
- `capped: true` means the `SEARCH_MAX_RESULTS` cap was reached and the query may have more matches; `nextCursor` is then `null` and pagination stops. The cap is per query, not per page, and a client never receives a cursor past it.
- `capped: false` is any other outcome: continue while `nextCursor` is non-null. When `nextCursor` is `null` too, the response is the final page and holds all the query's matches. A capped response and a fully traversed one both end with `nextCursor: null`; `capped` is the difference.
- An invalid or undecodable cursor is `directory_bad_query`, never an empty page.
- The bounded scan is a contingency only: `SEARCH_SCAN_MAX_PAGES` (6) pages of 100 `storageList` records, stopping at `SEARCH_MAX_RESULTS` and setting `capped`. It is **not implemented**; the storage index is the only search route. An index or storage fault is `directory_storage_error`, not an empty result.
- The index is registered with `SEARCH_INDEX_MAX_ENTRIES` (100000); behaviour past that limit is not defined by the code ([ADR-0004](../adr/0004-unique-display-names-players-directory-and-presence-visibility.md) section 7).

### Presence labels

`PRESENCE_VISIBILITY` has two choices; `DEFAULT_PRESENCE_VISIBILITY` is `everyone`. `labelOf` maps them to the wire label on both search rows and profiles.

| Choice | Wire label (`PresenceVisibilityLabel`) | Meaning |
|---|---|---|
| `everyone` | `visible` | The player publishes presence. This is the default, including for an account that never saved a preference or whose `profile/prefs` record is malformed |
| `nobody` | `hidden` | The player publishes nothing. This is **not** an offline signal |

- `hidden` does not remove the account from search results or make its profile unreadable: the row or profile still carries `userId`, `name`, the `hidden` label and, on a profile, both stat blocks. It only replaces presence.
- A client must not render `hidden` as offline, an offline dot or "last seen"; it is a privacy choice, not a connectivity state.

## Match label and listing

Match handler name: `chkobba_table`. Label (JSON):

| Field | Meaning |
|---|---|
| `open` | Waiting with at least one free seat |
| `mode` | `'2v2'` |
| `seatsFree` | Free seats |
| `private` | Private table |

Updated only when the label text changes. Query used by `quick_match` (`OPEN_TABLES_QUERY`): `+label.open:T +label.mode:2v2 +label.private:F`, limit 20.

A private table keeps `private: true` and `open: false` for its whole life, so no open-table query ever returns it. The room code is never in the label: any client can list authoritative matches and read their labels.

## `quick_match` RPC

- Request: body ignored. Needs an authenticated user; an http_key-only call fails with code 16.
- Response: `{"matchId": string}`.
- Logic: `matchList` for open tables, pick the one with the fewest free seats, otherwise `matchCreate('chkobba_table')`.
- Nakama's match index lags about 1 s, so the returned table may have just filled; the client then gets `table_full` on join and calls `quick_match` again (up to 3 attempts).
- When nothing is listed, `quick_match` returns the newest table it created if that is under 5 s old and still open (stored in collection `quick_match`, key `recent_table`), so simultaneous callers share a table.

Other RPC: `smoke_game` (plays a full bot game in the runtime; diagnostic).

## Private tables

Source: `packages/protocol/src/room.ts`; server side `apps/server/src/rpc/privateTable.ts` and `roomLimits.ts`. Design background: [ADR-0002](../adr/0002-private-tables-room-codes-and-host-model.md).

### Constants

| Constant | Value |
|---|---|
| `ROOM_CODE_ALPHABET` | `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — 32 symbols, no `I`/`O`/`0`/`1` |
| `ROOM_CODE_LENGTH` | 6 (32^6 ≈ 1.07e9 codes) |
| `ROOM_MAX_MEMBERS` | 8 humans present (4 seated + standing) |
| `ROOM_RESET_MS` | 15 s: final scores stay up, then the table returns to its room |
| `ROOM_LINK_PATH` | `/t/` — share links are `${EXPO_PUBLIC_WEB_BASE_URL}/t/${code}` |
| `ROOM_JOIN_CODE_KEY` | `code` — join metadata key that gates entry |
| Lookup limit | 10 failed `join_by_code` lookups per user per 10 min |
| Create limit | 5 private tables per user per 10 min |
| `PLACEHOLDER_GRACE_MS` | 30 s: an unfinished create frees its code after this |

`normalizeRoomCode` uppercases and strips whitespace and dashes; `isRoomCode` checks length and alphabet. A bad format counts as a failed lookup.

### Storage records

| Record | Collection / key | Permissions | Holds |
|---|---|---|---|
| Code mapping | `private_table/<code>` | read 0, write 0 (system only) | `RoomCodeRecord { matchId, createdAt }` |
| Rate limits | `private_table/limits`, owned by the user | read 0, write 0 (system only) | `RoomLimitsRecord { lookupWindowStart, lookupFailures, createWindowStart, creates }` |

The mapping is written with a version check, so two tables cannot claim one code. A create writes a placeholder with an empty `matchId` first (dead to lookups), creates the match with the code, then points the record at the new match at the placeholder's version. A closing match deletes its mapping only while the record still points at it; a stale placeholder or a match that no longer exists is cleaned lazily by `join_by_code`.

### `create_private_table` RPC

- Request: body ignored. Needs an authenticated user.
- Response: `{"matchId": string, "code": string}`.
- Logic: checks the create limit, reserves a fresh code (up to 5 attempts), calls `matchCreate` with `{ private: true, code }`, and maps the code to the new match.
- On failure: `room_rate_limited` when the create window is exhausted; `internal` when every code attempt collides.

### `join_by_code` RPC

- Request: `JoinByCodeRequest { code: string }`.
- Response: `{"matchId": string}`.
- Logic: checks the lookup limit first (before parsing, so a limited user learns nothing), normalizes and validates the code, reads the mapping, and confirms the match still exists and its label is private. A dead or stale mapping is deleted.
- The client then joins the match over its socket with `{ code }` as join metadata. `join_by_code` only resolves the match id.

### Join gate

A private table admits a newcomer only when `metadata[ROOM_JOIN_CODE_KEY]` normalizes to its code. Members reclaiming a seat by `userId` are exempt. A missing or wrong code is rejected as `room_not_found`, the same answer as a dead code, so listing a match id gives an attacker no oracle. This is additive hardening beyond ADR-0002's original text.

### RPC errors

Sent as the `message` of the thrown error with a numeric gRPC code; nakama-js surfaces the HTTP status (verified on Nakama 3.40).

| Case | HTTP | gRPC | `message` |
|---|---|---|---|
| Bad format (also counts as a failed lookup) | 400 | 3 | `room_bad_code` |
| Unknown or dead code, or a match that is gone | 404 | 5 | `room_not_found` |
| 11th lookup after 10 failures, even with a valid code | 429 | 8 | `room_rate_limited` |
| 6th create in the window | 429 | 8 | `room_rate_limited` |
| Join without the right code (socket join) | — | — | `room_not_found` on the socket |

### Membership and the host

Members are the humans present, in join order, separate from seats. A member is seated or standing. Being in the room and sitting are separate actions; `SIT` covers sitting, switching and late take-over. Newcomers auto-sit on the lowest free seat while the room is waiting; during a game they stand. The host is the first member present; when the host leaves, the earliest present member takes the crown (even mid-game, so the host is always a member). A private table never backfills bots while waiting and never auto-starts; the host presses `START`, and bots fill the empty seats then. When a game finishes, the final scores stay for `ROOM_RESET_MS`, then the table returns to its room with the same code and the same members and seats.

## Timing constants

| Constant | Value | Where |
|---|---|---|
| `BACKFILL_MS` | 15 s from first waiting human (`waitingSince`) | `table/types.ts` |
| `PLAY_MS` | 20 s | `table/types.ts` |
| `CUT_MS` | 10 s | `table/types.ts` |
| `BOT_PACE_MS` | 1 s | `table/types.ts` |
| `NEXT_ROUND_MS` | 8 s | `table/types.ts` |
| `AWAY_AFTER_MISSES` | 2 | `table/types.ts` |
| `MAX_NAME_LENGTH` | 24 | `table/types.ts` |
| `TICK_RATE` | 1 per second | `match/tableMatch.ts` |
| `MAX_TICK_STEPS` | 8 per loop | `match/tableMatch.ts` |
| `JOIN_TIMEOUT_MS` | 10 s (reserved seat expires if `matchJoin` never comes) | `match/tableMatch.ts` |
| `LINGER_AFTER_FINISH_MS` | 60 s | `match/tableMatch.ts` |
| `EMPTY_TIMEOUT_MS` | 60 s with no sessions | `match/tableMatch.ts` |
| `MAX_MESSAGE_BYTES` | 2048 | `match/tableMatch.ts` |

## Client constants (mobile)

| Item | Value |
|---|---|
| Env vars | `EXPO_PUBLIC_NAKAMA_HOST/PORT/KEY/SSL` (defaults `127.0.0.1`, `7350`, `defaultkey`, false) |
| Reconnect backoff | 500 ms base, 10 s cap, jitter |
| Clock offset samples | last 16 snapshots, largest `serverTime - receipt` |
| Guest device id | Per platform, see below; username `Guest-XXXX` |
| Emote prefs | AsyncStorage `chkobba.emotes`: `{ mutedAll, quick }` (quick row = last four sent, newest first) |

### Guest device id

Valid ids: `chk-` prefix, then `[A-Za-z0-9-]`, 10 to 128 characters in total (`isValidDeviceId` in `apps/mobile/src/online/deviceId.ts`). Stores reject anything else.

| Platform | Id | Store |
|---|---|---|
| iOS | `chk-<uuid>` | Keychain via `expo-secure-store`, `AFTER_FIRST_UNLOCK`; survives reinstall |
| Android | `chk-a-<64 hex>` = SHA-256(`ANDROID_ID` + app salt) via `expo-crypto`; recomputed each launch | none; the raw `ANDROID_ID` never leaves the device. Without one: a persisted `chk-<uuid>` in AsyncStorage (fallback key) |
| Web | `chk-<uuid>` | `localStorage` (unchanged); if storage is blocked the id is lost on reload |

Storage keys:

| Key | Where | Holds |
|---|---|---|
| `chkobba.online.deviceId` | Native AsyncStorage (legacy id); web `localStorage` (the id); iOS Keychain item key | Device id |
| `chkobba.online.deviceIdMigrated` | AsyncStorage | One-time migration flag |
| `chkobba.online.deviceId.android-fallback` | AsyncStorage (Android only) | Fallback id when there is no `ANDROID_ID`, or when the legacy account was kept (409) |
| `chkobba.online.session` | AsyncStorage | Cached session tokens (unchanged) |
| `chkobba.online.profile` | AsyncStorage | Cached `Profile` (display name, `namePicked`, `renameAvailableAt`) |

On Android `load` prefers the fallback over the derived id; `save(derived)` is a no-op. Salt: `:chkobba-online-guest-v1`, appended to `ANDROID_ID` before hashing. Changing it changes every Android guest's id. Migration rules: `docs/explanation/multiplayer-architecture.md`.

Store layout (`apps/mobile/src/online/`):

- `deviceId.ts` holds the types (`DeviceIdStore`, `CreateDeviceIdStore`), `DEVICE_ID_KEY`, `DEVICE_ID_PREFIX` and `isValidDeviceId`. Consumers import `createDeviceIdStore` from `./deviceIdStore`; Metro picks `.ios.ts`, `.android.ts` or `.web.ts`. jest-expo resolves `.ios.ts`; `tsc` sees the throwing `deviceIdStore.ts` fallback.
- Stores never generate ids; `load()` returns null when empty. `newDeviceId()` in `nakama.ts` is the only generator.
- iOS writes use `AFTER_FIRST_UNLOCK`. A Keychain write error fails sign-in (no silent fallback).
- Web with blocked `localStorage`: a throwaway id per load instead of a sign-in error.
- `app.json` plugin `["expo-secure-store", { "faceIDPermission": false }]` keeps SecureStore's Android backup exclusion rules (encrypted values cannot be decrypted on a restored device) and adds no Face ID usage string.
- `GuestAuth.resolveDeviceId()` runs once per instance, before session restore.

### Profile service (mobile)

`apps/mobile/src/online/profile.ts`, `NakamaProfileBackend`. Shared lazy singletons (one Nakama client, one `GuestAuth`) come from `services.ts`: `getNakamaClient`, `getGuestAuth`, `getOnlineBackend`, `getProfileBackend`.

| Call | Behaviour |
|---|---|
| `getProfile` | `getAccount` and `readStorageObjects(profile/name)` in parallel. Name: display name, then username, then `Player`. `namePicked` = valid `NameRecord`. `renameAvailableAt` = `changedAt + RENAME_COOLDOWN_MS` if in the future, else null. Failures reject; no fallback profile |
| `setDisplayName` | Format check first (no network on failure), then `updateAccount({ display_name })`. `name_rate_limited` refreshes the profile. Save OK but re-read fails: `ok: true`, `namePicked: true`, approximate cooldown |
| `loadCachedProfile` | Reads `chkobba.online.profile`; no network. A cached `renameAvailableAt` may be past: the UI compares it with the clock |

Cooldown display uses the server `changedAt` against the local clock; skew only shifts the countdown.
