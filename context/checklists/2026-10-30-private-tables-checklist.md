# Checklist: Private tables v1 (room code, waiting room, host start)

**Ticket**: TBD
**Generated from**: `context/plans/2026-10-30-private-tables.md`
**Generated at**: 2026-10-30
**Base branch**: `feature/2026-10-30-player-identity-names` (working branch created by `/execute-plan`)
**Staging docs**: `context/docs/2026-10-30-private-tables-docs.md` (temporary; merged into `docs/` and deleted in Task 7.F)

## Phase mapping

The plan numbers its phases 0-6. This checklist reserves Phase 0 for preflight, so every plan phase moves up by one. Execution order is unchanged (plan 0 → 6).

| Checklist phase | Plan phase |
|---|---|
| Phase 0: Preflight | (orchestrator) |
| Phase 1: Contracts and decision record | 0. Contracts and decision record |
| Phase 2: Pure table core for private rooms | 1. Pure table core (Vitest) |
| Phase 3: Adapter, RPCs, code storage and rate limits | 2. Adapter, RPCs, code storage and rate limits |
| Phase 4: Mobile client and services | 3. Mobile client and services |
| Phase 5: Waiting room and flows (UI, i18n, both layouts) | 4. Waiting room and flows |
| Phase 6: End-to-end check | 5. End-to-end check |
| Phase 7: Finalization | 6. Finalization |

## Agent Registry

| Agent | Tier | Assigned Tasks |
|---|---|---|
| orchestrator (execute-plan) | n/a | 0.1 |
| general-purpose | Tier 3 - Research/Exploration (used as implementer; no dedicated TS/Nakama/Expo developer agent exists, same convention as the m1 and identity checklists) | 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 3.2, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.V, 5.I |
| web-search-researcher | Tier 3 - Research/Exploration | 3.1 |
| codebase-analyzer | Tier 3 - Research/Exploration | 7.5 |
| code-refactor | Tier 5 - Refactoring | 5.1 |
| test-specialist | Tier 2 - Domain Specialist | 1.3, 1.T, 2.6, 2.7, 2.T, 3.3, 3.7, 3.C, 3.T, 4.6, 4.T, 5.9, 5.10, 5.T, 6.1, 6.T, 7.T |
| debug-specialist | Tier 2 - Domain Specialist | 3.8, 6.2 |
| ui-explorer | Tier 4 - UI Validation | 5.U |
| docs-maintainer | Always Available | 1.4, 1.X, 2.X, 3.X, 4.X, 5.X, 6.X, 7.1, 7.2, 7.3, 7.4, 7.X, 7.F |

**Notes on assignment**
- The repo has no Tier 1 generators and no Tier 6 developer agents (`.claude/agents/` holds only research, test, debug, refactor, UI-validation and docs agents). Implementation goes to `general-purpose`, as in the two earlier checklists. Tier 6 usage: 0.
- `code-refactor` gets the `NameGate` extraction (5.1): it is a behaviour-preserving refactor of `FindingPlayers.tsx`, guarded by the existing FindingPlayers tests.
- **i18n**: there is no `i18n-specialist` agent. Phase 5 still gets 5.V (validate) and 5.I (Derja wording pass), assigned to `general-purpose`. `en.ts` defines the `Translation` type, so `aeb.ts` gets its keys in the same task (5.2) or typecheck fails; 5.I is a wording review flagged for the user, not first-time generation.
- **ADR**: the plan writes ADR-0002 itself (Task 1.4), so there is no Task 1.0 pre-check. Compliance with ADR-0002 (and the ADR-0001 name-gate reuse) is checked in Task 7.5 and listed in the success criteria from Phase 2 on.
- **Cross-app contract**: Task 3.C pins the real HTTP status and body of both RPCs' errors and the shape of a standing-member snapshot on local Nakama, before the mobile client (Phase 4) maps them.

## Global constraints (apply to every task)

- `@chkobba/protocol` changes are additive only. No existing field of `OpCode`, `Snapshot`, `PlayerInfo`, `TableLabel`, `ErrorCode` changes shape; new opcodes and error codes are appended. Helpers in `room.ts` are pure, dependency-free, goja-safe (ES2017, no `\p{}`/`u`-flag regex, no `.at()`, `Object.hasOwn`, `Proxy`).
- **Public tables are untouched.** Every private behaviour branches on `room !== null`. The existing core, adapter, RPC, mobile and e2e tests pass **without edits**.
- **No `Math.random` on the server.** Room-code randomness comes from `nk.uuidv4()` bytes, fed into a pure generator that takes a random source. The pure core derives each game's seed as `${seed}:${gameNo}` with no `nk` call.
- **Codes never appear in the match label.** The label of a private table is `private: true`, `open: false`. The code-to-match mapping lives only in the system-owned `private_table/<code>` record (`permissionRead 0`, `permissionWrite 0`).
- **Hidden information.** A standing member (`seat: -1`) never gets a `PlayerView`: no hand, no stock, no other hand.
- **Old match state.** State without `room` reads as `room: null` (as `emoteAt` does at `apps/server/src/match/tableMatch.ts:234-235`).
- RPCs, hooks and match handlers registered in `InitModule` are top-level named functions. RPC errors throw `{ message, code }` with numeric gRPC codes (3, 5, 8); `nkruntime.Codes` is a const enum Babel can't inline.
- After any server change: rebuild, `docker compose restart nakama`, confirm the module loads.
- Mobile: no hard-coded UI text (`const tr = useT()`); `marginStart`/`marginEnd`; skins only through tokens and slots, never a per-skin fork; RNTL v14 `render`/`fireEvent` are awaited; no secure-context-only APIs on web without a fallback (LAN serves plain `http://`).
- Keep the workspace on Babel 7. If adding an Expo package re-resolves Babel 8 peers, restore `pnpm-lock.yaml` and reinstall.
- After adding an expo-router route, run `expo start` once to regenerate typed routes before `typecheck`.
- **No deployment or hosting of any kind.** Testing stays on the LAN (user decision).

## Validation command reference

| Package | Commands |
|---|---|
| `packages/protocol` | `pnpm --filter @chkobba/protocol test`, `pnpm --filter @chkobba/protocol typecheck` |
| `apps/server` | `pnpm --filter @chkobba/server test`, `pnpm --filter @chkobba/server typecheck`, `pnpm --filter @chkobba/server build` |
| Nakama load check | `pnpm --filter @chkobba/server build && docker compose restart nakama`, then `docker compose logs nakama --since 1m` shows "Chkobba module loaded" with no goja errors and the new RPCs registered, then `curl -X POST "localhost:7350/v2/rpc/smoke_game?http_key=defaulthttpkey&unwrap" -d '{}'` returns a winner |
| `apps/mobile` | `pnpm --filter @chkobba/mobile test`, `pnpm --filter @chkobba/mobile typecheck`, `pnpm --filter @chkobba/mobile lint` |
| e2e | `pnpm --filter @chkobba/server e2e` (and with `--full`) |
| Workspace | `pnpm build`, `pnpm test`, `pnpm lint` |

---

## Phase 0: Preflight

- [x] **Task 0.1**: Mark ticket as In Progress
  - **Files**: N/A (issue tracker — ref from the checklist's `**Ticket**` header line)
  - **Assigned Agent**: orchestrator (execute-plan runs this directly — NOT a sub-agent)
  - **Skills**: None
  - **Dependencies**: None
  - **Validation**: Linked issue shows In Progress (skipped with a note if no ticket ref yet)
  - **Status**: ✅ Skipped (no ticket linked). Executed on `feature/2026-10-30-player-identity-names` with the identity work still uncommitted, by the user's choice.

---

## Phase 1: Contracts and decision record (plan phase 0)

**Overview**: Fix the private-table wire contract in `@chkobba/protocol` and record the design in ADR-0002 before anything depends on it.

- [x] **Task 1.1**: Add `room.ts` to `@chkobba/protocol` with the constants, types, `ROOM_RPC_ERROR_CODES` and the pure `normalizeRoomCode` / `isRoomCode`, and re-export it from the index
  - **Files**: `packages/protocol/src/room.ts` (new): the plan's data-structure block verbatim (`ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `ROOM_LINK_PATH`, `ROOM_RESET_MS`, `ROOM_MAX_MEMBERS`, `RoomMember`, `RoomInfo`, `SitIntent`, `CreatePrivateTableResponse`, `JoinByCodeRequest`, `JoinByCodeResponse`, `ROOM_RPC_ERROR_CODES`/`RoomRpcErrorCode`, `ROOM_COLLECTION`, `RoomCodeRecord`, `ROOM_LIMITS_KEY`, `RoomLimitsRecord`). `normalizeRoomCode`: uppercase, strip spaces and dashes. `isRoomCode`: exactly 6 chars, all in the alphabet. `packages/protocol/src/index.ts`: `export * from './room'` next to the `names`/`emotes` re-exports.
  - **Constraint**: No imports, ES2017 lib, no `u`-flag regex (a character loop over the alphabet is fine).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, code-quality-standards
  - **Dependencies**: Task 0.1
  - **Validation**: protocol typecheck, server and mobile typecheck pass; protocol tests 264/264
  - **Status**: ✅ Complete (`normalizeRoomCode` strips all whitespace and dashes; `isRoomCode(code: string)`)

- [x] **Task 1.2**: Append the `SIT`/`START` opcodes and the new error codes, and add the optional `Snapshot.room`
  - **Files**: `packages/protocol/src/index.ts` (opcodes `:11-22`, snapshot `:66-90`, errors `:97-106`): `OpCode.SIT = 5`, `OpCode.START = 6`; `IntentOpCode` gains both; `ERROR_CODES` appends `'not_host'`, `'seat_taken'`, `'already_seated'`, `'not_private'`, `'room_full'`; `Snapshot` gains `readonly room?: RoomInfo`; JSDoc on `Snapshot.seat` documents `-1` for a standing member of a private table (with `view: null`). `TableLabel` unchanged.
  - **Constraint**: Append only; existing numeric values and order unchanged.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns
  - **Dependencies**: Task 1.1 (`RoomInfo` type)
  - **Validation**: protocol, server, mobile typecheck pass; diff is additive (IntentOpCode reformatted one member per line)
  - **Status**: ✅ Complete

- [x] **Task 1.3**: Write the room-code unit tests and shared room snapshot fixtures
  - **Files**: `packages/protocol/src/__tests__/room.test.ts` (new): `normalizeRoomCode` / `isRoomCode` vectors for lowercase, spaces, dashes, wrong length, and the excluded `0`, `O`, `1`, `I`; the alphabet has 32 unique symbols. `packages/protocol/src/testing/roomFixtures.ts` (new): a seated private snapshot with `room`, a standing snapshot (`seat: -1`, `view: null`, `room`), and a public snapshot without `room`; re-exported from the existing `./testing` subpath (next to `nameVectors.ts`) so server Vitest and mobile Jest can share them (plan risk "Protocol drift").
  - **Constraint**: The main entry must not import `testing/`, so Rollup never bundles fixtures.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 1.2
  - **Validation**: protocol test 311/311, typecheck clean; `./testing` export now points at `src/testing/index.ts` (re-exports `nameVectors` and `roomFixtures`)
  - **Status**: ✅ Complete

- [x] **Task 1.4**: Write ADR-0002 "Private tables: room codes, membership and host model" and link it
  - **Files**: `docs/adr/0002-private-tables-room-codes-and-host-model.md` (new): storage mapping vs label search (label queries leak codes); code space (32^6 ≈ 1.07e9) and brute-force math against the per-user lookup limit and the throwaway-guest caveat; members vs seats; the host rule (earliest present member, waiting room only; host churn on brief drop accepted); the `seat: -1` snapshot and why old builds drop it; cleanup on close plus the lazy liveness check in `join_by_code`. Status Accepted, alternatives considered. `docs/adr/README.md`: add the row. `context/plans/2026-10-30-private-tables.md`: turn the "To write in Phase 0" bullet into a link to the ADR.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: architecture-decision-records, documentation-standards
  - **Dependencies**: Task 1.2 (contract final)
  - **Validation**: ADR-0002 has Context, Decision, Consequences, Alternatives; row in `docs/adr/README.md`; linked from the plan
  - **Status**: ✅ Complete

- [x] **Task 1.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 1.3, Task 1.4
  - **Validation**: pnpm test green (rules 73, protocol 311, server 615, mobile 672), pnpm lint clean, pnpm build ok; server and mobile typecheck pass
  - **Status**: ✅ Complete

- [x] **Task 1.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-private-tables-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 1.T
  - **Validation**: Phase 1 section written in the staging file
  - **Status**: ✅ Complete (written by the orchestrator)

**Success criteria**
- Automated: protocol builds and tests pass; both apps typecheck; no existing field changes shape.
- Manual: ADR-0002 linked from the plan. (The ES5 bundle check for the helpers happens in Task 3.8, the first time the server imports them.)

---

## Phase 2: Pure table core for private rooms (plan phase 1)

**Overview**: The pure core (`apps/server/src/table/`, no `nkruntime`) supports membership, seat pick and switch, host handover, host start with bot fill, return to the room after a game, and bot-seat takeover. Public behaviour stays identical.

- [x] **Task 2.1**: Add the private-room types and extend `createTable` and `startGame`
  - **Files**: `apps/server/src/table/types.ts` (`TableState` `:53-77`): add `Member`, `PrivateRoom`, `TableState.room: PrivateRoom | null`, `CreateTableOptions.privateCode?`. `apps/server/src/table/lifecycle.ts` (`createTable` `:32-54`, `startGame` `:88-91`): `room` is `{ code, members: [], hostUserId: null, gameNo: 0 }` when `privateCode` is set, else `null`; `startGame` uses `${seed}:${gameNo}` for private tables. Add a small `roomOf(state)` helper returning `state.room ?? null` so old state without `room` reads as no room. `apps/server/src/table/index.ts`: export the new types/helpers.
  - **Constraint**: Public tables keep using the table seed exactly as today, so existing seeded tests are unchanged.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, architecture-standards
  - **Dependencies**: Task 1.X (phase 1 docs gate)
  - **Validation**: server typecheck clean; server test 615/615 with no existing test edited; build and lint ok
  - **Status**: ✅ Complete (`roomOf`, `humanSeat`; `STANDING_SEAT`, `ABSENT_SESSION` in types.ts; first private game seeds `${seed}:1`)

- [x] **Task 2.2**: Implement private `join` and `leave` (members, auto-sit, member cap, host rule, no auto-start)
  - **Files**: `apps/server/src/table/seats.ts` (`:17-55`). `join` on private tables: a known `userId` reclaims their seat or member entry (refreshing the name, as today); a newcomer is appended to `members` with `joinedAt = now`, up to `ROOM_MAX_MEMBERS`, else `room_full`; while waiting the newcomer sits in the lowest free seat, standing only when all 4 are taken; during a game the newcomer stands (no `table_full`); the first present member becomes host; never auto-start on four humans. `leave` on private tables: while waiting, remove the member, free their seat, reassign host to the earliest present member; during a game a seated human keeps the reserved seat (null `sessionId`, as today), a standing member is removed, and the host doesn't change.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, code-quality-standards
  - **Dependencies**: Task 2.1
  - **Validation**: server typecheck clean; server test 615/615 with no existing test edited; build and lint ok
  - **Status**: ✅ Complete (new `table/room.ts` holds the membership helpers; a seated member who drops mid-game stays in `members` with `ABSENT_SESSION`; host passes to the earliest present member when the host is removed, including a standing host leaving mid-game)

- [x] **Task 2.3**: Add the `SIT` and `START` intent paths and the private actor lookup
  - **Files**: `apps/server/src/table/intent.ts` (`:32-51`). Actor lookup: on private tables a standing member may send `SIT` only; PLAY, CUT and BACK keep the seated-only check (`not_seated`). `SIT`: validate payload and seat range (`bad_payload`); waiting: target must be empty (`seat_taken`), the actor moves into it (or sits, if standing); playing/between rounds: actor must be standing (`already_seated`) and target a `BotSeat` (`seat_taken`, also for a disconnected human's reserved seat), slot becomes a `HumanSeat` and `refreshTurn` runs (`lifecycle.ts:114-125`). `START`: host only (`not_host`), waiting only (`wrong_phase`), at least one human seated; fills empty seats with `botSeat(i)`, increments `gameNo`, starts the game with the derived seed. Both return `not_private` on public tables.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, security-patterns
  - **Dependencies**: Task 2.2 (membership)
  - **Validation**: server typecheck clean; server test 615/615 with no existing test edited; build and lint ok
  - **Status**: ✅ Complete (START with nobody seated → `wrong_phase`; takeover always calls `refreshTurn`, like reconnect — orchestrator decision, the plan premise that reconnect keeps the pending bot move was wrong)

- [x] **Task 2.4**: Make `tick` skip backfill on private tables and reset a finished private table to the room
  - **Files**: `apps/server/src/table/tick.ts` (`:12-56`). Waiting phase: no backfill for private tables. Finished phase (`:20-21`): for private tables schedule `nextActionAt = finishedAt + ROOM_RESET_MS`; when due reset to `waiting`: clear `game`, `log` and `finishedAt` but keep `seq`; keep connected human seats (clear `missed`/`away`); free seats of disconnected humans and drop them from `members`; empty bot seats; reassign host if needed. `nextWakeAt` covers the reset timer. `apps/server/src/table/lifecycle.ts`: a `resetToRoom(state, now)` helper if it reads better there.
  - **Constraint**: At most one action per `tick` call (the adapter loops). Everyone-disconnected-at-reset must leave a consistent empty room (the empty-table rule then closes the match).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, architecture-standards
  - **Dependencies**: Task 2.2 (members)
  - **Validation**: server typecheck clean; server test 615/615 with no existing test edited; build and lint ok
  - **Status**: ✅ Complete (`resetToRoom(state, room)` in lifecycle.ts; reset scheduled in `applyOutcome`)

- [x] **Task 2.5**: Extend the projection: private label, standing snapshot (`seat: -1`) and `room`
  - **Files**: `apps/server/src/table/projection.ts` (`:12-34`). `label()`: `private: true`, `open: false` for private tables (`:33`). `snapshotFor`: accepts a standing recipient, giving `seat: -1`, `view: null`, and no `PlayerView` built at all; adds `room` for private tables (members in join order with `name`, `seat`, `isHost`; `you` = recipient's index; `scores` from the game or null while waiting; `resetAt` = scheduled reset or null). No user or session ids on the wire. `backfillAt` stays null on private tables. Recipient identified by seat index or by `userId` for standing members (pick a signature that keeps public callers unchanged).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 2.1
  - **Validation**: server typecheck clean; server test 615/615 with no existing test edited; build and lint ok
  - **Status**: ✅ Complete (`snapshotForMember(state, userId, sinceSeq, now)` for private members; `snapshotFor` unchanged and adds `room` on private tables; public snapshots have no `room` key)

- [x] **Task 2.6**: Vitest tables for private join, leave, sit, switch, host and start
  - **Files**: `apps/server/src/table/__tests__/room.test.ts` (new), reusing `apps/server/src/table/__tests__/helpers.ts` (add a `privateTable()` helper there). Cases: auto-sit in lowest free seat, switch, `seat_taken`, standing when 4 seats full, `room_full` at `ROOM_MAX_MEMBERS + 1`, reclaim by `userId`, host by join order and handover on leave in the waiting room, no handover during a game, START by a non-host (`not_host`), with nobody seated, outside waiting (`wrong_phase`), bot fill on start, no auto-start on four humans, no backfill while waiting, `not_private` for SIT/START on a public table, a standing member's PLAY/CUT/BACK → `not_seated`, old state without `room` behaves as public.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 2.3, Task 2.5
  - **Validation**: `room.test.ts` adds 79 tests; server suite passes; no implementation bugs found; helpers.ts unedited
  - **Status**: ✅ Complete

- [x] **Task 2.7**: Vitest tables for reset to the room, second game, takeover and hidden information
  - **Files**: `apps/server/src/table/__tests__/room.test.ts` (or `roomGame.test.ts`, new): a full private game reset after `ROOM_RESET_MS` with seats kept, disconnected humans freed and dropped, bots emptied, `seq` kept and log cleared; a second START deals differently from the first; everyone disconnected at reset. Takeover on a bot's turn where the already-scheduled bot move still happens and the human plays from the next turn; no takeover of a disconnected human's seat; takeover by a seated member → `already_seated`. `apps/server/src/table/__tests__/projection.test.ts`: extend the existing "no other hand or stock" hidden-information assertion to `seat: -1` snapshots; private label (`private: true`, `open: false`, no code in the label text); `room.resetAt` during finished; `backfillAt` null.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, security-patterns
  - **Dependencies**: Task 2.4, Task 2.5
  - **Validation**: `roomGame.test.ts` (29 tests) and 21 additions to `projection.test.ts` (no existing assertion changed); server 745/745; no implementation bugs found
  - **Status**: ✅ Complete (takeover test asserts the fresh-timer behaviour, per orchestrator decision)

- [x] **Task 2.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 2.6, Task 2.7
  - **Validation**: server test 745/745, typecheck, lint (tsc) and build green; existing test assertions unchanged (projection.test.ts additions only; the seats.test.ts diff predates this run)
  - **Status**: ✅ Complete

- [x] **Task 2.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-private-tables-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 2.T
  - **Validation**: Phase 2 section written in the staging file
  - **Status**: ✅ Complete (written by the orchestrator)

**Success criteria**
- Automated: `pnpm --filter @chkobba/server test` passes with the new paths covered; existing public-table tests pass unchanged.
- Manual: core behaviour matches ADR-0002 (members vs seats, host rule, `seat: -1`).

---

## Phase 3: Adapter, RPCs, code storage and rate limits (plan phase 2)

**Overview**: Nakama hosts private tables. A host creates one and gets a code; anyone resolves a live code to a match id, with failed lookups rate-limited per user. Mappings never outlive their table.

- [x] **Task 3.1**: Verify the Nakama 3.40 runtime APIs the RPCs and cleanup rely on
  - **Files**: N/A (research; findings in the task report and the Phase 3 staging notes). Check `apps/server/node_modules/nakama-runtime/index.d.ts` and the Nakama docs (Context7): (a) `nk.storageDelete` signature and its version argument (delete only if it still points to this match); (b) the error thrown by `storageWrite` with `version: '*'` on an existing key, and with a stale version; (c) whether `storageDelete`/`storageRead` work inside `matchTerminate` during the grace period and when `matchLoop` returns null; (d) `nk.matchCreate(module, params)` param passing to `matchInit`; (e) `nk.matchGet` result for an ended match and its `label` field; (f) `ctx.userId` in an RPC called with `http_key` only vs a session token; (g) `nk.uuidv4()` format, to derive bytes.
  - **Assigned Agent**: web-search-researcher (Tier 3 - Research/Exploration)
  - **Skills**: None
  - **Dependencies**: Task 2.X (phase 2 docs gate)
  - **Validation**: (a)-(g) answered from `node_modules/nakama-runtime/index.d.ts` (nakama-common v1.47.0) and Heroic Labs docs; runtime behaviour items left UNVERIFIED go to the live checks in 3.8
  - **Status**: ✅ Complete (orchestrator decisions: `nk.secureRandomBytes` instead of `uuidv4` bytes; string-only `matchCreate` params; re-read on any write error; `matchGet` in try/catch; cleanup read-compare-delete in both `matchLoop` and `matchTerminate`)

- [x] **Task 3.2**: Implement the pure room-code generator and rate-limit window helpers
  - **Files**: `apps/server/src/rpc/roomCode.ts` (new): `generateRoomCode(nextByte: () => number)` mapping bytes onto `ROOM_CODE_ALPHABET` (32 symbols, so `byte & 31` has no modulo bias), and `uuidBytes(uuid)` turning a `nk.uuidv4()` string into a byte source (two uuids if more bytes are needed). `apps/server/src/rpc/roomLimits.ts` (new): pure fixed-window checks over `RoomLimitsRecord` (`checkLookup`, `recordLookupFailure`, `checkCreate`, `recordCreate`) with defaults 10 failed lookups / 10 min and 5 creates / 10 min, `now` injected.
  - **Constraint**: No `Math.random`, no `nkruntime` imports here.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 3.1
  - **Validation**: server typecheck, lint and test (14 files, 781) pass; `roomCode.test.ts` covers byte vectors, all 256 bytes, window boundaries and `parseLimits`
  - **Status**: ✅ Complete (`byteSource(buffer)` over `nk.secureRandomBytes` replaces `uuidBytes`; windows reset at exactly `start + LIMIT_WINDOW_MS`)

- [x] **Task 3.3**: Extend the nk fakes with `storageDelete` and private-match support
  - **Files**: `apps/server/src/__tests__/fakes.ts` (`:75-190`): `storageDelete` on the in-memory storage (honouring the version argument as verified in 3.1); `storageWrite` with `version: '*'` failing on an existing key and with a stale version, as the real server does; `matchCreate` keeping `params` so tests can run `matchInit` with them; controls for a dead match (`matchGet` → null), a deterministic `uuidv4`, and an unauthenticated `ctx`.
  - **Constraint**: Keep the in-memory storage opt-in (`useMemoryStorage`) so existing `quickMatch` tests stay valid and unchanged.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 3.1
  - **Validation**: server 781/781 and typecheck clean; no existing test changed
  - **Status**: ✅ Complete (memory storage checks versions and backs `storageDelete`; `createdMatches`, `addMatch`/`killMatch`/`failMatchGet`, `pushRandomBytes`, `useSequentialMatchIds`, `createUnauthenticatedContext`; seeded versions are now `vN`)

- [x] **Task 3.4**: Implement the code-mapping storage helpers
  - **Files**: `apps/server/src/rpc/roomStore.ts` (new): `readCode(nk, code)`, `reserveCode(nk, code, matchId, now, version)` (`version: '*'` for create-if-absent, the stale record's version to overwrite), `deleteCodeIfOwned(nk, code, matchId)` (reads, deletes only when `matchId` matches, try/catch + log), `readLimits`/`writeLimits` for the per-user `private_table/limits` record. All records system- or server-owned, `permissionRead 0`, `permissionWrite 0`; follows the versioned-record pattern in `apps/server/src/rpc/quickMatch.ts:53-75`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 3.2, Task 3.3
  - **Validation**: server typecheck, test 781/781 (no test touched) and build pass; bundle stays ES5
  - **Status**: ✅ Complete (`reserveCode` returns the new version or null instead of a boolean; added `deleteCodeAtVersion`)

- [x] **Task 3.5**: Wire private tables into the match adapter
  - **Files**: `apps/server/src/match/tableMatch.ts`. `matchInit` (`:65-79`): read `params.private` and `params.code` (validated with `isRoomCode`; invalid → public table and a log line) and pass `privateCode` to `createTable`. State load: missing `room` reads as `null` (like `emoteAt`, `:234-235`). `matchJoinAttempt` (`:86-110`) and `admit` (`:274-295`): go through the private `join` path; `room_full` rejects the attempt. `handleMessage` (`:205-224`): route `SIT`/`START` to `intent`. `sendSnapshot` (`:336-345`): also send to connected standing members of a private table via the `seat: -1` projection (today it returns early when the session holds no seat). `terminationReason` (`:369-374`): no finished-linger close for private tables; the empty-table close still applies. Cleanup: before `matchLoop` returns null and in `matchTerminate` (`:164-174`), call `deleteCodeIfOwned` for private tables.
  - **Constraint**: Public tables take exactly today's code paths. Emotes stay relayed to seated sessions only (standing members don't watch the table in v1).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, security-patterns, type-safety-patterns
  - **Dependencies**: Task 3.4
  - **Validation**: server typecheck, test 781/781 (no test touched) and build pass; bundle stays ES5
  - **Status**: ✅ Complete (plus orchestrator security fix: private newcomers must send the room code as join metadata `ROOM_JOIN_CODE_KEY`; mismatch → `room_not_found`; members reclaiming are exempt; `admit` kicks a session with no reservation)

- [x] **Task 3.6**: Implement the `create_private_table` and `join_by_code` RPCs and register them
  - **Files**: `apps/server/src/rpc/privateTable.ts` (new), top-level named functions. `create_private_table`: require `ctx.userId` (else throw `{ message, code: 16 }`); `checkCreate` → `room_rate_limited` (8); up to 5 tries: generate a code from `nk.uuidv4()` bytes, `reserveCode` with `version: '*'`; on conflict read the record and, if its match is dead (`nk.matchGet` null or label not private), overwrite it with its version, else retry; `nk.matchCreate('chkobba_table', { private: true, code })`; write the `matchId` into the record; return `{ matchId, code }`. `join_by_code`: require `ctx.userId`; `normalizeRoomCode` + `isRoomCode` (`room_bad_code`, 3, counts as a failure); `checkLookup` before reading (`room_rate_limited`, 8); missing record or dead match → delete the stale record, count a failure, `room_not_found` (5); success returns `{ matchId }` and does not count. `apps/server/src/main.ts` (`:45-63`): `initializer.registerRpc('create_private_table', …)` and `registerRpc('join_by_code', …)`.
  - **Constraint**: The limits race between parallel calls is accepted (as with `profile/name`). Never return or log the full code list.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, security-specialist, type-safety-patterns
  - **Dependencies**: Task 3.4, Task 3.5 (`matchInit` reads the params)
  - **Validation**: server typecheck, test 781/781 (no test touched) and build pass; bundle stays ES5
  - **Status**: ✅ Complete (placeholder reservation with a 30 s pending grace; both RPCs top-level and registered in `InitModule`)

- [x] **Task 3.7**: Adapter and RPC Vitest tests against the fakes
  - **Files**: `apps/server/src/rpc/__tests__/privateTable.test.ts` (new): create then lookup by another user; collision retry; stale record overwritten on create and deleted on lookup; failed-lookup limit boundary (10th allowed, 11th `room_rate_limited`) and window expiry; create limit; bad code counts as a failure; success doesn't count; unauthenticated calls rejected; normalized input (`k7m-2qx`) resolves. `apps/server/src/match/__tests__/tableMatch.test.ts`: `matchInit` with private params; snapshots reach standing members with `seat: -1` and `view: null`; `room_full` rejection; no finished-linger close on private; mapping deleted on empty close and in `matchTerminate`, and not deleted when it points to another match; old state without `room`. `apps/server/src/rpc/__tests__/quickMatch.test.ts`: `quick_match` never returns a private table.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing, security-patterns
  - **Dependencies**: Task 3.6
  - **Validation**: server 898/898 (15 files), typecheck clean; `privateTable.test.ts` 68, `tableMatch.test.ts` +46, `quickMatch.test.ts` +3; no existing assertion changed; no bugs found
  - **Status**: ✅ Complete

- [x] **Task 3.8**: Rebuild, restart Nakama, confirm the module loads, and run the manual curl checks
  - **Files**: N/A (runtime check; fixes go in the files above if goja rejects something)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 3.7
  - **Validation**: module loads, both RPCs registered, smoke_game ok; code from A resolves for B; 404 after empty close; 429 on 11th failed lookup and 6th create (curl, run by the orchestrator after the debug agent was stopped)
  - **Status**: ✅ Complete (no fixes needed)

- [x] **Task 3.C**: Contract validation: pin the RPC error shapes and the standing snapshot the mobile client will map
  - **Files**: Phase 3 section of `context/docs/2026-10-30-private-tables-docs.md`: exact HTTP status and JSON body for `room_bad_code`, `room_not_found`, `room_rate_limited` and the unauthenticated case; the success bodies of both RPCs (are they JSON strings needing a second parse, as `quick_match`?); one real standing-member snapshot (`seat: -1`) and one seated private snapshot, compared against `packages/protocol/src/testing/roomFixtures.ts`.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 3.8 (RPCs live on local Nakama)
  - **Validation**: error and success bodies pinned in the staging notes; every `message` except the 401 text is in `ROOM_RPC_ERROR_CODES`
  - **Status**: ✅ Complete (live standing-member snapshot deferred to Phase 6 e2e; fixtures unchanged)

- [x] **Task 3.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 3.C
  - **Validation**: pnpm test green (rules 73, protocol 311, server 898, mobile 672), lint and build clean; module loads in Nakama, smoke_game returns a winner
  - **Status**: ✅ Complete

- [x] **Task 3.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-private-tables-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 3.T
  - **Validation**: Phase 3 section written in the staging file
  - **Status**: ✅ Complete (written by the orchestrator)

**Success criteria**
- Automated: server Vitest passes; the module loads in goja.
- Manual: a code created by one user resolves for another; after the table closes the code returns 404; the 11th bad code within 10 min returns 429. Storage and label follow ADR-0002.

---

## Phase 4: Mobile client and services (plan phase 3)

**Overview**: The online client can create, resolve and join private tables, and exposes room state and room actions through `GameClient`. No UI yet.

- [x] **Task 4.1**: Add `createPrivateTable` and `joinByCode` to the online backend
  - **Files**: `apps/mobile/src/online/NakamaGameClient.ts` (`OnlineBackend` `:54-61`): add both methods and the `JoinByCodeResult` type. `apps/mobile/src/online/nakama.ts` (`createNakamaBackend`): call the RPCs over the shared session; validate responses (the match-id pattern already used for `quickMatch`, `isRoomCode`); map RPC error messages to `JoinByCodeResult` reasons using the shapes pinned in Task 3.C (`room_not_found` → `not_found`, `room_bad_code` → `bad_code`, `room_rate_limited` → `rate_limited`, anything else → `network`). `createPrivateTable` failures surface as typed errors (`room_rate_limited` or `network`).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, security-patterns
  - **Dependencies**: Task 3.X (phase 3 docs gate), Task 3.C (error contract)
  - **Validation**: mobile typecheck and lint pass; mobile tests 672 pass (1 known failure: LobbyScreen "coming soon", fixed in 5.9)
  - **Status**: ✅ Complete (RPCs in a separate `PrivateTableBackend`; `getOnlineBackend()` returns `OnlineBackend & PrivateTableBackend`; `CreatePrivateTableError` in `online/roomErrors.ts`; `joinByCode` rejects invalid input locally as `bad_code`)

- [x] **Task 4.2**: Teach the snapshot decoder about `room` and `seat: -1`
  - **Files**: `apps/mobile/src/online/protocol.ts` (`:226-249`): the decoder rebuilds the snapshot from known fields only, so add `room` explicitly. Validate `RoomInfo` (code via `isRoomCode`, members array of `{ name, seat 0-3 | null, isHost }` up to `ROOM_MAX_MEMBERS`, `you` in range, `scores` null or two numbers, `resetAt` null or number). Accept `seat: -1` only together with a valid `room` and `view: null`; otherwise keep today's 0-3 check (`:230`). New error codes come in through the shared `ERROR_CODES` list (`:245-249`).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, security-patterns
  - **Dependencies**: Task 3.X (phase 3 docs gate)
  - **Validation**: mobile typecheck and lint pass; mobile tests 672 pass (1 known failure: LobbyScreen "coming soon", fixed in 5.9)
  - **Status**: ✅ Complete (a snapshot with a `room` key must carry a valid room; seat -1 only with `room` and `view: null`)

- [x] **Task 4.3**: Add `RoomState` and the room actions to the `GameClient` contract
  - **Files**: `apps/mobile/src/game/GameClient.ts`: `RoomState` from the plan, `OnlineInfo.room?: RoomState`, optional `sit?(seat: Seat)` and `startGame?()`. Add a per-game key (for example `OnlineInfo.gameKey`, bumped on each reset to waiting) so `GameTable` can remount per game. `apps/mobile/src/game/LocalGameClient.ts`: no behaviour change (fields absent).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, design-patterns
  - **Dependencies**: Task 3.X (phase 3 docs gate)
  - **Validation**: mobile typecheck and lint pass; mobile tests 672 pass (1 known failure: LobbyScreen "coming soon", fixed in 5.9)
  - **Status**: ✅ Complete (`OnlineInfo.room?`, optional `gameKey?` — absent reads as 0)

- [x] **Task 4.4**: Map room state in `NakamaGameClient` and reset it when a private table returns to the room
  - **Files**: `apps/mobile/src/online/NakamaGameClient.ts` (snapshot mapping `:360-388`, join retry `:286-299`). Map `room` → `OnlineInfo.room` (`mySeat` from `seat` / `-1` → null, `amHost` from `members[you]`, `resetAt` converted from server to local clock like other server times). `sit(seat)` sends `OpCode.SIT` with `{ seat }`; `startGame()` sends `OpCode.START`. On a private snapshot with phase `waiting` after a game: set `started` back to false (today it becomes true once and never goes back, `:369-372`), clear the previous `view` (today a null view keeps the last one), clear the local log, bump the game key. Keep filtering the log on `seq > lastSeq` (`:364`). Skip the `table_full` quick-match retry for private tables (they fail with `room_full`).
  - **Constraint**: Quick-match behaviour and public snapshots are unchanged.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, architecture-standards
  - **Dependencies**: Task 4.1, Task 4.2, Task 4.3
  - **Validation**: mobile typecheck and lint pass; mobile tests 672 pass (1 known failure: LobbyScreen "coming soon", fixed in 5.9)
  - **Status**: ✅ Complete (`NakamaGameClientOptions.privateCode` sends `{ code }` join metadata on every join; `room_not_found`/`room_full` join refusals are fatal; reset to waiting clears `started`, view and log, bumps `gameKey`)

- [x] **Task 4.5**: Add the share-link helper and the `EXPO_PUBLIC_WEB_BASE_URL` setting
  - **Files**: `apps/mobile/src/online/shareLink.ts` (new): `roomShareLink(code)` reads `process.env.EXPO_PUBLIC_WEB_BASE_URL` with literal dot access (the `apps/mobile/src/online/nakama.ts:24-41` pattern, so Expo inlines it); returns `${origin}${ROOM_LINK_PATH}${code}` or null; anything that isn't an `http:`/`https:` origin with no path, query or hash gives null; plain http allowed (LAN). `apps/mobile/.env.example`: document the variable with a LAN example (`http://192.168.1.20:8081`).
  - **Constraint**: Don't rely on `URL` features missing on Hermes; a small string parse is fine.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 3.X (phase 3 docs gate)
  - **Validation**: mobile typecheck and lint pass; mobile tests 672 pass (1 known failure: LobbyScreen "coming soon", fixed in 5.9)
  - **Status**: ✅ Complete (`parseWebBase`, `roomShareLink`; `.env.example` documents `EXPO_PUBLIC_WEB_BASE_URL`)

- [x] **Task 4.6**: Jest tests for the decoder, room mapping, reset, room actions, RPC mapping and link helper
  - **Files**: `apps/mobile/src/online/__tests__/protocol.test.ts`: decode the shared fixtures from `@chkobba/protocol/testing` (with and without `room`, seat -1); reject seat -1 without `room` or with a non-null `view`; reject malformed `RoomInfo`. `apps/mobile/src/online/__tests__/NakamaGameClient.test.ts`: `room` mapping and local-clock `resetAt`; the reset to waiting turns `started` false, clears `view` and the log, bumps the game key; `sit`/`startGame` send the right opcodes and payloads; no table-full retry on private. `apps/mobile/src/online/__tests__/nakama.test.ts`: `joinByCode` error mapping for every reason; `createPrivateTable` response validation. `apps/mobile/src/online/__tests__/shareLink.test.ts` (new): unset, malformed, path-bearing, http and https base URLs.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 4.4, Task 4.5
  - **Validation**: protocol 135, NakamaGameClient 132, nakama 115, shareLink 57 (new); no bugs; `@chkobba/protocol/testing` resolves without a jest mapping
  - **Status**: ✅ Complete

- [x] **Task 4.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 4.6
  - **Validation**: mobile 917/918 (only the known LobbyScreen "coming soon" test fails, updated in 5.9); mobile typecheck 0 errors
  - **Status**: ✅ Complete

- [x] **Task 4.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-private-tables-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 4.T
  - **Validation**: Phase 4 section written in the staging file
  - **Status**: ✅ Complete (written by the orchestrator)

**Success criteria**
- Automated: mobile Jest and typecheck pass.
- Manual: quick match and `LocalGameClient` behave as before.

---

## Phase 5: Waiting room and flows (UI, i18n, both layouts) (plan phase 4)

**Overview**: Players create, share, join and run private tables from the app and the web build, on phone and desktop, in `en` and `aeb`.

- [x] **Task 5.1**: Extract the first-visit name gate from `FindingPlayers` into a shared `NameGate`
  - **Files**: `apps/mobile/src/components/lobby/NameGate.tsx` (new): the `Gate` states (loading, failed with `SearchFailed`-style retry, name with `NameForm`, ready) and `submitName`, from `apps/mobile/src/components/lobby/FindingPlayers.tsx:20-121`, wrapping arbitrary `children` (rendered once the name is picked) with an `onCancel`. `FindingPlayers.tsx`: use `NameGate` around `QuickMatch`.
  - **Constraint**: `/finding` behaves exactly as before; the existing `FindingPlayers.test.tsx` passes unchanged. The gate follows ADR-0001 (Continue always calls `setDisplayName`).
  - **Assigned Agent**: code-refactor (Tier 5 - Refactoring)
  - **Skills**: architecture-standards, code-quality-standards
  - **Dependencies**: Task 4.X (phase 4 docs gate)
  - **Validation**: no type errors in NameGate/FindingPlayers; `FindingPlayers.test.tsx` 47/47 unchanged (run by the orchestrator; the agent had no shell)
  - **Status**: ✅ Complete (`NameGate({ profile, onCancel, loadingFallback, children })`; `SearchFailed` and `ActionButton` moved into NameGate.tsx and exported)

- [x] **Task 5.2**: Add the `room.*`, `lobby.private`, `lobby.joinCode` and error keys in both catalogs, and the error mapping
  - **Files**: `apps/mobile/src/i18n/locales/en.ts` and `apps/mobile/src/i18n/locales/aeb.ts`: `room.*` (title, code label, share, copy, copied, link-unavailable hint, seats, team labels, host, standing, sit, switch, start, start hint, take over, waiting for game end, back to room in `{{seconds}}`, leave), `lobby.private`, `lobby.joinCode` (title, placeholder, join, invalid), and `errors.*` for `room_not_found`, `room_rate_limited`, `room_bad_code`, `room_full`, `not_host`, `seat_taken`, `already_seated`, `not_private`. `apps/mobile/src/online/messages.ts` (`KNOWN_ERRORS` `:6-17`): append the new codes so `onlineErrorMessage` / `actionErrorMessage` localize them.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: documentation-standards (i18n conventions in `docs/how-to/add-a-language.md`; follow it)
  - **Dependencies**: Task 4.X (phase 4 docs gate)
  - **Validation**: mobile typecheck, i18n tests and full mobile suite (672) pass; catalog diffs are additions only
  - **Status**: ✅ Complete (`lobby.private` kept as the tile title string; added `lobby.privateCreate`, `lobby.privateSubtitle`, `room.shareMessage`; start hint split host/guest; `KNOWN_ERRORS` built from `ERROR_CODES` + `ROOM_RPC_ERROR_CODES`)

- [x] **Task 5.3**: Implement share and copy with the plain-http fallback, and decide on `expo-clipboard`
  - **Files**: `apps/mobile/src/online/shareRoom.ts` (new, plus `shareRoom.web.ts` if the platform split reads better): native uses React Native `Share` with the link (or the code alone when `roomShareLink` is null); web uses `navigator.share`, then `navigator.clipboard.writeText`, each only behind `window.isSecureContext` and feature checks; returns `'shared' | 'copied' | 'unavailable'` so the UI shows the code and link as selectable text in the LAN `http` case. Default: do **not** add `expo-clipboard` (native Share covers copy). If native copy is wanted anyway, `pnpm --filter @chkobba/mobile exec expo install expo-clipboard`, then confirm `pnpm-lock.yaml` resolves no `@babel/core@8` (else restore the lockfile and reinstall).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, accessibility-compliance
  - **Dependencies**: Task 4.X (phase 4 docs gate)
  - **Validation**: `shareRoom.test.ts` 17/17; lint clean; own files typecheck
  - **Status**: ✅ Complete (`shareRoom`, `copyRoomCode`, `roomShareText`; one file branching on `Platform.OS`; no `expo-clipboard` added)

- [x] **Task 5.4**: Implement `useRoomController(client)`, the room logic shared by both layouts
  - **Files**: `apps/mobile/src/game/useRoomController.ts` (new): seat states (empty, me, human, bot, host, team 0+2 vs 1+3), standing list, can-sit / can-switch / can-start (host, waiting, at least one human seated) / can-take-over (standing, in game, bot seat), `sit`, `start`, `takeOver`, the share action from Task 5.3, the reset countdown from `room.resetAt` (reuse `apps/mobile/src/game/useCountdown.ts`), and action errors through `actionErrorMessage`.
  - **Constraint**: No layout code; both layouts and tests consume this hook (same rule as `useTableController`).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, design-patterns, type-safety-patterns
  - **Dependencies**: Task 5.3
  - **Validation**: mobile `tsc --noEmit` and eslint clean
  - **Status**: ✅ Complete (`useRoomController(client): RoomController | null`; added `RoomState.myIndex` from the server `you` so every member gets `isMe`)

- [x] **Task 5.5**: Build the `PrivateRoom` view for phone and desktop
  - **Files**: `apps/mobile/src/components/room/PrivateRoom.tsx` (new), plus `RoomSeat.tsx` and `RoomCode.tsx` (new) in the same folder: the code in large type wrapped in an LTR isolate (`DirectionView dir="ltr"`) so `K7M2QX` never mirrors, with Share/Copy or selectable code and link text when sharing is unavailable; the 4 seats arranged as at the table (names, bot marker, host crown, team colour, tap to sit or switch); the standing list; Start for the host only, with the start hint; Leave; during a game for standing members: team scores, "Take over" on bot seats, "Waiting for this game to end". Layout via `useLayout()` (`apps/mobile/src/layout.ts`): stacked below 900 px; desktop has the seat diamond centred with code and actions alongside. Skins: `useSkin()` tokens and slots (`Panel`, `Avatar`), `marginStart`/`marginEnd`. If team colour or crown needs a token, add it once to `apps/mobile/src/skins/types.ts` with a value in each of `apps/mobile/src/skins/{cafe/index.ts,minimal/index.tsx,sahara/index.ts,sidi/index.ts,neon/index.ts}`.
  - **Constraint**: No per-skin layout fork. All text via `const tr = useT()`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, code-quality-standards, i18n-patterns (auto-active; per `docs/how-to/add-a-language.md`)
  - **Dependencies**: Task 5.2 (keys), Task 5.4 (controller)
  - **Validation**: mobile typecheck and lint pass; mobile 954/955 (known LobbyScreen failure)
  - **Status**: ✅ Complete (`PrivateRoom({ room, onLeave })`, `RoomSeat`, `RoomCode`; no new skin tokens (reuses `us`/`them`, `plate*`, `tag*`); `crown` and `bot` icons in LobbyIcons)

- [x] **Task 5.6**: Turn the home "Soon" tile into "Create private table" and add "Join with code"
  - **Files**: `apps/mobile/src/app/index.tsx` (`tile-private` at `:125`): the tile navigates to `/private`; a "Join with code" entry opens a sheet. `apps/mobile/src/components/lobby/JoinCodeSheet.tsx` (new, built on `LobbySheet`): code input that uppercases, auto-formats, caps at `ROOM_CODE_LENGTH`, validates with `isRoomCode`, then `router.push('/t/CODE')`. Both layouts (two columns / stacked).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, i18n-patterns (auto-active)
  - **Dependencies**: Task 5.2
  - **Validation**: typecheck and lint pass; LobbyScreen 18/19 — the one failure asserts the old "Soon" private tile and is updated in Task 5.9 (expected behaviour change)
  - **Status**: ✅ Complete (`JoinCodeSheet({ onJoin, onClose, testID? })`; temporary `Href` casts in index.tsx with a TODO, removed in 5.7 once routes regenerate)

- [x] **Task 5.7**: Add the `/private` and `/t/[code]` routes and regenerate typed routes
  - **Files**: `apps/mobile/src/app/private.tsx` (new): `NameGate`, then `createPrivateTable()`, then `router.replace({ pathname: '/t/[code]', params: { code, matchId } })`; errors via `OnlineErrorSheet`. `apps/mobile/src/app/t/[code].tsx` (new): `NameGate`, then `joinByCode(code)` unless a `matchId` param came with it, then a `NakamaGameClient` for that match (shared backend from `apps/mobile/src/online/services.ts`); `not_found` / `rate_limited` / `bad_code` show localized `OnlineErrorSheet` messages; a web reload of `/t/CODE` rejoins the same table through the code (seat reclaimed by `userId`). `apps/mobile/src/app/_layout.tsx`: register the screens if the Stack lists them. Then run `pnpm --filter @chkobba/mobile start` once to regenerate `apps/mobile/.expo/types/router.d.ts`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, i18n-patterns (auto-active)
  - **Dependencies**: Task 5.1 (`NameGate`)
  - **Validation**: typecheck and lint pass; mobile 860/861 (known LobbyScreen failure); typed routes regenerated with `CI=1 timeout 90 expo start --web --port 8099`
  - **Status**: ✅ Complete (temporary `PrivateSessionPending` in `t/[code].tsx`, replaced in 5.8; network failures use the `SearchFailed` retry panel; `index.tsx` casts removed)

- [x] **Task 5.8**: Host the whole private session: room, table, back to room
  - **Files**: `apps/mobile/src/components/room/PrivateSession.tsx` (new), used by `apps/mobile/src/app/t/[code].tsx`: shows `PrivateRoom` while the phase is `waiting` or the member is standing, otherwise `GameTable` keyed on the per-game key from Task 4.3 so `useStagedTable` and round summaries start fresh each game; after a game the final summary stays until `resetAt`, then the room returns automatically; `onNewGame` means "back to room", never `/finding`; fatal errors via `OnlineErrorSheet`. `apps/mobile/src/app/game.tsx` (`OnlineGame` `:72-93`): when the snapshot has `online.room`, render `PrivateSession` instead of `FindingPlayersView` / the `/finding` new-game path; public flow unchanged. `apps/mobile/src/components/GameTable.tsx`: only if a prop is needed for the "back to room" label.
  - **Constraint**: `useTableKeyboard` shortcuts must not fire in the room view (the room never mounts `GameTable`/the keyboard hook; verify).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, i18n-patterns (auto-active)
  - **Dependencies**: Task 5.5, Task 5.7
  - **Validation**: mobile typecheck and lint pass; mobile 1000/1000
  - **Status**: ✅ Complete (`PrivateSession({ client, onLeave })`; table keyed `${gameKey}:${mySeat}`; final summary button = back to room with countdown; `matchId` param cleared after join; optional `newGameLabel` on GameTable and RoundSummary; `game.tsx` unchanged — private clients never reach it)

- [x] **Task 5.9**: RNTL tests for the name gate, join-code input and room controller
  - **Files**: `apps/mobile/src/components/lobby/__tests__/NameGate.test.tsx` (new): gate on first visit only, Continue before children, Cancel, retry. `apps/mobile/src/components/lobby/__tests__/JoinCodeSheet.test.tsx` (new): lowercase/space/dash input normalized, length cap, invalid codes blocked, navigation to `/t/CODE`. `apps/mobile/src/game/__tests__/useRoomController.test.ts` (new): seat states and team pairing, can-start only for the host with a human seated, can-take-over only when standing on bot seats, countdown, share fallback with no base URL and with an insecure context. `apps/mobile/src/components/lobby/__tests__/LobbyScreen.test.tsx`: the private tile and Join with code entry.
  - **Constraint**: `await` every `render`/`fireEvent` (RNTL v14).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.4, Task 5.6, Task 5.7
  - **Validation**: NameGate 17, JoinCodeSheet 21, useRoomController 39, LobbyScreen +6 (and the "Soon" test updated to 2 badges); mobile 1000/1000; no bugs found
  - **Status**: ✅ Complete

- [x] **Task 5.10**: RNTL tests for the room view and the private flows
  - **Files**: `apps/mobile/src/components/room/__tests__/PrivateRoom.test.tsx` (new): sit and switch; Start visible only to the host; host crown handover; standing view with scores and Take over; share fallback renders selectable code and link; code never mirrored and full render with the `aeb` catalog. `apps/mobile/src/components/room/__tests__/PrivateSession.test.tsx` (new): room → table on start, final summary until `resetAt`, then back to the room with a remounted table; "New game" goes back to room, not `/finding`. Route-level flows with a fake backend: create flow (`/private` → `/t/CODE` with `matchId`, no lookup), link flow with the name gate, `not_found` and `rate_limited` messages, web reload of `/t/CODE` mid-game reclaims the same seat.
  - **Constraint**: `await` every `render`/`fireEvent` (RNTL v14).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, accessibility-compliance
  - **Dependencies**: Task 5.8
  - **Validation**: `PrivateRoom` 27, `PrivateSession` 13, `privateRoutes` 14; mobile 1054/1054; typecheck and lint clean; no bugs found. Route tests live in `apps/mobile/src/__tests__/privateRoutes.test.tsx` (not under `src/app`, which expo-router treats as routes).
  - **Status**: ✅ Complete

- [x] **Task 5.V**: Validate the i18n integration of the private-table UI
  - **Files**: `apps/mobile/src/components/room/`, `apps/mobile/src/components/lobby/JoinCodeSheet.tsx`, `apps/mobile/src/components/lobby/NameGate.tsx`, `apps/mobile/src/app/private.tsx`, `apps/mobile/src/app/t/[code].tsx`, `apps/mobile/src/app/index.tsx`, `apps/mobile/src/online/messages.ts`, `apps/mobile/src/i18n/locales/en.ts`, `apps/mobile/src/i18n/locales/aeb.ts`
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration; no i18n-specialist agent exists)
  - **Skills**: code-quality-standards, accessibility-compliance
  - **Dependencies**: Task 5.9, Task 5.10 (all UI implementation tasks)
  - **Validation**: no hard-coded strings; every new error code localized in both catalogs; `marginStart`/`marginEnd` only; `{{seconds}}` and names isolated in RTL; the room code stays LTR; i18n tests pass
  - **Status**: ✅ Complete (all text via `tr`; all 19 `ERROR_CODES` + `ROOM_RPC_ERROR_CODES` client codes in both catalogs; fixed `paddingStart`/`paddingEnd` + `textAlign: 'end'` on the lobby profile pill and `end: -8` on the room crown; room code LTR on display, input and selectable fallback; mobile 1000/1000, typecheck and lint clean)

- [x] **Task 5.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.V (i18n must be valid first)
  - **Validation**: mobile test, typecheck (after typed-route regeneration), lint green; `pnpm test` green; lockfile still Babel 7
  - **Status**: ✅ Complete (`pnpm test` green: rules 73, protocol 311, server 898, mobile 1054 = 2336; `pnpm lint` green in all 4 workspaces; mobile `tsc --noEmit` exit 0; lockfile on `@babel/core@7.29.7`)

- [x] **Task 5.I**: Do the Derja wording pass and flag it for the user's review
  - **Files**: `apps/mobile/src/i18n/locales/aeb.ts` (the `room.*`, `lobby.private`, `lobby.joinCode` and new `errors.*` keys)
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration; no i18n-specialist agent exists)
  - **Skills**: None
  - **Dependencies**: Task 5.T (tests must pass first)
  - **Validation**: typecheck and tests green; changed strings listed in the task report; user review recorded
  - **Status**: ✅ Complete (reviewed `room.*`, `lobby.private*`, `lobby.joinCode*`, new `errors.*`; changed `lobby.joinCode.invalid` and `errors.room_bad_code` from `الكود فيه 6 حروف وأرقام.` to `الكود لازمو 6 حروف وأرقام.`; remaining keys kept and listed for user sign-off — the user signed off on all of it on 2026-10-31, so the wording stands as written)

- [x] **Task 5.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-private-tables-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 5.I
  - **Validation**: Phase 5 section written in the staging file
  - **Status**: ✅ Complete (Phase 5 section written in the staging file: components, i18n audit fixes, Derja pass, 54 new tests, workspace counts)

- [ ] **Task 5.U**: Validate the private-table flows in the browser at desktop and phone widths, in both languages
  - **Files**: N/A (Playwright validation against `pnpm --filter @chkobba/mobile start` web at `http://localhost:8081` and local Nakama, `EXPO_PUBLIC_WEB_BASE_URL` set to the local web address)
  - **Assigned Agent**: ui-explorer (Tier 4 - UI Validation)
  - **Skills**: accessibility-compliance
  - **Dependencies**: Task 5.X
  - **Validation**: at 1280 px and 390 px, in `en` and `aeb`, with three browser windows: create and join by code, then by link; switch seats; start with one bot and finish a game, back in the room with the same code; the host leaves the room and the crown moves; a third window takes over the bot seat mid-game; plain-http share falls back to selectable code and link; no keyboard shortcuts fire in the room
  - **Status**: ⚠️ Partial — not ticked. The first pass (ui-explorer) was invalid: `apps/mobile/.env.local` beats shell `EXPO_PUBLIC_*`, so it was driving the developer's live Nakama on `:7350`, not the test stack; its "strangers joining" and unstarted game were its own windows there. Re-ran with `.env.local` parked and the served bundle checked for `127.0.0.1:17350` only (and `create_private_table` confirmed in the test stack's log, not the live one). Verified: 1280 and 390 px in `en` and `aeb` (root `dir=rtl`, room code `direction: ltr` with `unicode-bidi: isolate`, no horizontal overflow at 390); create → code `4DG5Q4`; join by code on a second origin; seat switch agreed by both clients; host start filling two bot seats; a third player joining mid-game sees the standing view (`seat -1`, scores, "Waiting for this game to end…", no hand) and takes over a bot seat with its hand and log; no console errors beyond a stale cached Nakama session on reused origins. Still unverified in the browser: playing a game to the end and watching the reset (server behaviour covered by the 6.2 e2e), the crown moving when the host leaves the room (covered by the e2e), the secure-context Share path on `localhost`, and that room keyboard shortcuts are inert. The env gotcha is now documented in `docs/how-to/local-backend.md`.

**Success criteria**
- Automated: mobile Jest, typecheck and lint pass.
- Manual: the Task 5.U scenarios; the user reviewed the Derja strings from 5.I; the name gate is reused as in ADR-0001.

---

## Phase 6: End-to-end check (plan phase 5)

**Overview**: Prove the private flow on real Nakama with several clients, without lengthening the default run much.

- [x] **Task 6.1**: Extend the e2e script with a private-table scenario and an optional `--full` flag
  - **Files**: `apps/server/scripts/e2e.ts`: A creates and gets a code; B joins by code, both get room snapshots; B switches seats; A leaves the waiting room and the host passes to B; A rejoins as a member; B starts, bots fill, the game begins; C joins by code mid-game, gets a standing snapshot with no `view`, takes over a bot seat, plays its turns; everyone leaves and after `EMPTY_TIMEOUT_MS` the code returns `room_not_found`; bad codes return `room_bad_code`; the limit returns `room_rate_limited` (fresh device ids per run). `--full`: play the private game to the end and assert the reset to the room keeps code and seats. The existing quick-match scenario stays unchanged.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.U (phase 5 complete; Task 5.X is its docs gate)
  - **Validation**: server typecheck (including `scripts/tsconfig.json`) passes
  - **Status**: ✅ Complete (private scenario in `apps/server/scripts/e2e.ts`: create/lookup, seat switch, host handover, rejoin, start with bots, standing mid-game join, take-over, rate limits, empty-table close; `--full` plays to the end and checks the reset and a second deal; flags `--private-only`, `--quick-only`, `--full`; `scripts/tsconfig.json` typecheck clean)

- [x] **Task 6.2**: Run the extended e2e against Docker Nakama, with and without `--full`, and fix any failures
  - **Files**: N/A (runtime; fixes go in the server core, adapter, RPCs or the e2e script)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 6.1
  - **Validation**: after build and `docker compose restart nakama`: `pnpm --filter @chkobba/server e2e` passes; `pnpm --filter @chkobba/server e2e -- --full` passes; run times recorded
  - **Status**: ✅ Complete (ran against a throwaway Nakama 3.40 test stack on port 17350 so the user's live server on 7350 was untouched; same module bundle. Short private run PASSED in 75 s; `--full` PASSED in 584 s: 10 rounds, team 1 won 19-21, back in the room 15.0 s after game over with seats kept and bot seat 3 emptied, second game started with a different deal, code 404 62 s after everyone left. No fixes needed)

- [x] **Task 6.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 6.2
  - **Validation**: `pnpm test` and `pnpm lint` green after any 6.2 fixes
  - **Status**: ✅ Complete (6.2 needed no code fixes; `pnpm test` green: rules 73, protocol 311, server 898, mobile 1054; `pnpm lint` green in all 4 workspaces)

- [x] **Task 6.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-private-tables-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 6.T
  - **Validation**: Phase 6 section written in the staging file
  - **Status**: ✅ Complete (Phase 6 section written in the staging file with both run results and timings)

**Success criteria**
- Automated: `pnpm --filter @chkobba/server e2e` passes, with and without `--full`; the public scenario is unchanged.
- Manual: none.

---

## Phase 7: Finalization (plan phase 6)

**Overview**: The docs match the shipped behaviour, ADR compliance is confirmed, and the staging notes are merged.

- [x] **Task 7.1**: Update the wire protocol reference
  - **Files**: `docs/reference/wire-protocol.md`: `SIT` and `START` opcodes; the new error codes; `Snapshot.room` and `seat: -1`; `create_private_table` and `join_by_code` with request/response and the HTTP statuses pinned in Task 3.C; the `private_table/<code>` and `private_table/limits` records and their permissions; `ROOM_RESET_MS`, `ROOM_MAX_MEMBERS`, the code alphabet and length; the private label (`private: true`, `open: false`).
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 6.X (phase 6 docs gate)
  - **Validation**: every item listed is documented and matches the code
  - **Status**: ✅ Complete (`docs/reference/wire-protocol.md`: SIT/START, SitIntent, seat -1, `room`/`RoomInfo`, five new ERROR_CODES, a "Private tables" section with constants, records, both RPCs, the join gate and the live HTTP/gRPC/message table, and the label note; `quick_match` unchanged)

- [x] **Task 7.2**: Add a "Private tables" section to the architecture explanation
  - **Files**: `docs/explanation/multiplayer-architecture.md`: membership vs seats, the host rule, the reset to the room, takeover timing, code lifecycle and cleanup (including the lazy liveness check); link ADR-0002.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 6.X (phase 6 docs gate)
  - **Validation**: section present and links ADR-0002
  - **Status**: ✅ Complete (new "Private tables" section in `docs/explanation/multiplayer-architecture.md`: membership vs seats, host rule, standing members, reset to the room, code lifecycle/cleanup/lazy liveness, join gate and abuse limits; links ADR-0002 and the wire reference)

- [x] **Task 7.3**: Add a LAN private-tables note to the local-backend how-to
  - **Files**: `docs/how-to/local-backend.md`: testing private tables across LAN devices, setting `EXPO_PUBLIC_WEB_BASE_URL` to the LAN web address, and why share/copy fall back to selectable text on plain http. `docs/README.md`: update the index if a new page or section is added.
  - **Constraint**: No deployment or hosting instructions.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 6.X (phase 6 docs gate)
  - **Validation**: note present; matches `apps/mobile/.env.example`
  - **Status**: ✅ Complete ("Private tables on the LAN" in `docs/how-to/local-backend.md` covering `EXPO_PUBLIC_WEB_BASE_URL`, LAN host, create/join and reload behaviour, plus the e2e flags and private scenario; `docs/README.md` row updated)

- [x] **Task 7.4**: Update CLAUDE.md status, Key Patterns and Project Structure
  - **Files**: `CLAUDE.md`: status line for private tables (plan, ADR-0002, docs); Key Patterns: private tables use `room` and members, codes live in storage never in the label, `seat: -1` for standing members, share links need `EXPO_PUBLIC_WEB_BASE_URL`; Project Structure: `app/private.tsx`, `app/t/[code].tsx`, `components/room/`, `rpc/privateTable.ts`.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.1, Task 7.2, Task 7.3
  - **Validation**: CLAUDE.md reflects the shipped behaviour; links resolve
  - **Status**: ✅ Complete (status line, Project Structure entries for `components/room/`, `useRoomController`, `/private`, `/t/[code]` and the new RPCs, and a "Private tables" Key Patterns block; e2e command line updated)

- [x] **Task 7.5**: Verify the implementation follows ADR-0002 (and the ADR-0001 name gate)
  - **Files**: `docs/adr/0002-private-tables-room-codes-and-host-model.md` and `docs/adr/0001-durable-guest-identity-and-display-names.md` against `packages/protocol/src/room.ts`, `apps/server/src/table/`, `apps/server/src/match/tableMatch.ts`, `apps/server/src/rpc/privateTable.ts`, `apps/server/src/rpc/roomStore.ts`, `apps/mobile/src/online/`, `apps/mobile/src/components/lobby/NameGate.tsx`
  - **Assigned Agent**: codebase-analyzer (Tier 3 - Research/Exploration)
  - **Skills**: architecture-decision-records, architecture-standards
  - **Dependencies**: Task 7.4
  - **Validation**: no code in the label; record permissions 0/0; version-checked reservation; cleanup only when the record points to this match; no `PlayerView` for `seat: -1`; host rule as decided; deviations listed and folded into 7.F as ADR amendments
  - **Status**: ✅ Complete (verified: label carries `private: true, open: false` and never the code; `private_table` records 0/0; version-checked reservation; cleanup only at the owning version; standing snapshots keep `view: null`; host stays while a member and passes to the earliest present on leave. ADR-0002 amended in place: join-gate section, create limit, mid-game host handover and two new consequence/alternative rows)

- [x] **Task 7.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 7.5
  - **Validation**: `pnpm build`, `pnpm test`, `pnpm lint` green; Nakama restart loads the module; the 6.2 e2e run stands if nothing under `apps/` or `packages/` changed since, else rerun `pnpm --filter @chkobba/server e2e`
  - **Status**: ✅ Complete — `pnpm build` green (rules, protocol, server Rollup bundle 792 ms, mobile `tsc --noEmit`); `pnpm test` green (rules 73, protocol 311, server 898, mobile 1054); `pnpm lint` green in all 4 workspaces. Module load confirmed without a disruptive restart: `md5sum` of `/nakama/data/modules/build/index.js` inside the running test container equals `apps/server/build/index.js` (`9efc4cd5…`), `create_private_table` calls and live matches appear in its log, and `smoke_game` returns `{"winner":0,"scores":[24,5],"rounds":8,"actions":296}`. Nothing under `apps/` or `packages/` changed since 6.2, so those e2e runs stand.

- [x] **Task 7.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-private-tables-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.T
  - **Validation**: Phase 7 section written in the staging file
  - **Status**: ✅ Complete — Phase 7 section records the 7.1-7.5 doc changes, the ADR-0002 compliance table verified in code, the two recorded deviations (join gate, mid-game host handover) and the 7.T results.

- [x] **Task 7.F**: Merge the staged notes into the permanent Diataxis docs and delete the staging file
  - **Files**: Read `context/docs/2026-10-30-private-tables-docs.md`; classify each section (explanation, how-to, reference); merge whatever 7.1-7.3 didn't already cover into `docs/{explanation,how-to,reference}/`; add any ADR-0002 implementation notes from 7.5; update `docs/README.md`; then delete the staging file.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.X
  - **Validation**: staged content present under `docs/`; `context/docs/2026-10-30-private-tables-docs.md` deleted
  - **Status**: ✅ Complete — everything 7.1-7.3 needed was already merged, so the only residual behaviour (take over behaves like a reconnect; a seated member keeps their reserved seat until the reset; a returning standing member stays standing; emotes need a seat) went into `docs/explanation/multiplayer-architecture.md` "Take over is a reconnect", verified against `apps/server/src/table/seats.ts` `joinRoom`/`leaveRoom`. No other section needed copying: phases 1-6 are implementation history, not Diataxis material. `docs/README.md` already updated; the staging file is deleted.

**Success criteria**
- Automated: `pnpm build`, `pnpm test`, `pnpm lint` and `pnpm --filter @chkobba/server e2e` pass.
- Manual: the docs match the behaviour; ADR-0002 compliance confirmed.

---

## Execution notes

- Execute phases in order (Phase 0, then 1 through 7). Within a phase, respect the dependencies. Each phase's first task depends on the previous phase's `.X` documentation task.
- Parallelism:
  - Phase 1: 1.3 and 1.4 in parallel after 1.2.
  - Phase 2: 2.2 and 2.5 in parallel after 2.1; 2.3 and 2.4 in parallel after 2.2; 2.6 and 2.7 can run in parallel once their inputs land.
  - Phase 3: 3.2 and 3.3 in parallel after 3.1.
  - Phase 4: 4.1 (after 3.C), 4.2, 4.3 and 4.5 in parallel; 4.4 joins them.
  - Phase 5: 5.1, 5.2 and 5.3 in parallel; 5.6 after 5.2 and 5.7 after 5.1 can run alongside 5.4/5.5.
  - Phase 7: 7.1, 7.2 and 7.3 in parallel.
- User gates: the Derja wording review (5.I); the manual browser runs (5.U); the native device joining by code (plan "Manual" testing) is optional and LAN-only.
- No deployment or hosting tasks: testing stays on the LAN until the user asks.
- Get manual verification confirmation between phases.
- Use the Write/Edit tools for all file operations (never `cat`).
