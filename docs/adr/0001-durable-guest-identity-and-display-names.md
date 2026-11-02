# ADR-0001: Durable guest identity and display names

**Status:** Accepted
**Date:** 2026-10-30
**Plan:** `context/plans/2026-10-30-player-identity-names.md`

> **Amended 2026-10-30 (note corrected 2026-10-31):** [ADR-0003](0003-friend-codes-social-socket-and-presence.md) supersedes two points below: the Decision that "`username` stays a hidden unique handle" (the username becomes the friend code) and the old fallback in Context where tables showed `presence.username`, a generated `Guest-XXXX` handle. New accounts still get `PlayerNNNN`, as the Decision says. The rest of this ADR stands.

> **Amended 2026-10-31:** [ADR-0004](0004-unique-display-names-players-directory-and-presence-visibility.md) supersedes the "non-unique" part of the Display name Decision below. `display_name` is now the **unique public handle**, claimed in a server-owned claim record and offered in the players directory. It is still server-validated by the same `beforeUpdateAccount` hook, and the `profile/name` record keeps its role (rename cooldown, first-pick detection) — the claim is a second record, not a replacement. The Alternative "Unique names or `#tag` discriminators" ("out of scope") is superseded with it. The rest of this ADR stands.

## Context

- Players are anonymous Nakama device-auth guests. The device id is a random `chk-<uuid>` in AsyncStorage, so a reinstall creates a new account.
- Nobody sets a display name. Tables show `presence.username`, a generated `Guest-XXXX` handle.
- Names are user-visible and abusable, so the server must enforce the rules; a client check is not enough.
- Social login (Google, Apple, later Facebook) is step 2. Step 1 needs a stable guest account and a name, without breaking shipped builds or current testers.

## Decision

### Guest-first accounts

Keep Nakama device auth. Social login links to the guest account in step 2.

### Durable device id

| Platform | Store | Notes |
|---|---|---|
| iOS | Keychain via `expo-secure-store` | `AFTER_FIRST_UNLOCK`, not `THIS_DEVICE_ONLY` |
| Android | `chk-a-` + SHA-256(`ANDROID_ID` + app salt) | Raw value is never sent. Never linked to the advertising ID. Random id if `ANDROID_ID` is null or empty |
| Web | `localStorage` | Loss on cleared site data is accepted |

The session stays in AsyncStorage: losing it only costs a new device auth with the same id.

### One-time migration from the legacy AsyncStorage id

Guarded by the `chkobba.online.deviceIdMigrated` flag.

- **iOS:** copy a valid legacy id into an empty Keychain. If both exist and differ, the Keychain wins.
- **Android:** sign in with the legacy id, call `linkDevice` with the durable id, then switch to it. On 409 (the durable id belongs to another account), keep the legacy account, skip the migration and log it. No merging.
- The legacy id stays in place for one release as a rollback path.

### Display name

- `display_name` is a non-unique, server-validated field shown at the table.
- The match reads it with `nk.usersGetId` on join and on reclaim. Fallback chain: display name, then username, then `Player`. Legacy accounts need no backfill.
- `username` stays a hidden unique handle and is locked against changes.
- New accounts get `PlayerNNNN` in `registerAfterAuthenticateDevice`, on create only.
- Humans may use bot-like names (`Hedi`, `Fatma`); the UI marks bots by `isBot`. Only staff and brand words are reserved.

### Name record

A server-owned storage object, `profile/name`, holds `NameRecord { pickedAt, changedAt }`.

- `permissionRead` 1 (owner), `permissionWrite` 0 (server only).
- `pickedAt` is the "name picked" flag that gates the first-visit prompt.
- The one-hour rename cooldown runs from `changedAt`. The first pick only sets `pickedAt`, so it is free.
- The before hook reads the record; the after hook writes it. A race between two near-simultaneous renames is accepted.
- Account metadata was rejected for this: other users can read it through `getUsers`.

### Validator placement

| Piece | Where | Why |
|---|---|---|
| Format check (length 3-16, character set) and normalize | `packages/protocol/src/names.ts` (pure, dependency-free) | Shared. Client uses it for UX only |
| Profanity, reserved words, cooldown | `apps/server/src/account/` | Server-only, so the list is never shipped to clients |

- Character set: Latin-1 accented letters, Arabic letters plus `ڤ ڨ پ`, ASCII and Arabic-Indic digits, single spaces. Tatweel, harakat, zero-width and bidi controls are rejected.
- Helpers use plain `\uXXXX` ranges (goja has no `\p{...}`).
- A single `registerBeforeUpdateAccount` hook is the one enforcement point, a hook and not an RPC, so no client path bypasses it. It rejects `username`, `avatarUrl` and `location` changes and validates `displayName`. Errors carry a `NameErrorCode` as the message.

### Peers see renames late

Peers see a rename only on the next join or reclaim, through the snapshot fingerprint. No new opcode: rename is lobby-only, and `matchSignal` is the additive path if live updates are wanted.

### Implementation notes (2026-10-30)

Details settled while building; no deviation from the decision above. Status moves to "Implemented" when the branch merges.

- **Android migration:** the legacy sign-in uses `create=false`. A 404 (legacy account gone) uses the durable id and drops the cached session. Any failure other than 409 or 404 means "retry": the flag is not set and the legacy id is used for this launch.
- **Ordering:** the migration runs before session restore. Account switches (iOS Keychain wins over a different legacy id; Android 404) drop the cached session.
- **Android ids:** salt `:chkobba-online-guest-v1`. Fallback key `chkobba.online.deviceId.android-fallback` holds a random id (no `ANDROID_ID`) or the legacy id pinned after a 409; `load` prefers it over the derived id.
- **Names:** Eastern Arabic-Indic digits `U+06F0-U+06F9` are excluded (lookalikes). `afterUpdateAccount` writes the `NameRecord`, so a rejected name never starts a cooldown.
- **Web:** a blocked `localStorage` degrades to a non-persistent id instead of a sign-in error.

## Consequences

**Positive**

- Reinstalling on the same iOS or Android device keeps the account; existing testers keep theirs.
- One enforcement point for names; the wire protocol is unchanged (`PlayerInfo.name` stays a string).
- The format rules cannot drift between client and server.

**Negative and mitigations**

| Consequence | Mitigation |
|---|---|
| The Keychain item survives uninstall | Future account deletion must clear it (tracked separately) |
| `ANDROID_ID` changes with the signing key and on factory reset; a dev build to Play build tester gets a new id | `linkDevice` from a surviving legacy id covers migration; otherwise accepted |
| Play Data safety: the id counts as collected data | Declare "Device or other IDs, purpose: account management"; privacy policy before release; don't opt into Families; never link to the ad id (matters once AdMob lands) |
| Android Auto Backup can restore the legacy id and session to a new device | Left on; revisit if shared sessions cause `matchKick` churn |
| Web guests are lost with site data, and private windows make throwaway accounts | Accepted; revisit with social login or a purge of guests that never picked a name |
| Profanity list is never complete | It slows abuse; it is not moderation. Console rename for now |
| Rename race, and peers see old names until rejoin | Accepted (see above) |
| `@chkobba/protocol` is no longer types-only | Rule becomes "types, consts and pure dependency-free helpers" |

## Alternatives considered

| Alternative | Why not |
|---|---|
| Raw `ANDROID_ID` as the device id | Leaks a device identifier to the server; hashing with an app salt avoids it |
| Link `ANDROID_ID` to the advertising ID | Policy risk with Play and AdMob |
| Keychain `THIS_DEVICE_ONLY` | Does not survive restore to a new device |
| Account merge on `linkDevice` 409 | Complex, risks data loss; keeping the legacy account is safe |
| Unique names or `#tag` discriminators | Out of scope; the hidden `username` stays the unique handle |
| Rename cooldown in account metadata | Other users can read it via `getUsers` |
| Name rules in an RPC | Clients could bypass it by calling `updateAccount`; the hook covers every path |
| Validate only on the client | Not enforceable |
| New opcode for live rename | Wire change for a lobby-only action; `matchSignal` is the later path |
| Social login first | Larger scope; guest-first ships sooner and linking is additive |

## Related

- [Multiplayer architecture](../explanation/multiplayer-architecture.md)
- [Wire protocol](../reference/wire-protocol.md)
