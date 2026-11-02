# Test the players directory across two browsers or devices

Task guide. Sets up two guest accounts and walks the directory by hand: name search and folding, the unlisted card, hidden availability, blocking, and resetting local claims. Backend setup: [Local backend](local-backend.md). Why names are unique and claims are server-owned: [ADR-0004](../adr/0004-unique-display-names-players-directory-and-presence-visibility.md). Why practice stats are not competitive: [ADR-0005](../adr/0005-stats-provenance.md). Lookup: [Wire protocol](../reference/wire-protocol.md).

## Before you start

1. **Start the backend** as in [Local backend](local-backend.md): build the module, then `docker compose up -d`.
2. **Start from clean local data** if the environment has old test accounts or claims. The full reset is in [Reset local accounts and claims](#reset-local-accounts-and-claims). A claim left by an earlier run can make a name you intend to use unavailable.
3. **Copy the app config** (if it does not exist yet): `cp apps/mobile/.env.example apps/mobile/.env.local`, then set the values below.
4. **Start the app**: `pnpm --filter @chkobba/mobile start` (web at `http://localhost:8081`).
5. **Open the directory.** Use the lobby **Players** tile, the Friends screen's **Find players** card, or `http://localhost:8081/players` directly. The **Players** / **Ranking** switch is in the URL (`?tab=`); Ranking is a "Soon" placeholder.

| Variable | Set it to | Why |
|---|---|---|
| `EXPO_PUBLIC_NAKAMA_HOST` | `127.0.0.1` on one machine; the computer's LAN IP for a phone or another device | A phone in Expo Go cannot reach `127.0.0.1` |
| `EXPO_PUBLIC_WEB_BASE_URL` | The web origin you will open, e.g. `http://localhost:8081` or `http://<LAN-IP>:8081` | Builds share links; leave it unset to share a code as text only |

Restart the dev server after editing `.env.local`; that file wins over shell variables.

## Know which account a window gets

On web, the guest identity is a device id in `localStorage` under `chkobba.online.deviceId` (`apps/mobile/src/online/deviceIdStore.web.ts`). The session lives in `localStorage` too. Both are scoped to one origin in one browser profile:

| Windows | Storage | Accounts |
|---|---|---|
| Two tabs of the same profile on the same origin | Shared `localStorage` | **One account**: the second tab resumes the first |
| Two separate browser profiles (two Chrome profiles, or Chrome and Firefox) | Separate `localStorage` | Two accounts |
| Same profile at `http://localhost:8081` and `http://127.0.0.1:8081` | Separate `localStorage` (different origins) | Two accounts |
| Private/incognito window | Separate, temporary storage | A separate account; storage is discarded when all private windows close |

**This is the most common way the test goes wrong.** A shared browser shares the device id, so both windows are the same account. The directory never returns the caller in its own search results, so searching for "the other player" finds nothing and looks like a broken search. Use two profiles, or the two localhost origins, and confirm the two accounts have different names before testing.

## Two accounts, one directory

1. **Claim a name in window A.** Open `http://localhost:8081` in profile A. Open Settings → **Your name**, enter a name and save. A listed player is one with a claimed, unique name; an account with none is not searchable.
2. **Claim a different name in window B.** Use profile B (or the same profile at `http://127.0.0.1:8081`) and save a different name. If the second window already shows A's name, the two windows share storage and are the same account: switch profile or origin.
3. **Search from B.** Open **Players** in B and type A's name. You should see:
   - a count line such as **1 player shown** (the number is what is loaded, not a total);
   - A's row with their name and availability;
   - an **Add** button, because there is no friend edge yet.
4. **Add from the row.** Choose **Add**. If a name was never saved, the name gate opens first; otherwise the chip moves to **Requested** and A gets a friend request.
5. **Accept.** In A, open **Friends** → **Requests** → **Accept**. Each account's row for the other now shows **Friends** instead of **Add**.

A player's own account never appears in their own results; that is deliberate, not a broken search.

## Accent and case folding

Search is prefix-only and folds both sides before comparing. Lowercase a name, drop its accents, or spell Arabic letter variants the other way and the same player still comes back:

1. In A, claim a name with case and an accent, such as `Hédi`.
2. In B, search `hedi`, then `HEDI`, then `Hédi`. Each query should return the same player.
3. If the name is Arabic, repeat with the variants: `أ`/`إ`/`آ`/`ا`, `ة`/`ه`, and `ى`/`ي`. The claim is stored under the folded form, so all of them match.

Ordering has one promise: an exact folded match leads the first page. Other prefix matches follow in storage order, not alphabetical order, so do not read a result page as a ranking.

- To see exact-first, use a third account (or rename one account) so two listed names share a prefix, such as `Nadia` and `Nadia Two`, then search `nadia`. The exact `Nadia` row is first.
- A one-character query is refused locally with **Type at least 2 characters.** It never reaches the server.

## The unlisted card

An account with no claimed name publishes no claim, so nobody can find it.

1. Use a fresh account (or an account just after a database wipe). Open the lobby once and let it connect, then open **Players**. You should see **Make yourself findable**, with **Choose a name** and **Dismiss**. The card reads the cached profile, so a device that has never signed in shows nothing until that first read lands.
2. In the other browser, search for the name the unlisted account will claim. Before the claim exists, you should get **No players found**.
3. In the unlisted card, choose **Choose a name**, enter a name and save. The card disappears.
4. Without reloading either page, search the new name from the other browser. The player should appear.

Notes:

- **Dismiss** is device-local (`chkobba.directory.unlistedDismissed`). A fresh install, another browser or another device shows the card again; a dismissal is not a name.
- After a database wipe, a named account is unlisted until it next signs in, when sign-in re-claims the name best-effort. If that name is now held by someone else, the account stays unlisted rather than failing sign-in.
- Choosing a name anywhere else (Settings, the friends name gate) also removes the card through the profile subscription; the directory does not need a reload.

## The Nobody check

Presence visibility is a setting, not a block. A player who chooses **Nobody** publishes no presence at all.

1. In A, open Settings → **Who can see you** and choose **Nobody**. The save takes effect without a restart; the social socket reconnects with status off.
2. In B, search A and open A's profile. You should see **Availability hidden by this player**, with no coloured dot.
3. In B's search row for A, you should see **Availability not shared**, again with no dot.
4. Confirm that neither surface says **Offline** and neither shows an offline dot. Hidden means "publishes nothing", not "disconnected".
5. In A, choose **Everyone** again. B's row and profile should return to a live activity or genuine **Offline** without a reload.

Known v1 limit: the friends list still renders a Nobody player as **Offline**, because no presence arrives for that account. Judge this check from the directory row and the profile, not from **Friends**.

### A second device on the LAN

1. Set `EXPO_PUBLIC_NAKAMA_HOST` to the computer's LAN IP, and `EXPO_PUBLIC_WEB_BASE_URL` to the web origin you will open, such as `http://<LAN-IP>:8081`.
2. Open the app on the phone (Expo Go) or on another computer's browser. It is a separate account from the browser on the first machine; claim a different name.
3. Run the same search and Nobody steps from this device.

On a plain `http://<LAN-IP>:<port>` origin, the Share and Clipboard APIs are unavailable because the origin is not a secure context. Any code or share control falls back to selectable on-screen text; select the text and copy it by hand. Native Expo Go is unaffected.

## Block invisibility

Block from the profile, or from the player's row under **Friends** or **Recent players**. To test every list, first make them friends and play one quick match together so both appear under **Recent players**.

1. In A, open B's profile (select B in search; on a phone the profile opens at `/p/<userId>`) and choose **Block**, then confirm.
2. In B, search A. You should get **No players found**, not a distinct "blocked" message.
3. In A, search B. The result is also **No players found**.
4. Open B's old profile URL in A, and A's profile URL in B. Both should show **Player not found** (the client reports `directory_not_found`). A block is invisible in both directions, so the refusal is byte-identical to an unknown player.
5. Check the lists:
   - both accounts disappear from each other's **Recent players**;
   - the friendship is removed and neither appears under **Friends**;
   - the blocker's **Blocked players** list holds the blocked player, reachable from **Friends**; the blocked player sees no equivalent signal.
6. Unblock from **Blocked players** or the profile. Search and profiles become reachable again; the friendship is not restored, so a new request is needed.

`directory_not_found` also covers a player who never claimed a name, a stale claim and an unknown id. The client cannot tell them apart, and it should not try.

## Reset local accounts and claims

A **claim** is a server-owned storage record under `player_directory`, keyed by `n<sha256hex(folded name)>` and owned by the system user. It is what makes a name searchable. The account also has an owner-readable pointer under `player_directory_own/own/<userId>`.

Removing the claim record frees the name. That is not the whole story: the account still holds the display name, and its next sign-in re-claims the name best-effort. To give a name to a different account, change or remove the account that held it, or do a full reset.

**There is no reset script in this repository.** Only the e2e runner (`apps/server/scripts/e2e.ts`) and the normal package scripts exist. The routes below are manual.

### Full reset (recommended)

This removes every local account, claim, own record, presence preference, stat record, friendship and block, and is the only route that cannot leave a half-cleared claim:

```
docker compose down -v        # also removes the pgdata volume
docker compose up -d
```

Reload the app. Each guest is created again on the next sign-in. This only touches local data.

### Targeted manual cleanup in the Nakama console

Use this when you want to keep most accounts. It is manual and per record; do not script it as if it were a project tool.

1. Open the Nakama console at `http://localhost:7351`.
2. **Identify the accounts.** Under **Users**, match the display names or device ids used in the test. A device-auth account has a username that is a friend code; an older account has `Guest-XXXX`. Delete the accounts you no longer need.
3. **Delete their claims.** Under **Storage**, open collection `player_directory`. A claim value shows `{ userId, name, fold, claimedAt }`; delete the row whose `fold` is the name you want to free.
4. **Delete their pointers.** Open collection `player_directory_own` and delete `own/<userId>` for the same accounts. Account deletion cascades the own record, `profile/prefs` and both `player_stats/*` records, but **not** the claim, which is owned by the system user.
5. Sign in again and search the name. If an account still holds the display name, it re-claims on sign-in; rename or delete that account to keep the name free.

### Verification recipes (local dev only)

The credentials below are the local defaults used by this compose stack (`apps/server/local.yml`). They are **local-dev-only**; never reuse or publish them for any other environment.

Device auth needs the server key as basic auth. Each new device id creates a new guest; reusing an id returns the same account:

```
curl -u defaultkey: -X POST 'localhost:7350/v2/account/authenticate/device?create=true&unwrap' \
  -d '{"id":"directory-test-a"}'
```

The response carries `token`. Use it as a bearer token; `/v2/account?unwrap` returns the `user.id` if you need it:

```
curl 'localhost:7350/v2/account?unwrap' -H "Authorization: Bearer $TOKEN"
```

Search uses **`q`**, not `query`:

```
curl -X POST 'localhost:7350/v2/rpc/search_players?unwrap' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"q":"hedi"}'
```

Profile and presence:

```
curl -X POST 'localhost:7350/v2/rpc/get_player_profile?unwrap' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"userId":"<userId>"}'

curl -X POST 'localhost:7350/v2/rpc/set_presence_visibility?unwrap' \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"visibility":"nobody"}'
```

- Search and profile responses expose the name as **`name`**, not `displayName`.
- Keep `?unwrap`. Without it, the RPC body must be a JSON-encoded **string**, not an object; sending an object fails at the gateway with `cannot unmarshal object into Go value of type string`:

  ```
  curl -X POST 'localhost:7350/v2/rpc/search_players' \
    -H "Authorization: Bearer $TOKEN" \
    -d '"{\"q\":\"hedi\"}"'
  ```

- Search is rate-limited to 100 calls per 10 minutes per account; a verification loop that exceeds it returns `directory_rate_limited` (429). Profile reads allow 200 in the same window.

## Clean-slate checklist

Run this before calling the directory tested. Each row should hold on a fresh full reset.

| Check | Expected |
|---|---|
| Two profiles (or localhost vs 127.0.0.1) | Two different accounts with different names |
| Two tabs of one profile | One account; searching for the other name finds nothing |
| Search by exact name | The player appears with **Add** and their availability |
| Search with different case and without accents | The same player appears |
| Search a shared prefix (three accounts) | The exact match leads the first page; later rows are not alphabetical |
| One-character query | **Type at least 2 characters**; no request is made |
| Unlisted account | **Make yourself findable** in its own browser; **No players found** in the other |
| Choose a name via the card | Card disappears; the other browser finds the player without a reload |
| Nobody | Profile says **Availability hidden by this player**; row says **Availability not shared**; never **Offline**, no offline dot |
| Everyone again | Real activity or **Offline** returns without a reload |
| Block from a profile | Both searches miss, both profiles are not found, recent players and friends lists drop the pair |
| Blocked list | The blocker sees the player under **Blocked players**; the blocked player sees no signal |
| Unblock | Search and profile work again; the friendship is not restored |
| Stats on a profile | Competitive and Practice are separate blocks; Practice is marked device-reported; nothing ranks practice games |
| Ranking tab | **Ranking is coming soon**; no ranking data is shown |

## What is not covered by the UI

A few behaviours are only observable from the server side and are checked by the end-to-end scenario rather than by hand:

- The unique-name **claim lifecycle** (release guard on a fold-only rename, old claim freed on a real fold change) and its **stale reclaim**. A rename cooldown of one hour per account means each account gets one rename: use separate accounts rather than renaming one twice.
- The exact error bodies: a blocked profile is byte-identical to an unknown id, and `directory_bad_query` / `directory_rate_limited` come back at 400 and 429.
- The **query bound is 64 UTF-16 code units** before folding, so an over-long query is truncated rather than refused; only a folded length outside 2–16 is `directory_bad_query`.
- A **fold-only rename keeps the original spelling** in search and on the profile, because the claim stores the spelling written at claim time. This surprises people who rename "hé" to "HE" and expect the directory to change.

`pnpm --filter @chkobba/server e2e --directory-only` covers all of these; add `--limits` for the rate-limit sweep. The scenario takes a second or two against a running local stack.

## Related

- [Local backend](local-backend.md): run Nakama, configure the app, test private tables on the LAN
- [Test friends across two browsers or LAN devices](test-friends.md)
- [ADR-0004: Unique display names, the players directory and presence visibility](../adr/0004-unique-display-names-players-directory-and-presence-visibility.md)
- [ADR-0005: Stats provenance](../adr/0005-stats-provenance.md)
- [Wire protocol](../reference/wire-protocol.md)
