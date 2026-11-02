# @chkobba/mobile

The Expo (expo-router) client. Right now it is an offline game: you play against heuristic bots, either 2v2 with a bot partner or 1v1.

```bash
pnpm --filter @chkobba/mobile start   # then press w for web, or scan the QR code with Expo Go
pnpm --filter @chkobba/mobile test
```

- `src/app/`: screens. `index` is the new-game setup and `game` is the table. `/game?seed=abc` replays the same deals.
- `src/game/GameClient.ts`: the only contract the UI depends on.
  - `LocalGameClient` runs `@chkobba/rules` and the bots in-process.
  - A Nakama-backed client will implement the same interface.
- `src/components/`: the table UI (cards, seats, score bar, round summary).
