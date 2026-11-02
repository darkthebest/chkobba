import { ROOM_COLLECTION, ROOM_LIMITS_KEY, type RoomCodeRecord, type RoomLimitsRecord } from '@chkobba/protocol';
import { parseLimits } from './roomLimits';

/**
 * Storage for private tables (ADR 0002): the code → match mapping
 * (`private_table/<code>`, owned by the system user) and the per-user rate
 * limits (`private_table/limits`, owned by the user). Every record is
 * server-only: read and write permission 0, so clients can neither list codes
 * nor reset their limits.
 *
 * A rejected versioned write is never inspected (its gRPC code and JS shape
 * are unverified on Nakama 3.40): callers catch, re-read and decide, as in
 * `quickMatch.ts`. Codes are never logged.
 */

/** Nakama's system user owns the code records, as `quick_match` does for its recent table. */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
/** Server-only records: no client read, no client write. */
const NO_CLIENT_READ = 0;
const NO_CLIENT_WRITE = 0;

/** `version` for a write that only succeeds when the key does not exist yet. */
export const CREATE_ONLY = '*';

export interface StoredCode {
  readonly record: RoomCodeRecord;
  readonly version: string;
}

/** The mapping for `code`, or null when absent or malformed (only a server bug can write a malformed one). */
export function readCode(nk: nkruntime.Nakama, code: string): StoredCode | null {
  const objects = nk.storageRead([{ collection: ROOM_COLLECTION, key: code, userId: SYSTEM_USER_ID }]);
  const object = objects.length > 0 ? objects[0] : undefined;
  if (object === undefined) return null;
  const record = parseCodeRecord(object.value);
  return record === null ? null : { record, version: object.version };
}

/**
 * Writes `{ matchId, createdAt: now }` for `code`, only if the stored version
 * still equals `version` (`CREATE_ONLY` = only if absent). Returns the new
 * version, or null when the write was rejected (a version mismatch or any
 * other storage failure); never throws.
 */
export function reserveCode(nk: nkruntime.Nakama, code: string, matchId: string, now: number, version: string): string | null {
  const value: RoomCodeRecord = { matchId, createdAt: now };
  try {
    const acks = nk.storageWrite([
      {
        collection: ROOM_COLLECTION,
        key: code,
        userId: SYSTEM_USER_ID,
        value,
        version,
        permissionRead: NO_CLIENT_READ,
        permissionWrite: NO_CLIENT_WRITE,
      },
    ]);
    const ack = acks.length > 0 ? acks[0] : undefined;
    // A write that landed always acks; an empty list means nothing to build on.
    return ack !== undefined && typeof ack.version === 'string' ? ack.version : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Deletes the mapping for `code` only while it still points at `matchId`, with
 * the read version so a record rewritten in between survives. Used by a
 * closing table; idempotent, and failures are logged, never thrown.
 */
export function deleteCodeIfOwned(nk: nkruntime.Nakama, logger: nkruntime.Logger, code: string, matchId: string): void {
  try {
    const stored = readCode(nk, code);
    if (stored === null || stored.record.matchId !== matchId) return;
    nk.storageDelete([{ collection: ROOM_COLLECTION, key: code, userId: SYSTEM_USER_ID, version: stored.version }]);
  } catch (error) {
    logger.warn('Room code cleanup failed for match %s: %s', matchId, String(error));
  }
}

/** Deletes the mapping for `code` only if it is still at `version` (a stale record found by a lookup). Never throws. */
export function deleteCodeAtVersion(nk: nkruntime.Nakama, logger: nkruntime.Logger, code: string, version: string): void {
  try {
    nk.storageDelete([{ collection: ROOM_COLLECTION, key: code, userId: SYSTEM_USER_ID, version }]);
  } catch (error) {
    logger.debug('Stale room code not deleted (changed meanwhile or storage error): %s', String(error));
  }
}

/** The user's limits record, or null when absent or malformed (both read as "no activity"). */
export function readLimits(nk: nkruntime.Nakama, userId: string): RoomLimitsRecord | null {
  const objects = nk.storageRead([{ collection: ROOM_COLLECTION, key: ROOM_LIMITS_KEY, userId }]);
  const object = objects.length > 0 ? objects[0] : undefined;
  return object === undefined ? null : parseLimits(object.value);
}

/** Last write wins: two parallel calls may both pass a check (accepted, as with `profile/name`). Throws on storage failure. */
export function writeLimits(nk: nkruntime.Nakama, userId: string, record: RoomLimitsRecord): void {
  nk.storageWrite([
    {
      collection: ROOM_COLLECTION,
      key: ROOM_LIMITS_KEY,
      userId,
      value: record,
      permissionRead: NO_CLIENT_READ,
      permissionWrite: NO_CLIENT_WRITE,
    },
  ]);
}

function parseCodeRecord(value: unknown): RoomCodeRecord | null {
  if (typeof value !== 'object' || value === null || !('matchId' in value) || !('createdAt' in value)) return null;
  const { matchId, createdAt } = value;
  if (typeof matchId !== 'string' || typeof createdAt !== 'number' || !isFinite(createdAt)) return null;
  return { matchId, createdAt };
}
