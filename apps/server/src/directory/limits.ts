import {
  DIRECTORY_COLLECTION,
  DIRECTORY_LIMITS_KEY,
  type DirectoryLimitsRecord,
} from '@chkobba/protocol';

/**
 * Pure fixed-window rate limits for the players directory (ADR-0004): searches
 * and profile reads, per caller, in the server-owned `player_directory/limits`
 * record. No `nkruntime` here; the RPC supplies the stored record and the
 * clock. The two windows are independent.
 *
 * The record shares the claim collection safely: it carries no `fold`, so the
 * whole-collection `player_names` index never sees it (ADR-0004 section 3).
 */

/** Searches allowed per window; the check before the 101st refuses, which bounds a script walking prefixes. */
export const SEARCH_LIMIT = 100;
/** Profile views allowed per window; the check before the 201st refuses, which bounds a script enumerating ids. */
export const PROFILE_LIMIT = 200;
/** Window length. A window that started `LIMIT_WINDOW_MS` or more ago has reset. */
export const LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** No activity yet: both windows long expired, both counts zero. */
export const EMPTY_LIMITS: DirectoryLimitsRecord = { searchWindowStart: 0, searches: 0, profileWindowStart: 0, profiles: 0 };

/** True while the window that started at `start` still counts at `now`; exactly `LIMIT_WINDOW_MS` later it has reset. */
function windowActive(start: number, now: number): boolean {
  return now - start < LIMIT_WINDOW_MS;
}

/** Whether a directory search may run now. */
export function checkSearch(record: DirectoryLimitsRecord | null, now: number): boolean {
  const rec = record === null ? EMPTY_LIMITS : record;
  return !windowActive(rec.searchWindowStart, now) || rec.searches < SEARCH_LIMIT;
}

/** The record after one more search at `now` (a reset window restarts at `now`). Profile fields are unchanged. */
export function recordSearch(record: DirectoryLimitsRecord | null, now: number): DirectoryLimitsRecord {
  const rec = record === null ? EMPTY_LIMITS : record;
  const active = windowActive(rec.searchWindowStart, now);
  return {
    searchWindowStart: active ? rec.searchWindowStart : now,
    searches: active ? rec.searches + 1 : 1,
    profileWindowStart: rec.profileWindowStart,
    profiles: rec.profiles,
  };
}

/** Whether a profile view may run now. */
export function checkProfile(record: DirectoryLimitsRecord | null, now: number): boolean {
  const rec = record === null ? EMPTY_LIMITS : record;
  return !windowActive(rec.profileWindowStart, now) || rec.profiles < PROFILE_LIMIT;
}

/** The record after one more profile view at `now` (a reset window restarts at `now`). Search fields are unchanged. */
export function recordProfile(record: DirectoryLimitsRecord | null, now: number): DirectoryLimitsRecord {
  const rec = record === null ? EMPTY_LIMITS : record;
  const active = windowActive(rec.profileWindowStart, now);
  return {
    searchWindowStart: rec.searchWindowStart,
    searches: rec.searches,
    profileWindowStart: active ? rec.profileWindowStart : now,
    profiles: active ? rec.profiles + 1 : 1,
  };
}

/**
 * A stored limits record, or null when `value` is malformed (only a server bug
 * can write one: clients have no write permission). Every field must be a
 * finite, non-negative number.
 */
export function parseLimits(value: unknown): DirectoryLimitsRecord | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('searchWindowStart' in value) || !('searches' in value) || !('profileWindowStart' in value) || !('profiles' in value)) return null;
  const { searchWindowStart, searches, profileWindowStart, profiles } = value;
  if (!isCount(searchWindowStart) || !isCount(searches) || !isCount(profileWindowStart) || !isCount(profiles)) return null;
  return { searchWindowStart, searches, profileWindowStart, profiles };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value >= 0;
}

// Storage half: `player_directory/limits`, owned by the calling user, server
// only. A malformed stored value reads as null ("no activity"), never a cast.

/** Server-only records: no client read, no client write. */
const NO_CLIENT_READ = 0;
const NO_CLIENT_WRITE = 0;

/** The user's limits record, or null when absent or malformed (both read as "no activity"). */
export function readLimits(nk: nkruntime.Nakama, userId: string): DirectoryLimitsRecord | null {
  const objects = nk.storageRead([{ collection: DIRECTORY_COLLECTION, key: DIRECTORY_LIMITS_KEY, userId }]);
  const object = objects.length > 0 ? objects[0] : undefined;
  return object === undefined ? null : parseLimits(object.value);
}

/** Last write wins: two parallel calls may both pass a check (accepted, as with `roomLimits`). Throws on storage failure. */
export function writeLimits(nk: nkruntime.Nakama, userId: string, record: DirectoryLimitsRecord): void {
  nk.storageWrite([
    {
      collection: DIRECTORY_COLLECTION,
      key: DIRECTORY_LIMITS_KEY,
      userId,
      value: record,
      permissionRead: NO_CLIENT_READ,
      permissionWrite: NO_CLIENT_WRITE,
    },
  ]);
}
