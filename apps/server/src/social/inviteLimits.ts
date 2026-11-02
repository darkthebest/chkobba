import {
  INVITE_LIMIT,
  INVITE_TTL_MS,
  INVITE_WINDOW_MS,
  type InviteLimitsRecord,
} from '@chkobba/protocol';

/**
 * Invite limits (Friends v1, plan Phase 6): the pure rules behind the
 * server-owned `social/invite_limits` record of one sender. No Nakama calls
 * here; `now` is always passed in.
 *
 * - A fixed window: at most `INVITE_LIMIT` invites per `INVITE_WINDOW_MS`,
 *   counted from the first send after the previous window expired.
 * - A dedupe: one pending invite per (friend, room code) for `INVITE_TTL_MS`.
 *
 * Order for callers: check `isDuplicate` first and answer `{ sent: false }`
 * without calling `checkWindow` or `recordSend`, so a repeat never counts
 * toward the limit. Otherwise `checkWindow`, then send, then `recordSend`.
 *
 * `pending` keys hold user-controlled text (a friend id and a room code), so
 * every `pending` object built here has a null prototype and every lookup is an
 * own-property check: a key like `__proto__` or `toString` is plain data.
 */

type PendingMap = { [friendAndCode: string]: number };

export type InviteWindowCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'invite_rate_limited' };

const hasOwn = Object.prototype.hasOwnProperty;

function emptyPending(): PendingMap {
  const pending: PendingMap = Object.create(null);
  return pending;
}

function emptyRecord(): InviteLimitsRecord {
  return { windowStart: 0, sent: 0, pending: emptyPending() };
}

/** Key of one pending invite: `${friendUserId}:${roomCode}`. */
export function pendingKey(friendUserId: string, roomCode: string): string {
  return friendUserId + ':' + roomCode;
}

/**
 * Untrusted stored value → record. Anything that is not an object with a
 * finite, non-negative `windowStart` and a non-negative integer `sent` reads
 * as empty. A missing or non-object `pending` reads as no pending invites;
 * entries whose value is not a finite number are dropped.
 */
export function parseInviteLimits(value: unknown): InviteLimitsRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyRecord();
  if (!hasOwn.call(value, 'windowStart') || !hasOwn.call(value, 'sent')) return emptyRecord();
  const windowStart: unknown = (value as { windowStart: unknown }).windowStart;
  const sent: unknown = (value as { sent: unknown }).sent;
  if (!isTime(windowStart) || !isCount(sent)) return emptyRecord();
  const rawPending: unknown = hasOwn.call(value, 'pending') ? (value as { pending: unknown }).pending : undefined;
  return { windowStart, sent, pending: parsePending(rawPending) };
}

function parsePending(value: unknown): PendingMap {
  const pending = emptyPending();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return pending;
  const source = value as { [key: string]: unknown };
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === undefined || key.length === 0) continue;
    const sentAt = source[key];
    if (isTime(sentAt)) pending[key] = sentAt;
  }
  return pending;
}

/** Drops pending invites whose age is `INVITE_TTL_MS` or more. */
export function pruneInvites(record: InviteLimitsRecord, now: number): InviteLimitsRecord {
  return { windowStart: record.windowStart, sent: record.sent, pending: livePending(record.pending, now) };
}

/** A fresh null-prototype copy of the pending invites still live at `now`. */
function livePending(source: InviteLimitsRecord['pending'], now: number): PendingMap {
  const pending = emptyPending();
  const keys = Object.keys(source);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key === undefined) continue;
    const sentAt = ownValue(source, key);
    if (sentAt !== undefined && isLive(sentAt, now)) pending[key] = sentAt;
  }
  return pending;
}

/** True when an invite to this friend for this room was sent less than `INVITE_TTL_MS` ago. */
export function isDuplicate(
  record: InviteLimitsRecord,
  friendUserId: string,
  roomCode: string,
  now: number,
): boolean {
  const sentAt = ownValue(record.pending, pendingKey(friendUserId, roomCode));
  return sentAt !== undefined && isLive(sentAt, now);
}

/**
 * Whether one more invite fits the fixed window. A window that started
 * `INVITE_WINDOW_MS` or more ago has expired and counts as empty.
 */
export function checkWindow(record: InviteLimitsRecord, now: number): InviteWindowCheck {
  if (windowExpired(record, now)) return { ok: true };
  return record.sent >= INVITE_LIMIT ? { ok: false, reason: 'invite_rate_limited' } : { ok: true };
}

/**
 * The record after a successful send: starts a new window at `now` if the
 * current one expired, counts the send, adds the pending invite and prunes
 * expired ones. Does not check the limit or the dedupe; see the module doc.
 */
export function recordSend(
  record: InviteLimitsRecord,
  friendUserId: string,
  roomCode: string,
  now: number,
): InviteLimitsRecord {
  const expired = windowExpired(record, now);
  const pending = livePending(record.pending, now);
  pending[pendingKey(friendUserId, roomCode)] = now;
  return {
    windowStart: expired ? now : record.windowStart,
    sent: expired ? 1 : record.sent + 1,
    pending,
  };
}

function windowExpired(record: InviteLimitsRecord, now: number): boolean {
  return now - record.windowStart >= INVITE_WINDOW_MS;
}

function isLive(sentAt: number, now: number): boolean {
  return now - sentAt < INVITE_TTL_MS;
}

function ownValue(pending: InviteLimitsRecord['pending'], key: string): number | undefined {
  return hasOwn.call(pending, key) ? pending[key] : undefined;
}

function isTime(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value >= 0;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && isFinite(value) && value >= 0 && Math.floor(value) === value;
}
