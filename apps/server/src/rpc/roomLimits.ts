import type { RoomLimitsRecord } from '@chkobba/protocol';

/**
 * Pure fixed-window rate limits for private tables (ADR 0002): failed
 * `join_by_code` lookups and `create_private_table` calls, per user, in the
 * server-owned `private_table/limits` record. No `nkruntime` here; the RPC
 * supplies the stored record and the clock. The two windows are independent.
 */

/** Failed lookups allowed per window; the check before the 11th refuses. */
export const LOOKUP_FAILURE_LIMIT = 10;
/** Private tables created per window; the check before the 6th refuses. */
export const CREATE_LIMIT = 5;
/** Window length. A window that started `LIMIT_WINDOW_MS` or more ago has reset. */
export const LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** No activity yet: both windows long expired, both counts zero. */
export const EMPTY_LIMITS: RoomLimitsRecord = { lookupWindowStart: 0, lookupFailures: 0, createWindowStart: 0, creates: 0 };

/** True while the window that started at `start` still counts at `now`; exactly `LIMIT_WINDOW_MS` later it has reset. */
function windowActive(start: number, now: number): boolean {
  return now - start < LIMIT_WINDOW_MS;
}

/** Whether a `join_by_code` lookup may run now. */
export function checkLookup(record: RoomLimitsRecord | null, now: number): boolean {
  const rec = record === null ? EMPTY_LIMITS : record;
  return !windowActive(rec.lookupWindowStart, now) || rec.lookupFailures < LOOKUP_FAILURE_LIMIT;
}

/** The record after one more failed lookup at `now` (a reset window restarts at `now`). Create fields are unchanged. */
export function recordLookupFailure(record: RoomLimitsRecord | null, now: number): RoomLimitsRecord {
  const rec = record === null ? EMPTY_LIMITS : record;
  const active = windowActive(rec.lookupWindowStart, now);
  return {
    lookupWindowStart: active ? rec.lookupWindowStart : now,
    lookupFailures: active ? rec.lookupFailures + 1 : 1,
    createWindowStart: rec.createWindowStart,
    creates: rec.creates,
  };
}

/** Whether a private table may be created now. */
export function checkCreate(record: RoomLimitsRecord | null, now: number): boolean {
  const rec = record === null ? EMPTY_LIMITS : record;
  return !windowActive(rec.createWindowStart, now) || rec.creates < CREATE_LIMIT;
}

/** The record after one more create at `now` (a reset window restarts at `now`). Lookup fields are unchanged. */
export function recordCreate(record: RoomLimitsRecord | null, now: number): RoomLimitsRecord {
  const rec = record === null ? EMPTY_LIMITS : record;
  const active = windowActive(rec.createWindowStart, now);
  return {
    lookupWindowStart: rec.lookupWindowStart,
    lookupFailures: rec.lookupFailures,
    createWindowStart: active ? rec.createWindowStart : now,
    creates: active ? rec.creates + 1 : 1,
  };
}

/**
 * A stored limits record, or null when `value` is malformed (only a server bug
 * can write one: clients have no write permission). Every field must be a
 * finite, non-negative number.
 */
export function parseLimits(value: unknown): RoomLimitsRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('lookupWindowStart' in value) || !('lookupFailures' in value) || !('createWindowStart' in value) || !('creates' in value)) return null;
  const { lookupWindowStart, lookupFailures, createWindowStart, creates } = value;
  if (!isCount(lookupWindowStart) || !isCount(lookupFailures) || !isCount(createWindowStart) || !isCount(creates)) return null;
  return { lookupWindowStart, lookupFailures, createWindowStart, creates };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value >= 0;
}
