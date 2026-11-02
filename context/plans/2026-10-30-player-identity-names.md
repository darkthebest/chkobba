# Plan: Player identity, step 1: display names and a durable guest

**Status:** CONFIRMED
**CONFIRMED:** true (user, via coordinator, 2026-10-30)
**Base branch:** `feature/2026-10-27-multiplayer-m1`

**Goal:**

- Players choose a display name the first time they go online, and other players see it at the table.
- They can rename in Settings.
- A guest keeps the same Nakama account after reinstalling the app on the same device.

## Decisions (user, 2026-10-30)

- **Guest-first accounts.** Keep Nakama device auth (`apps/mobile/src/online/nakama.ts`).
  - Google and Apple linking is step 2.
  - Facebook and FB Instant Games come later.
- **Durable device id:**
  - iOS: Keychain via `expo-secure-store`.
  - Android: `Application.getAndroidId()`.
  - Web: stays in `localStorage`.
  - The existing AsyncStorage id is migrated, so current testers keep their account.
- **Display name:**
  - A non-unique Nakama `display_name` is shown at the table instead of `presence.username`.
  - The match reads it with `nk.usersGetId` on join.
  - `username` stays a hidden, unique handle.
- **Name rules.** The server enforces them in a `registerBeforeUpdateAccount` hook; the client checks them too, for UX.
  - 3 to 16 characters.
  - Latin or Arabic letters, digits, and single spaces (trimmed, runs collapsed).
  - Rejected against a small profanity list (en, fr, Derja in Arabic script).
  - At most one rename per hour.
  - Username changes are blocked.
  - New guests default to `Player` plus 4 digits.
- **UX:**
  - Pick a name on the first online visit, before quick match.
  - Rename in Settings.
  - All text goes through i18n (`en` and `aeb` RTL), on both desktop and phone layouts.
- **Wire protocol:** changes to `@chkobba/protocol` stay backward compatible.

### Resolved during planning (user confirmed 2026-10-30)

1. **Shared format check.**
   - The pure `normalizeDisplayName` and `checkDisplayNameFormat` live in `packages/protocol/src/names.ts`, next to the constants and `NAME_ERROR_CODES`.
   - Update the documented protocol rule, in CLAUDE.md and `docs/reference/wire-protocol.md`, to "types, consts and pure dependency-free helpers".
   - The profanity list and the cooldown stay server-only, in `apps/server/src/account/`.
2. **ANDROID_ID: privacy and Play policy.**
   - Never send the raw value: hash it with an app salt.
   - Declare "Device or other IDs, purpose: account management" in Play Data safety.
   - Never link it to the advertising ID. This matters once AdMob lands.
   - Don't opt into the Families program.
   - Mention it in the privacy policy before the store release.
3. **Android migration conflict.**
   - If `linkDevice` returns 409 (the durable id already belongs to another account), keep the legacy AsyncStorage account, skip the migration and log it.
   - No account merging.
4. **Character set.**
   - Allow:
     - Latin-1 accented letters, for French names
     - Arabic letters plus `ڤ`, `ڨ` and `پ`
     - ASCII and Arabic-Indic digits
   - Reject tatweel (`U+0640`), harakat (`U+064B-U+065F`), and zero-width and bidi control characters.
   - Mixed Latin and Arabic in one name is allowed.
5. **The first pick does not start the cooldown.**
   - The first confirmation only sets `pickedAt`.
   - The one-hour cooldown runs from `changedAt`, which is set by later renames.
6. **Default `PlayerNNNN`.**
   - It is set in `registerAfterAuthenticateDevice` when the account is created.
   - Verify on Nakama 3.40 that `ctx.userId` and `session.created` are available there. If `ctx.userId` is missing, use the `uid` claim from the session token.
   - Keep a fallback chain for the name, at the table and in `getProfile`: display name, then username, then `Player`. Legacy accounts then need no backfill.
7. **Names for peers already connected.**
   - The name is refreshed only on join and on reclaim (reconnect), and peers get it through the snapshot fingerprint.
   - No new opcode and no `matchSignal`; rename is lobby-only.
   - A `matchSignal` remains the additive path if live updates are wanted later.
8. **Rate-limit storage.**
   - The rate limit lives in a server-owned storage object, `profile/name`, readable by its owner and not writable by clients.
   - The before hook reads it; the after hook writes it.
   - Account metadata was rejected because other users can read it through `getUsers`.
   - A race between two near-simultaneous renames is accepted.
9. **Hook, not RPC.** One before hook on `updateAccount` is the single enforcement point.
10. **Web guest durability.**
    - Loss on cleared site data, and throwaway accounts from private windows, are accepted for now.
    - Revisit with social login, or with a purge of guest accounts that never picked a name.
11. **Bot-like names.**
    - Humans may use names like `Hedi` or `Fatma`.
    - The seat UI marks bots by `isBot`, never by name.
    - Only staff and brand words are reserved.
12. **Android Auto Backup.**
    - It stays on, even though it can restore the legacy id and session to a new device.
    - Revisit if session sharing causes `matchKick` churn (`tableMatch.ts:239-240`).

## Architecture Decisions

- [ADR-0001: Durable guest identity and display names](../../docs/adr/0001-durable-guest-identity-and-display-names.md)

## Current state (key discoveries)

**Device id and session**

- The device id is `chk-<uuid>` in AsyncStorage under `chkobba.online.deviceId` (`apps/mobile/src/online/nakama.ts:91`, `:99-106`).
- `GuestAuth` takes the store through a `KeyValueStore` port (`nakama.ts:61-65`, `:172`), so a platform-specific store can be dropped in.
- The session is persisted separately under `chkobba.online.session` (`nakama.ts:92`, `:230-235`).
  - It can stay in AsyncStorage: losing it only means a new device auth with the same id.
- The username `Guest-XXXX` is applied only when the account is created.
  - On a name clash the client retries twice, then lets Nakama generate one (`nakama.ts:108-113`, `:213-228`).
  - Nobody sets a display name today.

**Names at the table**

- `joinerOf` builds `Joiner.name` from `presence.username` (`apps/server/src/match/tableMatch.ts:356-358`).
- `ConnectionPresence` also carries `username` (`tableMatch.ts:30-35`, `:352-354`).
- `join` stores the name in `HumanSeat` only when it claims a free seat (`apps/server/src/table/seats.ts:26-33`).
  - It goes through `cleanName`: trim, cut to `MAX_NAME_LENGTH` = 24 (`apps/server/src/table/types.ts:22`), fall back to `'Player'` (`seats.ts:60-63`).
  - A reclaim (reconnect) keeps the old seat name (`seats.ts:17-21`).
- `matchJoinAttempt` already receives `nk` and claims the seat (`tableMatch.ts:78-100`). `admit`, in `matchJoin`, calls `join` again (`tableMatch.ts:231-249`).
- The name reaches clients as `PlayerInfo.name` (`packages/protocol/src/index.ts:43-50`, filled in at `apps/server/src/table/projection.ts:38-39`).
  - The players array is part of the snapshot fingerprint (`tableMatch.ts:306-309`), so a changed seat name is pushed to every peer automatically.
- The client reads `info.name` as-is (`apps/mobile/src/online/NakamaGameClient.ts:344-345`). It is shown through `format.ts:22` and `useTableController.ts:51,177,240`.
- **Wire impact: none.** `PlayerInfo.name` stays a string and only its source changes, so older builds are unaffected.

**Server module**

- `InitModule` registers only `smoke_game`, `quick_match` and the match handler (`apps/server/src/main.ts:44-58`). No hooks exist yet.
- The test fakes cover `storageRead` and `storageWrite`, but not `usersGetId`, `accountGetId` or `accountUpdateId` (`apps/server/src/__tests__/fakes.ts:35-46`).
- Bot names are `Hedi`, `Sonia`, `Mongi` and `Fatma` (`apps/server/src/table/lifecycle.ts:30`).

**Mobile app**

- Quick match pushes `/finding` (`apps/mobile/src/app/index.tsx:94-101`).
  - `FindingScreen` builds its own backend (`apps/mobile/src/app/finding.tsx:12`).
  - `FindingPlayers` calls `backend.quickMatch()` immediately (`apps/mobile/src/components/lobby/FindingPlayers.tsx:34-52`).
  - `game.tsx:73` builds another backend: one `GuestAuth` per screen, sharing the session through storage.
- Settings is a `LobbySheet` with only Language and Table style (`index.tsx:212-233`). Its i18n keys are `settings.*` (`apps/mobile/src/i18n/locales/en.ts:63-67`).
- `expo-secure-store` and `expo-application` are not installed yet (`apps/mobile/package.json:5-40`).
- The e2e script authenticates without a username (`apps/server/scripts/e2e.ts:195`), so names are never exercised.

## Desired end state

**At the table**

- Every human seat shows the account's `display_name`, falling back to the username, then to `Player`.
- A player who reconnects after renaming shows the new name to everyone.

**First online visit and rename**

- The first Quick match shows a "Choose your name" step, prefilled with the current name. Continuing confirms it, then matchmaking runs.
- Later visits skip the step.
- Settings shows the current name and allows a rename.
- Server rejections show as localized messages, including the time left before the next rename.

**Server enforcement**

The server rejects, whatever the client sends:

- invalid, profane or too-frequent display names
- username changes
- `avatar_url` and `location` changes

**Durable guest**

- Reinstalling on the same iOS or Android device signs in to the same account.
- Existing testers keep their account after upgrading.

## What we're NOT doing

- Google, Apple or Facebook login and account linking (step 2).
- Unique names, `#tag` discriminators, or name search.
- Avatars and avatar upload.
- Showing the chosen name in offline bot games: `LocalGameClient` still says "You".
- Account deletion. It is needed for store compliance and tracked separately; when built, it must clear the Keychain item.
- Moderation tooling (reporting a name, admin rename). The Nakama console is enough for now.
- A UI for managing the profanity list. The list ships in the module.

---

## Data-structure proposals

### `@chkobba/protocol` additions (additive only)

```ts
// packages/protocol/src/names.ts (re-exported from index.ts)
// Also holds the pure, dependency-free normalizeDisplayName / checkDisplayNameFormat (Decision 1).

/** Display-name limits, shared by the client form and the server hook. */
export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 16;
/** Minimum time between two renames; the first pick doesn't count (Decision 5). */
export const RENAME_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Why the server rejected an account update. Sent as the error `message` of the
 * updateAccount call (gRPC status INVALID_ARGUMENT, or RESOURCE_EXHAUSTED for
 * `name_rate_limited`); the client maps it to an i18n string.
 */
export const NAME_ERROR_CODES = [
  'name_too_short',
  'name_too_long',
  'name_bad_chars',
  'name_not_allowed', // profanity or reserved word
  'name_rate_limited',
  'username_locked',
  'field_locked', // avatar_url / location changes
] as const;
export type NameErrorCode = (typeof NAME_ERROR_CODES)[number];

/** Server-owned storage record: collection `profile`, key `name`, owner = the user. */
export const PROFILE_COLLECTION = 'profile';
export const PROFILE_NAME_KEY = 'name';

/** Owner-readable (permissionRead 1), server-write-only (permissionWrite 0). */
export interface NameRecord {
  /** Epoch ms when the player first confirmed a name. Its presence means "name picked". */
  readonly pickedAt: number;
  /** Epoch ms of the last rename after the first pick; null until then. Drives the cooldown. */
  readonly changedAt: number | null;
}
```

**Unchanged:** `OpCode`, `Snapshot`, `PlayerInfo`, `ErrorCode`.

### Server (`apps/server`)

```ts
// match/tableMatch.ts: Connection gains the resolved name
export interface Connection {
  readonly presence: ConnectionPresence;
  /** display_name resolved in matchJoinAttempt (fallback: username); reused by admit. */
  readonly displayName: string;
  readonly joined: boolean;
  readonly reservedAt: number;
  readonly lastSeq: number;
  readonly fingerprint: string | null;
}

// account/rules.ts: server-only check result (format + profanity)
export type NameCheck =
  | { readonly ok: true; readonly name: string } // normalized
  | { readonly ok: false; readonly code: NameErrorCode };
```

### Mobile (`apps/mobile/src/online`)

```ts
/** Where the guest credential lives; one implementation per platform. */
export interface DeviceIdStore {
  /** The durable id, or null if none yet. */
  load(): Promise<string | null>;
  save(id: string): Promise<void>;
}

/** What the lobby needs to know about the signed-in player. */
export interface Profile {
  readonly displayName: string;
  /** False until the player confirmed a name once (NameRecord exists). */
  readonly namePicked: boolean;
  /** Epoch ms (server clock) when the next rename is allowed; null if allowed now. */
  readonly renameAvailableAt: number | null;
}

export type SetNameResult =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly reason: NameErrorCode | 'network' };

/** Port for profile UI, next to OnlineBackend (NakamaGameClient.ts:42). */
export interface ProfileBackend {
  getProfile(): Promise<Profile>;
  setDisplayName(name: string): Promise<SetNameResult>;
}
```

The local profile cache uses the key `chkobba.online.profile` and stores a JSON `Profile`. Settings reads it without going to the network.

---

## Phase 0: Contracts and decision record

**Goal:** fix the shared contract and record the identity decisions before anything depends on them.

**Tasks**

- Add `names.ts` to `@chkobba/protocol`: the constants, error codes and `NameRecord` above, plus the pure `normalizeDisplayName` and `checkDisplayNameFormat`. Re-export them from `index.ts`.
  - The format check covers length and character set only (Decision 4).
- Unit tests for the protocol helpers, with test vectors that the server and client test suites reuse.
- Update the protocol rule in CLAUDE.md (Key Patterns, Project Structure) and in `docs/reference/wire-protocol.md` to "types, consts and pure dependency-free helpers".
- Write the ADR "Durable guest identity and display names" with the `architecture-decision-records` skill. It covers:
  - Keychain, hashed ANDROID_ID, and `linkDevice` migration
  - the display name as a non-unique, server-validated field
  - the `profile/name` storage record for the "picked" flag and the cooldown
  - where the validators live

**Success criteria**

- Protocol builds and typechecks in both apps. No existing type changes shape.
- The helpers bundle into the ES5 server module.
- The ADR is linked from this plan.

**Risks**

- **Regex in goja.** Goja has no `\p{…}` and no reliable `u` flag, so the helpers must use plain `\uXXXX` ranges.

---

## Phase 1: Server name rules (pure, Vitest)

**Goal:** one server-only pure module decides whether a display name is acceptable, adding the profanity and cooldown rules on top of the protocol format check.

**Tasks**

- **Profanity and reserved-word check** on a folded form:
  - Fold: lowercase, strip spaces, map leetspeak (`0→o 1→i 3→e 4→a 5→s @→a`), unify Arabic variants (`أإآ→ا`, `ة→ه`, `ى→ي`).
  - Match short tokens as whole words; match long, unambiguous roots as substrings.
  - Short en, fr and Derja (Arabic script) lists, reviewed by the user.
  - Reserve `admin`, `moderator`, `support`, `official` and `chkobba` (Decision 11).
- **Cooldown decision.** Input: `NameRecord | null` and `now`. Output: allowed, or `name_rate_limited` with `retryAt`. The first pick is free (Decision 5).
- **Default name generator:** `Player` plus 4 random digits.
- **Vitest tables** covering:
  - the shared length and character-set vectors
  - bidi, zero-width, tatweel and harakat rejection
  - leetspeak and Arabic-variant profanity
  - Scunthorpe false positives: real Tunisian, French and English names that must pass
  - cooldown boundaries

**Success criteria**

- `pnpm --filter @chkobba/server test` passes.
- The bundled module still loads in goja.

**Risks**

- The profanity list is never complete. It slows abuse down; it is not moderation.

---

## Phase 2: Server hooks and table names

**Goal:** the server owns display names (default, validation, cooldown), and the table shows them, refreshed on reconnect.

**Tasks**

- **`registerBeforeUpdateAccount`:**
  - Reject `username` with `username_locked`.
  - Reject `avatarUrl` and `location` with `field_locked`. Let `langTag` and `timezone` through.
  - When `displayName` is present:
    - Normalize and validate it (phases 0 and 1).
    - Read the `NameRecord` and apply the cooldown.
    - Return the request with the normalized name.
  - Throw `{ message: <NameErrorCode>, code }`, with `code` set to INVALID_ARGUMENT, or RESOURCE_EXHAUSTED for `name_rate_limited`.
- **`registerAfterUpdateAccount`:**
  - Write the `NameRecord`: `pickedAt` the first time, otherwise `changedAt = now`.
  - Set `permissionRead 1` and `permissionWrite 0`.
- **`registerAfterAuthenticateDevice`:** when the account is created, set the default `PlayerNNNN` with `nk.accountUpdateId`, after verifying the user-id source (Decision 6).
- **Match name lookup:**
  - `matchJoinAttempt` resolves `display_name` with `nk.usersGetId`. Wrap it in try/catch and fall back to the username.
  - Store the result on `Connection.displayName` and pass it to `joinerOf`.
  - `admit` reuses it, so there is no second DB call.
- **Pure core:** a reclaim in `table/seats.ts` `join` also updates `seat.name` from the joiner (Decision 7). Add a test.
- Keep `cleanName` and `MAX_NAME_LENGTH = 24` as a defensive cap.
- Register the three hooks in `main.ts` as top-level named functions.
- Extend `fakes.ts` with `usersGetId`, `accountGetId` and `accountUpdateId`. Add adapter tests.
- Rebuild, restart Nakama, and confirm the module loads with the hooks.

**Success criteria**

- Vitest covers:
  - every `NameErrorCode` path
  - the cooldown boundary
  - the default name on create only
  - the display-name fallback
  - a renamed reconnect showing in another seat's snapshot
- **Manual `curl`** against local Nakama:
  - `PUT /v2/account` with a bad name returns 400 with the code in the message.
  - A second rename within the hour returns 429.

**Risks**

- Hook error shape on Nakama 3.40 (the gRPC code to HTTP mapping, and the message body) must be verified.
- One DB read per join attempt. That is negligible at the current scale.

---

## Phase 3: Durable guest id (mobile)

**Goal:** the guest credential survives a reinstall on iOS and Android, and existing testers keep their account.

**Tasks**

- **Dependencies.** Add `expo-secure-store` and `expo-application` with `expo install` (SDK 58).
  - Check `pnpm-lock.yaml` stays on Babel 7.
- **`DeviceIdStore` per platform:**
  - iOS: a SecureStore item, readable `AFTER_FIRST_UNLOCK`, not `THIS_DEVICE_ONLY`.
  - Android: `chk-a-` + SHA-256(`getAndroidId()` + app salt), hashed with `expo-crypto`. Fall back to a random id if the Android ID is null or empty (Decision 2).
  - Web: unchanged (`localStorage`).
- **One-time migration** in `GuestAuth`, guarded by a `chkobba.online.deviceIdMigrated` flag:
  - iOS:
    - Copy a valid legacy AsyncStorage id into an empty Keychain.
    - If both exist and differ, the Keychain wins.
  - Android:
    - Sign in with the legacy id.
    - Call `client.linkDevice` with the durable id.
    - Switch to the durable id.
    - On a 409, keep the legacy account and log it (Decision 3).
  - Leave the legacy id in place for one release as a rollback path.
- **Unit tests** with mocked native modules:
  - fresh install
  - reinstall
  - legacy upgrade
  - conflict
  - null Android ID
- **Docs.** Update `docs/reference/wire-protocol.md` (client constants) and `docs/explanation/multiplayer-architecture.md:51`.

**Success criteria**

- Mobile Jest and typecheck pass.
- **Manual, in a dev build on a device:**
  - Uninstall and reinstall: the same user id on iOS and Android.
  - A legacy build upgraded in place keeps its user id.
- The Play Data safety and privacy-policy notes are captured for the release checklist (Decision 2).

**Risks**

- **The Android ID changes with the signing key and with a factory reset.** A tester moving from a dev build to the Play build gets a new id; only `linkDevice` from a surviving legacy id saves them.
- **The Keychain item survives uninstall.** The future account deletion must remove it.
- **Expo Go can't prove reinstall survival.** A real build is needed.

---

## Phase 4: Profile service (mobile)

**Goal:** a small, tested service gives the UI the player's name and rename results. No UI yet.

**Tasks**

- **`ProfileBackend` on `GuestAuth`:**
  - `getProfile`: `getAccount` and `readStorageObjects` (the `NameRecord`) in parallel. It derives `namePicked` and `renameAvailableAt`, and uses the fallback chain from Decision 6.
  - `setDisplayName`:
    - Run the protocol format check first.
    - Call `updateAccount({ display_name })`.
    - Map the error `message` to a `NameErrorCode`. Anything else becomes `network`.
    - Re-read the profile on success.
- **Local `Profile` cache** (`chkobba.online.profile`), updated on every successful read or write.
- **One shared Nakama client and `GuestAuth`** (`online/services.ts`), used by `finding.tsx`, `game.tsx` and Settings.
- **Jest tests** with a fake `Client`:
  - error mapping
  - the cache
  - a legacy account with an empty `display_name` and no record

**Success criteria**

- Jest and typecheck pass.
- Nothing changes in the UI.

**Risks**

- **Error format.** How nakama-js surfaces hook errors (a `Response` with a JSON body) must be pinned by the phase 6 e2e check.

---

## Phase 5: Name UI (mobile, i18n, both layouts)

**Goal:** a first-visit name pick before quick match, and a rename in Settings. Fully localized, on phone and desktop.

**Tasks**

- **`NameForm`:**
  - Contents: a text field, a live format hint, an inline error, a Save or Continue button, and a cooldown line ("You can rename again in N min").
  - Built with skin tokens and `Panel`, `marginStart`/`marginEnd`, and accessibility labels.
  - The input enforces the max length and uses an auto writing direction, so Arabic names type right to left.
- **Gate in `/finding`:**
  - Load the profile first.
  - If no name has been picked, show "Choose your name", prefilled.
  - Continue calls `setDisplayName`, even when the name is unchanged, so the record gets written. The search starts after that.
  - Cancel returns to the lobby.
  - A failed load reuses the `SearchFailed` retry pattern.
- **Settings:**
  - Add a "Your name" group to the Settings `LobbySheet` (`index.tsx:212-233`).
  - It shows the cached name and saves through `ProfileBackend`.
  - Opening Settings never touches the network.
  - With no cache yet, saving signs in.
- **i18n:** `name.*` keys (title, hint, placeholder, continue, save, saved, cooldown with `{{minutes}}`, one per `NameErrorCode`, network) and `settings.name`, in both `en.ts` and `aeb.ts`.
- **Layouts:** check the phone layout (below 900 px) and desktop (centred, `maxWidth: 420`).
- **RNTL tests:**
  - the gate shows on the first visit only
  - client and server errors render, localized
  - the cooldown line
  - saving from Settings
  - rendering with the RTL catalog

**Success criteria**

- Mobile Jest, typecheck and lint pass.
- **Manual (web at 1280 px and 390 px, `en` and `aeb`):**
  - The first Quick match asks for a name; the second doesn't.
  - A rename shows to a second browser window at the next table.
  - A bad name shows the correct localized message.

**Risks**

- Some Android keyboards insert tatweel or diacritics. The error text must say clearly what isn't allowed.

---

## Phase 6: End-to-end check and finalization

**Goal:** prove names flow end to end on real Nakama, then merge the docs.

**Tasks**

- **Extend `apps/server/scripts/e2e.ts`:**
  - Each client sets a display name before quick match.
  - Assert that peers see each other's names in `players[i].name`.
  - Assert the rejection codes for a bad name and for a second rename within the hour.
  - Assert that a reconnect after a rename shows the new name.
- **Run the phase 3 device checks:** reinstall, and the legacy upgrade.
- **Docs (Diataxis):**
  - Wire protocol reference:
    - the name rules and constants
    - `NAME_ERROR_CODES`
    - the `profile/name` record
    - the hooks
    - the device id per platform
    - `PlayerInfo.name` is now the display name
  - Architecture explanation: an identity section linking the ADR.
  - How-to: changing the profanity list.
- **Staging docs:** merge the `context/docs/` phase notes into `docs/`, then delete the staging file.
- **CLAUDE.md:** update the status, plus these Key Patterns:
  - names come from `display_name`
  - the username is hidden
  - the hook enforces the name rules
  - the protocol rule wording

**Success criteria**

- `pnpm build`, `pnpm test`, `pnpm lint` and `pnpm --filter @chkobba/server e2e` pass.
- The docs match the shipped behaviour.

---

## Testing strategy

**Unit tests**

- Protocol: normalize and format-check vectors, shared with the server and client tests.
- Server (Vitest):
  - profanity and cooldown rules
  - the hooks, against the fakes
  - display-name lookup and fallback
  - the reclaim name refresh in the pure core
- Mobile (Jest and RNTL):
  - `DeviceIdStore` per platform, and the migration cases
  - `ProfileBackend` mapping and cache
  - `NameForm`, the `/finding` gate and Settings, in `en` and `aeb`

**End to end**

The extended `e2e.ts` against Docker Nakama: peers see each other's names, bad names and early renames are rejected, and a rename followed by a reconnect shows the new name.

**Manual**

- Reinstall on a real iOS and a real Android device.
- A legacy tester upgrade.
- Web at desktop and phone widths, in both languages.

## References

- `apps/mobile/src/online/nakama.ts:91-113`, `:161-247`: device id, guest username, GuestAuth
- `apps/server/src/match/tableMatch.ts:78-100`, `:231-249`, `:352-358`: join attempt, admit, presence-to-name mapping
- `apps/server/src/table/seats.ts:16-38`, `:60-63`: seat claim, reclaim, `cleanName`
- `packages/protocol/src/index.ts:43-50`: `PlayerInfo`
- `apps/mobile/src/app/index.tsx:94-101`, `:212-233`: Quick match tile, Settings sheet
- `apps/mobile/src/components/lobby/FindingPlayers.tsx:30-69`: search flow
- `apps/server/src/__tests__/fakes.ts:35-46`: nk fakes to extend
- `apps/server/scripts/e2e.ts:195`: e2e device auth
- `docs/reference/wire-protocol.md`, `docs/explanation/multiplayer-architecture.md`
- Style reference: `context/plans/2026-10-27-multiplayer-m1.md`
