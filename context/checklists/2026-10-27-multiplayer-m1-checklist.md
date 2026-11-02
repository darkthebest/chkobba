# Checklist: Multiplayer milestone 1, "online table works"

**Ticket**: TBD
**Generated from**: `context/plans/2026-10-27-multiplayer-m1.md`
**Generated at**: 2026-10-28
**Branch**: `feature/2026-10-27-multiplayer-m1`

## Phase mapping

The plan numbers its phases 0-4. This checklist reserves Phase 0 for preflight, so:

| Checklist phase | Plan phase |
|---|---|
| Phase 0: Preflight | (orchestrator) |
| Phase 1: Infrastructure | 0. Infrastructure |
| Phase 2: Table core (pure, Vitest) | 1. Table core |
| Phase 3: Nakama adapter | 2. Nakama adapter |
| Phase 4: Client | 3. Client |
| Phase 5: End-to-end verification + final docs | 4. End-to-end verification |

## Agent Registry

| Agent | Tier | Assigned Tasks |
|---|---|---|
| orchestrator (execute-plan) | n/a | 0.1 |
| general-purpose | Tier 3 - Research/Exploration (used as implementer; no dedicated TS/Nakama/Expo developer agent exists) | 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 4.1, 4.3, 4.4, 4.5, 4.7, 4.8, 4.9, 4.10, 5.1 |
| test-specialist | Tier 2 - Domain Specialist | 1.T, 2.6, 2.7, 2.T, 3.4, 3.T, 4.2, 4.6, 4.11, 4.T, 5.T |
| debug-specialist | Tier 2 - Domain Specialist | 5.2 |
| ui-explorer | Tier 4 - UI Validation | 4.U, 5.3 |
| docs-maintainer | Always Available | 1.X, 2.X, 3.X, 4.X, 5.X, 5.F |

**Notes on assignment**
- No i18n system or `i18n-specialist` agent exists in this repo, so no X.V / X.I tasks are generated. New UI strings ("Finding players...", "Reconnecting...", away/disconnected badges) are plain strings, matching the existing lobby and table.
- No ADRs are referenced in the plan, so there is no ADR compliance task.
- Cross-app contract: `apps/server` and `apps/mobile` must not import from each other (CLAUDE.md). The wire protocol (opcodes, SNAPSHOT/ERROR payloads) therefore lives in a shared `packages/protocol` (`@chkobba/protocol`) that both apps depend on (user decision 2026-10-28). Task 4.2 checks the client decodes a real server snapshot.

## Global constraints (apply to every task)

- `packages/rules` stays pure: no Nakama, React Native, or I/O imports; ES2017 lib only; no `Proxy`, no `Math.random`.
- `apps/server` bundles to a single ES5 script via Rollup + Babel (`apps/server/rollup.config.mjs`). No runtime `require`, keep the global `InitModule`. After any build change, verify the module loads in the Nakama container.
- Server is authoritative: never send another seat's hand or the stock to a presence. Each presence only gets its own `viewFor(state, seat)`.
- Server bots use level `normal`.
- Keep the whole workspace on Babel 7. Do not add Babel 8 packages. If the lockfile re-resolves and mobile tests break, restore `pnpm-lock.yaml` and reinstall.
- Mobile: game/table logic goes in `useTableController`, never in `DesktopLayout`/`PhoneLayout`. Never fork layouts per skin; add a token or slot. RNTL v14 `render`/`fireEvent` must be awaited.
- `LocalGameClient` (offline) behaviour must be unchanged.

---

## Phase 0: Preflight

- [x] **Task 0.1**: Mark ticket as In Progress
  - **Files**: N/A (issue tracker — ref from the checklist's `**Ticket**` header line)
  - **Assigned Agent**: orchestrator (execute-plan runs this directly — NOT a sub-agent)
  - **Skills**: None
  - **Dependencies**: None
  - **Validation**: Linked issue shows In Progress (skipped with a note if no ticket ref yet)
  - **Status**: ✅ Skipped (no ticket linked)

---

## Phase 1: Infrastructure (plan phase 0)

**Overview**: Most of this phase already landed (commits `0308edd`, `623ea0b`, `27ab720`): `docker-compose.yml` with pinned `postgres:16-alpine` and `heroiclabs/nakama:3.40.0` plus a migrate entrypoint, `apps/server` with `package.json`, `tsconfig.json`, `rollup.config.mjs` (Babel config inline), `local.yml` (`runtime.js_entrypoint: build/index.js`), and the `smoke_game` RPC. Remaining: reconcile against the plan and add the `Dockerfile`.

- [x] **Task 1.1**: Reconcile existing infrastructure against the plan and confirm goja compatibility of the bundled engine
  - **Files**: modified `apps/server/package.json` (nakama-common v1.46.0 → v1.47.0, required by Nakama 3.40.0), `pnpm-lock.yaml`; others verified unchanged
  - **Constraint**: Confirm `nakama-runtime` (`github:heroiclabs/nakama-common#v1.46.0`) matches the Nakama 3.40 compatibility matrix in the release notes. The plan lists a separate `babel.config.json`; the inline Babel config in `rollup.config.mjs` satisfies that intent, so do not add a duplicate config file.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, code-quality-standards
  - **Dependencies**: Task 0.1
  - **Validation**: ✓ build + typecheck; module loaded, no goja errors; smoke `{"winner":0,"scores":[21,11],"rounds":7,"actions":259,"ms":102}`
  - **Status**: ✅ Complete

- [x] **Task 1.2**: Add a `Dockerfile` with a Node build stage that produces `build/index.js` and copies it plus `local.yml` into the pinned Nakama image
  - **Files**: `apps/server/Dockerfile` (new, node:24.21.0-bookworm-slim → heroiclabs/nakama:3.40.0, isolated-linker filtered install), `.dockerignore` (new); docker-compose.yml untouched
  - **Constraint**: Build context must include `packages/rules` and the pnpm workspace files; pin the Node and Nakama image tags.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, security-patterns
  - **Dependencies**: Task 1.1
  - **Validation**: ✓ image builds; test container logged "Chkobba module loaded", smoke on :17350 returned a winner; compose smoke on :7350 still works
  - **Status**: ✅ Complete

- [x] **Task 1.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist) — run directly by orchestrator
  - **Skills**: testing-patterns
  - **Dependencies**: Task 1.2
  - **Validation**: ✓ rules 73/73, mobile 29/29, server (no tests yet); lint ✓; build ✓
  - **Status**: ✅ Complete

- [x] **Task 1.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-27-multiplayer-m1-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available) — written by orchestrator (execute-plan Step 4.7)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 1.T
  - **Validation**: ✓ Phase 1 section written
  - **Status**: ✅ Complete

**Success criteria**
- Automated: `pnpm test`, `pnpm lint`, `pnpm build` pass; Docker image builds.
- Manual: `docker compose up` loads the module (`InitModule` log line); `smoke_game` RPC plays a full bot game.

---

## Phase 2: Table core, pure and tested in Vitest (plan phase 1)

**Overview**: A pure `apps/server/src/table/` module that owns seats, timers, bot turns, backfill, reconnect and projections. No `nkruntime` imports. Time is always passed in (`now`), seeds are passed in. This is what the Nakama handler wraps in Phase 3.

- [x] **Task 2.1**: Define the wire protocol and `TableState` types plus a `createTable` constructor
  - **Files**: `packages/protocol/` (new workspace package `@chkobba/protocol`: `package.json`, `tsconfig.json`, `src/index.ts`; types + constants only, depends on `@chkobba/rules` for `PlayerView`/event types; user decision 2026-10-28) — opcodes `PLAY=1`, `CUT=2`, `BACK=3`, `SNAPSHOT=100`, `ERROR=101`, payload types (`{ cardId, capture }`, `{ keep }`, snapshot `{ view, players, log, turnDeadline, phase }`, `{ code }`), error codes; `apps/server/src/table/types.ts` (new) — `TableState` (`game: GameState | null`, seats `{ userId, sessionId, name, bot, connected, away, missed }`, `createdAt`, `turnDeadline`, `phase: 'waiting' | 'playing' | 'between' | 'finished'`, log `seq` counter), timing constants (backfill 15 s, play 20 s, cut 10 s, bot pace ~1 s, next round ~8 s, away after 2 misses); `apps/server/src/table/index.ts` (new) — barrel
  - **Constraint**: No `nkruntime` references; ES5-bundlable (no `.at()`, `Object.hasOwn`, `Proxy`). `apps/server` adds `@chkobba/protocol` as a workspace dependency and the Rollup bundle must still produce a single file.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, architecture-standards, design-patterns
  - **Dependencies**: Task 1.X
  - **Validation**: `pnpm --filter @chkobba/server typecheck`
  - **Status**: ✅ Complete (2.1–2.5 delegated together to one general-purpose agent; server + protocol typecheck ✓, ES5 bundle ✓, existing tests ✓)

- [x] **Task 2.2**: Implement `join` and `leave` reducers
  - **Files**: `apps/server/src/table/seats.ts` (new) — `join` claims a free seat or reclaims the seat reserved for the same `userId` (updating `sessionId`, `connected: true`); `leave` sets `connected: false` so a bot plays that seat; start the game immediately when 4 humans are seated (seed passed in)
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, code-quality-standards
  - **Dependencies**: Task 2.1
  - **Validation**: `pnpm --filter @chkobba/server typecheck`
  - **Status**: ✅ Complete (2.1–2.5 delegated together to one general-purpose agent; server + protocol typecheck ✓, ES5 bundle ✓, existing tests ✓)

- [x] **Task 2.3**: Implement the `intent` reducer (PLAY / CUT / BACK) validated through the engine
  - **Files**: `apps/server/src/table/intent.ts` (new) — checks seat, phase and turn, then `applyMove` / `applyCut` from `@chkobba/rules`; appends public events to the log with `seq`; resets `missed`; `BACK` clears `away`; returns an error code for illegal or out-of-turn intents without mutating state
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 2.2
  - **Validation**: `pnpm --filter @chkobba/server typecheck`
  - **Status**: ✅ Complete (2.1–2.5 delegated together to one general-purpose agent; server + protocol typecheck ✓, ES5 bundle ✓, existing tests ✓)

- [x] **Task 2.4**: Implement `tick(now)`: backfill, turn timers, bot turns, auto next round, finish
  - **Files**: `apps/server/src/table/tick.ts` (new) — backfill empty seats with bots at `createdAt + 15 s`; set `turnDeadline` (20 s play / 10 s cut); on timeout a `normal` bot plays the turn and increments `missed`; at 2 consecutive misses mark `away` and keep auto-playing until the player acts; disconnected and away seats and bot seats played at ~1 s pacing; `startNextRound` ~8 s after round summary (`between` phase); `finished` at game over
  - **Constraint**: Bots receive only `viewFor(state, seat)`; use `createBot('normal', seat)` and `chooseCut`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: design-patterns, type-safety-patterns
  - **Dependencies**: Task 2.3
  - **Validation**: `pnpm --filter @chkobba/server typecheck`
  - **Status**: ✅ Complete (2.1–2.5 delegated together to one general-purpose agent; server + protocol typecheck ✓, ES5 bundle ✓, existing tests ✓)

- [x] **Task 2.5**: Implement projections `snapshotFor(state, seat, sinceSeq)` and `label(state)`
  - **Files**: `apps/server/src/table/projection.ts` (new) — snapshot carries that seat's `PlayerView`, players (name, isBot, away, connected), log delta only (not the full log), `turnDeadline` epoch ms, `phase`; `label()` returns JSON `{ open, mode: '2v2', seatsFree, private: false }`
  - **Constraint**: Never include another seat's hand or the stock.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 2.4
  - **Validation**: `pnpm --filter @chkobba/server typecheck`
  - **Status**: ✅ Complete (2.1–2.5 delegated together to one general-purpose agent; server + protocol typecheck ✓, ES5 bundle ✓, existing tests ✓)

- [x] **Task 2.6**: Write Vitest tests for seats, timers and reconnect
  - **Files**: `apps/server/src/table/__tests__/seats.test.ts` (new), `apps/server/src/table/__tests__/tick.test.ts` (new), `apps/server/src/table/__tests__/helpers.ts` (new, fake clock + fixed seed)
  - **Constraint**: Cover: backfill fires at 15 s and not before; 4 humans start immediately; timeout -> bot plays -> 2 misses -> away -> BACK clears it; disconnect/reconnect by `userId` keeps the seat.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 2.5
  - **Validation**: `pnpm --filter @chkobba/server test`
  - **Status**: ✅ Complete (seats.test.ts 25, tick.test.ts 36, helpers.ts; 61 passing; no src bugs found)

- [x] **Task 2.7**: Write Vitest tests for intents, hidden-info leakage and a full simulated game
  - **Files**: `apps/server/src/table/__tests__/intent.test.ts` (new), `apps/server/src/table/__tests__/projection.test.ts` (new), `apps/server/src/table/__tests__/fullGame.test.ts` (new)
  - **Constraint**: Cover: illegal / out-of-turn / wrong-seat intents rejected; no snapshot for seat N contains another seat's hand or the stock (check serialized JSON, including a kept cut card); log is a delta; `label()` reflects seats/phase; a full game driven by `tick` reaches `finished`.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, security-patterns
  - **Dependencies**: Task 2.5
  - **Validation**: `pnpm --filter @chkobba/server test`
  - **Status**: ✅ Complete (intent 71, projection 33, fullGame 20; no src bugs found)

- [x] **Task 2.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 2.6, Task 2.7
  - **Validation**: `pnpm test`, `pnpm lint`, `pnpm build`
  - **Status**: ✅ Complete (run by orchestrator: rules 73, server 185, mobile 29; lint/typecheck/build ✓)

- [x] **Task 2.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-27-multiplayer-m1-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 2.T
  - **Validation**: Staging doc has a Phase 2 section (table state model, reducers, timing constants, wire protocol table)
  - **Status**: ✅ Complete (written by orchestrator)

**Success criteria**
- Automated: all table-core Vitest suites pass; `pnpm test`, `pnpm lint`, `pnpm build` pass.
- Manual: none.

---

## Phase 3: Nakama adapter (plan phase 2)

**Overview**: A thin `nkruntime` adapter over the table core: the `chkobba_table` authoritative match handler, the `quick_match` RPC, and registration in `InitModule`.

- [x] **Task 3.1**: Implement the `chkobba_table` authoritative match handler
  - **Files**: `apps/server/src/match/tableMatch.ts` (new) — `matchInit` (`tickRate: 1`, seed from `nk.uuidv4()`, initial label); `matchJoinAttempt` (accept reserved `userId` or a free seat, else reject); `matchJoin` / `matchLeave` -> `join` / `leave`; `matchLoop` decodes messages -> `intent` (send `101 ERROR` to sender on rejection) then `tick(Date.now())`; send `100 SNAPSHOT` per presence only when that seat's projection changed; `dispatcher.matchLabelUpdate` when seats or phase change; return `null` to terminate ~60 s after finish or after 60 s empty; `matchTerminate` / `matchSignal` stubs
  - **Constraint**: All game logic stays in `src/table/`; the handler only maps lifecycle and I/O. Handler functions must be top-level named functions so they survive Rollup and are referenced by name.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, architecture-standards, type-safety-patterns
  - **Dependencies**: Task 2.X
  - **Validation**: `pnpm --filter @chkobba/server typecheck`, `pnpm --filter @chkobba/server build`
  - **Status**: ✅ Complete (`src/match/tableMatch.ts`; canonicalJson fingerprint fix for Go-map key order; join-attempt reserves seat, 10 s expiry)

- [x] **Task 3.2**: Implement the `quick_match` RPC
  - **Files**: `apps/server/src/rpc/quickMatch.ts` (new) — `nk.matchList` with query `+label.open:T +label.mode:2v2 +label.private:F`, authoritative only; pick the match with the fewest free seats; otherwise `nk.matchCreate('chkobba_table', ...)`; return `{ matchId }`
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 3.1
  - **Validation**: `pnpm --filter @chkobba/server typecheck`
  - **Status**: ✅ Complete (`src/rpc/quickMatch.ts`, pure `pickFullestOpenTable`; rejects calls without a user)

- [x] **Task 3.3**: Register the match handler and RPC in `InitModule` and verify the bundle loads in Nakama
  - **Files**: `apps/server/src/main.ts` (modify) — `initializer.registerMatch('chkobba_table', {...})`, `initializer.registerRpc('quick_match', ...)`, keep `smoke_game`; `apps/server/rollup.config.mjs` (modify only if needed to keep handler globals)
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, code-quality-standards
  - **Dependencies**: Task 3.2
  - **Validation**: `pnpm --filter @chkobba/server build`; `docker compose restart nakama`; `docker compose logs nakama` shows the match handler and both RPCs registered with no goja errors; smoke curl still returns a winner
  - **Status**: ✅ Complete (main.ts registers chkobba_table + quick_match + smoke_game; live socket test: same table, bots at 15 s, per-seat hands, empty termination at 60 s)

- [x] **Task 3.4**: Unit-test the adapter with fake `nk`, `dispatcher` and `logger`
  - **Files**: `apps/server/src/match/__tests__/tableMatch.test.ts` (new), `apps/server/src/rpc/__tests__/quickMatch.test.ts` (new), `apps/server/src/__tests__/fakes.ts` (new)
  - **Constraint**: Cover: join attempt accepts reserved user / free seat and rejects a full table; snapshots go only to their own presence and only when changed; label updated on seat/phase change; termination after finish and after empty timeout; `quick_match` picks the fewest-free-seats match, else creates.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, security-patterns
  - **Dependencies**: Task 3.3
  - **Validation**: `pnpm --filter @chkobba/server test`
  - **Status**: ✅ Complete (tableMatch 43, quickMatch 17, fakes.ts; no src bugs)

- [x] **Task 3.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 3.4
  - **Validation**: `pnpm test`, `pnpm lint`, `pnpm build`
  - **Status**: ✅ Complete (run by orchestrator: rules 73, server 257, mobile 29; lint/typecheck/build ✓; Nakama loads module, quick_match + smoke_game registered)

- [x] **Task 3.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-27-multiplayer-m1-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 3.T
  - **Validation**: Staging doc has a Phase 3 section (match lifecycle mapping, label schema and query, termination rules, `quick_match` contract)
  - **Status**: ✅ Complete (written by orchestrator)

**Success criteria**
- Automated: adapter tests pass; `pnpm test`, `pnpm lint`, `pnpm build` pass.
- Manual: Nakama container logs show `chkobba_table`, `quick_match` and `smoke_game` registered after `docker compose restart nakama`.

---

## Phase 4: Client (plan phase 3)

**Overview**: `NakamaGameClient` behind the existing `GameClient` interface, guest device auth, quick-match lobby flow, turn ring, away/disconnected badges and a reconnect banner. Table screens stay unchanged apart from the new optional props.

- [x] **Task 4.1**: Consume the shared protocol in the mobile app
  - **Files**: `apps/mobile/package.json` (add `@chkobba/protocol` workspace dep); `apps/mobile/src/online/protocol.ts` (new) — re-exports from `@chkobba/protocol` plus a `decodeSnapshot` that parses `100 SNAPSHOT` data
  - **Constraint**: Do not import from `apps/server` (apps never import from each other).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns
  - **Dependencies**: Task 3.X
  - **Validation**: `pnpm --filter @chkobba/mobile typecheck`
  - **Status**: ✅ Complete (`src/online/protocol.ts` with defensive `decodeSnapshot`/`decodeError`; `@chkobba/protocol` dep; protocol `backfillAt` comment fixed)

- [x] **Task 4.2**: Contract validation: client decodes a real server snapshot
  - **Files**: `apps/mobile/src/online/__tests__/protocol.test.ts` (new) — decodes a recorded SNAPSHOT fixture produced by the server's `snapshotFor` (fixture checked into `apps/mobile/src/online/__tests__/fixtures/snapshot.json`)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, type-safety-patterns
  - **Dependencies**: Task 4.1
  - **Validation**: `decodeSnapshot` accepts the server-produced fixture; `pnpm --filter @chkobba/mobile test`
  - **Status**: ✅ Complete (6 server-generated fixtures + `protocol.test.ts`, 65 tests)

- [x] **Task 4.3**: Add the Nakama client module with guest device auth
  - **Files**: `apps/mobile/package.json` (add `@heroiclabs/nakama-js` 2.8.0); `pnpm-lock.yaml`; `apps/mobile/src/online/nakama.ts` (new) — client from `EXPO_PUBLIC_NAKAMA_HOST/PORT/KEY/SSL` with local defaults; device auth with a random device id persisted in AsyncStorage (`@react-native-async-storage/async-storage`, already a dependency); auto-generated guest username; `quickMatch()` RPC wrapper; `apps/mobile/.env.example` (new, if no env template exists)
  - **Constraint**: Adding the dependency must not pull a Babel 8 package; if mobile tests break after install, restore `pnpm-lock.yaml` and reinstall.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 4.2
  - **Validation**: `pnpm install`; `pnpm --filter @chkobba/mobile typecheck`; `pnpm --filter @chkobba/mobile test` still green
  - **Status**: ✅ Complete (`@heroiclabs/nakama-js` 2.8.0, `src/online/nakama.ts`, `.env.example`; lockfile: no Babel changes)

- [x] **Task 4.4**: Extend `GameSnapshot` / `SeatInfo` with online fields
  - **Files**: `apps/mobile/src/game/GameClient.ts` (modify) — `GameSnapshot.turnDeadline?`, `GameSnapshot.connection?: 'online' | 'reconnecting'`, `SeatInfo.away?`, `SeatInfo.connected?`
  - **Constraint**: All new fields optional so `LocalGameClient` is untouched.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns
  - **Dependencies**: Task 4.3
  - **Validation**: `pnpm --filter @chkobba/mobile typecheck`; `pnpm --filter @chkobba/mobile test` (LocalGameClient tests unchanged and green)
  - **Status**: ✅ Complete (optional `turnDeadline`, `connection`, `online`, `SeatInfo.away/connected`; LocalGameClient untouched)

- [x] **Task 4.5**: Implement `NakamaGameClient`
  - **Files**: `apps/mobile/src/online/NakamaGameClient.ts` (new) — `start()` authenticates, opens the socket, joins `matchId`, subscribes `onmatchdata` -> snapshot; `play` / `cut` send opcodes 1 / 2; `back()` sends opcode 3 on any user action while away; `nextRound` no-op; `stop()` leaves and closes; reconnect with backoff on socket loss and rejoin the same `matchId`, exposing `connection: 'reconnecting'`; convert `turnDeadline` with a clock offset measured at connect; surface `101 ERROR`
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, design-patterns, security-patterns
  - **Dependencies**: Task 4.4
  - **Validation**: `pnpm --filter @chkobba/mobile typecheck`
  - **Status**: ✅ Complete (`src/online/NakamaGameClient.ts`, injectable `OnlineBackend`/scheduler/clock; table_full retry ×3; backoff reconnect; seq dedupe)

- [x] **Task 4.6**: Unit-test `NakamaGameClient` with a mocked nakama-js socket
  - **Files**: `apps/mobile/src/online/__tests__/NakamaGameClient.test.ts` (new)
  - **Constraint**: Cover: snapshot updates notify subscribers; play/cut/back send the right opcodes and payloads; `nextRound` is a no-op; socket close -> `reconnecting` -> rejoin same `matchId` -> `online`; clock offset applied to `turnDeadline`; `stop()` is idempotent.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 4.5
  - **Validation**: `pnpm --filter @chkobba/mobile test`
  - **Status**: ✅ Complete (`NakamaGameClient.test.ts`, 73 tests; no src bugs)

- [x] **Task 4.7**: Add the turn ring: optional `progress` (0-1) on the `Avatar` skin slot, computed in the controller
  - **Files**: `apps/mobile/src/skins/types.ts` (modify — `Avatar` props gain `progress?`); `apps/mobile/src/skins/cafe/CafeComponents.tsx` (modify — draining glow); `apps/mobile/src/skins/minimal/index.tsx` (modify — draining ring); `apps/mobile/src/game/useTableController.ts` (modify — derive progress from `turnDeadline`); `apps/mobile/src/components/Seat.tsx` (modify — pass `progress`)
  - **Constraint**: No per-skin layout forks; progress logic lives in `useTableController`, not in a layout.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, code-quality-standards
  - **Dependencies**: Task 4.4
  - **Validation**: `pnpm --filter @chkobba/mobile typecheck`; offline game still renders without a ring
  - **Status**: ✅ Complete (`AvatarProps.progress`, café brass arc / minimal SVG ring, `useCountdown.ts`, controller `turnTimer`/`progressOf`)

- [x] **Task 4.8**: Add away / disconnected seat badges and a "Reconnecting..." banner
  - **Files**: `apps/mobile/src/components/Seat.tsx` (modify — badges from `SeatInfo.away` / `connected`); `apps/mobile/src/components/table/ReconnectingBanner.tsx` (new); `apps/mobile/src/components/table/DesktopLayout.tsx` and `apps/mobile/src/components/table/PhoneLayout.tsx` (modify — render the banner from controller state); `apps/mobile/src/game/useTableController.ts` (modify — expose `connection`)
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, code-quality-standards
  - **Dependencies**: Task 4.7 (both modify `Seat.tsx` and `useTableController.ts`)
  - **Validation**: `pnpm --filter @chkobba/mobile typecheck`
  - **Status**: ✅ Complete (seat `Offline`/`Away` badges, `ReconnectingBanner.tsx`, tokens `warnBg`/`warnText`, `OnlineErrorSheet.tsx`, `online/messages.ts`)

- [x] **Task 4.9**: Activate the lobby Quick match tile and add the "Finding players..." screen
  - **Files**: `apps/mobile/src/app/index.tsx` and `apps/mobile/src/components/lobby/LobbyTile.tsx` / `LobbySheet.tsx` (modify — Quick match enabled); `apps/mobile/src/app/finding.tsx` (new route) and `apps/mobile/src/components/lobby/FindingPlayers.tsx` (new) — calls `quick_match`, joins via `NakamaGameClient`, shows seats filled (n/4) and a "bots join in N s" countdown from the waiting snapshot, then routes to `/game?online=1&matchId=...`; cancel leaves the match
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, code-quality-standards
  - **Dependencies**: Task 4.5
  - **Validation**: `pnpm --filter @chkobba/mobile typecheck`
  - **Status**: ✅ Complete (Quick match live, `app/finding.tsx`, `FindingPlayers.tsx`, `online/activeClient.ts` hand-off)

- [x] **Task 4.10**: Route online games through `NakamaGameClient`
  - **Files**: `apps/mobile/src/app/game.tsx` (modify) — `online=1&matchId=...` constructs `NakamaGameClient` (reusing the instance from the finding screen if one is held); otherwise the `LocalGameClient` path is unchanged
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: code-quality-standards, type-safety-patterns
  - **Dependencies**: Task 4.8, Task 4.9
  - **Validation**: `pnpm --filter @chkobba/mobile typecheck`; offline game from the lobby still works
  - **Status**: ✅ Complete (`app/game.tsx` online branch `OnlineGame`; round summary auto countdown; web export builds with nakama-js)

- [x] **Task 4.11**: Component tests for the new UI
  - **Files**: `apps/mobile/src/components/__tests__/Seat.test.tsx` (new or extend), `apps/mobile/src/components/table/__tests__/ReconnectingBanner.test.tsx` (new), `apps/mobile/src/components/lobby/__tests__/LobbyScreen.test.tsx` (extend — Quick match enabled), `apps/mobile/src/components/lobby/__tests__/FindingPlayers.test.tsx` (new), `apps/mobile/src/components/__tests__/GameTable.test.tsx` (extend — progress ring and badges from a fake client)
  - **Constraint**: Await RNTL v14 `render` / `fireEvent`.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, accessibility-compliance
  - **Dependencies**: Task 4.10
  - **Validation**: `pnpm --filter @chkobba/mobile test`
  - **Status**: ✅ Complete (Seat 21, ReconnectingBanner 6, AwayBanner 5, FindingPlayers 26, GameTable online +36; found a11y gap: ReconnectingBanner View lacks `accessible`)

- [x] **Task 4.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 4.6, Task 4.11
  - **Validation**: `pnpm test`, `pnpm lint`, `pnpm build`
  - **Status**: ✅ Complete (run by orchestrator: rules 73, server 266, mobile 262; lint/typecheck/build ✓)

- [x] **Task 4.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-27-multiplayer-m1-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 4.T
  - **Validation**: Staging doc has a Phase 4 section (env vars, guest auth, `NakamaGameClient` behaviour, reconnect, new `GameSnapshot` fields, `Avatar.progress` slot prop, online route)
  - **Status**: ✅ Complete (written by orchestrator)

- [x] **Task 4.U**: Validate the online UI in the browser
  - **Files**: N/A (validation task; Expo web at `http://localhost:8081`, backend via `docker compose up -d`)
  - **Assigned Agent**: ui-explorer (Tier 4 - UI Validation)
  - **Skills**: accessibility-compliance
  - **Dependencies**: Task 4.X
  - **Validation**: Quick match tile opens "Finding players..." with seat count and bots countdown; after 15 s bots fill and the table renders; turn ring drains on the active seat in both Café Tunisien and Modern Minimal skins; offline "vs bots" game still works; desktop (>= 900 px) and phone (< 900 px) layouts both render
  - **Status**: ✅ Complete with gap: lobby, finding (count + 15 s countdown), bot backfill → table, turn clock, legal play, timeout → away banner → I'm back, round summary countdown (no button), Minimal ring, offline unchanged, 0 console errors. Phone width (390 px) NOT run (no resize tool) → deferred to manual. Screenshots in `.playwright-mcp/`

**Success criteria**
- Automated: mobile tests (including contract test) pass; `pnpm test`, `pnpm lint`, `pnpm build` pass.
- Manual: browser validation in Task 4.U.

---

## Phase 5: End-to-end verification and final documentation (plan phase 4)

**Overview**: A Node e2e script against the local `docker compose` backend, manual multi-device play, then merge staged notes into permanent docs.

- [x] **Task 5.1**: Write the e2e script
  - **Files**: `apps/server/scripts/e2e.ts` (new) — two nakama-js clients authenticate as distinct devices, `quick_match` into the same table, wait for 2 bot backfills, play to game over by sending legal moves from their own snapshots, and mid-round kill one client's socket, reconnect, and assert the same seat comes back; `apps/server/package.json` (add `@heroiclabs/nakama-js` 2.8.0 devDependency and an `e2e` script, e.g. run via Node type stripping or `tsx`); exclude `scripts/` from the Rollup bundle input
  - **Constraint**: Node needs a global `WebSocket` (Node 22+) or a polyfill; do not add Babel 8 packages.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: testing-patterns, type-safety-patterns
  - **Dependencies**: Task 4.U
  - **Validation**: `pnpm --filter @chkobba/server typecheck`; script runs (see Task 5.2)
  - **Status**: ✅ Complete (`apps/server/scripts/e2e.ts`, `scripts/tsconfig.json`; devDeps nakama-js 2.8.0, tsx, @types/node; `e2e` script; no Babel lockfile changes)

- [x] **Task 5.2**: Run the e2e script against `docker compose` and fix any failures
  - **Files**: Whatever the failures point at under `apps/server/src/` or `apps/server/scripts/e2e.ts`
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.1
  - **Validation**: `pnpm --filter @chkobba/server build && docker compose up -d && docker compose restart nakama && pnpm --filter @chkobba/server e2e` exits 0: same table for both clients, 2 bots backfilled, game reaches over, reconnected client keeps its seat
  - **Status**: ✅ Complete (run by 5.1 agent: E2E PASSED — same table, 2 bots backfilled, B dropped + rejoined same seat, 9 rounds to game over, 457 s, no server errors; no fixes needed, debug-specialist not invoked)

- [~] **Task 5.3**: Two-browser-window online game check
  - **Files**: N/A (validation task; Expo web at `http://localhost:8081`, two separate browser contexts so each gets its own device id)
  - **Assigned Agent**: ui-explorer (Tier 4 - UI Validation)
  - **Skills**: None
  - **Dependencies**: Task 5.2
  - **Validation**: Both windows land at the same table; bots fill the remaining 2 seats after 15 s; a 20 s timeout makes a bot play and two misses show the away badge until the player acts; closing and reopening one window shows "Reconnecting..." / disconnected badge and then restores the seat
  - **Status**: ⏭ Deferred to manual (ui-explorer has a single Playwright browser context, so both windows would share one device id; covered automatically by the e2e two-client run)

- [x] **Task 5.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.3
  - **Validation**: `pnpm test`, `pnpm lint`, `pnpm build`
  - **Status**: ✅ Complete (run by orchestrator: rules 73, server 266, mobile 262; lint/typecheck/build ✓)

- [x] **Task 5.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-27-multiplayer-m1-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 5.T
  - **Validation**: Staging doc has a Phase 5 section (how to run e2e, manual test procedure, known limitations: guest identity lost on reinstall, Normal-only server bots)
  - **Status**: ✅ Complete (written by orchestrator)

- [x] **Task 5.F**: Merge staged notes into permanent Diataxis documentation
  - **Files**: `context/docs/2026-10-27-multiplayer-m1-docs.md` (read, then delete); `docs/explanation/`, `docs/how-to/`, `docs/reference/` (new or update — e.g. multiplayer architecture explanation, local backend + e2e how-to, wire protocol and table label reference); `CLAUDE.md` (update the Status block and Project Structure for `apps/server/src/table`, `match`, `rpc` and `apps/mobile/src/online`)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 5.X
  - **Validation**: Each staged section is classified and lives under `docs/{type}/`; `context/docs/2026-10-27-multiplayer-m1-docs.md` no longer exists; CLAUDE.md status reflects milestone 1 complete
  - **Status**: ✅ Complete (`docs/README.md`, `docs/explanation/multiplayer-architecture.md`, `docs/how-to/local-backend.md`, `docs/reference/wire-protocol.md`; CLAUDE.md updated; staging doc deleted by orchestrator)

**Success criteria**
- Automated: `pnpm --filter @chkobba/server e2e` passes against `docker compose`; `pnpm test`, `pnpm lint`, `pnpm build` pass.
- Manual (from plan):
  - [ ] Two browser windows quick-match into the same table and play with 2 bots.
  - [ ] A phone on the LAN via Expo Go (with `EXPO_PUBLIC_NAKAMA_HOST` set to the dev machine's LAN IP) joins a table with a browser window and plays.
  - [ ] Killing a client's connection mid-round shows a bot taking over; reconnecting returns the seat.

---

## Execution notes

- Phase 4 addition (orchestrator-added, general-purpose): away seats get `AwayBanner` with an "I'm back" button (`away-banner`, `away-back`) and an auto BACK on first hand interaction; optional `GameClient.back?()`. Without it an away player could never act (bot moves within ~1 s).
- Typed routes: after adding a route, run `expo start` once to regenerate `.expo/types/router.d.ts` before `typecheck` passes on a clean checkout.

- Phase 4 addition (orchestrator-added, general-purpose): `Snapshot.serverTime` + `nextRoundAt` (server excludes serverTime from the change fingerprint); client clock offset from serverTime (max of last 16 samples); device id via `expo-crypto` `randomUUID` (no Math.random). Server tests 257 → 266. Deferred: session/refresh tokens in AsyncStorage → move to `expo-secure-store` before release.

- Phase 3 fix (orchestrator-added, general-purpose): backfill clock now starts from the first waiting human (`TableState.waitingSince`), not table creation; `snapshot.backfillAt` follows. Server tests 185 → 197. Follow-up: update the `backfillAt` comment in `packages/protocol/src/index.ts` (null also while waiting with no human).
- Client must retry `quick_match` on `table_full` join rejection (Nakama match index lags ~1 s).

- Phase 2 actuals: `packages/protocol/{package.json,tsconfig.json,src/index.ts}`; `apps/server/src/table/{types,lifecycle,seats,intent,tick,projection,index}.ts`; `apps/server/package.json` (+@chkobba/protocol); `apps/server/Dockerfile` (copies packages/protocol); `pnpm-lock.yaml`.
- Found during 2.3 (out of scope, needs its own ticket): `packages/rules/src/engine.ts` `sameCapture` compares only length + membership, so `capture: ['AS','AS']` matches a legal `['AS','6H']`. Server rejects duplicate capture ids as `bad_payload`.

- Execute phases sequentially (Phase 0 -> 1 -> 2 -> 3 -> 4 -> 5). Each phase's first task depends on the previous phase's `.X` documentation task.
- Within phases, respect task dependencies. Parallel-safe pairs: 2.6 and 2.7; 4.6 alongside 4.7-4.9 (4.7 and 4.9 both depend only on earlier tasks, but 4.8 waits for 4.7 because they edit the same files).
- Tasks 1.1, 1.2, 3.3, 4.U, 5.2 and 5.3 need Docker running (`docker compose up -d`). After rebuilding the module, `docker compose restart nakama`.
- No manual gate between phases (execute-plan): automated validation is the gate; manual items are deferred to the final summary.
- Use the Write tool for all file operations (never `cat`).
- Decided 2026-10-28: the wire protocol lives in `packages/protocol` (types + constants), not duplicated per app and not in `packages/rules`.
