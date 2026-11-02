import { describe, it, expect } from 'vitest';
import {
  DERJA_ARABIC_BLOCKED,
  DERJA_LATIN_BLOCKED,
  EN_BLOCKED,
  FR_BLOCKED,
  RESERVED_WORDS,
  foldName,
  isNameAllowed,
  type BlockedWord,
} from '../index';

describe('foldName', () => {
  it.each([
    { label: 'lowercases', input: 'HeDi', expected: 'hedi' },
    { label: 'strips spaces', input: 'f u c k', expected: 'fuck' },
    { label: 'maps leetspeak 0 1 3 4 5 @', input: '01345@', expected: 'oieasa' },
    { label: 'maps Arabic-Indic digits through leetspeak', input: '٠١٣٤٥', expected: 'oieas' },
    { label: 'maps the other Arabic-Indic digits to ASCII digits', input: '٢٦٧٨٩', expected: '26789' },
    { label: 'folds alef variants to bare alef', input: 'أإآ', expected: 'ااا' },
    { label: 'folds taa marbuta to haa', input: 'ة', expected: 'ه' },
    { label: 'folds alef maqsura to yaa', input: 'ى', expected: 'ي' },
    { label: 'folds ڤ ڨ پ to ف ق ب', input: 'ڤڨپ', expected: 'فقب' },
    { label: 'strips é', input: 'é', expected: 'e' },
    { label: 'strips ç', input: 'Ç', expected: 'c' },
    { label: 'strips accents in a full name', input: 'Sébastien Hélène', expected: 'sebastienhelene' },
    { label: 'expands ß and æ', input: 'ßæ', expected: 'ssae' },
    { label: 'leaves plain letters untouched', input: 'abc', expected: 'abc' },
  ])('should fold $input to $expected when it $label', ({ input, expected }) => {
    // Arrange (row)

    // Act
    const folded = foldName(input);

    // Assert
    expect(folded).toBe(expected);
  });
});

describe('isNameAllowed', () => {
  describe('blocked names', () => {
    it.each([
      // Leetspeak
      'Sh1t',
      'FuCk3r',
      // Spaced out
      'f u c k',
      'ز ب',
      // Arabic spelling variants (ه for ة)
      'قحبه',
      // French with accents
      'Pédé',
      'enculé',
      // Arabizi
      '9a7ba',
      'zebi',
      // Multi-word
      'nique ta mere',
      'نيك امك',
      // Glued substring roots
      'xFuckx',
      // Reserved
      'ChkobbaAdmin',
      '0fficial x',
      'Supp0rt',
      'شكبة',
    ])('should block %s', (name) => {
      // Arrange (name)

      // Act
      const allowed = isNameAllowed(name);

      // Assert
      expect(allowed).toBe(false);
    });
  });

  describe('Scunthorpe false positives', () => {
    it.each([
      // Bot names
      'Hedi',
      'Sonia',
      'Mongi',
      'Fatma',
      // Latin names hiding short blocked words
      'Hassan',
      'Assia',
      'Cassandra',
      'Dick',
      'Nazih',
      'Nazir',
      'Zoubeida',
      'Zaki',
      'Zakaria',
      'Chedly',
      'Monique',
      'Dominique',
      'Nicole',
      'Pedersen',
      'Analia',
      'Kshitij',
      'Hancock',
      'Peacock',
      'Conner',
      'Scott',
      'Matthew',
      'Titus',
      'Sébastien',
      'Hélène',
      // Arabic names hiding short blocked words
      'هادي',
      'فاطمة',
      'زبيدة',
      'زكي',
      'زكرياء',
      'الشاذلي',
      'نيكول',
      'كسرى',
      'عطايا',
      // Multi-word
      'Mohamed Ali',
    ])('should allow %s', (name) => {
      // Arrange (name)

      // Act
      const allowed = isNameAllowed(name);

      // Assert
      expect(allowed).toBe(true);
    });

    it('should allow every default name Player0000 to Player9999', () => {
      // Arrange
      const blocked: string[] = [];

      // Act
      for (let n = 0; n < 10000; n++) {
        const name = 'Player' + String(n).padStart(4, '0');
        if (!isNameAllowed(name)) blocked.push(name);
      }

      // Assert
      expect(blocked).toEqual([]);
    });
  });

  describe('every list entry is wired up', () => {
    const lists: ReadonlyArray<readonly [string, readonly BlockedWord[]]> = [
      ['EN_BLOCKED', EN_BLOCKED],
      ['FR_BLOCKED', FR_BLOCKED],
      ['DERJA_ARABIC_BLOCKED', DERJA_ARABIC_BLOCKED],
      ['DERJA_LATIN_BLOCKED', DERJA_LATIN_BLOCKED],
      ['RESERVED_WORDS', RESERVED_WORDS],
    ];
    // The server lib is ES2017 (no flatMap).
    const rows: Array<{ list: string; word: string }> = [];
    for (const [list, entries] of lists) {
      for (const entry of entries) rows.push({ list, word: entry.word });
    }

    it.each(rows)('should block $list entry $word when it is the whole name', ({ word }) => {
      // Arrange (row)

      // Act
      const allowed = isNameAllowed(word);

      // Assert
      expect(allowed).toBe(false);
    });
  });

  describe('accepted known gaps', () => {
    // These pass today on purpose. Catching them needs fuzzy matching (letter
    // lookalikes, collapsed repeats, `word` entries glued to other text), which
    // would also block real names. Changing any of these is a conscious decision:
    // update this test together with the implementation.
    it.each([
      { name: 'fvck', why: 'v as a lookalike for u is not folded' },
      { name: 'fuuuck', why: 'repeated letters are not collapsed' },
      { name: 'Shitty', why: 'shit is a word entry, so it only matches as a whole token' },
      { name: 'zebiX', why: 'zebi is a word entry, so glued text hides it' },
    ])('should allow $name because $why', ({ name }) => {
      // Arrange (row)

      // Act
      const allowed = isNameAllowed(name);

      // Assert
      expect(allowed).toBe(true);
    });
  });
});
