/**
 * Friends wire types: friend codes, friend-edge states, table invites, presence
 * and the server-owned social storage records, shared by the server and the
 * client. Plain consts and pure, dependency-free helpers only: the server
 * bundles this into its ES5 goja module, so no `u`-flag regex and no
 * post-ES2017 built-ins.
 */

import { ROOM_CODE_ALPHABET } from './room';

/** Friend codes reuse the room-code alphabet (no 0, O, 1, I). 32^8 ≈ 1.1e12 codes. */
export const FRIEND_CODE_ALPHABET = ROOM_CODE_ALPHABET;
export const FRIEND_CODE_LENGTH = 8;
/** Web route for friend links: `${base}/f/${code}`. */
export const FRIEND_LINK_PATH = '/f/';

/** Nakama friend edge states (the caller's view of the other user). */
export const FRIEND_STATE = {
  FRIEND: 0,
  REQUEST_SENT: 1,
  REQUEST_RECEIVED: 2,
  BLOCKED: 3,
} as const;
export type FriendState = (typeof FRIEND_STATE)[keyof typeof FRIEND_STATE];

export const FRIEND_LIMITS = {
  /** Outgoing requests still pending (state 1). */
  MAX_OUTGOING_PENDING: 50,
  /** Mutual friends (state 0). */
  MAX_FRIENDS: 200,
  /** ids + usernames in one AddFriends call. */
  MAX_TARGETS_PER_REQUEST: 10,
} as const;

/** before-AddFriends hook error `message` values (thrown as { message, code } with numeric gRPC codes). */
export const FRIEND_ERROR_CODES = [
  'friend_bad_request', // too many targets, or malformed (INVALID_ARGUMENT 3)
  'friend_outgoing_limit', // would exceed MAX_OUTGOING_PENDING (RESOURCE_EXHAUSTED 8)
  'friend_limit', // caller would exceed MAX_FRIENDS (RESOURCE_EXHAUSTED 8)
  'friend_their_limit', // accepting would push the other user over MAX_FRIENDS (RESOURCE_EXHAUSTED 8)
] as const;
export type FriendErrorCode = (typeof FRIEND_ERROR_CODES)[number];

/** Only used if the before-auth hook can't rewrite `username` (fallback path). */
export const AUTH_ERROR_CODES = [
  'username_bad_code', // missing or malformed friend code on account creation (INVALID_ARGUMENT 3)
] as const;
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/** Notification codes. Negative codes are Nakama's own; ours are positive. */
export const NOTIFICATION_CODES = {
  /** Nakama: someone sent you a friend request. */
  FRIEND_REQUEST: -2,
  /** Nakama: someone accepted your request. */
  FRIEND_ACCEPT: -3,
  /** Ours: a friend invites you to a private table. */
  TABLE_INVITE: 1,
} as const;

/** Content of a TABLE_INVITE notification (subject `table_invite`). */
export interface TableInviteContent {
  readonly v: 1;
  /** Room code (ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH). */
  readonly code: string;
  /** Sender's display name at send time; the client may refresh it. */
  readonly fromName: string;
}
/** An invite older than this is shown as expired; also the per-(sender, friend, table) dedupe window. */
export const INVITE_TTL_MS = 600000;
/** Invites one sender may send per window. */
export const INVITE_LIMIT = 20;
export const INVITE_WINDOW_MS = 600000;

// RPC: invite_to_table   request InviteToTableRequest   response InviteToTableResponse
export interface InviteToTableRequest {
  readonly userId: string;
  readonly code: string;
}
export interface InviteToTableResponse {
  /** False when an invite for the same friend and table is still pending (no-op). */
  readonly sent: boolean;
}
/** `invite_to_table` error `message` values (thrown as { message, code } with numeric gRPC codes). */
export const INVITE_RPC_ERROR_CODES = [
  'invite_bad_request', // malformed id or code (INVALID_ARGUMENT 3)
  'invite_not_friend', // target is not a mutual friend (FAILED_PRECONDITION 9)
  'invite_not_member', // caller is not present in that room (PERMISSION_DENIED 7)
  'invite_room_not_found', // code unknown or match gone (NOT_FOUND 5)
  'invite_rate_limited', // more than INVITE_LIMIT in the window (RESOURCE_EXHAUSTED 8)
] as const;
export type InviteRpcErrorCode = (typeof INVITE_RPC_ERROR_CODES)[number];

/** Availability shown to followers. Public: never put a code or match id here. */
export const PRESENCE_ACTIVITIES = ['lobby', 'room', 'playing'] as const;
export type PresenceActivity = (typeof PRESENCE_ACTIVITIES)[number];
/** The socket status string is JSON.stringify(PresenceStatus). */
export interface PresenceStatus {
  readonly v: 1;
  readonly a: PresenceActivity;
}

/** Server-owned per-user records: collection `social`. */
export const SOCIAL_COLLECTION = 'social';

/** Key `recent_players`. Read 1 (owner), write 0 (server). */
export const RECENT_PLAYERS_KEY = 'recent_players';
export const RECENT_TABLES_MAX = 20;
export interface RecentPlayer {
  readonly userId: string;
  /** Display name at the time of the game. */
  readonly name: string;
}
export interface RecentTable {
  /** Epoch ms the owner's game ended: game finish, or the moment the owner left. */
  readonly endedAt: number;
  /** The other humans who sat in that game, leavers included (never the owner, never bots). */
  readonly players: readonly RecentPlayer[];
}
export interface RecentPlayersRecord {
  /** Newest first, at most RECENT_TABLES_MAX. */
  readonly tables: readonly RecentTable[];
}

/** Key `invite_limits`. Read 0, write 0. */
export const INVITE_LIMITS_KEY = 'invite_limits';
export interface InviteLimitsRecord {
  /** Fixed window start (epoch ms) and invites sent in it. */
  readonly windowStart: number;
  readonly sent: number;
  /** Pending invites by `${friendUserId}:${roomCode}` → sentAt; entries older than INVITE_TTL_MS are pruned. */
  readonly pending: { readonly [friendAndCode: string]: number };
}

/** Alphabet size is 32, so `byte & 31` maps every byte value onto it with no bias. */
const FRIEND_CODE_SYMBOL_MASK = 31;

/**
 * Canonical form of a typed or pasted code: uppercase, with all whitespace
 * (spaces, tabs, newlines) and dashes removed (players may type `abcd-2345` or
 * `ABCD 2345`, or paste a code with a trailing newline). Does not validate;
 * pass the result to `isFriendCode`.
 */
export function normalizeFriendCode(input: string): string {
  const upper = input.toUpperCase();
  let out = '';
  for (let i = 0; i < upper.length; i++) {
    const ch = upper.charAt(i);
    if (ch !== '-' && !isWhitespace(ch)) out += ch;
  }
  return out;
}

/** Same set as the regex `\s` (without the `u` flag): ASCII whitespace plus the Unicode space separators. */
const WHITESPACE = ' \t\n\v\f\r\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

function isWhitespace(ch: string): boolean {
  return WHITESPACE.indexOf(ch) >= 0;
}

/** True when `code` is exactly `FRIEND_CODE_LENGTH` characters from `FRIEND_CODE_ALPHABET` (already normalized). */
export function isFriendCode(code: string): boolean {
  if (code.length !== FRIEND_CODE_LENGTH) return false;
  for (let i = 0; i < code.length; i++) {
    if (FRIEND_CODE_ALPHABET.indexOf(code.charAt(i)) < 0) return false;
  }
  return true;
}

/** Display form `XXXX-XXXX` of a normalized code; anything else is returned unchanged. */
export function formatFriendCode(code: string): string {
  if (!isFriendCode(code)) return code;
  const half = FRIEND_CODE_LENGTH / 2;
  return code.slice(0, half) + '-' + code.slice(half);
}

/**
 * Builds a friend code from random bytes (the caller supplies them, e.g. from
 * `nk.secureRandomBytes`): each of the first `FRIEND_CODE_LENGTH` bytes picks
 * one symbol via `byte & 31`. Throws a RangeError when fewer bytes are given.
 */
export function friendCodeFromBytes(bytes: ArrayLike<number>): string {
  if (bytes.length < FRIEND_CODE_LENGTH) {
    throw new RangeError(
      'friendCodeFromBytes needs ' + FRIEND_CODE_LENGTH + ' bytes, got ' + bytes.length
    );
  }
  let code = '';
  for (let i = 0; i < FRIEND_CODE_LENGTH; i++) {
    const byte = bytes[i] ?? 0; // always defined: the length was checked above
    code += FRIEND_CODE_ALPHABET.charAt(byte & FRIEND_CODE_SYMBOL_MASK);
  }
  return code;
}
