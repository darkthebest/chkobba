import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

export { DirectionView } from './DirectionView';
export { i18n } from './i18n';
export { LanguageProvider, useLanguage } from './LanguageProvider';
export {
  DEFAULT_LANGUAGE,
  isLanguageCode,
  LANGUAGE_CODES,
  LANGUAGES,
  languageForLocales,
  type LanguageCode,
  type Script,
  type TextDirection,
} from './languages';
export type { TFunction };

/**
 * The translate function for the current language. Components name it `tr`,
 * since `t` is already the skin tokens everywhere.
 */
export function useT(): TFunction {
  return useTranslation().t;
}
