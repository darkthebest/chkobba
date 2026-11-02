# Evaluation: Hiro (Heroic Labs Nakama toolkit)

Date: 2026-11-01. Question: does Chkobba Online have a use for [Hiro](https://heroiclabs.com/hiro/)?

**Verdict: no. Don't adopt it.** Build the Phase 5 cosmetics economy directly on Nakama wallet + storage, and hand-roll retention systems (streaks, missions, achievements) as server-side TS modules if they become the bottleneck.

## What Hiro is

A paid metagame toolkit on top of Nakama: economy (currencies, virtual store, loot/gacha tables, inventory, rewarded video, reward mailbox), progression (achievements, stats, unlockables, tutorials), LiveOps (missions, streaks, live events, personalizers/experiments, event + geo leaderboards), and social (teams/guilds, auctions, donations, incentivized invites, energy).

Licensing: annual per-developer licence key (`HIRO_LICENSE`), server binaries supplied on request; the public GitHub repo is Apache-2.0 but covers only interfaces and client packages, not the server framework.

## Why it doesn't fit

1. **It is a Go module, permanently.** Hiro ships as Go plugin binaries copied into the Nakama image. There are **no plans to expose it as a TypeScript module**, and the goja TS runtime cannot call Go and vice versa. Our `apps/server` is a TypeScript `InitModule` bundle, so we would run two disjoint server frameworks side by side.
2. **It pins our Nakama version.** Hiro ships against a strict Hiro→Nakama matrix (e.g. Hiro 1.35 → Nakama 3.40). Upgrading either side becomes coordinated.
3. **It would own the wallet,** which is exactly the part we must keep auditable for store compliance (credits strictly cosmetic, never wagered or convertible, IAP receipt validated before `nk.walletUpdate`). Routing that through closed binaries adds risk for no saved effort.
4. **Most of it is the wrong genre.** Energy, gacha, auctions, guild inventories and unlockables buy nothing in a 4-player card game. Two of our needs are already native Nakama features, not Hiro's: leaderboards and friends/groups.
5. **Nothing is testable in Vitest.** Our rule is that server logic lives in pure, goja-safe TS with tests beside it; a Go binary is not.

## The one slice worth remembering

Retention/LiveOps — daily missions, streaks, achievements, seasonal events — is the only genuinely useful part, and it is cheap on our stack: a storage record per player plus a `sessionEnd` hook that credits progress. Keep it in TS so it stays testable.

## Revisit if

A second online game ships and we would otherwise rebuild loot tables, events and cross-game progression a third time.
