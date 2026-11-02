import { RECENT_TABLES_MAX, type RecentPlayer, type RecentPlayersRecord, type RecentTable } from '@chkobba/protocol';

/**
 * Recent players (Friends v1, plan Phase 2): the pure record update and the
 * parser for the server-owned `social/recent_players` record. No Nakama calls
 * here; `recentStore.ts` does the read-modify-write.
 */

/** A human who sat in the current game, in seating order (then takeover order). */
export interface RosterEntry {
  readonly userId: string;
  readonly name: string;
}

const EMPTY_RECORD: RecentPlayersRecord = { tables: [] };

/**
 * Prepends the table the owner just left or finished, as seen by the owner:
 * the other humans in `roster`, deduped by `userId`. Entries without a user id
 * (bots; the roster should hold humans only) and the owner are dropped. A
 * table with nobody else is not recorded (the same record is returned). The
 * result holds at most `RECENT_TABLES_MAX` tables, newest first.
 */
export function recordRecentTable(
  record: RecentPlayersRecord,
  roster: readonly RosterEntry[],
  ownerUserId: string,
  endedAt: number,
): RecentPlayersRecord {
  const players: RecentPlayer[] = [];
  const seen: { [userId: string]: true } = {};
  for (const entry of roster) {
    if (!isUserId(entry.userId) || entry.userId === ownerUserId || seen[entry.userId]) continue;
    seen[entry.userId] = true;
    players.push({ userId: entry.userId, name: entry.name });
  }
  if (players.length === 0) return record;
  const table: RecentTable = { endedAt, players };
  return { tables: [table].concat(record.tables.slice(0, RECENT_TABLES_MAX - 1)) };
}

/**
 * Untrusted stored value → record. Anything that is not `{ tables: [...] }`
 * reads as empty; malformed tables and players are dropped, tables left with
 * no players too, and at most `RECENT_TABLES_MAX` tables are kept.
 */
export function parseRecentPlayers(value: unknown): RecentPlayersRecord {
  if (typeof value !== 'object' || value === null || !('tables' in value)) return EMPTY_RECORD;
  const { tables } = value;
  if (!Array.isArray(tables)) return EMPTY_RECORD;
  const parsed: RecentTable[] = [];
  for (const item of tables) {
    const table = parseTable(item);
    if (table !== null) parsed.push(table);
    if (parsed.length >= RECENT_TABLES_MAX) break;
  }
  return { tables: parsed };
}

function parseTable(value: unknown): RecentTable | null {
  if (typeof value !== 'object' || value === null || !('endedAt' in value) || !('players' in value)) return null;
  const { endedAt, players } = value;
  if (typeof endedAt !== 'number' || !isFinite(endedAt) || !Array.isArray(players)) return null;
  const parsed: RecentPlayer[] = [];
  for (const item of players) {
    const player = parsePlayer(item);
    if (player !== null) parsed.push(player);
  }
  return parsed.length === 0 ? null : { endedAt, players: parsed };
}

function parsePlayer(value: unknown): RecentPlayer | null {
  if (typeof value !== 'object' || value === null || !('userId' in value) || !('name' in value)) return null;
  const { userId, name } = value;
  if (!isUserId(userId) || typeof name !== 'string') return null;
  return { userId, name };
}

function isUserId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
