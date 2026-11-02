# Chkobba documentation

Organised with [Diataxis](https://diataxis.fr/). Product scope lives in `Chkobba Online Product & Build Plan.md`; plans and research live in `context/`.

| Type | Doc | Use it to |
|---|---|---|
| Explanation | [Multiplayer architecture](explanation/multiplayer-architecture.md) | Understand how online tables, bots, timers and reconnect work, and why |
| How-to | [Local backend](how-to/local-backend.md) | Run Nakama, build the image, run the e2e, configure the app, test multiplayer and private tables by hand (including across the LAN) |
| How-to | [Test friends across two browsers or LAN devices](how-to/test-friends.md) | Set up two guest accounts and test adding friends by code, link and player sheet, availability, blocking and unblocking |
| How-to | [Test the players directory across two browsers or devices](how-to/test-players-directory.md) | Set up two guest accounts and test name search and folding, the unlisted card, hidden availability, blocking, and resetting local claims |
| How-to | [Change the profanity list](how-to/change-the-profanity-list.md) | Add or remove a blocked or reserved display-name word, test it and redeploy the module |
| How-to | [Store release checklist](how-to/store-release-checklist.md) | Clear identity and privacy items (Play Data safety, account deletion, testers) before a store release |
| How-to | [Verify guest identity on devices](how-to/verify-guest-identity-on-devices.md) | Check that the user id survives a legacy upgrade and a reinstall on iOS and Android |
| How-to | [Add a language](how-to/add-a-language.md) | Add a UI language (including right-to-left), write translatable strings |
| Reference | [Wire protocol](reference/wire-protocol.md) | Look up opcodes, payloads, snapshot fields, error codes, RPC contract, timing constants |
| Explanation | [Architecture decision records](adr/README.md) | See why significant choices were made (guest identity and display names, ...) |
