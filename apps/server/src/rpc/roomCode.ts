import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@chkobba/protocol';

/**
 * Pure room-code generation. No `nkruntime` here; the RPC supplies the bytes:
 * `generateRoomCode(byteSource(nk.secureRandomBytes(ROOM_CODE_LENGTH)))`.
 * The module never calls `Math.random`.
 */

/** `ROOM_CODE_ALPHABET` has 32 symbols, so the low 5 bits of a byte pick one with no modulo bias. */
const SYMBOL_MASK = 31;

/** `ROOM_CODE_LENGTH` symbols from `ROOM_CODE_ALPHABET`, one per byte from `nextByte` (0-255). */
export function generateRoomCode(nextByte: () => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_ALPHABET.charAt(nextByte() & SYMBOL_MASK);
  return code;
}

/** Reads `buffer` one byte at a time, in order. Throws once every byte is used, rather than repeating or inventing randomness. */
export function byteSource(buffer: ArrayBuffer): () => number {
  const bytes = new Uint8Array(buffer);
  let index = 0;
  return () => {
    const byte = bytes[index];
    if (byte === undefined) throw new Error('room code byte source exhausted');
    index += 1;
    return byte;
  };
}
