/**
 * The pure page assembler (ADR-0004 sections 4, 9, 11 and 14): query gating,
 * cursor shape, and the drop order that makes a page honest — malformed,
 * wrong-prefix, stale, self, duplicate (including ids returned by earlier
 * pages), then blocked. Exact-first, the page size and the global cap are
 * pinned here; the RPC wiring is covered in searchPlayers.test.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  SEARCH_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
  foldName,
  nameClaimKey,
  type NameClaim,
  type PresenceVisibility,
} from '@chkobba/protocol';
import {
  SEARCH_CURSOR_MAX_SKIP,
  assemblePage,
  decodeSearchCursor,
  encodeSearchCursor,
  isValidCursor,
  normalizeSearch,
  type AssemblePageInput,
  type SearchRow,
} from '../search';

const NOW = 1_700_000_000_000;
const CALLER = 'user-caller';

/** A claim in the shape search stores it; `name` is the display form. */
function claim(userId: string, name: string): NameClaim {
  return { userId, name, fold: foldName(name), claimedAt: NOW };
}

/** One index row; `liveName` defaults to the claimed name (a live claim). */
function row(userId: string, name: string, liveName: string | null = name): SearchRow {
  return { claimKey: nameClaimKey(foldName(name)), value: claim(userId, name), liveName };
}

/** An assembler input with sane defaults so each test states only what matters. */
function input(overrides: Partial<AssemblePageInput>): AssemblePageInput {
  return {
    query: 'he',
    callerId: CALLER,
    exactRow: null,
    rows: [],
    pageSize: SEARCH_PAGE_SIZE,
    maxResults: SEARCH_MAX_RESULTS,
    already: [],
    canSee: () => true,
    presenceOf: () => undefined,
    ...overrides,
  };
}

/** The userIds of a page, the assertion most tests actually want. */
function ids(page: { players: readonly { userId: string }[] }): string[] {
  return page.players.map((player) => player.userId);
}

describe('normalizeSearch', () => {
  it.each([
    { scenario: 'a number', query: 42 },
    { scenario: 'null', query: null },
    { scenario: 'undefined', query: undefined },
    { scenario: 'an object', query: {} },
    { scenario: 'an empty string', query: '' },
    { scenario: 'a single folded character', query: 'a' },
    { scenario: 'only spaces', query: '   ' },
    { scenario: 'a space after one character', query: 'a ' },
    { scenario: 'more than 16 folded characters', query: 'abcdefghijklmnopq' },
  ])('should reject $scenario', ({ query }) => {
    // Arrange (the unusable query)

    // Act
    const normalized = normalizeSearch(query);

    // Assert
    expect(normalized).toBeNull();
  });

  it('should accept a two-character query', () => {
    // Arrange (the shortest query)

    // Act
    const normalized = normalizeSearch('ab');

    // Assert
    expect(normalized).toBe('ab');
  });

  it('should accept a sixteen-character query', () => {
    // Arrange
    const longest = 'a'.repeat(16);

    // Act
    const normalized = normalizeSearch(longest);

    // Assert
    expect(normalized).toBe(longest);
  });

  it('should fold case and accents like the claim key does', () => {
    // Arrange (a client typing a name the way it is written)

    // Act
    const normalized = normalizeSearch('HÉDI');

    // Assert
    expect(normalized).toBe('hedi');
  });

  it('should trim and collapse spaces before the length gate', () => {
    // Arrange

    // Act
    const normalized = normalizeSearch('  Abu   Bakr  ');

    // Assert
    expect(normalized).toBe('abu bakr');
  });
});

describe('isValidCursor', () => {
  it('should accept an absent cursor as the first page', () => {
    // Arrange (no cursor field)

    // Act
    const valid = isValidCursor(undefined);

    // Assert
    expect(valid).toBe(true);
  });

  it('should accept a non-empty string cursor', () => {
    // Arrange
    const cursor = encodeSearchCursor({ storageCursor: null, skip: 0, already: [] });

    // Act
    const valid = isValidCursor(cursor);

    // Assert
    expect(valid).toBe(true);
  });

  it.each([
    { scenario: 'an empty string', cursor: '' },
    { scenario: 'null', cursor: null },
    { scenario: 'a number', cursor: 7 },
    { scenario: 'an object', cursor: {} },
    { scenario: 'an array', cursor: [] },
    { scenario: 'a boolean', cursor: true },
  ])('should reject $scenario', ({ cursor }) => {
    // Arrange (a present but malformed cursor)

    // Act
    const valid = isValidCursor(cursor);

    // Assert
    expect(valid).toBe(false);
  });
});

describe('encodeSearchCursor / decodeSearchCursor', () => {
  it('should round-trip the storage position and returned ids', () => {
    // Arrange
    const cursor = { storageCursor: 'index:40', skip: 7, already: ['u1', 'u2'] };

    // Act
    const decoded = decodeSearchCursor(encodeSearchCursor(cursor));

    // Assert
    expect(decoded).toEqual(cursor);
  });

  it.each([
    { scenario: 'not JSON', value: 'not-json' },
    { scenario: 'a JSON array', value: '[]' },
    { scenario: 'a missing field', value: JSON.stringify({ c: null, s: 0 }) },
    { scenario: 'a negative skip', value: JSON.stringify({ c: null, s: -1, a: [] }) },
    { scenario: 'a fractional skip', value: JSON.stringify({ c: null, s: 1.5, a: [] }) },
    { scenario: 'a skip past one batch', value: JSON.stringify({ c: null, s: SEARCH_CURSOR_MAX_SKIP + 1, a: [] }) },
    { scenario: 'an empty storage cursor', value: JSON.stringify({ c: '', s: 0, a: [] }) },
    { scenario: 'a non-array already list', value: JSON.stringify({ c: null, s: 0, a: 'u1' }) },
    { scenario: 'a non-string id', value: JSON.stringify({ c: null, s: 0, a: [1] }) },
  ])('should reject a cursor with $scenario', ({ value }) => {
    // Arrange (a client-supplied cursor)

    // Act
    const decoded = decodeSearchCursor(value);

    // Assert
    expect(decoded).toBeNull();
  });
});

describe('assemblePage', () => {
  it('should emit the exact match first and dedupe it out of the scanned rows', () => {
    // Arrange
    const exact = row('u-exact', 'Hedi');
    const before = row('u-before', 'Hedouane');
    const after = row('u-after', 'Hedia');

    // Act
    const page = assemblePage(input({ exactRow: exact, rows: [before, exact, after] }));

    // Assert
    expect(ids(page)).toEqual(['u-exact', 'u-before', 'u-after']);
  });

  it.each([
    { scenario: 'its owner renamed since the claim', liveName: 'Sami' },
    { scenario: 'its owner account is gone', liveName: null },
  ])('should drop a stale claim when $scenario', ({ liveName }) => {
    // Arrange
    const stale = row('u-stale', 'Hedi', liveName);

    // Act
    const page = assemblePage(input({ rows: [stale] }));

    // Assert
    expect(ids(page)).toEqual([]);
  });

  it('should not emit a stale exact row', () => {
    // Arrange
    const exact = row('u-exact', 'Hedi', 'Sami');
    const live = row('u-live', 'Hedia');

    // Act
    const page = assemblePage(input({ exactRow: exact, rows: [live] }));

    // Assert
    expect(ids(page)).toEqual(['u-live']);
  });

  it('should drop the caller', () => {
    // Arrange
    const self = row(CALLER, 'Hedi');

    // Act
    const page = assemblePage(input({ rows: [self] }));

    // Assert
    expect(ids(page)).toEqual([]);
  });

  it('should drop a row with a malformed stored value', () => {
    // Arrange
    const malformed: SearchRow = { claimKey: 'n-broken', value: { userId: 'u-broken' }, liveName: 'Hedi' };

    // Act
    const page = assemblePage(input({ rows: [malformed] }));

    // Assert
    expect(ids(page)).toEqual([]);
  });

  it('should drop a row whose folded name does not carry the query prefix', () => {
    // Arrange
    const wrongPrefix: SearchRow = {
      claimKey: nameClaimKey('sami'),
      value: { userId: 'u-sami', name: 'Sami', fold: 'sami', claimedAt: NOW },
      liveName: 'Sami',
    };

    // Act
    const page = assemblePage(input({ rows: [wrongPrefix] }));

    // Assert
    expect(ids(page)).toEqual([]);
  });

  it('should drop a duplicate claim key within the page', () => {
    // Arrange
    const original = row('u-one', 'Hedi');
    const duplicate: SearchRow = { ...original, value: claim('u-two', 'Hedi') };

    // Act
    const page = assemblePage(input({ rows: [original, duplicate] }));

    // Assert
    expect(ids(page)).toEqual(['u-one']);
  });

  it('should drop a duplicate userId within the page', () => {
    // Arrange
    const first = row('u-one', 'Hedi');
    const duplicate: SearchRow = { ...first, claimKey: nameClaimKey('hedi two'), value: claim('u-one', 'Hedi Two') };

    // Act
    const page = assemblePage(input({ query: 'he', rows: [first, duplicate] }));

    // Assert
    expect(ids(page)).toEqual(['u-one']);
  });

  it('should drop a userId returned by an earlier page', () => {
    // Arrange
    const repeated = row('u-one', 'Hedi');

    // Act
    const page = assemblePage(input({ rows: [repeated], already: ['u-one'] }));

    // Assert
    expect(ids(page)).toEqual([]);
  });

  it('should drop a candidate the block verdict hides', () => {
    // Arrange
    const blocked = row('u-blocked', 'Hedi');

    // Act
    const page = assemblePage(input({ rows: [blocked], canSee: (userId) => userId !== 'u-blocked' }));

    // Assert
    expect(ids(page)).toEqual([]);
  });

  it('should return at most pageSize rows and leave the rest for the next page', () => {
    // Arrange
    const rows = [row('u1', 'Hedi'), row('u2', 'Hedia'), row('u3', 'Hedouane')];

    // Act
    const page = assemblePage(input({ rows, pageSize: 2, maxResults: 60 }));

    // Assert
    expect({ ids: ids(page), capped: page.capped }).toEqual({ ids: ['u1', 'u2'], capped: false });
  });

  it('should stop at the global cap and report capped', () => {
    // Arrange
    const rows = [row('u1', 'Hedi'), row('u2', 'Hedia'), row('u3', 'Hedouane')];

    // Act
    const page = assemblePage(input({ rows, pageSize: 5, maxResults: 2 }));

    // Assert
    expect({ ids: ids(page), capped: page.capped }).toEqual({ ids: ['u1', 'u2'], capped: true });
  });

  it('should count ids returned by earlier pages against the global cap', () => {
    // Arrange
    const rows = [row('u1', 'Hedi')];

    // Act
    const page = assemblePage(input({ rows, maxResults: 2, already: ['a', 'b'] }));

    // Assert
    expect({ ids: ids(page), capped: page.capped }).toEqual({ ids: [], capped: true });
  });

  it('should return the fixed userIds so the caller can carry them to the next page', () => {
    // Arrange
    const rows = [row('u1', 'Hedi'), row('u2', 'Hedia')];

    // Act
    const page = assemblePage(input({ rows }));

    // Assert
    expect(page.fixed).toEqual(['u1', 'u2']);
  });

  it('should label presence from the lookup: Everyone visible, Nobody hidden, absent and undefined visible', () => {
    // Arrange
    const rows = [
      row('u-everyone', 'Hedi'),
      row('u-nobody', 'Hedia'),
      row('u-absent', 'Hedouane'),
      row('u-undefined', 'Hediya'),
    ];
    const presence: { [userId: string]: PresenceVisibility | undefined } = {
      'u-everyone': 'everyone',
      'u-nobody': 'nobody',
      'u-undefined': undefined,
    };

    // Act
    const page = assemblePage(input({ rows, presenceOf: (userId) => presence[userId] }));

    // Assert
    expect(page.players.map((player) => player.presence)).toEqual(['visible', 'hidden', 'visible', 'visible']);
  });
});
