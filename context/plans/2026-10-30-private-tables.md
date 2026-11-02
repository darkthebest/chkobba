# Plan: Private tables v1 (room code, waiting room, host start)

**Status:** CONFIRMED
**CONFIRMED:** true (user, 2026-10-30)
**Base branch:** `feature/2026-10-30-player-identity-names`

**Goal:**

- A player creates a private 2v2 table and shares a 6-character room code, or a web link to it.
- Friends join with the code or the link and pick their seats in a waiting room.
- The host presses Start. Normal bots fill any empty seats.
- After the game everyone goes back to the same room with the same code, ready for another game.
- A late arrival can take over a seat a bot is playing.

## Decisions (user, 2026-10-30)

- **Invites:**
  - The host gets a 6-character room code. Its alphabet leaves out `0`, `O`, `1` and `I`. The code is valid for as long as the table lives.
  - The host also gets an https link to the web build at `/t/CODE`, an expo-router route.
  - The home screen gets "Create private table" and "Join with code".
  - Out of scope for v1: Universal Links and App Links (they need a production domain), and invites from the friend list or groups. Both come later on top of the same table.
- **Seating:**
  - The waiting room shows the 4 seats. Any human taps an empty seat to sit, or to switch seats.
  - Partners sit opposite each other: seats 0 and 2 against 1 and 3.
  - Private tables never auto-backfill. The host presses Start, then Normal bots fill the empty seats.
- **End of game:**
  - A private table goes back to the waiting room with the same code. Seats are kept.
  - Humans can switch seats or leave, and the host presses Start again.
  - Public tables keep closing 60 s after the game ends, as today.
- **Host leaves:**
  - In the waiting room, the host role passes to the human who joined earliest and is still there.
  - During a game nothing special happens: a bot plays the seat as usual.
  - The table closes after 60 s with no humans connected (existing rule).
- **No host settings in v1.** Default rules and Normal bots. Settings added later must be additive protocol fields.
- **Late join during a game:**
  - A late arrival may take over any seat a bot is playing (BotSeat becomes HumanSeat), at a turn boundary. This works like the existing handback to a human on reconnect.
  - A seat held by a human stays theirs, even while that human is disconnected.
  - Otherwise the late arrival waits in the room, without a seat.
- **Protocol:** every `@chkobba/protocol` change is additive.

### Technical decisions (mine; revisit at review)

1. **Code → match mapping in storage, never in the label.**
   - Clients can list authoritative matches with label queries (`ListMatches`), so a code in the label would leak every live code.
   - The label keeps `private: true` and `open: false`, so `quick_match` (`+label.private:F`, `apps/server/src/rpc/quickMatch.ts:12`) and any future open-tables list never see the table.
   - The mapping is one system-owned record per code, with `permissionRead 0` and `permissionWrite 0`. It is written with a version check so two tables can't claim one code.
2. **The code lives in the match.**
   - The `create_private_table` RPC passes `{ private: true, code }` to `nk.matchCreate`. `matchInit` stores it in table state.
   - The table deletes its own mapping when it ends. A lookup that finds a dead match (`nk.matchGet` returns null, for example after a server restart) deletes the stale record and returns not-found.
3. **Room members, separate from seats.**
   - A private table tracks the humans present as `members`, ordered by when they joined.
   - A member may be seated, or standing (no seat yet, or the game is full).
   - Being in the room and sitting are separate actions, which makes switching, host handover and late join simple.
   - Public tables keep `room: null` and behave exactly as today.
4. **Arrival in the waiting room:**
   - A new arrival sits automatically in the lowest free seat, and taps another seat to switch.
   - They stand only when all 4 seats are taken.
   - Confirmed by the user.
5. **One new intent covers sit, switch and takeover.**
   - `SIT { seat }`:
     - In the waiting room, it takes an empty seat (switching from the current one, if any).
     - During a game, it lets a standing member take over a bot seat.
   - `START` is host-only.
   - There is no STAND intent in v1. Leaving the room means leaving the match.
6. **Takeover timing.** The seat slot is swapped right away and `refreshTurn` is reused. A bot move that is already scheduled for that seat still happens, so the human takes control from the next turn on. Reconnect handback already works this way (`seats.ts:18-21`, `lifecycle.ts:114-125`).
7. **Fresh deals per game.**
   - The pure core derives each game's seed as `${seed}:${gameNo}`, so it stays deterministic and needs no `nk` call.
   - The table log `seq` keeps growing across games, and the log is cleared on reset. Clients filter on `seq > lastSeq` (`NakamaGameClient.ts:364`), so they keep working.
8. **Standing members get a snapshot with `seat: -1` and `view: null`.**
   - Current builds decode only seats 0 to 3 (`apps/mobile/src/online/protocol.ts:230`), so an old client drops such a snapshot instead of misreading it.
   - Old builds can't reach a private table anyway: they have no code entry.
9. **A standing member doesn't watch the cards in v1.** During a game they see:
   - the seats, with names and bot markers
   - the team scores
   - a "Take over" button on each bot seat
   - "Waiting for this game to end"

   No `PlayerView` is built for them, so no hidden-information risk. Confirmed by the user.
10. **Back to the room after a game:**
    - The finished game stays on screen for `ROOM_RESET_MS` (15 s) so players see the final scores. Then the core resets to `waiting`.
    - Each snapshot carries the reset time (`room.resetAt`) so clients can count down.
    - Confirmed by the user.

## Architecture Decisions

- To write in Phase 0: **[ADR-0002 "Private tables: room codes, membership and host model"](../../docs/adr/0002-private-tables-room-codes-and-host-model.md)**, at `docs/adr/0002-private-tables-room-codes-and-host-model.md`. Use the `architecture-decision-records` skill. It covers technical decisions 1 to 3 and 8.
- Related: [ADR-0001: Durable guest identity and display names](../../docs/adr/0001-durable-guest-identity-and-display-names.md). The name gate is reused.

## Current state (key discoveries)

**Pure table core (`apps/server/src/table/`)**

- `TableState` has seats, game, log and timers. It has no notion of privacy, host or membership (`types.ts:53-77`).
- `createTable` takes only `now` and `seed` (`lifecycle.ts:32-54`).
- `join`:
  - It reclaims a reserved seat by `userId`, or claims the lowest free seat while waiting.
  - It starts the game when all 4 seats hold humans (`seats.ts:17-39`).
  - Once the game has started, only a reconnect gets in: everyone else gets `table_full` (`seats.ts:24-25`).
- `leave` frees the seat while waiting. During a game it keeps the seat reserved, with a null `sessionId` (`seats.ts:47-55`).
- `tick` backfills with bots `BACKFILL_MS` after the first human sits down (`tick.ts:52-56`). The `finished` phase does nothing (`tick.ts:20-21`).
- `startGame` always uses the table's single seed (`lifecycle.ts:88-91`), so a second game on the same table would deal the same cards.
- `intent` handles PLAY, CUT and BACK, and rejects senders without a seat (`intent.ts:32-51`). Emotes live outside the table state (`emote.ts`).
- `label()` always sets `private: false` (`projection.ts:33`).
- `snapshotFor` needs a seat from 0 to 3 (`projection.ts:12-15`).

**Adapter (`apps/server/src/match/tableMatch.ts`)**

- `matchInit` ignores `params` (`:65-79`).
- `matchJoinAttempt` resolves the display name and claims the seat (`:86-110`). `admit` repeats the claim (`:274-295`).
- `sendSnapshot` sends only to a session that holds a seat (`:336-345`), so a standing member would get nothing today.
- `terminationReason`:
  - a finished table closes after `LINGER_AFTER_FINISH_MS` (60 s)
  - an empty table closes after `EMPTY_TIMEOUT_MS` (60 s), counted over connections (`:362-374`)
- `matchTerminate` and `matchSignal` are no-ops (`:164-187`).

**RPC and storage**

- `quick_match` keeps a versioned system-user record and uses `version: '*'` for create-if-absent (`quickMatch.ts:53-75`). The code mapping can follow the same pattern.
- `InitModule` registers `smoke_game`, `quick_match`, three account hooks and the match (`apps/server/src/main.ts:45-63`).
- The fakes cover `matchCreate`, `matchGet`, `matchList` and an in-memory storage (`apps/server/src/__tests__/fakes.ts:75-190`). They don't cover `storageDelete`.

**Protocol (`packages/protocol/src/index.ts`)**

- Opcodes 1-4 are intents (PLAY, CUT, BACK, EMOTE). 100-102 go from server to client (`:11-22`).
- `Snapshot.seat` is a required number (`:68`).
- `TableLabel.private` already exists (`:116-122`).
- `ERROR_CODES` is a closed list (`:97-106`). The mobile decoder drops unknown codes (`apps/mobile/src/online/protocol.ts:245-249`). It also rebuilds the snapshot from known fields only (`:226-242`), so any new field has to be added to the decoder too.

**Mobile**

- `OnlineBackend` offers `signIn`, `quickMatch` and `openSocket` (`NakamaGameClient.ts:54-61`).
  - `NakamaGameClient` retries `quickMatch` when the table is full (`:286-299`).
  - `started` becomes true once and never goes back (`:369-372`). A null `view` keeps the last one.
- `FindingPlayers`:
  - It owns the first-visit name gate: the `Gate` states and `submitName` (`components/lobby/FindingPlayers.tsx:20-121`).
  - The gate is tied to `QuickMatch`. Private tables need it too.
- `game.tsx`:
  - It shows `FindingPlayersView` until `online.started` (`app/game.tsx:83-91`).
  - "New game" goes to `/finding` (`:92`).
- On the home screen, `tile-private` is a "Soon" tile (`app/index.tsx:125`). There is no join-by-code entry.
- `app.json` sets `web.output: "single"`, an SPA. A static host therefore needs a fallback rewrite for `/t/*`. The scheme is `chkobba`.
- `expo-linking` is installed. `expo-clipboard` is not.
- Nakama config comes from `EXPO_PUBLIC_NAKAMA_*` (`online/nakama.ts:24-56`). There is no web base URL setting.
- **Secure context.** `navigator.clipboard` and `navigator.share` only work in a secure context, and LAN testing serves plain `http://<LAN-IP>` (CLAUDE.md). Copy and share need a visible fallback.

## Desired end state

**Host**

- Home → "Create private table" → the name gate on the first visit → the room appears with the code in large type, plus Share or Copy.
- With no base URL configured, sharing sends the code only.
- The host sits automatically in seat 0, and may switch seats.
- Start is enabled for the host as soon as at least one human is seated. Pressing it fills empty seats with Normal bots, and the game starts for everyone.

**Guest**

- Opening `https://<web-base>/t/K7M2QX`, or Home → "Join with code" → typing the code, goes through the name gate and then into the same room.
- A wrong, expired or dead code shows "Table not found". Too many wrong codes show "Too many attempts, try again later".

**Room**

- Every member sees the 4 seats: names, a bot marker, a host crown, and team colours that make the 0+2 and 1+3 pairs obvious.
- The room also lists the standing members.
- Tapping an empty seat sits you there, or moves you.
- When the host leaves the waiting room, the earliest-joined member still there becomes host. Everyone sees it.

**After the game**

- The final scores show for 15 s. Then everyone is back in the room with the same code and seats.
- Seats of humans who left are freed, and bot seats are emptied.
- The host can start again.

**Late join**

- Someone who joins during a game sees the room with "Take over" on each bot seat.
- Taking over swaps them into that seat from the next turn on.
- With no bot seat free, they wait and are seated, or standing, when the room comes back.

**Public tables** behave exactly as before. A regression test proves it.

**Everywhere**

- All text is in `en` and `aeb`, on the phone and desktop layouts.
- Skins come through tokens and slots, never a per-skin fork.

## What we're NOT doing

- Universal Links and App Links, and native deep-link handling of the https link. The `chkobba://` scheme works incidentally, but nothing is built or promised for it.
- Inviting from the friend list or groups, and push notifications.
- Host settings: rules variants, bot level, target score, private or public toggle.
- Kicking or banning players, transferring host by hand, or locking the room.
- Live watching of cards by standing members (spectator `PlayerView`).
- A lobby list of open tables.
- Rotating or regenerating a code.
- Reconnecting to the room after a server restart. Matches don't survive a restart, and the stale code returns not-found.
- Any deployment: hosting the web build or the Nakama backend publicly. Testing stays on the local network, and the user will say explicitly when to deploy.

---

## Data-structure proposals

### `@chkobba/protocol` additions (additive only)

```ts
// packages/protocol/src/room.ts (re-exported from index.ts)
// Also holds the pure, dependency-free normalizeRoomCode / isRoomCode helpers.

/** 32 symbols: A-Z without I and O, digits 2-9 (no 0 or 1). 32^6 ≈ 1.07e9 codes. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** Web route for share links: `${base}/t/${code}`. */
export const ROOM_LINK_PATH = '/t/';

/** How long the final scores stay before a private table returns to its room. */
export const ROOM_RESET_MS = 15000;
/** Humans present in a private table (4 seated + standing). */
export const ROOM_MAX_MEMBERS = 8;

/** One human present in a private table. No user or session ids on the wire. */
export interface RoomMember {
  readonly name: string;
  /** Seat index 0-3, or null while standing. */
  readonly seat: number | null;
  readonly isHost: boolean;
}

/** Private-table information, present in a Snapshot only for private tables. */
export interface RoomInfo {
  readonly code: string;
  /** In join order (earliest first). */
  readonly members: readonly RoomMember[];
  /** The recipient's own entry: index into `members`. */
  readonly you: number;
  /** Team scores of the game in progress, for standing members (they get no `view`); null while waiting. */
  readonly scores: readonly [number, number] | null;
  /** Epoch ms when a finished private table returns to the waiting room; null otherwise. */
  readonly resetAt: number | null;
}

/** SIT payload: take an empty seat (waiting) or take over a bot seat (in game, while standing). */
export interface SitIntent {
  readonly seat: number;
}

// RPC: create_private_table   request {}            response CreatePrivateTableResponse
// RPC: join_by_code           request JoinByCodeRequest  response JoinByCodeResponse
export interface CreatePrivateTableResponse {
  readonly matchId: string;
  readonly code: string;
}
export interface JoinByCodeRequest {
  readonly code: string;
}
export interface JoinByCodeResponse {
  readonly matchId: string;
}

/** RPC error `message` values (thrown as { message, code } with numeric gRPC codes). */
export const ROOM_RPC_ERROR_CODES = [
  'room_bad_code', // format check failed (INVALID_ARGUMENT 3); counts as a failed lookup
  'room_not_found', // unknown code, or the match is gone (NOT_FOUND 5)
  'room_rate_limited', // too many failed lookups / creates (RESOURCE_EXHAUSTED 8)
] as const;
export type RoomRpcErrorCode = (typeof ROOM_RPC_ERROR_CODES)[number];

/** System-owned mapping record: collection `private_table`, key = code. Read/write 0/0. */
export const ROOM_COLLECTION = 'private_table';
export interface RoomCodeRecord {
  readonly matchId: string;
  readonly createdAt: number;
}

/** Per-user, server-owned rate-limit record: collection `private_table`, key `limits`. Read/write 0/0. */
export const ROOM_LIMITS_KEY = 'limits';
export interface RoomLimitsRecord {
  /** Fixed-window start (epoch ms) and failed join_by_code lookups in it. */
  readonly lookupWindowStart: number;
  readonly lookupFailures: number;
  /** Fixed-window start and private tables created in it. */
  readonly createWindowStart: number;
  readonly creates: number;
}
```

**Additions to `index.ts`:**

```ts
// OpCode (added, numbering continues)
//   SIT: 5,     // SitIntent
//   START: 6,   // host only, no payload
// IntentOpCode gains SIT | START.

// ERROR_CODES gains (appended):
//   'not_host', 'seat_taken', 'already_seated', 'not_private', 'room_full'

// Snapshot gains (optional, absent on public tables):
//   readonly room?: RoomInfo;
// Snapshot.seat: documented as -1 for a standing member of a private table (view is then null).
```

**Unchanged:** `PlayerInfo`, `TableLabel` (only its `private` value changes), `TablePhase`, `EmoteIntent`.

### Server (`apps/server/src/table/types.ts`)

```ts
/** A human present in a private table, seated or standing. */
export interface Member {
  readonly userId: string;
  readonly sessionId: string;
  readonly name: string;
  /** Epoch ms of arrival; the host passes to the earliest present member. */
  readonly joinedAt: number;
}

/** Private-table state; null on public tables. */
export interface PrivateRoom {
  readonly code: string;
  /** Present humans in join order. A seated human is also in `seats`. */
  readonly members: readonly Member[];
  /** userId of the host; null only while nobody is present. */
  readonly hostUserId: string | null;
  /** Games started at this table; seeds game n with `${seed}:${n}`. */
  readonly gameNo: number;
}

// TableState gains:
//   readonly room: PrivateRoom | null;
// and the finished phase of a private table schedules the reset through `nextActionAt`.

export interface CreateTableOptions {
  readonly now: number;
  readonly seed: string;
  /** Present for private tables (code from the create RPC). */
  readonly privateCode?: string;
}
```

### Mobile (`apps/mobile/src`)

```ts
// game/GameClient.ts (additions)
export interface RoomState {
  readonly code: string;
  readonly members: readonly { readonly name: string; readonly seat: Seat | null; readonly isHost: boolean }[];
  /** Our own seat, or null while standing. */
  readonly mySeat: Seat | null;
  readonly amHost: boolean;
  readonly scores: readonly [number, number] | null;
  /** Local-clock ms when a finished game returns to the room; null otherwise. */
  readonly resetAt: number | null;
}
// OnlineInfo gains:  readonly room?: RoomState;
// GameClient gains (optional, online private only):
//   sit?(seat: Seat): Promise<void>;
//   startGame?(): Promise<void>;

// online/NakamaGameClient.ts: OnlineBackend gains
//   createPrivateTable(): Promise<{ matchId: string; code: string }>;
//   joinByCode(code: string): Promise<JoinByCodeResult>;
export type JoinByCodeResult =
  | { readonly ok: true; readonly matchId: string }
  | { readonly ok: false; readonly reason: 'not_found' | 'bad_code' | 'rate_limited' | 'network' };
```

**New client env var:** `EXPO_PUBLIC_WEB_BASE_URL`, for example `http://192.168.1.20:8081` for LAN testing now, and an https domain later. It must be an http or https origin with no trailing path. When it is unset or malformed, share links are off and only the code is shared.

---

## Phase 0: Contracts and decision record

**Goal:** fix the wire contract and record the private-table design before anything depends on it.

**Tasks**

- Add `room.ts` to `@chkobba/protocol`:
  - the constants, types and `ROOM_RPC_ERROR_CODES` above
  - the pure `normalizeRoomCode` (uppercase, strip spaces and dashes) and `isRoomCode`
  - Re-export both from `index.ts`.
- In `index.ts`:
  - Append the `SIT` and `START` opcodes, widen `IntentOpCode`, and append the new `ERROR_CODES`.
  - Add the optional `Snapshot.room`, and document `seat: -1` for standing members.
- Unit tests for the code helpers. Their vectors cover lowercase, spaces and dashes, and the excluded characters `0`, `O`, `1` and `I`.
- Write ADR-0002 with the `architecture-decision-records` skill and add it to `docs/adr/README.md`. It covers:
  - storage mapping against label search
  - code space and brute-force math
  - members against seats
  - the host rule
  - the `seat: -1` snapshot
  - cleanup and lazy liveness checks

**Success criteria**

- The protocol builds, and both apps typecheck. No existing field changes shape.
- The helpers bundle into the ES5 server module.
- The ADR is linked from this plan.

**Risks**

- **Closed error decoding.** Old builds silently drop the new error codes. That is acceptable, because old builds can't reach a private table.

---

## Phase 1: Pure table core for private rooms (Vitest)

**Goal:** the pure core supports a private room end to end: membership, seat pick and switch, host handover, host start with bot fill, return to the room after a game, and bot-seat takeover. Public behaviour stays the same.

**Tasks**

- **Creation.** Extend `createTable` with an optional private code. Initialize `room`, set `gameNo` to 0, and add a `ROOM_RESET_MS` timing constant.
- **`join` on private tables:**
  - A known user reclaims their seat, or their member entry.
  - A newcomer is appended to `members`, up to `ROOM_MAX_MEMBERS`; beyond that they get `room_full`.
  - While waiting, a newcomer sits in the lowest free seat (technical decision 4).
  - The first member present becomes host.
  - Never auto-start on four humans.
- **`leave` on private tables:**
  - While waiting, it removes the member, frees their seat and reassigns the host to the earliest present member.
  - During a game, a seated human keeps the reserved seat (as today) and a standing member is removed. The host only changes once the room is waiting again.
- **New intent paths in `intent.ts`:**
  - `SIT` validates the payload and the seat range.
    - While waiting: the seat must be empty (`seat_taken`), and the actor moves into it.
    - While playing or between rounds: the actor must be standing (`already_seated`) and the target a `BotSeat` (`seat_taken`). The slot becomes a `HumanSeat` and `refreshTurn` runs (technical decision 6).
  - `START`:
    - Only the host may send it (`not_host`), only while waiting (`wrong_phase`), with at least one human seated.
    - It fills empty seats with `botSeat(i)`, increments `gameNo` and starts the game with the derived seed.
  - On public tables both return `not_private`.
- **Actor lookup.** Private tables accept intents from standing members (SIT only). Seated-only checks stay for PLAY, CUT and BACK.
- **`tick` on private tables:**
  - The waiting phase never backfills.
  - When a game finishes, schedule the reset (`nextActionAt = finishedAt + ROOM_RESET_MS`). When it is due, reset to `waiting`:
    - clear `game` and `log`, but keep `seq`
    - keep connected human seats, clearing `missed` and `away`
    - free seats of disconnected humans, and drop those humans from `members`
    - empty the bot seats
    - reassign the host if needed
  - `nextWakeAt` covers the new timer.
- **Projection:**
  - `label()` sets `private: true` and `open: false` for private tables.
  - `snapshotFor` supports a standing recipient (`seat: -1`, `view: null`) and adds `room` (members in join order, `you`, `scores` from the game, `resetAt`).
  - `backfillAt` stays null on private tables.
- **Vitest tables** covering:
  - auto-sit and the switch
  - seat taken
  - the member cap
  - host handover by join order, and none during a game
  - start by a non-host, or with nobody seated
  - bot fill on start
  - a full private game: reset to the room with seats kept, then a second game with a different deal
  - takeover on a bot's turn, where the bot still plays that turn
  - no takeover of a disconnected human's seat
  - a standing snapshot carries no hand, no stock and no other hand (extend the hidden-information test)
  - public-table regression: all existing tests unchanged

**Success criteria**

- `pnpm --filter @chkobba/server test` passes, with the new paths covered.
- The existing public-table tests pass unchanged.

**Risks**

- **Old match state.** Older match state in flight lacks `room`. Treat a missing value as `null`, as the adapter already does for `emoteAt` (`tableMatch.ts:234-235`).
- **Reset edge cases**, such as everyone disconnecting at the moment of reset. The empty-table rule then closes the match, and the code cleanup has to run.

---

## Phase 2: Adapter, RPCs, code storage and rate limits

**Goal:** Nakama hosts private tables. A host creates one and gets a code. Anyone resolves a live code to a match id, with failed lookups rate-limited per user. Mappings never outlive their table.

**Tasks**

- **`matchInit`** reads `params.private` and `params.code` (validated with `isRoomCode`) and creates a private table.
- **`matchJoinAttempt` and `admit`** go through the private `join` path. A full room is rejected with `room_full`.
- **`sendSnapshot`** also targets connected standing members of a private table, using the `seat: -1` projection.
- **`matchLoop` on private tables:**
  - The finished-linger close doesn't apply, because the core resets the table to the room before then.
  - The empty-table close still applies.
- **Code cleanup:**
  - Before `matchLoop` returns null, and in `matchTerminate`, delete the mapping record, but only when it still points to this match. Wrap it in try/catch and log failures.
  - Add `storageDelete` to the fakes.
- **`create_private_table` RPC:**
  - Requires an authenticated user, and rate-limits creates (default 5 per 10 min).
  - Generates a code from `nk.uuidv4()` bytes, through a pure generator that takes a random source.
  - Reserves the mapping with `version: '*'`. A collision with a live match picks a new code (at most 5 tries). A stale record (dead match) is overwritten with its version.
  - Creates the match with `{ private: true, code }`, writes the `matchId` and returns `{ matchId, code }`.
- **`join_by_code` RPC:**
  - Requires an authenticated user.
  - Normalizes and validates the code.
  - Checks the per-user failed-lookup window (default 10 failures per 10 min) before reading the mapping.
  - A missing record, or a dead match (`nk.matchGet` null or label not private), returns `room_not_found`, counts a failure and deletes the stale record.
  - Success doesn't count toward the limit.
- **Limits record.** Keep it in the server-owned `private_table/limits` record. A race between parallel calls is accepted, as with `profile/name`.
- **Register** both RPCs in `main.ts`, as top-level named functions.
- **Adapter and RPC Vitest tests** against the fakes:
  - create, then lookup
  - a collision retry
  - a stale record cleaned up on lookup
  - the rate-limit boundary
  - a bad code
  - an unauthenticated call
  - mapping deletion on close
  - snapshots to standing members
  - `quick_match` never returns a private table
- **Rebuild and check.** Rebuild, restart Nakama, and confirm the module loads. Manual `curl` checks for both RPCs with a session token.

**Success criteria**

- Server Vitest passes.
- The module loads in goja.
- Manually:
  - a code created by one user resolves for another
  - after the table closes the code returns 404
  - the 11th bad code within 10 min returns 429

**Risks**

- **Throwaway guests.** Guest accounts cost nothing to create, so a per-user limit can be dodged with new device ids. The code space (about 1.07e9) against a few hundred live tables makes guessing impractical anyway. An extra per-IP limit (`ctx.clientIp`) can be added later if abuse shows up.
- **`storageDelete` in a terminating match.** The Nakama 3.40 grace-period behaviour must be checked; a lazy liveness check in `join_by_code` is the safety net.
- **Generator randomness.** The code generator must not use `Math.random` (goja and determinism rules). Derive it from `nk.uuidv4()` bytes in the adapter.

---

## Phase 3: Mobile client and services

**Goal:** the online client can create, resolve and join private tables, and exposes room state and room actions through `GameClient`. No UI yet.

**Tasks**

- **`OnlineBackend` and `createNakamaBackend`:**
  - Add `createPrivateTable` and `joinByCode`.
  - Validate responses: the match-id pattern, `isRoomCode`.
  - Map RPC error messages to `JoinByCodeResult` reasons.
- **Protocol decoder** (`online/protocol.ts`): accept `seat: -1` only together with a `room` field and `view: null`, validate `RoomInfo`, and pass `room` through. The new error codes come with the shared list.
- **`NakamaGameClient`:**
  - Map `room` to `OnlineInfo.room`, with server times converted to the local clock.
  - Add `sit(seat)` and `startGame()`.
  - Turn `started` back to false, and clear `view` and the local log, when a private table returns to `waiting`.
  - Skip the `quickMatch` table-full retry for private tables: they fail with `room_full` instead.
- **Share-link helper:** read `EXPO_PUBLIC_WEB_BASE_URL` with literal dot access (the `nakama.ts:24-41` pattern). It returns the link or null; anything that isn't an http or https origin gives null. Plain http is allowed because testing happens on the LAN.
- **Jest tests:**
  - the decoder, with and without `room`, and with seat -1
  - the reset to waiting
  - `sit` and `startGame` sends
  - joinByCode error mapping
  - the link helper with an unset, http or valid base URL

**Success criteria**

- Mobile Jest and typecheck pass.
- Quick match and `LocalGameClient` behaviour is unchanged.

**Risks**

- **State reset across games.** `useStagedTable` and the round-summary logic were written for one game per client. The game table must remount per game, keyed by game number or log reset, to avoid replaying stale animations.

---

## Phase 4: Waiting room and flows (UI, i18n, both layouts)

**Goal:** players create, share, join and run private tables from the app and the web build, on phone and desktop, in `en` and `aeb`.

**Tasks**

- **Shared `NameGate`.** Extract the first-visit name gate out of `FindingPlayers` (`FindingPlayers.tsx:20-121`) so it can wrap any online flow. `/finding` keeps its behaviour.
- **Home screen:**
  - The "Soon" `tile-private` becomes "Create private table".
  - Add a "Join with code" entry: a sheet with a code input that is uppercase, auto-formatted and length-capped, and validated with `isRoomCode`. It navigates to `/t/CODE`.
- **Routes:**
  - `/private` (create): name gate, then `createPrivateTable`, then `router.replace` to `/t/CODE` with the `matchId` param, which skips the lookup.
  - `/t/[code]`: name gate, then `joinByCode` (unless a matching `matchId` param came with it), then join.
    - It hosts the whole private session: room, table, back to room.
    - A web reload rejoins the same table through the code.
  - Regenerate typed routes (`expo start`) before typecheck.
- **`useRoomController(client)`.** Room logic shared by both layouts:
  - seat states
  - the team pairing
  - can-sit, can-start and can-take-over
  - the share or copy action
  - the reset countdown
- **`PrivateRoom` view:**
  - the code in large type, with Share and Copy, or the code alone with no link
  - the 4 seats arranged as at the table, with names, bot markers, a host crown, team colour, and tap to sit or switch
  - the standing list
  - Start, for the host only
  - Leave
  - During a game, for standing members: scores, "Take over" on bot seats, and "Waiting for this game to end".
- **Share and copy:**
  - Native: React Native `Share`.
  - Web: `navigator.share`, falling back to `navigator.clipboard`, behind secure-context checks.
  - Otherwise, show the link and code as selectable text. This is the LAN `http` case.
  - Add `expo-clipboard` with `expo install` only if native copy is wanted. Then check that `pnpm-lock.yaml` stays on Babel 7.
- **`game.tsx` and the private table screen:**
  - Show `PrivateRoom` while the phase is `waiting`, or the member is standing. Otherwise show `GameTable`.
  - After the game, the final summary shows until `resetAt`, then the room returns automatically.
  - "New game" in a private table means "back to room", not `/finding`.
- **Errors:**
  - `room_not_found`, `room_rate_limited`, `room_bad_code`, `room_full`, `not_host` and `seat_taken` get localized messages through `onlineErrorMessage`.
  - Fatal errors use `OnlineErrorSheet`.
- **i18n:**
  - `room.*` keys: title, code label, share, copy, copied, link-unavailable hint, seats, team labels, host, standing, sit, switch, start, start-hint, take over, waiting for game end, back to room in `{{seconds}}`, and the errors.
  - `lobby.private` and `lobby.joinCode` keys.
  - Add them to both `en.ts` and `aeb.ts`.
  - Wrap the code in an LTR isolate in RTL, so `K7M2QX` never mirrors.
- **Skins:**
  - Use only tokens and slots, such as `Panel` and `Avatar`, plus `marginStart` and `marginEnd`.
  - If the team colour or the host crown needs a token, add it once to `skins/types.ts` with a value per skin. Never fork the layout.
- **Layouts:**
  - Phone below 900 px: stacked.
  - Desktop: the seat diamond centred, with the code and actions alongside.
- **RNTL tests:**
  - create flow, and the link flow with the name gate
  - code input validation
  - sit and switch
  - Start visible only to the host
  - host crown handover
  - the standing view with takeover
  - back to room after the game
  - the share fallback with no base URL or an insecure context
  - rendering with the `aeb` catalog

**Success criteria**

- Mobile Jest, typecheck and lint pass.
- **Manual, on local web** at 1280 px and 390 px, in `en` and `aeb`, with three browser windows:
  - create and join by code, then by link
  - switch seats, start with one bot, and finish a game: back in the room, same code
  - the host leaves the room and the crown moves
  - a third window takes over the bot seat mid-game

**Risks**

- **Web reload during a game.** Reloading `/t/CODE` mid-game must reclaim the seat, not take over another one. Join by `userId` already handles this, but it needs a test.
- **Desktop keyboard play.** `useTableKeyboard` shortcuts must not fire in the room view.

---

## Phase 5: End-to-end check

**Goal:** prove the private flow on real Nakama with several clients.

**Tasks**

- **Extend `apps/server/scripts/e2e.ts`** with a private-table scenario:
  - A creates and gets a code. B joins by code, and both get room snapshots.
  - B switches seats.
  - A leaves the waiting room: the host passes to B. A rejoins and becomes a member again.
  - B starts: bots fill the empty seats and the game begins.
  - C joins by code mid-game, gets a standing snapshot (no hand) and takes over a bot seat, then plays its turns.
  - Everyone leaves: after `EMPTY_TIMEOUT_MS` the code returns `room_not_found`.
  - Bad codes return `room_bad_code`, and the limit returns `room_rate_limited`.
- **Optional `--full` flag:** play a private game to the end and assert the reset to the room keeps the code and seats, without lengthening the default run.
- **Public flow:** the existing quick-match scenario still passes unchanged.

**Success criteria**

- `pnpm --filter @chkobba/server e2e` passes, with and without `--full`.

**Risks**

- **Run time.** The e2e already takes about 8 minutes. Keep the default private scenario short, and push full-game coverage to Vitest and `--full`.

---

## Phase 6: Finalization

**Goal:** the docs match the shipped behaviour, and the staging notes are merged.

**Tasks**

- **Wire protocol reference:**
  - `SIT` and `START`
  - the new error codes
  - `Snapshot.room`, and `seat: -1`
  - both RPCs and their error codes
  - the `private_table` records and limits
  - room timing constants
  - the label for private tables
- **Architecture explanation:** a "Private tables" section covering membership against seats, the host rule, the reset to the room, takeover, code lifecycle and cleanup. Link ADR-0002.
- **How-to:** a note in `local-backend.md` on testing private tables across LAN devices, including setting `EXPO_PUBLIC_WEB_BASE_URL` to the LAN web address.
- **Staging docs:** merge the `context/docs/` phase notes into `docs/`, then delete the staging file.
- **CLAUDE.md:**
  - update the status
  - Key Patterns:
    - private tables use `room` and members
    - codes live in storage, never in the label
    - `seat: -1` for standing members
    - share links need `EXPO_PUBLIC_WEB_BASE_URL`
  - Project Structure: the new routes

**Success criteria**

- `pnpm build`, `pnpm test`, `pnpm lint` and `pnpm --filter @chkobba/server e2e` pass.
- The docs match the behaviour.

---

## Risks (cross-cutting)

- **Protocol drift.** The new `Snapshot` fields need matching server projection and client decoder changes. The decoder rebuilds the snapshot from known fields, so a forgotten field disappears silently. Shared fixtures in protocol tests catch this.
- **Public-table regressions.** Every private behaviour branches on `room !== null`. The existing core, adapter and e2e suites must pass unchanged.
- **Hidden information.** Standing members must never get a `PlayerView`. Extend the existing "no other hand or stock" assertion to `seat: -1` snapshots.
- **Host churn.** A host who drops briefly in the waiting room loses the crown, because rejoining puts them at the end of the join order. This is accepted for v1 and noted in the ADR.

## Testing strategy

**Unit tests**

- Protocol: code normalization and validation vectors.
- Server (Vitest):
  - the room core: join, leave, sit, start, reset, takeover, host
  - projection: `seat: -1`, `room`, the private label
  - adapter: snapshots to standing members, cleanup on close
  - RPCs: create, lookup, collision, stale record, rate limits
- Mobile (Jest and RNTL):
  - the decoder
  - `NakamaGameClient` room mapping and reset
  - backend RPC mapping
  - the link helper
  - `useRoomController`
  - the room view and flows, in `en` and `aeb`

**End to end**

The private scenario in `e2e.ts`: create, join by code, switch, host handover, start with bots, mid-game takeover, code cleanup, rate limit. The optional `--full` run adds the reset to the room.

**Manual**

- Three browser windows on local web, at desktop and phone widths, in both languages.
- One native device joining by code alongside them.

## Resolved questions (user, 2026-10-30)

1. **Arrival:** auto-sit in the lowest free seat, tap to switch.
2. **Standing member during a game:** seats, names, team scores and "Take over" on bot seats. No live cards.
3. **Back to the room:** automatically, `ROOM_RESET_MS` (15 s) after game over.
4. **Web hosting:** none in this plan. Testing stays on the LAN; deployment waits for an explicit request.

## References

- `apps/server/src/table/types.ts:53-77`: `TableState`
- `apps/server/src/table/seats.ts:17-55`: join, reclaim, leave
- `apps/server/src/table/lifecycle.ts:32-54`, `:88-91`, `:114-125`: create, start, refreshTurn
- `apps/server/src/table/tick.ts:12-56`: phases, backfill
- `apps/server/src/table/intent.ts:32-51`: intent dispatch
- `apps/server/src/table/projection.ts:12-34`: snapshot, label
- `apps/server/src/match/tableMatch.ts:65-110`, `:274-295`, `:336-374`: init, join, admit, publish, termination
- `apps/server/src/rpc/quickMatch.ts:12`, `:53-89`: private filter, versioned system record
- `apps/server/src/__tests__/fakes.ts:75-190`: nk fakes to extend
- `packages/protocol/src/index.ts:11-26`, `:66-122`: opcodes, snapshot, errors, label
- `apps/mobile/src/online/NakamaGameClient.ts:54-61`, `:286-299`, `:360-388`: backend port, join retry, snapshot mapping
- `apps/mobile/src/online/protocol.ts:226-249`: snapshot and error decoders
- `apps/mobile/src/components/lobby/FindingPlayers.tsx:20-121`: name gate to extract
- `apps/mobile/src/app/game.tsx:72-93`, `apps/mobile/src/app/index.tsx:125`: online game screen, "Soon" private tile
- `apps/mobile/app.json`: `web.output: single`, scheme `chkobba`
- Style references: `context/plans/2026-10-30-player-identity-names.md`, `context/plans/2026-10-27-multiplayer-m1.md`
