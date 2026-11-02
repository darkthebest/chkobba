/**
 * Every language the app ships. To add one: add an entry here, add its catalog
 * under `locales/` (typed as `Translation`, so a missing key fails typecheck)
 * and register it in `i18n.ts`. See docs/how-to/add-a-language.md.
 */
export const LANGUAGES = {
  en: { nativeName: 'English', dir: 'ltr', script: 'latin' },
  // Tunisian Arabic (Derja), ISO 639-3 `aeb`, written in Arabic script.
  aeb: { nativeName: 'تونسي', dir: 'rtl', script: 'arabic' },
} as const satisfies Record<string, { nativeName: string; dir: 'ltr' | 'rtl'; script: 'latin' | 'arabic' }>;

export type LanguageCode = keyof typeof LANGUAGES;
export type TextDirection = (typeof LANGUAGES)[LanguageCode]['dir'];
export type Script = (typeof LANGUAGES)[LanguageCode]['script'];

export const DEFAULT_LANGUAGE: LanguageCode = 'en';
export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[];

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in LANGUAGES;
}

/**
 * Best language for the device's preferred locales (BCP 47 language codes).
 * Any Arabic locale gets Derja: it is the only Arabic-script language we ship.
 */
export function languageForLocales(languageCodes: readonly (string | null | undefined)[]): LanguageCode {
  for (const code of languageCodes) {
    if (!code) continue;
    const base = code.toLowerCase().split('-')[0];
    if (base === 'aeb' || base === 'ar') return 'aeb';
    if (isLanguageCode(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}
