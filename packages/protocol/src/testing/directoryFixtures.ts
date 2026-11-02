/**
 * Shared players-directory test vectors. Server (Vitest) and mobile (Jest)
 * tests import them via `@chkobba/protocol/testing`, so both sides agree on
 * how names fold, which claim key a folded name produces and which SHA-256
 * bytes the hand-rolled hash must reproduce.
 *
 * Pure data: no test-framework imports.
 *
 * Never import this file from `src/index.ts`, so the server bundle never
 * includes it.
 *
 * Expected digests are fixed values from published SHA-256 vectors (NIST/
 * FIPS 180-4) verified with `sha256sum`; the Arabic digest was checked against
 * Nakama 3.40's `nk.sha256Hash` in the Task 1.1 live probes.
 */

/** One fold case: the raw name and the folded form used for uniqueness/search. */
export interface FoldVector {
  /** Readable label for the test title. */
  readonly scenario: string;
  /** Name as typed. */
  readonly input: string;
  /** Expected `foldName(input)`. */
  readonly folded: string;
}

/**
 * Fold vectors for the Latin and Arabic rules: case, accents, the Latin-1
 * expansions, space collapsing, and scripts the fold leaves alone.
 */
export const FOLD_VECTORS: readonly FoldVector[] = [
  // Case only
  { scenario: 'a mixed-case Latin name', input: 'Hédi', folded: 'hedi' },
  { scenario: 'an uppercase Latin name', input: 'HEDI', folded: 'hedi' },
  { scenario: 'a title-case Latin name', input: 'Hedi', folded: 'hedi' },
  { scenario: 'an accented uppercase Latin name', input: 'HÉDI', folded: 'hedi' },

  // Latin-1 accents
  { scenario: 'a lowercase accented letter', input: 'café', folded: 'cafe' },
  { scenario: 'a lowercase accented name', input: 'Éloïse', folded: 'eloise' },
  { scenario: 'a cedilla', input: 'François', folded: 'francois' },

  // Latin-1 expansions
  { scenario: 'uppercase AE ligature', input: 'Æsir', folded: 'aesir' },
  { scenario: 'lowercase ae ligature', input: 'æsir', folded: 'aesir' },
  { scenario: 'uppercase thorn', input: 'Þing', folded: 'thing' },
  { scenario: 'lowercase thorn', input: 'þing', folded: 'thing' },
  { scenario: 'sharp s', input: 'Straße', folded: 'strasse' },

  // Not letters: × and ÷ must pass through
  { scenario: 'a multiplication sign', input: 'A×B', folded: 'a×b' },
  { scenario: 'a division sign', input: 'A÷B', folded: 'a÷b' },

  // Whitespace
  { scenario: 'leading, trailing and repeated spaces', input: '  Hédi   Ali  ', folded: 'hedi ali' },

  // Arabic letter variants
  { scenario: 'alef with madda', input: 'آ', folded: 'ا' },
  { scenario: 'alef with hamza above', input: 'أ', folded: 'ا' },
  { scenario: 'alef with hamza below', input: 'إ', folded: 'ا' },
  { scenario: 'alef wasla', input: 'ٱ', folded: 'ا' },
  { scenario: 'alef maqsura', input: 'ى', folded: 'ي' },
  { scenario: 'taa marbuta', input: 'ة', folded: 'ه' },
  { scenario: 'waw with hamza above', input: 'ؤ', folded: 'و' },
  { scenario: 'yaa with hamza above', input: 'ئ', folded: 'ي' },
  { scenario: 'taa marbuta inside a word', input: 'مدرسة', folded: 'مدرسه' },
  { scenario: 'an already folded Arabic name', input: 'علي', folded: 'علي' },

  // Arabic-Indic digits
  { scenario: 'every Arabic-Indic digit', input: '٠١٢٣٤٥٦٧٨٩', folded: '0123456789' },

  // Mixed scripts: only recognized characters are folded
  { scenario: 'a Latin name and an Arabic name', input: 'Hédi آلي', folded: 'hedi الي' },
  { scenario: 'a Latin name and Arabic-Indic digits', input: 'Zoé ٠٧', folded: 'zoe 07' },

  // Outside the allow-list: passed through by construction
  { scenario: 'symbols and an emoji', input: 'a×b÷c😀', folded: 'a×b÷c😀' },
];

/** Names that must fold to the same value (accent-only and case-only pairs). */
export const EQUAL_FOLD_GROUPS: readonly (readonly string[])[] = [
  ['Hédi', 'HEDI', 'Hedi', 'HÉDI'],
  ['Æsir', 'æsir'],
  ['Þing', 'þing'],
];

/** A string whose characters are all outside the fold map (apart from ASCII case). */
export const UNCHANGED_FOLD_INPUT = 'a×b÷c😀Ж';

/** A name, its folded form and the claim key derived from it. */
export interface NameClaimVector {
  /** Readable label for the test title. */
  readonly scenario: string;
  /** Name as typed. */
  readonly name: string;
  /** Expected `foldName(name)`. */
  readonly folded: string;
  /** Expected `nameClaimKey(folded)`; pinned so a hash regression is caught. */
  readonly claimKey: string;
}

/**
 * Claim-key vectors with pinned digests: `'n' + sha256Hex(folded)`.
 * `Hédi` and `HEDI` share a key because they share a fold; the Arabic name
 * proves the key is ASCII whatever the script of the name.
 */
export const NAME_CLAIM_VECTORS: readonly NameClaimVector[] = [
  {
    scenario: 'the published abc SHA-256 vector',
    name: 'abc',
    folded: 'abc',
    claimKey: 'nba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  },
  {
    scenario: 'a folded Latin name',
    name: 'Hédi',
    folded: 'hedi',
    claimKey: 'n4b0bd6e85d5c1c28d395dee7e9ba23fc01d8fb2a5af344ff937940afd6373ab0',
  },
  {
    scenario: 'the uppercase form of the same Latin name',
    name: 'HEDI',
    folded: 'hedi',
    claimKey: 'n4b0bd6e85d5c1c28d395dee7e9ba23fc01d8fb2a5af344ff937940afd6373ab0',
  },
  {
    scenario: 'an Arabic name (ASCII key, UTF-8 hashed)',
    name: 'شكوبا',
    folded: 'شكوبا',
    claimKey: 'nbd2599d05b269e7cb58b09112e4774fb0f06e4a10e2c572378862a7c2cf91c44',
  },
] as const;

/** One SHA-256 vector: the input, its UTF-8 byte length and the expected lowercase hex. */
export interface Sha256Vector {
  /** Readable label for the test title. */
  readonly scenario: string;
  /** Input string, hashed over its UTF-8 bytes. */
  readonly input: string;
  /** UTF-8 byte length, so the block-boundary cases are self-documenting. */
  readonly bytes: number;
  /** Expected 64 lowercase hex characters. */
  readonly digest: string;
}

/**
 * Published SHA-256 vectors plus block-boundary cases:
 * - 0 and 3 bytes: the empty and `abc` FIPS 180-4 vectors.
 * - 10 bytes of UTF-8 Arabic (5 two-byte letters).
 * - 56 bytes: the NIST two-block vector, past the 55-byte single-block limit.
 * - 63 and 64 bytes: the last single-block message and the first two-block message.
 * - 4 bytes: an astral-plane emoji, encoded from a surrogate pair.
 */
export const SHA256_VECTORS: readonly Sha256Vector[] = [
  {
    scenario: 'the empty string',
    input: '',
    bytes: 0,
    digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    scenario: 'the published abc vector',
    input: 'abc',
    bytes: 3,
    digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  },
  {
    scenario: 'a UTF-8 Arabic name',
    input: 'شكوبا',
    bytes: 10,
    digest: 'bd2599d05b269e7cb58b09112e4774fb0f06e4a10e2c572378862a7c2cf91c44',
  },
  {
    scenario: 'the NIST two-block vector (56 bytes)',
    input: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    bytes: 56,
    digest: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  },
  {
    scenario: '63 bytes, still one block after padding',
    input: 'a'.repeat(63),
    bytes: 63,
    digest: '7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34',
  },
  {
    scenario: '64 bytes, the first two-block message',
    input: 'a'.repeat(64),
    bytes: 64,
    digest: 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
  },
  {
    scenario: 'an astral-plane emoji (surrogate pair)',
    input: '😀',
    bytes: 4,
    digest: 'f0443a342c5ef54783a111b51ba56c938e474c32324d90c3a60c9c8e3a37e2d9',
  },
] as const;

/**
 * Expected directory limits and key shape, kept independently of the module
 * under test. Tests assert the exported consts equal these, so a changed limit
 * cannot silently drift away from the fixtures other tests build on.
 */
export const FIXTURE_SEARCH_MIN_CHARS = 2;
export const FIXTURE_SEARCH_MAX_CHARS = 16;
export const FIXTURE_SEARCH_PAGE_SIZE = 20;
export const FIXTURE_SEARCH_MAX_RESULTS = 60;
export const FIXTURE_SEARCH_MAX_QUERY_INPUT = 64;
export const FIXTURE_NAME_CLAIM_KEY_PREFIX = 'n';
/** `'n'` plus 64 hex characters. */
export const FIXTURE_NAME_CLAIM_KEY_LENGTH = 65;
export const FIXTURE_NAME_FOLD_VERSION = 1;
