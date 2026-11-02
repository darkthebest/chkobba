# ADR-0003: Friend codes, social socket and presence

**Status:** Accepted
**Date:** 2026-10-31
**Plan:** `context/plans/2026-10-30-friends.md`

> **Amended 2026-10-31:** [ADR-0004](0004-unique-display-names-players-directory-and-presence-visibility.md), with [ADR-0001](0001-durable-guest-identity-and-display-names.md)'s 2026-10-31 amendment, makes the display name the unique public handle and moves adding people to the players directory. The friend code and the `/f/<code>` link are **retained for shipped builds** — the username is still the code, the add-by-username hook still works, and legacy links still resolve — but they are **no longer offered in the UI**: add-by-code and the code card retire in favour of the directory. The rest of this ADR stands.

## Context

- Friends v1 needs a way to add someone: a code to type or a link to open. Nakama usernames are unique, but today they are a generated hidden handle (ADR-0001).
- Players want to see who is online and to invite a friend to a private table (ADR-0002).
- The per-game socket only lives while a table is open, and it joins with `createStatus: false`. It cannot carry presence in the lobby.
- Anyone can follow any user id, so a status string is effectively public.
- Guest accounts are free, so any per-user abuse limit can be dodged with throwaway accounts.
- Shipped builds must keep working: every `@chkobba/protocol` change is additive.

## Decision

### 1. Friend code is the Nakama username

The friend code is the account's `username`, set by the server when the account is created.

| Item | Value |
|---|---|
| Alphabet | `FRIEND_CODE_ALPHABET`, the room-code alphabet (32 symbols, no `0`, `O`, `1`, `I`) |
| Length | `FRIEND_CODE_LENGTH` = 8, so 32^8 ≈ 1.1e12 codes |
| Display | `XXXX-XXXX` (`formatFriendCode`) |
| Link | `${base}/f/CODE` (`FRIEND_LINK_PATH`) |
| Input | `normalizeFriendCode` (uppercase, spaces and dashes removed), then `isFriendCode` |

- The code is generated on the server in a `registerBeforeAuthenticateDevice` hook. It only takes effect when the account is created (see the verified result below).
- Randomness: `nk.secureRandomBytes` through the existing `byteSource` in `apps/server/src/rpc/roomCode.ts`, then `friendCodeFromBytes`. Private tables already use this source, and friends reuses it. `nk.uuidv4()` is not used.
- Each candidate is screened with the server profanity list and checked for uniqueness with `nk.usersGetUsername`. A clash or a hit retries with new bytes.
- Friend requests then use Nakama's own `addFriends`, by user id: the client resolves the code with `getUsers` and sends ids. The before hook still accepts usernames, resolving them with `nk.usersGetUsername`, and passes ids on. Nakama enforces uniqueness.
- A before hook on `addFriends` enforces the limits in `FRIEND_LIMITS` and throws the `FRIEND_ERROR_CODES` (`friend_bad_request`, `friend_outgoing_limit`, `friend_limit`, `friend_their_limit`).

**Verified on Nakama 3.40 (2026-10-31, isolated test stack).** The primary path works: the hook rewrites `username`.

- When the account is created, Nakama uses the hook's `data.username`. If the client sends no username, the hook sees an empty string. A client-sent `Guest-AB12` is overwritten.
- When an existing account signs in, Nakama ignores the hook's username. There is no error and no change.
- The hook runs on every device authenticate and cannot tell a create from a sign-in. Its uniqueness check (`nk.usersGetUsername`) therefore costs one lookup per sign-in.
- Usernames are stored exactly, with no case folding. The database constraint is a case-sensitive UNIQUE. `nk.usersGetUsername`, REST `getUsers?usernames=` and `addFriends?usernames=` all match exactly. A lowercase entry fails: `addFriends` returns HTTP 400, code 3, "No valid ID or username was provided."
- Rule: codes are stored uppercase, and every lookup runs `normalizeFriendCode` first.
- A clash returns HTTP 409 `{"code":6,"message":"Username is already in use."}`. The hook makes up to 5 tries against `usersGetUsername`. The check is not atomic, so the client retries once on 409.
- Social login (step 2) creates accounts through other authenticate calls. Each of them needs the same before hook.

Rejected alternative: a fallback where the hook rejects a create whose `username` is not a valid friend code (`username_bad_code`) and the client generates the candidate and retries. It is not used and not needed.

### 2. A separate app-level social socket

- One socket for the app, connected with `socket.connect(session, true)` — `createStatus` is the second argument (`appearOnline` is Nakama's server-side parameter, true by default). It owns the user's status, follows friends and receives notifications.
- The per-game socket stays `createStatus: false`, so the two sockets never fight over status.
- **Dependency:** Nakama must not have `single_socket` enabled. If it were, the game socket would kick the social one.
- Lifecycle:
  - Connects at launch only when a stored session exists. A fresh install connects on first Friends or online use.
  - Disconnects when the app goes to the background and reconnects on return.

### 3. Status carries availability only

- The status string is `JSON.stringify(PresenceStatus)`: `{ v: 1, a: 'lobby' | 'room' | 'playing' }` (`PRESENCE_ACTIVITIES`).
- It never holds a room code or a match id. Anyone can follow any user id, and a code in a status would let strangers walk into private tables.
- Joining a friend goes through an invite (below), not through status.

### 4. Optional `userId` on human seats

- `PlayerInfo.userId` is optional and set for human seats only. `RoomMember.userId` is equally optional and now set for every member; it shipped on 2026-10-31 (members are always humans). Bots have none.
- It lets the client offer "add friend" from the table. The change is additive; old decoders ignore and drop the field.
- A user id is not secret (it is already a follow target), so exposing it to table-mates leaks nothing new.

### 7. Invites

- `invite_to_table` RPC (`InviteToTableRequest { userId, code }`, `InviteToTableResponse { sent }`). The server:
  - requires auth;
  - limits a sender to `INVITE_LIMIT` (20) per `INVITE_WINDOW_MS` (10 minutes);
  - requires a mutual friend (`FRIEND_STATE.FRIEND`);
  - checks that the caller is a present member of that room, using `nk.matchSignal` on the table;
  - dedupes per (friend, room code) within `INVITE_TTL_MS`; a repeat answers `sent: false`. The sender is implicit: the pending map lives in the sender's own record. A code maps 1:1 to a live table (ADR-0002); edge case: a code deleted and reused by another table inside the window can suppress one resend.
- Counters and pending invites live in the server-owned `social/invite_limits` record (`InviteLimitsRecord`).
- Delivery is a persistent notification with positive code 1 (`NOTIFICATION_CODES.TABLE_INVITE`; Nakama's own codes are negative). Content is `TableInviteContent { v: 1, code, fromName }`.
- Clients show invites older than `INVITE_TTL_MS` (10 minutes) as expired. The notification is not deleted by the server.
- `join_by_code` is the final liveness check: a dead table answers `room_not_found` whatever the invite said.
- Errors are the `INVITE_RPC_ERROR_CODES`: `invite_bad_request`, `invite_not_friend`, `invite_not_member`, `invite_room_not_found`, `invite_rate_limited`.

### Implementation notes (2026-10-31)

Details settled while building; they refine the decision above and correct the record where it was less precise.

- `matchSignal` answers `'yes'`/`'no'` synchronously through the match loop (about 1 s worst case at the 1 Hz tick), never mutates state, and treats malformed data, public tables and a dead match as refusal; a thrown signal reads as `invite_room_not_found`.
- A standing member counts as present for the membership check; a member disconnected mid-game while seated does not.
- Recent players are not in this ADR's scope but shipped with it: `social/recent_players` (read 1 / write 0), written on leave and on finish, once per player per game, capped at 20, best effort, so a storage failure never fails a match.
- Notification lifecycle is client policy (requests deleted on sight; invites deleted on dismiss, join or block; invites re-flagged as expired at `INVITE_TTL_MS`); the server never deletes.
- The only remaining `Math.random` on the server is the injected default `Player####` display name, which is cosmetic and not protocol-security-relevant; friend codes use `nk.secureRandomBytes`.
- `AUTH_ERROR_CODES` (`username_bad_code`) remains exported although the fallback path never shipped.

## Consequences

**Positive**

- Players share one short code or link, and Nakama enforces uniqueness for us.
- Presence works in the lobby without touching the game socket.
- No code or match id is ever visible to people who are not invited.
- All wire changes are additive.

**Negative and mitigations**

| Consequence | Mitigation |
|---|---|
| ADR-0001 said `username` stays hidden and new accounts get `Guest-XXXX`; this supersedes both | ADR-0001 carries an amendment note; the rest of it stands |
| The username is now visible to anyone who sees the user, and it cannot be changed | It is a random code, not a real name; the display name is still what the table shows |
| Existing accounts keep their old usernames and have no code | Migration of existing testers is covered in the plan; they are not backfilled by the hook |
| The hook cannot tell a create from a sign-in, so it does one `usersGetUsername` lookup per sign-in | One indexed lookup; Nakama ignores the hook's username for existing accounts |
| The uniqueness check is not atomic, so two creates can clash | The hook tries up to 5 times; the client retries once on HTTP 409 |
| A code can be guessed or harvested by a script | 1.1e12 codes; a request needs the other user to accept; `FRIEND_LIMITS` cap pending requests |
| Two sockets per user, plus battery and reconnect cost | Social socket is off in the background and absent without a stored session |
| `single_socket` would silently break presence | Recorded here as a deployment dependency; do not enable it |
| Invite spam from throwaway guests | Only mutual friends can be invited, and a sender is rate limited |
| A stale invite points at a dead table | Client shows it as expired after 10 minutes; `join_by_code` answers `room_not_found` |
| `matchSignal` adds a call to the table per invite | Limited to 20 per 10 minutes per sender; no per-move cost |
| Friend codes are not secret once shared | They only allow a friend request, which the other side must accept |

## Alternatives considered

| Alternative | Why not |
|---|---|
| Separate `friend_code` storage record plus an index | Another lookup to keep unique; the username is already unique and Nakama's `addFriends` takes it |
| Client-generated friend code with a `username_bad_code` rejection | Not enforceable, and the hook can rewrite the username directly (verified) |
| `nk.uuidv4()` as the randomness source | Not a documented CSPRNG; `nk.secureRandomBytes` is already wired in through `byteSource` |
| Letting players pick their own username | Needs a uniqueness UX and more profanity surface; a random code is simpler and safer |
| Reusing the per-game socket for presence | It exists only during a table and is `createStatus: false` on purpose |
| Putting the room code or match id in the status | Anyone can follow any user id, so it would leak private tables |
| One shared socket for game and social | Different lifetimes; game reconnect logic would also drop presence |
| Invite via a client-only message on the game socket | The friend is not in the match; an RPC plus a persistent notification reaches an offline friend |
| Friend edge to join directly (no invite) | Needs the code in a status, which is rejected above |

## Related

- [ADR-0001](0001-durable-guest-identity-and-display-names.md) (amended by this ADR)
- [ADR-0002](0002-private-tables-room-codes-and-host-model.md)
- [Multiplayer architecture](../explanation/multiplayer-architecture.md)
- [Wire protocol](../reference/wire-protocol.md)
