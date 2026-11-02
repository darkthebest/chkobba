/**
 * Shared display-name test vectors. Server (Vitest) and mobile (Jest) tests
 * import them via `@chkobba/protocol/testing`, so the client form and the
 * server hook agree on every case. Pure data: no test-framework imports.
 *
 * Never import this file from `src/index.ts`, so the server bundle never
 * includes it.
 *
 * Invisible and non-ASCII characters are written as `\uXXXX` escapes so each
 * case is readable. Note that `String.prototype.trim` strips U+FEFF and tabs at
 * the edges, so those cases put the character between letters.
 */
import type { NameErrorCode, NameFormatErrorCode } from '../names';

export interface NameFormatVector {
  /** Raw input as typed. */
  readonly input: string;
  /** Expected `normalizeDisplayName(input)`. */
  readonly normalized: string;
  /** `'ok'`, or the error code `checkDisplayNameFormat` must return. */
  readonly expected: 'ok' | NameFormatErrorCode | NameErrorCode;
}

export const NAME_FORMAT_VECTORS: readonly NameFormatVector[] = [
  // Length boundaries (3..16)
  { input: 'Ali', normalized: 'Ali', expected: 'ok' },
  { input: 'Al', normalized: 'Al', expected: 'name_too_short' },
  { input: 'abcdefghijklmnop', normalized: 'abcdefghijklmnop', expected: 'ok' },
  { input: 'abcdefghijklmnopq', normalized: 'abcdefghijklmnopq', expected: 'name_too_long' },
  { input: '', normalized: '', expected: 'name_too_short' },
  { input: '     ', normalized: '', expected: 'name_too_short' },

  // Normalization: trim and collapse ASCII spaces
  { input: '  Ali  ', normalized: 'Ali', expected: 'ok' },
  { input: 'Ali   Ben', normalized: 'Ali Ben', expected: 'ok' },
  { input: '  Ali    Ben   Salah ', normalized: 'Ali Ben Salah', expected: 'ok' },
  { input: ' Al ', normalized: 'Al', expected: 'name_too_short' },
  { input: 'A  b', normalized: 'A b', expected: 'ok' },
  // Collapsing brings 17 chars down to 16
  { input: 'abcdefgh  ijklmno', normalized: 'abcdefgh ijklmno', expected: 'ok' },

  // ASCII letters and digits
  { input: 'Player42', normalized: 'Player42', expected: 'ok' },
  { input: '1234', normalized: '1234', expected: 'ok' },

  // Latin-1 accented letters
  { input: 'Zoé', normalized: 'Zoé', expected: 'ok' }, // Zoé
  { input: 'Hédi', normalized: 'Hédi', expected: 'ok' }, // Hédi
  { input: 'Éloïse', normalized: 'Éloïse', expected: 'ok' }, // Éloïse
  { input: 'François', normalized: 'François', expected: 'ok' }, // François
  { input: 'A×B', normalized: 'A×B', expected: 'name_bad_chars' }, // × multiplication sign
  { input: 'A÷B', normalized: 'A÷B', expected: 'name_bad_chars' }, // ÷ division sign

  // Arabic letters, including the Tunisian/Maghrebi extras
  { input: 'محمد', normalized: 'محمد', expected: 'ok' }, // محمد
  { input: 'هادي', normalized: 'هادي', expected: 'ok' }, // هادي
  { input: 'ڤيال', normalized: 'ڤيال', expected: 'ok' }, // ڤيال (ڤ U+06A4)
  { input: 'ڨالب', normalized: 'ڨالب', expected: 'ok' }, // ڨالب (ڨ U+06A8)
  { input: 'پابا', normalized: 'پابا', expected: 'ok' }, // پابا (پ U+067E)
  { input: 'علي  بن', normalized: 'علي بن', expected: 'ok' }, // علي  بن

  // Mixed Latin + Arabic
  { input: 'Ali علي', normalized: 'Ali علي', expected: 'ok' },
  { input: 'هاديZoé', normalized: 'هاديZoé', expected: 'ok' },

  // Digits: ASCII and Arabic-Indic (U+0660-U+0669) accepted
  { input: 'علي٠٧', normalized: 'علي٠٧', expected: 'ok' }, // علي٠٧
  { input: '٠١٢٣٤٥٦٧٨٩', normalized: '٠١٢٣٤٥٦٧٨٩', expected: 'ok' },
  { input: 'Ali07', normalized: 'Ali07', expected: 'ok' },
  // Eastern Arabic-Indic (U+06F0-U+06F9) rejected
  { input: 'Ali۰', normalized: 'Ali۰', expected: 'name_bad_chars' },
  { input: 'Ali۹', normalized: 'Ali۹', expected: 'name_bad_chars' },

  // Bidi controls
  { input: 'Ali‎Ben', normalized: 'Ali‎Ben', expected: 'name_bad_chars' }, // LRM
  { input: 'Ali‏Ben', normalized: 'Ali‏Ben', expected: 'name_bad_chars' }, // RLM
  { input: 'Ali‪Ben', normalized: 'Ali‪Ben', expected: 'name_bad_chars' }, // LRE
  { input: 'Ali‫Ben', normalized: 'Ali‫Ben', expected: 'name_bad_chars' }, // RLE
  { input: 'Ali‬Ben', normalized: 'Ali‬Ben', expected: 'name_bad_chars' }, // PDF
  { input: 'Ali‭Ben', normalized: 'Ali‭Ben', expected: 'name_bad_chars' }, // LRO
  { input: 'Ali‮Ben', normalized: 'Ali‮Ben', expected: 'name_bad_chars' }, // RLO
  { input: 'Ali⁦Ben', normalized: 'Ali⁦Ben', expected: 'name_bad_chars' }, // LRI
  { input: 'Ali⁧Ben', normalized: 'Ali⁧Ben', expected: 'name_bad_chars' }, // RLI
  { input: 'Ali⁨Ben', normalized: 'Ali⁨Ben', expected: 'name_bad_chars' }, // FSI
  { input: 'Ali⁩Ben', normalized: 'Ali⁩Ben', expected: 'name_bad_chars' }, // PDI

  // Zero-width characters
  { input: 'Ali​Ben', normalized: 'Ali​Ben', expected: 'name_bad_chars' }, // ZWSP
  { input: 'Ali‌Ben', normalized: 'Ali‌Ben', expected: 'name_bad_chars' }, // ZWNJ
  { input: 'Ali‍Ben', normalized: 'Ali‍Ben', expected: 'name_bad_chars' }, // ZWJ
  { input: 'Ali﻿Ben', normalized: 'Ali﻿Ben', expected: 'name_bad_chars' }, // BOM / ZWNBSP

  // Tatweel and harakat
  { input: 'عـلي', normalized: 'عـلي', expected: 'name_bad_chars' }, // tatweel
  { input: 'عًلي', normalized: 'عًلي', expected: 'name_bad_chars' }, // fathatan U+064B
  { input: 'عَلي', normalized: 'عَلي', expected: 'name_bad_chars' }, // fatha U+064E
  { input: 'عّلي', normalized: 'عّلي', expected: 'name_bad_chars' }, // shadda U+0651
  { input: 'عْلي', normalized: 'عْلي', expected: 'name_bad_chars' }, // sukun U+0652
  { input: 'عٟلي', normalized: 'عٟلي', expected: 'name_bad_chars' }, // U+065F

  // Other whitespace and symbols
  { input: 'Ali\tBen', normalized: 'Ali\tBen', expected: 'name_bad_chars' }, // tab
  { input: 'Ali Ben', normalized: 'Ali Ben', expected: 'name_bad_chars' }, // no-break space
  { input: 'Ali\nBen', normalized: 'Ali\nBen', expected: 'name_bad_chars' },
  { input: 'Ali_Ben', normalized: 'Ali_Ben', expected: 'name_bad_chars' },
  { input: 'Ali.B', normalized: 'Ali.B', expected: 'name_bad_chars' },
  { input: '<b>Ali</b>', normalized: '<b>Ali</b>', expected: 'name_bad_chars' },

  // Emoji: characters are checked before length
  { input: 'Ali😀', normalized: 'Ali😀', expected: 'name_bad_chars' }, // 😀
  { input: '😀', normalized: '😀', expected: 'name_bad_chars' }, // 2 code units, still bad chars
  { input: 'abcdefghijklmnop🃏', normalized: 'abcdefghijklmnop🃏', expected: 'name_bad_chars' }, // 🃏, too long too
];
