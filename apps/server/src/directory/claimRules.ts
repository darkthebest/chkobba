import { foldName, type NameClaim } from '@chkobba/protocol';
import { isNameClaim } from './claimStore';

/**
 * Pure claim-lifecycle rules (ADR-0004 section 10): staleness, the release guard
 * and the before-hook reclaim verdict. No `nkruntime`, no storage and no clock —
 * the hooks pass in the record they read and the owner's live name, so every
 * decision is one replayable boolean and the goja module never grows a second
 * storage path.
 */

/**
 * True when `claim` no longer matches the account that holds it: the owner's live
 * display name folds to a different key, or the owner account is gone and there is
 * no live name (`null`).
 *
 * Staleness is the **only** licence to reclaim a key another account holds. A live
 * claim must read as taken; treating one as stale would let any rename steal an
 * active name. The ownerless case is the same rule, and it is what makes an orphan
 * left by a crash between the before and after hooks reclaimable instead of a
 * permanent lock.
 */
export function isStale(claim: NameClaim, liveName: string | null): boolean {
  return liveName === null || foldName(liveName) !== claim.fold;
}

/**
 * The release guard for `afterUpdateAccount`: whether the claim taken under
 * `oldFold` must be released now that the account folds to `newFold`.
 *
 * False when the folds are equal. A rename that only changes casing or accent
 * spelling folds to the same claim key, which the before hook has just written (or
 * kept); releasing that key would delete the claim the update just secured and
 * silently unlist the player. So an equal fold must never release — this guard is
 * the difference between "rename works" and "rename silently unlists".
 */
export function shouldRelease(oldFold: string, newFold: string): boolean {
  return oldFold !== newFold;
}

/**
 * What the before hook may do with the record found at the requested claim key.
 * Each value maps to one call-site branch with no further inspection:
 *
 * - `free` — nothing holds the key (absent, or the caller's own claim). Take it with
 *   a create-only write. An own record counts as free because the rejected write is
 *   re-read and counted as acquired, which makes a retry and a casing-only rename
 *   idempotent.
 * - `reclaim` — the key holds a record the caller may take after clearing it: a
 *   foreign claim that is stale, or an unreadable value. The caller must remove the
 *   record before the create-only write can succeed.
 * - `taken` — a live foreign claim. Refuse with `name_taken`: the spelling is valid,
 *   the name is not free.
 */
export type ClaimVerdict = 'free' | 'reclaim' | 'taken';

/**
 * Judges the record found at a claim key for the account that wants the name.
 * `claim` is the raw storage value, so it stays `unknown`: it may be absent
 * (`null` / `undefined`) or malformed, and it is validated with `isNameClaim`,
 * never cast.
 *
 * A malformed value reads as absent **as a holder** — it can never produce
 * `taken` — but it still occupies the key, so it yields `reclaim` (clear, then
 * retry) rather than `free` (write straight away). An unreadable record must be
 * reclaimable: never an error, and never a clash that locks its name out.
 *
 * `liveName` is the live display name of the account the claim names, or `null`
 * when that account no longer exists. It is ignored when the claim belongs to the
 * caller, whose own record never needs reclaiming.
 */
export function judgeClaim(claim: unknown, ownUserId: string, liveName: string | null): ClaimVerdict {
  if (claim === null || claim === undefined) return 'free';
  if (!isNameClaim(claim)) return 'reclaim';
  if (claim.userId === ownUserId) return 'free';
  return isStale(claim, liveName) ? 'reclaim' : 'taken';
}
