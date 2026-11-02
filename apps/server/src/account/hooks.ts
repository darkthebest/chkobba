import {
  FRIEND_CODE_LENGTH,
  PROFILE_COLLECTION,
  PROFILE_NAME_KEY,
  foldName,
  nameClaimKey,
  type NameErrorCode,
  type NameRecord,
  type OwnClaim,
} from '@chkobba/protocol';
import {
  acquireClaim,
  deleteClaimAtVersion,
  isNameClaim,
  judgeClaim,
  readClaim,
  readClaimRaw,
  readOwnClaim,
  releaseClaimIfOwned,
  shouldRelease,
  writeOwnClaim,
  type ClaimVerdict,
  type RawClaim,
} from '../directory';
import { byteSource } from '../rpc/roomCode';
import { generateFriendCode, isFriendCodeClean } from './friendCode';
import { checkName, checkRenameCooldown, defaultDisplayName } from './rules';

/**
 * Account hooks: the server owns display names (Decision 9). The before hook is
 * the single enforcement point for name rules; the after hooks keep the
 * `NameRecord` and give new accounts a default name. Registered in `main.ts`
 * (goja needs them as top-level named functions).
 *
 * A field counts as present when it is neither `undefined` nor `null`. Nakama
 * hands the hook unset `StringValue` wrappers as absent, and nakama-js only
 * sends the keys the caller set, so `""` is a real request (clear the avatar,
 * an empty name) and is judged like any other value.
 */

/** gRPC status codes; nkruntime.Codes is an ambient const enum and cannot be read with isolatedModules. */
const INVALID_ARGUMENT = 3; // HTTP 400
const RESOURCE_EXHAUSTED = 8; // HTTP 429
const INTERNAL = 13; // HTTP 500
const UNAUTHENTICATED = 16; // HTTP 401

/** Create-only attempts per update: the initial one, plus one after clearing a stale or malformed claim. */
const CLAIM_ATTEMPTS = 2;

/**
 * The outcome of one create-only claim attempt. `retry` means a stale or
 * malformed record was cleared and another attempt is due; `taken` is a live
 * foreign holder and is never cleared.
 */
type ClaimAttempt = 'acquired' | 'taken' | 'retry';

/** Read only the owner's record; 1 = owner read, 0 = server write only. */
const NAME_RECORD_READ = 1;
const NAME_RECORD_WRITE = 0;

function isPresent(value: string | null | undefined): value is string {
  return value !== undefined && value !== null;
}

function nameError(code: NameErrorCode): nkruntime.Error {
  return { message: code, code: code === 'name_rate_limited' ? RESOURCE_EXHAUSTED : INVALID_ARGUMENT };
}

/**
 * A storage failure while reserving the name. Deliberately not a member of
 * `NAME_ERROR_CODES`: the wire contract stays additive, and a client that does
 * not know the message already falls back to its generic error. Reporting it as
 * `name_taken` would claim the spelling is unavailable when it may be free.
 */
function nameStorageError(): nkruntime.Error {
  return { message: 'name_storage_error', code: INTERNAL };
}

/** True for the `{ message, code }` errors these hooks throw; a storage throw is a GoError with no numeric code. */
function isNakamaError(error: unknown): error is nkruntime.Error {
  if (typeof error !== 'object' || error === null) return false;
  return typeof (error as { code?: unknown }).code === 'number';
}

/**
 * Rejects locked fields, validates and normalizes `displayName`, applies the
 * rename cooldown and reserves the folded name (ADR-0004). Must return `data`
 * on success: a null return makes Nakama skip the update and answer 404.
 *
 * The claim happens before the assignment so a rejected reservation leaves the
 * request untouched. Only errors this file throws as `nkruntime.Error` keep
 * their meaning; a raw storage throw becomes `name_storage_error`, never
 * `name_taken`, so an outage cannot masquerade as a taken name.
 */
export function beforeUpdateAccount(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  data: nkruntime.UserUpdateAccount,
): nkruntime.UserUpdateAccount {
  if (isPresent(data.username)) throw nameError('username_locked');
  if (isPresent(data.avatarUrl) || isPresent(data.location)) throw nameError('field_locked');
  if (!isPresent(data.displayName)) return data;

  const userId = ctx.userId || data.userId;
  if (!userId) throw { message: 'account update requires an authenticated user', code: UNAUTHENTICATED };

  const name = checkName(data.displayName);
  if (!name.ok) throw nameError(name.code);
  const cooldown = checkRenameCooldown(readNameRecord(nk, logger, userId), Date.now());
  if (!cooldown.ok) throw nameError(cooldown.code);

  try {
    claimName(nk, userId, name.name, Date.now());
  } catch (error) {
    // `nameError` throws here too, so only a non-nakama throw is a storage failure.
    if (isNakamaError(error)) throw error;
    throw nameStorageError();
  }

  data.displayName = name.name;
  return data;
}

/**
 * Reserves `name` for `userId` with a create-only claim, clearing a record that
 * provably no longer represents that owner and retrying once. A live foreign
 * claim is `name_taken`; storage throws propagate so the caller can answer
 * `name_storage_error` instead.
 */
function claimName(nk: nkruntime.Nakama, userId: string, name: string, now: number): void {
  const fold = foldName(name);
  const claimKey = nameClaimKey(fold);
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const outcome = tryAcquireClaim(nk, claimKey, userId, name, fold, now);
    if (outcome === 'acquired') return;
    if (outcome === 'taken') throw nameError('name_taken');
  }
  // No attempt ever found a readable foreign holder: the key stayed absent
  // under repeated create-only failures, which is a storage fault rather than
  // a clash (`acquireClaim` cannot tell a rejection from an outage). Answering
  // `name_taken` here would report a free name as taken.
  throw nameStorageError();
}

/**
 * One create-only attempt. `acquired` when the caller holds the key, `taken` for
 * a live foreign holder, and `retry` when a stale or malformed record was
 * cleared and another attempt is due.
 */
function tryAcquireClaim(
  nk: nkruntime.Nakama,
  claimKey: string,
  userId: string,
  name: string,
  fold: string,
  now: number,
): ClaimAttempt {
  const acquisition = acquireClaim(nk, claimKey, userId, name, fold, now);
  if (acquisition.status === 'acquired') return 'acquired';
  // The holder is null both when the record vanished between the rejected
  // write and the re-read, and when it is malformed (`readClaim` validates and
  // reads a broken value as absent). A raw read tells them apart, so a
  // malformed record is cleared instead of locking its name out for good.
  const held: RawClaim | null =
    acquisition.holder !== null
      ? { value: acquisition.holder.record, version: acquisition.holder.version }
      : readClaimRaw(nk, claimKey);
  if (held === null) return 'retry';

  const verdict = judgeHeldClaim(nk, held.value, userId);
  if (verdict === 'free') return 'acquired';
  if (verdict === 'taken') return 'taken';
  deleteClaimAtVersion(nk, claimKey, held.version);
  return 'retry';
}

/**
 * Judges a stored claim value for `userId`. A malformed value and the caller's
 * own record are decided without a lookup; only a well-formed foreign claim
 * needs the owner's live display name, which is what makes a lazily stale claim
 * reclaimable.
 */
function judgeHeldClaim(nk: nkruntime.Nakama, value: unknown, userId: string): ClaimVerdict {
  // The storage object exists here, so a null/undefined value is malformed and
  // still occupies the key: `judgeClaim` would read it as absent (`free`) and
  // the create-only write would then never succeed.
  if (value === null || value === undefined) return 'reclaim';
  if (!isNameClaim(value) || value.userId === userId) return judgeClaim(value, userId, null);
  return judgeClaim(value, userId, liveDisplayName(nk, value.userId));
}

/**
 * The claim owner's live display name, or null when a successful lookup returns
 * no user (the account is gone, so the claim is reclaimable). A lookup that
 * throws fails closed with `name_taken`: a transient API failure must never let
 * a caller reclaim — and so steal — a name that is still in use.
 */
function liveDisplayName(nk: nkruntime.Nakama, holderId: string): string | null {
  let users: nkruntime.User[];
  try {
    users = nk.usersGetId([holderId]);
  } catch (_error) {
    throw nameError('name_taken');
  }
  if (!Array.isArray(users)) throw nameError('name_taken');
  const user = users.length > 0 ? users[0] : undefined;
  if (user === undefined) return null;
  if (typeof user.displayName !== 'string') throw nameError('name_taken');
  return user.displayName;
}

/**
 * Records the pick or rename after Nakama stored the new name. The update has
 * already succeeded, so failures are logged, never thrown. Two near-simultaneous
 * renames may both pass the cooldown (Decision 8), so no version check.
 *
 * It also maintains the unique-name registry (ADR-0004 section 10): it rewrites
 * the own record and, on a genuine fold change, releases the claim taken under
 * the previous name.
 */
export function afterUpdateAccount(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  _data: void,
  request: nkruntime.UserUpdateAccount,
): void {
  if (!isPresent(request.displayName)) return;
  const userId = ctx.userId || request.userId;
  if (!userId) {
    logger.warn('afterUpdateAccount: no user id, name record not written');
    return;
  }
  try {
    const now = Date.now();
    const existing = readNameRecord(nk, logger, userId);
    const record: NameRecord = existing === null ? { pickedAt: now, changedAt: null } : { pickedAt: existing.pickedAt, changedAt: now };
    nk.storageWrite([
      {
        collection: PROFILE_COLLECTION,
        key: PROFILE_NAME_KEY,
        userId,
        value: { pickedAt: record.pickedAt, changedAt: record.changedAt },
        permissionRead: NAME_RECORD_READ,
        permissionWrite: NAME_RECORD_WRITE,
      },
    ]);
  } catch (error) {
    logger.error('afterUpdateAccount: name record write failed for %s: %s', userId, String(error));
  }

  // Registry bookkeeping is best effort: the update already succeeded, and a
  // stale own record only hides the listing state until the next rename, so a
  // failure here is a warning rather than the authoritative record's error.
  //
  // The own record is read before it is overwritten: this hook never receives
  // the previous name, so the old fold and claim key can only come from here.
  // A read failure still lets the write below run and leaves the old claim to
  // lazy reconciliation.
  let previous: OwnClaim | null = null;
  try {
    previous = readOwnClaim(nk, userId);
  } catch (error) {
    logger.warn('afterUpdateAccount: own claim read failed for %s: %s', userId, String(error));
  }

  const now = Date.now();
  const newFold = foldName(request.displayName);
  try {
    writeOwnClaim(nk, userId, {
      claimKey: nameClaimKey(newFold),
      fold: newFold,
      name: request.displayName,
      // An equal fold is still the claim the before hook kept, so its original
      // timestamp stands; a different fold took the name over again just now.
      claimedAt: previous !== null && previous.fold === newFold ? previous.claimedAt : now,
    });
  } catch (error) {
    logger.warn('afterUpdateAccount: own claim write failed for %s: %s', userId, String(error));
  }

  // Release the old claim only on a genuine fold change. An equal fold means
  // the before hook just wrote (or kept) the same claim key, so releasing it
  // here would delete the claim the update just secured and silently unlist a
  // casing/accent-only rename — the difference between "rename works" and
  // "rename silently unlists". The delete is ownership-guarded, so it never
  // removes a key another account has taken since.
  if (previous !== null && shouldRelease(previous.fold, newFold)) {
    releaseClaimIfOwned(nk, logger, previous.claimKey, userId);
  }
}

/** Fresh codes tried before giving up and letting Nakama answer 409 on a clash. */
const FRIEND_CODE_TRIES = 5;

/**
 * The username is the player's friend code (ADR 0003). Nakama uses
 * `data.username` only when it creates the account and ignores it on sign-in,
 * and this hook can't tell the two apart, so it runs on every device sign-in
 * and stays cheap: one `secureRandomBytes` call and one lookup per try.
 *
 * The server always picks the code, so clients can't choose vanity or
 * offensive names: any client-sent username is replaced with a fresh, clean
 * code no account holds yet (uppercase; lookups are case-sensitive). If every
 * try clashes, the last clean candidate stays and Nakama answers 409. Never
 * rejects a sign-in: failures are logged and `data` goes through unchanged.
 */
export function beforeAuthenticateDevice(
  _ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  data: nkruntime.AuthenticateDeviceRequest,
): nkruntime.AuthenticateDeviceRequest {
  try {
    let lastClean: string | null = null;
    const isUsable = (code: string): boolean => {
      if (!isFriendCodeClean(code)) return false;
      lastClean = code;
      return nk.usersGetUsername([code]).length === 0;
    };
    const nextByte = byteSource(nk.secureRandomBytes(FRIEND_CODE_LENGTH * FRIEND_CODE_TRIES));
    const code = generateFriendCode(nextByte, isUsable, FRIEND_CODE_TRIES) ?? lastClean;
    if (code === null) {
      logger.warn('beforeAuthenticateDevice: no clean friend code in %d tries; username left unchanged', FRIEND_CODE_TRIES);
    } else {
      data.username = code;
    }
  } catch (error) {
    logger.warn('beforeAuthenticateDevice: friend code not assigned: %s', String(error));
  }
  return data;
}

/**
 * Reserves the account's live name during sign-in, reusing the before hook's
 * bounded reclaim path but never throwing: a live foreign claim or any storage
 * fault leaves the account unlisted and only logs. A clash stops immediately
 * (no retry loop), and only a provably stale or malformed record is cleared, so
 * a live claim is never deleted.
 */
function reconcileClaim(
  nk: nkruntime.Nakama,
  logger: nkruntime.Logger,
  userId: string,
  name: string,
  fold: string,
  claimKey: string,
  now: number,
): 'acquired' | 'unlisted' {
  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    let outcome: ClaimAttempt;
    try {
      outcome = tryAcquireClaim(nk, claimKey, userId, name, fold, now);
    } catch (error) {
      // `judgeHeldClaim` fails closed with `name_taken` when the holder's live
      // name cannot be read. Treat that as a clash: an unclear holder is never
      // licence to reclaim.
      if (isNakamaError(error) && error.message === 'name_taken') {
        logger.info('afterAuthenticateDevice: name held by another account; %s stays unlisted', userId);
        return 'unlisted';
      }
      throw error;
    }
    if (outcome === 'acquired') return 'acquired';
    if (outcome === 'taken') {
      logger.info('afterAuthenticateDevice: name held by another account; %s stays unlisted', userId);
      return 'unlisted';
    }
    // A stale or malformed record was cleared; the second attempt is the bound.
  }
  // No readable foreign holder across both attempts: a storage fault rather
  // than a clash (`acquireClaim` cannot tell a rejection from an outage). The
  // account stays unlisted and the next sign-in tries again.
  logger.warn('afterAuthenticateDevice: name claim for %s could not be reserved; storage may be unavailable', userId);
  return 'unlisted';
}

/**
 * Best-effort backfill and repair of the unique-name claim on every device
 * sign-in (ADR-0004 section 10). Sign-in must succeed whatever storage or a
 * lookup does, so every failure is logged and swallowed. The work is bounded:
 * one name-record read, one user lookup, one own-claim read, one bounded
 * acquire, and at most one own write plus one release. An in-sync own record
 * adds a single claim read to prove its pointer still resolves.
 */
function reconcileNameClaim(nk: nkruntime.Nakama, logger: nkruntime.Logger, userId: string): void {
  try {
    // No NameRecord means the account never picked a name (it still carries the
    // generated PlayerNNNN default). Such an account is deliberately unlisted
    // and must not consume a claim: the first pick reserves the name through
    // beforeUpdateAccount, which is also what writes this record.
    if (readNameRecord(nk, logger, userId) === null) return;

    const liveName = liveDisplayName(nk, userId);
    if (liveName === null) {
      logger.warn('afterAuthenticateDevice: no live account for %s, name claim not reconciled', userId);
      return;
    }
    const fold = foldName(liveName);
    if (fold === '') {
      // A picked name is never empty: a record with an empty display name is a
      // broken legacy state, and claiming the empty fold would add a junk name.
      logger.warn('afterAuthenticateDevice: empty display name for %s, name claim not reconciled', userId);
      return;
    }
    const claimKey = nameClaimKey(fold);
    const own = readOwnClaim(nk, userId);
    const now = Date.now();

    if (own === null) {
      // Backfill: a named account from before claims existed has no own record.
      // Acquiring is the only write; on a clash nothing is written at all.
      if (reconcileClaim(nk, logger, userId, liveName, fold, claimKey, now) !== 'acquired') return;
      writeOwnClaim(nk, userId, { claimKey, fold, name: liveName, claimedAt: now });
      return;
    }

    if (own.fold === fold) {
      // The own record matches the live name, but it is only a pointer to the
      // claim. If that claim row vanished or now belongs to another account, an
      // unconditional no-op would leave this player unlisted for good with no
      // repair short of a rename. Verify the pointer and re-acquire through the
      // shared bounded path; a live foreign holder is never touched and keeps
      // the account unlisted, while a missing or stale claim is re-created.
      const held = readClaim(nk, own.claimKey);
      if (held !== null && held.record.userId === userId) return;
      if (reconcileClaim(nk, logger, userId, liveName, fold, claimKey, now) !== 'acquired') return;
      writeOwnClaim(nk, userId, { claimKey, fold, name: liveName, claimedAt: now });
      return;
    }

    // Drift: an after hook failed or the account predates own records. Take the
    // live name first and only then release the old own key, so a clash leaves
    // both the old claim and the old own record untouched. The release guard is
    // repeated here as the single stated rule for when a claim may be dropped.
    if (reconcileClaim(nk, logger, userId, liveName, fold, claimKey, now) !== 'acquired') return;
    if (shouldRelease(own.fold, fold)) releaseClaimIfOwned(nk, logger, own.claimKey, userId);
    writeOwnClaim(nk, userId, { claimKey, fold, name: liveName, claimedAt: now });
  } catch (error) {
    logger.warn('afterAuthenticateDevice: name claim reconciliation failed for %s: %s', userId, String(error));
  }
}

/**
 * Gives a newly created device account a default `PlayerNNNN` display name
 * (it has no `NameRecord`, so the player is still asked to pick one). Never
 * fails the authentication.
 *
 * Every sign-in also reconciles the name claim first: an existing named account
 * is backfilled onto the directory, while a new account has no `NameRecord` yet
 * and is skipped. Reconciliation never throws.
 */
export function afterAuthenticateDevice(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  data: nkruntime.Session,
  _request: nkruntime.AuthenticateDeviceRequest,
): void {
  // Before the `created` guard: the default name below is create-only, but a
  // returning named account still needs its lazy backfill.
  if (ctx.userId) reconcileNameClaim(nk, logger, ctx.userId);
  if (data.created !== true) return;
  if (!ctx.userId) {
    // The table then falls back to the username.
    logger.warn('afterAuthenticateDevice: new account without a user id, default name not set');
    return;
  }
  try {
    // Server-side update: the before hook does not run, so no NameRecord is written.
    nk.accountUpdateId(ctx.userId, null, defaultDisplayName(Math.random), null, null, null, null);
  } catch (error) {
    logger.error('afterAuthenticateDevice: default name failed for %s: %s', ctx.userId, String(error));
  }
}

/**
 * The stored record, or null when there is none. A malformed record (only a
 * server bug can write one: clients have no write permission) is logged and
 * treated as absent: no cooldown, and the next rename overwrites it with a
 * valid first-pick record.
 */
function readNameRecord(nk: nkruntime.Nakama, logger: nkruntime.Logger, userId: string): NameRecord | null {
  const objects = nk.storageRead([{ collection: PROFILE_COLLECTION, key: PROFILE_NAME_KEY, userId }]);
  const object = objects.length > 0 ? objects[0] : undefined;
  if (object === undefined) return null;
  const record = parseNameRecord(object.value);
  if (record === null) logger.warn('name record for %s is malformed; treating it as absent', userId);
  return record;
}

function parseNameRecord(value: unknown): NameRecord | null {
  if (typeof value !== 'object' || value === null || !('pickedAt' in value) || !('changedAt' in value)) return null;
  const { pickedAt, changedAt } = value;
  if (typeof pickedAt !== 'number' || !isFinite(pickedAt)) return null;
  if (changedAt !== null && (typeof changedAt !== 'number' || !isFinite(changedAt))) return null;
  return { pickedAt, changedAt };
}
