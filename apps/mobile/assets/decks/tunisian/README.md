# Tunisian deck

The Café Tunisien card faces. Files are named by engine card id (`7D` = seven of diamonds).

- **Source:** the "Chkobba" deck by [Abjiklam](https://commons.wikimedia.org/wiki/User:Abjiklam) on Wikimedia Commons ([category](https://commons.wikimedia.org/wiki/Category:Chkobba)). The back is `back.svg`, from [Chkobba_dos.svg](https://commons.wikimedia.org/wiki/File:Chkobba_dos.svg).
- **Licence:**
  - Number cards (A–7) are CC0.
  - Court cards (Q, J, K) and the back are [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The courts are derived from the French-pattern court cards on Commons. Credit the author in the app's credits. Changes to this artwork must be shared under the same licence.
- **Mapping:** Commons numbers each suit 01–10 by chkobba value. 01–07 are A–7, 08 is the Queen, 09 the Jack and 10 the King. The suits map as carreau D, cœur H, pique S, trèfle C.
- **Changes:**
  - The card files were optimised with `svgo@3.3.2 -p 1`, after renaming the invalid `<def>` element to `<defs>`.
  - In `back.svg`, the font size `2.5pt` was rewritten as `3.33`, because react-native-svg on native does not read `pt` units.

After editing a file here, regenerate the inlined module with `node scripts/build-tunisian-deck.mjs`, run from `apps/mobile`.
