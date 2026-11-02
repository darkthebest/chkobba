import { COMPETITIVE_STATS_KEY, STATS_COLLECTION } from '@chkobba/protocol';
import { applyResult, EMPTY_COMPETITIVE, readCompetitive } from './competitive';

/**
 * Storage for the competitive-stats record (`player_stats/competitive`, owned
 * by the player). Read permission is 0 on purpose: a player must never be able
 * to read, let alone write, their own win count through the storage API. The
 * profile RPC serves the numbers instead.
 *
 * Best effort like recent players (ADR-0005): finishing a game is authoritative
 * play and this is a side effect of it, so no storage failure may escape into
 * `matchLoop` or roll the game back.
 */

/** Only the server reads and writes the counters. */
const NO_CLIENT_READ = 0;
const NO_CLIENT_WRITE = 0;

/** One finished game's outcome for one seat, built by the match adapter from authoritative state. */
export type CompetitiveResult = { won: boolean; chkobbas: number };

/**
 * Folds one finished online game into `userId`'s competitive record with a
 * read-modify-write. A missing or corrupt record starts from
 * `EMPTY_COMPETITIVE`, so a bad value costs a player their history, never the
 * current game.
 *
 * Returns `'skipped'` only when there is no user id to write for, `'written'`
 * once the storage write lands, and `'failed'` after logging any storage error.
 *
 * Never throws. A match handler calls this on the finish transition and ignores
 * the outcome.
 *
 * Race: two concurrent writers for the same user can both read the same record,
 * and the second write overwrites the first, losing one game. Accepted and
 * documented (ADR-0005): a crash between finish and write loses one game too,
 * and a retry loop over a non-critical counter would only trade that loss for a
 * hot loop. A version check would not make the read-modify-write atomic either.
 */
export function recordCompetitiveResult(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string | undefined,
  result: CompetitiveResult,
  now: number,
): 'written' | 'skipped' | 'failed' {
  if (typeof userId !== 'string' || userId.length === 0) return 'skipped';
  try {
    const objects = nk.storageRead([{ collection: STATS_COLLECTION, key: COMPETITIVE_STATS_KEY, userId }]);
    const object = objects.length > 0 ? objects[0] : undefined;
    const record = object === undefined ? EMPTY_COMPETITIVE : readCompetitive(object.value);
    const next = applyResult(record, result.won, result.chkobbas, now);
    nk.storageWrite([
      {
        collection: STATS_COLLECTION,
        key: COMPETITIVE_STATS_KEY,
        userId,
        value: next,
        permissionRead: NO_CLIENT_READ,
        permissionWrite: NO_CLIENT_WRITE,
      },
    ]);
    return 'written';
  } catch (error) {
    logger.warn('Competitive stats write failed for user %s: %s', userId, String(error));
    return 'failed';
  }
}
