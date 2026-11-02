# Facebook Instant Games: how Chkobba would run there

Notes from 2026-10-30. Exploratory only, with no decision or plan yet. Items marked **(unverified)** came from search snippets or conflicting Meta pages. Check them against the live docs or a real upload.

## How a Facebook Instant Game works

- **The package:** an HTML5 game (HTML, JS and assets) zipped and uploaded in the Meta developer dashboard.
  - Facebook hosts it on its CDN and runs it in an iframe in the Facebook app, facebook.com/gaming and Messenger. There are no app stores.
  - The zip has `index.html` at the root and relative paths everywhere. `fbapp-config.json` is optional.
  - The hard size cap is 200 MB. Keep the first download under 3–5 MB.
- **SDK start-up:** load Meta's `FBInstant` SDK from Meta's CDN, then call:
  1. `FBInstant.initializeAsync()`
  2. `FBInstant.setLoadingProgress(n)`, which drives Facebook's loading screen
  3. `FBInstant.startGameAsync()`, after which the game shows
- **Network access:** the game is sandboxed to Facebook domains by default.
  - Reaching your own backend needs **Zero Permissions** (SDK v8.0), granted through App Review with a gradual rollout.
  - The backend hostname goes in the dashboard's domain allowlist as a bare hostname. Whether the allowlist covers `wss://` is **(unverified)**.
  - Games created on or after 2025-08-01 must use Zero Permissions.
  - Zero Permissions removes the player name and photo APIs. They are shown with `FBInstant.overlayViews` instead.
- **Status:** Meta calls Instant Games its primary game platform. Facebook Web Games were sunset on 2026-09-30, and Facebook Login for Gaming and Gaming Profiles are being retired.

## How Chkobba would fit

- **Client:**
  - The Expo app already exports for the web as one page (`app.json` has `web.output: "single"`).
  - Steps: export, rewrite asset paths to relative, add the `FBInstant` start-up calls, zip, upload.
  - Expo's `experiments.baseUrl` is a fixed path prefix, not a relative-path mode, so a rewrite step after the build is needed.
  - Facebook serves no URL rewrites, so the game should stay on one root route.
- **Login:**
  - There's no separate login screen. The client calls `FBInstant.player.getSignedPlayerInfoAsync(payload)` and passes the result to Nakama's built-in `authenticateFacebookInstantGame` (REST: `POST /v2/account/authenticate/facebookinstantgame`).
  - Nakama verifies the signature with the Facebook app secret in its config. The exact config key is **(unverified)**.
  - The payload (up to 1000 chars) is signed too, so a server nonce can block replays.
  - This replaces today's `GuestAuth` (`authenticateDevice` plus AsyncStorage) inside Facebook.
- **Multiplayer:**
  - Nakama, `quick_match` and `chkobba_table` are unchanged.
  - Nakama must be reachable over HTTPS and WSS through a TLS proxy, since Nakama has no TLS settings of its own. The game runs in a cross-origin iframe, so CORS needs testing.
- **Friends:**
  - `FBInstant.context.chooseAsync()` picks friends or a group thread.
  - Everyone in that context shares `context.getID()`, which can key a private table.
  - No private-table RPC exists yet. `quick_match` only lists `private:F` tables.
- **Ads:** `getInterstitialAdAsync` / `getRewardedVideoAsync(placementId)`, then `loadAsync()` and `showAsync()`. Meta recommends natural breaks only, which matches the "no ads mid-hand" rule. This replaces AdMob on this platform.
- **Payments:**
  - `FBInstant.payments` handles purchases. The server verifies the signed purchase (HMAC-SHA256 with the app secret) before granting credits.
  - `purchaseToken` is the unique id, because `developerPayload` stopped being populated on 2026-10-30.
  - Revenue share is 70/30. It needs a Business entity, tax forms, and a review for each product.
  - Meta Pay availability in Tunisia is **(unverified)**.
- **Storage:** Meta recommends `FBInstant.player.setDataAsync/getDataAsync` (1 MB per player). Community reports say `localStorage`, which AsyncStorage uses on the web, is unreliable in some iOS webviews.
- **Policy:** cosmetic-only credits with no monetary value or cash-out are fine. Meta treats redeemable virtual currency as gambling. A privacy policy is needed for review.

## Catches

- **Separate accounts:**
  - `FBInstant.player.getID()` is game-scoped. It differs from the Facebook user ID and from the ASID (`getASIDAsync()`).
  - An Instant Games account and a mobile-app account are separate Nakama accounts unless explicitly linked.
- **Meta review:** network access (Zero Permissions) and payments both need Meta review.
- **Untested in the Facebook app:** WebSockets, CORS, viewport and safe area, audio autoplay and session storage inside Facebook's in-app webview. No public Expo-based Instant Game example was found.
- **Conflicting docs:** Meta's pages disagree on several dates and API details, such as the migration deadline (2026-08-31, 2026-09-30 or 2026-12-30), context type names, and the SDK CDN URL (`fbinstant.8.0.js` vs `fbinstant.latest.js`).

## Sources

- [Web and Instant Games changes (Meta, 2025)](https://developers.facebook.com/blog/post/2025/07/31/web-and-instant-games-changes/)
- [What are Instant Games](https://developers.facebook.com/documentation/games/overview/what-are-instant-games)
- [Facebook Login for Gaming to Instant Games (Zero Permissions)](https://developers.facebook.com/documentation/games/build/zero-permissions/onboarding-and-migration/facebook-login-to-instant-games)
- [Nakama TypeScript runtime function reference](https://heroiclabs.com/docs/zh/nakama/server-framework/typescript-runtime/function-reference/)
