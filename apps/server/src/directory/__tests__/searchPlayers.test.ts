/**
 * `search_players` against the fake memory store and the fake offset index
 * (ADR-0004 sections 4, 11, 12 and 13): authentication, request gating, the
 * per-caller window with the attempt recorded before the query, listed vs
 * unlisted vs stale claims, self and block exclusion, exact-first across pages,
 * the offset cursor that never skips a row, the 60-row cap, and a storage fault
 * that is an error rather than an empty page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PRESENCE_VISIBILITY,
  DIRECTORY_COLLECTION,
  DIRECTORY_INDEX_NAME,
  DIRECTORY_LIMITS_KEY,
  PROFILE_COLLECTION,
  PROFILE_PREFS_KEY,
  SEARCH_PAGE_SIZE,
  foldName,
  nameClaimKey,
  type DirectoryLimitsRecord,
  type DirectoryPlayer,
  type SearchPlayersResponse,
} from '@chkobba/protocol';
import { SEARCH_LIMIT } from '../limits';
import { rpcSearchPlayers } from '../searchPlayers';
import { SYSTEM_USER_ID } from '../../rpc/roomStore';
import {
  createContext,
  createFakeLogger,
  createFakeNk,
  createUnauthenticatedContext,
} from '../../__tests__/fakes';

const NOW = 1_700_000_000_000;
const CALLER = 'user-caller';
/** The status-3 edge value used by the fake friend graph. */
const BLOCKED = 3;

let nk: ReturnType<typeof createFakeNk>;
let logger: ReturnType<typeof createFakeLogger>;
let ctx: nkruntime.Context;

/** Seeds an account so `usersGetId` returns its live display name. */
function seedAccount(userId: string, displayName: string): void {
  nk.fake.seedAccount(userId, { username: userId, displayName });
}

/** Seeds a live claim: the claim record and an account whose display name matches it. */
function seedClaim(userId: string, name: string, liveDisplayName: string = name): string {
  const fold = foldName(name);
  const claimKey = nameClaimKey(fold);
  seedAccount(userId, liveDisplayName);
  nk.fake.seedStorage(DIRECTORY_COLLECTION, claimKey, SYSTEM_USER_ID, {
    userId,
    name,
    fold,
    claimedAt: NOW,
  });
  return claimKey;
}

/** Seeds `count` listed players `u-01`..`u-NN` whose names are `<prefix>01`..`<prefix>NN`. */
function seedNumbered(prefix: string, count: number): string[] {
  const ids: string[] = [];
  for (let n = 1; n <= count; n += 1) {
    const suffix = n < 10 ? `0${n}` : `${n}`;
    const id = `u-${suffix}`;
    seedClaim(id, `${prefix}${suffix}`);
    ids.push(id);
  }
  return ids;
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

function search(payload: unknown): SearchPlayersResponse {
  return JSON.parse(rpcSearchPlayers(ctx, logger, nk, JSON.stringify(payload))) as SearchPlayersResponse;
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

/** Follows `nextCursor` to the end and returns every player the query returned. */
function allPages(query: string): DirectoryPlayer[] {
  const players: DirectoryPlayer[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const response = cursor === undefined ? search({ q: query }) : search({ q: query, cursor });
    players.push(...response.players);
    if (response.nextCursor === null) return players;
    cursor = response.nextCursor;
  }
  throw new Error('pagination did not terminate');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  logger = createFakeLogger();
  nk = createFakeNk();
  nk.fake.useMemoryStorage();
  nk.fake.registerStorageIndex(DIRECTORY_INDEX_NAME, DIRECTORY_COLLECTION);
  ctx = createContext(CALLER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('search_players authentication', () => {
  it('should throw UNAUTHENTICATED (16) when there is no authenticated user', () => {
    // Arrange
    const payload = JSON.stringify({ q: 'he' });

    // Act
    const error = thrownBy(() => rpcSearchPlayers(createUnauthenticatedContext(), logger, nk, payload));

    // Assert
    expect(error).toEqual(expect.objectContaining({ code: 16 }));
  });
});

describe('search_players request validation', () => {
  it.each([
    { scenario: 'the payload is not JSON', payload: '{not json' },
    { scenario: 'the payload is JSON null', payload: 'null' },
    { scenario: 'the payload is an array', payload: '[]' },
    { scenario: 'q is missing', payload: JSON.stringify({}) },
    { scenario: 'q is not a string', payload: JSON.stringify({ q: 42 }) },
    { scenario: 'the cursor is not a search cursor', payload: JSON.stringify({ q: 'he', cursor: 'garbage' }) },
    { scenario: 'the cursor is an empty string', payload: JSON.stringify({ q: 'he', cursor: '' }) },
    { scenario: 'the query is one folded character', payload: JSON.stringify({ q: 'h' }) },
    { scenario: 'the query is only spaces', payload: JSON.stringify({ q: '   ' }) },
    { scenario: 'the folded query is over 16 characters', payload: JSON.stringify({ q: 'abcdefghijklmnopq' }) },
  ])('should reject the request with directory_bad_query (3) when $scenario', ({ payload }) => {
    // Arrange (the malformed request)

    // Act
    const error = thrownBy(() => rpcSearchPlayers(ctx, logger, nk, payload));

    // Assert
    expect(error).toEqual({ message: 'directory_bad_query', code: 3 });
  });

  it('should treat a JSON null cursor as the first page', () => {
    // Arrange
    seedClaim('u-hedi', 'Hédi');

    // Act
    const response = search({ q: 'he', cursor: null });

    // Assert
    expect(response.players.map((player) => player.userId)).toEqual(['u-hedi']);
  });
});

describe('search_players rate limiting', () => {
  it('should refuse with directory_rate_limited (8) once the window holds SEARCH_LIMIT searches', () => {
    // Arrange
    seedLimits({ searches: SEARCH_LIMIT });

    // Act
    const error = thrownBy(() => search({ q: 'he' }));

    // Assert
    expect(error).toEqual({ message: 'directory_rate_limited', code: 8 });
  });

  it('should leave the stored window unchanged when the request is refused', () => {
    // Arrange
    const seeded = seedLimits({ searches: SEARCH_LIMIT });

    // Act
    thrownBy(() => search({ q: 'he' }));

    // Assert
    expect(storedLimits()).toEqual(seeded);
  });

  it('should record the attempt before the query even when nothing matches', () => {
    // Arrange (no claims match)

    // Act
    const response = search({ q: 'zz' });

    // Assert
    expect({ players: response.players, searches: storedLimits().searches }).toEqual({ players: [], searches: 1 });
  });
});

describe('search_players results', () => {
  it('should find a listed player by a folded prefix', () => {
    // Arrange
    seedClaim('u-hedi', 'Hédi');

    // Act
    const response = search({ q: 'HE' });

    // Assert
    expect(response).toEqual({
      players: [{ userId: 'u-hedi', name: 'Hédi', presence: 'visible' }],
      nextCursor: null,
      capped: false,
    });
  });

  it('should never return an account with no claim', () => {
    // Arrange
    seedAccount('u-unlisted', 'Hédi');

    // Act
    const response = search({ q: 'he' });

    // Assert
    expect(response.players).toEqual([]);
  });

  it('should never return a stale claim', () => {
    // Arrange
    seedClaim('u-stale', 'Hédi', 'Sami');

    // Act
    const response = search({ q: 'he' });

    // Assert
    expect(response.players).toEqual([]);
  });

  it('should never return the caller', () => {
    // Arrange
    seedClaim(CALLER, 'Hédi');

    // Act
    const response = search({ q: 'he' });

    // Assert
    expect(response.players).toEqual([]);
  });

  it('should hide a player the caller blocked', () => {
    // Arrange
    seedClaim('u-blocked', 'Hédi');
    nk.fake.setFriendEdge(CALLER, 'u-blocked', BLOCKED);

    // Act
    const response = search({ q: 'he' });

    // Assert
    expect(response.players).toEqual([]);
  });

  it('should hide a player who blocked the caller', () => {
    // Arrange
    seedClaim('u-blocker', 'Hédi');
    nk.fake.setFriendEdge('u-blocker', CALLER, BLOCKED);

    // Act
    const response = search({ q: 'he' });

    // Assert
    expect(response.players).toEqual([]);
  });

  it('should report a Nobody player as hidden rather than offline', () => {
    // Arrange
    seedClaim('u-nobody', 'Hédi');
    nk.fake.seedStorage(PROFILE_COLLECTION, PROFILE_PREFS_KEY, 'u-nobody', {
      visibility: 'nobody',
      updatedAt: NOW,
    });

    // Act
    const response = search({ q: 'he' });

    // Assert
    expect(response.players[0]?.presence).toBe('hidden');
  });

  it('should label an account with no preference with the default presence', () => {
    // Arrange
    seedClaim('u-default', 'Hédi');

    // Act
    const response = search({ q: 'he' });

    // Assert
    expect(response.players[0]?.presence).toBe(DEFAULT_PRESENCE_VISIBILITY === 'nobody' ? 'hidden' : 'visible');
  });
});

describe('search_players pagination', () => {
  it('should lead page 1 with the exact match when there are more matches than one page', () => {
    // Arrange: the exact claim sits after ten others, so only the direct read can put it first.
    for (let n = 1; n <= 10; n += 1) seedClaim(`u-before-${n}`, `champ0${n}`);
    seedClaim('u-exact', 'Ch');
    for (let n = 11; n <= 25; n += 1) seedClaim(`u-after-${n}`, `champ${n}`);

    // Act
    const page = search({ q: 'ch' });

    // Assert
    expect({ first: page.players[0]?.userId, size: page.players.length, hasCursor: typeof page.nextCursor }).toEqual({
      first: 'u-exact',
      size: SEARCH_PAGE_SIZE,
      hasCursor: 'string',
    });
  });

  it('should not repeat the exact match on page 2', () => {
    // Arrange
    for (let n = 1; n <= 10; n += 1) seedClaim(`u-before-${n}`, `champ0${n}`);
    seedClaim('u-exact', 'Ch');
    for (let n = 11; n <= 25; n += 1) seedClaim(`u-after-${n}`, `champ${n}`);
    const page1 = search({ q: 'ch' });

    // Act
    const page2 = search({ q: 'ch', cursor: page1.nextCursor });

    // Assert
    expect({ hasExact: page2.players.some((player) => player.userId === 'u-exact'), size: page2.players.length, next: page2.nextCursor }).toEqual({
      hasExact: false,
      size: 6,
      next: null,
    });
  });

  it('should return the full match set exactly once across pages', () => {
    // Arrange
    for (let n = 1; n <= 10; n += 1) seedClaim(`u-before-${n}`, `champ0${n}`);
    seedClaim('u-exact', 'Ch');
    const expected = ['u-exact'];
    for (let n = 1; n <= 10; n += 1) expected.push(`u-before-${n}`);
    for (let n = 11; n <= 25; n += 1) {
      seedClaim(`u-after-${n}`, `champ${n}`);
      expected.push(`u-after-${n}`);
    }

    // Act
    const ids = allPages('ch').map((player) => player.userId);

    // Assert
    expect(ids.slice().sort()).toEqual(expected.slice().sort());
  });

  it('should not skip a row when a page fills in the middle of an index batch', () => {
    // Arrange: 45 matches, so page 1 fills after 20 of the 100-row batch.
    const expected = seedNumbered('pp', 45);

    // Act
    const ids = allPages('pp').map((player) => player.userId);

    // Assert
    expect({ sorted: ids.slice().sort(), unique: ids.length === new Set(ids).size }).toEqual({
      sorted: expected.slice().sort(),
      unique: true,
    });
  });

  it('should dedupe a row the offset cursor repeats after an insert shifts the window', () => {
    // Arrange
    const expected = seedNumbered('pp', 25);
    const page1 = search({ q: 'pp' });
    // Insert a matching row before the cursor offset: the next fetch sees the window shifted.
    nk.fake.seedStorageAt(
      DIRECTORY_COLLECTION,
      nameClaimKey('ppx'),
      SYSTEM_USER_ID,
      { userId: 'u-inserted', name: 'ppx', fold: 'ppx', claimedAt: NOW },
      0,
    );
    seedAccount('u-inserted', 'ppx');

    // Act
    const page2 = search({ q: 'pp', cursor: page1.nextCursor });

    // Assert
    const secondFetch = nk.storageIndexList.mock.results[1]?.value as nkruntime.StorageIndexResult;
    const secondFetchKeys = secondFetch.objects.map((object) => object.key);
    expect({
      page2: page2.players.map((player) => player.userId),
      repeatedRowFetchedAgain: secondFetchKeys.indexOf(nameClaimKey('pp20')) !== -1,
      allIds: page1.players.map((player) => player.userId).concat(page2.players.map((player) => player.userId)).sort(),
    }).toEqual({
      page2: expected.slice(20),
      repeatedRowFetchedAgain: true,
      allIds: expected.slice().sort(),
    });
  });

  it('should stop at SEARCH_MAX_RESULTS with capped true and no next cursor', () => {
    // Arrange
    seedNumbered('qq', 61);
    const page1 = search({ q: 'qq' });
    const page2 = search({ q: 'qq', cursor: page1.nextCursor });

    // Act
    const page3 = search({ q: 'qq', cursor: page2.nextCursor });

    // Assert
    expect({
      page1: page1.players.length,
      page2: page2.players.length,
      page3: page3.players.length,
      capped: page3.capped,
      nextCursor: page3.nextCursor,
    }).toEqual({ page1: 20, page2: 20, page3: 20, capped: true, nextCursor: null });
  });

  it('should end with a null cursor on the last page', () => {
    // Arrange
    seedNumbered('ss', 25);
    const page1 = search({ q: 'ss' });

    // Act
    const page2 = search({ q: 'ss', cursor: page1.nextCursor });

    // Assert
    expect({ size: page2.players.length, nextCursor: page2.nextCursor, capped: page2.capped }).toEqual({
      size: 5,
      nextCursor: null,
      capped: false,
    });
  });
});

describe('search_players storage faults', () => {
  it('should answer directory_storage_error (13) when the index lookup fails', () => {
    // Arrange
    seedClaim('u-hedi', 'Hédi');
    nk.fake.failStorageIndexList();

    // Act
    const error = thrownBy(() => search({ q: 'he' }));

    // Assert
    expect(error).toEqual({ message: 'directory_storage_error', code: 13 });
  });

  it('should answer directory_storage_error (13) when the limits record cannot be read', () => {
    // Arrange
    seedClaim('u-hedi', 'Hédi');
    nk.fake.failStorageReads();

    // Act
    const error = thrownBy(() => search({ q: 'he' }));

    // Assert
    expect(error).toEqual({ message: 'directory_storage_error', code: 13 });
  });
});
