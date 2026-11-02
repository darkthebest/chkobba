import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGES } from './languages';
import { aeb } from './locales/aeb';
import { en } from './locales/en';

/** Every catalog, bundled (no network loading). Register a new language here. */
export const resources = {
  en: { translation: en },
  aeb: { translation: aeb },
} as const;

const i18n = createInstance();

/** Arabic-script letters (Arabic, Supplement, Extended-A, Presentation Forms). */
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Wraps `text` in invisible Unicode isolates so it lays out on its own inside a
 * sentence of the other direction. Arabic-script text gets FIRST STRONG ISOLATE;
 * anything else (a Latin name, a card like "5♥" with no letters at all) gets
 * LEFT-TO-RIGHT ISOLATE, so "5♥" never shows as "♥5".
 */
export function isolate(text: string): string {
  return `${ARABIC.test(text) ? '\u2068' : '\u2066'}${text}\u2069`;
}

function isRtl(language: string): boolean {
  return isLanguageCode(language) && LANGUAGES[language].dir === 'rtl';
}

/** RIGHT-TO-LEFT MARK: invisible, strongly right-to-left. */
export const RLM = '\u200F';

// Text views pick their direction from the first strong character (react-native-web
// renders `dir="auto"`), so a Derja line starting with a Latin name would lay out
// left to right. Leading every right-to-left translation with RLM pins it.
i18n.use({
  type: 'postProcessor',
  name: 'rtlMark',
  process: (value: string) => (isRtl(i18n.language) && !value.startsWith(RLM) ? RLM + value : value),
});

// Synchronous init: resources are bundled, so the first render already has its strings.
void i18n.use(initReactI18next).init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  initAsync: false,
  returnNull: false,
  postProcess: ['rtlMark'],
  interpolation: {
    // React Native renders text, not HTML, so "escaping" is only used for bidi: in a
    // right-to-left sentence each inserted value (a Latin name, "7♦ + 3♠") is wrapped
    // in Unicode isolates so it keeps its own direction and does not scramble the line.
    escapeValue: true,
    escape: (value: string) => (isRtl(i18n.language) ? isolate(value) : value),
  },
});

export { i18n };
