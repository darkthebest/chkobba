/**
 * `invite_to_table` over the fake Nakama boundary: authentication and payload
 * checks, the mutual-friend rule, room resolution through the is_member
 * signal, dedupe, the fixed window and the one persistent notification.
 * Time is faked so the limits are deterministic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FRIEND_STATE,
  INVITE_LIMIT,
  INVITE_LIMITS_KEY,
  INVITE_RPC_ERROR_CODES,
  INVITE_TTL_MS,
  NOTIFICATION_CODES,
  ROOM_COLLECTION,
  SOCIAL_COLLECTION,
} from '@chkobba/protocol';
import type { InviteLimitsRecord, TableInviteContent } from '@chkobba/protocol';
import {
  createContext,
  createFakeLogger,
  createFakeNk,
  createUnauthenticatedContext,
} from '../../__tests__/fakes';
import type { SentNotification } from '../../__tests__/fakes';
import { SYSTEM_USER_ID } from '../../rpc/roomStore';
import { rpcInviteToTable } from '../inviteToTable';

const T0 = 1_700_000_000_000;
const CALLER = 'u-caller';
const TARGET = 'u-target';
const CODE = 'K7M2QX';
const MATCH_ID = 'match-private';

/** gRPC status codes used by the RPC; nkruntime.Codes is types-only under Vitest. */
const INVALID_ARGUMENT = 3;
const NOT_FOUND = 5;
const PERMISSION_DENIED = 7;
const RESOURCE_EXHAUSTED = 8;
const FAILED_PRECONDITION = 9;
const UNAUTHENTICATED = 16;

let ctx: nkruntime.Context;
let logger: ReturnType<typeof createFakeLogger>;
let nk: ReturnType<typeof createFakeNk>;

function resetFakes(): void {
  ctx = createContext(CALLER);
  logger = createFakeLogger();
  nk = createFakeNk();
}

function at(ms: number): void {
  vi.setSystemTime(ms);
}

/** Runs `fn` and returns what it threw (undefined when it returned). */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** Seeds a live private match behind CODE, a friend edge CALLER -> TARGET and an accepting signal. */
function seedRoomAndFriend(): void {
  nk.fake.seedAccount(CALLER, { username: 'sami', displayName: 'Sami' });
  nk.fake.seedFriends(CALLER, [TARGET]);
  nk.fake.useMemoryStorage();
  nk.fake.seedStorage(ROOM_COLLECTION, CODE, SYSTEM_USER_ID, { matchId: MATCH_ID, createdAt: T0 });
  nk.fake.addMatch(MATCH_ID, JSON.stringify({ private: true }));
  nk.fake.setMatchSignalHandler(() => 'yes');
}

/** The RPC call with a well-formed payload unless overridden. */
function invite(target: string = TARGET, code: string = CODE): string {
  return rpcInviteToTable(ctx, logger, nk, JSON.stringify({ userId: target, code }));
}

function limitsRecord(): InviteLimitsRecord {
  return nk.fake.storedValue(SOCIAL_COLLECTION, INVITE_LIMITS_KEY, CALLER) as InviteLimitsRecord;
}

function onlyNotification(): SentNotification {
  const notification = nk.fake.notifications[0];
  if (notification === undefined) throw new Error('no notification was sent');
  return notification;
}

function sentContent(): TableInviteContent {
  return onlyNotification().content as unknown as TableInviteContent;
}

describe('rpcInviteToTable', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    at(T0);
    resetFakes();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('authentication and payload', () => {
    it('should throw code 16 with a non-documented message when the caller is not authenticated', () => {
      // Arrange
      ctx = createUnauthenticatedContext();

      // Act
      const error = thrownBy(() => invite()) as { code: number; message: string };

      // Assert
      expect({
        code: error.code,
        documented: (INVITE_RPC_ERROR_CODES as readonly string[]).includes(error.message),
        messageIsText: typeof error.message === 'string',
      }).toEqual({ code: UNAUTHENTICATED, documented: false, messageIsText: true });
    });

    it.each([
      { scenario: 'invalid JSON', payload: '{not json' },
      { scenario: 'an empty body', payload: '' },
      { scenario: 'a JSON array', payload: '[]' },
      { scenario: 'a JSON string', payload: '"text"' },
      { scenario: 'a JSON null', payload: 'null' },
      { scenario: 'a JSON number', payload: '42' },
      { scenario: 'no userId nor code', payload: '{}' },
      { scenario: 'no userId', payload: JSON.stringify({ code: CODE }) },
      { scenario: 'no code', payload: JSON.stringify({ userId: TARGET }) },
      { scenario: 'an empty userId', payload: JSON.stringify({ userId: '', code: CODE }) },
      { scenario: 'a non-string userId', payload: JSON.stringify({ userId: 42, code: CODE }) },
      { scenario: 'a non-string code', payload: JSON.stringify({ userId: TARGET, code: 42 }) },
      { scenario: 'an empty code', payload: JSON.stringify({ userId: TARGET, code: '' }) },
      { scenario: 'a code that is too short', payload: JSON.stringify({ userId: TARGET, code: 'ABC' }) },
      { scenario: 'a code with an invalid symbol', payload: JSON.stringify({ userId: TARGET, code: 'ABCDE1' }) },
      { scenario: 'a userId over 128 characters', payload: JSON.stringify({ userId: 'u'.repeat(129), code: CODE }) },
    ])('should reject $scenario with invite_bad_request', ({ payload }) => {
      // Act
      const error = thrownBy(() => rpcInviteToTable(ctx, logger, nk, payload));

      // Assert
      expect(error).toEqual({ message: 'invite_bad_request', code: INVALID_ARGUMENT });
    });

    it('should normalize a lowercase, dashed code and send the canonical form', () => {
      // Arrange
      seedRoomAndFriend();

      // Act
      const response = invite(TARGET, 'k7m-2qx');

      // Assert
      expect({ sent: JSON.parse(response).sent, content: sentContent() }).toEqual({
        sent: true,
        content: { v: 1, code: CODE, fromName: 'Sami' },
      });
    });
  });

  describe('friendship', () => {
    it('should reject a target who is not a friend with invite_not_friend', () => {
      // Act
      const error = thrownBy(() => invite());

      // Assert
      expect(error).toEqual({ message: 'invite_not_friend', code: FAILED_PRECONDITION });
    });

    it('should not treat a pending outgoing request as a friend', () => {
      // Arrange
      nk.fake.seedFriends(CALLER, [TARGET], FRIEND_STATE.REQUEST_SENT);

      // Act
      const error = thrownBy(() => invite());

      // Assert
      expect(error).toEqual({ message: 'invite_not_friend', code: FAILED_PRECONDITION });
    });
  });

  describe('room resolution', () => {
    it('should reject an unknown code with invite_room_not_found', () => {
      // Arrange
      nk.fake.seedFriends(CALLER, [TARGET]);

      // Act
      const error = thrownBy(() => invite());

      // Assert
      expect(error).toEqual({ message: 'invite_room_not_found', code: NOT_FOUND });
    });

    it('should reject a code whose match is gone with invite_room_not_found', () => {
      // Arrange
      seedRoomAndFriend();
      nk.fake.killMatch(MATCH_ID);

      // Act
      const error = thrownBy(() => invite());

      // Assert
      expect(error).toEqual({ message: 'invite_room_not_found', code: NOT_FOUND });
    });

    it('should reject with invite_room_not_found when the match signal throws', () => {
      // Arrange
      seedRoomAndFriend();
      nk.fake.setMatchSignalHandler(null);

      // Act
      const error = thrownBy(() => invite());

      // Assert
      expect(error).toEqual({ message: 'invite_room_not_found', code: NOT_FOUND });
    });
  });

  describe('membership', () => {
    it.each([
      { scenario: 'no', answer: 'no' },
      { scenario: 'an empty string', answer: '' },
      { scenario: 'garbage', answer: 'garbage' },
      { scenario: 'undefined', answer: undefined },
    ])('should reject with invite_not_member when the signal answers $scenario', ({ answer }) => {
      // Arrange
      seedRoomAndFriend();
      nk.fake.setMatchSignalHandler(() => answer as string);

      // Act
      const error = thrownBy(() => invite());

      // Assert
      expect(error).toEqual({ message: 'invite_not_member', code: PERMISSION_DENIED });
    });

    it("should ask the table about the caller's own user id", () => {
      // Arrange
      seedRoomAndFriend();

      // Act
      invite();

      // Assert
      expect(nk.matchSignal.mock.calls[0]).toEqual([MATCH_ID, '{"type":"is_member","userId":"u-caller"}']);
    });
  });

  describe('success', () => {
    it('should answer { sent: true } and send exactly one notification to the target', () => {
      // Arrange
      seedRoomAndFriend();

      // Act
      const response = invite();
      const notification = onlyNotification();

      // Assert
      expect({
        response: JSON.parse(response),
        count: nk.fake.notifications.length,
        userId: notification.userId,
        subject: notification.subject,
        code: notification.code,
        senderId: notification.senderId,
        persistent: notification.persistent,
      }).toEqual({
        response: { sent: true },
        count: 1,
        userId: TARGET,
        subject: 'table_invite',
        code: NOTIFICATION_CODES.TABLE_INVITE,
        senderId: CALLER,
        persistent: true,
      });
    });

    it('should send a valid TABLE_INVITE content with the code and the sender display name', () => {
      // Arrange
      seedRoomAndFriend();

      // Act
      invite();

      // Assert
      expect(sentContent()).toEqual({ v: 1, code: CODE, fromName: 'Sami' });
    });

    it('should fall back to the username when the display-name lookup fails', () => {
      // Arrange
      seedRoomAndFriend();
      ctx = { ...createContext(CALLER), username: 'sami' };
      nk.fake.failUsersGetId();

      // Act
      invite();

      // Assert
      expect(sentContent().fromName).toBe('sami');
    });

    it("should fall back to 'Player' when both the account and the username are empty", () => {
      // Arrange
      seedRoomAndFriend();
      nk.fake.failUsersGetId();

      // Act
      invite();

      // Assert
      expect(sentContent().fromName).toBe('Player');
    });
  });

  describe('dedupe', () => {
    it('should answer { sent: false }, send nothing and keep the window on a repeat within the TTL', () => {
      // Arrange
      seedRoomAndFriend();
      invite();

      // Act
      at(T0 + INVITE_TTL_MS - 1);
      const response = invite();

      // Assert
      expect({
        response: JSON.parse(response),
        notifications: nk.fake.notifications.length,
        sent: limitsRecord().sent,
      }).toEqual({ response: { sent: false }, notifications: 1, sent: 1 });
    });

    it('should send again once the TTL has elapsed since the original invite', () => {
      // Arrange
      seedRoomAndFriend();
      invite();
      at(T0 + INVITE_TTL_MS - 1);
      invite();

      // Act
      at(T0 + INVITE_TTL_MS);
      const response = invite();

      // Assert
      expect({
        response: JSON.parse(response),
        notifications: nk.fake.notifications.length,
        windowStart: limitsRecord().windowStart,
      }).toEqual({ response: { sent: true }, notifications: 2, windowStart: T0 + INVITE_TTL_MS });
    });
  });

  describe('window', () => {
    it('should reject the 21st distinct invite inside the window with invite_rate_limited', () => {
      // Arrange
      seedRoomAndFriend();
      const targets = nk.fake.seedManyFriends(CALLER, INVITE_LIMIT + 1);
      for (let i = 0; i < INVITE_LIMIT; i++) invite(targets[i] as string);

      // Act
      const error = thrownBy(() => invite(targets[INVITE_LIMIT] as string));

      // Assert
      expect({ error, notifications: nk.fake.notifications.length }).toEqual({
        error: { message: 'invite_rate_limited', code: RESOURCE_EXHAUSTED },
        notifications: INVITE_LIMIT,
      });
    });
  });

  describe('the limits record', () => {
    it('should be written server-only with no client read or write', () => {
      // Arrange
      seedRoomAndFriend();

      // Act
      invite();

      // Assert
      expect(nk.storageWrite.mock.calls[0]?.[0]?.[0]).toMatchObject({
        collection: SOCIAL_COLLECTION,
        key: INVITE_LIMITS_KEY,
        userId: CALLER,
        permissionRead: 0,
        permissionWrite: 0,
      });
    });

    it('should still answer { sent: true } when the limits write fails', () => {
      // Arrange
      seedRoomAndFriend();
      nk.fake.failStorageWrites();

      // Act
      const response = invite();

      // Assert
      expect({
        response: JSON.parse(response),
        notifications: nk.fake.notifications.length,
        warned: logger.warn.mock.calls.length > 0,
      }).toEqual({ response: { sent: true }, notifications: 1, warned: true });
    });
  });

  describe('the error contract', () => {
    it('should throw a numeric code and a documented message for every rejection', () => {
      // Arrange: one scenario per rejection branch, each with fresh fakes
      const scenarios: Array<{ setup: () => void; run: () => unknown }> = [
        {
          setup: () => {
            ctx = createUnauthenticatedContext();
          },
          run: () => rpcInviteToTable(ctx, logger, nk, '{}'),
        },
        { setup: () => undefined, run: () => rpcInviteToTable(ctx, logger, nk, '{bad') },
        { setup: () => undefined, run: () => invite() },
        { setup: () => nk.fake.seedFriends(CALLER, [TARGET]), run: () => invite() },
        {
          setup: () => {
            seedRoomAndFriend();
            nk.fake.setMatchSignalHandler(() => 'no');
          },
          run: () => invite(),
        },
        {
          setup: () => {
            seedRoomAndFriend();
            nk.fake.seedStorage(SOCIAL_COLLECTION, INVITE_LIMITS_KEY, CALLER, {
              windowStart: T0,
              sent: INVITE_LIMIT,
              pending: {},
            });
          },
          run: () => invite(),
        },
      ];
      const thrown: unknown[] = [];

      // Act
      for (const scenario of scenarios) {
        resetFakes();
        scenario.setup();
        thrown.push(thrownBy(scenario.run));
      }

      // Assert: the unauthenticated branch is the documented exception
      const checked = thrown.map((error) => {
        const coded = error as { code?: unknown; message?: unknown };
        return {
          numeric: typeof coded.code === 'number',
          documented:
            typeof coded.message === 'string' && (INVITE_RPC_ERROR_CODES as readonly string[]).includes(coded.message),
        };
      });
      expect({ unauthenticated: checked[0], rest: checked.slice(1) }).toEqual({
        unauthenticated: { numeric: true, documented: false },
        rest: checked.slice(1).map(() => ({ numeric: true, documented: true })),
      });
    });
  });
});
