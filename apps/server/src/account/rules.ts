import { checkDisplayNameFormat, RENAME_COOLDOWN_MS, type NameErrorCode, type NameRecord } from '@chkobba/protocol';
import { isNameAllowed } from './profanity';

/**
 * Pure display-name decisions for the account hook: the full name check, the
 * rename cooldown and the default name. No `nkruntime` here; the hook supplies
 * the stored record, the clock and the RNG.
 */

export type NameCheck =
  | { readonly ok: true; /** Normalized. */ readonly name: string }
  | { readonly ok: false; readonly code: NameErrorCode };

export type CooldownCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'name_rate_limited'; /** Epoch ms when a rename is allowed again. */ readonly retryAt: number };

/** Prefix of generated names; `Player0000`–`Player9999` all pass `checkName`. */
export const DEFAULT_NAME_PREFIX = 'Player';
const DEFAULT_NAME_DIGITS = 4;
const DEFAULT_NAME_RANGE = 10000;

/** Format check (shared with the client), then the server-only profanity and reserved-word check. */
export function checkName(raw: string): NameCheck {
  const format = checkDisplayNameFormat(raw);
  if (!format.ok) return format;
  if (!isNameAllowed(format.name)) return { ok: false, code: 'name_not_allowed' };
  return { ok: true, name: format.name };
}

/**
 * Whether the player may rename now (Decision 5). The first pick only sets
 * `pickedAt`, so with no record, or no rename since the first pick
 * (`changedAt === null`), the change is allowed straight away. After that the
 * cooldown runs from `changedAt`: a rename at exactly
 * `changedAt + RENAME_COOLDOWN_MS` is allowed.
 */
export function checkRenameCooldown(record: NameRecord | null, now: number): CooldownCheck {
  if (record === null || record.changedAt === null) return { ok: true };
  const retryAt = record.changedAt + RENAME_COOLDOWN_MS;
  if (now >= retryAt) return { ok: true };
  return { ok: false, code: 'name_rate_limited', retryAt };
}

/**
 * `Player` plus 4 zero-padded digits. `random` returns a float in [0, 1)
 * (the module never calls `Math.random`); out-of-range values are clamped.
 * Pads by hand rather than relying on `padStart` in goja.
 */
export function defaultDisplayName(random: () => number): string {
  const raw = Math.floor(random() * DEFAULT_NAME_RANGE);
  const n = raw >= 0 && raw < DEFAULT_NAME_RANGE ? raw : raw >= DEFAULT_NAME_RANGE ? DEFAULT_NAME_RANGE - 1 : 0;
  let digits = String(n);
  while (digits.length < DEFAULT_NAME_DIGITS) digits = '0' + digits;
  return DEFAULT_NAME_PREFIX + digits;
}
