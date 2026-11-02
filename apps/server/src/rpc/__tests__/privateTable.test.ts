/**
 * Private-table RPCs (`create_private_table`, `join_by_code`) against the nk
 * fakes with the in-memory, version-checked storage. Codes come from the
 * queued `secureRandomBytes`: byte & 31 indexes ROOM_CODE_ALPHABET, so six
 * zero bytes give 'AAAAAA' and six ones give 'BBBBBB'. `Date.now` is spied.
 * Errors are asserted on the thrown `{ message, code }` objects.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ROOM_COLLECTION,
  ROOM_LIMITS_KEY,
  isRoomCode,
  type RoomCodeRecord,
  type RoomLimitsRecord,
  type TableLabel,
} from '@chkobba/protocol';
import {
  CREATE_ATTEMPTS,
  PLACEHOLDER_GRACE_MS,
  codeStatus,
  isLivePrivateMatch,
  rpcCreatePrivateTable,
  rpcJoinByCode,
} from '../privateTable';
import { SYSTEM_USER_ID } from '../roomStore';
import { CREATE_LIMIT, LIMIT_WINDOW_MS, LOOKUP_FAILURE_LIMIT } from '../roomLimits';
import { TABLE_MATCH_NAME } from '../../match/tableMatch';
import { createContext, createFakeLogger, createFakeNk, createUnauthenticatedContext } from '../../__tests__/fakes';

const NOW = 1_700_000_000_000;
const ZEROS = [0, 0, 0, 0, 0, 0]; // 'AAAAAA'
const ONES = [1, 1, 1, 1, 1, 1]; // 'BBBBBB'

const PRIVATE_LABEL = JSON.stringify({ open: false, mode: '2v2', seatsFree: 4, private: true } satisfies TableLabel);
const PUBLIC_LABEL = JSON.stringify({ open: true, mode: '2v2', seatsFree: 4, private: false } satisfies TableLabel);

/** Runs `call` and returns what it threw (undefined if it returned). */
function thrownBy(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('private table RPCs', () => {
  let logger: ReturnType<typeof createFakeLogger>;
  let nk: ReturnType<typeof createFakeNk>;
  let now: number;

  function seedCode(code: string, record: RoomCodeRecord): string {
    return nk.fake.seedStorage(ROOM_COLLECTION, code, SYSTEM_USER_ID, record);
  }

  function storedCode(code: string): nkruntime.StorageObject | undefined {
    return nk.fake.storedObject(ROOM_COLLECTION, code, SYSTEM_USER_ID);
  }

  function limitsOf(userId: string): RoomLimitsRecord | undefined {
    return nk.fake.storedValue(ROOM_COLLECTION, ROOM_LIMITS_KEY, userId) as RoomLimitsRecord | undefined;
  }

  function create(userId: string = 'host'): { matchId: string; code: string } {
    return JSON.parse(rpcCreatePrivateTable(createContext(userId), logger, nk, '{}')) as { matchId: string; code: string };
  }

  function lookup(userId: string, payload: string): { matchId: string } {
    return JSON.parse(rpcJoinByCode(createContext(userId), logger, nk, payload)) as { matchId: string };
  }

  function codePayload(code: unknown): string {
    return JSON.stringify({ code });
  }

  /** A live private table on `code`, mapped to `matchId`. */
  function liveTable(code: string, matchId: string): void {
    nk.fake.addMatch(matchId, PRIVATE_LABEL);
    seedCode(code, { matchId, createdAt: now - 1000 });
  }

  beforeEach(() => {
    logger = createFakeLogger();
    nk = createFakeNk();
    nk.fake.useMemoryStorage();
    nk.fake.useSequentialMatchIds('pm-');
    now = NOW;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('rpcCreatePrivateTable', () => {
    it('should return the created match id and a well-formed code', () => {
      // Arrange
      nk.fake.pushRandomBytes([0, 1, 2, 3, 4, 5]);

      // Act
      const response = create();

      // Assert
      expect({ response, valid: isRoomCode(response.code) }).toEqual({
        response: { matchId: 'pm-1', code: 'ABCDEF' },
        valid: true,
      });
    });

    it('should create the table match with string private params and the code', () => {
      // Arrange
      nk.fake.pushRandomBytes(ZEROS);

      // Act
      create();

      // Assert
      expect(nk.fake.createdMatches).toEqual([
        { matchId: 'pm-1', module: TABLE_MATCH_NAME, params: { private: 'true', code: 'AAAAAA' } },
      ]);
    });

    it('should point the code record at the new match with server-only permissions', () => {
      // Arrange
      nk.fake.pushRandomBytes(ZEROS);

      // Act
      create();

      // Assert
      const object = storedCode('AAAAAA');
      expect({ value: object?.value, read: object?.permissionRead, write: object?.permissionWrite }).toEqual({
        value: { matchId: 'pm-1', createdAt: NOW },
        read: 0,
        write: 0,
      });
    });

    it('should let another user resolve the created code to the same match', () => {
      // Arrange
      const created = create('host');
      nk.fake.addMatch(created.matchId, PRIVATE_LABEL);

      // Act
      const found = lookup('guest', codePayload(created.code));

      // Assert
      expect(found).toEqual({ matchId: created.matchId });
    });

    it('should never log the code', () => {
      // Arrange
      nk.fake.pushRandomBytes(ZEROS);

      // Act
      create();

      // Assert
      const logged = JSON.stringify([logger.debug.mock.calls, logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
      expect(logged).not.toContain('AAAAAA');
    });

    it('should retry with a new code when the first collides with a live table', () => {
      // Arrange
      liveTable('AAAAAA', 'live-match');
      nk.fake.pushRandomBytes(ZEROS, ONES);

      // Act
      const response = create();

      // Assert
      expect({ code: response.code, kept: storedCode('AAAAAA')?.value }).toEqual({
        code: 'BBBBBB',
        kept: { matchId: 'live-match', createdAt: NOW - 1000 },
      });
    });

    it('should retry with a new code when the first is held by a pending placeholder', () => {
      // Arrange
      seedCode('AAAAAA', { matchId: '', createdAt: NOW - PLACEHOLDER_GRACE_MS + 1 });
      nk.fake.pushRandomBytes(ZEROS, ONES);

      // Act
      const response = create();

      // Assert
      expect({ code: response.code, kept: storedCode('AAAAAA')?.value }).toEqual({
        code: 'BBBBBB',
        kept: { matchId: '', createdAt: NOW - PLACEHOLDER_GRACE_MS + 1 },
      });
    });

    it.each([
      { scenario: 'its match has ended', record: { matchId: 'gone', createdAt: NOW - 5000 } },
      { scenario: 'it is a placeholder exactly at the grace period', record: { matchId: '', createdAt: NOW - PLACEHOLDER_GRACE_MS } },
      { scenario: 'it is a placeholder older than the grace period', record: { matchId: '', createdAt: NOW - 10 * PLACEHOLDER_GRACE_MS } },
    ])('should overwrite a stale record when $scenario', ({ record }) => {
      // Arrange
      seedCode('AAAAAA', record);
      nk.fake.pushRandomBytes(ZEROS, ONES);

      // Act
      const response = create();

      // Assert
      expect({ response, stored: storedCode('AAAAAA')?.value }).toEqual({
        response: { matchId: 'pm-1', code: 'AAAAAA' },
        stored: { matchId: 'pm-1', createdAt: NOW },
      });
    });

    it('should overwrite a record whose match is no longer a private table', () => {
      // Arrange
      nk.fake.addMatch('public-match', PUBLIC_LABEL);
      seedCode('AAAAAA', { matchId: 'public-match', createdAt: NOW - 1000 });
      nk.fake.pushRandomBytes(ZEROS);

      // Act
      const response = create();

      // Assert
      expect(response.code).toBe('AAAAAA');
    });

    it('should fail with internal when every attempt collides', () => {
      // Arrange
      liveTable('AAAAAA', 'live-match');
      nk.fake.pushRandomBytes(...Array.from({ length: CREATE_ATTEMPTS }, () => ZEROS));

      // Act
      const error = thrownBy(() => create());

      // Assert
      expect(error).toEqual({ message: 'internal', code: 13 });
    });

    it('should not create a match when every attempt collides', () => {
      // Arrange
      liveTable('AAAAAA', 'live-match');
      nk.fake.pushRandomBytes(...Array.from({ length: CREATE_ATTEMPTS }, () => ZEROS));

      // Act
      thrownBy(() => create());

      // Assert
      expect(nk.matchCreate).not.toHaveBeenCalled();
    });

    it('should succeed on the last attempt when only the first attempts collide', () => {
      // Arrange
      liveTable('AAAAAA', 'live-match');
      const collisions = Array.from({ length: CREATE_ATTEMPTS - 1 }, () => ZEROS);
      nk.fake.pushRandomBytes(...collisions, ONES);

      // Act
      const response = create();

      // Assert
      expect(response.code).toBe('BBBBBB');
    });

    it(`should allow ${CREATE_LIMIT} creates in a window`, () => {
      // Arrange
      const codes: string[] = [];

      // Act
      for (let i = 0; i < CREATE_LIMIT; i++) codes.push(create().code);

      // Assert
      expect(new Set(codes).size).toBe(CREATE_LIMIT);
    });

    it('should reject the create after the limit with room_rate_limited', () => {
      // Arrange
      for (let i = 0; i < CREATE_LIMIT; i++) create();

      // Act
      const error = thrownBy(() => create());

      // Assert
      expect(error).toEqual({ message: 'room_rate_limited', code: 8 });
    });

    it('should allow creating again once the window has passed', () => {
      // Arrange
      for (let i = 0; i < CREATE_LIMIT; i++) create();
      now = NOW + LIMIT_WINDOW_MS;

      // Act
      const response = create();

      // Assert
      expect(response.matchId).toBe(`pm-${CREATE_LIMIT + 1}`);
    });

    it('should count creates per user', () => {
      // Arrange
      for (let i = 0; i < CREATE_LIMIT; i++) create('host');

      // Act
      const response = create('other');

      // Assert
      expect(isRoomCode(response.code)).toBe(true);
    });

    it('should reject an unauthenticated call with UNAUTHENTICATED', () => {
      // Arrange
      const ctx = createUnauthenticatedContext();

      // Act
      const error = thrownBy(() => rpcCreatePrivateTable(ctx, logger, nk, '{}'));

      // Assert
      expect(error).toMatchObject({ code: 16 });
    });

    it('should neither reserve a code nor create a match when unauthenticated', () => {
      // Arrange
      const ctx = createUnauthenticatedContext();

      // Act
      thrownBy(() => rpcCreatePrivateTable(ctx, logger, nk, '{}'));

      // Assert
      expect(nk.storageWrite.mock.calls.length + nk.matchCreate.mock.calls.length).toBe(0);
    });
  });

  describe('rpcJoinByCode', () => {
    it('should resolve a live code to its match id', () => {
      // Arrange
      liveTable('K7M2QX', 'live-match');

      // Act
      const found = lookup('guest', codePayload('K7M2QX'));

      // Assert
      expect(found).toEqual({ matchId: 'live-match' });
    });

    it.each([
      { scenario: 'lowercase with a dash', input: 'k7m-2qx' },
      { scenario: 'spaces', input: ' K7M 2QX ' },
    ])('should resolve a code typed with $scenario', ({ input }) => {
      // Arrange
      liveTable('K7M2QX', 'live-match');

      // Act
      const found = lookup('guest', codePayload(input));

      // Assert
      expect(found).toEqual({ matchId: 'live-match' });
    });

    it('should not count a successful lookup as a failure', () => {
      // Arrange
      liveTable('K7M2QX', 'live-match');

      // Act
      lookup('guest', codePayload('K7M2QX'));

      // Assert
      expect(limitsOf('guest')).toBeUndefined();
    });

    it('should reject a missing record with room_not_found', () => {
      // Arrange
      const payload = codePayload('K7M2QX');

      // Act
      const error = thrownBy(() => lookup('guest', payload));

      // Assert
      expect(error).toEqual({ message: 'room_not_found', code: 5 });
    });

    it('should count a missing record as a failed lookup', () => {
      // Arrange
      const payload = codePayload('K7M2QX');

      // Act
      thrownBy(() => lookup('guest', payload));

      // Assert
      expect(limitsOf('guest')).toEqual({ lookupWindowStart: NOW, lookupFailures: 1, createWindowStart: 0, creates: 0 });
    });

    it.each([
      {
        scenario: 'its match has ended',
        arrange: (fakeNk: ReturnType<typeof createFakeNk>) => {
          fakeNk.fake.addMatch('m-dead', PRIVATE_LABEL);
          fakeNk.fake.killMatch('m-dead');
        },
      },
      {
        scenario: 'matchGet throws for its match',
        arrange: (fakeNk: ReturnType<typeof createFakeNk>) => {
          fakeNk.fake.addMatch('m-dead', PRIVATE_LABEL);
          fakeNk.fake.failMatchGet('m-dead');
        },
      },
      {
        scenario: 'its match is not a private table',
        arrange: (fakeNk: ReturnType<typeof createFakeNk>) => {
          fakeNk.fake.addMatch('m-dead', PUBLIC_LABEL);
        },
      },
      {
        scenario: 'its match label is not JSON',
        arrange: (fakeNk: ReturnType<typeof createFakeNk>) => {
          fakeNk.fake.addMatch('m-dead', '{not json');
        },
      },
    ])('should reject with room_not_found when $scenario', ({ arrange }) => {
      // Arrange
      arrange(nk);
      seedCode('K7M2QX', { matchId: 'm-dead', createdAt: NOW - 1000 });

      // Act
      const error = thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(error).toEqual({ message: 'room_not_found', code: 5 });
    });

    it.each([
      {
        scenario: 'its match has ended',
        arrange: (fakeNk: ReturnType<typeof createFakeNk>) => {
          fakeNk.fake.addMatch('m-dead', PRIVATE_LABEL);
          fakeNk.fake.killMatch('m-dead');
        },
      },
      {
        scenario: 'matchGet throws for its match',
        arrange: (fakeNk: ReturnType<typeof createFakeNk>) => {
          fakeNk.fake.addMatch('m-dead', PRIVATE_LABEL);
          fakeNk.fake.failMatchGet('m-dead');
        },
      },
      {
        scenario: 'its match is not a private table',
        arrange: (fakeNk: ReturnType<typeof createFakeNk>) => {
          fakeNk.fake.addMatch('m-dead', PUBLIC_LABEL);
        },
      },
    ])('should delete the stale record when $scenario', ({ arrange }) => {
      // Arrange
      arrange(nk);
      seedCode('K7M2QX', { matchId: 'm-dead', createdAt: NOW - 1000 });

      // Act
      thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(storedCode('K7M2QX')).toBeUndefined();
    });

    it('should delete a placeholder older than the grace period', () => {
      // Arrange
      seedCode('K7M2QX', { matchId: '', createdAt: NOW - PLACEHOLDER_GRACE_MS });

      // Act
      thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(storedCode('K7M2QX')).toBeUndefined();
    });

    it('should reject a pending placeholder with room_not_found', () => {
      // Arrange
      seedCode('K7M2QX', { matchId: '', createdAt: NOW - 1000 });

      // Act
      const error = thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(error).toEqual({ message: 'room_not_found', code: 5 });
    });

    it('should not delete a pending placeholder', () => {
      // Arrange
      const version = seedCode('K7M2QX', { matchId: '', createdAt: NOW - 1000 });

      // Act
      thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(storedCode('K7M2QX')?.version).toBe(version);
    });

    it('should count a pending placeholder as a failed lookup', () => {
      // Arrange
      seedCode('K7M2QX', { matchId: '', createdAt: NOW - 1000 });

      // Act
      thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(limitsOf('guest')?.lookupFailures).toBe(1);
    });

    it.each([
      { scenario: 'a five-character code', payload: codePayload('K7M2Q') },
      { scenario: 'a code with 0 and O', payload: codePayload('0OOOOO') },
      { scenario: 'a code with I and 1', payload: codePayload('K7M2I1') },
      { scenario: 'bad JSON', payload: '{not json' },
      { scenario: 'an empty body', payload: '' },
      { scenario: 'JSON null', payload: 'null' },
      { scenario: 'a missing code field', payload: '{}' },
      { scenario: 'a numeric code', payload: codePayload(123456) },
      { scenario: 'an input over 32 characters that would normalize to a valid code', payload: codePayload(`${'-'.repeat(27)}K7M2QX`) },
    ])('should reject $scenario with room_bad_code', ({ payload }) => {
      // Arrange
      liveTable('K7M2QX', 'live-match');

      // Act
      const error = thrownBy(() => lookup('guest', payload));

      // Assert
      expect(error).toEqual({ message: 'room_bad_code', code: 3 });
    });

    it('should accept an input of exactly 32 characters that normalizes to a valid code', () => {
      // Arrange
      liveTable('K7M2QX', 'live-match');
      const input = `${'-'.repeat(26)}K7M2QX`;

      // Act
      const found = lookup('guest', codePayload(input));

      // Assert
      expect({ length: input.length, found }).toEqual({ length: 32, found: { matchId: 'live-match' } });
    });

    it('should count a bad code as a failed lookup', () => {
      // Arrange
      const payload = codePayload('K7M2Q');

      // Act
      thrownBy(() => lookup('guest', payload));

      // Assert
      expect(limitsOf('guest')?.lookupFailures).toBe(1);
    });

    it('should not read the code store for a bad code', () => {
      // Arrange
      const payload = codePayload('0OOOOO');

      // Act
      thrownBy(() => lookup('guest', payload));

      // Assert
      const codeReads = nk.storageRead.mock.calls.filter(([keys]) => keys.some((k) => k.key !== ROOM_LIMITS_KEY));
      expect(codeReads).toEqual([]);
    });

    it(`should still run the lookup after ${LOOKUP_FAILURE_LIMIT - 1} failures`, () => {
      // Arrange
      for (let i = 0; i < LOOKUP_FAILURE_LIMIT - 1; i++) thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Act
      const error = thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(error).toEqual({ message: 'room_not_found', code: 5 });
    });

    it(`should reject with room_rate_limited after ${LOOKUP_FAILURE_LIMIT} failures even for a valid code`, () => {
      // Arrange
      for (let i = 0; i < LOOKUP_FAILURE_LIMIT; i++) thrownBy(() => lookup('guest', codePayload('K7M2QX')));
      liveTable('K7M2QX', 'live-match');

      // Act
      const error = thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(error).toEqual({ message: 'room_rate_limited', code: 8 });
    });

    it('should not read the code store while rate limited', () => {
      // Arrange
      for (let i = 0; i < LOOKUP_FAILURE_LIMIT; i++) thrownBy(() => lookup('guest', codePayload('K7M2QX')));
      liveTable('K7M2QX', 'live-match');
      nk.storageRead.mockClear();

      // Act
      thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      const codeReads = nk.storageRead.mock.calls.filter(([keys]) => keys.some((k) => k.key !== ROOM_LIMITS_KEY));
      expect(codeReads).toEqual([]);
    });

    it('should count bad codes toward the same limit', () => {
      // Arrange
      for (let i = 0; i < LOOKUP_FAILURE_LIMIT; i++) thrownBy(() => lookup('guest', codePayload('bad')));
      liveTable('K7M2QX', 'live-match');

      // Act
      const error = thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      expect(error).toMatchObject({ code: 8 });
    });

    it('should allow lookups again once the window has passed', () => {
      // Arrange
      for (let i = 0; i < LOOKUP_FAILURE_LIMIT; i++) thrownBy(() => lookup('guest', codePayload('K7M2QX')));
      liveTable('K7M2QX', 'live-match');
      now = NOW + LIMIT_WINDOW_MS + 1;

      // Act
      const found = lookup('guest', codePayload('K7M2QX'));

      // Assert
      expect(found).toEqual({ matchId: 'live-match' });
    });

    it('should count failed lookups per user', () => {
      // Arrange
      for (let i = 0; i < LOOKUP_FAILURE_LIMIT; i++) thrownBy(() => lookup('guest', codePayload('K7M2QX')));
      liveTable('K7M2QX', 'live-match');

      // Act
      const found = lookup('other', codePayload('K7M2QX'));

      // Assert
      expect(found).toEqual({ matchId: 'live-match' });
    });

    it('should reject an unauthenticated call with UNAUTHENTICATED', () => {
      // Arrange
      liveTable('K7M2QX', 'live-match');
      const ctx = createUnauthenticatedContext();

      // Act
      const error = thrownBy(() => rpcJoinByCode(ctx, logger, nk, codePayload('K7M2QX')));

      // Assert
      expect(error).toMatchObject({ code: 16 });
    });

    it('should not touch storage when unauthenticated', () => {
      // Arrange
      const ctx = createUnauthenticatedContext();

      // Act
      thrownBy(() => rpcJoinByCode(ctx, logger, nk, codePayload('K7M2QX')));

      // Assert
      expect(nk.storageRead.mock.calls.length + nk.storageWrite.mock.calls.length).toBe(0);
    });

    it('should never log the code', () => {
      // Arrange
      seedCode('K7M2QX', { matchId: 'm-dead', createdAt: NOW - 1000 });

      // Act
      thrownBy(() => lookup('guest', codePayload('K7M2QX')));

      // Assert
      const logged = JSON.stringify([logger.debug.mock.calls, logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
      expect(logged).not.toContain('K7M2QX');
    });
  });

  describe('codeStatus', () => {
    it.each([
      { scenario: 'a mapped live private table', record: { matchId: 'live', createdAt: 0 }, expected: 'live' },
      { scenario: 'a mapped match that is gone', record: { matchId: 'gone', createdAt: NOW }, expected: 'stale' },
      { scenario: 'a fresh placeholder', record: { matchId: '', createdAt: NOW - PLACEHOLDER_GRACE_MS + 1 }, expected: 'pending' },
      { scenario: 'a placeholder at the grace period', record: { matchId: '', createdAt: NOW - PLACEHOLDER_GRACE_MS }, expected: 'stale' },
    ])('should report $expected for $scenario', ({ record, expected }) => {
      // Arrange
      nk.fake.addMatch('live', PRIVATE_LABEL);

      // Act
      const status = codeStatus(nk, record, NOW);

      // Assert
      expect(status).toBe(expected);
    });
  });

  describe('isLivePrivateMatch', () => {
    it.each([
      { scenario: 'a label with private true', label: PRIVATE_LABEL, expected: true },
      { scenario: 'a label with private false', label: PUBLIC_LABEL, expected: false },
      { scenario: 'a label with private as the string true', label: JSON.stringify({ private: 'true' }), expected: false },
      { scenario: 'a JSON null label', label: 'null', expected: false },
      { scenario: 'a malformed label', label: '{', expected: false },
    ])('should return $expected for $scenario', ({ label, expected }) => {
      // Arrange
      nk.fake.addMatch('m', label);

      // Act
      const live = isLivePrivateMatch(nk, 'm');

      // Assert
      expect(live).toBe(expected);
    });

    it('should return false for an unknown match', () => {
      // Arrange
      const matchId = 'unknown';

      // Act
      const live = isLivePrivateMatch(nk, matchId);

      // Assert
      expect(live).toBe(false);
    });
  });
});
