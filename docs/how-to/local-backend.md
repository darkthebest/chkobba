# Local backend and multiplayer testing

Task guide. Concepts: [Multiplayer architecture](../explanation/multiplayer-architecture.md). Lookup: [Wire protocol](../reference/wire-protocol.md).

## Run Nakama locally

```
pnpm --filter @chkobba/server build
docker compose up -d          # Nakama 3.40 + Postgres 16; API :7350, console :7351
```

Dev loop after changing server code: `pnpm --filter @chkobba/server build`, then `docker compose restart nakama`.

### Wipe the local database

Every new account gets a friend code as its username. Accounts created before friends keep their `Guest-XXXX` username and show no code. To start clean:

```
docker compose down -v        # also removes the pgdata volume
docker compose up -d
```

This deletes all local accounts, friends and storage. Guests are created again on the next sign-in.

Display names are claimed in storage now: the claim lives in `player_directory` and the account's own record in `player_directory_own`. A wipe clears both, so each named account is unlisted until it next signs in, when sign-in re-claims the name best-effort. An account whose name now clashes with another stays unlisted rather than failing sign-in; if a tester loses a name after clearing only one of the two collections, clear both by hand and sign in again.

A full manual pass for name search, hidden availability, blocking and resetting claims is in [Test the players directory across two browsers or devices](test-players-directory.md).

Smoke test:

```
curl -X POST "localhost:7350/v2/rpc/smoke_game?http_key=defaulthttpkey&unwrap" -d '{}'
```

`nakama-runtime` is pinned to `github:heroiclabs/nakama-common#v1.47.0` (required by Nakama 3.40.0).

## Build and run the Docker image

```
docker build -f apps/server/Dockerfile -t chkobba-nakama .
docker run --network chkobba_default \
  -e NAKAMA_DATABASE_ADDRESS=postgres:localdb@postgres:5432/nakama \
  -p 17350:7350 chkobba-nakama
```

- `NAKAMA_DATABASE_ADDRESS` is required; nothing is baked in.
- The entrypoint runs `nakama migrate up`, then starts Nakama with `local.yml`.
- The image uses default keys; override them for any real deployment.
- The Dockerfile installs with `--config.node-linker=isolated` because the workspace's hoisted linker ignores `--filter` and would pull in Expo.

## Run the end-to-end test

```
docker compose up -d
pnpm --filter @chkobba/server build && docker compose restart nakama
pnpm --filter @chkobba/server e2e
```

- Overrides: `NAKAMA_HOST`, `NAKAMA_PORT`, `NAKAMA_KEY`, `E2E_TIMEOUT_MS` (default 12 min for the quick match alone, 18 min for the default run, 30 min with `--full`).
- A full quick game takes about 7-8 minutes (1 s bot pacing, 8 s between rounds). The private scenario takes about 1 minute plus the 60 s empty-table close; `--full` plays the game out and runs the return to the room, so allow about 18 minutes.
- Flags: `--private-only` skips the quick match and the friends checks; `--quick-only` skips the private table and the friends checks; `--friends-only` runs only the friends checks; `--limits` runs the outgoing-limit check (also included in `--full`); `--invite` adds the invite checks; `--invite-only` runs only the invite checks; `--full` plays the private game to the end, asserts the reset keeps the code and seats, and includes the invite checks. With no flags it runs the quick match, the leaver game, the private table and the friends checks.
- It checks the quick match: two guests land at one table on different seats; 2 bots backfill and the game starts within 25 s; legal moves; a dropped socket shows `connected: false` and rejoin restores the seat and log; no hidden-state leaks; both clients reach `finished`.
- It checks the leaver game: a player who leaves mid-game gets a recent-players record within a few seconds; the seated player's record is written when they leave.
- It checks private tables: A creates and gets a code; B joins by code; both get room snapshots; B switches seats; A leaves and the host passes to B; A rejoins as a member; B starts and bots fill; C joins by code mid-game and gets a standing snapshot with no `view`, then takes over a bot seat; everyone leaves and after `EMPTY_TIMEOUT_MS` the code returns `room_not_found`; a bad code returns `room_bad_code`; the 11th lookup returns `room_rate_limited`.
- It checks friends: two accounts add by lowercase code; `-2` and `-3` arrive over the socket; accept; follow and presence including a status change; remove; block (a re-request is dropped); unblock and request again; each human's recent players lists the other human and no bots; the 51st pending request returns `friend_outgoing_limit`.
- It checks invites (with `--invite`, `--invite-only` or `--full`): the invite RPC error matrix and the notification delivery from the wire protocol.
- It lives in `apps/server/scripts/` with its own tsconfig and runs via `tsx`.

## Configure the mobile app

Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`.

| Variable | Default | Note |
|---|---|---|
| `EXPO_PUBLIC_NAKAMA_HOST` | `127.0.0.1` | Use the LAN IP for a phone in Expo Go |
| `EXPO_PUBLIC_NAKAMA_PORT` | `7350` | |
| `EXPO_PUBLIC_NAKAMA_KEY` | `defaultkey` | Public client key, not a secret |
| `EXPO_PUBLIC_NAKAMA_SSL` | `false` | Must be `true` for any non-local server |
| `EXPO_PUBLIC_WEB_BASE_URL` | unset | Public web address used to build private-table share links (`<base>/t/<code>`); leave unset to share the code only |

Start with `pnpm --filter @chkobba/mobile start` (web at `http://localhost:8081`).

**`apps/mobile/.env.local` wins over shell variables.** Expo inlines the `.env.local` file into the web bundle, so `EXPO_PUBLIC_NAKAMA_PORT=17350 pnpm start` still binds the app to whatever `.env.local` says. To run a second dev server against another backend (a throwaway stack, for example), move `.env.local` aside while that server runs and give the values on the command line; put it back afterwards. Check it took by fetching the entry bundle and grepping it for `EXPO_PUBLIC_NAKAMA_HOST`, or by watching which Nakama receives a `create_private_table` call.

### Private tables on the LAN

Private tables add one setting and one wrinkle to the setup above:

1. Set `EXPO_PUBLIC_WEB_BASE_URL=http://<LAN IP>:8081` in `apps/mobile/.env.local`. The share link in the waiting room is built from it; without it the app shows the code and a copy button instead of a link. Restart the dev server after changing it.
2. Set `EXPO_PUBLIC_NAKAMA_HOST=<LAN IP>` as for any phone testing. A phone in Expo Go cannot reach `127.0.0.1`.
3. Create a table on one device (home screen → Create private table), then join on the other (Join with code, or open the `/t/<code>` link). The join metadata carries the code; a direct match id without it is refused as `room_not_found`.
4. Web reloads of `/t/<code>` rejoin the same table and reclaim the seat by device id. Reloading the host's tab also loses the host crown to the next present member.

## Regenerate typed routes after adding a route

Run `expo start` once so `.expo/types/router.d.ts` is regenerated; `typecheck` fails until then.

## Manual multiplayer test

Not yet done in the milestone 1 review. Run with the backend up.

1. **Phone layout online.** Open `http://localhost:8081` at 390x844 (devtools device mode) and start Quick match. Check that the phone layout shows the turn ring, Away and Offline badges, the away banner and the reconnecting banner.
2. **Two browser windows.** Use two separate browser profiles, or one normal and one private window, so each gets its own device id. Quick-match in both within 15 s. Check that:
   - both land on the same table;
   - bots fill the other 2 seats;
   - letting your turn time out twice shows the away badge on the other window and the away banner on yours;
   - closing one window shows Offline on the other, and reopening it and quick-matching returns the same seat. Rejoin goes through `/game?online=1&matchId=...`; a fresh quick match may create a new table, so note what happens.
3. **Phone on the LAN via Expo Go.** Set `EXPO_PUBLIC_NAKAMA_HOST=<LAN IP>`, run `pnpm --filter @chkobba/mobile start`, open it in Expo Go, and quick-match together with a browser window. Check fonts, the ring animation, and reconnect after toggling wifi.
