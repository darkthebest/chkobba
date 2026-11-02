# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **rules:** Draw for dealer at game start: everyone draws a card, the lowest card deals first, and tied players draw again.
- **rules:** The cut, played every round (`cutCardChoice`, on by default). The player after the dealer sees the cut card and either keeps it (dealt 2 more) or throws it face up on the table (the table gets 3 more). A kept card is never revealed in public events.
- **rules:** Bots decide the cut themselves: they keep sevens, sixes and diamonds and throw the rest.
- **mobile:** Desktop table layout for any window at least 900 px wide: a large table with the hand underneath and a side panel for score, turn, capture options and log. Cards scale with the window.
- **mobile:** Hover previews of a card's captures, and keyboard play on desktop: ← → choose, 1–9 capture, Enter play, Esc cancel, K / T keep or throw the cut.
- **mobile:** "Who deals?" intro showing the dealer draw, and a Keep / Throw prompt when it's your cut.
- **mobile:** Double-tap a hand card to play it immediately when it has only one possible move.
- **mobile:** Café lobby as the home screen:
  - Play vs bots opens a setup sheet (table, points, bot level).
  - Quick match, Private table, Friends and Ranking are shown as coming soon.
  - An open-tables panel, a guest profile, and a settings sheet holding the table style.
- **server:** `@chkobba/server` Nakama runtime module, bundled to a single ES5 file for goja, with a `smoke_game` RPC that plays a full bot game on the server.
- **infra:** Local backend via `docker compose` (Nakama 3.40 + Postgres 16) that mounts the built server module.
- **protocol:** Emote ids, display-name format rules and the private-table contract (room codes, `SIT`/`START` opcodes, `Snapshot.room`, standing members as `seat: -1`), all additive.
- **server:** Emotes relayed at the table with a per-seat cooldown.
- **server:** Display names: the `before update account` hook enforces the name format, a profanity list and a one-hour rename cooldown; table names come from the account's display name.
- **server:** Private tables: `create_private_table` and `join_by_code` RPCs with 6-character room codes, a waiting room where players pick seats, host Start with bots filling empty seats, return to the room after each game, and taking over a bot's seat mid-game. Codes live only in server-owned storage, failed lookups and creates are rate-limited, and a newcomer must present the code to join.
- **mobile:** Durable guest identity per device (Keychain on iOS, a salted id on Android, local storage on web) and a first-visit name form.
- **mobile:** Emotes at the table: a fixed phrase set with bubbles, a cooldown and per-seat mute; offline bots emote too.
- **mobile:** Sound effects and café ambience with effects and ambience levels and mute-all, adjustable without leaving the table.
- **mobile:** Three new table styles (Sahara Night, Sidi Bou Said, Neon Souk) and the Wikimedia "Chkobba" card deck for Café Tunisien.
- **mobile:** Choosing captures by tapping table cards on Normal, Hard and online; capture hints stay on Easy.
- **docs:** ADR-0001 (guest identity and display names), ADR-0002 (private tables), and how-tos for the profanity list, device identity checks and store release.
- **protocol:** Friend codes (`/f/<code>` links), friend request and acceptance notification codes, `userId` on seats and room members, the presence status shape, and the `invite_to_table` contract, all additive.
- **server:** Friend codes: the username is a server-generated 8-character code, screened against the profanity list and existing usernames, assigned when the account is created.
- **server:** Friend rules behind the AddFriends hook: a cap of 10 targets per request, 50 outgoing pending requests and 200 friends, with localized error codes.
- **server:** Recent players: each finished or left game records the humans who played it, once per player per game, capped at 20 and never failing the match.
- **server:** `invite_to_table` sends a table invite to a mutual friend: the caller must be a member of a live private room, sends are rate-limited per sender and deduplicated per friend and room, and the invitee gets one persistent notification.
- **mobile:** Friends screen: your code with share and copy, add by code or link, incoming and outgoing requests, friends with live availability, recent players, and blocking.
- **mobile:** A second socket for friends and presence, separate from the per-game socket, so invites and availability keep working outside a table. Presence carries only lobby, room or playing, never a room code.
- **mobile:** Table invites: a lobby banner with Join and Dismiss, and an in-game badge for invites that arrive mid-hand.
- **mobile:** Player sheet at the table to add, block or unmute a human seat.
- **docs:** ADR-0003 (friend codes, the social socket and presence), the friends sections of the wire protocol and architecture pages, and a how-to for testing friends across two browsers or LAN devices.
- **infra:** GitHub Actions CI on pull requests to `main`: frozen-lockfile install, Expo type generation, lint, typecheck, tests, the server and app builds, and a web bundle.

### Changed

- **server:** The `username` is now the visible friend code rather than a hidden handle. Accounts created before friend codes keep their old username and show no code.

### Fixed

- **mobile:** On desktop, emotes sit in the bottom corner beside your hand (bottom right in Derja), and your own bubble no longer covers the score. Your bubble's tail now points the right way in right-to-left languages.
