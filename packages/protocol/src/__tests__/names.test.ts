import { describe, it, expect } from 'vitest';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  checkDisplayNameFormat,
  normalizeDisplayName,
} from '../names';
import { NAME_FORMAT_VECTORS } from '../testing/nameVectors';

/** Collapses a check result to the vector's `expected` shape. */
function outcome(raw: string): string {
  const result = checkDisplayNameFormat(raw);
  return result.ok ? 'ok' : result.code;
}

/** Inclusive code-point range with a `U+XXXX` label for test titles. */
function codePoints(from: number, to: number): Array<{ code: number; hex: string }> {
  return Array.from({ length: to - from + 1 }, (_, i) => {
    const code = from + i;
    return { code, hex: `U+${code.toString(16).toUpperCase().padStart(4, '0')}` };
  });
}

/** JSON keeps escapes visible in test titles. */
const vectors = NAME_FORMAT_VECTORS.map((vector) => ({ ...vector, label: JSON.stringify(vector.input) }));

describe('NAME_FORMAT_VECTORS', () => {
  it.each(vectors)('should normalize $label to the expected string', ({ input, normalized }) => {
    // Arrange (vector)

    // Act
    const result = normalizeDisplayName(input);

    // Assert
    expect(result).toBe(normalized);
  });

  it.each(vectors)('should return $expected when checking $label', ({ input, expected }) => {
    // Arrange (vector)

    // Act
    const result = outcome(input);

    // Assert
    expect(result).toBe(expected);
  });

  it.each(vectors.filter((vector) => vector.expected === 'ok'))(
    'should return the normalized name when $label is accepted',
    ({ input, normalized }) => {
      // Arrange (vector)

      // Act
      const result = checkDisplayNameFormat(input);

      // Assert
      expect(result).toEqual({ ok: true, name: normalized });
    },
  );
});

describe('normalizeDisplayName', () => {
  it('should trim leading and trailing spaces', () => {
    // Arrange
    const raw = '   Hédi   ';

    // Act
    const result = normalizeDisplayName(raw);

    // Assert
    expect(result).toBe('Hédi');
  });

  it('should collapse each run of spaces to a single space', () => {
    // Arrange
    const raw = 'Ali  Ben     Salah';

    // Act
    const result = normalizeDisplayName(raw);

    // Assert
    expect(result).toBe('Ali Ben Salah');
  });

  it('should leave an inner tab in place for the format check to reject', () => {
    // Arrange
    const raw = 'Ali\t\tBen';

    // Act
    const result = normalizeDisplayName(raw);

    // Assert
    expect(result).toBe('Ali\t\tBen');
  });
});

describe('checkDisplayNameFormat', () => {
  describe('length', () => {
    it.each([
      { length: DISPLAY_NAME_MIN_LENGTH, expected: 'ok' },
      { length: DISPLAY_NAME_MAX_LENGTH, expected: 'ok' },
      { length: DISPLAY_NAME_MIN_LENGTH - 1, expected: 'name_too_short' },
      { length: DISPLAY_NAME_MAX_LENGTH + 1, expected: 'name_too_long' },
    ])('should return $expected when the name has $length characters', ({ length, expected }) => {
      // Arrange
      const raw = 'a'.repeat(length);

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe(expected);
    });

    it('should accept a 16-letter Arabic name', () => {
      // Arrange
      const raw = 'ع'.repeat(DISPLAY_NAME_MAX_LENGTH);

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('ok');
    });

    it('should measure length after collapsing spaces', () => {
      // Arrange
      const raw = 'A' + ' '.repeat(20) + 'B';

      // Act
      const result = checkDisplayNameFormat(raw);

      // Assert
      expect(result).toEqual({ ok: true, name: 'A B' });
    });

    it('should report too short when the name is only spaces', () => {
      // Arrange
      const raw = '      ';

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('name_too_short');
    });
  });

  describe('invisible and control characters', () => {
    const rejected: ReadonlyArray<{ readonly name: string; readonly char: string }> = [
      { name: 'LRM U+200E', char: '‎' },
      { name: 'RLM U+200F', char: '‏' },
      { name: 'LRE U+202A', char: '‪' },
      { name: 'RLE U+202B', char: '‫' },
      { name: 'PDF U+202C', char: '‬' },
      { name: 'LRO U+202D', char: '‭' },
      { name: 'RLO U+202E', char: '‮' },
      { name: 'LRI U+2066', char: '⁦' },
      { name: 'RLI U+2067', char: '⁧' },
      { name: 'FSI U+2068', char: '⁨' },
      { name: 'PDI U+2069', char: '⁩' },
      { name: 'ZWSP U+200B', char: '​' },
      { name: 'ZWNJ U+200C', char: '‌' },
      { name: 'ZWJ U+200D', char: '‍' },
      { name: 'BOM U+FEFF', char: '﻿' },
      { name: 'tatweel U+0640', char: 'ـ' },
      { name: 'tab', char: '\t' },
    ];

    it.each(rejected)('should reject $name between letters', ({ char }) => {
      // Arrange
      const raw = `Ali${char}Ben`;

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('name_bad_chars');
    });

    it.each(rejected.filter(({ char }) => char.trim() !== ''))(
      'should reject $name at the start of the name',
      ({ char }) => {
        // Arrange
        const raw = `${char}Ali`;

        // Act
        const result = outcome(raw);

        // Assert
        expect(result).toBe('name_bad_chars');
      },
    );
  });

  describe('harakat', () => {
    const harakat = codePoints(0x064b, 0x065f);

    it.each(harakat)('should reject the mark $hex on an Arabic name', ({ code }) => {
      // Arrange
      const raw = `ع${String.fromCharCode(code)}لي`;

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('name_bad_chars');
    });
  });

  describe('digits', () => {
    const arabicIndic = codePoints(0x0660, 0x0669);
    const easternArabicIndic = codePoints(0x06f0, 0x06f9);

    it('should accept every ASCII digit', () => {
      // Arrange
      const raw = 'Ali0123456789';

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('ok');
    });

    it.each(arabicIndic)('should accept the Arabic-Indic digit $hex', ({ code }) => {
      // Arrange
      const raw = `Ali${String.fromCharCode(code)}`;

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('ok');
    });

    it.each(easternArabicIndic)('should reject the Eastern Arabic-Indic digit $hex', ({ code }) => {
      // Arrange
      const raw = `Ali${String.fromCharCode(code)}`;

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('name_bad_chars');
    });
  });

  describe('letters', () => {
    it.each([
      { name: 'Zoé', raw: 'Zoé' },
      { name: 'Hédi', raw: 'Hédi' },
      { name: 'ڤ U+06A4', raw: 'ڤال' },
      { name: 'ڨ U+06A8', raw: 'ڨال' },
      { name: 'پ U+067E', raw: 'پال' },
      { name: 'mixed Latin and Arabic', raw: 'Zoé علي' },
    ])('should accept $name', ({ raw }) => {
      // Arrange (table row)

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('ok');
    });

    it.each([
      { name: '× U+00D7', raw: 'A×B' },
      { name: '÷ U+00F7', raw: 'A÷B' },
      { name: 'emoji', raw: 'Ali😀' },
    ])('should reject $name', ({ raw }) => {
      // Arrange (table row)

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('name_bad_chars');
    });

    it('should report bad characters rather than length when an emoji makes the name too long', () => {
      // Arrange
      const raw = 'a'.repeat(DISPLAY_NAME_MAX_LENGTH) + '😀';

      // Act
      const result = outcome(raw);

      // Assert
      expect(result).toBe('name_bad_chars');
    });
  });
});
