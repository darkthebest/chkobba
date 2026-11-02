# Add a language

The app ships English (`en`) and Tunisian Derja in Arabic script (`aeb`, right to left). Everything lives in `apps/mobile/src/i18n/`.

## Stack

| Piece | Role |
|---|---|
| `i18next` + `react-i18next` | Catalogs, interpolation, plurals, the `useT()` hook |
| `expo-localization` | First-launch default from the device locales |
| `LanguageProvider` | Holds the language (saved in AsyncStorage), sets the layout direction, sets `<html lang dir>` on web |
| `DirectionView` | Pins a view to `ltr`/`rtl`: the `dir` attribute on web, the `direction` style on native |

Switching language takes effect at once, with no app restart. Direction is our own root `DirectionView`, not React Native's `I18nManager`. `I18nManager` would need a reload and would follow the device rather than the player's choice. For the same reason `app.json` sets `supportsRTL: false` on the `expo-localization` plugin.

## Steps

1. **Register it** in `src/i18n/languages.ts`:

   ```ts
   fr: { nativeName: 'Français', dir: 'ltr', script: 'latin' },
   ```

   Use a BCP 47 code. `nativeName` is what the Settings picker shows. If the device should default to it, extend `languageForLocales`.

2. **Write the catalog** at `src/i18n/locales/fr.ts`:

   ```ts
   import type { Translation } from './en';
   export const fr: Translation = { /* every key from en.ts */ };
   ```

   `Translation` is derived from `en.ts`, so `pnpm typecheck` fails until every key exists.

   - Keep each `{{placeholder}}`; `catalogs.test.ts` checks them.
   - Plurals use `_one` / `_other` (plus `_zero`, `_two`, `_few`, `_many` where `Intl.PluralRules` has them for the language).
   - "You" lines use the `_you` context.

3. **Bundle it** in `src/i18n/i18n.ts`: `resources.fr = { translation: fr }`.

4. **Fonts for a new script.** Skins hold one Latin and one Arabic font set (`tokens.fonts.arabic` / `arabicBody`). `localizeSkin` swaps them in when `script === 'arabic'`. A new script (Cyrillic, Hebrew…) needs a new `Script` value, fonts in `SKIN_FONTS`, tokens per skin, and a branch in `localizeSkin` and `useScriptFont`.

5. **Run** `pnpm --filter @chkobba/mobile test`, then switch the language in Settings on phone width and desktop width.

## Right-to-left languages

Set `dir: 'rtl'`. The root then flips, and:

- **Rows** lay out right to left.
- **`marginStart` / `paddingEnd` / `start` / `end`** follow the direction. **`left` / `right` / `marginLeft` do not.** Use the logical props for anything that should mirror, and physical ones for things that must not (the Café notebook margin, card corner badges).
- **Spatial things stay left to right** through `DirectionView dir="ltr"`: card faces, the hand fan, capture chips, and the table with its seats and card motion. Wrap any new spatial component the same way.
- **Text direction** comes from the first strong character (`dir="auto"` on web). Two things keep mixed lines readable, both automatic in `i18n.ts` for RTL languages:
  - Every translation starts with an invisible RIGHT-TO-LEFT MARK, so a line that opens with a Latin name still reads right to left.
  - Every interpolated value is wrapped in Unicode isolates: `isolate()`, left-to-right for names and cards like `5♥`, first-strong for Arabic text.
- **Don't** put Arabic and Latin text in one hard-coded string, and don't build sentences by concatenating translations. Use one key with placeholders.

## Writing strings

- Components call `const tr = useT();`. The name is `tr` because `t` already means the skin tokens.
- Non-React helpers take the translator as an argument, e.g. `describeEvent(event, players, mySeat, tr)` and `onlineErrorMessage(code, tr)`, so they re-render on a language change.
- Brand marks (the "Chkobba شكبّة" wordmark, the "شكبّة! CHKOBBA!" stamp) are artwork and stay as they are.
