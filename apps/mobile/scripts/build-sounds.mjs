// Synthesizes the game's chimes and jingles into assets/sounds (original sounds, no licence to track).
// Card sounds and the café loop are recordings: see scripts/prepare-recordings.mjs.
// Needs ffmpeg with libmp3lame. Run from apps/mobile: node scripts/build-sounds.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'assets/sounds';
const RATE = 44100;

// ffmpeg expression helpers; `t` is time in seconds. Each helper is silent before its start time `at`.
const noise = (slot) => `(random(${slot})*2-1)`;
const after = (at, expr) => `gte(t,${at})*(${expr.replaceAll('T', `(t-${at})`)})`;
const sine = (freq) => `sin(2*PI*${freq}*T)`;
const decay = (rate) => `exp(-T*${rate})`;
const sum = (...parts) => parts.join('+');

/** A plucked note with a few harmonics, a little like an oud or a kanoun. */
const pluck = (at, freq, gain = 0.3, rate = 5) =>
  after(at, `${gain}*(${sine(freq)}+0.45*${sine(freq * 2)}+0.2*${sine(freq * 3)})*${decay(rate)}`);

/** Darbuka "doum": a low skin hit whose pitch drops from 160 to 85 Hz. */
const doum = (at, gain = 0.8) =>
  after(at, `${gain}*sin(2*PI*(85*T+75*(1-exp(-T*18))/18))*${decay(9)}+${gain * 0.25}*${noise(1)}*${decay(120)}`);

/** Darbuka "tek": a sharp rim hit. */
const tek = (at, gain = 0.5) => after(at, `${gain}*(0.6*${noise(2)}*${decay(70)}+0.5*${sine(620)}*${decay(45)})`);

const SOUNDS = {
  // Your turn: two soft bell notes.
  turn: { d: 0.8, expr: sum(after(0, `0.3*${sine(1046.5)}*${decay(7)}`), after(0.11, `0.26*${sine(1568)}*${decay(6)}`)) },
  // The last seconds of the turn clock.
  tick: { d: 0.06, expr: sum(after(0, `0.5*${sine(1800)}*${decay(250)}`), after(0, `0.25*${noise(0)}*${decay(400)}`)) },
  // Chkobba: a darbuka phrase (doum tek-tek doum, a roll, a big doum) and a bright chord.
  chkobba: {
    d: 1.7,
    expr: sum(
      doum(0),
      tek(0.15),
      tek(0.225),
      doum(0.3),
      tek(0.45),
      tek(0.5),
      tek(0.55, 0.4),
      doum(0.6, 1),
      pluck(0.62, 1318.5, 0.16, 3),
      pluck(0.66, 1760, 0.14, 3),
    ),
  },
  // Round over: two calm notes.
  roundEnd: { d: 1, expr: sum(pluck(0, 784), pluck(0.16, 1046.5)) },
  // Game won: a rising arpeggio.
  win: { d: 1.5, expr: sum(pluck(0, 523.25), pluck(0.11, 659.25), pluck(0.22, 784), pluck(0.33, 1046.5, 0.35, 3)) },
  // Game lost: a slow falling minor line.
  lose: { d: 1.4, expr: sum(pluck(0, 392, 0.25, 4), pluck(0.22, 311.13, 0.25, 4), pluck(0.44, 261.63, 0.28, 3)) },
};

mkdirSync(OUT, { recursive: true });
for (const [name, { d, expr, filters }] of Object.entries(SOUNDS)) {
  const graph = [`aevalsrc=exprs='${expr}':s=${RATE}:d=${d}`, filters, 'afade=t=out:st=' + (d - 0.03) + ':d=0.03', 'alimiter=limit=0.9:level=false']
    .filter(Boolean)
    .join(',');
  const file = join(OUT, `${name}.mp3`);
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', graph, '-ac', '1', '-c:a', 'libmp3lame', '-q:a', '4', file]);
  console.log(`wrote ${file}`);
}
