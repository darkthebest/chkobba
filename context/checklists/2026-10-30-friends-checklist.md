# Checklist: Friends v1 (friend codes, requests, recent players, presence, table invites)

**Ticket**: TBD
**Generated from**: `context/plans/2026-10-30-friends.md`
**Generated at**: 2026-10-30
**Base branch**: the private-tables branch (`context/plans/2026-10-30-private-tables.md`, checklist `context/checklists/2026-10-30-private-tables-checklist.md`). Private tables must be fully implemented first; this checklist starts from it.
**Staging docs**: `context/docs/2026-10-30-friends-docs.md` (temporary, merged in Task 8.F)

## Phase mapping

The plan numbers its phases 0-7. This checklist reserves Phase 0 for preflight, so every plan phase moves up by one. Execution order is unchanged (plan 0 → 7).

| Checklist phase | Plan phase |
|---|---|
| Phase 0: Preflight | (orchestrator) |
| Phase 1: Contracts and decision records | 0. Contracts and decision records |
| Phase 2: Friend-code usernames | 1. Friend-code usernames |
| Phase 3: Server friend rules and recent players | 2. Server friend rules and recent players |
| Phase 4: Mobile social services | 3. Mobile social services |
| Phase 5: Friends UI | 4. Friends UI |
| Phase 6: End-to-end friends check | 5. End-to-end friends check |
| Phase 7: Invites to private tables | 6. Invites to private tables |
| Phase 8: Finalization | 7. Finalization |

## Files created by private tables

These paths come from the private-tables plan and checklist. When this checklist runs they must exist; a task that references one says "(created by private tables)". If one is missing or was named differently, stop and reconcile with the private-tables branch before continuing.

| Path | What friends uses | Private-tables task |
|---|---|---|
| `packages/protocol/src/room.ts` | `ROOM_CODE_ALPHABET`, `RoomMember`, `isRoomCode`, `ROOM_COLLECTION` (already present on the current branch) | 1.1 |
| `packages/protocol/src/testing/roomFixtures.ts`, `packages/protocol/src/testing/index.ts` | shared snapshot fixtures (already present) | 1.3 |
| `apps/server/src/rpc/roomCode.ts` | byte-source helper for code generation (private-tables 3.1 chose `nk.secureRandomBytes` over `nk.uuidv4()` bytes; follow whatever it shipped) | 3.2 |
| `apps/server/src/rpc/roomStore.ts` | `readCode(nk, code)` for the code → match lookup | 3.4 |
| `apps/server/src/rpc/privateTable.ts` | `create_private_table`, `join_by_code` | 3.6 |
| `apps/mobile/src/online/shareLink.ts` | `EXPO_PUBLIC_WEB_BASE_URL` parsing (`roomShareLink`) | 4.5 |
| `apps/mobile/src/online/shareRoom.ts` (+ `.web.ts`) | share/copy with plain-http fallback | 5.3 |
| `apps/mobile/src/components/lobby/NameGate.tsx` | shared first-visit name gate | 5.1 |
| `apps/mobile/src/components/lobby/JoinCodeSheet.tsx` | code input pattern to mirror | 5.6 |
| `apps/mobile/src/components/room/PrivateRoom.tsx`, `RoomSeat.tsx`, `RoomCode.tsx`, `PrivateSession.tsx` | waiting room, invite entry point, room seats | 5.5, 5.8 |
| `apps/mobile/src/app/t/[code].tsx`, `apps/mobile/src/app/private.tsx` | invite Join target | 5.7 |
| `apps/mobile/src/game/useRoomController.ts` | room members for the invite sheet | 5.4 |

## Agent Registry

| Agent | Tier | Assigned Tasks |
|---|---|---|
| orchestrator (execute-plan) | n/a | 0.1 |
| general-purpose | Tier 3 - Research/Exploration (used as implementer; no dedicated TS/Nakama/Expo developer agent exists, same convention as the m1, identity and private-tables checklists) | 1.1, 1.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.V, 5.I, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.V, 7.I |
| debug-specialist | Tier 2 - Domain Specialist | 2.1, 2.11, 3.1, 3.11, 4.1, 6.3, 7.1, 7.13, 7.16 |
| test-specialist | Tier 2 - Domain Specialist | 1.3, 1.T, 2.8, 2.9, 2.T, 3.2, 3.9, 3.10, 3.C, 3.T, 4.9, 4.T, 5.10, 5.11, 5.T, 6.1, 6.2, 6.T, 7.11, 7.12, 7.14, 7.15, 7.T, 8.T |
| codebase-analyzer | Tier 3 - Research/Exploration | 1.0, 8.5 |
| ui-explorer | Tier 4 - UI Validation | 5.U, 7.U |
| docs-maintainer | Always Available | 1.4, 1.5, 1.X, 2.2, 2.10, 2.X, 3.X, 4.X, 5.X, 6.X, 7.X, 8.1, 8.2, 8.3, 8.4, 8.X, 8.F |

**Notes on assignment**
- The repo has no Tier 1 generators and no Tier 6 developer agents (`.claude/agents/` holds research, test, debug, refactor, UI-validation and docs agents). Implementation goes to `general-purpose`, as in the earlier checklists. Tier 6 usage: 0.
- **Early Nakama checks** are the first task of their phase and gate the tasks that depend on them: 2.1 (before-auth username rewrite and username case), 3.1 (blocked re-request behaviour), 4.1 (status-follow cap), 7.1 (`matchSignal` from an RPC, latency and reply). They go to `debug-specialist` because each needs a live probe on Docker Nakama; it should also read the Nakama source/docs (Context7) to explain what it sees.
- **Primary vs fallback username path**: Task 2.1 picks one. Exactly one of 2.4 (primary) and 2.5 (fallback) runs; mark the other `✅ Skipped (2.1 chose …)`. Task 2.6 follows the same choice.
- **i18n**: there is no `i18n-specialist` agent. Phases 5 and 7 get `.V` (validate) and `.I` (Derja wording pass) tasks, assigned to `general-purpose`. `en.ts` defines the `Translation` type, so `aeb.ts` gets its keys in the same task as `en.ts` or typecheck fails; `.I` is a wording review flagged for the user.
- **ADRs**: Task 1.0 extracts the ADR-0001 and ADR-0002 constraints this work must respect. ADR-0003 is written in 1.4 and updated with the verified username path in 2.2. Compliance is checked in 8.5.
- **Cross-app contract**: Task 3.C pins the real HTTP status and body of the AddFriends hook errors, a live snapshot with `PlayerInfo.userId`, and a real `recent_players` record before the mobile client (Phase 4) maps them. Task 7.13 does the same for `invite_to_table` and the `TABLE_INVITE` notification before the invite UI.

## Global constraints (apply to every task)

- `@chkobba/protocol` changes are additive only. `PlayerInfo.userId` and `RoomMember.userId` are optional; nothing else in `Snapshot`, `OpCode`, `ERROR_CODES`, `TableLabel` or the name types changes. Helpers in `friends.ts` are pure, dependency-free and goja-safe (ES2017, no `\p{}`/`u`-flag regex, no `.at()`, `Object.hasOwn`, `Proxy`).
- **No `Math.random` on the server.** Friend-code randomness comes from the same `nk` byte source private tables uses, fed into a pure generator that takes a random source.
- **No SQL.** Only Nakama friends, storage, notification and status APIs.
- **Usernames are always the normalized uppercase form** when stored and looked up (plan Phase 1 risk), unless 2.1 finds Nakama normalizes case itself.
- **Status is public**: `PresenceStatus` carries `lobby`/`room`/`playing` only, never a room code or match id. Invites are the only path to a private table code.
- **Recent-player writes are best effort**: try/catch with logging; a storage failure never fails `matchJoin`, `matchLeave` or `matchLoop`. Records are `social/recent_players` with `permissionRead 1`, `permissionWrite 0`; `social/invite_limits` is 0/0.
- Hooks and RPCs registered in `InitModule` are top-level named functions. Before hooks `return data` (null gives a 404) and throw `{ message, code }` with numeric gRPC codes as local consts (`apps/server/src/account/hooks.ts:16-31`); `nkruntime.Codes` is a const enum Babel can't inline.
- After any server change: rebuild, `docker compose restart nakama`, confirm the module loads.
- `NakamaGameClient`'s per-game socket stays as is (`createStatus: false`). The social socket is separate and connects only per resolved question 6: opening the app for offline play never creates an account.
- Mobile: no hard-coded UI text (`const tr = useT()`); friend codes render in an LTR isolate (`DirectionView dir="ltr"`); `marginStart`/`marginEnd`; skins only through tokens and slots; RNTL v14 `render`/`fireEvent` are awaited; no secure-context-only APIs on web without a fallback (LAN serves plain `http://`; `crypto.getRandomValues` is fine, `crypto.randomUUID` is not).
- Keep the workspace on Babel 7. If adding an Expo package re-resolves Babel 8 peers, restore `pnpm-lock.yaml` and reinstall.
- After adding an expo-router route, run `expo start` once to regenerate typed routes before `typecheck`.
- **No deployment or hosting.** Testing stays on the LAN.

## Validation command reference

| Package | Commands |
|---|---|
| `packages/protocol` | `pnpm --filter @chkobba/protocol test`, `pnpm --filter @chkobba/protocol typecheck` |
| `apps/server` | `pnpm --filter @chkobba/server test`, `pnpm --filter @chkobba/server typecheck`, `pnpm --filter @chkobba/server build` |
| Nakama load check | `pnpm --filter @chkobba/server build && docker compose restart nakama`, then `docker compose logs nakama --since 1m` shows "Chkobba module loaded" with no goja errors and the new hooks/RPCs registered, then `curl -X POST "localhost:7350/v2/rpc/smoke_game?http_key=defaulthttpkey&unwrap" -d '{}'` returns a winner |
| `apps/mobile` | `pnpm --filter @chkobba/mobile test`, `pnpm --filter @chkobba/mobile typecheck`, `pnpm --filter @chkobba/mobile lint` |
| e2e | `pnpm --filter @chkobba/server e2e` |
| Workspace | `pnpm build`, `pnpm test`, `pnpm lint` |

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

## Phase 1: Contracts and decision records (plan phase 0)

**Overview**: Fix the friend wire contract in `@chkobba/protocol` and record the friend-code and presence design (ADR-0003, ADR-0001 amendment) before anything depends on them.

- [x] **Task 1.0**: Verify the private-tables prerequisite and extract the ADR-0001 / ADR-0002 constraints this work must follow
  - **Files**: `docs/adr/0001-durable-guest-identity-and-display-names.md`, `docs/adr/0002-private-tables-room-codes-and-host-model.md`, and every path in "Files created by private tables" above (read only; findings in the task report and the Phase 1 staging notes)
  - **Assigned Agent**: codebase-analyzer (Tier 3 - Research/Exploration)
  - **Skills**: architecture-decision-records, architecture-standards
  - **Dependencies**: Task 0.1
  - **Validation**: every "created by private tables" path exists (or its real name is recorded); a short list of constraints (name gate rules, hidden `username`, codes never in labels, member vs seat model) that later tasks cite
  - **Status**: ✅ Complete (all prerequisite paths exist; constraints in staging docs Phase 1)

- [x] **Task 1.1**: Add `friends.ts` to `@chkobba/protocol` with the constants, types, error lists and pure code helpers, and re-export it
  - **Files**: `packages/protocol/src/friends.ts` (new): the plan's data-structure block (`FRIEND_CODE_ALPHABET = ROOM_CODE_ALPHABET`, `FRIEND_CODE_LENGTH`, `FRIEND_LINK_PATH`, `FRIEND_STATE`/`FriendState`, `FRIEND_LIMITS`, `FRIEND_ERROR_CODES`, `AUTH_ERROR_CODES`, `NOTIFICATION_CODES`, `TableInviteContent`, `INVITE_TTL_MS`, `INVITE_LIMIT`, `INVITE_WINDOW_MS`, `InviteToTableRequest`/`Response`, `INVITE_RPC_ERROR_CODES`, `PRESENCE_ACTIVITIES`/`PresenceStatus`, `SOCIAL_COLLECTION`, `RECENT_PLAYERS_KEY`, `RECENT_TABLES_MAX`, `RecentPlayer`/`RecentTable`/`RecentPlayersRecord`, `INVITE_LIMITS_KEY`/`InviteLimitsRecord`) plus `normalizeFriendCode` (uppercase, strip spaces and dashes), `isFriendCode`, `formatFriendCode` (`XXXX-XXXX`), `friendCodeFromBytes(bytes)` (`byte & 31`, no bias). Imports `ROOM_CODE_ALPHABET` from `packages/protocol/src/room.ts` (created by private tables). `packages/protocol/src/index.ts`: `export * from './friends'` next to the `room`/`names`/`emotes` re-exports.
  - **Constraint**: Only import is `./room`; ES2017 lib; a character loop, not a `u`-flag regex.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, code-quality-standards
  - **Dependencies**: Task 1.0 (prerequisite files confirmed)
  - **Validation**: protocol, server and mobile typecheck pass
  - **Status**: ✅ Complete (friends.ts + re-export; 3 typechecks pass)

- [x] **Task 1.2**: Add the optional `PlayerInfo.userId`, documented as human seats only
  - **Files**: `packages/protocol/src/index.ts` (`PlayerInfo` `:47-54`): `readonly userId?: string;` with JSDoc "human seats only; absent for bots; old decoders drop it". `RoomMember.userId` waits for Phase 7.
  - **Constraint**: Additive only; no existing field changes.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns
  - **Dependencies**: Task 1.0
  - **Validation**: protocol, server and mobile typecheck pass; diff is additive
  - **Status**: ✅ Complete (PlayerInfo.userId optional)

- [x] **Task 1.3**: Write the friend-code unit tests and add a `userId` snapshot fixture
  - **Files**: `packages/protocol/src/__tests__/friends.test.ts` (new): `normalizeFriendCode`/`isFriendCode` vectors for lowercase, dashes, spaces, the excluded `0`, `O`, `1`, `I`, wrong length; `formatFriendCode`; `friendCodeFromBytes` fixed vectors (byte 0 → `A`, 31 → `9`, 32 → `A`, 255 → `9`) showing no bias; `FRIEND_CODE_ALPHABET === ROOM_CODE_ALPHABET`; `NOTIFICATION_CODES.TABLE_INVITE > 0`. `packages/protocol/src/testing/friendFixtures.ts` (new), re-exported from `packages/protocol/src/testing/index.ts` (created by private tables): a public snapshot whose human `PlayerInfo` carry `userId` and whose bots don't (plan risk "Protocol drift").
  - **Constraint**: The main entry must not import `testing/`.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 1.1, Task 1.2
  - **Validation**: `pnpm --filter @chkobba/protocol test` passes
  - **Status**: ✅ Complete (friends.test.ts, friendFixtures.ts; 365 protocol tests pass)

- [x] **Task 1.4**: Write ADR-0003 "Friend codes, social socket and presence" and link it
  - **Files**: `docs/adr/0003-friend-codes-social-socket-and-presence.md` (new): technical decisions 1-4 and 7 (server-generated code in `beforeAuthenticateDevice`, separate social socket and the no-`single_socket` dependency, public status carries availability only, `PlayerInfo.userId`, invite RPC plus persistent notification); the username path is marked "pending verification (Task 2.1)" with both primary and fallback described; future social-login authenticate hooks need the same before hook. `docs/adr/README.md`: add the row. `context/plans/2026-10-30-friends.md`: turn the "To write in Phase 0" bullet into a link.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: architecture-decision-records, documentation-standards
  - **Dependencies**: Task 1.1 (contract final)
  - **Validation**: ADR-0003 has Context, Decision, Consequences, Alternatives; row in `docs/adr/README.md`; linked from the plan
  - **Status**: ✅ Complete (ADR-0003 Proposed, README row, plan link)

- [x] **Task 1.5**: Add the dated amendment note to ADR-0001
  - **Files**: `docs/adr/0001-durable-guest-identity-and-display-names.md`: a dated (2026-10-30) note that ADR-0003 supersedes "`username` stays a hidden unique handle" and "new accounts get `Guest-XXXX`"; the rest stands.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: architecture-decision-records
  - **Dependencies**: Task 1.4 (link target exists)
  - **Validation**: note present and links ADR-0003
  - **Status**: ✅ Complete (ADR-0001 amendment)

- [x] **Task 1.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 1.3, Task 1.5
  - **Validation**: `pnpm test`, `pnpm lint`, `pnpm build` green; server and mobile typecheck pass
  - **Status**: ✅ Complete (pnpm test: rules 73, protocol 365, server 898, mobile 1054; lint, build, typecheck green)

- [x] **Task 1.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-friends-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 1.T
  - **Validation**: Phase 1 section written in the staging file (including the 1.0 constraints)
  - **Status**: ✅ Complete (orchestrator wrote Phase 1 staging section)

**Success criteria**
- Automated: protocol builds and tests pass; both apps typecheck; no existing field changes shape.
- Manual: ADR-0003 linked from the plan; ADR-0001 amended. (The ES5 bundle check for the helpers happens in Task 2.11, the first time the server imports them.)

---

## Phase 2: Friend-code usernames (plan phase 1)

**Overview**: Every new account gets a valid, server-generated friend code as its username, and the client can show its own code. Task 2.1 picks the primary (hook rewrites `username`) or fallback (hook rejects, client generates) path.

- [x] **Task 2.1**: Verify on Nakama 3.40 that a `registerBeforeAuthenticateDevice` hook can rewrite `username` on create, and how username case behaves
  - **Files**: Temporary probe only: a minimal `beforeAuthenticateDevice` in `apps/server/src/main.ts` that sets `data.username` to a fixed code, built and loaded in Docker, then **reverted**. Findings in the task report and the Phase 2 staging notes. Reference: `apps/server/node_modules/nakama-runtime/index.d.ts` (`registerBeforeAuthenticateDevice`, `usersGetUsername`).
  - **Constraint**: The probe never lands in a commit. Use fresh device ids.
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 1.X (phase 1 docs gate)
  - **Validation**: answers recorded for (a) a create with no username and with `Guest-XXXX` ends with the hook's username; (b) an existing account's username is not touched on sign-in; (c) `nk.usersGetUsername`, REST `getUsers?usernames=` and `addFriends?usernames=` with lowercase vs uppercase input (case-sensitive or not); (d) the error a 409 username clash returns. Decision: **PRIMARY** or **FALLBACK**, and whether uppercase normalization is needed on lookup
  - **Status**: ✅ Complete — PRIMARY: hook rewrites username on create only (ignored on sign-in); lookups exact-match case-sensitive → normalize to uppercase; clash = HTTP 409 code 6 'Username is already in use.'

- [x] **Task 2.2**: Record the verified username path and case findings in ADR-0003
  - **Files**: `docs/adr/0003-friend-codes-social-socket-and-presence.md`: replace "pending verification" with the 2.1 result and the chosen path; note the case rule.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: architecture-decision-records
  - **Dependencies**: Task 2.1
  - **Validation**: ADR-0003 states one path and the evidence
  - **Status**: ✅ Complete (ADR-0003 Accepted with verified PRIMARY path)

- [x] **Task 2.3**: Implement the pure server friend-code generator with profanity screening
  - **Files**: `apps/server/src/account/friendCode.ts` (new): `generateFriendCode(nextByte: () => number, isClean: (code) => boolean, maxTries)` built on `friendCodeFromBytes` from `@chkobba/protocol`; screens codes containing a word from `apps/server/src/account/profanity.ts` (match on the code letters, case-insensitive). The byte source is the adapter-side helper from `apps/server/src/rpc/roomCode.ts` (created by private tables; reuse it, don't duplicate). `apps/server/src/account/index.ts`: export it.
  - **Constraint**: No `Math.random`, no `nkruntime` import in this file.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 2.1 (case rule)
  - **Validation**: server typecheck and lint
  - **Status**: ✅ Complete (friendCode.ts: generateFriendCode, isFriendCodeClean; protocol normalize strips all whitespace)

- [x] **Task 2.4**: (PRIMARY path only) Add the `beforeAuthenticateDevice` hook that sets a generated code and register it
  - **Files**: `apps/server/src/account/hooks.ts`: `beforeAuthenticateDevice` replaces a missing or non-`isFriendCode` `username` with a code that `nk.usersGetUsername` doesn't know (up to 5 tries, then leaves it and lets Nakama answer 409); a valid code is normalized to uppercase; never rejects a sign-in; `return data`. `apps/server/src/main.ts` (`:45-63`): `initializer.registerBeforeAuthenticateDevice(beforeAuthenticateDevice)` as a top-level named function. `beforeUpdateAccount`'s `username_locked` (`hooks.ts:44`) unchanged.
  - **Constraint**: Skip this task (`✅ Skipped (2.1 chose FALLBACK)`) if 2.1 chose FALLBACK.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 2.1 (PRIMARY decision), Task 2.3
  - **Validation**: server typecheck and build; hook is a top-level function in `apps/server/build/index.js`
  - **Status**: ✅ Complete (beforeAuthenticateDevice always generates; registered; top-level in bundle)

- [x] **Task 2.5**: (FALLBACK path only) Make the hook reject missing, malformed or profane codes with `username_bad_code`
  - **Files**: `apps/server/src/account/hooks.ts`: `beforeAuthenticateDevice` throws `{ message: 'username_bad_code', code: 3 }` when a create carries no `username`, a non-`isFriendCode` one, or one that fails the profanity screen; `return data` otherwise. `apps/server/src/main.ts`: register it. `apps/mobile/src/online/friendCodeCandidate.ts` (new): a client candidate via `friendCodeFromBytes` over `crypto.getRandomValues` (available on insecure origins; fallback to the existing device-id byte source if absent).
  - **Constraint**: Skip this task (`✅ Skipped (2.1 chose PRIMARY)`) if 2.1 chose PRIMARY.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 2.1 (FALLBACK decision), Task 2.3
  - **Validation**: server and mobile typecheck; server build
  - **Status**: ✅ Skipped (2.1 chose PRIMARY)

- [x] **Task 2.6**: Remove `guestUsername` and the Nakama-random fallback from `GuestAuth.authenticate`
  - **Files**: `apps/mobile/src/online/nakama.ts`: delete `guestUsername` and `USERNAME_ALPHABET` use (`:97-112`); in `GuestAuth.authenticate` (`:319-333`) PRIMARY: send no username, one retry on 409; FALLBACK: send a `friendCodeCandidate()`, retry with a new one on 409 or `username_bad_code`, up to 3 tries; no `undefined` (Nakama-random) attempt in either path.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, code-quality-standards
  - **Dependencies**: Task 2.4 or Task 2.5 (whichever 2.1 chose)
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (no username sent, one 409 retry; random option removed)

- [x] **Task 2.7**: Add `Profile.friendCode` from `account.user.username`
  - **Files**: `apps/mobile/src/online/profile.ts` (`:168-189`): `Profile.friendCode: string | null` = normalized username when `isFriendCode`, else null (legacy `Guest-XXXX`); included in the cached profile (old cache entries without the field read as null).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns
  - **Dependencies**: Task 2.1 (case rule)
  - **Validation**: mobile typecheck; existing `profile.test.ts` passes
  - **Status**: ✅ Complete (Profile.friendCode via friendCodeOf; old cache → null)

- [x] **Task 2.8**: Server Vitest for the generator and the before-auth hook
  - **Files**: `apps/server/src/account/__tests__/friendCode.test.ts` (new): fixed byte vectors, profanity skip, max tries. `apps/server/src/account/__tests__/hooks.test.ts`: PRIMARY — missing, malformed (`Guest-AB12`), lowercase-valid and valid usernames, a clash retry via `usersGetUsername`, a profanity skip, never throws; FALLBACK — the three rejections with `username_bad_code` and numeric code 3. `apps/server/src/__tests__/fakes.ts`: add `usersGetUsername` and the random byte source fake.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 2.4 or Task 2.5, Task 2.3
  - **Validation**: `pnpm --filter @chkobba/server test` passes; existing hook assertions unchanged
  - **Status**: ✅ Complete (server 948 tests; friendCode.test.ts, hooks tests, fakes)

- [x] **Task 2.9**: Mobile Jest for `GuestAuth` on the chosen path and the profile mapping
  - **Files**: `apps/mobile/src/online/__tests__/nakama.test.ts`: no username sent (PRIMARY) or a valid candidate sent and retried up to 3 times (FALLBACK); no Nakama-random fallback; the 409 retry. `apps/mobile/src/online/__tests__/profile.test.ts`: `friendCode` from a valid username, null on `Guest-XXXX`, cached.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 2.6, Task 2.7
  - **Validation**: `pnpm --filter @chkobba/mobile test` passes
  - **Status**: ✅ Complete (mobile 1092 tests pass)

- [x] **Task 2.10**: Add the dev reset note to the local-backend how-to
  - **Files**: `docs/how-to/local-backend.md`: wiping the local database (`docker compose down -v`, then up) so every account has a friend code; existing `Guest-XXXX` accounts show no code.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 2.1
  - **Validation**: note present and the command works against `docker-compose.yml`
  - **Status**: ✅ Complete (wipe note in local-backend.md)

- [x] **Task 2.11**: Rebuild, confirm the module loads in goja, and run the manual account checks
  - **Files**: N/A (runtime check; fixes go in the files above)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 2.8, Task 2.9
  - **Validation**: module loads with the before-auth hook registered; `smoke_game` returns a winner; a fresh device account's username is an 8-character code from the alphabet; `beforeUpdateAccount` still rejects a username change with `username_locked`
  - **Status**: ✅ Complete (orchestrator, test stack :17350: module loads, before authenticatedevice registered, smoke_game winner, Guest-AB12 create → 6P97HDF8, username change → username_locked)

- [x] **Task 2.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 2.2, Task 2.10, Task 2.11
  - **Validation**: `pnpm test`, `pnpm lint`, `pnpm build` green
  - **Status**: ✅ Complete (rules 73, protocol 368, server 948, mobile 1092; lint/build/typecheck green)

- [x] **Task 2.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-friends-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 2.T
  - **Validation**: Phase 2 section written (including the 2.1 findings and the path chosen)
  - **Status**: ✅ Complete (orchestrator wrote Phase 2 staging section)

**Success criteria**
- Automated: server Vitest and mobile Jest pass; the module loads in goja.
- Manual: a fresh device account's username is an 8-character code; `beforeUpdateAccount` still rejects a username change; ADR-0003 records the verified path.

---

## Phase 3: Server friend rules and recent players (plan phase 2)

**Overview**: The server enforces request limits, records recent players at game end and when a player leaves, and exposes human user ids at the table.

- [x] **Task 3.1**: Verify Nakama's native block behaviour on 3.40
  - **Files**: N/A (live probe over REST with two fresh device sessions against Docker Nakama; findings in the task report and Phase 3 staging notes)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 2.X (phase 2 docs gate)
  - **Validation**: answers recorded for: after B blocks A, (a) A's `addFriends` B succeeds silently or errors, and B's list shows nothing new; (b) A's list no longer shows B (edge deleted); (c) a `-2` notification never reaches B; (d) after unblock, a new request works. Decision: **hook filter needed: yes/no** for blocked targets
  - **Status**: ✅ Complete — no hook filter needed: re-request from blocked user returns 200 {} and is dropped; block deletes the other edge; stale -2 from before the block stays in blocker's inbox (client must hide/delete); adding never unblocks

- [x] **Task 3.2**: Extend the nk fakes for friends, notifications and `matchSignal`
  - **Files**: `apps/server/src/__tests__/fakes.ts`: an in-memory friend graph with `friendsList(userId, limit, state, cursor)` (paging), `friendsAdd`, `friendsDelete`, `friendsBlock`; `usersGetUsername` (if 2.8 didn't); a recorded `notificationSend`; a scriptable `matchSignal`; a failing-storage switch for best-effort tests.
  - **Constraint**: Opt-in, so existing tests stay unchanged.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 2.X (phase 2 docs gate)
  - **Validation**: existing server tests pass unchanged
  - **Status**: ✅ Complete (fakes: friend graph w/ paging, notificationSend, matchSignal, storage failure switches; self-test)

- [x] **Task 3.3**: Implement the `registerBeforeAddFriends` hook and its pure classifier, and register it
  - **Files**: `apps/server/src/social/friendRules.ts` (new, pure): `classifyTargets(callerEdges, targetIds, targetEdgeCounts)` per technical decision 6 (state 2 = accept, counts toward 200 for both users; 0/1 = no-op; none = new request, counts toward 50); limit checks returning a `FriendErrorCode` or ok. `apps/server/src/social/friendHooks.ts` (new): `beforeAddFriends` requires `ctx.userId`; caps ids + usernames at `MAX_TARGETS_PER_REQUEST` (`friend_bad_request`, 3); resolves usernames (normalized per 2.1) with `nk.usersGetUsername`; lists the caller's edges (`nk.friendsList`, up to 1000 per state) and, for accepts, the other user's friend count; throws `friend_outgoing_limit`/`friend_limit`/`friend_their_limit` with code 8; drops the caller's own id; filters blocked targets only if 3.1 says so; `return data`. `apps/server/src/social/index.ts` (new). `apps/server/src/main.ts`: `registerBeforeAddFriends`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, security-specialist, type-safety-patterns
  - **Dependencies**: Task 3.1 (block filter decision)
  - **Validation**: server typecheck and build; hook is a top-level function in the bundle
  - **Status**: ✅ Complete (friendRules.ts classifyTargets/countEdges/checkFriendLimits; friendHooks.ts beforeAddFriends registered; no block filter per 3.1)

- [x] **Task 3.4**: Implement the pure recent-player helpers
  - **Files**: `apps/server/src/social/recentPlayers.ts` (new): `recordRecentTable(record, roster, ownerUserId, endedAt)` drops the owner and bots (roster holds humans only, but guard anyway), dedupes by `userId`, prepends, caps at `RECENT_TABLES_MAX`; `parseRecentPlayers(value)` treats any malformed record as `{ tables: [] }`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns
  - **Dependencies**: Task 2.X (phase 2 docs gate)
  - **Validation**: server typecheck and lint
  - **Status**: ✅ Complete (recentPlayers.ts)

- [x] **Task 3.5**: Implement the best-effort `social/recent_players` storage write
  - **Files**: `apps/server/src/social/recentStore.ts` (new): `writeRecentTable(nk, logger, ownerUserId, roster, endedAt)` read-modify-write on `SOCIAL_COLLECTION`/`RECENT_PLAYERS_KEY` owned by the user, `permissionRead 1`, `permissionWrite 0`; try/catch and `logger.warn`, never throws. Pattern: the server-owned `profile/name` record in `apps/server/src/account/hooks.ts:82-91`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 3.4
  - **Validation**: server typecheck and lint
  - **Status**: ✅ Complete (recentStore.ts writeRecentTable, read 1/write 0, never throws)

- [x] **Task 3.6**: Track the per-game roster in the match adapter
  - **Files**: `apps/server/src/match/tableMatch.ts`: `TableMatchState` gains `gameKey: string | null`, `roster: RosterEntry[]`, `recentWritten: string[]` (missing in older state reads as `null`/empty, like `emoteAt` at `:234-235`). When a game starts set `gameKey` (`${seed}:${gameNo}` on private tables using `room.gameNo`, the seed on public) and seed the roster from the human seats in seating order; on each loop, append any human now seated who isn't in the roster (covers private-table takeovers via `SIT`); when `gameKey` changes (new private game), reset `roster` and `recentWritten`.
  - **Constraint**: The pure core (`apps/server/src/table/`) stays untouched by recent-player logic.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, type-safety-patterns
  - **Dependencies**: Task 2.X (phase 2 docs gate)
  - **Validation**: server typecheck; existing `tableMatch.test.ts` passes unchanged
  - **Status**: ✅ Complete (gameRoster.ts trackRoster/gameKeyOf; state fields with old-state fallback)

- [x] **Task 3.7**: Write recent players on leave and on finish, once per player per game
  - **Files**: `apps/server/src/match/tableMatch.ts`: in `matchLeave` (`:127-140`, release `:298-307`), when a seated human is released while a game runs and isn't in `recentWritten`, call `writeRecentTable` with the current roster and add them; in `matchLoop` (`:143-162`), when the phase moves to `finished`, write for every roster member not yet in `recentWritten`. A reconnecting leaver is not written again.
  - **Constraint**: A storage failure never fails `matchJoin`, `matchLeave` or `matchLoop`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, type-safety-patterns
  - **Dependencies**: Task 3.5, Task 3.6
  - **Validation**: server typecheck; existing `tableMatch.test.ts` passes unchanged
  - **Status**: ✅ Complete (recordLeaver in matchLeave, recordFinished in matchLoop; guarded by recentWritten)

- [x] **Task 3.8**: Add `PlayerInfo.userId` for human seats in the projection
  - **Files**: `apps/server/src/table/projection.ts`: set `userId` from `HumanSeat.userId` (`apps/server/src/table/types.ts:28-38`) for human seats (including disconnected reserved ones); absent for bots and empty seats.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 2.X (phase 2 docs gate)
  - **Validation**: server typecheck; existing projection tests pass (add-only changes to fixtures if any assert exact `PlayerInfo` objects; note them)
  - **Status**: ✅ Complete (projection userId on human seats; 'no user ids' tests narrowed to session ids + ids only in players[]; 951 tests)

- [x] **Task 3.9**: Vitest for the before-AddFriends hook
  - **Files**: `apps/server/src/social/__tests__/friendRules.test.ts` (new) and `apps/server/src/social/__tests__/friendHooks.test.ts` (new): classification of each state; limit boundaries (50th outgoing ok, 51st `friend_outgoing_limit`; 200th friend ok, 201st `friend_limit`; accept when the other user is at 200 → `friend_their_limit`); accept counts for both users; usernames resolved (and case per 2.1); self id dropped; 11 targets → `friend_bad_request`; unauthenticated rejected; blocked targets handled per 3.1; numeric codes on every throw.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing, security-patterns
  - **Dependencies**: Task 3.2, Task 3.3
  - **Validation**: `pnpm --filter @chkobba/server test` passes
  - **Status**: ✅ Complete (friendRules 27 + friendHooks 42 tests; found prototype-key dedupe bug in classifyTargets → fixed by implementer)

- [x] **Task 3.10**: Vitest for recent players, the adapter writes and the projection `userId`
  - **Files**: `apps/server/src/social/__tests__/recentPlayers.test.ts` (new): owner and bots excluded, dedupe, 20-table cap, newest first, malformed record → empty. `apps/server/src/match/__tests__/tableMatch.test.ts`: a leaver written at leave time with everyone who sat so far; a leaver who reconnects not written again at finish; players seated at finish get every roster member, leavers included; a takeover appended to the roster; a second private game recorded separately; a failing storage doesn't break `matchLeave`/`matchLoop`; old state without the new fields. `apps/server/src/table/__tests__/projection.test.ts`: `userId` on human seats only; compare against `packages/protocol/src/testing/friendFixtures.ts`.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 3.2, Task 3.7, Task 3.8
  - **Validation**: `pnpm --filter @chkobba/server test` passes; existing assertions untouched
  - **Status**: ✅ Complete (recentPlayers/gameRoster/recentStore tests, 21 adapter tests, projection fixture compare; server 1118)

- [x] **Task 3.11**: Rebuild, confirm the module loads, and run the manual curl checks
  - **Files**: N/A (runtime check; fixes go in the files above)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 3.9, Task 3.10
  - **Validation**: module loads with the AddFriends hook; the 51st pending request is rejected with `friend_outgoing_limit`; a finished quick-match game leaves a `social/recent_players` record for each human; a player who left mid-game has one too
  - **Status**: ✅ Complete (test stack: hooks registered, smoke ok, 51st → 429 friend_outgoing_limit, finished game + mid-game leaver records present; e2e --quick-only passed 397 s)

- [x] **Task 3.C**: Contract validation: pin the hook error shapes, the live `userId` and the recent-players record the mobile client will map
  - **Files**: Phase 3 section of `context/docs/2026-10-30-friends-docs.md`: exact HTTP status and JSON body nakama-js sees for each `FRIEND_ERROR_CODES` value from `addFriends`; a live snapshot with `PlayerInfo.userId` compared against `packages/protocol/src/testing/friendFixtures.ts`; a real `recent_players` object as `readStorageObjects` returns it (value string vs object, permissions).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 3.11
  - **Validation**: every observed error `message` is in `FRIEND_ERROR_CODES`; fixtures updated if the live shape differs
  - **Status**: ✅ Complete (friend errors 400/429 bodies pinned; live userId matches fixture; recent_players value object in nakama-js, missing objects = empty)

- [x] **Task 3.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 3.C
  - **Validation**: `pnpm test`, `pnpm lint`, `pnpm build` green; Nakama restart loads the module
  - **Status**: ✅ Complete (rules 73, protocol 368, server 1118, mobile 1092; lint/build/typecheck green; test-stack Nakama loads module)

- [x] **Task 3.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-friends-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 3.T
  - **Validation**: Phase 3 section written (3.1 findings, 3.C contract)
  - **Status**: ✅ Complete (orchestrator; Phase 3 staging section)

**Success criteria**
- Automated: server Vitest passes; the module loads in goja.
- Manual: the 51st pending request is rejected with `friend_outgoing_limit`; finished games and mid-game leavers leave `recent_players` records.

---

## Phase 4: Mobile social services (plan phase 3)

**Overview**: The app has a `FriendsBackend` and an app-level `SocialSocket` for presence and notifications. No UI yet.

- [x] **Task 4.1**: Verify Nakama has no status-follow cap below 200 ids
  - **Files**: Temporary probe script in the scratchpad (nakama-js, two fresh sessions; one socket with `appearOnline: true` calling `followUsers` with 200 ids), not committed. Check the Nakama source/config (Context7, Heroic Labs docs) for any follow limit. Findings in the task report and Phase 4 staging notes.
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 3.X (phase 3 docs gate)
  - **Validation**: answers recorded: the effective cap (if any) per call and per session; whether two sockets per user work with the local config (no `single_socket`); decision: follow in one call, or chunk at N
  - **Status**: ✅ Complete — no per-session cap, but socket.max_message_size_bytes 4096 → max ~103 ids/call and an oversized call closes the socket; decision: chunk follows at 50; two sockets per user OK; track presences by session_id, apply leaves then joins

- [x] **Task 4.2**: Implement `FriendsBackend` over nakama-js
  - **Files**: `apps/mobile/src/online/friends.ts` (new): the plan's types (`FriendEntry`, `FriendsSnapshot`, `RecentPlayerEntry`, `FriendActionResult`, `CodeLookupResult`, `InviteResult`, `FriendsBackend`); `list()` via `listFriends` per state with cursor paging; `add` (`addFriends` by id; accepts incoming too), `remove` (`deleteFriends`: unfriend, decline, cancel, unblock), `block` (`blockFriends`); `lookupCode` via `normalizeFriendCode`/`isFriendCode` then `getUsers` by username (case per 2.1), `self` when it matches `Profile.friendCode`; `invite` via `rpc('invite_to_table')` (wired fully in Phase 7). Hook errors mapped from the response body using the shapes pinned in 3.C (same approach as `nameErrorFrom` in `apps/mobile/src/online/profile.ts`).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, security-patterns
  - **Dependencies**: Task 3.X (phase 3 docs gate), Task 3.C (error contract)
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (friends.ts NakamaFriendsBackend + pure helpers; note: nakama-js 2.8 drops friend update_time → updatedAt 0)

- [x] **Task 4.3**: Implement recent players: flatten, dedupe, drop blocked, enrich
  - **Files**: `apps/mobile/src/online/recentPlayers.ts` (new): reads `social/recent_players` via `readStorageObjects` (shape per 3.C), `parse` tolerant of malformed values, flattens tables, dedupes by user (newest wins), drops users in the blocked list, enriches with current `displayName` (`getUsers`) and friend `state`. `FriendsBackend.recentPlayers()` in `friends.ts` delegates here.
  - **Constraint**: Blocked users are filtered on every call, including right after a block.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns
  - **Dependencies**: Task 4.2
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (recentPlayers.ts parse/flatten/block filter/enrich)

- [x] **Task 4.4**: Pass `PlayerInfo.userId` through the decoder and into the client seat model
  - **Files**: `apps/mobile/src/online/protocol.ts` (snapshot decoder `:226-242`): keep `userId` when it is a string, drop it otherwise. `apps/mobile/src/game/GameClient.ts`: the seat/player info type gains optional `userId`. `apps/mobile/src/online/NakamaGameClient.ts`: map it through. `apps/mobile/src/game/LocalGameClient.ts`: no `userId` (offline).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, security-patterns
  - **Dependencies**: Task 3.X (phase 3 docs gate), Task 3.C (live shape)
  - **Validation**: mobile typecheck; existing `protocol.test.ts` and `NakamaGameClient.test.ts` pass unchanged
  - **Status**: ✅ Complete (decoder toPlayerInfo keeps userId if non-empty string ≤128; SeatInfo.userId; NakamaGameClient maps)

- [x] **Task 4.5**: Implement the presence status codec
  - **Files**: `apps/mobile/src/online/presence.ts` (new): `encodeStatus(activity)` → `JSON.stringify({ v: 1, a })`; `decodeAvailability(presence | null)` → `Availability` (`offline` without a presence; `lobby` → `online`, `room`, `playing`; unknown or malformed status counts as `online`).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns
  - **Dependencies**: Task 3.X (phase 3 docs gate)
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (presence.ts encodeStatus/decodeAvailability)

- [x] **Task 4.6**: Implement the `SocialSocket` connection lifecycle
  - **Files**: `apps/mobile/src/online/socialSocket.ts` (new): one shared socket created with the shared `Client` (`apps/mobile/src/online/services.ts`) and `connect(session, appearOnline: true)`; connects at launch only if a stored session exists (no account creation otherwise), else on first Friends or online use (`ensureConnected()`); disconnects on background (`AppState` native, `document.visibilitychange` web) and reconnects on foreground and after a network drop with backoff; injectable clock/scheduler for tests. `apps/mobile/src/online/nakama.ts`: expose session restore without sign-up if needed (`openSocket` `:466-485` stays for games).
  - **Constraint**: `NakamaGameClient`'s per-game socket is unchanged (`createStatus: false`).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, design-patterns, type-safety-patterns
  - **Dependencies**: Task 4.1 (two-socket confirmation)
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (SocialSocket lifecycle; GuestAuth.resume() never creates an account; backoff 1–30 s; background/foreground)

- [x] **Task 4.7**: Implement `SocialSocket` status, follows and notifications
  - **Files**: `apps/mobile/src/online/socialSocket.ts`: `setActivity('lobby' | 'room' | 'playing')` → `updateStatus(encodeStatus(...))`; follows mutual friends (chunked per 4.1) and re-follows when the list changes; `onstatuspresence` → `availability` map; `onnotification` for `FRIEND_REQUEST` (-2), `FRIEND_ACCEPT` (-3) and `TABLE_INVITE` (1, `TableInviteContent` validated with `isRoomCode`); on connect loads the persistent list (`listNotifications`) and deletes seen ones (`deleteNotifications`); notifications only trigger a `FriendsBackend.list()` refresh and a toast event (technical decision 8); expired invites (older than `INVITE_TTL_MS` by local clock) flagged; exposes `SocialState` (`connected`, `availability`, `incomingRequests`, `invites`) via subscribe.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, security-patterns, type-safety-patterns
  - **Dependencies**: Task 4.2, Task 4.5, Task 4.6
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (setActivity, 50-id follow chunks, session-keyed presence, notifications/invites, blocked -2 cleanup)

- [x] **Task 4.8**: Add the singletons and the `SocialProvider` at the root layout, with the activity API
  - **Files**: `apps/mobile/src/online/services.ts`: singletons for `FriendsBackend` and `SocialSocket` next to the existing ones. `apps/mobile/src/online/SocialProvider.tsx` (new): React context exposing `SocialState`, the friend actions, `setActivity` and `handInProgress` (set by the game screen, read by invite badge/banner logic); a `useSocial()` hook; a test-only context file (like `soundContext.ts`) so screens and tests don't import native pieces. `apps/mobile/src/app/_layout.tsx`: wrap the tree.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, design-patterns
  - **Dependencies**: Task 4.3, Task 4.7
  - **Validation**: mobile typecheck and lint; existing `services.test.ts` passes; the app starts offline without creating an account
  - **Status**: ✅ Complete (getFriendsBackend/getSocialSocket singletons; socialContext.ts test-safe; SocialProvider start()/stop(); wrapped in _layout)

- [x] **Task 4.9**: Jest for the backend, recent players, presence, decoder, notifications and connection rules
  - **Files**: `apps/mobile/src/online/__tests__/friends.test.ts` (new): state mapping and paging, code lookup (bad code, not found, self), error mapping for every `FRIEND_ERROR_CODES` value, network. `apps/mobile/src/online/__tests__/recentPlayers.test.ts` (new): dedupe newest wins, blocked filtered, malformed record. `apps/mobile/src/online/__tests__/presence.test.ts` (new): encode/decode, unknown or malformed → online. `apps/mobile/src/online/__tests__/socialSocket.test.ts` (new): request, accept, invite, expired invite; seen notifications deleted; re-follow on list change; no socket and no account creation without a stored session; connects on first online use; disconnects in background and reconnects on foreground; backoff. `apps/mobile/src/online/__tests__/protocol.test.ts`: `userId` passed through as string, dropped otherwise, using `friendFixtures`. `apps/mobile/src/online/__tests__/services.test.ts`: new singletons.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 4.4, Task 4.8
  - **Validation**: `pnpm --filter @chkobba/mobile test` passes; quick-match and `LocalGameClient` tests unchanged
  - **Status**: ✅ Complete (friends 111, recentPlayers 35, presence, protocol userId, socialSocket 84, services +8, SocialProvider 11; no bugs)

- [x] **Task 4.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 4.9
  - **Validation**: mobile test, typecheck, lint green; `pnpm test` green
  - **Status**: ✅ Complete (rules 73, protocol 368, server 1118, mobile 1368; lint/build/typecheck green)

- [x] **Task 4.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-friends-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 4.T
  - **Validation**: Phase 4 section written (4.1 findings, connection rules)
  - **Status**: ✅ Complete (orchestrator; Phase 4 staging section)

**Success criteria**
- Automated: mobile Jest and typecheck pass.
- Manual: quick match and `LocalGameClient` unchanged; ADR-0003's two-socket and status-privacy decisions hold.

---

## Phase 5: Friends UI (plan phase 4)

**Overview**: Players manage friends, requests, recent players and blocks from the app and the web build, on phone and desktop, in `en` and `aeb`.

- [x] **Task 5.1**: Add the `friends.*` keys in both catalogs and map the friend errors
  - **Files**: `apps/mobile/src/i18n/locales/en.ts` and `apps/mobile/src/i18n/locales/aeb.ts`: `friends.*` (titles, My code, Share, Copy, copied, link-unavailable hint, add-by-code label/placeholder/preview, "This is your code", "No player with this code", sections Requests/Friends/Recent players/Blocked, actions Accept/Decline/Cancel/Add friend/Remove/Block/Unblock, Request sent, Friends, confirmations for Remove and Block (explaining what blocking does), availability Online/In a room/In a game/Offline, empty states, errors for each `FRIEND_ERROR_CODES` value plus `not_found` and `network`), `lobby.friends` tile label, player-sheet labels. `apps/mobile/src/online/messages.ts`: friend error mapping.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: documentation-standards (i18n conventions in `docs/how-to/add-a-language.md`)
  - **Dependencies**: Task 4.X (phase 4 docs gate)
  - **Validation**: mobile typecheck (a missing `aeb` key fails it); `apps/mobile/src/i18n/__tests__/catalogs.test.ts` and `i18n.test.ts` pass
  - **Status**: ✅ Complete (friends.* in en/aeb, friendErrorMessage; lobby.friends existed)

- [x] **Task 5.2**: Implement `useFriendsController`, shared by both layouts
  - **Files**: `apps/mobile/src/friends/useFriendsController.ts` (new): sections from `FriendsSnapshot` + `SocialState` (friends sorted online first, then `room`/`playing`, then offline; incoming/outgoing; recent; blocked), pending-action tracking per user, optimistic updates with rollback on error, localized errors, refresh on social notification events, code lookup state.
  - **Constraint**: No layout code (same rule as `useTableController`).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, design-patterns, type-safety-patterns
  - **Dependencies**: Task 4.X (phase 4 docs gate)
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (useFriendsController: sections, overrides w/ rollback, pending, lookup, stale-response guards)

- [x] **Task 5.3**: Add the friend share link and an availability token if needed
  - **Files**: `apps/mobile/src/online/shareLink.ts` (created by private tables): add `friendShareLink(code)` → `${origin}${FRIEND_LINK_PATH}${code}` or null, reusing the same base-URL parse as `roomShareLink`. `apps/mobile/src/online/shareRoom.ts` (created by private tables): generalize or add a sibling so the friend code shares the link or the code alone, with the plain-http selectable-text fallback. Only if the availability dot needs it: one token in `apps/mobile/src/skins/types.ts` with a value in each of `apps/mobile/src/skins/{cafe/index.ts,minimal/index.tsx,sahara/index.ts,sidi/index.ts,neon/index.ts}`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, code-quality-standards
  - **Dependencies**: Task 4.X (phase 4 docs gate)
  - **Validation**: mobile typecheck and lint; existing share-link tests pass
  - **Status**: ✅ Complete (friendShareLink, shareFriendCode(message)/copyFriendCode raw code; onlineDot token in 5 skins)

- [x] **Task 5.4**: Build the friends components (My code, add by code, rows, sections, confirmations)
  - **Files**: `apps/mobile/src/components/friends/` (new): `MyCodeCard.tsx` (large `XXXX-XXXX` via `formatFriendCode` inside `DirectionView dir="ltr"`, Share and Copy), `AddByCode.tsx` (auto-formatted input checked with `isFriendCode`, lookup preview, Add; mirrors `apps/mobile/src/components/lobby/JoinCodeSheet.tsx`, created by private tables), `FriendRow.tsx` (avatar via skin `Avatar` slot, name, availability dot, row actions), `FriendsSections.tsx`, `ConfirmSheet.tsx` (on `LobbySheet`). Skins via `useSkin()` tokens and slots (`Panel`, `Avatar`); `marginStart`/`marginEnd`.
  - **Constraint**: No per-skin fork; all text via `useT()`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, code-quality-standards, i18n-patterns (auto-active; per `docs/how-to/add-a-language.md`)
  - **Dependencies**: Task 5.1, Task 5.2, Task 5.3
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (components/friends: MyCodeCard, AddByCode, FriendRow, FriendsSections, ConfirmSheet, FriendButton, useFriendActions)

- [x] **Task 5.5**: Wire the shared `NameGate` into sending a request and accepting
  - **Files**: `apps/mobile/src/friends/useFriendsController.ts` and `apps/mobile/src/components/friends/`: Add and Accept open `apps/mobile/src/components/lobby/NameGate.tsx` (created by private tables) on first use, then run the action; browsing, viewing your code and `/f/[code]` previews need no name.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards
  - **Dependencies**: Task 5.4
  - **Validation**: mobile typecheck and lint; behaviour matches ADR-0001 (Continue always calls `setDisplayName`)
  - **Status**: ✅ Complete (useNameGatedAction: Add/Accept gated; Remove/Block confirm)

- [x] **Task 5.6**: Add the `/friends` route for phone and desktop
  - **Files**: `apps/mobile/src/app/friends.tsx` (new): calls `ensureConnected()` on mount, renders `MyCodeCard`, `AddByCode` and the sections from `useFriendsController`; phone below 900 px stacked, desktop two columns (`useLayout()`, `apps/mobile/src/layout.ts`). `apps/mobile/src/app/_layout.tsx`: register if the Stack lists screens.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, i18n-patterns (auto-active)
  - **Dependencies**: Task 5.5
  - **Validation**: mobile typecheck and lint after typed routes regenerate (see 5.7)
  - **Status**: ✅ Complete (app/friends.tsx phone/desktop; sheet at root)

- [x] **Task 5.7**: Add the `/f/[code]` route and regenerate typed routes
  - **Files**: `apps/mobile/src/app/f/[code].tsx` (new): look up the code and show a preview card with Add friend (through the name gate), "This is your code", or "No player with this code"; invalid code formats show the not-found state. Then run `pnpm --filter @chkobba/mobile start` once to regenerate `apps/mobile/.expo/types/router.d.ts`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, i18n-patterns (auto-active)
  - **Dependencies**: Task 5.5
  - **Validation**: typed routes regenerated; mobile typecheck and lint pass
  - **Status**: ✅ Complete (app/f/[code].tsx; typed routes include /friends, /f/[code]; Href cast removed)

- [x] **Task 5.8**: Turn the home "Soon" friends tile live and show availability on the header chip
  - **Files**: `apps/mobile/src/app/index.tsx`: `tile-friends` (`:126`) opens `/friends` and shows the incoming-request badge from `useSocial()`; the header profile chip (`:90-98`) shows availability instead of "offline" while the social socket is connected. `apps/mobile/src/components/lobby/LobbyTile.tsx`: a badge prop if missing. Both home layouts.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, i18n-patterns (auto-active)
  - **Dependencies**: Task 5.1
  - **Validation**: mobile typecheck and lint; existing `LobbyScreen.test.tsx` passes (update only the "Soon" tile assertion if one exists, and note it)
  - **Status**: ✅ Complete (tile live + badge 9+, chip Online, setActivity lobby on focus; '/friends' as Href cast pending route — drop after 5.6/5.7)

- [x] **Task 5.9**: Add the table player sheet with Add friend and Block
  - **Files**: `apps/mobile/src/components/table/PlayerSheet.tsx` (new): for another human seat with a `userId`, Add friend (or Friends / Request sent / Accept), and Block with confirmation; blocking also mutes that seat's emotes via the per-seat mute in `apps/mobile/src/emotes/useEmotes.ts`. `apps/mobile/src/components/Seat.tsx`: tap opens the sheet only for other humans with a `userId` (not bots, empty seats, yourself, or offline games). `apps/mobile/src/game/useTableController.ts`: sheet open state. `apps/mobile/src/game/useTableKeyboard.ts`: no shortcuts while the sheet is open. `apps/mobile/src/components/table/DesktopLayout.tsx` and `PhoneLayout.tsx`: render the sheet.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, architecture-standards, i18n-patterns (auto-active)
  - **Dependencies**: Task 5.2, Task 5.5
  - **Validation**: mobile typecheck and lint; existing `GameTable.test.tsx` passes unchanged
  - **Status**: ✅ Complete (PlayerSheet, playerSheetTarget, keyboard guard, Seat onOpenPlayer via TableArea, mute button in sheet)

- [x] **Task 5.10**: RNTL tests for the friends screen, controller, code input, link route and name gate
  - **Files**: `apps/mobile/src/friends/__tests__/useFriendsController.test.ts` (new): sorting, optimistic update and rollback, errors. `apps/mobile/src/components/friends/__tests__/` (new): each section and action (Accept, Decline, Cancel, Add, Remove with confirm, Block with confirm, Unblock); code input normalization and preview; block hides the player from recent players right away. `apps/mobile/src/app/__tests__/friendLink.test.tsx` (new, or under `components/friends/__tests__/`): `/f/[code]` with your own code, an unknown code, a valid code. Name gate on send and accept, none on browse. `aeb` rendering with the code unmirrored; phone and desktop layouts. `apps/mobile/src/components/lobby/__tests__/LobbyScreen.test.tsx`: friends tile and badge.
  - **Constraint**: `await` every `render`/`fireEvent` (RNTL v14).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, accessibility-compliance
  - **Dependencies**: Task 5.6, Task 5.7, Task 5.8
  - **Validation**: `pnpm --filter @chkobba/mobile test` passes
  - **Status**: ✅ Complete (205 new tests: controller, AddByCode, sections, MyCodeCard, useFriendActions, friendRoutes; mobile 1665; no bugs)

- [x] **Task 5.11**: RNTL tests for the table player sheet
  - **Files**: `apps/mobile/src/components/table/__tests__/PlayerSheet.test.tsx` (new) and `apps/mobile/src/components/__tests__/GameTable.test.tsx`: sheet for a human, none for a bot, yourself, an empty seat or an offline game; block mutes that seat's emotes; keyboard shortcuts don't fire while the sheet is open; `aeb` rendering.
  - **Constraint**: `await` every `render`/`fireEvent` (RNTL v14).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.9
  - **Validation**: `pnpm --filter @chkobba/mobile test` passes
  - **Status**: ✅ Complete (PlayerSheet 51 tests, GameTable +26 incl. web keyboard guards; no bugs)

- [x] **Task 5.V**: Validate the i18n integration of the friends UI
  - **Files**: `apps/mobile/src/components/friends/`, `apps/mobile/src/components/table/PlayerSheet.tsx`, `apps/mobile/src/app/friends.tsx`, `apps/mobile/src/app/f/[code].tsx`, `apps/mobile/src/app/index.tsx`, `apps/mobile/src/online/messages.ts`, `apps/mobile/src/i18n/locales/en.ts`, `apps/mobile/src/i18n/locales/aeb.ts`
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration; no i18n-specialist agent exists)
  - **Skills**: code-quality-standards, accessibility-compliance
  - **Dependencies**: Task 5.10, Task 5.11 (all UI implementation tasks)
  - **Validation**: no hard-coded strings; every friend error localized in both catalogs; `marginStart`/`marginEnd` only; names isolated in RTL; friend codes stay LTR; i18n tests pass
  - **Status**: ✅ Complete (fixed name concatenation in spoken labels → friends.actionFor; rest clean)

- [x] **Task 5.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.V (i18n must be valid first)
  - **Validation**: mobile test, typecheck (after typed-route regeneration), lint green; `pnpm test` green; lockfile still Babel 7
  - **Status**: ✅ Complete (rules 73, protocol 368, server 1118, mobile 1665; lint/build/typecheck green; lockfile unchanged)

- [x] **Task 5.I**: Do the Derja wording pass and flag it for the user's review
  - **Files**: `apps/mobile/src/i18n/locales/aeb.ts` (the `friends.*`, `lobby.friends` and player-sheet keys)
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration; no i18n-specialist agent exists)
  - **Skills**: None
  - **Dependencies**: Task 5.T (tests must pass first)
  - **Validation**: typecheck and tests green; changed strings listed in the task report; user review recorded
  - **Status**: ✅ Complete — 71 keys reviewed, 6 changed; table at jobs/6f7e37fd/tmp/derja-friends-review.md; ⏳ user sign-off pending (4 flagged)

- [x] **Task 5.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-friends-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 5.I
  - **Validation**: Phase 5 section written
  - **Status**: ✅ Complete (orchestrator; Phase 5 staging section)

- [x] **Task 5.U**: Validate the friends flows in two browser windows at desktop and phone widths, in both languages
  - **Files**: N/A (Playwright validation against the web app at `http://localhost:8081` and local Nakama). Evidence in `.playwright-mcp/5u-*`.
  - **Assigned Agent**: ui-explorer (Tier 4 - UI Validation)
  - **Skills**: accessibility-compliance
  - **Dependencies**: Task 5.X
  - **Validation**: ✅ Complete at 1280 px in `en` and `aeb`, on two fresh accounts (`BXWN-9AX4`, `8FU4-D7NQ`): add by code (lowercase, self-formatting), incoming request, accept, mutual list, availability changing live without a refresh, add by link, add from a player sheet (human seat only — a bot seat offers emotes only), block (request silently dropped, friend removed, recent list hides them), unblock then re-request, RTL mirroring with the code staying LTR, zero console errors. 390 px: ✅ verified separately (see Task 7.U).
  - **Status**: ✅ Complete — two findings recorded in Phase 8 docs: legacy accounts have no code and no way to get one, and blocking also removes the friendship (so unblocking restores re-requesting, not the friendship)

**Success criteria**
- Automated: mobile Jest, typecheck and lint pass.
- Manual: the Task 5.U scenarios; the user reviewed the Derja strings from 5.I.

---

## Phase 6: End-to-end friends check (plan phase 5)

**Overview**: Prove friends, limits, presence, block and recent players on real Nakama.

- [x] **Task 6.1**: Extend the e2e script with the friends, presence and block scenario
  - **Files**: `apps/server/scripts/e2e.ts`: two fresh accounts get valid codes; A adds B by code; B receives `-2` and accepts; A receives `-3`; both list state 0; both connect social sockets (`appearOnline: true`) and see each other online, then `playing` after a status update; A removes B; B blocks A, A's new request doesn't reach B; B unblocks.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.U (phase 5 complete; Task 5.X is its docs gate)
  - **Validation**: server typecheck (including `apps/server/scripts/tsconfig.json`) passes
  - **Status**: ✅ Complete (runFriends: codes, add by lowercase code, -2/-3, presence joins+leaves, remove, block/unblock; --friends-only 2.3 s)

- [x] **Task 6.2**: Add the recent-players and outgoing-limit checks to the e2e script
  - **Files**: `apps/server/scripts/e2e.ts`: after the existing quick-match game finishes, each human's `recent_players` lists the other human and no bots; a player who leaves mid-game has a record written at leave time; a loop of requests to 51 throwaway accounts hits `friend_outgoing_limit` at 51 (behind a flag if it grows slow, per the plan risk).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 6.1
  - **Validation**: server typecheck passes; existing scenarios unchanged
  - **Status**: ✅ Complete (recent players after quick match, runLeaverGame, --limits outgoing check)

- [x] **Task 6.3**: Run the extended e2e against Docker Nakama and fix any failures
  - **Files**: N/A (runtime; fixes go in the server, mobile services or the e2e script)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 6.2
  - **Validation**: after build and `docker compose restart nakama`: `pnpm --filter @chkobba/server e2e` passes; existing quick-match and private-table scenarios unchanged; run time recorded
  - **Status**: ✅ Complete (test stack: default e2e 464 s all sections PASS incl. recent players, leaver 16.7 s, private 76 s, friends 2.3 s; --friends-only --limits 2.4 s PASS; no fixes)

- [x] **Task 6.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 6.3
  - **Validation**: `pnpm test` and `pnpm lint` green after any 6.3 fixes
  - **Status**: ✅ Complete (mobile 1668, server 1118, protocol 368, rules 73; lint/typecheck green)

- [x] **Task 6.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-friends-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 6.T
  - **Validation**: Phase 6 section written
  - **Status**: ✅ Complete (orchestrator; Phase 6 staging section)

**Success criteria**
- Automated: `pnpm --filter @chkobba/server e2e` passes; existing scenarios unchanged.
- Manual: none.

---

## Phase 7: Invites to private tables (plan phase 6)

**Overview**: A player in a private waiting room invites online friends, and an invited friend joins with one tap. Requires private tables' `create_private_table`, `join_by_code`, the `private_table` mapping, room `members` and the `/t/[code]` route.

- [x] **Task 7.1**: Verify `nk.matchSignal` from an RPC on Nakama 3.40: reply data and latency
  - **Files**: Temporary probe only: a scratch RPC calling `nk.matchSignal(matchId, 'ping')` on a live `chkobba_table` with a temporary `matchSignal` that returns `'pong'`, built and loaded in Docker, then **reverted**. Findings in the task report and Phase 7 staging notes.
  - **Constraint**: The probe never lands in a commit.
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 6.X (phase 6 docs gate)
  - **Validation**: answers recorded: the RPC receives the handler's returned `data` string; round-trip latency over 10 calls at the 1 Hz tick (expected up to about 1 s); the error thrown for a dead or unknown match id. Decision: proceed with `matchSignal` membership, or record the alternative
  - **Status**: ✅ Complete (folded into 7.13's live run — no throwaway probe needed): the RPC receives the handler's `'yes'`/`'no'` data (an invite succeeded for a present member and answered `invite_not_member` under 403 for a non-member); a dead/unknown code is refused as 404 by `readCode` + `isLivePrivateMatch` before any signal; the three-way invite+signal round trip completed well inside 2 s. Decision: proceed with `matchSignal` membership, no alternative needed

- [x] **Task 7.2**: Answer `MemberQuery` in the adapter's `matchSignal`
  - **Files**: `apps/server/src/social/matchSignal.ts` (new): `MemberQuery` type and a pure `answerSignal(state, data)` → `'yes' | 'no'` (present member of a private room; `'no'` for public tables and malformed data). `apps/server/src/match/tableMatch.ts` (`matchSignal` `:177-187`): return `{ state, data: answerSignal(...) }`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 7.1
  - **Validation**: server typecheck; existing `tableMatch.test.ts` passes
  - **Status**: ✅ Complete (reconciled — matchSignal.ts with parseMemberQuery/answerSignal; adapter returns its data; live behaviour confirmed in 7.13)

- [x] **Task 7.3**: Implement the pure invite window and dedupe helpers
  - **Files**: `apps/server/src/social/inviteLimits.ts` (new): over `InviteLimitsRecord`, `now` injected: prune `pending` entries older than `INVITE_TTL_MS`; `isDuplicate(record, friendId, code, now)`; `checkWindow` (`INVITE_LIMIT` per `INVITE_WINDOW_MS`, fixed window); `recordSend`. A duplicate doesn't count toward the limit.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 6.X (phase 6 docs gate)
  - **Validation**: server typecheck and lint
  - **Status**: ✅ Complete (inviteLimits.ts pure, null-prototype pending map; 37 tests)

- [x] **Task 7.4**: Implement the `invite_to_table` RPC and register it
  - **Files**: `apps/server/src/social/inviteToTable.ts` (new), top-level named function: require `ctx.userId`; validate the id and `isRoomCode` (`invite_bad_request`, 3); mutual friend via `nk.friendsList` state 0 (`invite_not_friend`, 9); code → match via `readCode` in `apps/server/src/rpc/roomStore.ts` (created by private tables) plus `nk.matchGet` liveness (`invite_room_not_found`, 5); membership via `nk.matchSignal(matchId, JSON.stringify({ type: 'is_member', userId }))` (`invite_not_member`, 7); window and dedupe on `social/invite_limits` (0/0) (`invite_rate_limited`, 8); a repeat within `INVITE_TTL_MS` returns `{ sent: false }`; else `nk.notificationSend(target, 'table_invite', TableInviteContent, NOTIFICATION_CODES.TABLE_INVITE, ctx.userId, true)` and `{ sent: true }`. `fromName` from the caller's display name. `apps/server/src/main.ts`: `registerRpc('invite_to_table', …)`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, security-specialist, type-safety-patterns
  - **Dependencies**: Task 7.1, Task 7.2, Task 7.3
  - **Validation**: server typecheck and build; RPC is a top-level function in the bundle
  - **Status**: ✅ Complete (inviteToTable.ts + registerRpc; codes 16/3/9/5/7/8; top-level in bundle; not re-exported from social/index to avoid an import cycle)

- [x] **Task 7.5**: Add the optional `RoomMember.userId` end to end
  - **Files**: `packages/protocol/src/room.ts` (created by private tables): `RoomMember.userId?: string`. `apps/server/src/table/projection.ts`: set it for members. `apps/mobile/src/online/protocol.ts`: pass it through when a string. `apps/mobile/src/game/GameClient.ts` (`RoomState.members`) and `apps/mobile/src/online/NakamaGameClient.ts`: map it. `packages/protocol/src/testing/roomFixtures.ts` (created by private tables): add `userId` to member fixtures.
  - **Constraint**: Additive only.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, security-patterns
  - **Dependencies**: Task 6.X (phase 6 docs gate)
  - **Validation**: protocol, server and mobile typecheck; existing room tests pass
  - **Status**: ✅ Complete (RoomMember.userId protocol→projection→decoder→RoomMemberView; projection privacy tests updated)

- [x] **Task 7.6**: Wire `FriendsBackend.invite` and the room/game activity
  - **Files**: `apps/mobile/src/online/friends.ts`: `invite(userId, roomCode)` maps `{ sent }` and `INVITE_RPC_ERROR_CODES` (shapes pinned in 7.13 may refine it). `apps/mobile/src/components/room/PrivateSession.tsx` (created by private tables): `setActivity('room')` in the waiting room and `'playing'` during a game; set `handInProgress`. `apps/mobile/src/app/game.tsx`: `'playing'` during public online games, `'lobby'` on leave. `apps/mobile/src/app/index.tsx`: `'lobby'` on focus.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, architecture-standards
  - **Dependencies**: Task 7.4 (RPC shape), Task 7.5
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (reconciled — `invite()` with `inviteResultFromPayload`/`inviteErrorFrom`; `useSocialActivity` used by PrivateSession, game.tsx and index.tsx)

- [x] **Task 7.7**: Add the `invite.*` keys in both catalogs
  - **Files**: `apps/mobile/src/i18n/locales/en.ts` and `apps/mobile/src/i18n/locales/aeb.ts`: `invite.*` (Invite friends, Invite, Invited, sheet title, empty state, banner "{{name}} invites you to a table", Join, Dismiss, "This table has closed", badge label, errors for each `INVITE_RPC_ERROR_CODES` value). `apps/mobile/src/online/messages.ts`: invite error mapping.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: documentation-standards (i18n conventions in `docs/how-to/add-a-language.md`)
  - **Dependencies**: Task 6.X (phase 6 docs gate)
  - **Validation**: mobile typecheck; i18n tests pass
  - **Status**: ✅ Complete (invite.* en/aeb incl. badge plurals, errors satisfies; inviteErrorMessage)

- [x] **Task 7.8**: Add the "Invite friends" sheet to the waiting room
  - **Files**: `apps/mobile/src/components/room/InviteFriendsSheet.tsx` (new, on `LobbySheet`): online friends with availability, online and lobby first; each row Invite → "Invited" after a send or a repeat; errors localized; inviting goes through `apps/mobile/src/components/lobby/NameGate.tsx` (created by private tables). `apps/mobile/src/components/room/PrivateRoom.tsx` (created by private tables): the "Invite friends" button, for any member. `apps/mobile/src/game/useRoomController.ts` (created by private tables): the room code for the invite.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, i18n-patterns (auto-active)
  - **Dependencies**: Task 7.6, Task 7.7
  - **Validation**: mobile typecheck and lint
  - **Status**: ✅ Complete (InviteFriendsSheet: sort, Invite→Invited, errors, name gate; room-invite button for all members)

- [x] **Task 7.9**: Show incoming invites: badge during a hand, banner on lobby screens and after a game
  - **Files**: `apps/mobile/src/components/friends/InviteBanner.tsx` (new): "{{name}} invites you to a table" with Join (`router.push('/t/CODE')`, the route created by private tables) and Dismiss (deletes the notification); expired (older than `INVITE_TTL_MS`, or `room_not_found` on Join) shows "This table has closed". `apps/mobile/src/components/table/TablePanels.tsx` (or the table menu button in `DesktopLayout.tsx`/`PhoneLayout.tsx`): a quiet badge while `handInProgress`. `apps/mobile/src/app/index.tsx` and the end-of-game summary (`apps/mobile/src/components/RoundSummary.tsx` / `PrivateSession.tsx`): render the banner when not mid-hand.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, i18n-patterns (auto-active)
  - **Dependencies**: Task 7.7
  - **Validation**: mobile typecheck and lint; no banner ever covers a hand in progress
  - **Status**: ✅ Complete (reconciled — InviteBanner + InviteBadge; rendered by index.tsx, friends.tsx, RoundSummary and TablePanels; hidden while `handInProgress`)

- [x] **Task 7.10**: Offer Add friend on room members
  - **Files**: `apps/mobile/src/components/room/RoomSeat.tsx` (created by private tables) and the standing list in `PrivateRoom.tsx`: tapping another human member with a `userId` opens `apps/mobile/src/components/table/PlayerSheet.tsx` (from 5.9).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance
  - **Dependencies**: Task 7.5
  - **Validation**: mobile typecheck and lint; existing `PrivateRoom.test.tsx` passes (sit and switch still work on seat taps for empty seats)
  - **Status**: ✅ Complete (PlayerSheetView refactor; room seat/standing member player options; sit/switch unchanged)

- [x] **Task 7.11**: Vitest for `invite_to_table` and `matchSignal` membership
  - **Files**: `apps/server/src/social/__tests__/inviteLimits.test.ts` (new): window boundary (20th ok, 21st limited), window reset, prune, duplicate doesn't count. `apps/server/src/social/__tests__/inviteToTable.test.ts` (new): each error with its numeric code; unauthenticated; dedupe no-op `{ sent: false }` and a re-send after `INVITE_TTL_MS`; exactly one persistent notification with code 1 and valid `TableInviteContent` on success. `apps/server/src/match/__tests__/tableMatch.test.ts`: `matchSignal` answers yes for a present member, no for a left member, a public table and malformed data.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing, security-patterns
  - **Dependencies**: Task 7.4
  - **Validation**: `pnpm --filter @chkobba/server test` passes
  - **Status**: ✅ Complete (inviteToTable 38 tests; matchSignal 8; inviteLimits +1 → 38; server 1202; no defects; lowercase codes normalized)

- [x] **Task 7.12**: Jest and RNTL for the invite sheet, badge, banner, expiry and Join
  - **Files**: `apps/mobile/src/components/room/__tests__/InviteFriendsSheet.test.tsx` (new): sorting, Invite → Invited, repeat shows Invited, errors, name gate. `apps/mobile/src/components/friends/__tests__/InviteBanner.test.tsx` (new): banner on lobby, Join navigates to `/t/CODE`, Dismiss deletes, expired shows closed, `room_not_found` on Join shows closed. `apps/mobile/src/components/__tests__/GameTable.test.tsx`: badge during a hand, banner after the game. `apps/mobile/src/online/__tests__/friends.test.ts`: invite mapping. `apps/mobile/src/online/__tests__/protocol.test.ts`: `RoomMember.userId`.
  - **Constraint**: `await` every `render`/`fireEvent` (RNTL v14).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 7.8, Task 7.9, Task 7.10
  - **Validation**: `pnpm --filter @chkobba/mobile test` passes
  - **Status**: ✅ Complete (InviteBanner 5 tests + GameTable 3; friends.test.ts, protocol.test.ts and InviteFriendsSheet.test.tsx already covered; mobile 1741; no defects)

- [x] **Task 7.13**: Rebuild, confirm the module loads, and pin the invite contract
  - **Files**: Phase 7 section of `context/docs/2026-10-30-friends-docs.md`: HTTP status and body for each `INVITE_RPC_ERROR_CODES` value; the success body (JSON string vs object); a real `TABLE_INVITE` notification as nakama-js receives it (content string, code, persistent, sender id).
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 7.11
  - **Validation**: module loads with `invite_to_table` registered; observed shapes match what 7.6 maps (7.6 adjusted if not)
  - **Status**: ✅ Complete (main local stack :7350: module loads with `invite_to_table` registered; `smoke_game` returns a winner; live `--invite-only` 2.5 s PASS. Contract observed: success `200 {"sent":true}` / repeat `200 {"sent":false}`; errors `{"code":N,"message":"invite_*"}` — 400/9 `invite_not_friend`, 404/5 `invite_room_not_found`, 403/7 `invite_not_member`; exactly one persistent `TABLE_INVITE` (code 1) with `{v:1, code, fromName}` via socket+inbox. 7.6's mapping matches, no adjustment needed)

- [x] **Task 7.14**: Extend the e2e script with the invite scenario
  - **Files**: `apps/server/scripts/e2e.ts`: A (friends with B) creates a private table and invites B; a second invite is a no-op (`sent: false`); B receives exactly one notification, joins by its code and lands in the room; an invite to a non-friend fails with `invite_not_friend`.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 7.13
  - **Validation**: server typecheck (including scripts) passes
  - **Status**: ✅ Complete (separate `runInvites()`; flags `--invite`, `--invite-only`, `--full`; real contract asserted: B auto-sits at seat 1 in a waiting room, not `seat: -1`; `MEMBER_KEYS` whitelist gained `userId`)

- [x] **Task 7.15**: Cross-check the invite RPC contract against the client mapping and messages
  - **Files**: `apps/mobile/src/online/friends.ts`, `apps/mobile/src/components/room/InviteFriendsSheet.tsx`, `apps/mobile/src/components/friends/InviteBanner.tsx` against `apps/server/src/social/inviteToTable.ts` and the 7.13 notes
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 7.12, Task 7.13
  - **Validation**: every error the RPC can throw has a client mapping and a localized message; the notification decoder accepts the live payload
  - **Status**: ✅ Complete (PASS, no files changed: all 5 wire codes mapped + localized in en/aeb (+`network` for the documented 401 exception); `parseInviteContent` accepts object or string and matches the live payload; expiry at `INVITE_TTL_MS`. Notes: 401 shows the `network` copy; `subject` is not validated; client id check trims, server does not — all non-defects)

- [x] **Task 7.16**: Run the e2e against Docker Nakama and fix any failures
  - **Files**: N/A (runtime; fixes go in the server, mobile or the e2e script)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 7.14
  - **Validation**: `pnpm --filter @chkobba/server e2e` passes, including the friends and private-table scenarios
  - **Status**: ✅ Complete (main local stack :7350, 675.8 s PASS: quick 580.2 s, leaver 16.1 s, private 77.2 s, friends 2.3 s; invite scenario `--invite-only` 2.5 s PASS. One e2e fix: the room-join assertion now checks member userIds instead of friend-code names, since `afterAuthenticateDevice` sets a random `Player####` display name)

- [x] **Task 7.V**: Validate the i18n integration of the invite UI
  - **Files**: `apps/mobile/src/components/room/InviteFriendsSheet.tsx`, `apps/mobile/src/components/friends/InviteBanner.tsx`, the badge in `apps/mobile/src/components/table/`, `apps/mobile/src/online/messages.ts`, `apps/mobile/src/i18n/locales/en.ts`, `apps/mobile/src/i18n/locales/aeb.ts`
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration; no i18n-specialist agent exists)
  - **Skills**: code-quality-standards, accessibility-compliance
  - **Dependencies**: Task 7.15, Task 7.16 (all UI implementation tasks)
  - **Validation**: no hard-coded strings; every invite error localized in both catalogs; `{{name}}` isolated in RTL; room codes stay LTR; i18n tests pass
  - **Status**: ✅ Complete (fixed 2 hard-coded `", "` accessibility-label separators in InviteBanner → `friends.actionFor`; all 6 invite error keys correct in en+aeb; names interpolated; codes LTR; mobile 1741 green)

- [x] **Task 7.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 7.V
  - **Validation**: ✅ Complete — `pnpm test` 3384/3384 (rules 73, protocol 368, server 1202, mobile 1741), `pnpm lint`, `pnpm build`, both typechecks (server incl. `scripts/tsconfig.json`) green. Lockfile still Babel 7 core (7.29.7; the only major-8 package is `babel-plugin-istanbul`, already committed and not Babel core).
  - **Status**: ✅ Complete

- [x] **Task 7.I**: Do the Derja wording pass for `invite.*` and flag it for the user's review
  - **Files**: `apps/mobile/src/i18n/locales/aeb.ts` (`invite.*`, 11 of 18 strings changed): the whole family moved from `عيّط`/`عيطة` (call/shout) to `دعوة`/`دعا` (invitation/invite), including the `_other` plural `دعوات` and the three error sentences that used the old term. 7 keys reviewed and left unchanged. Review notes in `context/docs/2026-10-30-friends-derja-review.md` (Phase 7 appendix).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration; no i18n-specialist agent exists)
  - **Skills**: None
  - **Dependencies**: Task 7.T
  - **Validation**: ✅ Partly — `pnpm --filter @chkobba/mobile typecheck` exit 0; i18n suites 18/18 (key and placeholder parity with `en.ts` enforced by `catalogs.test.ts`). ⏳ **User sign-off pending** on the 5 flagged items (the noun `دعوة` as a button, `دعيتو` vs `دعّيتو`, `تدعي` homograph, `يدعيك` reading, `_other` covering 11+).
  - **Status**: ✅ Complete — awaiting the user's wording review

- [x] **Task 7.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-friends-docs.md` — `## Phase 7: Table invites` (changes, the live contract table from 7.13, the two behaviours the code forced, the e2e runs, the Derja note, the deferred 7.U). `context/docs/2026-10-30-friends-derja-review.md` — Phase 7 appendix (11 changed strings, 7 kept, 5 flags).
  - **Assigned Agent**: docs-maintainer (Always Available) — written by the orchestrator, which owns `context/docs/`
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.I
  - **Validation**: ✅ Complete — Phase 7 section written (7.1 findings, 7.13 contract, 7.16 run).
  - **Status**: ✅ Complete

- [x] **Task 7.U**: Validate the invite flows in two browser windows
  - **Files**: N/A (Playwright validation against local web and local Nakama). Evidence in `.playwright-mcp/7u-*`.
  - **Assigned Agent**: ui-explorer (Tier 4 - UI Validation)
  - **Skills**: accessibility-compliance
  - **Dependencies**: Task 7.X
  - **Validation**: ✅ Complete — invite from the room shows "Invited"; the invitee's lobby shows "Ali invites you to a table" with Join/Dismiss; Join lands them **seated** in `/t/<code>` with the banner gone; mid-hand the same invite shows as a badge (`1 table invite`) and no banner, then as a banner on the lobby after the hand; a closed table shows "This table has closed" with Dismiss only (no Join, so there is nothing to strand on). 1280 px in `en` and `aeb`, plus 390 px in `aeb` (banner present, RTL, no horizontal overflow). Zero console errors.
  - **Status**: ✅ Complete — two notes for the docs: the invite sheet exists only in the waiting room (`PrivateSession` renders only `GameTable`), so an in-game invitation must be sent from another device; and the closed banner removes Join rather than letting it fail

**Success criteria**
- Automated: server Vitest, mobile Jest, typecheck, lint and e2e pass.
- Manual: the Task 7.U scenarios; the user reviewed the 7.I strings; invites follow ADR-0003 (status never carries a code).

---

## Phase 8: Finalization (plan phase 7)

**Overview**: The docs match the shipped behaviour, ADR compliance is confirmed, and the staging notes are merged.

- [x] **Task 8.1**: Update the wire protocol reference
  - **Files**: `docs/reference/wire-protocol.md` — new `## Friends` section (friend codes and `/f/` links, optional `userId` fields, notification codes and `TableInviteContent`, `PresenceStatus`, `invite_to_table` with the live-verified HTTP/gRPC error table and limits, both storage records with permissions, `FRIEND_ERROR_CODES` and `FRIEND_LIMITS`); `PlayerInfo` and `RoomInfo` in **Snapshot** updated in place. `docs/README.md` unchanged (its index entry already covers it). `username_bad_code` omitted — the fallback path did not ship.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.U (phase 7 complete; Task 7.X is its docs gate)
  - **Validation**: ✅ Complete — every listed item documented and re-verified against `packages/protocol/src/friends.ts`, `apps/server/src/social/*` and `apps/server/src/table/projection.ts`; no mismatches found. Run before 7.U/7.X (deferred browser gate), whose outcome cannot change the contract documented here.
  - **Status**: ✅ Complete

- [x] **Task 8.2**: Add a "Friends" section to the architecture explanation
  - **Files**: `docs/explanation/multiplayer-architecture.md` — new `## Friends` section after "Display names": friend codes and the AddFriends hook, recent players and the leaver gap, the social socket and its connection rules, presence privacy, invites, client structure. Links ADR-0003 and the wire reference.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.U (phase 7 complete)
  - **Validation**: ✅ Complete — section present and links ADR-0003. Correction recorded for Task 8.4: the game socket's status flag is the `socket.connect(session, false)` argument in `apps/mobile/src/online/nakama.ts`, not a flag on `client.createSocket` (nakama-js 2.8: that third argument is `verbose`).
  - **Status**: ✅ Complete

- [x] **Task 8.3**: Add the how-to for testing friends across two browsers or LAN devices
  - **Files**: `docs/how-to/test-friends.md` (new, 81 lines: before you start, which account a window gets, two accounts on one machine, a LAN device, checklist, related); `docs/README.md` (+1 index row).
  - **Constraint**: No deployment or hosting instructions. ✅ respected
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.U (phase 7 complete)
  - **Validation**: ✅ Complete — page present and indexed; every step checked against `deviceIdStore.web.ts`, `profile.ts`, `shareLink.ts`, `useFriendsController.ts`, `PlayerSheet`, `RoomSeat`, `presence.ts` and the `friends.*` labels.
  - **Status**: ✅ Complete

- [x] **Task 8.4**: Update CLAUDE.md status, Identity, Key Patterns and Project Structure
  - **Files**: `CLAUDE.md`: Status (Friends v1 bullet; `invite_to_table` in the module's RPC list); Commands (e2e line: friends ~3 min, invites ~3 min, `--friends-only`, `--invite-only`, and `--invite` to add invites outside `--full`); Project Structure (`src/social/`, `src/online/friends.ts`, `socialSocket.ts`, `SocialProvider.tsx`, `src/friends/`, `components/friends/`, `/friends`, `/f/[code]`); Identity (the `username` is the visible friend code — 8 chars, `XXXX-XXXX`, assigned server-side, legacy `Guest-XXXX` accounts show none, ADR-0003 replaces "hidden handle"); Key Patterns (new **Friends** bullet: separate social socket, presence never carries a code, invite validation/limits/dedupe, recent players on leave and finish, AddFriends hook and the expected blocked-sender 200).
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 8.1, Task 8.2, Task 8.3
  - **Validation**: ✅ Complete — reflects the shipped behaviour; links resolve; two brief claims corrected against the code: `beforeAuthenticateDevice` runs on every sign-in (Nakama merely ignores `data.username` then) and there is no `--friends` flag.
  - **Status**: ✅ Complete

- [x] **Task 8.5**: Verify the implementation follows ADR-0003, the ADR-0001 amendment and ADR-0002
  - **Files**: read-only across the three ADRs, `packages/protocol/src/{friends,index,room}.ts`, `apps/server/src/{account,social,match,rpc,table}/`, `apps/mobile/src/online/`; findings written to `context/docs/2026-10-30-friends-docs.md` Phase 8 → "ADR compliance".
  - **Assigned Agent**: codebase-analyzer (Tier 3 - Research/Exploration)
  - **Skills**: architecture-decision-records, architecture-standards
  - **Dependencies**: Task 8.4
  - **Validation**: ✅ Complete — **no functional deviations**. Codes server-generated from `nk.secureRandomBytes`, profanity- and clash-screened; presence has one writer and no code/id; game socket still `connect(session, false)`; all five storage records have the specified permissions; no code in a label or presence. Six ADR-text items are out of date (D1–D6 in the staging doc) and are 8.F amendments; the uncovered decisions list is recorded there too. One non-security `Math.random` remains (default `Player####` display name) — stated explicitly so it is not read as an oversight.
  - **Status**: ✅ Complete

- [x] **Task 8.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 8.5
  - **Validation**: ✅ `pnpm build` (bundle 181,027 B in 844 ms), `pnpm test` 3384/3384 (rules 73, protocol 368, server 1202, mobile 1741 — identical to 7.T), `pnpm lint`, server typecheck (incl. `scripts/`) and mobile typecheck all exit 0. The 7.16 e2e stands: nothing under `apps/server`, `packages/` or the mobile runtime changed since (only `aeb.ts` values, `CLAUDE.md` and `docs/`).
  - **Status**: ✅ Complete — Nakama restarted cleanly (`Chkobba module loaded`, `invite_to_table` registered), smoke game 200 (`23-9`, 8 rounds, 117 ms)

- [x] **Task 8.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-friends-docs.md` — `## Phase 8: Finalization` (docs changes, the ADR compliance table with D1–D6 and the amendment record, the uncovered decisions, the 8.T validation). Phase 7 gained the browser-validation section replacing its deferred note.
  - **Assigned Agent**: docs-maintainer (Always Available) — written by the orchestrator, which owns `context/docs/`
  - **Skills**: documentation-standards
  - **Dependencies**: Task 8.T
  - **Validation**: ✅ Complete — Phase 8 section written.
  - **Status**: ✅ Complete

- [x] **Task 8.F**: Merge the staged notes into the permanent Diataxis docs and delete the staging file
  - **Files**: `docs/reference/wire-protocol.md` (new `### Blocking` under `## Friends`; two `invite_to_table` bullets — the ~1 s `matchSignal` round trip and the waiting-room auto-seat/standing boundary); `docs/how-to/test-friends.md` (legacy-account item tightened; block/unblock steps and checklist rows corrected); `docs/explanation/multiplayer-architecture.md` (client-behaviour paragraph under `### Invites`); `docs/how-to/local-backend.md` (`Run the end-to-end test`: flags, leaver and friends checks, timeout); `docs/adr/0001/0002/0003` and `docs/adr/README.md` (amendments applied earlier in this task); `context/docs/2026-10-30-friends-docs.md` deleted.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 8.X
  - **Validation**: ✅ Complete — every substantive staging fact now lives under `docs/` or was deliberately dropped as already covered; nothing duplicated; staging file deleted (the sub-agent lacked a shell tool, so the orchestrator removed it).
  - **Status**: ✅ Complete

**Success criteria**
- Automated: `pnpm build`, `pnpm test`, `pnpm lint` and `pnpm --filter @chkobba/server e2e` pass.
- Manual: the docs match the behaviour; ADR-0003 compliance confirmed.

---

## Execution notes

- Execute phases in order (Phase 0, then 1 through 8). Within a phase, respect the dependencies. Each phase's first task depends on the previous phase's `.X` (or `.U`) task.
- **Verification gates**: 2.1 gates 2.3-2.7 (and picks 2.4 or 2.5); 3.1 gates 3.3; 4.1 gates 4.6/4.7; 7.1 gates 7.2/7.4. Work that doesn't depend on a gate may start alongside it, as listed below.
- Parallelism:
  - Phase 1: 1.1 and 1.2 in parallel after 1.0; 1.3 and 1.4 in parallel after them.
  - Phase 2: after 2.1, 2.2, 2.3, 2.7 and 2.10 in parallel.
  - Phase 3: 3.1, 3.2, 3.4, 3.6 and 3.8 in parallel at phase start; 3.3 after 3.1; 3.5 after 3.4; 3.7 joins 3.5 and 3.6.
  - Phase 4: 4.1, 4.5, and (after 3.C) 4.2 and 4.4 in parallel; 4.6 after 4.1.
  - Phase 5: 5.1, 5.2 and 5.3 in parallel; 5.8 after 5.1; 5.6, 5.7 and 5.9 in parallel after 5.5.
  - Phase 7: 7.1, 7.3, 7.5 and 7.7 in parallel at phase start; 7.9 after 7.7; 7.10 after 7.5.
  - Phase 8: 8.1, 8.2 and 8.3 in parallel.
- User gates: the Derja wording reviews (5.I, 7.I); the manual browser runs (5.U, 7.U); one native device for background disconnect and foreground reconnect (plan "Manual" testing), LAN only.
- Temporary probes in 2.1, 4.1 and 7.1 must be reverted before any commit.
- No deployment or hosting tasks.
- Get manual verification confirmation between phases.
- Use the Write/Edit tools for all file operations (never `cat`).
