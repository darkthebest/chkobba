# Sounds

Card sounds and the café loop are real recordings under CC0 (public domain): no credit is required, though we thank the authors here. The chimes and jingles are synthesized by our own script.

| File | Plays when | Source |
|---|---|---|
| `place-1…4.mp3` | any card is played (a random take) | Kenney, [Casino Audio](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) `card-place-1…4`, CC0 |
| `sweep-1…2.mp3` | captured cards sweep off the table | Kenney, Casino Audio `card-shove-1`, `card-shove-3`, CC0 |
| `shuffle.mp3` | the first deal of a round | Kenney, Casino Audio `card-shuffle`, CC0 |
| `deal.mp3` | the later deals of a round | Kenney, Casino Audio `card-fan-1`, CC0 |
| `ambience-cafe.mp3` | always, as the background loop (every table style for now) | BigSoundBank [#2561](https://bigsoundbank.com/sound-2561-brulerie-du-leon-aux-capucins.html), café "Brûlerie du Léon", Brest, CC0 |
| `chkobba.mp3` | the chkobba celebration (a darbuka phrase) | synthesized, `scripts/build-sounds.mjs` |
| `turn.mp3`, `tick.mp3` | online: your turn; your clock's last 5 seconds | synthesized |
| `roundEnd.mp3`, `win.mp3`, `lose.mp3` | the round or game summary | synthesized |

## Rebuilding

From `apps/mobile`, with ffmpeg (libmp3lame):

- Recordings: download the Kenney zip (unzipped to `<dir>/kenney`) and BigSoundBank's `UPLOAD/mp3/2561.mp3` (saved as `<dir>/bsb-2561.mp3`), then `node scripts/prepare-recordings.mjs <dir>`. It converts to mono MP3 (iOS can't play OGG), trims silence, and turns the café's calm 120–210 s into a 90 s seamless loop at about −25 LUFS.
- Synthesized sounds: `node scripts/build-sounds.mjs`.

## Replacing a sound

Drop a file with the same name here (short, mono). A new recording needs a licence that allows shipping in the app: prefer CC0, and credit CC BY authors in the app. A table style gets its own loop by setting `ambience` on its `Skin`; until then styles reuse `CAFE_AMBIENCE`.
