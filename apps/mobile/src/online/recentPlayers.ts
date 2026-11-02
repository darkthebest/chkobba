import type { Client, Session, User } from '@heroiclabs/nakama-js';

import {
  FRIEND_STATE,
  RECENT_PLAYERS_KEY,
  RECENT_TABLES_MAX,
  SOCIAL_COLLECTION,
  type FriendState,
  type RecentPlayer,
  type RecentPlayersRecord,
  type RecentTable,
} from '@chkobba/protocol';

import type { FriendsSnapshot, RecentPlayerEntry } from './friends';

/**
 * Recent players: the server writes `social/recent_players` (owner-read,
 * server-write) at game end and when a player leaves. This module reads it,
 * flattens the tables into one list per user (newest game wins), drops
 * blocked users and the caller, and refreshes names with `getUsers`.
 */

/** The nakama-js calls this module makes, so tests can pass a small fake. */
export type RecentPlayersClient = Pick<Client, 'readStorageObjects' | 'getUsers'>;

/** One user from the record, before enrichment. */
export interface FlatRecentPlayer {
  readonly userId: string;
  /** Name at the time of the game; used only if `getUsers` has no fresher one. */
  readonly name: string;
  readonly lastPlayedAt: number;
}

/** Players stored per table are at most the other three seats; anything larger is malformed. */
const MAX_PLAYERS_PER_TABLE = 8;
const MAX_ID_CHARS = 128;
/** ids per `getUsers` call. */
export const GET_USERS_BATCH = 100;

function isUserId(value: unknown): value is string {
  return typeof value === 'string' && value !== '' && value.length <= MAX_ID_CHARS;
}

function parsePlayer(value: unknown): RecentPlayer | null {
  if (typeof value !== 'object' || value === null || !('userId' in value)) return null;
  const { userId } = value;
  if (!isUserId(userId)) return null;
  const name = 'name' in value && typeof value.name === 'string' ? value.name : '';
  return { userId, name };
}

function parseTable(value: unknown): RecentTable | null {
  if (typeof value !== 'object' || value === null || !('endedAt' in value) || !('players' in value)) return null;
  const { endedAt, players } = value;
  if (typeof endedAt !== 'number' || !Number.isFinite(endedAt) || !Array.isArray(players)) return null;
  const parsed: RecentPlayer[] = [];
  for (const player of players.slice(0, MAX_PLAYERS_PER_TABLE)) {
    const p = parsePlayer(player);
    if (p) parsed.push(p);
  }
  return { endedAt, players: parsed };
}

/**
 * A `RecentPlayersRecord` from a storage value. nakama-js parses the value to
 * an object; raw REST returns a JSON string, so both are accepted. A
 * malformed record is empty; a malformed table or player is skipped.
 */
export function parseRecentPlayersRecord(value: unknown): RecentPlayersRecord {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return { tables: [] };
    }
  }
  if (typeof data !== 'object' || data === null || !('tables' in data) || !Array.isArray(data.tables)) {
    return { tables: [] };
  }
  const tables: RecentTable[] = [];
  for (const table of data.tables.slice(0, RECENT_TABLES_MAX)) {
    const t = parseTable(table);
    if (t) tables.push(t);
  }
  return { tables };
}

/**
 * One entry per user across all tables, newest game first. A user in several
 * tables keeps the newest `endedAt` (and that table's name). `excludeUserIds`
 * drops the caller and blocked users.
 */
export function flattenRecentPlayers(
  record: RecentPlayersRecord,
  excludeUserIds: ReadonlySet<string> = new Set<string>(),
): FlatRecentPlayer[] {
  const byUser = new Map<string, FlatRecentPlayer>();
  for (const table of record.tables) {
    for (const player of table.players) {
      if (excludeUserIds.has(player.userId)) continue;
      const known = byUser.get(player.userId);
      if (!known || table.endedAt > known.lastPlayedAt) {
        byUser.set(player.userId, { userId: player.userId, name: player.name, lastPlayedAt: table.endedAt });
      }
    }
  }
  return Array.from(byUser.values()).sort((a, b) => b.lastPlayedAt - a.lastPlayedAt);
}

/** Every user id in the snapshot that the caller has blocked (state 3). */
export function blockedIdsOf(snapshot: FriendsSnapshot): Set<string> {
  return new Set(snapshot.blocked.map((entry) => entry.userId));
}

/** The caller's edge state per user id (blocked users included, so callers can still filter on them). */
export function friendStatesOf(snapshot: FriendsSnapshot): Map<string, FriendState> {
  const states = new Map<string, FriendState>();
  for (const list of [snapshot.friends, snapshot.incoming, snapshot.outgoing, snapshot.blocked]) {
    for (const entry of list) states.set(entry.userId, entry.state);
  }
  return states;
}

function currentName(user: User | undefined, fallback: string): string {
  const display = user?.display_name?.trim();
  if (display) return display;
  const username = user?.username?.trim();
  if (username) return username;
  const stored = fallback.trim();
  return stored ? stored : 'Player';
}

/**
 * Final entries: blocked users dropped (again, in case `players` was not
 * pre-filtered), names refreshed from `users` (a user `getUsers` no longer
 * returns, e.g. a deleted account, is dropped) and the friend state attached.
 */
export function buildRecentPlayerEntries(
  players: readonly FlatRecentPlayer[],
  users: readonly User[],
  snapshot: FriendsSnapshot,
): RecentPlayerEntry[] {
  const byId = new Map<string, User>();
  for (const user of users) if (typeof user.id === 'string') byId.set(user.id, user);
  const states = friendStatesOf(snapshot);
  const entries: RecentPlayerEntry[] = [];
  for (const player of players) {
    const state = states.get(player.userId) ?? null;
    if (state === FRIEND_STATE.BLOCKED) continue;
    const user = byId.get(player.userId);
    if (!user) continue;
    entries.push({
      userId: player.userId,
      displayName: currentName(user, player.name),
      lastPlayedAt: player.lastPlayedAt,
      state,
    });
  }
  return entries;
}

/** The caller's record; empty when there is none (the response then has no `objects`). */
async function readRecord(client: RecentPlayersClient, session: Session, userId: string): Promise<RecentPlayersRecord> {
  const storage = await client.readStorageObjects(session, {
    object_ids: [{ collection: SOCIAL_COLLECTION, key: RECENT_PLAYERS_KEY, user_id: userId }],
  });
  const objects: unknown = storage.objects;
  if (!Array.isArray(objects)) return { tables: [] };
  const object: unknown = objects.find(
    (o: unknown) =>
      typeof o === 'object' &&
      o !== null &&
      'collection' in o &&
      o.collection === SOCIAL_COLLECTION &&
      'key' in o &&
      o.key === RECENT_PLAYERS_KEY,
  );
  if (typeof object !== 'object' || object === null || !('value' in object)) return { tables: [] };
  return parseRecentPlayersRecord(object.value);
}

async function fetchUsers(client: RecentPlayersClient, session: Session, ids: readonly string[]): Promise<User[]> {
  const users: User[] = [];
  for (let i = 0; i < ids.length; i += GET_USERS_BATCH) {
    const batch = ids.slice(i, i + GET_USERS_BATCH);
    const result = await client.getUsers(session, batch);
    users.push(...(result.users ?? []));
  }
  return users;
}

/**
 * Recent players for the session's user, newest first, with current names
 * and friend states. `snapshot` must be fresh: blocked users are filtered
 * from it on every call. Rejects on a network or server failure.
 */
export async function loadRecentPlayers(
  client: RecentPlayersClient,
  session: Session,
  snapshot: FriendsSnapshot,
): Promise<RecentPlayerEntry[]> {
  const userId = session.user_id;
  if (!userId) throw new Error('loadRecentPlayers: session has no user id');
  const record = await readRecord(client, session, userId);
  const exclude = blockedIdsOf(snapshot);
  exclude.add(userId);
  const players = flattenRecentPlayers(record, exclude);
  if (players.length === 0) return [];
  const users = await fetchUsers(
    client,
    session,
    players.map((p) => p.userId),
  );
  return buildRecentPlayerEntries(players, users, snapshot);
}
