import type { TextStyle } from 'react-native';

import { useLanguage } from '@/i18n';

/**
 * For skin styles that hard-code a Latin font on translated text: `arabicFont`
 * when the language uses Arabic script, else null (keep the skin's own font).
 * Put it after the skin style: `[styles.label, font]`.
 */
export function useScriptFont(arabicFont: string): TextStyle | null {
  const { script } = useLanguage();
  return script === 'arabic' ? { fontFamily: arabicFont } : null;
}
