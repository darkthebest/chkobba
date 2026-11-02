import type { en } from './locales/en';

// Types `t()` keys and interpolation from the English catalog.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}
