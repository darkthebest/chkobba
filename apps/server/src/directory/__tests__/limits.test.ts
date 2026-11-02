/**
 * Directory rate limits (ADR-0004 section 12): the two independent fixed
 * windows, their exact boundaries, the restart of an expired window, the shape
 * guard that reads a malformed record as "no activity", and the server-only
 * (read 0 / write 0) storage record. Pure functions are called with explicit
 * clocks; the storage half runs against the fake memory store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECTORY_COLLECTION,
  DIRECTORY_LIMITS_KEY,
  type DirectoryLimitsRecord,
} from '@chkobba/protocol';
import {
  EMPTY_LIMITS,
  LIMIT_WINDOW_MS,
  PROFILE_LIMIT,
  SEARCH_LIMIT,
  checkProfile,
  checkSearch,
  parseLimits,
  readLimits,
  recordProfile,
  recordSearch,
  writeLimits,
} from '../limits';
import { createFakeNk } from '../../__tests__/fakes';

const NOW = 1_700_000_000_000;
const USER = 'user-1';

/** A record whose search window started `age` ms before NOW. */
function searchRecord(age: number, searches: number): DirectoryLimitsRecord {
  return { searchWindowStart: NOW - age, searches, profileWindowStart: 0, profiles: 0 };
}

/** A record whose profile window started `age` ms before NOW. */
function profileRecord(age: number, profiles: number): DirectoryLimitsRecord {
  return { searchWindowStart: 0, searches: 0, profileWindowStart: NOW - age, profiles };
}

let nk: ReturnType<typeof createFakeNk>;

beforeEach(() => {
  nk = createFakeNk();
  nk.fake.useMemoryStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkSearch / recordSearch', () => {
  it('should still count a search one millisecond before the window elapses', () => {
    // Arrange
    const record = searchRecord(LIMIT_WINDOW_MS - 1, SEARCH_LIMIT);

    // Act
    const allowed = checkSearch(record, NOW);

    // Assert
    expect(allowed).toBe(false);
  });

  it('should reset the search window at exactly LIMIT_WINDOW_MS', () => {
    // Arrange
    const record = searchRecord(LIMIT_WINDOW_MS, SEARCH_LIMIT);

    // Act
    const allowed = checkSearch(record, NOW);

    // Assert
    expect(allowed).toBe(true);
  });

  it('should allow the search that reaches SEARCH_LIMIT and refuse the next one', () => {
    // Arrange
    const belowLimit = searchRecord(1000, SEARCH_LIMIT - 1);
    const atLimit = searchRecord(1000, SEARCH_LIMIT);

    // Act
    const allowed = checkSearch(belowLimit, NOW);
    const refused = checkSearch(atLimit, NOW);

    // Assert
    expect({ allowed, refused }).toEqual({ allowed: true, refused: false });
  });

  it('should increment the count inside an active window without touching the profile fields', () => {
    // Arrange
    const record: DirectoryLimitsRecord = {
      searchWindowStart: NOW - 1000,
      searches: 5,
      profileWindowStart: NOW - 2000,
      profiles: 3,
    };

    // Act
    const next = recordSearch(record, NOW);

    // Assert
    expect(next).toEqual({
      searchWindowStart: NOW - 1000,
      searches: 6,
      profileWindowStart: NOW - 2000,
      profiles: 3,
    });
  });

  it('should restart an expired window at one', () => {
    // Arrange
    const record = searchRecord(LIMIT_WINDOW_MS, 5);

    // Act
    const next = recordSearch(record, NOW);

    // Assert
    expect(next).toEqual({ searchWindowStart: NOW, searches: 1, profileWindowStart: 0, profiles: 0 });
  });

  it('should read a null record as no activity', () => {
    // Arrange (no stored record)

    // Act
    const allowed = checkSearch(null, NOW);
    const next = recordSearch(null, NOW);

    // Assert
    expect({ allowed, next }).toEqual({ allowed: true, next: { ...EMPTY_LIMITS, searchWindowStart: NOW, searches: 1 } });
  });
});

describe('checkProfile / recordProfile', () => {
  it('should still count a profile view one millisecond before the window elapses', () => {
    // Arrange
    const record = profileRecord(LIMIT_WINDOW_MS - 1, PROFILE_LIMIT);

    // Act
    const allowed = checkProfile(record, NOW);

    // Assert
    expect(allowed).toBe(false);
  });

  it('should reset the profile window at exactly LIMIT_WINDOW_MS', () => {
    // Arrange
    const record = profileRecord(LIMIT_WINDOW_MS, PROFILE_LIMIT);

    // Act
    const allowed = checkProfile(record, NOW);

    // Assert
    expect(allowed).toBe(true);
  });

  it('should allow the profile view that reaches PROFILE_LIMIT and refuse the next one', () => {
    // Arrange
    const belowLimit = profileRecord(1000, PROFILE_LIMIT - 1);
    const atLimit = profileRecord(1000, PROFILE_LIMIT);

    // Act
    const allowed = checkProfile(belowLimit, NOW);
    const refused = checkProfile(atLimit, NOW);

    // Assert
    expect({ allowed, refused }).toEqual({ allowed: true, refused: false });
  });

  it('should restart an expired profile window at one without touching the search fields', () => {
    // Arrange
    const record: DirectoryLimitsRecord = {
      searchWindowStart: NOW - 1000,
      searches: 4,
      profileWindowStart: NOW - LIMIT_WINDOW_MS,
      profiles: 7,
    };

    // Act
    const next = recordProfile(record, NOW);

    // Assert
    expect(next).toEqual({
      searchWindowStart: NOW - 1000,
      searches: 4,
      profileWindowStart: NOW,
      profiles: 1,
    });
  });
});

describe('the two windows are independent', () => {
  it('should allow a search while the profile window is exhausted', () => {
    // Arrange
    const record: DirectoryLimitsRecord = {
      searchWindowStart: NOW - 1000,
      searches: 0,
      profileWindowStart: NOW - 1000,
      profiles: PROFILE_LIMIT,
    };

    // Act
    const allowed = checkSearch(record, NOW);

    // Assert
    expect(allowed).toBe(true);
  });

  it('should allow a profile view while the search window is exhausted', () => {
    // Arrange
    const record: DirectoryLimitsRecord = {
      searchWindowStart: NOW - 1000,
      searches: SEARCH_LIMIT,
      profileWindowStart: NOW - 1000,
      profiles: 0,
    };

    // Act
    const allowed = checkProfile(record, NOW);

    // Assert
    expect(allowed).toBe(true);
  });
});

describe('parseLimits', () => {
  it.each([
    { scenario: 'null', value: null },
    { scenario: 'undefined', value: undefined },
    { scenario: 'a number', value: 42 },
    { scenario: 'a string', value: 'limits' },
    { scenario: 'an array', value: [] },
    { scenario: 'a missing field', value: { searchWindowStart: 0, searches: 0, profileWindowStart: 0 } },
    { scenario: 'a negative count', value: { searchWindowStart: 0, searches: -1, profileWindowStart: 0, profiles: 0 } },
    { scenario: 'a numeric string', value: { searchWindowStart: 0, searches: '1', profileWindowStart: 0, profiles: 0 } },
    { scenario: 'NaN', value: { searchWindowStart: 0, searches: NaN, profileWindowStart: 0, profiles: 0 } },
    { scenario: 'Infinity', value: { searchWindowStart: 0, searches: Infinity, profileWindowStart: 0, profiles: 0 } },
  ])('should read $scenario as malformed (null)', ({ value }) => {
    // Arrange (the bad value)

    // Act
    const parsed = parseLimits(value);

    // Assert
    expect(parsed).toBeNull();
  });

  it('should return a well-formed record unchanged', () => {
    // Arrange
    const record: DirectoryLimitsRecord = {
      searchWindowStart: 10,
      searches: 2,
      profileWindowStart: 20,
      profiles: 3,
    };

    // Act
    const parsed = parseLimits(record);

    // Assert
    expect(parsed).toEqual(record);
  });
});

describe('readLimits / writeLimits', () => {
  it('should read the record stored for the user', () => {
    // Arrange
    const record = searchRecord(1000, 4);
    nk.fake.seedStorage(DIRECTORY_COLLECTION, DIRECTORY_LIMITS_KEY, USER, record);

    // Act
    const stored = readLimits(nk, USER);

    // Assert
    expect(stored).toEqual(record);
  });

  it('should read an absent record as null', () => {
    // Arrange (empty store)

    // Act
    const stored = readLimits(nk, USER);

    // Assert
    expect(stored).toBeNull();
  });

  it('should read a malformed stored value as null', () => {
    // Arrange
    nk.fake.seedStorage(DIRECTORY_COLLECTION, DIRECTORY_LIMITS_KEY, USER, { searches: 'many' });

    // Act
    const stored = readLimits(nk, USER);

    // Assert
    expect(stored).toBeNull();
  });

  it('should write the record server-only (read 0 / write 0) under the user key', () => {
    // Arrange
    const record = searchRecord(1000, 4);

    // Act
    writeLimits(nk, USER, record);

    // Assert
    expect(nk.fake.storedObject(DIRECTORY_COLLECTION, DIRECTORY_LIMITS_KEY, USER)).toEqual(
      expect.objectContaining({
        collection: DIRECTORY_COLLECTION,
        key: DIRECTORY_LIMITS_KEY,
        userId: USER,
        permissionRead: 0,
        permissionWrite: 0,
        value: record,
      }),
    );
  });

  it('should read back the record it wrote', () => {
    // Arrange
    const record = profileRecord(1000, 2);

    // Act
    writeLimits(nk, USER, record);
    const stored = readLimits(nk, USER);

    // Assert
    expect(stored).toEqual(record);
  });
});
