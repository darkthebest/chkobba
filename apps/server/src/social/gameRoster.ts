import { roomOf, type TableState } from '../table';
import type { RosterEntry } from './recentPlayers';

/**
 * Who sat in the current game, for the recent-players records. Pure: the match
 * adapter keeps a `GameRoster` in its state and calls `trackRoster` after every
 * change to the table.
 */
export interface GameRoster {
  /** Identifies the game being played (see `gameKeyOf`); null before the first game. */
  readonly gameKey: string | null;
  /** Humans who sat in this game: seating order at the start, then later takeovers. */
  readonly roster: readonly RosterEntry[];
  /** userIds whose recent-players record already has this game. */
  readonly recentWritten: readonly string[];
  /**
   * userIds whose competitive-stats record already has this game. Kept apart
   * from `recentWritten` because the two records are written at different
   * moments: a leaver takes the recent-players write early, on leave, while
   * every competitive result is written only when the game reaches `finished`.
   */
  readonly statsWritten: readonly string[];
}

export const EMPTY_GAME_ROSTER: GameRoster = { gameKey: null, roster: [], recentWritten: [], statsWritten: [] };

/**
 * The current game's identity, or null while no game exists (waiting). A
 * public table plays one game seeded with the table seed; a private table's
 * game n is seeded `${seed}:${n}` (see `startGame`), so its key is that seed.
 */
export function gameKeyOf(table: TableState): string | null {
  if (table.game === null) return null;
  const room = roomOf(table);
  return room === null ? table.seed : `${table.seed}:${room.gameNo}`;
}

/**
 * Brings the roster up to date with the table. A new game key resets it to the
 * humans seated now, in seat order, and clears both per-game ledgers; within the
 * same game any newly seated human (a takeover by SIT) is appended. With no game
 * the last roster is kept as is. Returns `current` itself when nothing changed.
 */
export function trackRoster(current: GameRoster, table: TableState): GameRoster {
  const gameKey = gameKeyOf(table);
  if (gameKey === null) return current;
  if (gameKey !== current.gameKey) return { gameKey, roster: seatedHumans(table, []), recentWritten: [], statsWritten: [] };
  const added = seatedHumans(table, current.roster);
  return added.length === 0 ? current : { ...current, roster: current.roster.concat(added) };
}

/** Roster members whose record does not have this game yet. */
export function unwrittenMembers(current: GameRoster): RosterEntry[] {
  return current.roster.filter((entry) => current.recentWritten.indexOf(entry.userId) < 0);
}

/** Whether `userId` is in the roster and still needs this game written. */
export function needsRecentWrite(current: GameRoster, userId: string): boolean {
  return current.recentWritten.indexOf(userId) < 0 && current.roster.some((entry) => entry.userId === userId);
}

export function markRecentWritten(current: GameRoster, userIds: readonly string[]): GameRoster {
  const fresh = userIds.filter((id, i) => current.recentWritten.indexOf(id) < 0 && userIds.indexOf(id) === i);
  return fresh.length === 0 ? current : { ...current, recentWritten: current.recentWritten.concat(fresh) };
}

/** Whether `userId` is in the roster and still needs this game in their stats. */
export function needsStatsWrite(current: GameRoster, userId: string): boolean {
  return current.statsWritten.indexOf(userId) < 0 && current.roster.some((entry) => entry.userId === userId);
}

export function markStatsWritten(current: GameRoster, userIds: readonly string[]): GameRoster {
  const fresh = userIds.filter((id, i) => current.statsWritten.indexOf(id) < 0 && userIds.indexOf(id) === i);
  return fresh.length === 0 ? current : { ...current, statsWritten: current.statsWritten.concat(fresh) };
}

/** Humans seated now, in seat order, who are not in `known`. */
function seatedHumans(table: TableState, known: readonly RosterEntry[]): RosterEntry[] {
  const found: RosterEntry[] = [];
  for (const slot of table.seats) {
    if (slot === null || slot.kind !== 'human') continue;
    const userId = slot.userId;
    if (known.some((entry) => entry.userId === userId) || found.some((entry) => entry.userId === userId)) continue;
    found.push({ userId, name: slot.name });
  }
  return found;
}
