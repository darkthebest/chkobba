import { languageForLocales } from '../languages';

describe('languageForLocales', () => {
  it.each([
    { scenario: 'an English device', locales: ['en-US'], expected: 'en' },
    { scenario: 'a Tunisian Arabic device', locales: ['ar-TN'], expected: 'aeb' },
    { scenario: 'any Arabic device', locales: ['ar-EG'], expected: 'aeb' },
    { scenario: 'an explicit Derja locale', locales: ['aeb-Arab-TN'], expected: 'aeb' },
    { scenario: 'an unsupported first choice', locales: ['fr-TN', 'ar-TN'], expected: 'aeb' },
    { scenario: 'only unsupported locales', locales: ['fr-FR', 'de'], expected: 'en' },
    { scenario: 'no locales', locales: [], expected: 'en' },
    { scenario: 'missing language tags', locales: [null, undefined, ''], expected: 'en' },
  ])('picks $expected for $scenario', ({ locales, expected }) => {
    expect(languageForLocales(locales)).toBe(expected);
  });
});
