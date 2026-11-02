import { FRIEND_CODE_LENGTH, friendCodeFromBytes } from '@chkobba/protocol';
import { DERJA_LATIN_BLOCKED, EN_BLOCKED, FR_BLOCKED, RESERVED_WORDS, foldName } from './profanity';

/**
 * Pure friend-code generation and screening. No `nkruntime` here; the caller
 * supplies the bytes, e.g.
 * `generateFriendCode(byteSource(nk.secureRandomBytes(FRIEND_CODE_LENGTH * tries)), isClean, tries)`.
 * The module never calls `Math.random`.
 */

/**
 * Up to `maxTries` codes, each built from the next `FRIEND_CODE_LENGTH` bytes of
 * `nextByte` (0-255); returns the first one `isClean` accepts, or null when none
 * does. `nextByte` must be able to supply `FRIEND_CODE_LENGTH * maxTries` bytes.
 */
export function generateFriendCode(
  nextByte: () => number,
  isClean: (code: string) => boolean,
  maxTries: number,
): string | null {
  for (let attempt = 0; attempt < maxTries; attempt++) {
    const bytes: number[] = [];
    for (let i = 0; i < FRIEND_CODE_LENGTH; i++) bytes.push(nextByte());
    const code = friendCodeFromBytes(bytes);
    if (isClean(code)) return code;
  }
  return null;
}

/**
 * Every Latin-script blocked and reserved word, folded like display names
 * (lowercase, leetspeak 3/4/5 → e/a/s). Arabic entries can't occur in a code.
 * A code has no spaces, so `word` entries are matched as substrings too: a code
 * is random, so there is no real name to protect from a false positive.
 */
const CODE_BLOCKED_WORDS: readonly string[] = EN_BLOCKED.concat(FR_BLOCKED, DERJA_LATIN_BLOCKED, RESERVED_WORDS).map(
  (entry) => foldName(entry.word),
);

/** True unless `code` (any case) contains a blocked or reserved word after folding. */
export function isFriendCodeClean(code: string): boolean {
  const folded = foldName(code);
  for (const word of CODE_BLOCKED_WORDS) {
    if (word.length > 0 && folded.indexOf(word) !== -1) return false;
  }
  return true;
}
