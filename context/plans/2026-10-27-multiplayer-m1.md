# Plan: Multiplayer milestone 1, "online table works"

**Goal:** two to four real people play 2v2 Chkobba online:

- Quick match from the lobby.
- Empty seats fill with bots after 15 s.
- A dropped player is replaced by a bot and gets the seat back on reconnect.
- A 20 s turn timer.

Everything runs locally: Docker Nakama + Postgres, guest login.

**Decisions (user, 2026-10-27)**

- Scope: local Nakama, guest (device) login, quick match 2v2 with bot backfill, reconnect, turn timer.
- 2v2 only (1v1 queue later).
- Turn timer: 20 s per play and 10 s for the cut. On timeout a bot plays that turn. After 2 misses in a row the player is marked *away* and a bot keeps playing until they act again.
- Later milestones, in order: private tables (code), Google/Apple login, friends + ranking, hosting.

**Technical decisions (mine; revisit if research below disagrees)**

- **Nakama v3.40** (latest, 2026-07). Pin the image tag and the `nakama-common` version from the compatibility matrix in the release notes.
- **Table finding:** not Nakama's matchmaker, which can't backfill with bots after a wait. Instead:
  - Authoritative matches tagged with a JSON label: `{ open, mode, seatsFree, private }`.
  - A `quick_match` RPC calls `nk.matchList` for an open table and otherwise calls `nk.matchCreate`.
  - The same labels later power the lobby's Open tables panel and private tables (`private: true, code`).
- **One authoritative match per table, `tickRate: 1`.** It holds the full `GameState` and validates every intent with `applyMove`/`applyCut`. Each presence receives only its own `viewFor(state, seat)`.
- **Pure table core.** Seats, timers, bot turns, backfill and reconnect live in a pure `apps/server/src/table/` module, testable in Vitest without Nakama. The Nakama handler is a thin adapter over it.
- **Build:** the server runtime is goja (ES5). Bundle with Rollup + Babel `@babel/env` (the documented path). Not esbuild, which can't lower to ES5.
- **Client:** `NakamaGameClient` implements the existing `GameClient` interface with `@heroiclabs/nakama-js` 2.8.0 (supports React Native), so the table screens stay unchanged.

## Wire protocol (opcodes)

**Client → server**

| Opcode | Payload | Meaning |
|---|---|---|
| `1 PLAY` | `{ cardId, capture }` | Play a card |
| `2 CUT` | `{ keep }` | Resolve the cut |
| `3 BACK` | — | "I'm here": clears *away* status |

**Server → client**

- **`100 SNAPSHOT`:** sent to one presence only. Carries:
  - `view` (that seat's `PlayerView`)
  - `players` (name, isBot, away, connected per seat)
  - `log` (new public events with `seq`)
  - `turnDeadline` (epoch ms)
  - `phase` (`waiting` | `playing` | `between` | `finished`)
- **`101 ERROR`:** `{ code }`.

**Rounds and lifecycle**

- The next round starts automatically about 8 s after the round summary, so there's no "next round" vote online.
- Hidden information never leaves the server. A test asserts that no snapshot for seat N contains another seat's hand or the stock.

## Phases

### 0. Infrastructure

- **`docker-compose.yml`:** Postgres (pinned), Nakama v3.40 (pinned), and a migrate entrypoint, as in the Heroic Labs TypeScript runtime guide.
- **`apps/server/`** (`@chkobba/server`):
  - `package.json`, `tsconfig.json`, `rollup.config.mjs`, `babel.config.json`
  - `local.yml` with `runtime.js_entrypoint: build/index.js`
  - `Dockerfile`: node build stage → Nakama image
- **Smoke test:** `InitModule` logs on boot; `docker compose up --build` loads the module.
- **Verify early:** that the bundled `@chkobba/rules` runs in goja: `Set`/`Map`, spread, `for…of`, `Array.from`. Add a smoke RPC that plays a full bot game server-side.

### 1. Table core (pure, Vitest)

**`apps/server/src/table/`**

- **State:** `TableState` = `GameState | null` + seats `{ userId, sessionId, name, bot, connected, away, missed }` + `createdAt` + `turnDeadline` + `phase`.
- **Reducers:**
  - `join` (claims a free seat, or reclaims a reserved one by `userId`)
  - `leave` (disconnect → `connected: false`, bot plays)
  - `intent` (PLAY/CUT/BACK, validated through the engine)
  - `tick(now)` (backfill at 15 s, timers, bot turns paced about 1 s, auto next round, finish)
- **Projections:** `snapshotFor(seat)`, and `label()`.
- **Tests:**
  - backfill timing
  - 4 humans start immediately
  - timeout → bot plays → 2 misses → away → BACK clears it
  - disconnect/reconnect keeps the seat
  - illegal intents rejected
  - no hidden-info leakage
  - full simulated game to the end

### 2. Nakama adapter

- **`main.ts`:**
  - `InitModule` registers the `chkobba_table` match handler, `quick_match` RPC, and smoke RPC.
- **Match handler** maps the Nakama lifecycle onto the table core:
  - `matchJoinAttempt`: accept the reserved userId or a free seat.
  - `matchJoin` / `matchLeave` / `matchLoop`: messages → intents; tick → `tick(Date.now())`.
  - Broadcast a per-presence snapshot only when that seat's view changed.
  - `dispatcher.matchLabelUpdate` when seats or phase change.
  - Terminate about 60 s after finish, or when empty for 60 s.
- **`quick_match` RPC:**
  - Search `+label.open:T +label.mode:2v2 +label.private:F`.
  - Return the match with the fewest free seats, else `matchCreate`.
- **Seeds:** server-side from `nk.uuidv4()`.

### 3. Client

- **`apps/mobile/src/online/`:**
  - `nakama.ts`: client from `EXPO_PUBLIC_NAKAMA_HOST/PORT/KEY/SSL`; device auth with a persisted random device id (AsyncStorage); auto guest username.
  - `NakamaGameClient.ts`: `start()` connects the socket, joins the match, and subscribes to `onmatchdata` → snapshot. `play`/`cut` send opcodes; `nextRound` is a no-op online.
  - **Reconnect:** on socket loss, retry with backoff and rejoin the same `matchId`. The snapshot exposes `connection: 'online' | 'reconnecting'`.
- **`GameSnapshot` additions:**
  - `turnDeadline?` and `connection?`
  - players' `away`/`connected`
- **UI:**
  - **Lobby:** the Quick match tile becomes active and opens a "Finding players…" screen with the seat count and a "bots join in N s" countdown.
  - **Table:**
    - `Avatar` gets an optional `progress` prop (0–1) for the draining turn ring (Café glow and Minimal ring).
    - Away and disconnected badges on seats.
    - A "Reconnecting…" banner.
  - **Route:** `/game?online=1&matchId=…`. The `LocalGameClient` path is unchanged.

### 4. End-to-end verification

- **Node script** (`apps/server/scripts/e2e.ts`) using nakama-js against `docker compose`:
  - 2 clients quick-match into the same table.
  - Bots backfill 2 seats.
  - The script plays to game over.
  - It kills one client's socket mid-round, reconnects, and asserts the seat comes back.
- **Manual:** two browser windows plus a phone on LAN via Expo Go.

## Risks / open questions

- **ES5 runtime:** goja features used by the engine. Verify in phase 0 before building on it.
- **Round-end snapshot size:** keep the log delta, not the full log.
- **Hard bot cost** on a busy server (Monte Carlo, 64 worlds). The server bots use Normal for now; make the level a table setting later.
- **Clock skew:** `turnDeadline` is server epoch ms. The client converts it using the offset measured at connect.
- **No accounts yet:** a device-id guest loses identity on reinstall. That's accepted until social login (milestone 3).
