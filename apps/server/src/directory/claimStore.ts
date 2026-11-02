import {
  DIRECTORY_COLLECTION,
  DIRECTORY_OWN_COLLECTION,
  OWN_CLAIM_KEY_PREFIX,
  type NameClaim,
  type OwnClaim,
} from '@chkobba/protocol';
import { CREATE_ONLY, SYSTEM_USER_ID } from '../rpc/roomStore';

/**
 * Storage for the unique-name registry (ADR-0004): the claim record
 * (`player_directory/n<sha256hex>`, system-owned, read 0 / write 0) and the
 * per-account own record (`player_directory_own/own/<userId>`, owner read 1 /
 * write 0). Server-side reads bypass storage permissions, so a claim check is a
 * plain `storageRead` under the system user id even when it belongs to someone
 * else.
 *
 * A rejected create-only write is never inspected: Nakama 3.40 throws a
 * `GoError` with no usable `code`, so acquisition catches, re-reads and decides,
 * exactly as `roomStore` does for room codes. A re-read failure propagates on
 * purpose — the caller must fail the update as a storage error, never as
 * `name_taken`.
 */

/** Claim records are server-only; clients read them through the directory RPCs. */
const CLAIM_NO_CLIENT_READ = 0;
const CLAIM_NO_CLIENT_WRITE = 0;
/** The own record is owner-readable so a client can learn that it is listed; only the server writes it. */
const OWN_CLAIM_OWNER_READ = 1;
const OWN_CLAIM_NO_CLIENT_WRITE = 0;

/** A claim record plus the storage version a version-guarded delete needs. */
export interface StoredClaim {
  readonly record: NameClaim;
  readonly version: string;
}

/** A claim value exactly as stored — possibly malformed — plus the version a guarded delete needs. */
export interface RawClaim {
  readonly value: unknown;
  readonly version: string;
}

/**
 * The claim object at `claimKey` exactly as stored, or null when absent.
 *
 * `readClaim` validates and therefore drops both the value and the version of a
 * malformed record, which would leave that key reclaimable in theory but
 * impossible to clear: the create-only write keeps failing and the caller can
 * never learn which version to delete. The reclaim path reads raw instead.
 */
export function readClaimRaw(nk: nkruntime.Nakama, claimKey: string): RawClaim | null {
  const objects = nk.storageRead([{ collection: DIRECTORY_COLLECTION, key: claimKey, userId: SYSTEM_USER_ID }]);
  const object = objects.length > 0 ? objects[0] : undefined;
  return object === undefined ? null : { value: object.value, version: object.version };
}

/**
 * The claim at `claimKey`, or null when absent. A malformed value reads as
 * absent so a broken record can never lock a name out — reconciliation then
 * treats it as reclaimable.
 */
export function readClaim(nk: nkruntime.Nakama, claimKey: string): StoredClaim | null {
  const stored = readClaimRaw(nk, claimKey);
  if (stored === null || !isNameClaim(stored.value)) return null;
  return { record: stored.value, version: stored.version };
}

/**
 * Deletes `claimKey` only while it is still at `version`, for the before-hook
 * reclaim path. It throws on failure — unlike `roomStore`'s `deleteCodeAtVersion`
 * — because the caller must answer a storage failure with an internal error,
 * never with `name_taken`. A version mismatch means the record was rewritten
 * under it, so the caller decides whether to retry rather than the delete
 * silently claiming success.
 */
export function deleteClaimAtVersion(nk: nkruntime.Nakama, claimKey: string, version: string): void {
  nk.storageDelete([{ collection: DIRECTORY_COLLECTION, key: claimKey, userId: SYSTEM_USER_ID, version }]);
}

/**
 * The result of a create-only claim write. `taken` carries the current holder
 * (and its version, so a caller that judges it stale can delete it without a
 * second read); `holder` is null when the record vanished between the rejected
 * write and the re-read.
 */
export type ClaimAcquisition =
  | { readonly status: 'acquired' }
  | { readonly status: 'taken'; readonly holder: StoredClaim | null };

/**
 * Claims `claimKey` for `userId` with a create-only write, so two accounts can
 * never hold the same folded name. On rejection the claim is re-read: a foreign
 * holder is returned to the caller to judge (rename/reconcile), while a record
 * already owned by `userId` counts as acquired (an idempotent retry, or a
 * casing/accent-only rename that folds to the same key). A genuine read failure
 * throws — it is not a clash.
 */
export function acquireClaim(
  nk: nkruntime.Nakama,
  claimKey: string,
  userId: string,
  name: string,
  fold: string,
  now: number,
): ClaimAcquisition {
  const value: NameClaim = { userId, name, fold, claimedAt: now };
  try {
    nk.storageWrite([
      {
        collection: DIRECTORY_COLLECTION,
        key: claimKey,
        userId: SYSTEM_USER_ID,
        value,
        version: CREATE_ONLY,
        permissionRead: CLAIM_NO_CLIENT_READ,
        permissionWrite: CLAIM_NO_CLIENT_WRITE,
      },
    ]);
    return { status: 'acquired' };
  } catch (_error) {
    const stored = readClaim(nk, claimKey);
    if (stored === null) return { status: 'taken', holder: null };
    if (stored.record.userId === userId) return { status: 'acquired' };
    return { status: 'taken', holder: stored };
  }
}

/**
 * Deletes `claimKey` only while it still points at `userId`, with the version
 * read just before, so a claim another account has taken in between survives.
 * Runs from the after hook, where the rename has already succeeded: a lost race
 * or a storage failure is logged and never thrown.
 */
export function releaseClaimIfOwned(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  claimKey: string,
  userId: string,
): void {
  try {
    const stored = readClaim(nk, claimKey);
    if (stored === null || stored.record.userId !== userId) return;
    nk.storageDelete([{ collection: DIRECTORY_COLLECTION, key: claimKey, userId: SYSTEM_USER_ID, version: stored.version }]);
  } catch (error) {
    logger.warn('Claim release failed for user %s: %s', userId, String(error));
  }
}

/**
 * The account's own claim record, or null when absent. The after hook reads it
 * before overwriting so it can learn the previous fold and claim key, which is
 * what the release guard compares. A malformed record reads as absent: the next
 * rename rewrites it and skips a release it cannot prove stale.
 */
export function readOwnClaim(nk: nkruntime.Nakama, userId: string): OwnClaim | null {
  const objects = nk.storageRead([
    { collection: DIRECTORY_OWN_COLLECTION, key: OWN_CLAIM_KEY_PREFIX + userId, userId },
  ]);
  const object = objects.length > 0 ? objects[0] : undefined;
  return object !== undefined && isOwnClaim(object.value) ? object.value : null;
}

/**
 * Writes the account's own claim record (`own/<userId>`), last write wins.
 * Throws on a storage failure, and the caller logs it: it runs after the update
 * already succeeded, and a stale own record only hides listing state until the
 * next write.
 */
export function writeOwnClaim(nk: nkruntime.Nakama, userId: string, own: OwnClaim): void {
  nk.storageWrite([
    {
      collection: DIRECTORY_OWN_COLLECTION,
      key: OWN_CLAIM_KEY_PREFIX + userId,
      userId,
      value: own,
      permissionRead: OWN_CLAIM_OWNER_READ,
      permissionWrite: OWN_CLAIM_NO_CLIENT_WRITE,
    },
  ]);
}

/** Runtime shape check: storage values are unknown, so a wrong-shape record must read as absent, never be trusted through a cast. */
export function isNameClaim(value: unknown): value is NameClaim {
  if (typeof value !== 'object' || value === null) return false;
  if (!('userId' in value) || !('name' in value) || !('fold' in value) || !('claimedAt' in value)) return false;
  const { userId, name, fold, claimedAt } = value;
  return (
    typeof userId === 'string' &&
    typeof name === 'string' &&
    typeof fold === 'string' &&
    typeof claimedAt === 'number' &&
    isFinite(claimedAt)
  );
}

/** Runtime shape check for the own record; see `isNameClaim`. */
export function isOwnClaim(value: unknown): value is OwnClaim {
  if (typeof value !== 'object' || value === null) return false;
  if (!('claimKey' in value) || !('fold' in value) || !('name' in value) || !('claimedAt' in value)) return false;
  const { claimKey, fold, name, claimedAt } = value;
  return (
    typeof claimKey === 'string' &&
    typeof fold === 'string' &&
    typeof name === 'string' &&
    typeof claimedAt === 'number' &&
    isFinite(claimedAt)
  );
}
