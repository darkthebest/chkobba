import { describe, it, expect } from 'vitest';
import {
  NAME_CLAIM_KEY_PREFIX,
  NAME_FOLD_VERSION,
  SEARCH_MAX_CHARS,
  SEARCH_MAX_QUERY_INPUT,
  SEARCH_MAX_RESULTS,
  SEARCH_MIN_CHARS,
  SEARCH_PAGE_SIZE,
  foldName,
  isSearchableQuery,
  nameClaimKey,
  normalizeQuery,
} from '../index';
// sha256Hex is an implementation detail behind nameClaimKey and is not part of
// the package's public entry, so the hash vectors import it directly.
import { sha256Hex } from '../sha256';
import {
  EQUAL_FOLD_GROUPS,
  FIXTURE_NAME_CLAIM_KEY_LENGTH,
  FIXTURE_NAME_CLAIM_KEY_PREFIX,
  FIXTURE_NAME_FOLD_VERSION,
  FIXTURE_SEARCH_MAX_CHARS,
  FIXTURE_SEARCH_MAX_QUERY_INPUT,
  FIXTURE_SEARCH_MAX_RESULTS,
  FIXTURE_SEARCH_MIN_CHARS,
  FIXTURE_SEARCH_PAGE_SIZE,
  FOLD_VECTORS,
  NAME_CLAIM_VECTORS,
  SHA256_VECTORS,
  UNCHANGED_FOLD_INPUT,
} from '../testing';

/** One table row per equal-fold group; `it.each` would otherwise spread a group into arguments. */
const equalFoldCases = EQUAL_FOLD_GROUPS.map((group) => ({
  scenario: group.join(' / '),
  group,
}));

describe('foldName', () => {
  it.each(FOLD_VECTORS)('should fold $scenario', ({ input, folded }) => {
    // Arrange (vector)

    // Act
    const result = foldName(input);

    // Assert
    expect(result).toBe(folded);
  });

  it.each(equalFoldCases)('should fold every name in $scenario to one value', ({ group }) => {
    // Arrange
    const first = group[0] ?? '';
    const expected = foldName(first);

    // Act
    const folded = group.map((name) => foldName(name));

    // Assert
    expect(folded).toEqual(group.map(() => expected));
  });

  it.each(FOLD_VECTORS)('should be idempotent for $scenario', ({ input, folded }) => {
    // Arrange
    const once = foldName(input);

    // Act
    const twice = foldName(once);

    // Assert
    expect(twice).toBe(folded);
  });

  it('should leave characters outside the allow-list unchanged', () => {
    // Arrange
    const input = UNCHANGED_FOLD_INPUT;

    // Act
    const result = foldName(input);

    // Assert
    expect(result).toBe(input);
  });

  it('should return an empty string for an empty string', () => {
    // Arrange
    const input = '';

    // Act
    const result = foldName(input);

    // Assert
    expect(result).toBe('');
  });
});

describe('nameClaimKey', () => {
  it.each(NAME_CLAIM_VECTORS)(
    'should fold $scenario and produce the pinned claim key',
    ({ name, folded, claimKey }) => {
      // Arrange
      const fold = foldName(name);

      // Act
      const key = nameClaimKey(fold);

      // Assert
      expect({ fold, key }).toEqual({ fold: folded, key: claimKey });
    },
  );

  it.each([
    { scenario: 'a Latin name', name: 'Hédi' },
    { scenario: 'an Arabic name', name: 'شكوبا' },
  ])('should produce a 65-character key for $scenario', ({ name }) => {
    // Arrange
    const folded = foldName(name);

    // Act
    const key = nameClaimKey(folded);

    // Assert
    expect(key).toHaveLength(FIXTURE_NAME_CLAIM_KEY_LENGTH);
  });

  it.each([
    { scenario: 'a Latin name', name: 'Hédi' },
    { scenario: 'an Arabic name', name: 'شكوبا' },
  ])('should match the claim-key shape for $scenario', ({ name }) => {
    // Arrange
    const folded = foldName(name);

    // Act
    const key = nameClaimKey(folded);

    // Assert
    expect(key).toMatch(/^n[0-9a-f]{64}$/);
  });

  it('should return the same key when called repeatedly', () => {
    // Arrange
    const folded = foldName('Hédi');

    // Act
    const first = nameClaimKey(folded);
    const second = nameClaimKey(folded);

    // Assert
    expect(second).toBe(first);
  });

  it('should give the same key to names that fold equal', () => {
    // Arrange
    const accent = foldName('Hédi');
    const uppercase = foldName('HEDI');

    // Act
    const accentKey = nameClaimKey(accent);
    const uppercaseKey = nameClaimKey(uppercase);

    // Assert
    expect(uppercaseKey).toBe(accentKey);
  });

  it('should give different keys to names that fold differently', () => {
    // Arrange
    const hedi = foldName('Hédi');
    const ali = foldName('Ali');

    // Act
    const hediKey = nameClaimKey(hedi);
    const aliKey = nameClaimKey(ali);

    // Assert
    expect(hediKey).not.toBe(aliKey);
  });

  it('should be the prefix plus sha256Hex of the folded name', () => {
    // Arrange
    const folded = 'abc';

    // Act
    const key = nameClaimKey(folded);

    // Assert
    expect(key).toBe(FIXTURE_NAME_CLAIM_KEY_PREFIX + sha256Hex(folded));
  });
});

describe('normalizeQuery', () => {
  it('should cap the raw input at SEARCH_MAX_QUERY_INPUT before folding', () => {
    // Arrange
    const raw = 'a'.repeat(100);

    // Act
    const result = normalizeQuery(raw);

    // Assert
    expect(result).toHaveLength(SEARCH_MAX_QUERY_INPUT);
  });

  it('should cap before folding, so two leading spaces are trimmed and the result is two shorter', () => {
    // Arrange: the 64-character cap lands on the two leading spaces, which the fold then trims.
    const raw = `  ${'a'.repeat(100)}`;

    // Act
    const result = normalizeQuery(raw);

    // Assert: 62 deliberately, not 64 (SEARCH_MAX_QUERY_INPUT - 2).
    expect(result).toHaveLength(SEARCH_MAX_QUERY_INPUT - 2);
  });

  it('should fold and trim the capped query', () => {
    // Arrange
    const raw = '  HÉDI   Ali  ';

    // Act
    const result = normalizeQuery(raw);

    // Assert
    expect(result).toBe('hedi ali');
  });
});

describe('isSearchableQuery', () => {
  it.each([
    { scenario: 'an empty query', query: '', expected: false },
    {
      scenario: `one character, below the ${SEARCH_MIN_CHARS}-character minimum`,
      query: 'a'.repeat(SEARCH_MIN_CHARS - 1),
      expected: false,
    },
    {
      scenario: `exactly the ${SEARCH_MIN_CHARS}-character minimum`,
      query: 'a'.repeat(SEARCH_MIN_CHARS),
      expected: true,
    },
    {
      scenario: `exactly the ${SEARCH_MAX_CHARS}-character maximum`,
      query: 'a'.repeat(SEARCH_MAX_CHARS),
      expected: true,
    },
    {
      scenario: `one character over the ${SEARCH_MAX_CHARS}-character maximum`,
      query: 'a'.repeat(SEARCH_MAX_CHARS + 1),
      expected: false,
    },
  ])('should return $expected for $scenario', ({ query, expected }) => {
    // Arrange (table row)

    // Act
    const result = isSearchableQuery(query);

    // Assert
    expect(result).toBe(expected);
  });
});

describe('sha256Hex', () => {
  it.each(SHA256_VECTORS)('should hash $scenario to the published digest', ({ input, digest }) => {
    // Arrange (vector)

    // Act
    const result = sha256Hex(input);

    // Assert
    expect(result).toBe(digest);
  });
});

describe('directory constants', () => {
  it.each([
    { label: 'SEARCH_MIN_CHARS', actual: SEARCH_MIN_CHARS, expected: FIXTURE_SEARCH_MIN_CHARS },
    { label: 'SEARCH_MAX_CHARS', actual: SEARCH_MAX_CHARS, expected: FIXTURE_SEARCH_MAX_CHARS },
    { label: 'SEARCH_PAGE_SIZE', actual: SEARCH_PAGE_SIZE, expected: FIXTURE_SEARCH_PAGE_SIZE },
    { label: 'SEARCH_MAX_RESULTS', actual: SEARCH_MAX_RESULTS, expected: FIXTURE_SEARCH_MAX_RESULTS },
    {
      label: 'SEARCH_MAX_QUERY_INPUT',
      actual: SEARCH_MAX_QUERY_INPUT,
      expected: FIXTURE_SEARCH_MAX_QUERY_INPUT,
    },
    {
      label: 'NAME_CLAIM_KEY_PREFIX',
      actual: NAME_CLAIM_KEY_PREFIX,
      expected: FIXTURE_NAME_CLAIM_KEY_PREFIX,
    },
    { label: 'NAME_FOLD_VERSION', actual: NAME_FOLD_VERSION, expected: FIXTURE_NAME_FOLD_VERSION },
  ])('should keep $label at $expected', ({ actual, expected }) => {
    // Assert
    expect(actual).toBe(expected);
  });

  it('should make a claim key one prefix character plus 64 hex characters', () => {
    // Assert
    expect(FIXTURE_NAME_CLAIM_KEY_PREFIX.length + 64).toBe(FIXTURE_NAME_CLAIM_KEY_LENGTH);
  });
});
