import type { TableLabel } from '@chkobba/protocol';
import { TABLE_MATCH_NAME } from '../match/tableMatch';

/**
 * `quick_match` RPC: finds the open public 2v2 table closest to starting, or
 * creates one. Request payload is ignored. Response: `{ "matchId": string }`.
 * The client then joins the match over its socket; the seat is only claimed
 * on that join, so a table can be returned to several callers at once.
 */

/** Nakama indexes JSON label booleans as T/F. */
export const OPEN_TABLES_QUERY = '+label.open:T +label.mode:2v2 +label.private:F';
/** Candidate tables considered per call. */
export const MATCH_LIST_LIMIT = 20;

/** gRPC status UNAUTHENTICATED (HTTP 401); nkruntime.Codes is an ambient const enum and cannot be read with isolatedModules. */
const UNAUTHENTICATED = 16;

export interface QuickMatchResponse {
  readonly matchId: string;
}

export function rpcQuickMatch(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  // Server-to-server calls (http_key) carry no user; a table seat needs one.
  if (!ctx.userId) throw { message: 'quick_match requires an authenticated user', code: UNAUTHENTICATED };
  const candidates = nk.matchList(MATCH_LIST_LIMIT, true, null, null, null, OPEN_TABLES_QUERY);
  const best = pickFullestOpenTable(candidates);
  const matchId = best !== null ? best : recentOrNewTable(nk, Date.now());
  logger.debug('quick_match: user %s -> %s (%s)', ctx.userId, matchId, best !== null ? 'existing' : 'recent or created');
  const response: QuickMatchResponse = { matchId };
  return JSON.stringify(response);
}

/** Where the newest quick-match table is recorded (owned by the system user, hidden from clients). */
export const RECENT_TABLE_COLLECTION = 'quick_match';
export const RECENT_TABLE_KEY = 'recent_table';
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
/** How long a new table is offered before the match index lists it (it lags about 1 s). */
export const RECENT_TABLE_WINDOW_MS = 5000;

interface RecentTable {
  readonly matchId: string;
  readonly createdAt: number;
  readonly version: string;
}

/**
 * The match list lags table creation, so two players pressing Quick match together
 * would each create a table. The newest table is recorded with a versioned write:
 * callers reuse it while it is fresh and open, and of two racing creators only one
 * write lands; the loser joins the winner's table (its own empty table ends by itself).
 */
function recentOrNewTable(nk: nkruntime.Nakama, now: number): string {
  const recent = readRecentTable(nk);
  if (recent !== null && now - recent.createdAt < RECENT_TABLE_WINDOW_MS && isOpenTable(nk, recent.matchId)) return recent.matchId;
  const matchId = nk.matchCreate(TABLE_MATCH_NAME, {});
  try {
    nk.storageWrite([
      {
        collection: RECENT_TABLE_COLLECTION,
        key: RECENT_TABLE_KEY,
        userId: SYSTEM_USER_ID,
        value: { matchId, createdAt: now },
        // '*' = only if absent; otherwise only if unchanged since our read.
        version: recent !== null ? recent.version : '*',
        permissionRead: 0,
        permissionWrite: 0,
      },
    ]);
  } catch (_error) {
    const winner = readRecentTable(nk);
    if (winner !== null && winner.matchId !== matchId && isOpenTable(nk, winner.matchId)) return winner.matchId;
  }
  return matchId;
}

function readRecentTable(nk: nkruntime.Nakama): RecentTable | null {
  const objects = nk.storageRead([{ collection: RECENT_TABLE_COLLECTION, key: RECENT_TABLE_KEY, userId: SYSTEM_USER_ID }]);
  const object = objects.length > 0 ? objects[0] : undefined;
  if (object === undefined) return null;
  const { matchId, createdAt } = object.value;
  if (typeof matchId !== 'string' || typeof createdAt !== 'number') return null;
  return { matchId, createdAt, version: object.version };
}

function isOpenTable(nk: nkruntime.Nakama, matchId: string): boolean {
  const match = nk.matchGet(matchId);
  return match !== null && pickFullestOpenTable([match]) !== null;
}

/** The open table with the fewest free seats (but at least one), so tables fill and start sooner. */
export function pickFullestOpenTable(matches: readonly nkruntime.Match[]): string | null {
  let best: { matchId: string; seatsFree: number } | null = null;
  for (const match of matches) {
    const parsed = parseLabel(match.label);
    if (parsed === null || !parsed.open || parsed.seatsFree <= 0) continue;
    if (best === null || parsed.seatsFree < best.seatsFree) best = { matchId: match.matchId, seatsFree: parsed.seatsFree };
  }
  return best === null ? null : best.matchId;
}

function parseLabel(text: string): Pick<TableLabel, 'open' | 'seatsFree'> | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (_error) {
    return null;
  }
  if (typeof value !== 'object' || value === null || !('open' in value) || !('seatsFree' in value)) return null;
  const { open, seatsFree } = value;
  if (typeof open !== 'boolean' || typeof seatsFree !== 'number') return null;
  return { open, seatsFree };
}
