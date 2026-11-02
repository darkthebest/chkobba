import { FRIEND_STATE } from '@chkobba/protocol';

/**
 * Block visibility (ADR-0004 section 11). A block in either direction makes the
 * pair invisible to each other, and the refusal must be indistinguishable from
 * an ordinary miss: search drops the row and a profile read answers
 * `directory_not_found`, exactly as for an unknown id.
 *
 * Nakama keeps only the blocker's own edge — blocking removes the reverse edge
 * and there is no "who blocked me" index — so visibility needs two reads:
 *
 * - the caller's own state-3 list, once per request (`readBlockedSet`);
 * - the candidate's state-3 list, once per candidate, to learn whether the
 *   candidate blocked the caller (`doesCandidateBlockCaller`).
 *
 * The reverse read is the one that can be ambiguous, and it **fails closed**: a
 * thrown call, a page whose `friends` is not an array, or a truncated page all
 * count as blocked. The cost is a rare hidden innocent player; the alternative
 * is leaking the block by omission. `readBlockedSet` deliberately does not fail
 * closed on truncation, because a short own-block list can only show the caller
 * a player the caller themselves blocked — it never exposes anyone else's block.
 *
 * The pure predicates (`listContains`, `isHiddenByBlock`) are separated from the
 * `nk` reads so tests need neither a fake runtime nor storage, and every caller
 * (search and profile) goes through `isCandidateVisible`, so the two directions
 * and the two RPCs can never disagree.
 */

/**
 * State-3 edges read in one `friendsList` call. Nakama caps `limit` at 1000;
 * block lists are expected to be tiny (ADR-0004, consequences). A page that
 * comes back with a cursor is therefore truncated, and the reverse check treats
 * it as blocked.
 */
export const BLOCK_LIST_LIMIT = 1000;

/** The caller's block sets: own blocks, plus candidates known to block the caller. */
export interface BlockView {
  /** Ids the caller blocked (Nakama state 3). */
  readonly blocked: readonly string[];
  /** Ids the caller must not see because they blocked the caller. */
  readonly blockedBy: readonly string[];
}

/**
 * Linear membership test for a small id list. A loop, not `includes`, `Set` or an
 * object map: the module bundles to ES5 for goja, and ids are client-supplied, so
 * an object map would collide with `Object.prototype` names.
 */
export function listContains(ids: readonly string[], id: string): boolean {
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === id) return true;
  }
  return false;
}

/**
 * Pure verdict for one candidate given the caller's block sets. A block in
 * either direction hides the pair, so this single predicate serves search and
 * profile alike: there is no second code path that could let the two disagree.
 */
export function isHiddenByBlock(view: BlockView, candidateId: string): boolean {
  return listContains(view.blocked, candidateId) || listContains(view.blockedBy, candidateId);
}

/** A parsed `friendsList` page: `friends` is an array, `cursor` unknown. */
interface FriendListPage {
  readonly friends: readonly unknown[];
  readonly cursor: unknown;
}

/**
 * Validates the shape `nk.friendsList` is expected to return before reading it.
 * The call is typed, but its value crosses the goja boundary; a non-array
 * `friends` must never be iterated or silently read as "no blocks", because that
 * is the fail-open answer. Returns false for null, primitives and pages without
 * an array, and the caller turns a false into "blocked".
 */
function isFriendListPage(value: unknown): value is FriendListPage {
  if (typeof value !== 'object' || value === null) return false;
  if (!('friends' in value)) return false;
  return Array.isArray(value.friends);
}

/**
 * A cursor means Nakama has more state-3 edges than the 1000 cap returned, so the
 * caller may sit on the unread remainder. Nakama omits the cursor on the last
 * page; any value that is not null/undefined (an empty string included) is
 * treated as truncation — the conservative reading.
 */
function isTruncated(page: FriendListPage): boolean {
  return page.cursor !== null && page.cursor !== undefined;
}

/** The user id in one `friendsList` entry, or null when the entry is malformed. */
function friendUserId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  if (!('user' in value)) return null;
  const user = value.user;
  if (typeof user !== 'object' || user === null) return null;
  if (!('userId' in user)) return null;
  return typeof user.userId === 'string' ? user.userId : null;
}

/**
 * The caller's own blocked ids: `friendsList(callerId, 3)`, one page at the cap.
 *
 * Truncation is tolerated here on purpose. Unlike the reverse check, a short list
 * can only **under-report the caller's own blocks**, so the worst case is that
 * the caller sees a player the caller themselves blocked for that request. It
 * cannot reveal a block held by anyone else, and the caller already knows whom
 * they blocked. A malformed page reads as empty for the same reason.
 *
 * A thrown call propagates: an RPC should fail rather than quietly serve a
 * request whose own block set it could not read.
 *
 * `friendsList` state 3 is "the caller blocked this user". Blocking removes the
 * reverse edge, so this list never answers "who blocked me".
 */
export function readBlockedSet(nk: nkruntime.Nakama, userId: string): string[] {
  const page: unknown = nk.friendsList(userId, BLOCK_LIST_LIMIT, FRIEND_STATE.BLOCKED);
  if (!isFriendListPage(page)) return [];
  const ids: string[] = [];
  for (let i = 0; i < page.friends.length; i++) {
    const id = friendUserId(page.friends[i]);
    if (id !== null) ids.push(id);
  }
  return ids;
}

/**
 * Whether `candidateId` has blocked `callerId`, read from the candidate's own
 * state-3 list. **Fails closed**: a thrown call, a page whose `friends` is not an
 * array, or a page with a cursor (the 1000 cap was hit, so the caller may be on
 * the unread remainder) all answer `true`.
 *
 * Why fail closed: this answer decides whether a player is visible, and an
 * ambiguous read must never reveal a block by omission. If an ambiguous read were
 * treated as "not blocked", a row or profile that appears after a transient
 * failure would prove the block was absent at read time, and a blocked player
 * could confirm the block by retrying until a lookup failed. A false `true`
 * hides an innocent player for one request, which is the safe direction; the
 * 1000 cap keeps that rare.
 *
 * The call is filtered to state 3, so a matching user id is enough: any matching
 * entry counts, which is also the fail-closed reading of an unfiltered page.
 */
export function doesCandidateBlockCaller(
  nk: nkruntime.Nakama,
  candidateId: string,
  callerId: string,
): boolean {
  try {
    const page: unknown = nk.friendsList(candidateId, BLOCK_LIST_LIMIT, FRIEND_STATE.BLOCKED);
    if (!isFriendListPage(page)) return true;
    if (isTruncated(page)) return true;
    for (let i = 0; i < page.friends.length; i++) {
      if (friendUserId(page.friends[i]) === callerId) return true;
    }
    return false;
  } catch (_error) {
    return true;
  }
}

/**
 * The per-candidate visibility verdict shared by `search_players` and
 * `get_player_profile`: hidden when the caller blocked the candidate, when the
 * caller's view already records a reverse block, or when the candidate's own
 * block read is ambiguous (see `doesCandidateBlockCaller`). Otherwise visible.
 *
 * Both directions are decided here, so a search row and a profile cannot disagree
 * about the same pair. `view.blocked` must come from `readBlockedSet`; the
 * candidate's own block is always read live, never assumed.
 */
export function isCandidateVisible(
  nk: nkruntime.Nakama,
  view: BlockView,
  callerId: string,
  candidateId: string,
): boolean {
  if (isHiddenByBlock(view, candidateId)) return false;
  return !doesCandidateBlockCaller(nk, candidateId, callerId);
}
