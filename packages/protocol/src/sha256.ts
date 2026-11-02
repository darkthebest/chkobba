/**
 * SHA-256 over the UTF-8 bytes of a string, as lowercase hex. Hand-rolled and
 * dependency-free: the server bundles this into its ES5 goja module (no
 * `crypto`, no `TextEncoder`, no `Buffer`) and the client runs it in Hermes.
 * Pure ES2017 only, and it must agree byte for byte with Nakama's
 * `nk.sha256Hash`.
 */

/** Round constants: the first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** The eight 32-bit working words chained across blocks. */
interface HashState {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
  readonly g: number;
  readonly h: number;
}

/** Initial state: the first 32 bits of the square roots of the first 8 primes. */
const INITIAL_HASH: HashState = {
  a: 0x6a09e667,
  b: 0xbb67ae85,
  c: 0x3c6ef372,
  d: 0xa54ff53a,
  e: 0x510e527f,
  f: 0x9b05688c,
  g: 0x1f83d9ab,
  h: 0x5be0cd19,
};

const BLOCK_BYTES = 64;
/** The final block ends with the message length in bits as 8 big-endian bytes. */
const LENGTH_BYTES = 8;
const HEX_DIGITS = '0123456789abcdef';
/** U+FFFD, which UTF-8 encoders write for a lone surrogate. */
const REPLACEMENT_CODE_POINT = 0xfffd;

/** Indexed read whose index is always in range; `?? 0` satisfies `noUncheckedIndexedAccess`. */
function numberAt(values: readonly number[], index: number): number {
  return values[index] ?? 0;
}

/** 32-bit right rotation. */
function rotr(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

/**
 * The code point starting at `index`, combining a surrogate pair. A lone
 * surrogate becomes U+FFFD, as `TextEncoder` does: the display-name allow-list
 * is BMP-only, but this helper must not corrupt arbitrary input.
 */
function readCodePoint(input: string, index: number): number {
  const first = input.charCodeAt(index);
  if (first < 0xd800 || first > 0xdfff) return first;
  if (first <= 0xdbff && index + 1 < input.length) {
    const second = input.charCodeAt(index + 1);
    if (second >= 0xdc00 && second <= 0xdfff) {
      return 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
    }
  }
  return REPLACEMENT_CODE_POINT;
}

/** Appends the UTF-8 encoding of one code point. */
function appendUtf8(bytes: number[], codePoint: number): void {
  if (codePoint < 0x80) {
    bytes.push(codePoint);
  } else if (codePoint < 0x800) {
    bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
  } else if (codePoint < 0x10000) {
    bytes.push(
      0xe0 | (codePoint >> 12),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    );
  } else {
    bytes.push(
      0xf0 | (codePoint >> 18),
      0x80 | ((codePoint >> 12) & 0x3f),
      0x80 | ((codePoint >> 6) & 0x3f),
      0x80 | (codePoint & 0x3f),
    );
  }
}

/** Encodes a JS UTF-16 string as UTF-8 bytes. */
function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const codePoint = readCodePoint(input, index);
    if (codePoint > 0xffff) index += 1; // the low surrogate was consumed
    appendUtf8(bytes, codePoint);
  }
  return bytes;
}

/** Appends 0x80, zero padding and the 64-bit bit length, filling whole 64-byte blocks. */
function padToBlocks(bytes: readonly number[]): number[] {
  const padded = bytes.slice();
  padded.push(0x80);
  while (padded.length % BLOCK_BYTES !== BLOCK_BYTES - LENGTH_BYTES) padded.push(0);
  const bits = bytes.length * 8;
  const high = Math.floor(bits / 0x100000000);
  const low = bits >>> 0;
  padded.push(
    (high >>> 24) & 0xff,
    (high >>> 16) & 0xff,
    (high >>> 8) & 0xff,
    high & 0xff,
    (low >>> 24) & 0xff,
    (low >>> 16) & 0xff,
    (low >>> 8) & 0xff,
    low & 0xff,
  );
  return padded;
}

/** Expands one 64-byte block into the 64-word message schedule. */
function fillSchedule(w: number[], block: readonly number[], offset: number): void {
  for (let i = 0; i < 16; i += 1) {
    const at = offset + i * 4;
    w[i] =
      ((numberAt(block, at) << 24) |
        (numberAt(block, at + 1) << 16) |
        (numberAt(block, at + 2) << 8) |
        numberAt(block, at + 3)) >>>
      0;
  }
  for (let i = 16; i < 64; i += 1) {
    const w15 = numberAt(w, i - 15);
    const w2 = numberAt(w, i - 2);
    const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3);
    const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10);
    w[i] = (numberAt(w, i - 16) + s0 + numberAt(w, i - 7) + s1) >>> 0;
  }
}

/** Compresses one message schedule into the chaining state. */
function compress(state: HashState, w: readonly number[]): HashState {
  let { a, b, c, d, e, f, g, h } = state;
  for (let i = 0; i < 64; i += 1) {
    const choose = (e & f) ^ (~e & g);
    const majority = (a & b) ^ (a & c) ^ (b & c);
    const sum1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
    const sum0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
    const temp1 = (h + sum1 + choose + numberAt(K, i) + numberAt(w, i)) >>> 0;
    const temp2 = (sum0 + majority) >>> 0;
    h = g;
    g = f;
    f = e;
    e = (d + temp1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (temp1 + temp2) >>> 0;
  }
  return {
    a: (state.a + a) >>> 0,
    b: (state.b + b) >>> 0,
    c: (state.c + c) >>> 0,
    d: (state.d + d) >>> 0,
    e: (state.e + e) >>> 0,
    f: (state.f + f) >>> 0,
    g: (state.g + g) >>> 0,
    h: (state.h + h) >>> 0,
  };
}

/** Renders the chaining state as 64 lowercase hex characters. */
function toHex(state: HashState): string {
  let hex = '';
  const words = [state.a, state.b, state.c, state.d, state.e, state.f, state.g, state.h];
  for (const word of words) {
    for (let shift = 28; shift >= 0; shift -= 4) {
      hex += HEX_DIGITS.charAt((word >>> shift) & 0x0f);
    }
  }
  return hex;
}

/** SHA-256 over the UTF-8 bytes of `input`, as 64 lowercase hex characters. */
export function sha256Hex(input: string): string {
  const padded = padToBlocks(utf8Bytes(input));
  const w = new Array<number>(64);
  let state = INITIAL_HASH;
  for (let offset = 0; offset < padded.length; offset += BLOCK_BYTES) {
    fillSchedule(w, padded, offset);
    state = compress(state, w);
  }
  return toHex(state);
}
