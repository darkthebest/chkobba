# Research: Tunisian Chkobba rules & existing engines

Date: 2026-10-26. There is no official rulebook. Sources are weighted toward clearly Tunisian ones (fr.wikipedia, lachkobba, chkobba.xalbi, chkobbeta.tn) and Pagat.

## 1. Existing engines: verdict is to write our own

No engine can be reused as a dependency. None of them is at once permissively licensed, 2v2, pure with a seeded RNG, and Tunisian-rules. There is also no npm package for Chkobba, Scopa or Scopone.

| Repo | License | Use |
|---|---|---|
| naniiic137/Chkoba (JS) | none | **Reference only.** Best Tunisian coverage: equal-rank-first capture, no chkobba on the dealer's last card, barmila tie-broken by 6s, team-aware determinized bot, server-referee architecture like ours |
| goblindegook/scopa (TS) | MIT | Port ideas: 4-player partnerships, a "worlds" bot that samples the unseen cards, a ~2k-line Vitest suite to use as an edge-case checklist |
| vlvovch/scopa (TS) | MIT | Vendor the seeded RNG (cyrb128 + sfc32). Capture-sum DFS |
| TimotheeRVB/chkobba (TS) | MIT | Easy-bot weight table and penalty for leaving a sweepable table |
| MohamedRayeneRomdhane/chkobba | GPL-3.0 | Avoid copying it |
| boardgame.io | MIT | **Don't use.** It is a second authority alongside Nakama, uses Immer/Proxy (risky in goja), and has had no release since 2022. Borrow two ideas: a `playerView(state, seat)` projection and `enumerate` legal moves |

Engine shape: a pure reducer with zero dependencies and no `Math.random`, which bundles cleanly for goja.

## 2. Canonical Tunisian ruleset

**Deck**
- 40 cards: ♦♠♣♥, A–7 plus Q, J, K. ♦ is *dīnārī*.
- Capture values: A=1, 2–7 = face value, **Q=8, J=9**, K=10.

**Seating and turns**
- 2 players, or 4 as two teams with partners opposite (seats 0 and 2 against seats 1 and 3).
- Play goes anticlockwise.

**Dealing**
- 4 cards face up on the table and 3 to each player.
- If the opening table holds 3 or more cards of the same rank, redeal.
- When every hand is empty, deal 3 more to each player. The table gets none.
- That makes 6 deals per round with 2 players and 3 with 4 players.
- The player to the dealer's right leads every deal, so the dealer plays last.
- The deal rotates each round.

**Capture**
- A turn is exactly one card. You cannot pass.
- A card captures either one table card of the same rank, or a set of 2 or more table cards summing to its value. Sums use table cards only.
- **Rank first:** if a same-rank card is on the table, you must take one single matching card, not a sum.
- When several captures are possible, the player chooses.
- Default obligation: if the card played can capture, it must.
- Partners pool their captures.

**Chkobba (sweep)**
- Emptying the table scores +1.
- **It does not count on the very last card of the round.**
- Sweeps on the last card of earlier deals do count.

**End of round**
- Leftover table cards go to the last capturer. This is never a chkobba.

**Round scoring**, 1 point each:

| Category | Rule | Tie |
|---|---|---|
| *Kārṭa* | Most cards | 20–20 means no point (*bājī*) |
| *Dīnārī* | Most ♦ | 5–5 means *bājī* |
| *Barmīla* | Most 7s; if tied, most 6s | Still tied means *bājī* |
| *7aya* | Holds the 7♦ | — |
| Chkobba | +1 each | — |

**Game**
- Play rounds until a side reaches the target (default **21**).
- Check only at the end of a round.
- If both sides reach the target, the higher total wins. If they are level, play another round.

## 3. Variants (engine config flags, default first)

| Flag | Options |
|---|---|
| `faceValues` | `Q8_J9_K10` \| `J8_Q9_K10` |
| `captureObligation` | `playedCardMustCapture` \| `mustCaptureIfAnyCardCan` \| `optional` |
| `rankPriority` | `true` \| `false` |
| `initialRedeal` | `threeOrMoreSameRank` \| `threeOrMoreKings` \| `none` |
| `lastCardChkobba` | `disallowed` \| `allowed` |
| `targetScore` | `21` \| `11` \| `31` |
| `winMargin` | `none` \| `twoPointLead` |
| `tieAtTarget` | `extraRound` \| `higherTotalWins` |
| `instantWinAllDinari` | `off` \| `on` |
| `playDirection` | `anticlockwise` \| `clockwise` |
| `cutCardChoice` | `on` \| `off` (on since 2026-10-26: the cutter keeps the cut card or throws it on the table) |

## 4. Terminology for the UI

| Term | Meaning |
|---|---|
| Chkobba | The sweep |
| Karta | Most-cards point |
| Dineri | Diamonds, and the diamonds point |
| Bermila | Most-7s point |
| 7aya | The 7♦ |
| Beji | A tied category |
| Akla | To capture |
| Moujira | Queen |
| Kawel | Jack |
| Ray | King |

## Sources

- https://www.pagat.com/fishing/scopa.html
- https://fr.wikipedia.org/wiki/Chkobba
- https://fr.wikibooks.org/wiki/Bo%C3%AEte_%C3%A0_jeux/Chkobba
- https://lachkobba.weebly.com/
- https://chkobba.xalbi.com/
- https://chkobbeta.tn/
- https://chkobba.gg/rules
- https://github.com/naniiic137/Chkoba
- https://github.com/goblindegook/scopa
- https://github.com/vlvovch/scopa
- https://github.com/TimotheeRVB/chkobba
