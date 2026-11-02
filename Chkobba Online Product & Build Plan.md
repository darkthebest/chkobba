# Chkobba Online: Product & Build Plan

Oct 26, 2026 · @Hamza Chouaibi

## Overview

A public v1 with online play and monetization is roughly 3–5 months of evenings and weekends with Claude Code. Scope: online 4-player Chkobba mixing real users and bots, friends and groups, social logins, ads, and later cosmetic credits.

This is a real product, not a hobby game. The card game is maybe 20% of the work; the online platform around it (accounts, matchmaking, social, monetization) is the other 80%.

## Backend: don't build it from scratch

Use Nakama (Heroic Labs, open source, self-hostable) as the backend. Most of the listed features are standard multiplayer infrastructure it already ships:

- Social logins: Google, Apple, Facebook, plus guest accounts you can upgrade later
- Friends, groups/clans, and chat
- Matchmaking and authoritative real-time matches, with Chkobba rules written as server-side match logic in TypeScript
- Virtual wallet, purchase validation, and leaderboards for credits later

With Nakama, Claude Code writes the game logic, bots, and mobile client, not auth, friend graphs, or socket plumbing.

| Option | Strength | Cost |
| --- | --- | --- |
| Nakama | Auth, social, matchmaking, wallet built in | Less flexibility in data model |
| Supabase + Colyseus | More flexible | More glue code to own |

Client: Expo/React Native or Flutter. Nakama's TypeScript runtime pairs well with a TypeScript client, so types and possibly the rules engine can be shared.

## Game-specific parts to build

Bot backfill is the feature that makes a 4-player game survivable when few people are online.

- **2v2 rules engine:** four-player Chkobba is played in teams, so scoring is per team.
- **Server-authoritative matches:** the server holds the deck and every hand; each client only receives its own cards.
- **Bot backfill:** the matchmaker waits about 10–20 seconds, then fills empty seats with bots. The same bot takes over a disconnected player's seat and hands it back on reconnect.
- **Private tables:** create a table and invite friends or group members; bots fill the rest.

## Monetization and compliance

Keep credits strictly cosmetic and plan store requirements early; these are the items that cause rejections.

- **Ads:** AdMob with rewarded ads (watch for credits) and occasional interstitials between games, never mid-hand. EU users need a consent flow (Google UMP).
- **Credits and cosmetics:** must go through Apple/Google in-app purchases for digital goods; RevenueCat simplifies this.
- **No wagering:** card backs, table themes, avatars, frames are fine. Betting credits on matches, or anything convertible, triggers gambling classifications, age ratings, and store rejections.
- **Sign in with Apple:** mandatory on iOS when any other social login is offered.
- **Store requirements:** in-app account deletion, a privacy policy, and block/report tools once chat and groups exist.
- **Payouts:** register developer accounts and AdMob under the US LLC, not personally, to avoid payout friction to Tunisia.

## Roadmap

Roughly 3–5 months to a public v1, part-time with Claude Code, testing on real devices throughout.

| Phase | Scope | Rough time |
| --- | --- | --- |
| 1 | Rules engine, bots, tests; offline playable | 2–3 weeks |
| 2 | Nakama setup, social login, online 4-player matches with bot backfill and reconnection | 4–6 weeks |
| 3 | Friends, groups, private tables, invites, chat with block/report | 3–4 weeks |
| 4 | Ads and consent, store builds, soft launch (e.g. Tunisia first) | 2–3 weeks |
| 5 | Credits shop and cosmetics via IAP | 2–4 weeks |

Hosting starts around $20–60/month for a small VPS running Nakama and Postgres, and scales with players.

## Next step

Write a precise spec before building; Claude Code works far better against a spec than an evolving idea in chat.

- [ ] Exact rule variant (redeal condition, target score, ties)
- [ ] 2v2 match flow
- [ ] Bot backfill and reconnection rules
- [ ] Data model for friends, groups, and cosmetics
