import {
  FRIEND_LIMITS,
  FRIEND_STATE,
  isFriendCode,
  normalizeFriendCode,
  type FriendErrorCode,
  type FriendState,
} from '@chkobba/protocol';
import { checkFriendLimits, classifyTargets, countEdges, type FriendEdges } from './friendRules';

/**
 * Before-AddFriends hook (plan technical decision 6). Registered in `main.ts`
 * (goja needs a top-level named function).
 *
 * - Targets are capped at MAX_TARGETS_PER_REQUEST (ids + usernames, before dedupe).
 * - Usernames are friend codes: normalized (uppercase, no dashes or spaces) and
 *   resolved with `nk.usersGetUsername`, which matches exactly. A username that
 *   isn't a well-formed code, or matches no account, is dropped.
 * - The caller's own id is dropped.
 * - Limits: see `checkFriendLimits`.
 * - Blocked targets are left to Nakama: verified on 3.40, a blocked user's
 *   re-request returns 200 and is ignored natively.
 *
 * On success Nakama gets `{ ids: <resolved targets>, usernames: [] }`, no-ops
 * included (Nakama treats those as idempotent successes). When nothing valid
 * remains (only the caller, unknown or malformed codes), the request goes on
 * unchanged so Nakama gives its own 400 answer rather than a silent success.
 */

/** gRPC status codes; nkruntime.Codes is an ambient const enum and cannot be read with isolatedModules. */
const INVALID_ARGUMENT = 3; // HTTP 400
const RESOURCE_EXHAUSTED = 8; // HTTP 429
const UNAUTHENTICATED = 16; // HTTP 401

/** Edges read per state; well above MAX_FRIENDS and MAX_OUTGOING_PENDING. */
const EDGE_LIST_LIMIT = 1000;
const LISTED_STATES: readonly FriendState[] = [
  FRIEND_STATE.FRIEND,
  FRIEND_STATE.REQUEST_SENT,
  FRIEND_STATE.REQUEST_RECEIVED,
  FRIEND_STATE.BLOCKED,
];

function friendError(code: FriendErrorCode): nkruntime.Error {
  return { message: code, code: code === 'friend_bad_request' ? INVALID_ARGUMENT : RESOURCE_EXHAUSTED };
}

/** The field as a string array, or null when it is present but not one. Absent means empty. */
function stringList(value: unknown): string[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (let i = 0; i < value.length; i++) {
    const item: unknown = value[i];
    if (typeof item !== 'string') return null;
    out.push(item);
  }
  return out;
}

function isFriendState(value: unknown): value is FriendState {
  return (
    value === FRIEND_STATE.FRIEND ||
    value === FRIEND_STATE.REQUEST_SENT ||
    value === FRIEND_STATE.REQUEST_RECEIVED ||
    value === FRIEND_STATE.BLOCKED
  );
}

/** Friend codes → user ids. Malformed and unknown codes are left out. */
function resolveUsernames(nk: nkruntime.Nakama, usernames: readonly string[]): string[] {
  const codes: string[] = [];
  for (let i = 0; i < usernames.length; i++) {
    const code = normalizeFriendCode(usernames[i] ?? '');
    if (isFriendCode(code) && codes.indexOf(code) < 0) codes.push(code);
  }
  if (codes.length === 0) return [];
  const users = nk.usersGetUsername(codes) ?? [];
  const ids: string[] = [];
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    if (user && user.userId) ids.push(user.userId);
  }
  return ids;
}

/** One page of up to EDGE_LIST_LIMIT edges in `state`. */
function listEdges(nk: nkruntime.Nakama, userId: string, state: FriendState): nkruntime.Friend[] {
  return nk.friendsList(userId, EDGE_LIST_LIMIT, state).friends ?? [];
}

/** The caller's edges in every state, up to EDGE_LIST_LIMIT per state. */
function readEdges(nk: nkruntime.Nakama, userId: string): FriendEdges {
  const edges: { [userId: string]: FriendState } = {};
  for (let s = 0; s < LISTED_STATES.length; s++) {
    const state = LISTED_STATES[s];
    if (state === undefined) continue;
    const friends = listEdges(nk, userId, state);
    for (let i = 0; i < friends.length; i++) {
      const friend = friends[i];
      if (!friend || !friend.user) continue;
      const otherId = friend.user.userId;
      const edgeState = friend.state;
      if (otherId && isFriendState(edgeState)) edges[otherId] = edgeState;
    }
  }
  return edges;
}

export function beforeAddFriends(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  data: nkruntime.AddFriendsRequest,
): nkruntime.AddFriendsRequest {
  const userId = ctx.userId;
  if (!userId) throw { message: 'add friends requires an authenticated user', code: UNAUTHENTICATED };

  const ids = stringList(data.ids);
  const usernames = stringList(data.usernames);
  if (ids === null || usernames === null) throw friendError('friend_bad_request');
  if (ids.length + usernames.length > FRIEND_LIMITS.MAX_TARGETS_PER_REQUEST) throw friendError('friend_bad_request');

  const edges = readEdges(nk, userId);
  const targets = classifyTargets(userId, ids.concat(resolveUsernames(nk, usernames)), edges);
  const resolved = targets.requests.concat(targets.accepts, targets.noops);
  if (resolved.length === 0) return data;

  const theirFriendCounts: { [userId: string]: number } = {};
  for (let i = 0; i < targets.accepts.length; i++) {
    const otherId = targets.accepts[i];
    if (otherId !== undefined) theirFriendCounts[otherId] = listEdges(nk, otherId, FRIEND_STATE.FRIEND).length;
  }

  const limits = checkFriendLimits(targets, countEdges(edges), theirFriendCounts);
  if (!limits.ok) {
    logger.info('add friends rejected for %s: %s', userId, limits.code);
    throw friendError(limits.code);
  }
  return { ids: resolved, usernames: [] };
}
