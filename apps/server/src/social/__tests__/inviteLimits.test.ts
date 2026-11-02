/**
 * Invite limits, pure part: the per-sender fixed window, the per-(friend, table)
 * dedupe and how an untrusted stored `social/invite_limits` value is read.
 */
import { describe, expect, it } from 'vitest';
import { INVITE_LIMIT, INVITE_TTL_MS, INVITE_WINDOW_MS, type InviteLimitsRecord } from '@chkobba/protocol';
import {
  checkWindow,
  isDuplicate,
  parseInviteLimits,
  pendingKey,
  pruneInvites,
  recordSend,
} from '../inviteLimits';

const T0 = 1_700_000_000_000;
const CODE = 'ABCD23';
const EMPTY: InviteLimitsRecord = { windowStart: 0, sent: 0, pending: {} };

/** Sends `count` invites to distinct friends at `now`, like the RPC would after its checks pass. */
function sendMany(record: InviteLimitsRecord, count: number, now: number): InviteLimitsRecord {
  let next = record;
  for (let i = 0; i < count; i++) next = recordSend(next, `friend-${i}`, CODE, now);
  return next;
}

describe('pendingKey', () => {
  it('should join the friend id and room code with a colon', () => {
    expect(pendingKey('u-sami', CODE)).toBe('u-sami:ABCD23');
  });
});

describe('checkWindow', () => {
  it('should allow the 20th invite and limit the 21st', () => {
    // Arrange
    const after19 = sendMany(EMPTY, INVITE_LIMIT - 1, T0);
    const after20 = recordSend(after19, 'friend-last', CODE, T0);

    // Act / Assert
    expect(checkWindow(after19, T0)).toEqual({ ok: true });
    expect(after20.sent).toBe(INVITE_LIMIT);
    expect(checkWindow(after20, T0 + 1)).toEqual({ ok: false, reason: 'invite_rate_limited' });
  });

  it('should still limit one millisecond before the window ends', () => {
    const full = sendMany(EMPTY, INVITE_LIMIT, T0);

    expect(checkWindow(full, T0 + INVITE_WINDOW_MS - 1)).toEqual({ ok: false, reason: 'invite_rate_limited' });
  });

  it('should allow again once the window has run its full length', () => {
    const full = sendMany(EMPTY, INVITE_LIMIT, T0);

    expect(checkWindow(full, T0 + INVITE_WINDOW_MS)).toEqual({ ok: true });
  });
});

describe('recordSend', () => {
  it('should start the window on the first send and record the pending invite', () => {
    const next = recordSend(EMPTY, 'u-sami', CODE, T0);

    expect(next.windowStart).toBe(T0);
    expect(next.sent).toBe(1);
    expect(next.pending).toEqual({ 'u-sami:ABCD23': T0 });
  });

  it('should keep the window start and count up within the window', () => {
    const first = recordSend(EMPTY, 'u-sami', CODE, T0);

    const second = recordSend(first, 'u-ines', CODE, T0 + 1000);

    expect(second.windowStart).toBe(T0);
    expect(second.sent).toBe(2);
  });

  it('should reset the window when it has expired', () => {
    // Arrange
    const full = sendMany(EMPTY, INVITE_LIMIT, T0);
    const later = T0 + INVITE_WINDOW_MS;

    // Act
    const next = recordSend(full, 'u-sami', 'WXYZ45', later);

    // Assert
    expect(next.windowStart).toBe(later);
    expect(next.sent).toBe(1);
    expect(checkWindow(next, later)).toEqual({ ok: true });
  });

  it('should prune expired invites when recording a new one', () => {
    const old = recordSend(EMPTY, 'u-sami', CODE, T0);

    const next = recordSend(old, 'u-ines', CODE, T0 + INVITE_TTL_MS);

    expect(next.pending).toEqual({ 'u-ines:ABCD23': T0 + INVITE_TTL_MS });
  });

  it('should not mutate the input record', () => {
    const first = recordSend(EMPTY, 'u-sami', CODE, T0);
    const snapshot = { ...first, pending: { ...first.pending } };

    recordSend(first, 'u-ines', CODE, T0 + 1);

    expect(first).toEqual(snapshot);
  });
});

describe('pruneInvites', () => {
  it('should keep an invite one millisecond before its TTL', () => {
    const record = recordSend(EMPTY, 'u-sami', CODE, T0);

    expect(pruneInvites(record, T0 + INVITE_TTL_MS - 1).pending).toEqual({ 'u-sami:ABCD23': T0 });
  });

  it('should drop an invite at exactly its TTL', () => {
    const record = recordSend(EMPTY, 'u-sami', CODE, T0);

    expect(pruneInvites(record, T0 + INVITE_TTL_MS).pending).toEqual({});
  });

  it('should leave the window untouched', () => {
    const record = sendMany(EMPTY, 3, T0);

    const pruned = pruneInvites(record, T0 + INVITE_TTL_MS);

    expect(pruned.windowStart).toBe(T0);
    expect(pruned.sent).toBe(3);
  });
});

describe('isDuplicate', () => {
  it('should report a pending invite for the same friend and table', () => {
    const record = recordSend(EMPTY, 'u-sami', CODE, T0);

    expect(isDuplicate(record, 'u-sami', CODE, T0 + 1)).toBe(true);
  });

  it('should not report another friend or another table', () => {
    const record = recordSend(EMPTY, 'u-sami', CODE, T0);

    expect(isDuplicate(record, 'u-ines', CODE, T0 + 1)).toBe(false);
    expect(isDuplicate(record, 'u-sami', 'WXYZ45', T0 + 1)).toBe(false);
  });

  it('should stop reporting once the invite reaches its TTL', () => {
    const record = recordSend(EMPTY, 'u-sami', CODE, T0);

    expect(isDuplicate(record, 'u-sami', CODE, T0 + INVITE_TTL_MS - 1)).toBe(true);
    expect(isDuplicate(record, 'u-sami', CODE, T0 + INVITE_TTL_MS)).toBe(false);
  });

  it('should not count a duplicate toward the limit when callers check it first', () => {
    // Arrange: the RPC flow is isDuplicate, then checkWindow, then recordSend
    let record = sendMany(EMPTY, INVITE_LIMIT - 1, T0);
    const repeats = ['friend-0', 'friend-1', 'friend-2'];

    // Act
    for (const friend of repeats) {
      if (!isDuplicate(record, friend, CODE, T0 + 1)) record = recordSend(record, friend, CODE, T0 + 1);
    }

    // Assert: the repeats were no-ops, so one more fresh invite still fits
    expect(record.sent).toBe(INVITE_LIMIT - 1);
    expect(checkWindow(record, T0 + 1)).toEqual({ ok: true });
  });

  it('should not extend the pending invite or the window when a repeat is skipped', () => {
    // Arrange: the RPC flow is isDuplicate, then recordSend only when it is not a duplicate
    const first = recordSend(EMPTY, 'u-sami', CODE, T0);
    const repeatedAt = T0 + INVITE_TTL_MS / 2;
    const duplicate = isDuplicate(first, 'u-sami', CODE, repeatedAt);

    // Act: skipping the duplicate leaves the record exactly as it was
    const after = duplicate ? first : recordSend(first, 'u-sami', CODE, repeatedAt);

    // Assert: the invite still expires at T0 + INVITE_TTL_MS, not half a TTL later
    expect({
      duplicate,
      after,
      stillDuplicateBeforeTtl: isDuplicate(after, 'u-sami', CODE, T0 + INVITE_TTL_MS - 1),
      duplicateAfterTtl: isDuplicate(after, 'u-sami', CODE, T0 + INVITE_TTL_MS),
    }).toEqual({
      duplicate: true,
      after: first,
      stillDuplicateBeforeTtl: true,
      duplicateAfterTtl: false,
    });
  });
});

describe('parseInviteLimits', () => {
  it('should read a well-formed record', () => {
    const stored = { windowStart: T0, sent: 2, pending: { 'u-sami:ABCD23': T0, 'u-ines:ABCD23': T0 + 5 } };

    expect(parseInviteLimits(stored)).toEqual(stored);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'nope'],
    ['a number', 42],
    ['an array', [1, 2]],
    ['an empty object', {}],
    ['a missing sent', { windowStart: T0, pending: {} }],
    ['a string windowStart', { windowStart: 'x', sent: 1, pending: {} }],
    ['a negative sent', { windowStart: T0, sent: -1, pending: {} }],
    ['a fractional sent', { windowStart: T0, sent: 1.5, pending: {} }],
    ['an infinite windowStart', { windowStart: Infinity, sent: 1, pending: {} }],
    ['a NaN sent', { windowStart: T0, sent: NaN, pending: {} }],
  ])('should read %s as empty', (_label, value) => {
    expect(parseInviteLimits(value)).toEqual(EMPTY);
  });

  it('should keep the window when pending is missing or not an object', () => {
    expect(parseInviteLimits({ windowStart: T0, sent: 3 })).toEqual({ windowStart: T0, sent: 3, pending: {} });
    expect(parseInviteLimits({ windowStart: T0, sent: 3, pending: 'x' })).toEqual({
      windowStart: T0,
      sent: 3,
      pending: {},
    });
    expect(parseInviteLimits({ windowStart: T0, sent: 3, pending: [T0] })).toEqual({
      windowStart: T0,
      sent: 3,
      pending: {},
    });
  });

  it('should drop malformed pending entries and keep the rest', () => {
    const stored = {
      windowStart: T0,
      sent: 1,
      pending: { good: T0, str: '1', nul: null, neg: -1, nan: NaN, obj: { at: T0 } },
    };

    expect(parseInviteLimits(stored).pending).toEqual({ good: T0 });
  });

  it('should ignore inherited fields', () => {
    const inherited: object = Object.create({ windowStart: T0, sent: 5, pending: {} });

    expect(parseInviteLimits(inherited)).toEqual(EMPTY);
  });
});

describe('prototype-named ids', () => {
  const IDS = ['__proto__', 'toString', 'constructor', 'hasOwnProperty', 'valueOf'];

  it('should not see a duplicate for a prototype-named key in an empty record', () => {
    for (const id of IDS) {
      expect(isDuplicate(EMPTY, id, CODE, T0)).toBe(false);
      expect(isDuplicate(parseInviteLimits({ windowStart: 0, sent: 0, pending: {} }), id, CODE, T0)).toBe(false);
    }
  });

  it('should record and dedupe prototype-named friend ids and codes as plain data', () => {
    // Arrange
    let record = EMPTY;
    for (const id of IDS) record = recordSend(record, id, id, T0);

    // Assert
    expect(record.sent).toBe(IDS.length);
    for (const id of IDS) {
      expect(isDuplicate(record, id, id, T0 + 1)).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(record.pending, pendingKey(id, id))).toBe(true);
    }
    expect(Object.keys(record.pending)).toHaveLength(IDS.length);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });

  it('should treat a bare __proto__ key as data when parsing and pruning', () => {
    // Arrange: JSON.parse makes "__proto__" an own data property, as a storage read would
    const stored: unknown = JSON.parse(
      `{"windowStart":${T0},"sent":1,"pending":{"__proto__":${T0},"toString":${T0}}}`,
    );

    // Act
    const parsed = parseInviteLimits(stored);
    const pruned = pruneInvites(parsed, T0 + 1);

    // Assert
    expect(Object.keys(parsed.pending).sort()).toEqual(['__proto__', 'toString']);
    expect(Object.keys(pruned.pending).sort()).toEqual(['__proto__', 'toString']);
    expect(Object.getPrototypeOf(pruned.pending)).toBeNull();
    expect(isDuplicate(pruned, '__proto__', '', T0 + 1)).toBe(false); // key is "__proto__:" not "__proto__"
  });

  it('should drop a stored __proto__ entry whose value is not a time', () => {
    const stored: unknown = JSON.parse(`{"windowStart":${T0},"sent":1,"pending":{"__proto__":{"x":1}}}`);

    const parsed = parseInviteLimits(stored);

    expect(Object.keys(parsed.pending)).toEqual([]);
    expect((parsed.pending as { x?: unknown }).x).toBeUndefined();
  });

  it('should survive a JSON round trip with prototype-named keys', () => {
    const record = recordSend(EMPTY, '__proto__', 'toString', T0);

    const reread = parseInviteLimits(JSON.parse(JSON.stringify(record)));

    expect(isDuplicate(reread, '__proto__', 'toString', T0 + 1)).toBe(true);
  });
});
