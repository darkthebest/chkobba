/**
 * `get_player_profile` (ADR-0004 sections 11 and 13, ADR-0005): authentication,
 * payload gating with the attempt recorded, listed profiles with both stat
 * blocks, absent/malformed stats as zeros, a block in either direction answered
 * exactly like an unknown id, self exempt, and a storage fault that never reads
 * as "not found".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPETITIVE_STATS_KEY,
  DIRECTORY_COLLECTION,
  DIRECTORY_LIMITS_KEY,
  DIRECTORY_OWN_COLLECTION,
  OWN_CLAIM_KEY_PREFIX,
  PRACTICE_STATS_KEY,
  PROFILE_COLLECTION,
  PROFILE_PREFS_KEY,
  STATS_COLLECTION,
  foldName,
  nameClaimKey,
  type CompetitiveStats,
  type DirectoryLimitsRecord,
  type PlayerProfileResponse,
  type PracticeStats,
} from '@chkobba/protocol';
import { PROFILE_LIMIT } from '../limits';
import { rpcGetPlayerProfile } from '../getPlayerProfile';
import { SYSTEM_USER_ID } from '../../rpc/roomStore';
import {
  createContext,
  createFakeLogger,
  createFakeNk,
  createUnauthenticatedContext,
} from '../../__tests__/fakes';

const NOW = 1_700_000_000_000;
const CALLER = 'user-caller';
const TARGET = 'user-target';
/** The status-3 edge value used by the fake friend graph. */
const BLOCKED = 3;

const ZERO_COMPETITIVE: CompetitiveStats = {
  games: 0,
  wins: 0,
  chkobbas: 0,
  currentStreak: 0,
  bestStreak: 0,
  updatedAt: 0,
};
const ZERO_PRACTICE: PracticeStats = { games: 0, wins: 0, chkobbas: 0, updatedAt: 0 };

let nk: ReturnType<typeof createFakeNk>;
let logger: ReturnType<typeof createFakeLogger>;
let ctx: nkruntime.Context;

/** Seeds a listed account: the claim record, the own record and the live display name. */
function seedListed(userId: string, name: string, liveDisplayName: string = name): string {
  const fold = foldName(name);
  const claimKey = nameClaimKey(fold);
  nk.fake.seedAccount(userId, { username: userId, displayName: liveDisplayName });
  nk.fake.seedStorage(DIRECTORY_COLLECTION, claimKey, SYSTEM_USER_ID, {
    userId,
    name,
    fold,
    claimedAt: NOW,
  });
  nk.fake.seedStorage(DIRECTORY_OWN_COLLECTION, OWN_CLAIM_KEY_PREFIX + userId, userId, {
    claimKey,
    fold,
    name,
    claimedAt: NOW,
  });
  return claimKey;
}

function seedLimits(overrides: Partial<DirectoryLimitsRecord> = {}): DirectoryLimitsRecord {
  const record: DirectoryLimitsRecord = {
    searchWindowStart: NOW,
    searches: 0,
    profileWindowStart: NOW,
    profiles: 0,
    ...overrides,
  };
  nk.fake.seedStorage(DIRECTORY_COLLECTION, DIRECTORY_LIMITS_KEY, CALLER, record);
  return record;
}

function storedLimits(): DirectoryLimitsRecord {
  return nk.fake.storedValue(DIRECTORY_COLLECTION, DIRECTORY_LIMITS_KEY, CALLER) as DirectoryLimitsRecord;
}

function profile(userId: string): PlayerProfileResponse {
  return JSON.parse(rpcGetPlayerProfile(ctx, logger, nk, JSON.stringify({ userId }))) as PlayerProfileResponse;
}

/** What `fn` threw, or undefined when it returned. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  logger = createFakeLogger();
  nk = createFakeNk();
  nk.fake.useMemoryStorage();
  ctx = createContext(CALLER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('get_player_profile authentication', () => {
  it('should throw UNAUTHENTICATED (16) when there is no authenticated user', () => {
    // Arrange
    const payload = JSON.stringify({ userId: TARGET });

    // Act
    const error = thrownBy(() => rpcGetPlayerProfile(createUnauthenticatedContext(), logger, nk, payload));

    // Assert
    expect(error).toEqual(expect.objectContaining({ code: 16 }));
  });
});

describe('get_player_profile request validation', () => {
  it.each([
    { scenario: 'the payload is not JSON', payload: '{not json' },
    { scenario: 'the payload is JSON null', payload: 'null' },
    { scenario: 'the payload is an array', payload: '[]' },
    { scenario: 'userId is missing', payload: JSON.stringify({}) },
    { scenario: 'userId is not a string', payload: JSON.stringify({ userId: 42 }) },
    { scenario: 'userId is empty', payload: JSON.stringify({ userId: '' }) },
    { scenario: 'userId is over 128 characters', payload: JSON.stringify({ userId: 'a'.repeat(129) }) },
  ])('should reject the request with directory_bad_query (3) when $scenario', ({ payload }) => {
    // Arrange (the malformed request)

    // Act
    const error = thrownBy(() => rpcGetPlayerProfile(ctx, logger, nk, payload));

    // Assert
    expect(error).toEqual({ message: 'directory_bad_query', code: 3 });
  });
});

describe('get_player_profile rate limiting', () => {
  it('should refuse with directory_rate_limited (8) once the window holds PROFILE_LIMIT views', () => {
    // Arrange
    seedLimits({ profiles: PROFILE_LIMIT });

    // Act
    const error = thrownBy(() => profile(TARGET));

    // Assert
    expect(error).toEqual({ message: 'directory_rate_limited', code: 8 });
  });

  it('should leave the stored window unchanged when the request is refused', () => {
    // Arrange
    const seeded = seedLimits({ profiles: PROFILE_LIMIT });

    // Act
    thrownBy(() => profile(TARGET));

    // Assert
    expect(storedLimits()).toEqual(seeded);
  });

  it('should record the attempt even when the target does not exist', () => {
    // Arrange (no profile for the target)

    // Act
    const error = thrownBy(() => profile(TARGET));

    // Assert
    expect({ error, profiles: storedLimits().profiles }).toEqual({
      error: { message: 'directory_not_found', code: 5 },
      profiles: 1,
    });
  });
});

describe('get_player_profile success', () => {
  it('should return the id, claims name, presence and both stat blocks', () => {
    // Arrange
    seedListed(TARGET, 'Hédi');
    const competitive: CompetitiveStats = {
      games: 3,
      wins: 2,
      chkobbas: 1,
      currentStreak: 1,
      bestStreak: 2,
      updatedAt: NOW,
    };
    const practice: PracticeStats = { games: 5, wins: 4, chkobbas: 3, updatedAt: NOW };
    nk.fake.seedStorage(STATS_COLLECTION, COMPETITIVE_STATS_KEY, TARGET, competitive);
    nk.fake.seedStorage(STATS_COLLECTION, PRACTICE_STATS_KEY, TARGET, practice);

    // Act
    const response = profile(TARGET);

    // Assert
    expect(response).toEqual({
      userId: TARGET,
      name: 'Hédi',
      presence: 'visible',
      stats: { competitive, practice },
    });
  });

  it('should return the practice block as exactly its four fields when the record also holds the rate-limit window', () => {
    // Arrange: the stored record is the public block plus the internal report window.
    seedListed(TARGET, 'Hédi');
    nk.fake.seedStorage(STATS_COLLECTION, PRACTICE_STATS_KEY, TARGET, {
      games: 5,
      wins: 4,
      chkobbas: 3,
      updatedAt: NOW,
      windowStart: NOW,
      windowReports: 2,
    });

    // Act
    const practice = profile(TARGET).stats.practice;

    // Assert: the counters survive, the window never reaches the wire.
    expect(practice).toEqual({ games: 5, wins: 4, chkobbas: 3, updatedAt: NOW });
    expect(Object.keys(practice).sort()).toEqual(['chkobbas', 'games', 'updatedAt', 'wins']);
  });

  it('should return the competitive block as exactly its six fields when the record carries an extra property', () => {
    // Arrange: any stored extra property must be stripped like the practice window.
    seedListed(TARGET, 'Hédi');
    nk.fake.seedStorage(STATS_COLLECTION, COMPETITIVE_STATS_KEY, TARGET, {
      games: 3,
      wins: 2,
      chkobbas: 1,
      currentStreak: 1,
      bestStreak: 2,
      updatedAt: NOW,
      internalNote: 'should not leak',
    });

    // Act
    const competitive = profile(TARGET).stats.competitive;

    // Assert
    expect(competitive).toEqual({
      games: 3,
      wins: 2,
      chkobbas: 1,
      currentStreak: 1,
      bestStreak: 2,
      updatedAt: NOW,
    });
    expect(Object.keys(competitive).sort()).toEqual([
      'bestStreak',
      'chkobbas',
      'currentStreak',
      'games',
      'updatedAt',
      'wins',
    ]);
  });

  it('should read absent stat records as all-zero blocks', () => {
    // Arrange
    seedListed(TARGET, 'Hédi');

    // Act
    const response = profile(TARGET);

    // Assert
    expect(response.stats).toEqual({ competitive: ZERO_COMPETITIVE, practice: ZERO_PRACTICE });
  });

  it('should read malformed stat records as all-zero blocks', () => {
    // Arrange
    seedListed(TARGET, 'Hédi');
    nk.fake.seedStorage(STATS_COLLECTION, COMPETITIVE_STATS_KEY, TARGET, { games: 1 });
    nk.fake.seedStorage(STATS_COLLECTION, PRACTICE_STATS_KEY, TARGET, {
      games: 2,
      wins: 1,
      chkobbas: 0,
      updatedAt: 'yesterday',
    });

    // Act
    const response = profile(TARGET);

    // Assert
    expect(response.stats).toEqual({ competitive: ZERO_COMPETITIVE, practice: ZERO_PRACTICE });
  });

  it('should keep practice games out of the competitive block', () => {
    // Arrange
    seedListed(TARGET, 'Hédi');
    const competitive: CompetitiveStats = {
      games: 3,
      wins: 2,
      chkobbas: 1,
      currentStreak: 0,
      bestStreak: 2,
      updatedAt: NOW,
    };
    const practice: PracticeStats = { games: 7, wins: 6, chkobbas: 4, updatedAt: NOW };
    nk.fake.seedStorage(STATS_COLLECTION, COMPETITIVE_STATS_KEY, TARGET, competitive);
    nk.fake.seedStorage(STATS_COLLECTION, PRACTICE_STATS_KEY, TARGET, practice);

    // Act
    const response = profile(TARGET);

    // Assert
    expect(response.stats.competitive).toEqual(competitive);
  });

  it('should report a Nobody player as hidden rather than offline', () => {
    // Arrange
    seedListed(TARGET, 'Hédi');
    nk.fake.seedStorage(PROFILE_COLLECTION, PROFILE_PREFS_KEY, TARGET, {
      visibility: 'nobody',
      updatedAt: NOW,
    });

    // Act
    const response = profile(TARGET);

    // Assert
    expect(response.presence).toBe('hidden');
  });

  it('should always show a caller their own profile', () => {
    // Arrange
    seedListed(CALLER, 'Hédi');
    // Even an artificial self block must not hide the caller from themselves.
    nk.fake.setFriendEdge(CALLER, CALLER, BLOCKED);

    // Act
    const response = profile(CALLER);

    // Assert
    expect(response.userId).toBe(CALLER);
  });
});

describe('get_player_profile not found', () => {
  it('should answer an unknown id, an unlisted account, a stale claim and a block in either direction identically', () => {
    // Arrange
    seedListed('u-stale', 'Hédi', 'Sami');
    nk.fake.seedAccount('u-unlisted', { username: 'u-unlisted', displayName: 'Hédi' });
    seedListed('u-blocked-by-caller', 'Hédi');
    nk.fake.setFriendEdge(CALLER, 'u-blocked-by-caller', BLOCKED);
    seedListed('u-blocked-caller', 'Hédi');
    nk.fake.setFriendEdge('u-blocked-caller', CALLER, BLOCKED);

    // Act
    const errors = ['u-unknown', 'u-unlisted', 'u-stale', 'u-blocked-by-caller', 'u-blocked-caller'].map((userId) =>
      thrownBy(() => profile(userId)),
    );

    // Assert
    const canonical = { message: 'directory_not_found', code: 5 };
    expect(errors).toEqual([canonical, canonical, canonical, canonical, canonical]);
    expect(errors.map((error) => JSON.stringify(error))).toEqual(new Array(5).fill(JSON.stringify(canonical)));
  });
});

describe('get_player_profile storage faults', () => {
  it('should answer directory_storage_error (13), never directory_not_found (5), when storage fails', () => {
    // Arrange
    seedListed(TARGET, 'Hédi');
    nk.fake.failStorageReads();

    // Act
    const error = thrownBy(() => profile(TARGET));

    // Assert
    expect(error).toEqual({ message: 'directory_storage_error', code: 13 });
  });
});
