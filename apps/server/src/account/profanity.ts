/**
 * Profanity and reserved-word check for display names. Pure and server-only:
 * the lists ship in the module and never reach the client.
 *
 * Every name and every list word goes through `foldName` first, so one entry
 * catches its case, accent, leetspeak and Arabic-spelling variants. Each entry
 * then matches in one of two ways:
 * - `substring`: anywhere in the whole folded name (spaces stripped). Only for
 *   long, unambiguous roots that no real name contains, so "xFuckx" and
 *   "f u c k" are caught.
 * - `word`: a whole space-separated token, or the whole name with its spaces
 *   stripped. For short words that hide inside real names (Scunthorpe problem):
 *   "nique" in Monique, "nazi" in Nazih, "زب" in زبيدة (Zoubeida).
 *
 * Known gaps, accepted to keep false positives at zero: repeated letters
 * ("fuuuck") and words glued to other text when listed as `word`.
 */

export type MatchMode = 'word' | 'substring';

export interface BlockedWord {
  readonly word: string;
  readonly match: MatchMode;
}

/** English obscenities and slurs. "dick" is left out: Dick is a real name. */
export const EN_BLOCKED: readonly BlockedWord[] = [
  { word: 'fuck', match: 'substring' },
  { word: 'cunt', match: 'substring' },
  { word: 'nigger', match: 'substring' },
  { word: 'nigga', match: 'substring' },
  { word: 'faggot', match: 'substring' },
  { word: 'whore', match: 'substring' },
  { word: 'bitch', match: 'substring' },
  { word: 'bastard', match: 'substring' },
  { word: 'asshole', match: 'substring' },
  { word: 'dickhead', match: 'substring' },
  { word: 'pussy', match: 'substring' },
  { word: 'penis', match: 'substring' },
  { word: 'wanker', match: 'substring' },
  { word: 'retard', match: 'substring' },
  { word: 'rapist', match: 'substring' },
  { word: 'hitler', match: 'substring' },
  { word: 'shit', match: 'word' }, // Kshitij
  { word: 'cock', match: 'word' }, // Hancock, Peacock
  { word: 'porn', match: 'word' }, // Pornchai
  { word: 'slut', match: 'word' },
  { word: 'fag', match: 'word' },
  { word: 'tits', match: 'word' },
  { word: 'anal', match: 'word' }, // Analia
  { word: 'cum', match: 'word' },
  { word: 'rape', match: 'word' },
  { word: 'nazi', match: 'word' }, // Nazih, Nazir
];

/** French obscenities and slurs, written without accents (folding strips them). */
export const FR_BLOCKED: readonly BlockedWord[] = [
  { word: 'encule', match: 'substring' }, // enculé: "fucked" (in the arse)
  { word: 'salope', match: 'substring' }, // slut
  { word: 'salaud', match: 'substring' }, // bastard
  { word: 'connard', match: 'substring' }, // asshole (m.)
  { word: 'connasse', match: 'substring' }, // asshole (f.)
  { word: 'putain', match: 'substring' }, // whore / "fuck!"
  { word: 'enfoire', match: 'substring' }, // enfoiré: bastard
  { word: 'batard', match: 'substring' }, // bâtard: bastard
  { word: 'couille', match: 'substring' }, // balls
  { word: 'merde', match: 'substring' }, // shit
  { word: 'tapette', match: 'substring' }, // gay slur
  { word: 'bougnoule', match: 'substring' }, // racist slur for Arabs
  { word: 'youpin', match: 'substring' }, // antisemitic slur
  { word: 'niquetamere', match: 'substring' }, // "fuck your mother"
  { word: 'nique', match: 'word' }, // "fuck"; Monique, Dominique
  { word: 'pute', match: 'word' }, // whore; Dispute
  { word: 'pede', match: 'word' }, // pédé: gay slur; Pedersen
  { word: 'conne', match: 'word' }, // stupid bitch; Conner
  { word: 'bite', match: 'word' }, // dick
  { word: 'negre', match: 'word' }, // nègre: racist slur; Negrete
  { word: 'ntm', match: 'word' }, // "nique ta mère"
  { word: 'fdp', match: 'word' }, // "fils de pute"
  { word: 'pd', match: 'word' }, // pédé
];

/** Tunisian Derja in Arabic script. */
export const DERJA_ARABIC_BLOCKED: readonly BlockedWord[] = [
  { word: 'قحبة', match: 'substring' }, // 9a7ba: whore
  { word: 'شرموطة', match: 'substring' }, // charmouta: whore
  { word: 'عاهرة', match: 'substring' }, // 3ahra: prostitute
  { word: 'منيوك', match: 'substring' }, // manyouk: "fucked one"
  { word: 'ميبون', match: 'substring' }, // miboun: gay slur
  { word: 'لوطي', match: 'substring' }, // louti: sodomite, gay slur
  { word: 'نيكمك', match: 'substring' }, // nikomok: "fuck your mother"
  { word: 'نيك امك', match: 'substring' }, // same, two words
  { word: 'زكمك', match: 'substring' }, // zokomok: "your mother's cunt"
  { word: 'كسمك', match: 'substring' }, // kossomok: same (Levantine/Egyptian)
  { word: 'يلعن', match: 'substring' }, // yal3an: "(God) curse ...", as in curse your religion
  { word: 'زب', match: 'word' }, // zeb: dick; زبيدة (Zoubeida)
  { word: 'زبي', match: 'word' }, // zebbi: "my dick"; زبيدة
  { word: 'زك', match: 'word' }, // zok: cunt; زكي (Zaki), زكرياء (Zakaria)
  { word: 'كس', match: 'word' }, // koss: cunt; كسرى (Kisra)
  { word: 'نيك', match: 'word' }, // nik: fuck; نيكول (Nicole)
  { word: 'نايك', match: 'word' }, // nayek: fucker; نايكي (Nike)
  { word: 'طيز', match: 'word' }, // tiz: arse
  { word: 'زامل', match: 'word' }, // zamel: gay slur in Tunisia (elsewhere the name Zamil)
  { word: 'عطاي', match: 'word' }, // 3attay: gay slur; عطايا
];

/** Tunisian Derja in Latin script (Arabizi), as Tunisians commonly type it. */
export const DERJA_LATIN_BLOCKED: readonly BlockedWord[] = [
  { word: '9a7ba', match: 'substring' }, // whore
  { word: '9ahba', match: 'substring' },
  { word: 'qa7ba', match: 'substring' },
  { word: 'kahba', match: 'substring' },
  { word: 'charmouta', match: 'substring' }, // whore
  { word: 'sharmouta', match: 'substring' },
  { word: 'manyouk', match: 'substring' }, // "fucked one"
  { word: 'miboun', match: 'substring' }, // gay slur
  { word: 'nikomok', match: 'substring' }, // "fuck your mother"
  { word: 'nikomek', match: 'substring' },
  { word: 'zokomok', match: 'substring' }, // "your mother's cunt"
  { word: 'zebi', match: 'word' }, // "my dick"
  { word: 'zebbi', match: 'word' },
  { word: 'zok', match: 'word' }, // cunt
  { word: 'nayek', match: 'word' }, // fucker
  { word: 'zamel', match: 'word' }, // gay slur
];

/**
 * Staff and brand words (Decision 11). Substrings, so "ChkobbaAdmin" and
 * "Official X" are caught; no common name contains any of them. Bot names
 * (Hedi, Sonia, Mongi, Fatma) are deliberately not reserved.
 */
export const RESERVED_WORDS: readonly BlockedWord[] = [
  { word: 'admin', match: 'substring' },
  { word: 'moderator', match: 'substring' },
  { word: 'support', match: 'substring' },
  { word: 'official', match: 'substring' },
  { word: 'chkobba', match: 'substring' },
  { word: 'chkoba', match: 'substring' },
  { word: 'شكبة', match: 'substring' }, // chkobba in Arabic script
];

/**
 * Character folds, applied after lowercasing. Escapes keep lookalike Arabic
 * letters reviewable. Arabic-Indic digits go to their ASCII digit first, then
 * through leetspeak like the ASCII ones.
 */
const FOLD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  // Leetspeak. `@` can't pass the format check; kept for parity with the plan.
  ['0', 'o'], ['1', 'i'], ['3', 'e'], ['4', 'a'], ['5', 's'], ['@', 'a'],
  ['٠', 'o'], ['١', 'i'], ['٢', '2'], ['٣', 'e'], ['٤', 'a'],
  ['٥', 's'], ['٦', '6'], ['٧', '7'], ['٨', '8'], ['٩', '9'],
  // Arabic spelling variants: أ إ آ → ا, ة → ه, ى → ي.
  ['أ', 'ا'], ['إ', 'ا'], ['آ', 'ا'],
  ['ة', 'ه'], ['ى', 'ي'],
  // Tunisian/Persian letters to their base letter: ڤ → ف, ڨ → ق, پ → ب.
  ['ڤ', 'ف'], ['ڨ', 'ق'], ['پ', 'ب'],
  // Latin-1 accents (String.prototype.normalize isn't relied on in goja).
  ['à', 'a'], ['á', 'a'], ['â', 'a'], ['ã', 'a'], ['ä', 'a'], ['å', 'a'],
  ['æ', 'ae'], ['ç', 'c'],
  ['è', 'e'], ['é', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['ì', 'i'], ['í', 'i'], ['î', 'i'], ['ï', 'i'],
  ['ð', 'd'], ['ñ', 'n'],
  ['ò', 'o'], ['ó', 'o'], ['ô', 'o'], ['õ', 'o'], ['ö', 'o'], ['ø', 'o'],
  ['ù', 'u'], ['ú', 'u'], ['û', 'u'], ['ü', 'u'],
  ['ý', 'y'], ['ÿ', 'y'], ['þ', 'th'], ['ß', 'ss'],
];

const FOLD_MAP: { readonly [ch: string]: string } = buildFoldMap(FOLD_PAIRS);

interface FoldedEntry {
  readonly folded: string;
  readonly match: MatchMode;
}

const ALL_ENTRIES: readonly FoldedEntry[] = EN_BLOCKED.concat(
  FR_BLOCKED,
  DERJA_ARABIC_BLOCKED,
  DERJA_LATIN_BLOCKED,
  RESERVED_WORDS
).map((entry) => ({ folded: foldName(entry.word), match: entry.match }));

/**
 * Comparison form of a name: lowercased, spaces stripped, leetspeak, accents
 * and Arabic spelling variants mapped to one letter each.
 */
export function foldName(name: string): string {
  const lower = name.toLowerCase();
  let out = '';
  for (let i = 0; i < lower.length; i++) {
    const ch = lower.charAt(i);
    if (ch === ' ') continue;
    out += Object.prototype.hasOwnProperty.call(FOLD_MAP, ch) ? FOLD_MAP[ch] : ch;
  }
  return out;
}

/**
 * True unless the name contains a blocked or reserved word. Expects the output
 * of `normalizeDisplayName` (single ASCII spaces between tokens).
 */
export function isNameAllowed(normalized: string): boolean {
  const whole = foldName(normalized);
  const tokens = normalized.split(' ').map(foldName);
  for (const entry of ALL_ENTRIES) {
    const hit =
      entry.match === 'substring'
        ? whole.indexOf(entry.folded) !== -1
        : whole === entry.folded || tokens.indexOf(entry.folded) !== -1;
    if (hit) return false;
  }
  return true;
}

function buildFoldMap(pairs: ReadonlyArray<readonly [string, string]>): { [ch: string]: string } {
  const map: { [ch: string]: string } = {};
  for (const [from, to] of pairs) map[from] = to;
  return map;
}
