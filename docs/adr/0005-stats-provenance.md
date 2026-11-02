# ADR-0005: Stats provenance

**Status:** Accepted
**Date:** 2026-10-31
**Plan:** `context/plans/2026-10-31-players-directory.md`

## Context

- Profiles show two counters: online games and offline bot games. They cannot share one trust level.
  - An online game is server-authoritative: the match holds the deck, every hand and the scores, so at finish the result is a fact the server observed.
  - An offline bot game runs entirely on the device. The server sees nothing about it, so any number a device reports is an assertion, not an observation.
- One combined total would present device-claimed games as if the server had verified them — exactly the shape a ranking would later consume.
- The offline game still exists and players expect it to count somewhere; a profile that ignored it would read as broken.
- The two are already two types in `packages/protocol/src/stats.ts` (`CompetitiveStats`, `PracticeStats`, `PlayerStats`). This ADR records why that shape exists, so "just add them together" later is a recorded decision to overturn, not a tidy-up.

## Decision

### 1. Two blocks with separate provenance, never summed

| Block | Source | Record | Trust |
|---|---|---|---|
| Competitive | server-observed at the finish transition | `player_stats/competitive` (read 0 / write 0) | authoritative |
| Practice | device report through `report_practice_game` | `player_stats/practice` (read 0 / write 0) | display-only |

- Both records are server-owned: no client writes storage directly. Practice goes through the RPC; competitive through the match adapter.
- `PlayerStats` carries both named blocks. The profile renders them side by side and never sums, compares or ranks them together. There is no `total` field to reach for.

### 2. Competitive stats are written at the finish transition

- One write, on the transition to a finished game, for every human seat still seated. It reads the authoritative engine state and nothing else:
  - team from the seat: seats `0 + 2` and `1 + 3`;
  - win/loss from `winner`;
  - chkobbas from that team's per-game count.
- Each such seat gets one update: `games + 1`, `wins + 1` for the winning team, `chkobbas +` the team's count, and `currentStreak` / `bestStreak` from the result.
- Best effort, like recent players, and never fatal: `recordCompetitiveResult` catches every storage error, logs it and reports `'failed'`; `recordFinished` marks the attempt in `statsWritten` regardless of the outcome, so a broken write is not retried on the next tick and a finished match is never failed or rolled back by a counter.
- The record is server-owned at read 0 / write 0: no client can read or write its own counters through the storage API. The `get_player_profile` RPC reads the record and serves the block (the wire contract belongs with the directory RPCs, not this ADR).

### 3. Provenance rules

The write is decided by the **seat at finish**, not by the session or the leave. `recordFinished` scans `table.seats` once the phase is `finished` and writes once for every `kind === 'human'` slot that still carries a `userId`, guarded per player per `gameKey`. A human seated when the game finishes therefore gets exactly one update; the five rules that qualify that statement follow.

1. **Away but seated counts.** A human whose session dropped (`sessionId: null`) or who was marked `away` still holds the seat while a bot plays it out. *Reason:* the seat, not the socket, decides; they are still in the game and their team played it.

2. **A mid-game leaver keeps the seat, so the game is recorded for them.** `leave()` during a game reserves the seat as `{ kind: 'human', sessionId: null }`; it neither frees the seat nor turns it into a bot seat, and a bot plays that seat to the end of the game. The finish write therefore records the actual result for the leaver too. *Reason:* abandoning a game must not protect a win rate — the seat is played out and its win or loss stands, so leaving cannot erase a result already in play. The write itself never happens on leave; it happens only at `finished`.

3. **Bots are excluded.** Only `kind === 'human'` slots with a non-empty `userId` are written. *Reason:* a bot has no profile, and a bot win is not a player's win.

4. **Private tables count, each game separately.** Every finished game — quick match or private table — writes once, and a private table's game *n* has its own `gameKey` (`${seed}:${room.gameNo}`), so its second game is a separate result. *Reason:* the record measures games played, not tables joined.

5. **A crash loses one game.** The record is read-modify-write with no version guard and no retry; a process death between the read and the write, or a storage fault, costs that game (logged, not retried). *Reason:* the number is cosmetic provenance, not a ledger that must be exactly once; retrying would mean a 1 Hz write loop from `matchLoop`, which is a worse failure.

- One write per player per game: `statsWritten` is tracked next to `recentWritten` and reset when a new game starts, so a reconnect cannot double-count.
- "Abandoned" is structural, not judged: a table that never reaches `finished` writes nothing, so no heuristic has to decide whether a game "really counted".
- **Competitive only:** this block is never written by the practice path and is never added to the device-reported practice block. The profile shows the two separately and never sums, compares or ranks them together (sections 1 and 6).

### 4. The chkobba counter is team-level

- Chkobbas are won by the pair, not the individual: a partner's sweep adds one to both seats' counters.
- The label therefore reads **"Chkobba sweeps"**, never "your sweeps". Per-player attribution would be a different counter (whoever took the final trick?) and is not what is stored.

### 5. Practice is device-reported, clamped and rate-limited

- `report_practice_game { win, chkobbas }` is authenticated and takes one finished offline game per call:
  - `chkobbas` is clamped to `PRACTICE_MAX_CHKOBBA_PER_GAME` (21) — clamped, not rejected, so a buggy client cannot inflate the record yet a real game is not lost to a bug;
  - a caller may send `PRACTICE_REPORT_LIMIT` (60) per `PRACTICE_WINDOW_MS` (1 h); over the limit is `practice_rate_limited`;
  - a malformed payload is `practice_bad_request`; absent records read as zeros.
- The block carries `games`, `wins`, `chkobbas` and `updatedAt`. It carries no streaks: a streak is a competitive idea, and a device-asserted one would read as a fact.
- The client reports when a stored session exists and drops the report silently otherwise. Offline play with no account reports nothing until the player goes online once; acceptable for a display-only block.

### 6. Why the two are never summed

- Any client can report any practice game. The number is an assertion, not an observation.
- Adding it to the competitive block would launder unverifiable numbers into a competitive-looking total: a player with 200 device-claimed wins would outrank one with 20 verified wins.
- The split is kept in the storage shape, the wire type and the UI copy. Labelling the block "device-reported" is part of the decision, not decoration.

### 7. Ranking reads one block only

- Ranking is not shipped. When it lands, it may read the **competitive** block only: competitive wins and games.
- Practice is excluded by construction, not by a filter someone must remember: the practice record is never on the ranking path.
- Ranking on practice, or on combined totals, is the risk this ADR exists to forbid. It would need a new ADR that overturns this one.

## Consequences

**Positive**

- Every competitive number is traced to authoritative state, so it means what players read it as.
- The offline game still counts visibly, without weakening the competitive block.
- Ranking has a clean input already separated from unverifiable data.
- The split lives in the shared protocol types, so a combined total would be a visible API change, not a quiet UI tweak.
- The label ("Chkobba sweeps") states the team-level meaning instead of implying personal credit.

**Negative and mitigations**

| Consequence | Mitigation |
|---|---|
| Practice numbers are inflatable and are not proof of anything | Accepted by design: display-only, labelled device-reported, never read by ranking (section 7) |
| Profile readers may still mentally compare the two blocks | Blocks are separate, named and differently labelled; no combined figure exists to compare |
| Team chkobbas cannot be credited to the player who won the trick | Label is "Chkobba sweeps"; the counter is documented as team-level |
| A crash between finish and write loses one competitive game | Accepted, best effort; consistent with recent players, and the loss is bounded to one game |
| A mid-game leaver still receives the game's result, because the seat is kept and played out to the end | A consequence of the seat-based rule (section 3, rule 2): leaving cannot erase a result already in play, so it protects no win rate |
| Two records and two write paths | Each is one reducer plus one storage module over the shared `stats.ts` types; no path writes the other block |
| Practice reports arrive one game per call and are windowed | 60 per hour is far above honest play; the window bounds abuse, the clamp bounds one game |
| An offline-only player has no practice block until one online session | Accepted; the block is display-only and filling on the next online play is enough |

## Alternatives considered

| Alternative | Why not |
|---|---|
| Practice stats local to the device (own profile only, never uploaded) — the plan's fallback | Unimpeachable for trust, but the block vanishes on reinstall and cannot show on the player's profile from another device. A server-owned display-only record is consistent across devices, and the trust cost is nil as long as it is never ranked |
| A signed or heartbeat practice report (client secret, report token) | Raising the cost of a fake is not verification: a client-held secret ships to every device and a token can be replayed. It would also imply the numbers are trustworthy, the opposite of what the label says. Clamp plus window plus label is cheaper and honest |
| Merging both blocks into one total | It launders unverifiable data into a competitive-looking figure (section 6) |
| Ranking on combined totals | Same laundering, and it makes the fake path the ranking path |
| Ranking on practice/total "with a note" | A ranking number is read without its note; the exclusion must be structural |
| Rejecting an over-limit chkobba count instead of clamping | A legitimate client bug would lose the whole game. The clamp keeps the block honest and the game counted |
| Per-player chkobba attribution | Not observable as a personal stat under the rules; it would need a new definition of who "won" the sweep |
| Client-written competitive stats at game end | The client is not the authority; that is practice with extra steps and a worse label |
| Writing competitive stats on leave as well as on finish | A leave is not a result; writing at leave would freeze a score before the seat is played out. The finish write records how the game actually ended |
| Counting abandoned games by heuristic (for example, a minimum number of rounds) | Invents a rule to defend. Structural exclusion at the finish transition needs none |

## Amendment (2026-11-01)

Accepted with the code as it stands. One clarification against practice: the server clamps `chkobbas` to 21 and rate-limits reports, but it cannot verify the report itself. That is the point of the split; a reader must not treat the practice block as tamper-proof just because the server stores it.

## Related

- [ADR-0004](0004-unique-display-names-players-directory-and-presence-visibility.md) (the directory and profile that expose the blocks)
- [ADR-0003](0003-friend-codes-social-socket-and-presence.md) (recent players' best-effort write, the same stance)
- `packages/protocol/src/stats.ts` (the types and limits this ADR fixes)
- `apps/server/src/stats/` (`competitive.ts`, `competitiveStore.ts`) and `recordFinished` in `apps/server/src/match/tableMatch.ts` (the write these rules describe)
- Plan: `context/plans/2026-10-31-players-directory.md`
