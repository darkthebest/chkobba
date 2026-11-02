import type { PracticeRpcErrorCode, ReportPracticeGameRequest, ReportPracticeGameResponse } from '@chkobba/protocol';
import {
  applyReport,
  canReport,
  loadPracticeRecord,
  practiceStatsOf,
  savePracticeRecord,
  type PracticeRecord,
} from './practiceStore';

/**
 * `report_practice_game` (ADR-0005 section 5): folds one finished offline bot
 * game into the caller's server-owned `player_stats/practice` record.
 * Registered in `main.ts` (goja needs a top-level named function).
 *
 * The numbers are device-asserted and display-only, so the RPC's job is to make
 * them bounded, not trusted: one game per call, chkobbas clamped, and a fixed
 * window per caller. The record is read 0 / write 0, so this is the only path
 * to it.
 *
 * Order matters:
 * 1. authentication; 2. payload shape (`practice_bad_request`, 3);
 * 3. one read of the record; 4. window check (`practice_rate_limited`, 8) —
 *    refused before any write, so a rate-limited call changes nothing;
 * 5. one write. A storage fault is `practice_storage_error` (13): the client
 *    must know the game did not land rather than render a stat that does not
 *    exist.
 */

/** gRPC status codes; nkruntime.Codes is an ambient const enum and cannot be read with isolatedModules. */
const INVALID_ARGUMENT = 3; // HTTP 400
const RESOURCE_EXHAUSTED = 8; // HTTP 429
const INTERNAL = 13; // HTTP 500
const UNAUTHENTICATED = 16; // HTTP 401

/** A business refusal whose message is one of `PRACTICE_RPC_ERROR_CODES`; the input is never echoed. */
function practiceError(message: PracticeRpcErrorCode): nkruntime.Error {
  const code = message === 'practice_rate_limited' ? RESOURCE_EXHAUSTED : INVALID_ARGUMENT;
  return { message, code };
}

/**
 * A storage failure that is not a business outcome. Deliberately outside
 * `PRACTICE_RPC_ERROR_CODES`, like `directory_storage_error`: the report did
 * not land, and a client that does not know the message falls back to its
 * generic error instead of showing an increment that never happened.
 */
function practiceStorageError(): nkruntime.Error {
  return { message: 'practice_storage_error', code: INTERNAL };
}

/**
 * The parsed request, or null for bad JSON, a non-object payload, a
 * missing/non-boolean `win`, or a `chkobbas` that is not a finite number. A
 * fractional or out-of-range count is fine here — `applyReport` clamps it.
 */
function parseRequest(payload: string): ReportPracticeGameRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (_error) {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('win' in value) || !('chkobbas' in value)) return null;
  const win: unknown = value.win;
  const chkobbas: unknown = value.chkobbas;
  if (typeof win !== 'boolean') return null;
  if (typeof chkobbas !== 'number' || !isFinite(chkobbas)) return null;
  return { win, chkobbas };
}

export function rpcReportPracticeGame(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const callerId = ctx.userId;
  if (!callerId) throw { message: 'report_practice_game requires an authenticated user', code: UNAUTHENTICATED };

  const request = parseRequest(payload);
  if (request === null) throw practiceError('practice_bad_request');

  const now = Date.now();
  let record: PracticeRecord;
  try {
    record = loadPracticeRecord(nk, callerId);
  } catch (error) {
    logger.warn('Practice stats read failed for user %s: %s', callerId, String(error));
    throw practiceStorageError();
  }

  if (!canReport(record, now)) throw practiceError('practice_rate_limited');

  const next = applyReport(record, request.win, request.chkobbas, now);
  try {
    savePracticeRecord(nk, callerId, next);
  } catch (error) {
    logger.warn('Practice stats write failed for user %s: %s', callerId, String(error));
    throw practiceStorageError();
  }

  const response: ReportPracticeGameResponse = { practice: practiceStatsOf(next) };
  logger.debug('report_practice_game: user %s -> games %d', callerId, next.games);
  return JSON.stringify(response);
}
