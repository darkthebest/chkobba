# Checklist: Player identity, step 1: display names and a durable guest

**Ticket**: TBD
**Generated from**: `context/plans/2026-10-30-player-identity-names.md`
**Generated at**: 2026-10-30
**Base branch**: `feature/2026-10-27-multiplayer-m1` (working branch created by `/execute-plan`)
**Staging docs**: `context/docs/2026-10-30-player-identity-names-docs.md` (temporary, merged in Task 7.F)

## Phase mapping

The plan numbers its phases 0-6. This checklist reserves Phase 0 for preflight, so:

| Checklist phase | Plan phase |
|---|---|
| Phase 0: Preflight | (orchestrator) |
| Phase 1: Contracts and decision record | 0. Contracts and decision record |
| Phase 2: Server name rules (pure, Vitest) | 1. Server name rules |
| Phase 3: Server hooks and table names | 2. Server hooks and table names |
| Phase 4: Durable guest id (mobile) | 3. Durable guest id |
| Phase 5: Profile service (mobile) | 4. Profile service |
| Phase 6: Name UI (mobile, i18n, both layouts) | 5. Name UI |
| Phase 7: End-to-end check and finalization | 6. End-to-end check and finalization |

## Agent Registry

| Agent | Tier | Assigned Tasks |
|---|---|---|
| orchestrator (execute-plan) | n/a | 0.1 |
| general-purpose | Tier 3 - Research/Exploration (used as implementer; no dedicated TS/Nakama/Expo developer agent exists, same convention as the m1 checklist) | 1.1, 2.1, 2.2, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 6.1, 6.2, 6.3, 6.4, 6.V, 6.I |
| web-search-researcher | Tier 3 - Research/Exploration | 3.1 |
| codebase-analyzer | Tier 3 - Research/Exploration | 7.6 |
| code-refactor | Tier 5 - Refactoring | 5.2 |
| test-specialist | Tier 2 - Domain Specialist | 1.2, 1.T, 2.3, 2.T, 3.5, 3.C, 3.T, 4.4, 4.T, 5.3, 5.T, 6.5, 6.T, 7.1, 7.3, 7.T |
| debug-specialist | Tier 2 - Domain Specialist | 3.6, 7.2 |
| ui-explorer | Tier 4 - UI Validation | 6.U |
| docs-maintainer | Always Available | 1.3, 1.4, 1.X, 2.X, 3.X, 4.5, 4.X, 5.X, 6.X, 7.4, 7.5, 7.X, 7.F |

**Notes on assignment**
- The repo has no Tier 1 generators and no Tier 6 developer agents (`.claude/agents/` lists only research, test, debug, refactor, UI-validation and docs agents). Implementation goes to `general-purpose`, as in `context/checklists/2026-10-27-multiplayer-m1-checklist.md`. Tier 6 usage: 0.
- **i18n**: an i18n system now exists (`apps/mobile/src/i18n/`), but there is no `i18n-specialist` agent. Phase 6 still gets a 6.V (validate) and a 6.I (translation) task, assigned to `general-purpose`. Because `en.ts` defines the `Translation` type, `aeb.ts` has to get its keys in the same task (6.1) or typecheck fails. So 6.I is a Derja wording pass that gets flagged for the user to review, not first-time generation.
- **ADR**: the plan creates the ADR itself (Task 1.4), so there is no Task 1.0 pre-check. Compliance with it is checked in Task 7.6 and listed in the success criteria from Phase 2 on. No `docs/adr/` directory exists yet; Task 1.4 creates it as `docs/adr/0001-...` with an index, following the `architecture-decision-records` skill.
- **Cross-app contract**: Task 3.C pins the real HTTP status and body that the `updateAccount` hook returns on rejection. It runs before the mobile profile service (Task 5.1), which maps that error to `NameErrorCode`.

## Global constraints (apply to every task)

- `@chkobba/protocol` changes are additive only. `OpCode`, `Snapshot`, `PlayerInfo` and `ErrorCode` keep their shape. Helpers in `names.ts` must be pure and dependency-free.
- Goja: no `\p{...}`, no `u`-flag regexes, no `.at()`, `Object.hasOwn` or `Proxy` in anything that the server bundle imports. Use plain `\uXXXX` ranges. After any server change, rebuild, `docker compose restart nakama`, and confirm the module loads.
- Hooks and RPCs registered in `InitModule` must be top-level named functions (goja requirement).
- Server is authoritative: the client format check is UX only. The `registerBeforeUpdateAccount` hook is the single enforcement point (Decision 9).
- Never send the raw ANDROID_ID. Never link it to the advertising ID (Decision 2).
- Keep the whole workspace on Babel 7. If adding Expo packages re-resolves Babel 8 peers, restore `pnpm-lock.yaml` and reinstall.
- Mobile: no hard-coded UI text (`const tr = useT()`); `marginStart`/`marginEnd` for mirrored spacing; RNTL v14 `render`/`fireEvent` are awaited; seats mark bots by `isBot`, never by name.
- `LocalGameClient` (offline) behaviour is unchanged; it still shows "You".

## Validation command reference

| Package | Commands |
|---|---|
| `packages/protocol` | `pnpm --filter @chkobba/protocol test`, `pnpm --filter @chkobba/protocol typecheck` |
| `apps/server` | `pnpm --filter @chkobba/server test`, `pnpm --filter @chkobba/server typecheck`, `pnpm --filter @chkobba/server build` |
| Nakama load check | `pnpm --filter @chkobba/server build && docker compose restart nakama`, then `docker compose logs nakama --since 1m` shows "Chkobba module loaded" with no goja errors, then `curl -X POST "localhost:7350/v2/rpc/smoke_game?http_key=defaulthttpkey&unwrap" -d '{}'` returns a winner |
| `apps/mobile` | `pnpm --filter @chkobba/mobile test`, `pnpm --filter @chkobba/mobile typecheck`, `pnpm --filter @chkobba/mobile lint` |
| Workspace | `pnpm build`, `pnpm test`, `pnpm lint` |

---

## Phase 0: Preflight

- [x] **Task 0.1**: Mark ticket as In Progress
  - **Files**: N/A (issue tracker — ref from the checklist's `**Ticket**` header line)
  - **Assigned Agent**: orchestrator (execute-plan runs this directly — NOT a sub-agent)
  - **Skills**: None
  - **Dependencies**: None
  - **Validation**: Ticket is TBD
  - **Status**: ✅ Skipped (no ticket linked)

---

## Phase 1: Contracts and decision record (plan phase 0)

**Overview**: Settle the shared name contract in `@chkobba/protocol` and record the identity decisions in an ADR before anything depends on them.

- [x] **Task 1.1**: Add `names.ts` to `@chkobba/protocol` with the constants, `NAME_ERROR_CODES`/`NameErrorCode`, `PROFILE_COLLECTION`/`PROFILE_NAME_KEY`, `NameRecord`, and the pure `normalizeDisplayName` and `checkDisplayNameFormat`, then re-export them from the index
  - **Files**: `packages/protocol/src/names.ts` (new): the data-structure block from the plan. `normalizeDisplayName` trims and collapses runs of spaces. `checkDisplayNameFormat` checks length (3 to 16 after normalizing) and character set only (Decision 4): Latin letters including Latin-1 accented letters, Arabic letters plus `ڤ` `ڨ` `پ`, ASCII and Arabic-Indic digits, single spaces. It rejects tatweel `U+0640`, harakat `U+064B-U+065F`, and zero-width and bidi controls; mixed scripts are allowed. `packages/protocol/src/index.ts`: `export * from './names'`. `packages/protocol/package.json`: update the `description` to "types, consts and pure dependency-free helpers".
  - **Constraint**: Character classes use only explicit `\uXXXX` ranges, with no `\p{}` and no `u` flag (goja). No imports. ES2017 lib.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, security-patterns, code-quality-standards
  - **Dependencies**: Task 0.1
  - **Validation**: protocol, server and mobile typecheck all pass; no existing type changed shape. Characters checked before length (emoji isn't misreported as too short); Eastern Arabic-Indic digits U+06F0-06F9 rejected (only U+0660-0669 + ASCII allowed). Added types `NameFormatErrorCode`, `NameFormatCheck`.
  - **Status**: ✅ Complete

- [x] **Task 1.2**: Write the shared name test vectors and the protocol unit tests
  - **Files**: `packages/protocol/src/testing/nameVectors.ts` (new): exported `NAME_FORMAT_VECTORS` (input, expected normalized output, expected `ok` or `NameErrorCode`). It is exposed as an additive subpath export `"./testing"` in `packages/protocol/package.json`, so server Vitest and mobile Jest can reuse it. `packages/protocol/src/__tests__/names.test.ts` (new): runs every vector, plus edge cases for exactly 3 and 16 characters, collapsed spaces, and bidi, zero-width, tatweel and harakat rejection.
  - **Constraint**: Confirm that jest-expo resolves the `@chkobba/protocol/testing` subpath. If it doesn't, fall back to a relative import inside tests only, and note this in the task report. The main entry must not import `testing/`, so Rollup never bundles the vectors.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 1.1 (helpers to test)
  - **Validation**: protocol test 244/244 pass (63 vectors), typecheck clean. `@chkobba/protocol/testing` resolves in server Vitest and mobile jest-expo with no config change. Note: `trim()` also strips edge tab/NBSP/BOM, so `"\tAli"` → `"Ali"` (accepted, stored normalized).
  - **Status**: ✅ Complete

- [x] **Task 1.3**: Update the documented protocol rule to "types, consts and pure dependency-free helpers"
  - **Files**: `CLAUDE.md`: the `packages/protocol/` line in Project Structure and the "Apps share wire types via `@chkobba/protocol`" bullet in Key Patterns. `docs/reference/wire-protocol.md`: the intro or package-rule wording.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 1.1 (helpers exist)
  - **Validation**: Both files state the new rule; diff is 3 lines changed across the 2 files, no other drift
  - **Status**: ✅ Complete

- [x] **Task 1.4**: Write the ADR "Durable guest identity and display names" and link it from the plan
  - **Files**: `docs/adr/0001-durable-guest-identity-and-display-names.md` (new). It covers: Keychain on iOS; hashed and salted ANDROID_ID on Android; `localStorage` on web; migration with `linkDevice` and the 409 fallback; `display_name` as a non-unique, server-validated field while `username` stays a hidden handle; the server-owned `profile/name` record (owner-read, server-write) for the picked flag and the cooldown, and why account metadata was rejected; validator placement (format in protocol; profanity and cooldown server-only). Status: Accepted. Alternatives considered. `docs/adr/README.md` (new): ADR index. `docs/README.md`: link to the ADR index. `context/plans/2026-10-30-player-identity-names.md`: add an "Architecture Decisions" link to ADR-0001.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: architecture-decision-records, documentation-standards
  - **Dependencies**: Task 1.1 (validator placement final)
  - **Validation**: ADR exists with Context, Decision, Consequences, Alternatives (+ Related); `docs/adr/README.md` index; linked from `docs/README.md` and the plan's new "Architecture Decisions" section
  - **Status**: ✅ Complete

- [x] **Task 1.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 1.2, Task 1.3, Task 1.4
  - **Validation**: `pnpm test` green (rules 73, protocol 244, server 274, mobile 283), `pnpm lint` clean, `pnpm build` ok
  - **Status**: ✅ Complete

- [x] **Task 1.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-player-identity-names-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 1.T
  - **Validation**: Phase 1 section written in `context/docs/2026-10-30-player-identity-names-docs.md` (by orchestrator)
  - **Status**: ✅ Complete

**Success criteria**
- Automated: protocol tests pass; protocol, server and mobile typecheck pass; no existing protocol type changed shape.
- Manual: the ADR is linked from the plan. (The ES5 bundle check for the helpers happens in Task 2.T, the first time the server imports them.)

---

## Phase 2: Server name rules, pure and tested in Vitest (plan phase 1)

**Overview**: A server-only pure module under `apps/server/src/account/` adds the profanity, reserved-word and cooldown rules on top of the protocol format check, plus the default-name generator. No `nkruntime` imports.

- [x] **Task 2.1**: Implement the profanity and reserved-word check on a folded form
  - **Files**: `apps/server/src/account/profanity.ts` (new). `foldName`: lowercase, strip spaces, map leetspeak `0→o 1→i 3→e 4→a 5→s @→a`, unify Arabic variants `أإآ→ا`, `ة→ه`, `ى→ي`. `isNameAllowed(normalized)` matches short tokens as whole words and long, unambiguous roots as substrings. Short `en`, `fr` and Derja (Arabic script) lists, plus the reserved words `admin`, `moderator`, `support`, `official`, `chkobba`. Bot names (`Hedi`, `Sonia`, `Mongi`, `Fatma`) stay allowed (Decision 11).
  - **Constraint**: The lists are shown to the user for review before the phase closes; record their sign-off in the task report. `\uXXXX` ranges only (goja).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, code-quality-standards
  - **Dependencies**: Task 1.X (phase 1 docs gate)
  - **Validation**: server typecheck passes; 169 real names + all Player0000-9999 pass, expected obscenities blocked (throwaway check). Added beyond plan: Arabizi list, chkoba/شكبة reserved, Latin-1/ڤڨپ folds. Known gaps: repeated letters, letter swaps (fvck), word entries glued to text. User list review: APPROVED as is (2026-10-30), incl. Arabizi list, zamel/زامل, chkoba/شكبة
  - **Status**: ✅ Complete

- [x] **Task 2.2**: Implement the server name check, the cooldown decision and the default-name generator
  - **Files**: `apps/server/src/account/rules.ts` (new). `checkName(raw): NameCheck` runs `normalizeDisplayName` and `checkDisplayNameFormat` from `@chkobba/protocol`, then `isNameAllowed`, which gives `name_not_allowed`. `checkRenameCooldown(record: NameRecord | null, now)` returns allowed, or `{ code: 'name_rate_limited', retryAt }`; the first pick is free, and the cooldown runs from `changedAt` (Decision 5). `defaultDisplayName(random: () => number)` returns `Player` plus 4 digits, with the RNG injected. `apps/server/src/account/index.ts` (new): barrel.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, security-patterns
  - **Dependencies**: Task 2.1 (profanity check)
  - **Validation**: server typecheck + lint pass. Added `CooldownCheck` type and `DEFAULT_NAME_PREFIX`; manual zero-pad (no padStart); out-of-range RNG clamped
  - **Status**: ✅ Complete

- [x] **Task 2.3**: Write the Vitest tables for the name rules
  - **Files**: `apps/server/src/account/__tests__/rules.test.ts` (new): reuses `NAME_FORMAT_VECTORS` from `@chkobba/protocol/testing`; cooldown boundaries (first pick, `changedAt + RENAME_COOLDOWN_MS - 1`, exactly at the boundary, after it); default-name shape. `apps/server/src/account/__tests__/profanity.test.ts` (new): leetspeak and Arabic-variant hits, reserved words, and Scunthorpe false positives (real Tunisian, French and English names that must pass, including the bot names).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 2.2 (rules to test)
  - **Validation**: server test 538/538 (264 new), typecheck clean. Known gaps pinned as passing tests (fvck, fuuuck, Shitty, zebiX). No bugs found
  - **Status**: ✅ Complete

- [x] **Task 2.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 2.3
  - **Validation**: server test 538/538, typecheck, build ok; Nakama restart: "Chkobba module loaded", smoke_game returns a winner. Rules not imported yet, so their goja load is confirmed in Task 3.6
  - **Status**: ✅ Complete

- [x] **Task 2.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-player-identity-names-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 2.T
  - **Validation**: Phase 2 section written in `context/docs/2026-10-30-player-identity-names-docs.md` (by orchestrator)
  - **Status**: ✅ Complete

**Success criteria**
- Automated: `pnpm --filter @chkobba/server test` passes; the bundle builds.
- Manual: the user reviewed the profanity lists and the false-positive names; the rules match ADR-0001 (validator placement).

---

## Phase 3: Server hooks and table names (plan phase 2)

**Overview**: The server owns display names (default, validation, cooldown) through account hooks. The table shows display names and refreshes them on reconnect.

- [x] **Task 3.1**: Verify the Nakama 3.40 hook APIs before implementing
  - **Files**: N/A (research; findings go in the task report and the Phase 3 staging notes). Check against `nakama-runtime` v1.47.0 types (`apps/server/node_modules/nakama-runtime/index.d.ts`) and the Nakama docs (Context7): (a) whether `ctx.userId` and `session.created` are set in `registerAfterAuthenticateDevice`, falling back to the `uid` claim in `session.token` (Decision 6); (b) how a before hook rejects (throwing `{ message, code }`), and how gRPC `INVALID_ARGUMENT` and `RESOURCE_EXHAUSTED` map to HTTP 400 and 429 and the response body; (c) the `registerBeforeUpdateAccount` and `registerAfterUpdateAccount` signatures and the request field names (`displayName`, `username`, `avatarUrl`, `location`, `langTag`, `timezone`); (d) the `usersGetId` result field for the display name.
  - **Assigned Agent**: web-search-researcher (Tier 3 - Research/Exploration)
  - **Skills**: None
  - **Dependencies**: Task 2.X (phase 2 docs gate)
  - **Validation**: (a) `ctx.userId` set in after hooks (dbUserID), `data.created === true` marks new account; `nk.base64UrlDecode` exists as fallback. (b) throw `{ message, code }` with numeric codes 3/8 (`nkruntime.Codes` is an ambient const enum, Babel can't inline); 3→400, 8→429; returning null from a before hook = 404, must `return data`; body shape unconfirmed (3.6/3.C). (c) `UserUpdateAccount` plain optional camelCase strings; `userId` population to confirm. (d) `usersGetId(ids)[i].displayName`; `accountUpdateId(userId, username, displayName, timezone, location, langTag, avatarUrl, metadata)`, null = unchanged. Storage write fields `permissionRead`/`permissionWrite`; server reads ignore permissions.
  - **Status**: ✅ Complete

- [x] **Task 3.2**: Implement the three account hooks and register them in `InitModule`
  - **Files**: `apps/server/src/account/hooks.ts` (new), top-level named functions. `beforeUpdateAccount`: rejects `username` with `username_locked` and `avatarUrl`/`location` with `field_locked`, and lets `langTag` and `timezone` through. When `displayName` is present it runs `checkName`, reads the `NameRecord` (`storageRead` on `profile`/`name`), applies `checkRenameCooldown`, and returns the request with the normalized name. Errors are thrown as `{ message: <NameErrorCode>, code: INVALID_ARGUMENT | RESOURCE_EXHAUSTED }`. `afterUpdateAccount`: writes the `NameRecord` (`pickedAt` the first time, then `changedAt = now`) with `permissionRead: 1`, `permissionWrite: 0`. `afterAuthenticateDevice`: on `session.created`, `nk.accountUpdateId(userId, null, defaultDisplayName(...))`, using the user-id source verified in 3.1. `apps/server/src/main.ts`: register the hooks with `initializer.registerBeforeUpdateAccount`, `registerAfterUpdateAccount` and `registerAfterAuthenticateDevice`.
  - **Constraint**: The after hook writes only when the request carried `displayName`. The near-simultaneous rename race is accepted (Decision 8).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, security-specialist, type-safety-patterns
  - **Dependencies**: Task 3.1 (verified hook API and error shape)
  - **Validation**: typecheck + build pass, 542 tests green; hooks are top-level functions in build/index.js and registered in InitModule. Only undefined/null count as absent (nakama-js sends only set keys); malformed NameRecord logged and treated as absent; storage read failure refuses the update; missing user id → code 16. Same-name rename after first pick still starts the cooldown (accepted). Live checks listed for 3.6
  - **Status**: ✅ Complete

- [x] **Task 3.3**: Make a seat reclaim refresh the seat name in the pure core
  - **Files**: `apps/server/src/table/seats.ts`: in `join`'s reclaim branch (around `:17-21`), also set `seat.name = cleanName(joiner.name)` (Decision 7). Keep `cleanName` and `MAX_NAME_LENGTH = 24` (`apps/server/src/table/types.ts:22`) as a defensive cap. `apps/server/src/table/__tests__/seats.test.ts`: add a test that a reclaim with a new name updates the seat and the projected `PlayerInfo.name`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, testing-patterns
  - **Dependencies**: Task 3.1
  - **Validation**: seats tests 30 pass (4 new: rename, snapshot players[i].name for all seats, blank → `Player`, 24-char cap); full server suite 542 pass. Reclaim sets `name: cleanName(joiner.name)` immutably
  - **Status**: ✅ Complete

- [x] **Task 3.4**: Resolve the display name once per join in the match adapter
  - **Files**: `apps/server/src/match/tableMatch.ts`. `Connection` gains `readonly displayName: string`. `matchJoinAttempt` (`:78-100`) calls `nk.usersGetId([presence.userId])` inside try/catch and uses the fallback chain display name, then username, then `Player`. The result is stored on the connection. `joinerOf` (`:356-358`) takes the resolved name instead of `presence.username`, and `admit` (`:231-249`) reuses `Connection.displayName`, so there is no second DB call.
  - **Constraint**: A failing `usersGetId` must never reject the join.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, architecture-standards
  - **Dependencies**: Task 3.3 (reclaim updates name), Task 3.1 (`usersGetId` field)
  - **Validation**: server typecheck pass, 542 tests green. New helpers `resolveDisplayName` (usersGetId in try/catch, warn + fallback) and `fallbackName` (username → `Player`); `admit` reuses `Connection.displayName`, falls back if no reserved connection
  - **Status**: ✅ Complete

- [x] **Task 3.5**: Extend the nk fakes and add adapter and hook tests
  - **Files**: `apps/server/src/__tests__/fakes.ts` (`:35-46`): add `usersGetId`, `accountGetId` and `accountUpdateId`, backed by an in-memory accounts map, plus a switch to make `usersGetId` throw. `apps/server/src/account/__tests__/hooks.test.ts` (new): every `NameErrorCode` path and its gRPC code, the cooldown boundary, first pick vs rename record writes and permissions, `langTag`/`timezone` passing through, the default name set on create only. `apps/server/src/match/__tests__/tableMatch.test.ts`: display-name fallback (empty display name, `usersGetId` throws), and a renamed reconnect showing up in another seat's snapshot `players[i].name`.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns, tdd-testing
  - **Dependencies**: Task 3.2, Task 3.4
  - **Validation**: server 597/597 (55 new: 47 hooks, 8 tableMatch display names), typecheck pass. Fakes: accounts map + `nk.fake` controls; in-memory storage is opt-in (`useMemoryStorage`) to keep quickMatch tests valid. Every NameErrorCode covered via a typed trigger map. No bugs found
  - **Status**: ✅ Complete

- [x] **Task 3.6**: Rebuild, restart Nakama, and confirm that the module and hooks load in goja
  - **Files**: N/A (runtime check; fixes go in the files above if goja rejects something)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 3.5
  - **Validation**: Module loads, before/after updateaccount + after authenticatedevice registered, no goja errors, smoke wins. Fresh device → `Player1762` (`created:true`), re-auth unchanged; `ctx.userId` set. Unset fields arrive absent (display_name-only rename 200, normalized `Ab cd`). No fixes needed. Orchestrator re-verified: `Player3222`, pick 200, rename 200, third 429
  - **Status**: ✅ Complete

- [x] **Task 3.C**: Contract validation: pin the `updateAccount` rejection shape that the mobile client will map
  - **Files**: Phase 3 section of `context/docs/2026-10-30-player-identity-names-docs.md`: record the exact HTTP status and JSON body for each case.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 3.6 (hooks live in local Nakama)
  - **Validation**: Pinned in staging docs Phase 3: 400 `{"code":3,"message":<NameErrorCode>}` for name_too_short/name_bad_chars/name_not_allowed/username_locked/field_locked; 429 `{"code":8,"message":"name_rate_limited"}`; lang_tag passes (200). All observed codes ∈ NAME_ERROR_CODES. Client write to profile/name → 400 permission denied
  - **Status**: ✅ Complete

- [x] **Task 3.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 3.C
  - **Validation**: `pnpm test` green (rules 73, protocol 244, server 597, mobile 283), lint clean, build ok, smoke_game returns a winner
  - **Status**: ✅ Complete

- [x] **Task 3.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-player-identity-names-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 3.T
  - **Validation**: Phase 3 section written in `context/docs/2026-10-30-player-identity-names-docs.md` (by orchestrator)
  - **Status**: ✅ Complete

**Success criteria**
- Automated: Vitest covers every `NameErrorCode`, the cooldown boundary, the default name on create only, the display-name fallback, and a renamed reconnect showing in another seat's snapshot.
- Manual: the curl cases in 3.C (400 bad name, 429 early rename); the module loads in goja; the hooks follow ADR-0001 (storage record permissions, single enforcement point).

---

## Phase 4: Durable guest id (mobile) (plan phase 3)

**Overview**: The guest credential survives a reinstall on iOS (Keychain) and Android (hashed ANDROID_ID), web is unchanged, and existing testers keep their account through a one-time migration.

- [x] **Task 4.1**: Add `expo-secure-store` and `expo-application` with `expo install` (SDK 58)
  - **Files**: `apps/mobile/package.json`, `pnpm-lock.yaml`, `apps/mobile/app.json` (add the `expo-secure-store` config plugin only if SDK 58 needs it). `expo-crypto` is already a dependency.
  - **Constraint**: Run `pnpm --filter @chkobba/mobile exec expo install expo-secure-store expo-application`. Afterwards confirm the lockfile resolves no `@babel/core@8`. If it does, restore `pnpm-lock.yaml` and reinstall.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: None
  - **Dependencies**: Task 3.X (phase 3 docs gate)
  - **Validation**: expo-application ~58.1.2, expo-secure-store ~58.0.2 (SDK 58 bundled versions). Lockfile +24/-0, no @babel/core@8, nothing re-resolved. app.json keeps `["expo-secure-store", { "faceIDPermission": false }]` (Android backup exclusion for SecureStore prefs only; no Face ID string). Frozen install, typecheck, mobile 283/283 pass
  - **Status**: ✅ Complete

- [x] **Task 4.2**: Implement a `DeviceIdStore` for each platform
  - **Files**: `apps/mobile/src/online/deviceId.ts` (new shared: interface, `DEVICE_ID_KEY`, `isValidDeviceId`), `deviceIdStore.ts` (tsc fallback, throws), `deviceIdStore.ios.ts`, `deviceIdStore.android.ts`, `deviceIdStore.web.ts`
  - **Constraint**: The raw ANDROID_ID never leaves the function and is never logged. Don't use `crypto.randomUUID` or `crypto.subtle` on web (plain-http LAN testing).
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns
  - **Dependencies**: Task 4.1 (native modules installed)
  - **Validation**: mobile typecheck + lint pass, 283 tests green. Stores never generate ids (load → null, caller generates + saves). Android: saved fallback preferred over derived `chk-a-`+SHA-256; save() no-op for derived id. Web: same localStorage key AsyncStorage used (no prefix); storage errors swallowed. jest-expo resolves `.ios.ts` by default
  - **Status**: ✅ Complete

- [x] **Task 4.3**: Add the one-time device-id migration to `GuestAuth`
  - **Files**: `apps/mobile/src/online/nakama.ts`. `GuestAuth` (`:161-247`) takes a `DeviceIdStore` next to its `KeyValueStore` (`:61-65`, `:172`), and the legacy AsyncStorage id (`:91`, `:99-106`) is read once, guarded by the `chkobba.online.deviceIdMigrated` flag. iOS: copy a valid legacy id into an empty Keychain; when both exist and differ, the Keychain wins. Android: sign in with the legacy id, `client.linkDevice(session, { id: durableId })`, switch to the durable id; on 409 keep the legacy account, log it, and set the flag so the migration isn't retried (Decision 3). The legacy id stays in place for one release. The session stays under `chkobba.online.session`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: security-patterns, type-safety-patterns, design-patterns
  - **Dependencies**: Task 4.2 (stores)
  - **Validation**: mobile typecheck + lint pass, 283 tests green, no test edits. `resolveDeviceId()` runs before session restore (so long-lived sessions still migrate); Android legacy sign-in uses create=false (404 → durable); 409 pins legacy via store fallback; other errors retry next launch; account switches drop the cached session; Keychain save errors fail sign-in. `newDeviceId()` is the single generator; `loadOrCreateDeviceId` removed; `deviceIdStore`/`platform`/`log` injectable
  - **Status**: ✅ Complete

- [x] **Task 4.4**: Unit-test the device-id stores and the migration with mocked native modules
  - **Files**: `apps/mobile/src/online/__tests__/deviceIdStore.test.ts` (new): mock `expo-secure-store`, `expo-application` and `expo-crypto`; import each platform file explicitly (jest-expo defaults to iOS resolution). `apps/mobile/src/online/__tests__/nakama.test.ts`: fresh install, reinstall (Keychain or Android ID present, AsyncStorage empty), legacy upgrade on iOS and Android, the Android `linkDevice` 409 conflict, null Android ID, and the flag preventing re-runs.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 4.3
  - **Validation**: mobile 369/369 (32 store tests, nakama.test.ts → 55); typecheck + eslint clean; no bugs. Session and migrated-flag keys are hard-coded in tests (private in nakama.ts)
  - **Status**: ✅ Complete

- [x] **Task 4.5**: Update the docs for the device id per platform
  - **Files**: `docs/reference/wire-protocol.md` (client constants: storage keys, id format per platform), `docs/explanation/multiplayer-architecture.md` (around `:51`, guest identity paragraph).
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 4.3
  - **Validation**: wire-protocol: new "Guest device id" subsection (id rule, per-platform table, 4 storage keys). Architecture: new "Guest identity" section linking ADR-0001; reinstall limitation bullet reworded (survives on iOS/Android, not web or Android factory reset). Matches code incl. 404 session drop
  - **Status**: ✅ Complete

- [x] **Task 4.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 4.4, Task 4.5
  - **Validation**: mobile 369/369, typecheck, lint clean; `pnpm test` green (rules 73, protocol 244, server 597, mobile 369); lockfile still Babel 7
  - **Status**: ✅ Complete

- [x] **Task 4.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-player-identity-names-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 4.T
  - **Validation**: Phase 4 section with Release checklist notes written in `context/docs/2026-10-30-player-identity-names-docs.md` (by orchestrator)
  - **Status**: ✅ Complete

**Success criteria**
- Automated: mobile Jest, typecheck and lint pass; the lockfile is still on Babel 7.
- Manual (deferred to Task 7.3, needs a dev build on real devices): uninstalling and reinstalling keeps the same user id on iOS and Android; a legacy build upgraded in place keeps its user id. Implementation follows ADR-0001.

---

## Phase 5: Profile service (mobile) (plan phase 4)

**Overview**: A small, tested `ProfileBackend` gives the UI the player's name and rename results, with a local cache and one shared Nakama client and `GuestAuth`. No UI changes.

- [x] **Task 5.1**: Implement `ProfileBackend` with the local profile cache
  - **Files**: `apps/mobile/src/online/profile.ts` (new): the `Profile`, `SetNameResult` and `ProfileBackend` types from the plan, implemented over `GuestAuth`. `getProfile` reads `client.getAccount` and `client.readStorageObjects` (`profile`/`name`, own user id) in parallel, derives `namePicked` and `renameAvailableAt`, and uses the fallback chain display name, then username, then `Player`. `setDisplayName` runs `normalizeDisplayName`/`checkDisplayNameFormat` first, calls `client.updateAccount(session, { display_name })`, maps the error to a `NameErrorCode` using the shape pinned in Task 3.C (anything else becomes `network`), and re-reads the profile on success. Cache: `chkobba.online.profile` (JSON `Profile`), written on every successful read or write, and readable synchronously-ish without the network (`loadCachedProfile()`). `apps/mobile/src/online/nakama.ts`: expose what `profile.ts` needs (session, client), if it doesn't already.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: type-safety-patterns, design-patterns, security-patterns
  - **Dependencies**: Task 4.X (phase 4 docs gate), Task 3.C (error contract)
  - **Validation**: mobile typecheck + lint pass, 369 tests green; nakama.ts unchanged (signIn() gives session.user_id). Exports `NakamaProfileBackend`, `loadCachedProfile`, `parseNameRecord`, `nameErrorFrom`, narrow `ProfileClient`/`SessionSource`. Errors mapped by body `message` only; rate-limited refreshes the profile; save-ok + re-read fail still returns ok with an approximate cooldown; cached `renameAvailableAt` may be in the past (UI must compare with now)
  - **Status**: ✅ Complete

- [x] **Task 5.2**: Share one Nakama client, `GuestAuth` and `ProfileBackend` across screens
  - **Files**: `apps/mobile/src/online/services.ts` (new: `getNakamaClient`, `getGuestAuth`, `getOnlineBackend`, `getProfileBackend`, `resetOnlineServicesForTests`), `nakama.ts` (`NakamaBackendOptions.auth`), `app/finding.tsx`, `app/game.tsx`, `components/lobby/__tests__/FindingPlayers.test.tsx` (mock swapped to `@/online/services`, needed to compile)
  - **Constraint**: The UI behaves the same; no visible change.
  - **Assigned Agent**: code-refactor (Tier 5 - Refactoring)
  - **Skills**: architecture-standards, code-quality-standards
  - **Dependencies**: Task 5.1
  - **Validation**: orchestrator ran: mobile typecheck pass, 369/369 tests, lint clean. `activeClient.ts` has no overlap (holds the running game client). Shared backend shares `connectFailures`, which resets on success (harmless)
  - **Status**: ✅ Complete

- [x] **Task 5.3**: Jest tests for the profile service and shared services
  - **Files**: `apps/mobile/src/online/__tests__/profile.test.ts` (new), using a fake `Client`: error mapping for every `NameErrorCode`, plus unknown errors and fetch failures becoming `network`; the client-side format rejection never calls the network; cache written on read and write; a legacy account with an empty `display_name` and no record gives `namePicked: false` and the username fallback; `renameAvailableAt` from `changedAt`. `apps/mobile/src/online/__tests__/services.test.ts` (new): the same instances are returned across calls.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.2
  - **Validation**: mobile 474/474 (profile.test.ts 92, services.test.ts 13), typecheck + eslint clean, no bugs. `nameErrorFrom` maps by body message only (status ignored), as designed
  - **Status**: ✅ Complete

- [x] **Task 5.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 5.3
  - **Validation**: orchestrator ran: mobile test 474/474, typecheck 0 errors, lint clean
  - **Status**: ✅ Complete

- [x] **Task 5.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-player-identity-names-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 5.T
  - **Validation**: Phase 5 section written in `context/docs/2026-10-30-player-identity-names-docs.md` (by orchestrator)
  - **Status**: ✅ Complete

**Success criteria**
- Automated: Jest and typecheck pass.
- Manual: nothing changes in the UI (quick match and the game screen work as before against local Nakama).

---

## Phase 6: Name UI (mobile, i18n, both layouts) (plan phase 5)

**Overview**: A first-visit "Choose your name" step before quick match, and a "Your name" rename in Settings. Fully localized in `en` and `aeb` (RTL), on phone and desktop.

- [x] **Task 6.1**: Add the `name.*` and `settings.name` i18n keys in both catalogs
  - **Files**: `apps/mobile/src/i18n/locales/en.ts` (next to `settings.*` at `:63-67`): `name.title`, `name.hint`, `name.placeholder`, `name.continue`, `name.save`, `name.saved`, `name.cooldown` (with `{{minutes}}`), one key per `NameErrorCode` (`name.errors.name_too_short`, and so on), `name.errors.network`, and `settings.name`. `apps/mobile/src/i18n/locales/aeb.ts`: the same keys in Derja, Arabic script. The bad-characters message says plainly that tatweel and diacritics aren't allowed.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: documentation-standards (i18n-patterns are in `docs/how-to/add-a-language.md`; follow it)
  - **Dependencies**: Task 5.X (phase 5 docs gate)
  - **Validation**: typecheck pass, i18n tests 18 pass, eslint clean. `name.errors` typed `satisfies Record<NameErrorCode | 'network', string>`; reuse `common.cancel`; limits written as literal 3/16; cooldown uses `{{minutes}}` with min/د. Flag for 6.I: aeb `name_rate_limited` uses "عن قريب" (reads as "soon", not "recently")
  - **Status**: ✅ Complete

- [x] **Task 6.2**: Build the `NameForm` component
  - **Files**: `apps/mobile/src/components/lobby/NameForm.tsx` (new): a text field with `maxLength={DISPLAY_NAME_MAX_LENGTH}` and auto writing direction (`textAlign`/`writingDirection` auto), so Arabic types right to left; a live format hint from `checkDisplayNameFormat`; an inline localized error; a Save or Continue button (prop); a cooldown line from `renameAvailableAt`. Built with skin tokens (`useSkin()`) and the `Panel` slot, `marginStart`/`marginEnd`, and accessibility labels. All text through `const tr = useT()`.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, code-quality-standards, i18n-patterns (auto-active; per `docs/how-to/add-a-language.md`)
  - **Dependencies**: Task 6.1 (keys)
  - **Validation**: typecheck + lint pass, 474 tests green. Presentational (no Panel, no network); submits normalized name; format error after blur/submit; server feedback hidden once the name is edited; save mode disabled when unchanged or cooling down; cooldown shown only if in the future (15 s tick); web `dir="auto"`, native natural alignment, placeholder aligned to UI language; live region + alert role. Uses `warn*` tokens for the error banner. Follow-up: `FormButton` duplicates FindingPlayers' private `ActionButton`
  - **Status**: ✅ Complete

- [x] **Task 6.3**: Gate quick match behind the first name pick in `/finding`
  - **Files**: `apps/mobile/src/app/finding.tsx` and `apps/mobile/src/components/lobby/FindingPlayers.tsx` (`:30-69`). Load the profile first. If `!namePicked`, show "Choose your name" (`NameForm`, prefilled with `displayName`). Continue always calls `setDisplayName`, even when the name is unchanged, and then `backend.quickMatch()` starts (`:34-52`). Cancel returns to the lobby. A failed profile load reuses the `SearchFailed` retry pattern. Later visits skip the step.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: architecture-standards, i18n-patterns (auto-active)
  - **Dependencies**: Task 6.2
  - **Validation**: typecheck + lint pass, mobile 474/474 (26 existing FindingPlayers tests green with a `mockPickedProfile()` fake). Gate states loading → failed (SearchFailed retry) | name (NameForm continue; always setDisplayName; throw → network) | ready (private `QuickMatch` = old flow). Search only starts when `QuickMatch` mounts; cancelled flag + mounted ref
  - **Status**: ✅ Complete

- [x] **Task 6.4**: Add a "Your name" group to the Settings sheet
  - **Files**: `apps/mobile/src/app/index.tsx` (Settings `LobbySheet`, `:212-233`): show the cached name (`loadCachedProfile()`; opening Settings never calls the network) and a `NameForm` in Save mode through `ProfileBackend`. With no cache yet, saving signs in first. Show the cooldown line and the saved confirmation.
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration, acting as implementer)
  - **Skills**: accessibility-compliance, i18n-patterns (auto-active)
  - **Dependencies**: Task 6.2
  - **Validation**: typecheck + lint pass, LobbyScreen 6/6 (no test edits). `NameSettings` in index.tsx: first Settings group, cache-only on open, NameForm renders after cache read, save via `getProfileBackend()` (throw → network), rate-limited re-reads cache, mounted-ref guard, testID `settings-name`. Note: agent edited with a heredoc instead of Edit (diff confined to index.tsx)
  - **Status**: ✅ Complete

- [x] **Task 6.5**: Write the RNTL tests for the name UI
  - **Files**: `apps/mobile/src/components/lobby/__tests__/NameForm.test.tsx` (new): client format errors, server errors rendered localized, the cooldown line, rendering with the `aeb` catalog. `apps/mobile/src/components/lobby/__tests__/FindingPlayers.test.tsx`: the gate shows on the first visit only; Continue calls `setDisplayName` before `quickMatch`; Cancel; profile-load retry. `apps/mobile/src/components/lobby/__tests__/LobbyScreen.test.tsx`: Settings shows the cached name without a network call, and saving goes through `ProfileBackend`.
  - **Constraint**: `await` every `render`/`fireEvent` (RNTL v14).
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 6.3, Task 6.4
  - **Validation**: mobile 543/543 (NameForm 39 new, FindingPlayers +21 gate, LobbyScreen +9 Settings), typecheck pass, no bugs. Minor: a serverError passed before any submit stays visible after edits (no current caller does this)
  - **Status**: ✅ Complete

- [x] **Task 6.V**: Validate the i18n integration of the name UI
  - **Files**: `apps/mobile/src/components/lobby/NameForm.tsx`, `apps/mobile/src/components/lobby/FindingPlayers.tsx`, `apps/mobile/src/app/finding.tsx`, `apps/mobile/src/app/index.tsx`, `apps/mobile/src/i18n/locales/en.ts`, `apps/mobile/src/i18n/locales/aeb.ts`
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration; no i18n-specialist agent exists)
  - **Skills**: code-quality-standards, accessibility-compliance
  - **Dependencies**: Task 6.5 (all UI implementation tasks)
  - **Validation**: All 5 PASS, no fixes: no hard-coded strings; all 7 codes + network in en/aeb (typed); marginEnd only; `{{minutes}}` isolated (LRI…PDI + leading RLM in aeb, verified by throwaway test, deleted); i18n tests 18 pass. Follow-up (pre-existing, out of scope): lobby profile pill `index.tsx:329-330` uses paddingLeft/Right
  - **Status**: ✅ Complete

- [x] **Task 6.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 6.V (i18n must be valid first)
  - **Validation**: orchestrator ran: mobile 543/543, typecheck 0 errors, lint clean
  - **Status**: ✅ Complete

- [x] **Task 6.I**: Do the Derja wording pass and flag it for the user's review
  - **Files**: `apps/mobile/src/i18n/locales/aeb.ts` (the `name.*` and `settings.name` keys)
  - **Assigned Agent**: general-purpose (Tier 3 - Research/Exploration; no i18n-specialist agent exists)
  - **Skills**: None
  - **Dependencies**: Task 6.T (tests must pass first)
  - **Validation**: typecheck pass, 543 tests green. Changed aeb: placeholder (مثلاً: حمزة; en "e.g. Hamza"), saved, cooldown (+تعاود), too_long (ما يفوتش), rate_limited (توّا كيف بدّلت اسمك…). NameForm input a11y label now `settings.name` in both modes. User review: APPROVED as is (2026-10-30)
  - **Status**: ✅ Complete

- [x] **Task 6.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-player-identity-names-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 6.I
  - **Validation**: Phase 6 section written in `context/docs/2026-10-30-player-identity-names-docs.md` (by orchestrator)
  - **Status**: ✅ Complete

- [x] **Task 6.U**: Validate the name UI in the browser at desktop and phone widths, in both languages
  - **Files**: N/A (Playwright validation against `pnpm --filter @chkobba/mobile start` web at `http://localhost:8081` and local Nakama)
  - **Assigned Agent**: ui-explorer (Tier 4 - UI Validation)
  - **Skills**: accessibility-compliance
  - **Dependencies**: Task 6.X
  - **Validation**: Desktop (~1268 px) en + aeb: first quick match asks for a name, second doesn't; ab / Sh1t / tatweel show the right localized alerts; Settings shows the name, saves, then shows the 60 min cooldown with Save disabled; form card 420 px centred; RTL mirrored, Arabic input right-aligned, Latin left; two guests at one table saw each other's chosen names (Tester Two / حمزة). Phone 390 px (orchestrator): gate renders, input prefilled PlayerNNNN, sheet fills width with 16 px gutters, no horizontal scroll. Only console error: expected 400 on the profane name. Findings: disabled Save looks enabled in Modern Minimal; lobby header chip still "Guest"; Café input text contrast looks ~3:1; hint not linked via aria-describedby. Not run: Derja rename save, phone in Derja
  - **Status**: ✅ Complete

**Success criteria**
- Automated: mobile Jest, typecheck and lint pass.
- Manual: the Task 6.U scenarios; the user reviewed the Derja strings from 6.I.

---

## Phase 7: End-to-end check and finalization (plan phase 6)

**Overview**: Prove names flow end to end on real Nakama, run the device checks, then finalize the Diataxis docs and CLAUDE.md.

- [x] **Task 7.1**: Extend the e2e script to exercise display names
  - **Files**: `apps/server/scripts/e2e.ts` (device auth around `:195`). Each client calls `updateAccount({ display_name })` with a distinct name before quick match. Assert that peers see each other's names in `players[i].name`. Assert the rejection codes for a bad name (400) and for a second rename within the hour (429, `name_rate_limited`). Assert that a client which reconnects after a rename shows the new name to the other client. Use fresh device ids per run so the cooldown never blocks the first pick.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 6.U (phase 6 complete; Task 6.X is its docs gate)
  - **Validation**: server typecheck (incl. scripts/tsconfig.json) passes. Steps: `ab` → 400 name_too_short; `Hitler NNNN` → 400 name_not_allowed; first picks 200; peers see names; B renames (2nd change, 200) then reconnects → A and B2 see the new name; 3rd rename → 429 name_rate_limited. Drop markers now recorded after B's rename returns
  - **Status**: ✅ Complete

- [x] **Task 7.2**: Run the extended e2e against Docker Nakama and fix any failures
  - **Files**: N/A (runtime; fixes go in the server hooks, adapter or e2e script)
  - **Assigned Agent**: debug-specialist (Tier 2 - Domain Specialist)
  - **Skills**: None
  - **Dependencies**: Task 7.1
  - **Validation**: Run by orchestrator after build + Nakama restart: E2E PASSED in 471 s, no errors, no fixes needed. A="E2E Alpha 3230", B="E2E Beta 3230" → "E2E Beta2 3230" seen by A after reconnect; 400 (too short, not allowed) and 429 rate-limited checked; game to 21-19
  - **Status**: ✅ Complete

- [ ] **Task 7.3**: Run the phase 4 device checks on real iOS and Android dev builds
  - **Files**: N/A (manual device verification; results recorded in the task report)
  - **Constraint**: This needs the user and physical devices; Expo Go can't prove reinstall survival. The agent prepares the exact steps (where to read the user id, how to build the legacy and new builds) and records the user's results. Don't mark it complete without them.
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 7.2
  - **Validation**: Uninstall and reinstall keeps the same user id on iOS and Android; a legacy build upgraded in place keeps its user id; the result of the Android 409 path is noted, if hit
  - **Status**: ⏸️ Deferred: needs the user with physical iOS/Android dev builds (steps in the staging docs, Deferred Manual Verification)

- [x] **Task 7.4**: Write the permanent Diataxis docs for identity and names
  - **Files**: `docs/reference/wire-protocol.md`: name rules and constants, `NAME_ERROR_CODES` with their HTTP statuses, the `profile/name` record and its permissions, the three hooks, the device id per platform, `PlayerInfo.name` now being the display name. `docs/explanation/multiplayer-architecture.md`: an identity section linking ADR-0001. `docs/how-to/change-the-profanity-list.md` (new): where the lists live (`apps/server/src/account/profanity.ts`), folding rules, adding tests, rebuild and restart. `docs/README.md`: add the how-to row.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.2 (docs match shipped behaviour)
  - **Validation**: wire-protocol "Display names" section (constants, chars, 3.C error table, profile/name record, hooks, locked fields, table names, cache key); architecture "Display names" section after "Guest identity" linking ADR-0001; new how-to `change-the-profanity-list.md`; README row. Checked against code, no discrepancies (name_too_long marked unit-tested, not live-probed)
  - **Status**: ✅ Complete

- [x] **Task 7.5**: Update CLAUDE.md status and Key Patterns
  - **Files**: `CLAUDE.md`. Status: player identity step 1 implemented, with plan and docs links. Key Patterns: names come from `display_name`; the username is hidden; the `registerBeforeUpdateAccount` hook enforces the name rules; the protocol rule wording (from Task 1.3); the device id per platform. Project Structure: `apps/server/src/account/`.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.4
  - **Validation**: CLAUDE.md: status line for this branch (plan, ADR, docs, device checks pending); `src/account/`, `profile.ts`/`services.ts`, `deviceIdStore.*` in structure; new Key Patterns "Identity" bullet (display_name resolution, single hook, before-hook rules, device id per platform + salt warning, services singletons, profanity how-to). Task 1.3 wording kept; ADR and how-to links exist
  - **Status**: ✅ Complete

- [x] **Task 7.6**: Verify the implementation follows ADR-0001
  - **Files**: `docs/adr/0001-durable-guest-identity-and-display-names.md` against `packages/protocol/src/names.ts`, `apps/server/src/account/`, `apps/server/src/match/tableMatch.ts`, `apps/mobile/src/online/`
  - **Assigned Agent**: codebase-analyzer (Tier 3 - Research/Exploration)
  - **Skills**: architecture-decision-records, architecture-standards
  - **Dependencies**: Task 7.5
  - **Validation**: No deviations: validator placement, single before hook, profile/name read 1 / write 0, first pick free, hashed ANDROID_ID (raw never logged/sent, no ad id), Keychain AFTER_FIRST_UNLOCK, web localStorage, one-time migration + 409 fallback, usersGetId once per join + reclaim refresh, PlayerInfo unchanged. ADR text amendments needed (create=false, 404, retry on other errors, migration before session restore + session drop, Android fallback key, salt, Eastern digits, after hook, web degrade) → folded into 7.F
  - **Status**: ✅ Complete

- [x] **Task 7.T**: Run Tests
  - **Files**: N/A (validation task)
  - **Assigned Agent**: test-specialist (Tier 2 - Domain Specialist)
  - **Skills**: testing-patterns
  - **Dependencies**: Task 7.6
  - **Validation**: `pnpm build` ok, `pnpm test` green (rules 73, protocol 244, server 597, mobile 543), `pnpm lint` clean; Nakama restart: module loaded, 2 RPCs + before + 2 after hooks registered, smoke_game wins. e2e: the 7.2 PASSED run (471 s) stands; no file under apps/ or packages/ changed after it (only docs/CLAUDE.md)
  - **Status**: ✅ Complete

- [x] **Task 7.X**: Phase Documentation
  - **Files**: `context/docs/2026-10-30-player-identity-names-docs.md` (temporary staging)
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.T
  - **Validation**: Phase 7 section written in `context/docs/2026-10-30-player-identity-names-docs.md` (by orchestrator)
  - **Status**: ✅ Complete

- [x] **Task 7.F**: Merge the staged notes into the permanent Diataxis docs and delete the staging file
  - **Files**: Read `context/docs/2026-10-30-player-identity-names-docs.md`; classify each section (explanation, how-to, reference); merge whatever 7.4 didn't already cover into `docs/{explanation,how-to,reference}/`. The release checklist notes from 4.X go into a reference or how-to page the release process will read (for example a "Store release" section in `docs/how-to/`). Then delete the staging file.
  - **Assigned Agent**: docs-maintainer (Always Available)
  - **Skills**: documentation-standards
  - **Dependencies**: Task 7.X
  - **Validation**: Merged into docs/: wire-protocol device-id + new "Profile service (mobile)"; architecture gate states + NameForm UX; new how-tos `store-release-checklist.md` and `verify-guest-identity-on-devices.md`; README indexes every page; ADR-0001 "Implementation notes (2026-10-30)" added (status Accepted → Implemented on merge). Staging file deleted by orchestrator
  - **Status**: ✅ Complete

**Success criteria**
- Automated: `pnpm build`, `pnpm test`, `pnpm lint` and `pnpm --filter @chkobba/server e2e` pass.
- Manual: device reinstall and legacy upgrade checks pass; the docs match the shipped behaviour; ADR-0001 compliance confirmed.

---

## Execution notes

- Execute phases in order (Phase 0, then 1 through 7). Within a phase, respect the dependencies. Each phase's first task depends on the previous phase's `.X` documentation task.
- Parallelism: 1.3 and 1.4 can run alongside 1.2 after 1.1. 3.2 and 3.3 can run in parallel after 3.1. 4.5 can run in parallel with 4.4. 6.3 and 6.4 can run in parallel after 6.2.
- User gates: the profanity-list review (2.1), the Derja wording review (6.I), the device checks (7.3).
- Get manual verification confirmation between phases.
- Use the Write/Edit tools for all file operations (never `cat`).
