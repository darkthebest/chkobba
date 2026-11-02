---
date: 2026-10-26T21:24:11+01:00
git_commit: a2558741ab257569081fcee52727ff9cef832472
branch: main
repository: chkobba
apps_involved: multiple
topic: 'Offline Chkobba MVP (rules engine, Expo app, desktop layout, lobby) Handoff'
tags: [implementation, rules-engine, bots, expo, skins, desktop-layout, lobby, cut, dealer-draw]
status: complete
last_updated: 2026-10-26
type: handoff
---

# Handoff: Offline Chkobba MVP, ending with the desktop layout, deal ritual and lobby

## Task(s)

The offline game is playable against bots on phone and desktop web. Everything is committed and pushed to `origin/main` (`a255874`), and the working tree is clean.

All of these are **completed**:

1. **Research.** There's no reusable open-source Chkobba engine, so we wrote our own. The user confirmed the Tunisian rule defaults.
2. **`@chkobba/rules`.** A pure, seeded rules engine for 2-player and 2v2:
   - capture options, scoring and round flow
   - draw for dealer, and the cut each round
   - player views that hide other hands
   - Easy, Normal and Hard bots
3. **`@chkobba/mobile`.** The Expo app (expo-router):
   - offline play through `LocalGameClient`
   - two skins: Café Tunisien (default) and Modern Minimal
   - card animations, including captures staged as "land, then sweep"
4. **Desktop.** Desktop is the default layout. The phone layout is used only below 900 px wide. Desktop adds hover previews and keyboard play.
5. **The deal ritual.** At game start everyone draws and the lowest card deals. Every round, the player after the dealer keeps or throws the cut card. Double-tap plays a card when it has only one possible move.
6. **The café lobby.** Play vs bots works. Quick match, Private table, Friends and Ranking show as "Soon" (they need the server).
7. **Competitor review.** We looked at chkobbeta.tn (live web/PWA, online, drag-to-capture, traditional card art). The user decided:
   - copy nothing from it
   - keep our numbered capture options
   - drag-and-drop waits for user feedback
   - the in-app tutorial or onboarding is "not now"

These are **planned and not started**:

- **Phase 2, the Nakama server (`apps/server`).** The user has said it's "too early" twice. Only start when they ask.
- **Not yet chosen:** sound and haptics, a rules settings screen, traditional card-face art, bot personas, onboarding.
- **Phone testing.** The app has never been run on a real phone, only a phone-sized browser window. The Android bundle compiles.

## Critical References

- `/home/hamza/Projects/chkobba/CLAUDE.md`: architecture rules covering the engine API, round flow and cut, bots, skins, layouts and card motion.
- `/home/hamza/Projects/chkobba/context/docs/research-rules-and-engines.md`: the ruleset, variant flags, terminology and sources.
- `/home/hamza/Projects/chkobba/Chkobba Online Product & Build Plan.md`: the product roadmap (phases 1–5).

### Source Documents (REQUIRED)

- **Plan**: `/home/hamza/Projects/chkobba/context/plans/2026-10-26-mvp-offline-vs-bots.md` and `/home/hamza/Projects/chkobba/context/plans/2026-10-26-skins.md`. Later work (animations, bot levels, desktop, deal ritual, lobby) was ad hoc, driven by user requests in the session.
- **Checklist**: N/A

## Recent changes

Commits on `main`, oldest first:

| Commit | Content |
|---|---|
| `7bd562c` | Baseline: engine, Expo app, skins |
| `d42c079` | Card animations: `useStagedTable` and `MotionCard` |
| `c198968` | Bot levels: Monte Carlo Hard bot |
| `ff40500` `feat(rules)` | Draw for dealer, and the cut |
| `2ebc5db` `feat(mobile)` | Desktop table, deal ritual UI, double-tap |
| `cf7fa7d` `feat(mobile)` | Café lobby |
| `2411d7f` `docs` | `CLAUDE.md` |
| `a255874` `context` | Research notes |

Key files:

**Engine (`/home/hamza/Projects/chkobba/packages/rules/src/`)**

- `engine.ts`:
  - `createGame` draws for dealer unless a `dealer` is passed.
  - `drawForDealer`, `startRound`, `offerCut`, `applyCut`, `applyMove`, `startNextRound`.
- `types.ts`: `Phase` now includes `'cutting'`; adds `CutDecision`, `DealerDraw`, and the events `dealerDrawn`, `cutOffered`, `cutResolved`, `redealt`.
- `config.ts`: `RulesConfig` flags; `cutCardChoice` defaults to true.
- `view.ts`: `PlayerView`. `piles` are public; the cut card is visible only to the cutter.
- `bots/`:
  - `heuristicBot.ts`
  - `monteCarloBot.ts`: 64 sampled worlds.
  - `sampling.ts`
  - `levels.ts`: `createBot(level)`.
  - `cut.ts`: `keepCutCard` and `chooseCut`.

**Client and game logic (`/home/hamza/Projects/chkobba/apps/mobile/src/game/`)**

- `GameClient.ts`: the interface, including `cut()`.
- `LocalGameClient.ts`: bots, delays, the intro delay.
- `useTableController.ts`: all table logic shared by both layouts: selection, hover, double-tap, cut, intro, celebrations.
- `useStagedTable.ts`: capture staging, 650 ms land then 400 ms sweep.
- `useTableKeyboard.ts`
- `captureNumbers.ts`
- `format.ts`

**UI (`/home/hamza/Projects/chkobba/apps/mobile/src/`)**

- `layout.ts`: `DESKTOP_MIN_WIDTH = 900`, `useLayout()`.
- `components/GameTable.tsx`: picks `DesktopLayout` or `PhoneLayout`.
- `components/table/`: `TableArea`, `TablePanels`, `PhoneLayout`, `DesktopLayout`, `CutPrompt`, `DealerDrawIntro`.
- `components/`: `Card.tsx` (scale and hover), `HandFan.tsx`, `MotionCard.tsx`, `CaptureOptions.tsx`, `RoundSummary.tsx`, `Seat.tsx`, `Segmented.tsx`.
- `components/lobby/`: `LobbyTile`, `LobbySheet`, `LobbyIcons`.
- `app/index.tsx`: the lobby.
- `app/game.tsx`: the game. It takes `?players=&target=&level=&seed=` (the seed replays the same deals).
- `skins/`: `types.ts` (the `Skin` contract), `cafe/`, `minimal/`, `index.tsx` (`SkinProvider`, persisted with AsyncStorage), `fonts.ts`.

**Changelog**

- `/home/hamza/Projects/chkobba/CHANGELOG.md`: created with an `[Unreleased]` section.

## Learnings

**Toolchain**

- **TypeScript 6** defaults `types` to `[]`. The mobile `tsconfig.json` lists `jest` explicitly.
- **React Native Testing Library v14:** `render` and `fireEvent` are async; always `await` them.
- **Jest** needs the AsyncStorage mock in `/home/hamza/Projects/chkobba/apps/mobile/jest.setup.js`.

**Animations**

- **Reanimated layout animations** (`entering`/`exiting`/`LinearTransition`) broke the wrapping table layout on web: cards overlapped mid-capture. We replaced them with React Native's `Animated` via `MotionCard` and the staged table. Don't switch back.

**Clicks and taps**

- **Playwright clicks** can arrive as duplicate presses a few milliseconds apart in React Native Web. That caused accidental double-tap plays and selections toggling off. `useTableController` now ignores presses under 40 ms apart.
- In Playwright, drive the game with `page.mouse.click` on element centres, not locator `.click()`.

**Code conventions**

- **React Compiler lint** forbids reading `ref.current` during render. Use `useState(() => new Animated.Value(0))` instead.
- **Arabic mixed with numbers** in one `Text` flips direction on web, and `writingDirection` doesn't fix it. Put each piece in its own `Text` element inside a row.
- **Engine constraints:** stay within the ES2017 lib, with no `.at()` and no `Math.random`, so it bundles for goja (Nakama) later.
- **Tests that create games** must get past the `cutting` phase. Use `startedGame` and `botStep` from `/home/hamza/Projects/chkobba/packages/rules/test/helpers.ts`, or pass `rules: { cutCardChoice: false }` and a `dealer`.

**Bot strength** (2v2 games to 21)

- Normal beats Easy 80% of the time; Hard beats Normal about 90%.
- A Hard decision takes about 5 ms on average and up to 35 ms on desktop V8. It's unmeasured on Hermes (phones).

**Scaffolding leftovers**

- The Expo scaffold added `/home/hamza/Projects/chkobba/apps/mobile/AGENTS.md` (Expo guidance) and `/home/hamza/Projects/chkobba/apps/mobile/.claude/settings.json` (enables the Expo plugin). Both were kept.

## Artifacts

- `/home/hamza/Projects/chkobba/context/docs/research-rules-and-engines.md`
- `/home/hamza/Projects/chkobba/context/plans/2026-10-26-mvp-offline-vs-bots.md`
- `/home/hamza/Projects/chkobba/context/plans/2026-10-26-skins.md`
- `/home/hamza/Projects/chkobba/context/ui/chkobba-designs-index.html`, with `chkobba-design-1-cafe.html`, `-2-sidi-bou-said.html` and `-3-minimal.html`. These are the skin prototypes; Sidi Bou Said is a candidate future skin.
- `/home/hamza/Projects/chkobba/CLAUDE.md`
- `/home/hamza/Projects/chkobba/CHANGELOG.md`
- `/home/hamza/Projects/chkobba/apps/mobile/README.md`

## Action Items & Next Steps

1. **Ask the user what to work on next.** Don't assume. Candidates they've seen:
   - sound and haptics
   - a rules settings screen exposing the `RulesConfig` flags
   - traditional card-face art (needs licensed or commissioned art)
   - bot personas
   - onboarding (declined for now)
   - the Nakama server (phase 2), only when they say so
2. **Get a real-device check.** On the phone, check:
   - fonts, the SVG lattice card back, shadows, and the `Animated` glows and motion
   - Hard bot latency on Hermes
   - double-tap timing (350 ms) on touch
3. **Start the app with** `pnpm --filter @chkobba/mobile start`:
   - web at http://localhost:8081
   - phone via Expo Go at `exp://<LAN-IP>:8081`; the LAN IP was 192.168.0.123
4. **Before committing,** use the project `/commit` skill:
   - scoped conventional commits, ordered `rules`, then `mobile`, then `docs`, then `context`
   - update `CHANGELOG.md` under `[Unreleased]`
   - no Claude attribution lines
   - the user pushes to `main`

## Other Notes

**How to work with this user**

- Asks to be questioned one at a time with AskUserQuestion, recommendation first.
- Prefers **short** answers; they explicitly said "too many words".
- Wants honest UI states: no fake online counts.

**Commands**

- Tests and checks: `pnpm test` (rules ≈ 73, mobile 29), `pnpm typecheck`, `pnpm lint`.
- Expo lint runs via `expo lint` with `eslint-config-expo`.

**Environment**

- Playwright screenshots must be saved under the repo (`.playwright-mcp/`, which is gitignored). The scratchpad path is outside the allowed roots.
- The Expo dev server may still be running from this session in watch mode on port 8081.
