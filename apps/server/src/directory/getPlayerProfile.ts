import {
  COMPETITIVE_STATS_KEY,
  PRACTICE_STATS_KEY,
  STATS_COLLECTION,
  foldName,
  type DirectoryRpcErrorCode,
  type GetPlayerProfileRequest,
  type PlayerProfileResponse,
  type PlayerStats,
} from '@chkobba/protocol';
import { EMPTY_COMPETITIVE, EMPTY_PRACTICE, readCompetitive, readPractice } from '../stats';
import { isCandidateVisible, readBlockedSet, type BlockView } from './blocks';
import { readClaim, readOwnClaim } from './claimStore';
import { checkProfile, readLimits, recordProfile, writeLimits } from './limits';
import { labelOf, readPresenceVisibility } from './presencePrefs';

/**
 * `get_player_profile` (ADR-0004, ADR-0005): one listed player's name, id,
 * presence label and both stat blocks. Registered in `main.ts` (goja needs a
 * top-level named function).
 *
 * Order, so a refusal reveals nothing and every attempt is counted:
 * 1. authentication; 2. payload shape (`directory_bad_query`, 3);
 * 3. limits (`directory_rate_limited`, 8);
 * 4. record the attempt, then look up (an enumeration attempt counts even when
 *    it finds nothing);
 * 5. target must hold an own claim, and that claim must still name the target;
 * 6. the target's live display name must still fold to the claim's fold (a
 *    stale claim is not a profile);
 * 7. a block in either direction is `directory_not_found`, byte-identical to an
 *    unknown id, so a block can never be confirmed from the outside;
 * 8. presence label and the two stat blocks, read in one batch each.
 *
 * A storage fault that is not a business outcome is `directory_storage_error`
 * (13) rather than `directory_not_found`, so a transient outage never reads as
 * a missing player.
 */

/** gRPC status codes; nkruntime.Codes is an ambient const enum and cannot be read with isolatedModules. */
const INVALID_ARGUMENT = 3; // HTTP 400
const NOT_FOUND = 5; // HTTP 404
const RESOURCE_EXHAUSTED = 8; // HTTP 429
const INTERNAL = 13; // HTTP 500
const UNAUTHENTICATED = 16; // HTTP 401

/** Nakama user ids are 36-character UUIDs; leave room, but cap the field. */
const MAX_USER_ID_LENGTH = 128;

function directoryError(message: DirectoryRpcErrorCode): nkruntime.Error {
  let code = RESOURCE_EXHAUSTED;
  if (message === 'directory_bad_query' || message === 'presence_bad_request') code = INVALID_ARGUMENT;
  else if (message === 'directory_not_found') code = NOT_FOUND;
  return { message, code };
}

/**
 * A storage failure that is not a business outcome. Deliberately outside
 * `DIRECTORY_RPC_ERROR_CODES`, like `name_storage_error`: the wire contract
 * stays additive, and a client that does not know the message falls back to its
 * generic error. Reporting it as `directory_not_found` would claim the account
 * does not exist when it may be a transient fault.
 */
function directoryStorageError(): nkruntime.Error {
  return { message: 'directory_storage_error', code: INTERNAL };
}

/** True for the `{ message, code }` errors this file throws; a storage throw is a GoError with no numeric code. */
function isNakamaError(error: unknown): error is nkruntime.Error {
  if (typeof error !== 'object' || error === null) return false;
  return typeof (error as { code?: unknown }).code === 'number';
}

/** The parsed request, or null for bad JSON or a missing, non-string, empty or oversized id. The input is never echoed. */
function parseRequest(payload: string): GetPlayerProfileRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (_error) {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('userId' in value)) return null;
  const rawUserId: unknown = value.userId;
  if (typeof rawUserId !== 'string' || rawUserId.length === 0 || rawUserId.length > MAX_USER_ID_LENGTH) return null;
  return { userId: rawUserId };
}

/** The account's live display name, or null when the account is gone. Throws on a storage failure. */
function readLiveDisplayName(nk: nkruntime.Nakama, userId: string): string | null {
  const users = nk.usersGetId([userId]);
  const user = users.length > 0 ? users[0] : undefined;
  if (user === undefined || user.userId !== userId) return null;
  const displayName: unknown = user.displayName;
  return typeof displayName === 'string' ? displayName : null;
}

/**
 * Both stat blocks in one `storageRead`. Absent or malformed records read as
 * zeros, never a cast. The stats module is the single definition of each block:
 * it rebuilds the known fields, so a record that also stores internal state
 * (practice's rate-limit window) or any stray extra property cannot reach the
 * wire through `JSON.stringify`. Competitive and practice keep separate
 * provenance and are never summed (ADR-0005): a device-reported practice game
 * is not a server-observed competitive game.
 */
function readStats(nk: nkruntime.Nakama, userId: string): PlayerStats {
  const objects = nk.storageRead([
    { collection: STATS_COLLECTION, key: COMPETITIVE_STATS_KEY, userId },
    { collection: STATS_COLLECTION, key: PRACTICE_STATS_KEY, userId },
  ]);
  let competitive = EMPTY_COMPETITIVE;
  let practice = EMPTY_PRACTICE;
  for (let index = 0; index < objects.length; index += 1) {
    const object = objects[index];
    if (object === undefined || object.userId !== userId) continue;
    const value: unknown = object.value;
    if (object.key === COMPETITIVE_STATS_KEY) competitive = readCompetitive(value);
    else if (object.key === PRACTICE_STATS_KEY) practice = readPractice(value);
  }
  return { competitive, practice };
}

export function rpcGetPlayerProfile(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const callerId = ctx.userId;
  if (!callerId) throw { message: 'get_player_profile requires an authenticated user', code: UNAUTHENTICATED };

  const request = parseRequest(payload);
  if (request === null) throw directoryError('directory_bad_query');
  const targetId = request.userId;

  try {
    const now = Date.now();
    const limits = readLimits(nk, callerId);
    if (!checkProfile(limits, now)) throw directoryError('directory_rate_limited');
    // Counted before the lookup: an enumeration attempt must count even when
    // it finds nothing, otherwise a script could walk ids for free.
    writeLimits(nk, callerId, recordProfile(limits, now));

    const own = readOwnClaim(nk, targetId);
    if (own === null) throw directoryError('directory_not_found');
    const claim = readClaim(nk, own.claimKey);
    if (claim === null || claim.record.userId !== targetId) throw directoryError('directory_not_found');

    // A stale claim is not a profile: the account's live display name must
    // still fold to the key it previously claimed.
    const liveName = readLiveDisplayName(nk, targetId);
    if (liveName === null || foldName(liveName) !== claim.record.fold) throw directoryError('directory_not_found');

    // Self is never hidden from itself: a caller may always open their own
    // profile. For anyone else, a block in either direction answers exactly
    // like an unknown id, so the block cannot be confirmed.
    if (callerId !== targetId) {
      // Only the caller's own blocks are read here; `isCandidateVisible` reads
      // the target's direction itself and fails closed on an ambiguous answer.
      const view: BlockView = { blocked: readBlockedSet(nk, callerId), blockedBy: [] };
      if (!isCandidateVisible(nk, view, callerId, targetId)) throw directoryError('directory_not_found');
    }

    const visibility = readPresenceVisibility(nk, targetId);
    const response: PlayerProfileResponse = {
      userId: targetId,
      name: claim.record.name,
      presence: labelOf(visibility),
      stats: readStats(nk, targetId),
    };
    logger.debug('get_player_profile: user %s -> %s', callerId, targetId);
    return JSON.stringify(response);
  } catch (error) {
    // Keep the business answers above; a raw storage throw is a fault, not a miss.
    if (isNakamaError(error)) throw error;
    throw directoryStorageError();
  }
}
