// Converts the downloaded CC0 recordings into assets/sounds (see assets/sounds/README.md for the sources).
// Needs ffmpeg with libmp3lame. Run from apps/mobile: node scripts/prepare-recordings.mjs <downloads-dir>
//   <downloads-dir>/kenney/Audio/*.ogg  Kenney "Casino Audio" (opengameart.org/content/54-casino-sound-effects-cards-dice-chips)
//   <downloads-dir>/bsb-2561.mp3        BigSoundBank #2561, café "Brûlerie du Léon" (bigsoundbank.com)
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const OUT = 'assets/sounds';
const dir = process.argv[2];
if (!dir) throw new Error('usage: node scripts/prepare-recordings.mjs <downloads-dir>');
const kenney = (name) => join(dir, 'kenney/Audio', `${name}.ogg`);

const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const MP3 = ['-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame'];

// Card effects: mono, trailing silence trimmed.
const EFFECTS = {
  'place-1': 'card-place-1',
  'place-2': 'card-place-2',
  'place-3': 'card-place-3',
  'place-4': 'card-place-4',
  'sweep-1': 'card-shove-1',
  'sweep-2': 'card-shove-3',
  shuffle: 'card-shuffle',
  deal: 'card-fan-1',
};
for (const [name, source] of Object.entries(EFFECTS)) {
  const trim = 'areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse';
  ffmpeg(['-i', kenney(source), '-af', trim, ...MP3, '-q:a', '4', join(OUT, `${name}.mp3`)]);
  console.log(`wrote ${name}.mp3`);
}

// Café loop: the calm 120–210 s stretch, its end crossfaded into its start so it loops without a seam,
// levelled to a quiet background loudness.
const START = 120;
const LENGTH = 90;
const FADE = 3;
const loop = [
  `[0:a]atrim=${START}:${START + LENGTH + FADE},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,asplit=3[a][b][c]`,
  `[a]atrim=0:${FADE},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE}[head]`,
  `[b]atrim=${FADE}:${LENGTH},asetpts=PTS-STARTPTS[body]`,
  `[c]atrim=${LENGTH}:${LENGTH + FADE},asetpts=PTS-STARTPTS,afade=t=out:d=${FADE}[tail]`,
  `[tail][head]amix=inputs=2:normalize=0[seam]`,
  `[body][seam]concat=n=2:v=0:a=1,loudnorm=I=-24:TP=-3,aresample=44100,asetpts=N/SR/TB[out]`,
].join(';');
ffmpeg(['-i', join(dir, 'bsb-2561.mp3'), '-filter_complex', loop, '-map', '[out]', ...MP3, '-b:a', '64k', join(OUT, 'ambience-cafe.mp3')]);
console.log('wrote ambience-cafe.mp3');
