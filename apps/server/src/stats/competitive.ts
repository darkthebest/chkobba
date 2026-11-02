import type { Seat } from '@chkobba/rules';
import type { CompetitiveStats } from '@chkobba/protocol';
import type { CompetitiveResult } from './competitiveStore';

/**
 * Pure competitive-stats reducer (ADR-0005): one server-observed online result
 * folded into the server-owned `player_stats/competitive` record. No
 * `nkruntime`, no storage and no clock — the match adapter reads the record,
 * passes the finished game's result and the current time, and writes what comes
 * back. Keeping the arithmetic here makes it replayable in Vitest and leaves
 * the goja module with one storage path.
 *
 * Provenance: this block is **competitive** play only. Offline/practice games
 * never reach it — they travel through `report_practice_game` into the separate
 * practice record — and the two blocks are never summed or compared (ADR-0005
 * sections 1 and 6). A "total" here would launder device-asserted numbers into
 * a verified-looking figure.
 */

/** No counted game yet. Also what any malformed stored value reads as. */
export const EMPTY_COMPETITIVE: CompetitiveStats = {
  games: 0,
  wins: 0,
  chkobbas: 0,
  currentStreak: 0,
  bestStreak: 0,
  updatedAt: 0,
};

/**
 * The only fields of a finished game the result needs, so this module never
 * depends on the whole engine state (`GameState`) or its storage. `chkobbas` is
 * indexed by team, like `GameState.chkobbas`.
 */
export interface CompetitiveGame {
  readonly winner: 0 | 1 | null;
  readonly chkobbas: readonly [number, number];
}

/** Partners sit opposite: seats 0 and 2 are team 0, seats 1 and 3 are team 1. */
export function teamOf(seat: number): 0 | 1 {
  return seat % 2 === 0 ? 0 : 1;
}

/**
 * One seat's result in a finished game, or null while the game has no winner.
 * An undecided game has nothing to write: recording a loss for everyone would
 * invent a result, and recording a win would do worse.
 *
 * `chkobbas` is the **team's** Chkobba sweeps for the whole game, not the
 * seat's own: the engine counts sweeps per pair. Any label built from this
 * figure must therefore read "Chkobba sweeps" — never "your chkobbas". This is
 * the one place that distinction is enforced.
 */
export function competitiveResultFor(game: CompetitiveGame, seat: Seat): CompetitiveResult | null {
  if (game.winner === null) return null;
  const team = teamOf(seat);
  return { won: game.winner === team, chkobbas: game.chkobbas[team] };
}

/**
 * Untrusted stored value → record. Every counter must be a finite, non-negative
 * integer and `updatedAt` a finite number; anything else — `null`, a
 * non-object, a missing field, a fractional or negative count, a `NaN`
 * timestamp — reads as `EMPTY_COMPETITIVE`.
 *
 * Never a cast and never a throw: an unreadable record is a zero profile, not a
 * failed match loop and not a second storage path.
 */
export function readCompetitive(value: unknown): CompetitiveStats {
  if (typeof value !== 'object' || value === null) return EMPTY_COMPETITIVE;
  if (
    !('games' in value) ||
    !('wins' in value) ||
    !('chkobbas' in value) ||
    !('currentStreak' in value) ||
    !('bestStreak' in value) ||
    !('updatedAt' in value)
  ) {
    return EMPTY_COMPETITIVE;
  }
  const { games, wins, chkobbas, currentStreak, bestStreak, updatedAt } = value;
  if (!isCount(games) || !isCount(wins) || !isCount(chkobbas) || !isCount(currentStreak) || !isCount(bestStreak)) {
    return EMPTY_COMPETITIVE;
  }
  if (typeof updatedAt !== 'number' || !isFinite(updatedAt)) return EMPTY_COMPETITIVE;
  return { games, wins, chkobbas, currentStreak, bestStreak, updatedAt };
}

/**
 * One finished game folded into the record: games and wins advance, the team's
 * chkobba sweeps accumulate, and the streak grows on a win or resets on a loss.
 *
 * `chkobbas` is a **team-level** count at the call site: a sweep is won by the
 * pair, so both partners' seats record it (ADR-0005 section 4). The label is
 * "Chkobba sweeps"; it is never individual attribution, and relabelling it as
 * "your sweeps" later would misstate what is stored.
 *
 * A negative or non-finite count contributes zero rather than shrinking the
 * total: the value comes from the engine, but a bug must never remove a sweep a
 * player already banked. `now` is the server clock, supplied by the caller so
 * this module stays pure.
 */
export function applyResult(record: CompetitiveStats, won: boolean, chkobbas: number, now: number): CompetitiveStats {
  const currentStreak = won ? record.currentStreak + 1 : 0;
  return {
    games: record.games + 1,
    wins: record.wins + (won ? 1 : 0),
    chkobbas: record.chkobbas + sweepCount(chkobbas),
    currentStreak,
    bestStreak: currentStreak > record.bestStreak ? currentStreak : record.bestStreak,
    updatedAt: now,
  };
}

/** A usable sweep count: floored, clamped to zero, with a non-finite or non-number value reading as zero. */
function sweepCount(chkobbas: number): number {
  if (typeof chkobbas !== 'number' || !isFinite(chkobbas)) return 0;
  const floored = Math.floor(chkobbas);
  return floored > 0 ? floored : 0;
}

/**
 * A stored counter: finite, non-negative and integral. `Math.floor` is the
 * check rather than `Number.isInteger` so the goja bundle never relies on a
 * method the target may lack.
 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value >= 0 && Math.floor(value) === value;
}
