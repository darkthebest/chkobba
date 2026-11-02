# Verify guest identity on devices

Checks that the user id survives a legacy upgrade and a reinstall. Needs physical iOS and Android devices with dev builds; Expo Go cannot prove it. Status: pending manual run (task 7.3).

1. Make the backend reachable from the phones: `docker compose up -d`, and set `EXPO_PUBLIC_NAKAMA_HOST` in `apps/mobile/.env.local` to the machine's LAN IP.
2. To find a user id, open the Nakama console `http://localhost:7351`, Accounts, newest first. The Devices tab shows the device id (`chk-<uuid>` on iOS, `chk-a-<64 hex>` on Android); Profile shows the display name.
3. Legacy upgrade (first, per platform):
   - Check out the m1 commit `675321f` and build a dev client: `pnpm --filter @chkobba/mobile exec expo run:ios --device` or `run:android --device`.
   - Open Quick match once and note the user id (device id `chk-<uuid>`).
   - Check out this branch, build and install over it (do not uninstall). Open Quick match: the same user id must come back.
   - Android: the Devices tab must now list both the legacy `chk-<uuid>` and the `chk-a-...` id (`linkDevice`). If only the legacy id is there and Metro logs `GuestAuth: durable device id belongs to another account; kept the legacy guest account`, the 409 path was hit: note it.
4. Reinstall: uninstall, install this branch's build, open Quick match. The same user id must come back, with no "Choose your name" step if a name was already picked.
5. Record per platform: legacy upgrade ok, reinstall ok, 409 hit.

Rules being verified: [Multiplayer architecture, Guest identity](../explanation/multiplayer-architecture.md#guest-identity).
