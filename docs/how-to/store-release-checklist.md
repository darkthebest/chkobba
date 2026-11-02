# Store release checklist

Identity-related items to clear before a Play Store or App Store release. Background: [ADR 0001](../adr/0001-durable-guest-identity-and-display-names.md).

## Google Play

- [ ] Data safety form: declare "Device or other IDs", purpose "Account management". Collected, not shared.
- [ ] Never link the hashed `ANDROID_ID` to the advertising ID (matters once AdMob lands).
- [ ] Do not opt into the Google Play Families program.
- [ ] Privacy policy mentions the device identifier, before the store release.

## Account deletion

- [ ] In-app account deletion clears the iOS Keychain item `chkobba.online.deviceId`. It survives uninstall, so without this a deleted account's id would be reused.
- [ ] It also clears `chkobba.online.deviceId.android-fallback`, `chkobba.online.deviceIdMigrated`, `chkobba.online.session` and `chkobba.online.profile`.

## Testers

- [ ] Warn testers: `ANDROID_ID` changes with the signing key and on factory reset. Moving from a dev build to the Play build gives a new account unless the legacy AsyncStorage id survives to be linked.
- [ ] Run [Verify guest identity on devices](verify-guest-identity-on-devices.md) on the release candidate.
