import {
  PRACTICE_MAX_CHKOBBA_PER_GAME,
  PRACTICE_REPORT_LIMIT,
  PRACTICE_STATS_KEY,
  PRACTICE_WINDOW_MS,
  STATS_COLLECTION,
  type PracticeStats,
} from '@chkobba/protocol';

/**
 * Storage and pure rules for the practice-stats record (`player_stats/practice`,
 * ADR-0005 section 5).
 *
 * The record is server-owned at read 0 / write 0: an offline game is
 * device-asserted, so no client may read back or forge the counters directly;
 * `report_practice_game` is the only path in.
 *
 * The fixed window lives **in this same record**, not a second key. One report
 * is then one read and one write, the attempt count can never be split from the
 * block it limits, and there is no read-then-blind-write race across two keys.
 * The window fields are internal: `practiceStatsOf` strips them before the RPC
 * responds, so the wire object stays exactly `PracticeStats`.
 */

/** Only the server reads and writes the counters. */
const NO_CLIENT_READ = 0;
const NO_CLIENT_WRITE = 0;

/** No reported game yet. Also what any malformed stored value reads as. */
export const EMPTY_PRACTICE: PracticeStats = { games: 0, wins: 0, chkobbas: 0, updatedAt: 0 };

/** The stored shape: the public block plus this caller's fixed-window state. */
export interface PracticeRecord extends PracticeStats {
  /** Epoch ms the current window started; 0 before the first report. */
  readonly windowStart: number;
  /** Reports accepted since `windowStart`. */
  readonly windowReports: number;
}

/**
 * Untrusted stored value → public block. Every counter must be a finite,
 * non-negative integer and `updatedAt` a finite number; anything else — `null`,
 * a non-object, a missing field, a fractional or negative count, a `NaN`
 * timestamp — reads as `EMPTY_PRACTICE`.
 *
 * Never a cast and never a throw: an unreadable record is a zero block, not a
 * failed request and not a second storage path.
 */
export function readPractice(value: unknown): PracticeStats {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return EMPTY_PRACTICE;
  if (!('games' in value) || !('wins' in value) || !('chkobbas' in value) || !('updatedAt' in value)) {
    return EMPTY_PRACTICE;
  }
  const { games, wins, chkobbas, updatedAt } = value;
  if (!isCount(games) || !isCount(wins) || !isCount(chkobbas)) return EMPTY_PRACTICE;
  if (typeof updatedAt !== 'number' || !isFinite(updatedAt)) return EMPTY_PRACTICE;
  return { games, wins, chkobbas, updatedAt };
}

/**
 * Untrusted stored value → the full record. The block degrades through
 * `readPractice`; a malformed window field only resets the window to "not
 * started", which the next report opens fresh. Storage is server-written, so a
 * bad window is a server fault, never an attacker-controlled bypass.
 */
export function readPracticeRecord(value: unknown): PracticeRecord {
  const stats = readPractice(value);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return withWindow(stats, 0, 0);
  const source = value as { windowStart?: unknown; windowReports?: unknown };
  const windowStart = isStamp(source.windowStart) ? source.windowStart : 0;
  const windowReports = isCount(source.windowReports) ? source.windowReports : 0;
  return withWindow(stats, windowStart, windowReports);
}

/** The record as it is exposed to the client: exactly `PracticeStats`, window state removed. */
export function practiceStatsOf(record: PracticeRecord): PracticeStats {
  return {
    games: record.games,
    wins: record.wins,
    chkobbas: record.chkobbas,
    updatedAt: record.updatedAt,
  };
}

/**
 * Whether one more report fits the caller's fixed window. A window that started
 * `PRACTICE_WINDOW_MS` or more ago has expired and counts as empty.
 */
export function canReport(record: PracticeRecord, now: number): boolean {
  if (windowExpired(record, now)) return true;
  return record.windowReports < PRACTICE_REPORT_LIMIT;
}

/**
 * One finished offline game folded into the record: the counters advance and
 * the window opens fresh or counts the report. The caller must have checked
 * `canReport` first.
 *
 * `chkobbas` is floored and clamped rather than rejected (ADR-0005 section 5):
 * a buggy report cannot inflate the block, yet a real game is not lost to it.
 * `now` is the server clock, supplied by the caller so this stays pure.
 */
export function applyReport(
  record: PracticeRecord,
  win: boolean,
  chkobbas: number,
  now: number,
): PracticeRecord {
  const expired = windowExpired(record, now);
  return {
    games: record.games + 1,
    wins: record.wins + (win ? 1 : 0),
    chkobbas: record.chkobbas + clampedChkobbas(chkobbas),
    updatedAt: now,
    windowStart: expired ? now : record.windowStart,
    windowReports: expired ? 1 : record.windowReports + 1,
  };
}

/** Reads the caller's record. Absent reads as zeros; a storage fault throws to the caller. */
export function loadPracticeRecord(nk: nkruntime.Nakama, userId: string): PracticeRecord {
  const objects = nk.storageRead([{ collection: STATS_COLLECTION, key: PRACTICE_STATS_KEY, userId }]);
  const object = objects.length > 0 ? objects[0] : undefined;
  return object === undefined ? withWindow(EMPTY_PRACTICE, 0, 0) : readPracticeRecord(object.value);
}

/** Writes the caller's record. Last write wins; a storage fault throws to the caller. */
export function savePracticeRecord(nk: nkruntime.Nakama, userId: string, record: PracticeRecord): void {
  nk.storageWrite([
    {
      collection: STATS_COLLECTION,
      key: PRACTICE_STATS_KEY,
      userId,
      value: record,
      permissionRead: NO_CLIENT_READ,
      permissionWrite: NO_CLIENT_WRITE,
    },
  ]);
}

function withWindow(stats: PracticeStats, windowStart: number, windowReports: number): PracticeRecord {
  return {
    games: stats.games,
    wins: stats.wins,
    chkobbas: stats.chkobbas,
    updatedAt: stats.updatedAt,
    windowStart,
    windowReports,
  };
}

function windowExpired(record: PracticeRecord, now: number): boolean {
  return now - record.windowStart >= PRACTICE_WINDOW_MS;
}

/** A usable sweep count: floored, clamped into `[0, PRACTICE_MAX_CHKOBBA_PER_GAME]`. */
function clampedChkobbas(chkobbas: number): number {
  if (typeof chkobbas !== 'number' || !isFinite(chkobbas)) return 0;
  const floored = Math.floor(chkobbas);
  if (floored < 0) return 0;
  if (floored > PRACTICE_MAX_CHKOBBA_PER_GAME) return PRACTICE_MAX_CHKOBBA_PER_GAME;
  return floored;
}

/**
 * A stored counter: finite, non-negative and integral. `Math.floor` is the
 * check rather than `Number.isInteger` so the goja bundle never relies on a
 * method the target may lack.
 */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value >= 0 && Math.floor(value) === value;
}

/** A stored window start: any finite, non-negative timestamp. */
function isStamp(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value >= 0;
}
