/**
 * Display-name rules shared by the client form and the server hook. Plain
 * consts and pure, dependency-free helpers only: the server bundles this into
 * its ES5 goja module, so character classes use explicit `\uXXXX` ranges (no
 * `\p{…}`, no `u` flag).
 */

/** Display-name limits, shared by the client form and the server hook. */
export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 16;
/** Minimum time between two renames; the first pick doesn't count (Decision 5). */
export const RENAME_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Why the server rejected an account update. Sent as the error `message` of the
 * updateAccount call (gRPC status INVALID_ARGUMENT, or RESOURCE_EXHAUSTED for
 * `name_rate_limited`); the client maps it to an i18n string.
 */
export const NAME_ERROR_CODES = [
  'name_too_short',
  'name_too_long',
  'name_bad_chars',
  'name_not_allowed', // profanity or reserved word
  // Old builds map an unknown error message to a generic error, so adding this
  // code is safe within the pre-release window.
  'name_taken', // another account already uses this display name
  'name_rate_limited',
  'username_locked',
  'field_locked', // avatar_url / location changes
] as const;
export type NameErrorCode = (typeof NAME_ERROR_CODES)[number];

/** Server-owned storage record: collection `profile`, key `name`, owner = the user. */
export const PROFILE_COLLECTION = 'profile';
export const PROFILE_NAME_KEY = 'name';

/** Owner-readable (permissionRead 1), server-write-only (permissionWrite 0). */
export interface NameRecord {
  /** Epoch ms when the player first confirmed a name. Its presence means "name picked". */
  readonly pickedAt: number;
  /** Epoch ms of the last rename after the first pick; null until then. Drives the cooldown. */
  readonly changedAt: number | null;
}

/** Codes `checkDisplayNameFormat` can return; the rest need server state. */
export type NameFormatErrorCode = 'name_too_short' | 'name_too_long' | 'name_bad_chars';

export type NameFormatCheck =
  | { readonly ok: true; /** Normalized. */ readonly name: string }
  | { readonly ok: false; readonly code: NameFormatErrorCode };

/**
 * Allow-list (Decision 4): ASCII letters and digits; Latin-1 accented letters
 * except × (U+00D7) and ÷ (U+00F7); Arabic letters U+0621-U+063A and
 * U+0641-U+064A plus پ (U+067E), ڤ (U+06A4), ڨ (U+06A8); Arabic-Indic digits
 * U+0660-U+0669; the space. Eastern Arabic-Indic digits (U+06F0-U+06F9, Persian
 * and Urdu keyboards) are left out: Tunisian keyboards type U+0660 or ASCII, and
 * a second digit set only adds lookalikes. Tatweel, harakat, zero-width and
 * bidi controls fall outside the list.
 */
const ALLOWED_NAME = /^[A-Za-z0-9À-ÖØ-öø-ÿء-غف-ي٠-٩پڤڨ ]*$/;

/** Trims and collapses runs of spaces to one. Other whitespace is left for the format check to reject. */
export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/ {2,}/g, ' ');
}

/**
 * Format-only check (length and character set); profanity and the cooldown
 * stay server-side. Characters are checked before length, so a name with an
 * emoji (two UTF-16 units) reports `name_bad_chars` rather than a misleading
 * length error. Length counts UTF-16 code units, which equals characters for
 * the allow-list (all BMP).
 */
export function checkDisplayNameFormat(raw: string): NameFormatCheck {
  const name = normalizeDisplayName(raw);
  if (!ALLOWED_NAME.test(name)) return { ok: false, code: 'name_bad_chars' };
  if (name.length < DISPLAY_NAME_MIN_LENGTH) return { ok: false, code: 'name_too_short' };
  if (name.length > DISPLAY_NAME_MAX_LENGTH) return { ok: false, code: 'name_too_long' };
  return { ok: true, name };
}
