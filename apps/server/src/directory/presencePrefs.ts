import {
  DEFAULT_PRESENCE_VISIBILITY,
  PROFILE_COLLECTION,
  PROFILE_PREFS_KEY,
  type PresencePrefsRecord,
  type PresenceVisibility,
  type PresenceVisibilityLabel,
} from '@chkobba/protocol';

/**
 * Reads a player's presence-preference record (`profile/prefs`) for the
 * directory (ADR-0004 section 14). This module only reads: the
 * `set_presence_visibility` RPC owns the write.
 *
 * The page read is deliberately one `storageRead` for the whole page. Search
 * returns up to `SEARCH_PAGE_SIZE` (20) rows, so a per-row read would add 20
 * storage round-trips to every page; one batched call keeps search cost tied to
 * the page, not to the number of rows in it.
 *
 * The only preference that changes what is published is `nobody` → label
 * `hidden`, and `hidden` means "publishes nothing" — never "offline". A caller
 * that renders `hidden` as offline turns an intentional privacy choice into a
 * false status claim, so the mapping lives here once and the UI gets only the
 * label.
 *
 * Storage values are untrusted `unknown`: every read is shape-checked, never
 * cast. A missing or malformed record reads as Everyone — the default — which
 * is exactly what an account that never saved a preference has.
 */

/** Own-property check: a `visibility` key on the prototype chain is not a stored field. */
const hasOwn = Object.prototype.hasOwnProperty;

/**
 * The per-page lookup: one own key per requested userId, all of them present.
 * A null-prototype object (as in `inviteLimits`) so a userId that looks like
 * `__proto__` or `toString` stays plain data. Indexed access still needs the
 * `?? DEFAULT_PRESENCE_VISIBILITY` fallback because `noUncheckedIndexedAccess`
 * cannot see the prefill.
 */
export type PresenceVisibilityLookup = { readonly [userId: string]: PresenceVisibility };

/**
 * A stored `profile/prefs` value → visibility. Only a well-formed
 * `PresencePrefsRecord` whose `visibility` is exactly `'nobody'` reads as
 * Nobody; an absent, malformed or unknown value reads as Everyone.
 *
 * Never throws: a broken record must not fail a search or profile page, and
 * Everyone is the documented default for an account with no preference. This is
 * a privacy choice, not a security check — the record is server-written only,
 * so a malformed value is a server bug, not an attacker-controlled input.
 */
export function visibilityOf(value: unknown): PresenceVisibility {
  return isPresencePrefsRecord(value) ? value.visibility : DEFAULT_PRESENCE_VISIBILITY;
}

/**
 * The wire label for what other players may learn. `nobody` is `hidden`, which
 * must render as a neutral "no availability" state — never an offline dot and
 * never offline text (ADR-0004 section 14).
 */
export function labelOf(visibility: PresenceVisibility): PresenceVisibilityLabel {
  return visibility === 'nobody' ? 'hidden' : 'visible';
}

/**
 * Reads the preference for a whole page of candidates in one `storageRead`.
 * Every requested userId is present in the returned lookup; a target with no
 * record (the account never saved a preference) stays Everyone.
 *
 * Rows are keyed by the requested id, so a storage object for an id outside the
 * page cannot inject an entry. A storage failure propagates on purpose: the RPC
 * decides whether the page fails or falls back to the default, rather than this
 * module silently answering "everyone" for users who chose Nobody.
 */
export function readPresenceVisibilities(
  nk: nkruntime.Nakama,
  userIds: readonly string[],
): PresenceVisibilityLookup {
  const lookup: { [userId: string]: PresenceVisibility } = Object.create(null);
  if (userIds.length === 0) return lookup;

  const targets: nkruntime.StorageReadRequest[] = [];
  for (let index = 0; index < userIds.length; index += 1) {
    const userId = userIds[index];
    if (userId === undefined) continue;
    lookup[userId] = DEFAULT_PRESENCE_VISIBILITY;
    targets.push({ collection: PROFILE_COLLECTION, key: PROFILE_PREFS_KEY, userId });
  }

  const objects = nk.storageRead(targets);
  for (let index = 0; index < objects.length; index += 1) {
    const object = objects[index];
    if (object === undefined) continue;
    // Only the ids this page asked for: the record's own userId is what the
    // lookup is keyed by, and an unrequested id has no pre-seeded key.
    if (!hasOwn.call(lookup, object.userId)) continue;
    lookup[object.userId] = visibilityOf(object.value);
  }
  return lookup;
}

/**
 * The preference for one account, for the profile RPC. Reuses the page read
 * with a single id so there is one storage path and one shape check, not a
 * second single-row variant that could drift. A storage failure propagates.
 */
export function readPresenceVisibility(nk: nkruntime.Nakama, userId: string): PresenceVisibility {
  const lookup = readPresenceVisibilities(nk, [userId]);
  return lookup[userId] ?? DEFAULT_PRESENCE_VISIBILITY;
}

/** Runtime shape check: a well-formed `PresencePrefsRecord`, never a cast. */
function isPresencePrefsRecord(value: unknown): value is PresencePrefsRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (!hasOwn.call(value, 'visibility') || !hasOwn.call(value, 'updatedAt')) return false;
  const { visibility, updatedAt } = value as { visibility: unknown; updatedAt: unknown };
  const known = visibility === 'everyone' || visibility === 'nobody';
  return known && typeof updatedAt === 'number' && isFinite(updatedAt);
}
