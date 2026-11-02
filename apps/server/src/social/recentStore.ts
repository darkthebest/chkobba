import { RECENT_PLAYERS_KEY, SOCIAL_COLLECTION } from '@chkobba/protocol';
import { parseRecentPlayers, recordRecentTable, type RosterEntry } from './recentPlayers';

/**
 * Storage for the recent-players record (`social/recent_players`, owned by the
 * player): the owner may read it, only the server writes it.
 */
const RECENT_READ_OWNER = 1;
const RECENT_WRITE_SERVER = 0;

/**
 * Adds the game that just ended for `ownerUserId` to their recent-players
 * record (read-modify-write, last writer wins). Best effort: any failure is
 * logged and swallowed, so a match handler calling it never fails. Only user
 * ids are logged, never room codes.
 */
export function writeRecentTable(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  ownerUserId: string,
  roster: readonly RosterEntry[],
  endedAt: number,
): void {
  try {
    const objects = nk.storageRead([{ collection: SOCIAL_COLLECTION, key: RECENT_PLAYERS_KEY, userId: ownerUserId }]);
    const object = objects.length > 0 ? objects[0] : undefined;
    const current = parseRecentPlayers(object === undefined ? null : object.value);
    const next = recordRecentTable(current, roster, ownerUserId, endedAt);
    if (next === current) return;
    nk.storageWrite([
      {
        collection: SOCIAL_COLLECTION,
        key: RECENT_PLAYERS_KEY,
        userId: ownerUserId,
        value: {
          tables: next.tables.map((table) => ({
            endedAt: table.endedAt,
            players: table.players.map((player) => ({ userId: player.userId, name: player.name })),
          })),
        },
        permissionRead: RECENT_READ_OWNER,
        permissionWrite: RECENT_WRITE_SERVER,
      },
    ]);
  } catch (error) {
    logger.warn('Recent players write failed for %s: %s', ownerUserId, String(error));
  }
}
