# Players directory v1 — browser validation notes (2026-11-01)

The staging doc (`2026-10-31-players-directory-docs.md`) was merged into `docs/`
and deleted as Task 10.F required. These are the notes from the manual passes
(8.U, 9.U, 10.U) that ran afterwards.

## Screens checked (Expo web, port 8082, Docker Nakama up)

| Width | Language | Screens | Result |
|---|---|---|---|
| 1280 px | en | lobby, `/players` (empty, search results, Recent players), `/friends`, `/blocked` | correct; Players tile present, no Ranking tile |
| 390 px | en | `/players` with results | single column, no overflow |
| 1280 px | aeb | `/friends` | fully mirrored; names and numbers isolated |
| 390 px | aeb | `/players` | fully mirrored, single column |

Zero console errors on every screen. Search ran against live data (`dir` found
the e2e accounts), so the directory's real path — index, RPC, rows — was
exercised, not just the empty state.

## A real bug the browser pass caught

Removing the own-code load from `useFriendsController` (Task 9.4) also removed
the only mount-time `getProfile()` call on the Friends screen. On a fresh device
that left `chkobba.online.profile` unset, so `UnlistedCallout` rendered nothing:
the card was unreachable for exactly the player it exists for. Jest did not catch
it because the tests mock `loadCachedProfile`.

Fix: the callout now falls back to one `getProfile()` when the cache is empty,
and still renders nothing if that read fails. Tests updated (14 in the suite).

## Evidence

Screenshots were taken for every row above but are not committed (2.3 MB of
build artifacts do not belong in the repo). Recreate them by running the app and
walking the table; the test ids are `tile-players`, `friends-find-players`,
`friends-unlisted`, `friends-blocked-open` and `players-screen`.

## Still needs a human

- Derja wording sign-off for the Phase 9 strings (`lobby.players*`,
  `friends.findPlayers*`, `friends.unlisted.*`, `friends.blocked.*`).
- Account deletion does not release the name claim — the open carry-forward from
  ADR-0004, still unimplemented.
