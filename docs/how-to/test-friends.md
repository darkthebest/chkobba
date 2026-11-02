# Test friends across two browsers or LAN devices

Task guide. Sets up two guest accounts and walks the friends flow by hand. Backend setup: [Local backend](local-backend.md). Why the friend code is the account username and presence is separate: [ADR-0003](../adr/0003-friend-codes-social-socket-and-presence.md). Lookup: [Wire protocol](../reference/wire-protocol.md).

## Before you start

1. **Start the backend** as in [Local backend](local-backend.md): build the module, then `docker compose up -d`.
2. **Reset local accounts if they predate friend codes.** A new account's username is its friend code, assigned only when the account is created: Nakama ignores a username on sign-in. An account created before friend codes (any username that is not eight characters, such as `Guest-XXXX`) therefore has no code and cannot obtain one in the app; My code stays on the dashed `––––-––––` placeholder with Share and Copy disabled. To give every local account a code, [wipe the local database](local-backend.md#wipe-the-local-database) once (`docker compose down -v`, then `up -d`) and reload the app. This deletes all local accounts, friends and storage.
3. **Copy the app config** (if it does not exist yet): `cp apps/mobile/.env.example apps/mobile/.env.local`, then set the values below.
4. **Start the app**: `pnpm --filter @chkobba/mobile start` (web at `http://localhost:8081`).

| Variable | Set it to | Why |
|---|---|---|
| `EXPO_PUBLIC_NAKAMA_HOST` | `127.0.0.1` on one machine; the computer's LAN IP for a phone or another device | A phone in Expo Go cannot reach `127.0.0.1` |
| `EXPO_PUBLIC_WEB_BASE_URL` | The web origin you will open, e.g. `http://localhost:8081` or `http://<LAN-IP>:8081` | Builds friend links `<base>/f/<CODE>` and room links `<base>/t/<CODE>`; unset means the app shares the code only |

- The base must be a bare origin (scheme, host, optional port); no path, query or hash.
- Restart the dev server after editing `.env.local`. That file also wins over shell variables, so check it first when the app talks to the wrong backend.

## Know which account a window gets

On web, the guest identity is a device id in `localStorage` under `chkobba.online.deviceId` (`apps/mobile/src/online/deviceIdStore.web.ts`). The session also lives in `localStorage`. Both are scoped to one origin in one browser profile:

| Windows | Storage | Accounts |
|---|---|---|
| Two tabs of the same profile on the same origin | Shared `localStorage` | **One account** once the first tab has signed in; the second resumes it |
| Two separate browser profiles (two Chrome profiles, or Chrome and Firefox) | Separate `localStorage` | Two accounts |
| Same profile at `http://localhost:8081` and `http://127.0.0.1:8081` | Separate `localStorage` (different origins) | Two accounts |
| Private/incognito window | Separate, temporary storage | A separate account; storage is discarded when all private windows close (or blocked entirely, in which case each reload is a new guest) |

Two tabs are therefore the wrong way to test friends: your own `/f/<CODE>` link shows "This is your code", and the add-by-code preview says the same. Use two profiles, or the two localhost origins.

The web base is a single origin, so a `/f/` link always opens the account at that origin. For link tests, use two profiles on the same origin, or open the same `/f/<CODE>` path at the other origin.

## Two accounts on one machine

1. **Open the first window** at `http://localhost:8081` in profile A. Pick a display name when asked. Open **Friends** from the lobby tile. Note the code on **My code**.
2. **Open the second window** in profile B (or at `http://127.0.0.1:8081` in the same profile). Its code must be different. If it is the same, you are still in one storage partition: switch profiles or origins.
3. **Add by code.** In A, type B's code into **Add by code** (`XXXX-XXXX`; the field formats itself). When the preview says **Player found**, choose **Add friend**. The first Add or Accept asks for a display name (the name gate) if one was not picked yet.
4. **Accept.** In B, open **Friends** → **Requests** → **Accept**. A's row moves from **Sent** to **Friends**; both see each other under **Friends**.
5. **Watch availability.** Keep both Friends screens open:
   - A in the lobby reads **Online**.
   - A in a private waiting room reads **In a room**.
   - A in a started game reads **In a game**.
   - Closing A's tab reads **Offline** on B's list.
6. **Add by link.** In A, use **Share** on **My code** and take the `/f/<CODE>` link from the share sheet (or from the card's selectable fallback), then open it in B. The preview offers **Add friend** (or the current edge, such as **Accept** or **Unblock**). **Copy code** copies only the 8 characters; without `EXPO_PUBLIC_WEB_BASE_URL` the app shares the code only, so add by code instead.
7. **Add from a table.** Get both accounts into one online setting: quick match from both within about 15 seconds, or create a private table on A and join by code on B. Tap the other human's avatar or name; its accessible label is `<name>: player options`. The sheet offers **Add friend**, **Accept request**, **Request sent** or **Friends**. Bots have no user id and no player sheet.
8. **Block, then confirm requests stop.** Choose **Block** on a friend row or in a player sheet, then confirm. To test the recent list, play a table together first so they appear under **Recent players**. Check that:
   - the player moves to **Blocked** and out of **Friends** and **Recent players** (where they were listed), and the friendship is removed from both sides;
   - an Add friend call from the blocked account creates no request in your **Requests**, and shows them no error or hint: the preview still says **Player found** and **Add friend** stays enabled, deliberately, so the block is not revealed (Nakama accepts the call and ignores it);
   - blocking in a player sheet also mutes that seat's emotes, with the "Emotes muted" hint in the sheet.
9. **Unblock.** Choose **Unblock** on the **Blocked** row or in the player sheet. The block is removed; the friendship is not restored, but they can send a new request and you can accept it (and they reappear in **Recent players** if you played together). While blocked, their requests were silent no-ops: Nakama answered the call successfully but created no request.

## A LAN device

1. **Make the backend reachable.** Start Nakama as above, and set `EXPO_PUBLIC_NAKAMA_HOST` in `apps/mobile/.env.local` to the computer's LAN IP. The phone or second computer must be on the same network, and port `7350` must be reachable.
2. **Open the app on the second device.** For a phone in Expo Go, start with `pnpm --filter @chkobba/mobile start` and open the project from Expo Go. For a browser on another device, open the LAN address Expo prints (usually `http://<LAN-IP>:8081`).
3. **Set the web base** to `http://<LAN-IP>:8081` so friend and room links render, then restart the dev server. The phone and the browser are separate accounts with separate codes; add them to each other with the steps above.
4. **Expect the secure-context fallback on plain-http LAN web.** `http://<LAN-IP>:8081` is not a secure context, so the Share and Clipboard APIs are unavailable there. The friend code and room code cards fall back to selectable text when Share and Copy cannot work. Native Expo Go is unaffected and can still use the system share sheet.
5. **Run the same flow**: add by code, add from the `/f/<CODE>` preview, accept, watch availability, block and unblock. Reloading the web page keeps the same account, because the stored device id signs it back in.

## Checklist

| Check | Expected |
|---|---|
| Two tabs, same profile | Same account; "This is your code" |
| Two profiles, or localhost vs 127.0.0.1 | Two accounts with different codes |
| Add by code | Preview names the player; request lands in **Sent** |
| Add by link | `/f/<CODE>` preview offers Add or the current edge |
| Add from a table | Player sheet on another human's seat, never on a bot |
| Accept | Both sides show the player under **Friends** |
| Availability | Online, In a room, In a game, Offline change without a reload |
| Block | Out of Friends and Recent players, into Blocked; the friendship is removed; requests have no effect and no feedback; a block from the player sheet mutes that seat |
| Unblock | Removed from Blocked; a new request can be sent and accepted; the friendship is not restored |

## Related

- [Local backend](local-backend.md): run Nakama, configure the app, test private tables on the LAN
- [ADR-0003: Friend codes, social socket and presence](../adr/0003-friend-codes-social-socket-and-presence.md)
- [Wire protocol](../reference/wire-protocol.md)
