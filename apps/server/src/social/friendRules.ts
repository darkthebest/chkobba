import { FRIEND_LIMITS, FRIEND_STATE, type FriendErrorCode, type FriendState } from '@chkobba/protocol';

/**
 * Pure friend-request rules for the before-AddFriends hook (plan technical
 * decision 6). No nkruntime: the hook gathers the caller's edges and counts,
 * these functions decide.
 */

/** The caller's friend edges: other user id → the caller's view of that edge. */
export interface FriendEdges {
  readonly [userId: string]: FriendState;
}

export interface FriendTargets {
  /** No edge yet: a new outgoing request (counts toward MAX_OUTGOING_PENDING). */
  readonly requests: readonly string[];
  /** State 2 (they asked the caller): accepting makes a friend on both sides (counts toward MAX_FRIENDS for both). */
  readonly accepts: readonly string[];
  /** Already friends (0), already requested (1) or blocked by the caller (3): Nakama leaves these as they are. */
  readonly noops: readonly string[];
}

/** Counts of the caller's current edges, by the states the limits care about. */
export interface FriendCounts {
  /** State 0. */
  readonly friends: number;
  /** State 1. */
  readonly outgoingPending: number;
}

export type FriendLimitResult = { readonly ok: true } | { readonly ok: false; readonly code: FriendErrorCode };

/**
 * Sorts target ids against the caller's own edges. Duplicates and the caller's
 * own id are dropped; every other id lands in exactly one bucket, in input order.
 */
export function classifyTargets(callerId: string, targetIds: readonly string[], edges: FriendEdges): FriendTargets {
  const requests: string[] = [];
  const accepts: string[] = [];
  const noops: string[] = [];
  // An array, not an object map: target ids are client-supplied, and names like
  // `toString` or `__proto__` would collide with Object.prototype. At most
  // MAX_TARGETS_PER_REQUEST targets, so indexOf is cheap.
  const seen: string[] = [];
  for (let i = 0; i < targetIds.length; i++) {
    const id = targetIds[i];
    if (id === undefined || id === callerId || seen.indexOf(id) >= 0) continue;
    seen.push(id);
    const state = Object.prototype.hasOwnProperty.call(edges, id) ? edges[id] : undefined;
    if (state === undefined) requests.push(id);
    else if (state === FRIEND_STATE.REQUEST_RECEIVED) accepts.push(id);
    else noops.push(id);
  }
  return { requests, accepts, noops };
}

/** Counts the caller's friends (state 0) and outgoing pending requests (state 1). */
export function countEdges(edges: FriendEdges): FriendCounts {
  let friends = 0;
  let outgoingPending = 0;
  for (const id in edges) {
    if (!Object.prototype.hasOwnProperty.call(edges, id)) continue;
    const state = edges[id];
    if (state === FRIEND_STATE.FRIEND) friends++;
    else if (state === FRIEND_STATE.REQUEST_SENT) outgoingPending++;
  }
  return { friends, outgoingPending };
}

/**
 * Checks the limits for one AddFriends call, in this order:
 * 1. new requests would push the caller's outgoing pending over MAX_OUTGOING_PENDING → `friend_outgoing_limit`;
 * 2. accepts would push the caller's friends over MAX_FRIENDS → `friend_limit`;
 * 3. an accepted user already has MAX_FRIENDS friends → `friend_their_limit`.
 *
 * `theirFriendCounts` maps each accepted user id to their current friend count
 * (state 0); a missing entry counts as 0. Each accepted user gains exactly one
 * friend (the caller), so only "already at the limit" fails.
 */
export function checkFriendLimits(
  targets: FriendTargets,
  counts: FriendCounts,
  theirFriendCounts: { readonly [userId: string]: number },
): FriendLimitResult {
  if (targets.requests.length > 0 && counts.outgoingPending + targets.requests.length > FRIEND_LIMITS.MAX_OUTGOING_PENDING) {
    return { ok: false, code: 'friend_outgoing_limit' };
  }
  if (targets.accepts.length > 0 && counts.friends + targets.accepts.length > FRIEND_LIMITS.MAX_FRIENDS) {
    return { ok: false, code: 'friend_limit' };
  }
  for (let i = 0; i < targets.accepts.length; i++) {
    const id = targets.accepts[i];
    if (id === undefined) continue;
    const theirs = Object.prototype.hasOwnProperty.call(theirFriendCounts, id) ? theirFriendCounts[id] : undefined;
    if ((theirs ?? 0) >= FRIEND_LIMITS.MAX_FRIENDS) return { ok: false, code: 'friend_their_limit' };
  }
  return { ok: true };
}
