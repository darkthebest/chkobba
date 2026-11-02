# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

Chkobba Online: an online 4-player (2v2) Tunisian Chkobba card game for mobile, mixing real players and bots, with friends/groups, social login, ads, and (later) cosmetic-only credits. Product scope and roadmap live in `Chkobba Online Product & Build Plan.md`.

- **Language**: TypeScript end to end
- **Backend**: Nakama (Heroic Labs) — server-authoritative matches written as a TypeScript runtime module
- **Client**: Expo / React Native (expo-router)
- **Package Manager**: pnpm (workspaces)
- **Testing**: Vitest (`packages/rules`, `apps/server`), jest-expo + React Native Testing Library (`apps/mobile`)
- **Database**: PostgreSQL, managed entirely by Nakama — app code never writes SQL; it uses Nakama storage, wallet, friends, and groups APIs

> **Status:**
> - Phase 1 MVP is in place: `@chkobba/rules` and the offline Expo app (you vs bots).
> - Phase 2 (multiplayer) milestone 1 is implemented on branch `feature/2026-10-27-multiplayer-m1`, pending review: plan in `context/plans/2026-10-27-multiplayer-m1.md`, docs in `docs/`.
> - Player identity step 1 (display names and a durable guest) is implemented on branch `feature/2026-10-30-player-identity-names`, pending review: plan in `context/plans/2026-10-30-player-identity-names.md`, ADR `docs/adr/0001-durable-guest-identity-and-display-names.md`, docs in `docs/` (wire protocol "Display names", architecture "Guest identity"/"Display names", how-to `docs/how-to/change-the-profanity-list.md`). Device reinstall checks on real phones are still pending.
> - Private tables (room codes, share links, host-started 2v2 games) are implemented on the same branch, pending review: plan in `context/plans/2026-10-30-private-tables.md`, ADR `docs/adr/0002-private-tables-room-codes-and-host-model.md`, docs in `docs/` (wire protocol "Private tables", architecture "Private tables", how-to "Private tables on the LAN" in `docs/how-to/local-backend.md`).
> - Friends v1 (friend codes, presence, table invites, recent players) is implemented on the same branch, stacked on private tables and pending review: plan in `context/plans/2026-10-30-friends.md`, ADR `docs/adr/0003-friend-codes-social-socket-and-presence.md`, docs in `docs/` (wire protocol "Friends", architecture "Friends", how-to `docs/how-to/test-friends.md`).
> - Players directory v1 (unique public names, prefix search, player profiles, competitive and practice stats, presence visibility, Blocked players) is implemented on branch `feature/2026-10-31-players-directory` in PR #5 into `main`, pending review: plan in `context/plans/2026-10-31-players-directory.md`, ADRs `docs/adr/0004-unique-display-names-players-directory-and-presence-visibility.md` and `docs/adr/0005-stats-provenance.md`, docs in `docs/` (wire protocol "Players directory", architecture "Players directory", how-to `docs/how-to/test-players-directory.md`). The Derja wording needs a native-speaker sign-off.
> - `apps/server` builds a Nakama module (Rollup + Babel to ES5, mounted into Docker) with the `chkobba_table` match, the `quick_match`, `create_private_table`, `join_by_code` and `invite_to_table` RPCs, the directory RPCs (`search_players`, `get_player_profile`, `set_presence_visibility`, `report_practice_game`) and `smoke_game`.
> - Rule defaults and their sources are in `context/docs/research-rules-and-engines.md`.

## Commands

### Development
- Build: `pnpm build` (runs `pnpm -r build`)
- Test: `pnpm test` (runs `pnpm -r test`)
- Test with coverage: `pnpm test:coverage`
- Lint: `pnpm lint`
- Single package: `pnpm --filter @chkobba/rules test`
- Local backend:
  1. `pnpm --filter @chkobba/server build`
  2. `docker compose up -d` (Nakama 3.40 + Postgres 16; API `:7350`, console `:7351`)
  - After rebuilding the module, run `docker compose restart nakama`.
  - Smoke test: `curl -X POST "localhost:7350/v2/rpc/smoke_game?http_key=defaulthttpkey&unwrap" -d '{}'`
- End-to-end online test (needs the backend up): `pnpm --filter @chkobba/server e2e` — about 8 min for quick match, about 2 min for private tables (about 18 min with `--full`), about 3 min for friends (about 5 min with `--limits`), about 3 min for invites; flags `--quick-only`, `--private-only`, `--friends-only`, `--invite-only`, `--full` (all scenarios), and `--invite` (adds invites without `--full`)
- Docker image: `docker build -f apps/server/Dockerfile -t chkobba-nakama .` (see `docs/how-to/local-backend.md`)
- Mobile: `pnpm --filter @chkobba/mobile start` (Expo; web at `http://localhost:8081`). Online config: `apps/mobile/.env.example`.

### Planning Workflow
- Research first: `/research`
- Create plan: `/create-plan`
- Execute plan: `/execute-plan`
- Review execution: `/review-execution`
- Artifacts live in `context/` (`plans/`, `checklists/`, `reviews/`, `tickets/`, `docs/`)

## Project Structure

```
packages/rules/   @chkobba/rules  — pure TS Chkobba engine + bots (deck, deal, capture, scoring, 2v2 teams)
packages/protocol/ @chkobba/protocol — wire types and opcodes shared by server and mobile (types, consts and pure dependency-free helpers)
apps/server/      @chkobba/server — Nakama runtime module (InitModule)
  src/table/        pure table core (seats, timers, intents, snapshots; no nkruntime)
  src/match/        `chkobba_table` match handler (thin adapter over the core)
  src/rpc/          `quick_match`, `create_private_table`, `join_by_code`, `smoke_game`
  src/social/       friend rules, hooks, recent players, invites, `matchSignal`
  src/account/      name rules, profanity lists, account hooks
  src/directory/    unique-name claims, prefix search, profiles, block invisibility, presence visibility, rate limits
  src/stats/        competitive stats (written at finish) and practice stats (device-reported)
  scripts/e2e.ts    end-to-end test against a running Nakama (quick match, private tables, friends, invites, directory)
apps/mobile/      @chkobba/mobile — Expo app (expo-router screens under src/app)
  src/online/       Nakama client: `NakamaGameClient` implements `GameClient`
    profile.ts, services.ts  profile service and shared client/`GuestAuth` singletons
    friends.ts, socialSocket.ts  friend backend and the app-level social socket; `SocialProvider.tsx` serves `useSocial()`
    deviceIdStore.*  per-platform device id storage (ios, android, web)
  src/components/room/  private-table views: `PrivateRoom`, `PrivateSession`, room seat and code
  src/components/friends/  friends views: `FriendsSections`, `FindPlayersCard`, invite banner
  src/components/directory/  directory views: `PlayerRow`, `UnlistedCallout`, availability, skeleton
  src/components/profile/  `PlayerProfile`, `StatBlock`
  src/directory/    `useDirectoryController`: search, paging, selection
  src/friends/      `useFriendsController`: friend list, requests, invites and recent players
  src/game/useRoomController.ts  room state and actions shared by both room layouts
  src/app/          screens: `/players` (directory, Ranking tab), `/p/[userId]` (profile), `/blocked`, `/friends`, `/f/[code]` (legacy friend link), `/private` (create), `/t/[code]` (join by code or share link)
  src/i18n/         i18next catalogs (`en`, `aeb` Derja RTL), `LanguageProvider`, `DirectionView`
docs/             Diataxis docs (explanation/how-to/reference); start at docs/README.md
docker-compose.yml               — Nakama + Postgres for local dev (mounts apps/server/build)
```

### Engine API (`@chkobba/rules`)

- It is a pure reducer over plain, serializable state:
  - `createGame({ seed, playerCount, rules })`
  - `legalMoves(state)`
  - `applyMove(state, move)`, which returns `{ ok, state, events }` or `{ ok: false, error }`
  - `startNextRound(state)`
  - `viewFor(state, seat)`
- The RNG state lives inside `GameState`, so a seed fully replays a game.
- Round flow:
  - `createGame` draws for the first dealer: lowest card deals, ties redraw (`dealerDrawn` event), unless `dealer` is passed.
  - With `cutCardChoice` (default on) each round starts in phase `cutting`. The seat after the dealer sees `view.cut.card` and calls `applyCut({ seat, keep })`.
  - Keep: the cut card joins their hand plus 2 more. Throw: it lands face up on the table plus 3 more.
  - Three of a kind on the opening table means reshuffle and cut again.
  - A kept cut card is never in public events.
  - In tests, use `startedGame` / `botStep` from `test/helpers.ts` to get past the cut.
- House-rule variants are `RulesConfig` flags (`DEFAULT_RULES` = most common Tunisian rules). Add new variants there, never as forks in the code.
- Bots implement `Bot.chooseMove(view: PlayerView)`. They only ever see a `PlayerView`, never the full state.
  - `PlayerView.piles` is public by design: captured cards were all shown on the table.
  - Levels come from `createBot(level)`:
    - `easy`: the heuristic, plus a random move 35% of the time.
    - `normal`: the one-ply heuristic.
    - `hard`: determinized Monte Carlo with 64 sampled worlds and heuristic rollouts.
  - Measured in 2v2 games to 21: normal beats easy about 80% of the time; hard beats normal about 90%.
  - A hard decision takes about 5 ms on average and up to 35 ms on desktop V8. Watch it on Hermes and in goja.
- The mobile UI depends only on `GameClient` (`apps/mobile/src/game/GameClient.ts`).
  - `LocalGameClient` is the offline implementation.
  - Online play adds a Nakama implementation behind the same interface.
- **Skins** (`apps/mobile/src/skins/`):
  - Each skin is a `Skin` with tokens plus slot components: `Background`, `TableSurface`, `CardFace`, `CardBack`, `Avatar`, `ScoreBoard`, `Panel`, `Celebration`, `Wordmark`.
  - Layout and interaction live once in `src/components/` and read the active skin via `useSkin()`.
  - Never fork a layout per skin. Add a token or a slot instead.
  - Skins: Café Tunisien (default), Modern Minimal, Sahara Night, Sidi Bou Said (the only light skin) and Neon Souk. Prototypes are in `context/ui/`.
  - Sahara Night, Sidi Bou Said and Neon Souk reuse the Café card faces and backs until per-skin decks land. A skin that draws its own mat sets `matBorder`/`matBg` to `transparent`.
  - The Café deck is the Wikimedia Commons "Chkobba" deck: French-pattern court cards and the red "RT" (Régie Tunisienne) monopoly back.
    - Its SVGs live in `apps/mobile/assets/decks/tunisian/`, named by card id.
    - `node scripts/build-tunisian-deck.mjs` inlines them into `src/skins/cafe/tunisianDeck.ts`, which `SvgXml` renders.
    - Licence: the court cards and the back are CC BY-SA 4.0, so the author must be credited in the app. See that folder's README.
    - On web every card shares one DOM, so SVG ids must be unique per card. The generator adds a per-card prefix to every id.
  - Skins are future cosmetic shop items (`premium` flag).
  - Fonts load once via `SKIN_FONTS` using per-weight subpath imports.
- **Emotes** (`apps/mobile/src/emotes/`, `components/emotes/`; wire contract in `docs/reference/wire-protocol.md` "Emotes"):
  - A fixed set (`EMOTE_IDS` in `@chkobba/protocol`), no free text. Only ids go on the wire; phrases are translated under `emotes.phrases`.
  - `GameClient.emote` / `subscribeEmotes` are transient and never part of the snapshot. `useEmotes` owns bubbles, the 3 s cooldown, per-seat mute and the last-used quick row, and `GameTable` provides it via `EmotesContext`.
  - Bubbles are one shared `EmoteBubble` styled by the `bubbleBg`/`bubbleText`/`bubbleBorder` skin tokens.
  - `LocalGameClient` bots emote offline. `botEmotes` defaults to off when a test injects a `scheduler`, so timer counts stay exact.
- **Languages** (`src/i18n/`, how-to in `docs/how-to/add-a-language.md`):
  - English and Tunisian Derja (`aeb`, Arabic script, right to left); the player picks in Settings.
  - No hard-coded UI text: `const tr = useT()` (`t` is the skin tokens). Helpers outside React take `tr` as an argument.
  - `en.ts` defines the `Translation` type, so a key missing from another catalog fails typecheck.
  - RTL is a root `DirectionView` (web `dir`, native `direction` style), not `I18nManager`, so switching needs no restart.
  - Use `marginStart`/`end` for things that mirror. Cards, hand fan, capture chips and the table stay `DirectionView dir="ltr"`.
  - In RTL languages `i18n.ts` adds a leading RLM and isolates every interpolated value, so names and cards don't scramble mixed lines.
- **Phone and desktop:** one Expo app serves iOS, Android and the web.
  - Desktop is the default. Screens switch to the phone layout only below 900 px wide (`src/layout.ts`, `useLayout()`), whatever the window's aspect ratio.
  - This applies to both the game (`DesktopLayout` / `PhoneLayout`) and the home screen (two columns / stacked).
  - Both layouts render the same `useTableController(client)`. Put game and table logic there, never in a layout.
  - Desktop adds scaled cards (`Card scale`), hover previews and keyboard play (`useTableKeyboard`, web only).
- **Choosing a move** (`useTableController`):
  - Only Easy bots show capture options, badges and hover previews (`GameClient.captureHints`). On Normal, Hard and online, the player taps a hand card and then the table cards to take; the move plays as soon as the picks form a legal capture. A pick that can't lead to one shakes and clears.
  - Tapping the empty mat places the card. The mat's press target is a layer behind the cards: as their parent it would also get the cards' clicks on web.
  - Double-tap (500 ms) never deselects. With hints it plays a card's only move; without, it only places.
  - A selected hand card lifts by growing its press area rather than moving, so a second tap can't miss it.
- **Sound** (`src/audio/`, files and sources in `assets/sounds/README.md`):
  - `SoundProvider` (expo-audio) preloads every recording (an effect with several takes plays a random one) and loops the skin's `ambience`. It respects the iPhone silent switch and mixes with other apps.
  - Settings: an effects level, an ambience level (each 0–1 in 4 steps) and mute-all, saved in `chkobba.sound`.
  - `SoundControls` is the one UI for them, in lobby Settings and in the table's `SoundButton` sheet, so players never leave a game to change sound.
  - `useTableSounds(c)` maps table state to effects. Screens and tests import `soundContext.ts`, never the provider, so they don't need the native module.
  - The `expo-audio` plugin in `app.json` turns off the microphone and background playback. Keep them off.
- **Card motion:**
  - `useStagedTable` replays engine state changes as a readable capture: land (650 ms), then sweep (400 ms), then remove.
  - `MotionCard` animates with React Native `Animated`.
  - Don't use Reanimated `entering`/`exiting`/`LinearTransition` for table cards: on web they pull cards out of the wrapping layout and cards overlap.
  - Round summaries and chkobba celebrations wait for `staged.staging` to clear.
  - `LocalGameClient` adds bot delay after captures and sweeps so the animations finish first.
- Keep the engine within the ES2017 lib (no `.at()`, `Object.hasOwn`, etc.) and avoid `Proxy`/`Math.random`, so it bundles for goja.
- TS 6 defaults `types` to `[]`; the mobile tsconfig lists `jest` explicitly.
- Keep the whole workspace on Babel 7: Expo and jest-expo require it. Adding a Babel 8 package re-resolves peers across the lockfile and breaks every mobile test. If that happens, restore `pnpm-lock.yaml` and reinstall.
- RNTL v14 `render`/`fireEvent` are async; always `await` them.

## Key Patterns

- **Dependency direction**: `packages/rules` is pure — no Nakama, React Native, or I/O imports; deterministic with an injectable/seeded RNG. Both apps depend on it; apps never import from each other.
- **Server is authoritative**: the server holds the deck and every hand. Clients send intents (opcodes); the match handler validates turn, seat, and legality via `@chkobba/rules` before applying. Never broadcast hidden state — send each presence only its own hand.
- **Nakama runtime constraints**: the server module runs in goja, so it is bundled to a single ES5-compatible file with no `require`/npm at runtime and must expose `InitModule`. Verify the bundle loads in the Nakama container after build changes.
- **Multiplayer tables** (details in `docs/explanation/multiplayer-architecture.md`, wire contract in `docs/reference/wire-protocol.md`):
  - Apps share wire types via `@chkobba/protocol`; changing it breaks shipped builds, so changes stay additive. It holds types, consts and pure helpers (e.g. the display-name format check in `names.ts`); helpers must stay dependency-free and goja-safe (ES2017, no `\p{}`/`u`-flag regex).
  - `src/table` stays pure; the adapter only maps Nakama hooks onto it. `tick` does at most one action per call; the adapter loops (max 8).
  - The snapshot fingerprint excludes `serverTime`, so snapshots go out only on change.
  - Server bots play at Normal. Bots take away and disconnected seats, so BACK must be explicit.
  - The match index lags about 1 s: the client retries `quick_match` on `table_full`, and `quick_match` reuses its newest table for 5 s (versioned storage record) so simultaneous players share it.
  - On web, avoid secure-context-only APIs (`crypto.randomUUID`, `crypto.subtle`): LAN testing serves over plain `http://<LAN-IP>`.
  - After adding an expo-router route, run `expo start` once to regenerate typed routes before `typecheck`.
- **Identity** (details in `docs/adr/0001-durable-guest-identity-and-display-names.md`):
  - Names shown at the table come from the account's `display_name` (fallback username, then `Player`), resolved once per join with `nk.usersGetId` and refreshed on reclaim. The `username` is the visible friend code: 8 chars from `ROOM_CODE_ALPHABET`, uppercase, shown as `XXXX-XXXX`, assigned server-side by the `beforeAuthenticateDevice` hook (Nakama only uses it on create). Accounts from before friend codes keep a `Guest-XXXX` username and show no code; clients treat a username as a code only when `isFriendCode` accepts it (see ADR-0003).
  - The `registerBeforeUpdateAccount` hook is the single enforcement point for name rules: format from `@chkobba/protocol` `names.ts`; profanity and the one-hour cooldown are server-only in `apps/server/src/account/`. The cooldown lives in the server-owned `profile/name` storage record.
  - Before hooks must `return data` (null gives a 404) and throw `{ message, code }` with numeric codes (`nkruntime.Codes` is a const enum Babel can't inline).
  - Device id per platform: iOS Keychain (`expo-secure-store`); Android `chk-a-` + SHA-256(ANDROID_ID + salt), never send the raw ANDROID_ID or link it to the advertising ID; web `localStorage`. A one-time migration is guarded by `chkobba.online.deviceIdMigrated`. Changing the Android salt changes every Android guest's id.
  - Mobile online code uses the shared singletons in `src/online/services.ts` (one client, one `GuestAuth`), not a backend per screen.
  - Profanity lists: see `docs/how-to/change-the-profanity-list.md`.
- **Private tables** (details in `docs/adr/0002-private-tables-room-codes-and-host-model.md`, wire contract "Private tables" in `docs/reference/wire-protocol.md`):
  - Members are separate from seats: humans present in join order, seated or standing, up to `ROOM_MAX_MEMBERS`. `SIT` covers sitting, switching and taking over a bot seat; `START` is host-only. The host is the earliest present member and is reassigned on leave (even mid-game).
  - The room code never goes in the match label: any client can list authoritative matches and read labels. The mapping is a system-owned `private_table/<code>` record with read/write 0, written with a version check. Codes and records live in `apps/server/src/rpc/` (`roomStore.ts`, `roomLimits.ts`, `privateTable.ts`).
  - A private table admits a newcomer only when the join metadata carries the code (`ROOM_JOIN_CODE_KEY`); a wrong or missing code is `room_not_found`, the same as a dead code. Members reclaiming by `userId` are exempt.
  - A standing member's snapshot is `seat: -1` with `view: null`; never build a `PlayerView` for them. Clients must send `{ code }` metadata on every private join.
  - Private tables never backfill while waiting and never auto-start; after a game the scores stay `ROOM_RESET_MS`, then the table returns to the room with the same code and seats.
  - Share links need `EXPO_PUBLIC_WEB_BASE_URL` (`<base>/t/<code>`); unset means code-only sharing. On a non-localhost plain-`http://` LAN origin the Share and Clipboard APIs are unavailable (secure context), so the room shows selectable text instead.
- **Friends** (details in `docs/explanation/multiplayer-architecture.md` "Friends", wire contract "Friends" in `docs/reference/wire-protocol.md`):
  - Friends uses a separate app-level social socket (`src/online/socialSocket.ts`), distinct from the game socket. The game socket connects with status off — `socket.connect(session, false)` in `apps/mobile/src/online/nakama.ts` (not a `createSocket` flag, where `verbose` is the third argument). The social socket connects with status on, so it appears online and carries presence.
  - Presence is `{"v":1,"a":"lobby|room|playing"}` and never carries a room code or match id: an invite is the only path to a private table's code.
  - `invite_to_table` is validated server-side (mutual friend, live code, caller is a member via `nk.matchSignal`), rate-limited per sender and deduped per (friend, code), and delivers one persistent `TABLE_INVITE` notification.
  - The adapter writes recent players on leave and on finish (`social/recent_players`, server-owned), tracked per game so one game writes once per player, best effort.
  - Friend requests go through the `registerBeforeAddFriends` hook; Nakama drops requests to users who blocked you (200, no edge) — expected, not a bug.
  - The friend code UI retired in v1 (ADR-0004): `/friends` shows "Find players" (same `/players` screen as the lobby's Players tile) instead of a code card and add-by-code form. The username is still the code and `lookupCode` plus `/f/[code]` stay for links in shipped builds — don't delete them.
- **Players directory** (details in `docs/adr/0004-unique-display-names-players-directory-and-presence-visibility.md` and `docs/adr/0005-stats-provenance.md`, wire contract "Players directory" and architecture "Players directory"):
  - The display name is the unique, public, searchable handle. Uniqueness is a server-owned claim record keyed `n<sha256hex(foldName)` (`player_directory/<key>`, read 0 / write 0), never Nakama's `display_name`. Release guard: a fold-equal rename (case/accent only) must not release the claim; a genuine fold change does.
  - Fold (`packages/protocol/src/directory.ts` `foldName`) is one explicit character map, versioned, and the same key for claims and queries. Prefix search goes through the storage index `player_names` on `NameClaim.fold`; there is no full-table scan and no browse endpoint (ADR-0004 section 8).
  - Search and profile exclude the caller and either direction of a block, so a blocked profile is byte-identical to an unknown id. Rate limits per caller: 100 searches and 200 profile views per 10 minutes.
  - Presence visibility (`Everyone` / `Nobody`) is stored in `profile/prefs`, written only by `set_presence_visibility`. `Nobody` publishes nothing (the social socket connects appear-offline) but is neither offline nor anonymous: the player stays listed and readable. Server-side friends-only presence is future work and copy must not promise it.
  - Stats are two unsummable blocks (ADR-0005): competitive is server-observed at match finish (bots skipped, leavers excluded), practice is device-reported, clamped and rate-limited. Never add them together.
- **Bots**: bot backfill after ~10–20 s in matchmaking; the same bot takes over a disconnected seat and hands it back on reconnect. Bot logic lives in `packages/rules` so it is testable offline.
- **Monetization guardrails**: credits are strictly cosmetic, never wagered or convertible. Wallet changes happen server-side only (`nk.walletUpdate`), with IAP receipts validated first. No ads mid-hand.
- **Store compliance**: Sign in with Apple whenever other social logins are offered; in-app account deletion; block/report once chat/groups exist; EU consent (Google UMP) before ads.
