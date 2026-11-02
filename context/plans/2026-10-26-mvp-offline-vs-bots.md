# Plan: MVP, offline Chkobba against bots

**Goal:** a playable game, human vs bots (4-player 2v2 by default, 2-player supported), in the Expo app on web and phone. There is no backend yet. The code must be shaped so that adding Nakama (phase 2) means adding an adapter, not a rewrite.

**Inputs:**
- Rules and variants: `context/docs/research-rules-and-engines.md`. The user confirmed the canonical defaults.
- Client decision: Expo (expo-router), web and Expo Go.

## Architecture

```
packages/rules  (@chkobba/rules) pure TS, zero deps, deterministic
  cards.ts      Card/Suit/Rank, createDeck, cardValue(config)
  config.ts     RulesConfig + DEFAULT_RULES (every disputed rule is a flag)
  rng.ts        seeded sfc32 RNG; its state lives inside GameState (serializable)
  captures.ts   captureOptions(card, table, config): rank-first, then sum subsets
  scoring.ts    scoreRound(piles): karta, dineri, bermila, 7aya, chkobba
  engine.ts     createGame / legalMoves / applyMove / startNextRound
                returns { state, events } or { error }; events drive animation and, later, network broadcast
  view.ts       viewFor(state, seat): hides other hands and the stock
  bots/         Bot interface: chooseMove(view, legalMoves). It works on a PlayerView, so it cannot cheat
                heuristicBot (greedy weights + sweep-risk penalty), randomBot

apps/mobile     (@chkobba/mobile) Expo
  src/game/GameClient.ts       interface the UI depends on (subscribe, getView, play, nextRound)
  src/game/LocalGameClient.ts  owns GameState in-process and runs bots on a scheduler
                               (phase 2 adds NakamaGameClient)
  src/components/              Card, Hand, Table, OpponentSeat, ScoreBar, RoundSummary
  src/app/                     index (new game), game (table)
```

**Why it extends cleanly:**
- The engine is a pure reducer over serializable state. Nakama's match handler can store the state in match state and call `applyMove` with no changes.
- Bots consume `PlayerView`, so the same bot code fills a seat on the server.
- The UI only knows `GameClient` + `PlayerView`, so going online swaps the client implementation, not the screens.
- New variants are `RulesConfig` flags. New bot levels are new `Bot` implementations.

## Steps

1. Root workspace: pnpm-workspace (hoisted), tsconfig base, scripts.
2. `@chkobba/rules`:
   - Engine and bots, with Vitest unit tests (captures, scoring, deal/redeal, chkobba rules, game end).
   - A seeded simulation test: thousands of bot games that check invariants (40 cards conserved, termination, scores).
3. `@chkobba/mobile`:
   - Expo scaffold.
   - LocalGameClient with a jest test.
   - Table UI: select a card, highlight the capture, choose between multiple capture options.
   - Bot pacing, round summary, game over.
4. Verify: `pnpm test` and typecheck. Play it in the browser via Playwright.

## Out of scope (later phases)

- Nakama server.
- Auth and social.
- Cut-card choice.
- Animations polish and sounds.
- Harder bots (determinized search).
