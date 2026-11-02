import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';

import { DirectionView } from './DirectionView';

import { i18n } from './i18n';
import { DEFAULT_LANGUAGE, isLanguageCode, LANGUAGES, languageForLocales, type LanguageCode, type Script, type TextDirection } from './languages';

const STORAGE_KEY = 'chkobba.language';

interface LanguageContextValue {
  language: LanguageCode;
  dir: TextDirection;
  script: Script;
  setLanguage: (code: LanguageCode) => void;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: DEFAULT_LANGUAGE,
  dir: LANGUAGES[DEFAULT_LANGUAGE].dir,
  script: LANGUAGES[DEFAULT_LANGUAGE].script,
  setLanguage: () => {},
});

function deviceLanguage(): LanguageCode {
  try {
    return languageForLocales(getLocales().map((locale) => locale.languageTag));
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Holds the UI language: the saved choice, else the device's. Right-to-left
 * languages flip the layout on one root `DirectionView`,
 * so switching takes effect at once (no `I18nManager` restart). On the web it
 * also sets `<html lang dir>` for the browser and screen readers.
 */
export function LanguageProvider({ children, initial }: { children: ReactNode; initial?: LanguageCode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => initial ?? deviceLanguage());
  const { dir, script } = LANGUAGES[language];

  useEffect(() => {
    if (initial) return;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (isLanguageCode(saved)) setLanguageState(saved);
      })
      .catch(() => {});
  }, [initial]);

  useEffect(() => {
    void i18n.changeLanguage(language);
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.lang = language;
      document.documentElement.dir = dir;
    }
  }, [language, dir]);

  const setLanguage = (code: LanguageCode) => {
    setLanguageState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  };

  return (
    <LanguageContext.Provider value={{ language, dir, script, setLanguage }}>
      <DirectionView dir={dir} style={styles.root} testID="language-root">
        {children}
      </DirectionView>
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
