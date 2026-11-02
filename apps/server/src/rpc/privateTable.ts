import {
  ROOM_CODE_LENGTH,
  isRoomCode,
  normalizeRoomCode,
  type CreatePrivateTableResponse,
  type JoinByCodeResponse,
  type RoomCodeRecord,
  type RoomRpcErrorCode,
} from '@chkobba/protocol';
import { TABLE_MATCH_NAME } from '../match/tableMatch';
import { byteSource, generateRoomCode } from './roomCode';
import { checkCreate, checkLookup, recordCreate, recordLookupFailure } from './roomLimits';
import { CREATE_ONLY, deleteCodeAtVersion, readCode, readLimits, reserveCode, writeLimits } from './roomStore';

/**
 * Private-table RPCs (ADR 0002). `create_private_table` reserves a fresh code,
 * creates the table and returns `{ matchId, code }`; `join_by_code` resolves a
 * live code to `{ matchId }`. The client then joins over its socket, as after
 * `quick_match`. Both are registered in `main.ts` (goja needs top-level named
 * functions). Codes are never logged or listed.
 *
 * Create order, so that a crash between steps never maps a code to a live
 * table it does not belong to:
 * 1. reserve the code with an empty `matchId` (a placeholder);
 * 2. create the match with the code;
 * 3. point the record at the new match, with the version from step 1.
 * A placeholder is dead to lookups, and stale (free to overwrite or delete)
 * once `PLACEHOLDER_GRACE_MS` old, so a crashed create frees its code.
 */

/** gRPC status codes; nkruntime.Codes is an ambient const enum and cannot be read with isolatedModules. */
const INVALID_ARGUMENT = 3; // HTTP 400
const NOT_FOUND = 5; // HTTP 404
const RESOURCE_EXHAUSTED = 8; // HTTP 429
const INTERNAL = 13; // HTTP 500
const UNAUTHENTICATED = 16; // HTTP 401

/** Codes tried per create before giving up. A collision needs a live table on the same code (about 1e-7 each). */
export const CREATE_ATTEMPTS = 5;
/** A placeholder this old belongs to a create that never finished; younger ones are an in-flight create. */
export const PLACEHOLDER_GRACE_MS = 30000;
/** No normalized code is longer; anything beyond this is junk and is not normalized. */
const MAX_CODE_INPUT = 32;

function roomError(message: RoomRpcErrorCode): nkruntime.Error {
  const code = message === 'room_bad_code' ? INVALID_ARGUMENT : message === 'room_not_found' ? NOT_FOUND : RESOURCE_EXHAUSTED;
  return { message, code };
}

export function rpcCreatePrivateTable(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, _payload: string): string {
  const userId = ctx.userId;
  if (!userId) throw { message: 'create_private_table requires an authenticated user', code: UNAUTHENTICATED };
  const now = Date.now();
  const limits = readLimits(nk, userId);
  if (!checkCreate(limits, now)) throw roomError('room_rate_limited');

  const reserved = reserveFreshCode(nk, now);
  if (reserved === null) {
    logger.error('create_private_table: no free room code after %d attempts', CREATE_ATTEMPTS);
    throw { message: 'internal', code: INTERNAL };
  }
  const matchId = nk.matchCreate(TABLE_MATCH_NAME, { private: 'true', code: reserved.code });
  if (reserveCode(nk, reserved.code, matchId, now, reserved.version) === null) {
    // Only possible if the placeholder was taken over (a create stuck past the
    // grace period). The new table is unreachable and closes once empty; its
    // cleanup leaves the other table's record alone.
    logger.error('create_private_table: room code record changed before match %s was mapped', matchId);
    throw { message: 'internal', code: INTERNAL };
  }
  try {
    writeLimits(nk, userId, recordCreate(limits, now));
  } catch (error) {
    // The table exists and is mapped: hand it over rather than fail the call.
    logger.warn('create_private_table: limits not recorded for %s: %s', userId, String(error));
  }
  logger.debug('create_private_table: user %s -> %s', userId, matchId);
  const response: CreatePrivateTableResponse = { matchId, code: reserved.code };
  return JSON.stringify(response);
}

export function rpcJoinByCode(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, payload: string): string {
  const userId = ctx.userId;
  if (!userId) throw { message: 'join_by_code requires an authenticated user', code: UNAUTHENTICATED };
  const now = Date.now();
  const limits = readLimits(nk, userId);
  // Checked before anything is parsed or read, so a limited user learns nothing.
  if (!checkLookup(limits, now)) throw roomError('room_rate_limited');

  const code = parseCode(payload);
  if (code === null) {
    writeLimits(nk, userId, recordLookupFailure(limits, now));
    throw roomError('room_bad_code');
  }
  const stored = readCode(nk, code);
  const status = stored === null ? null : codeStatus(nk, stored.record, now);
  if (stored !== null && status === 'live') {
    const response: JoinByCodeResponse = { matchId: stored.record.matchId };
    return JSON.stringify(response);
  }
  // Conditional on the read version, so a record re-reserved meanwhile survives.
  if (stored !== null && status === 'stale') deleteCodeAtVersion(nk, logger, code, stored.version);
  writeLimits(nk, userId, recordLookupFailure(limits, now));
  throw roomError('room_not_found');
}

interface Reserved {
  readonly code: string;
  /** Version of the placeholder record, for the write that maps the match. */
  readonly version: string;
}

/**
 * Up to `CREATE_ATTEMPTS` codes: a code that is free is taken with a
 * create-only write; a code whose record is stale is overwritten at that
 * record's version; a code held by a live table or an in-flight create is
 * skipped. Null when every attempt failed.
 */
function reserveFreshCode(nk: nkruntime.Nakama, now: number): Reserved | null {
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
    const code = generateRoomCode(byteSource(nk.secureRandomBytes(ROOM_CODE_LENGTH)));
    const created = reserveCode(nk, code, '', now, CREATE_ONLY);
    if (created !== null) return { code, version: created };
    // Never branch on the rejection itself: re-read and decide.
    const stored = readCode(nk, code);
    // Absent now (deleted in between) or held: try another code rather than loop on this one.
    if (stored === null || codeStatus(nk, stored.record, now) !== 'stale') continue;
    const overwritten = reserveCode(nk, code, '', now, stored.version);
    if (overwritten !== null) return { code, version: overwritten };
  }
  return null;
}

/**
 * - `live`: mapped to a running private table.
 * - `pending`: a placeholder younger than the grace period (an in-flight create); not joinable, not reusable.
 * - `stale`: an old placeholder, or a mapped match that is gone or not a private table; free to overwrite or delete.
 */
export type CodeStatus = 'live' | 'pending' | 'stale';

export function codeStatus(nk: nkruntime.Nakama, record: RoomCodeRecord, now: number): CodeStatus {
  if (record.matchId === '') return now - record.createdAt >= PLACEHOLDER_GRACE_MS ? 'stale' : 'pending';
  return isLivePrivateMatch(nk, record.matchId) ? 'live' : 'stale';
}

/**
 * Whether `matchId` is a running private table. `matchGet` may throw for an
 * ended match, so a throw, null or a label that is not `private: true` all
 * count as dead.
 */
export function isLivePrivateMatch(nk: nkruntime.Nakama, matchId: string): boolean {
  let match: nkruntime.Match | null;
  try {
    match = nk.matchGet(matchId);
  } catch (_error) {
    return false;
  }
  return match !== null && isPrivateLabel(match.label);
}

function isPrivateLabel(text: string): boolean {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (_error) {
    return false;
  }
  return typeof value === 'object' && value !== null && 'private' in value && value.private === true;
}

/** The normalized code from `{ "code": string }`, or null for bad JSON, a missing or oversized field, or a bad format. */
function parseCode(payload: string): string | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (_error) {
    return null;
  }
  if (typeof value !== 'object' || value === null || !('code' in value)) return null;
  const raw = value.code;
  if (typeof raw !== 'string' || raw.length > MAX_CODE_INPUT) return null;
  const code = normalizeRoomCode(raw);
  return isRoomCode(code) ? code : null;
}
