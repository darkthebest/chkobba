/**
 * Seeded, serializable PRNG (sfc32, seeded through cyrb128). The generator state
 * is a plain tuple so it can live inside GameState and survive serialization,
 * which keeps the engine deterministic and replayable.
 */
export type RngState = readonly [number, number, number, number];

/** Hashes an arbitrary string seed into a 128-bit sfc32 state. */
export function seedRng(seed: string | number): RngState {
  const str = String(seed);
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Returns a float in [0, 1) and the advanced state. */
export function nextFloat(state: RngState): [number, RngState] {
  let [a, b, c, d] = state;
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  let t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  d = (d + 1) | 0;
  t = (t + d) | 0;
  c = (c + t) | 0;
  return [(t >>> 0) / 4294967296, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
}

/** Fisher–Yates shuffle; returns a new array and the advanced state. */
export function shuffle<T>(items: readonly T[], state: RngState): [T[], RngState] {
  const out = items.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const [r, next] = nextFloat(s);
    s = next;
    const j = Math.floor(r * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return [out, s];
}

/** Convenience mutable wrapper for callers (bots, simulations) that want `() => number`. */
export function createRandom(seed: string | number): () => number {
  let s = seedRng(seed);
  return () => {
    const [r, next] = nextFloat(s);
    s = next;
    return r;
  };
}
