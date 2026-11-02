/**
 * Presence preference reads (ADR-0004 section 14): absent/malformed/unknown
 * values read as Everyone (the documented default), only a well-formed
 * `nobody` is hidden, and a page of ids costs exactly one batched storage read.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PRESENCE_VISIBILITY,
  PROFILE_COLLECTION,
  PROFILE_PREFS_KEY,
  type PresenceVisibility,
} from '@chkobba/protocol';
import {
  labelOf,
  readPresenceVisibilities,
  readPresenceVisibility,
  visibilityOf,
} from '../presencePrefs';
import { createFakeNk } from '../../__tests__/fakes';

const NOW = 1_700_000_000_000;
const USER = 'user-1';

let nk: ReturnType<typeof createFakeNk>;

function seedPrefs(userId: string, value: unknown): void {
  nk.fake.seedStorage(PROFILE_COLLECTION, PROFILE_PREFS_KEY, userId, value);
}

beforeEach(() => {
  nk = createFakeNk();
  nk.fake.useMemoryStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('visibilityOf', () => {
  it.each([
    { scenario: 'null', value: null },
    { scenario: 'undefined', value: undefined },
    { scenario: 'a bare string', value: 'nobody' },
    { scenario: 'an array', value: [] },
    { scenario: 'an empty object', value: {} },
    { scenario: 'a record without updatedAt', value: { visibility: 'nobody' } },
    { scenario: 'an unknown visibility', value: { visibility: 'friends', updatedAt: NOW } },
    { scenario: 'a non-numeric updatedAt', value: { visibility: 'nobody', updatedAt: 'now' } },
    { scenario: 'an infinite updatedAt', value: { visibility: 'nobody', updatedAt: Infinity } },
  ])('should read $scenario as Everyone', ({ value }) => {
    // Arrange (a malformed or absent preference)

    // Act
    const visibility = visibilityOf(value);

    // Assert
    expect(visibility).toBe(DEFAULT_PRESENCE_VISIBILITY);
  });

  it('should read a well-formed everyone record as Everyone', () => {
    // Arrange
    const value = { visibility: 'everyone', updatedAt: NOW };

    // Act
    const visibility = visibilityOf(value);

    // Assert
    expect(visibility).toBe('everyone');
  });

  it('should read a well-formed nobody record as Nobody', () => {
    // Arrange
    const value = { visibility: 'nobody', updatedAt: NOW };

    // Act
    const visibility = visibilityOf(value);

    // Assert
    expect(visibility).toBe('nobody');
  });
});

describe('labelOf', () => {
  it('should label everyone as visible and nobody as hidden', () => {
    // Arrange
    const choices: PresenceVisibility[] = ['everyone', 'nobody'];

    // Act
    const labels = choices.map(labelOf);

    // Assert
    expect(labels).toEqual(['visible', 'hidden']);
  });
});

describe('readPresenceVisibility', () => {
  it('should read an absent record as Everyone', () => {
    // Arrange (the account never saved a preference)

    // Act
    const visibility = readPresenceVisibility(nk, USER);

    // Assert
    expect(visibility).toBe('everyone');
  });

  it('should read a stored nobody record as Nobody', () => {
    // Arrange
    seedPrefs(USER, { visibility: 'nobody', updatedAt: NOW });

    // Act
    const visibility = readPresenceVisibility(nk, USER);

    // Assert
    expect(visibility).toBe('nobody');
  });

  it('should read a stored malformed record as Everyone', () => {
    // Arrange
    seedPrefs(USER, { visibility: 'nobody' });

    // Act
    const visibility = readPresenceVisibility(nk, USER);

    // Assert
    expect(visibility).toBe('everyone');
  });
});

describe('readPresenceVisibilities', () => {
  it('should read a whole page of ids in one storage call', () => {
    // Arrange
    seedPrefs('b', { visibility: 'nobody', updatedAt: NOW });
    nk.storageRead.mockClear();

    // Act
    readPresenceVisibilities(nk, ['a', 'b', 'c']);

    // Assert
    expect(nk.storageRead.mock.calls.length).toBe(1);
  });

  it('should resolve each id to its own preference', () => {
    // Arrange
    seedPrefs('b', { visibility: 'nobody', updatedAt: NOW });

    // Act
    const lookup = readPresenceVisibilities(nk, ['a', 'b', 'c']);

    // Assert
    expect({ ...lookup }).toEqual({ a: 'everyone', b: 'nobody', c: 'everyone' });
  });

  it('should ask storage for one target per requested id', () => {
    // Arrange

    // Act
    readPresenceVisibilities(nk, ['a', 'b']);
    const targets = nk.storageRead.mock.calls[0]?.[0];

    // Assert
    expect(targets).toEqual([
      { collection: PROFILE_COLLECTION, key: PROFILE_PREFS_KEY, userId: 'a' },
      { collection: PROFILE_COLLECTION, key: PROFILE_PREFS_KEY, userId: 'b' },
    ]);
  });

  it('should not read storage at all for an empty page', () => {
    // Arrange
    nk.storageRead.mockClear();

    // Act
    const lookup = readPresenceVisibilities(nk, []);

    // Assert
    expect({ lookup: { ...lookup }, calls: nk.storageRead.mock.calls.length }).toEqual({ lookup: {}, calls: 0 });
  });

  it('should fail the page on a storage fault rather than answer Everyone', () => {
    // Arrange
    nk.fake.failStorageReads();

    // Act
    const call = () => readPresenceVisibilities(nk, ['a']);

    // Assert
    expect(call).toThrow('storageRead failed');
  });
});
