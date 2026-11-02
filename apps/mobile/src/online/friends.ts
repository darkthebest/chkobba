import type { Client, Friend, Session, User } from '@heroiclabs/nakama-js';

import {
  FRIEND_ERROR_CODES,
  FRIEND_STATE,
  INVITE_RPC_ERROR_CODES,
  isFriendCode,
  isRoomCode,
  normalizeFriendCode,
  normalizeRoomCode,
  type FriendErrorCode,
  type FriendState,
  type InviteRpcErrorCode,
  type InviteToTableRequest,
} from '@chkobba/protocol';

import { friendCodeOf, type SessionSource } from './profile';
import { loadRecentPlayers } from './recentPlayers';

/**
 * Friends over nakama-js: the friend list by state, requests, blocks, lookup
 * by friend code (the account username) and table invites. Recent players
 * come from the server-owned `social/recent_players` record (recentPlayers.ts).
 *
 * The friend rules (limits, code resolution) are enforced by the server's
 * before-AddFriends hook; this module only maps its errors. Opening the
 * Friends UI is an explicit online action, so every call signs in (restoring,
 * refreshing or creating the guest session) through the shared `GuestAuth`.
 */

export interface FriendEntry {
  readonly userId: string;
  readonly displayName: string;
  /** The friend code (username); null if it isn't a valid code. */
  readonly code: string | null;
  readonly state: FriendState;
  /**
   * Epoch ms of the last state change (Nakama `update_time`). nakama-js 2.8
   * drops the edge's `update_time` from `listFriends`, so this is 0 until the
   * library passes it through.
   */
  readonly updatedAt: number;
}

export interface FriendsSnapshot {
  readonly friends: readonly FriendEntry[];
  readonly incoming: readonly FriendEntry[];
  readonly outgoing: readonly FriendEntry[];
  readonly blocked: readonly FriendEntry[];
}

export interface RecentPlayerEntry {
  readonly userId: string;
  readonly displayName: string;
  readonly lastPlayedAt: number;
  /** null = no edge. Blocked players are filtered out before this. */
  readonly state: FriendState | null;
}

export type FriendActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: FriendErrorCode | 'not_found' | 'network' };

export type CodeLookupResult =
  | { readonly ok: true; readonly userId: string; readonly displayName: string; readonly self: boolean }
  | { readonly ok: false; readonly reason: 'bad_code' | 'not_found' | 'network' };

export type InviteResult =
  | { readonly ok: true; readonly sent: boolean }
  | { readonly ok: false; readonly reason: InviteRpcErrorCode | 'network' };

/** Port for friend UI, next to ProfileBackend. */
export interface FriendsBackend {
  /** Rejects on a network or server failure. */
  list(): Promise<FriendsSnapshot>;
  /** Newest first; blocked users are dropped on every call. Rejects on a network or server failure. */
  recentPlayers(): Promise<readonly RecentPlayerEntry[]>;
  lookupCode(code: string): Promise<CodeLookupResult>;
  /** Sends a request, or accepts an incoming one. */
  add(userId: string): Promise<FriendActionResult>;
  /** Unfriend, decline, cancel or unblock. */
  remove(userId: string): Promise<FriendActionResult>;
  block(userId: string): Promise<FriendActionResult>;
  invite(userId: string, roomCode: string): Promise<InviteResult>;
}

/** The nakama-js calls this module makes, so tests can pass a small fake. */
export type FriendsClient = Pick<
  Client,
  'listFriends' | 'addFriends' | 'deleteFriends' | 'blockFriends' | 'getUsers' | 'readStorageObjects' | 'rpc'
>;

export interface FriendsBackendOptions {
  readonly client: FriendsClient;
  readonly auth: SessionSource;
}

/** Page size for `listFriends` (Nakama accepts 1–1000). */
export const FRIEND_PAGE_SIZE = 100;
/** Safety stop for cursor paging: a cursor that never ends must not loop forever. */
export const FRIEND_MAX_PAGES = 20;
/** Longest raw input looked up as a code (a pasted code with a dash and spaces fits easily). */
const MAX_RAW_CODE_CHARS = 32;
/** Last resort when a user has neither a display name nor a username (ADR-0001). */
const FALLBACK_NAME = 'Player';
/** Nakama's own 400 message when AddFriends resolves no target (unknown id or username). */
const NAKAMA_NO_VALID_TARGET = 'No valid ID or username was provided.';
const HTTP_NOT_FOUND = 404;

// --- Pure helpers ----------------------------------------------------------

/** Display name, else username, else `Player` (ADR-0001 chain). */
export function displayNameOf(displayName: unknown, username: unknown): string {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (name) return name;
  const user = typeof username === 'string' ? username.trim() : '';
  return user ? user : FALLBACK_NAME;
}

export function isFriendState(value: unknown): value is FriendState {
  return (
    value === FRIEND_STATE.FRIEND ||
    value === FRIEND_STATE.REQUEST_SENT ||
    value === FRIEND_STATE.REQUEST_RECEIVED ||
    value === FRIEND_STATE.BLOCKED
  );
}

/** Epoch ms from an RFC 3339 / ISO timestamp; 0 when missing or unparseable. */
export function timeMs(value: unknown): number {
  if (typeof value !== 'string' || value === '') return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/** A `FriendEntry` from a nakama-js `Friend`, or null when it has no user id or an unknown state. */
export function toFriendEntry(friend: Friend): FriendEntry | null {
  const user = friend.user;
  const userId = user?.id;
  if (typeof userId !== 'string' || userId === '') return null;
  // The edge state is optional in the type: Nakama (proto3) leaves out 0 (FRIEND).
  const state = friend.state ?? FRIEND_STATE.FRIEND;
  if (!isFriendState(state)) return null;
  // `update_time` is the edge's; nakama-js 2.8 doesn't copy it yet (read it if a later version does).
  const edgeTime = 'update_time' in friend ? friend.update_time : undefined;
  return {
    userId,
    displayName: displayNameOf(user?.display_name, user?.username),
    code: friendCodeOf(user?.username),
    state,
    updatedAt: timeMs(edgeTime),
  };
}

/** Splits entries by state, deduping by user id (first seen wins). */
export function toFriendsSnapshot(entries: readonly FriendEntry[]): FriendsSnapshot {
  const friends: FriendEntry[] = [];
  const incoming: FriendEntry[] = [];
  const outgoing: FriendEntry[] = [];
  const blocked: FriendEntry[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.userId)) continue;
    seen.add(entry.userId);
    switch (entry.state) {
      case FRIEND_STATE.FRIEND:
        friends.push(entry);
        break;
      case FRIEND_STATE.REQUEST_SENT:
        outgoing.push(entry);
        break;
      case FRIEND_STATE.REQUEST_RECEIVED:
        incoming.push(entry);
        break;
      case FRIEND_STATE.BLOCKED:
        blocked.push(entry);
        break;
      default: {
        const unhandled: never = entry.state;
        throw new Error('toFriendsSnapshot: unknown state ' + String(unhandled));
      }
    }
  }
  return { friends, incoming, outgoing, blocked };
}

/** A rejected fetch `Response` as nakama-js throws it: an HTTP status and a body reader. */
interface HttpFailure {
  readonly status: number;
  json(): Promise<unknown>;
}

function isHttpFailure(error: unknown): error is HttpFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number' &&
    'json' in error &&
    typeof error.json === 'function'
  );
}

/** The `message` of a parsed error body, or null. */
function bodyMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('message' in body)) return null;
  return typeof body.message === 'string' ? body.message : null;
}

function isFriendErrorCode(value: unknown): value is FriendErrorCode {
  return typeof value === 'string' && FRIEND_ERROR_CODES.some((code) => code === value);
}

function isInviteRpcErrorCode(value: unknown): value is InviteRpcErrorCode {
  return typeof value === 'string' && INVITE_RPC_ERROR_CODES.some((code) => code === value);
}

/**
 * Maps a failed friend call's HTTP status and body to a reason: a hook error
 * (`friend_*`), `not_found` for Nakama's "no valid ID or username" 400 or a
 * 404, and `network` for anything else (401, 5xx, unreadable body).
 */
export function friendErrorFromBody(status: number, body: unknown): FriendErrorCode | 'not_found' | 'network' {
  const message = bodyMessage(body);
  if (isFriendErrorCode(message)) return message;
  if (message === NAKAMA_NO_VALID_TARGET || status === HTTP_NOT_FOUND) return 'not_found';
  return 'network';
}

/** `invite_to_table` failure body → reason; unknown messages are `network`. */
export function inviteErrorFromBody(body: unknown): InviteRpcErrorCode | 'network' {
  const message = bodyMessage(body);
  return isInviteRpcErrorCode(message) ? message : 'network';
}

/** Reads a rejection's body; null when it is not an HTTP response or the body is unreadable. */
async function failureBody(error: unknown): Promise<{ status: number; body: unknown } | null> {
  if (!isHttpFailure(error)) return null;
  try {
    return { status: error.status, body: await error.json() };
  } catch {
    return { status: error.status, body: null };
  }
}

/** Maps a nakama-js friend-call rejection (the fetch `Response`); a non-Response rejection is `network`. */
export async function friendErrorFrom(error: unknown): Promise<FriendErrorCode | 'not_found' | 'network'> {
  const failure = await failureBody(error);
  return failure === null ? 'network' : friendErrorFromBody(failure.status, failure.body);
}

/** Maps a nakama-js `invite_to_table` rejection; a non-Response rejection is `network`. */
export async function inviteErrorFrom(error: unknown): Promise<InviteRpcErrorCode | 'network'> {
  const failure = await failureBody(error);
  return failure === null ? 'network' : inviteErrorFromBody(failure.body);
}

/** `invite_to_table` success payload → result; a malformed one is `network`. */
export function inviteResultFromPayload(payload: unknown): InviteResult {
  if (typeof payload !== 'object' || payload === null || !('sent' in payload)) return { ok: false, reason: 'network' };
  return typeof payload.sent === 'boolean' ? { ok: true, sent: payload.sent } : { ok: false, reason: 'network' };
}

/** A typed code as its normalized form, or null when it can't be a friend code. */
export function friendCodeFromInput(input: string): string | null {
  if (input.length > MAX_RAW_CODE_CHARS) return null;
  const code = normalizeFriendCode(input);
  return isFriendCode(code) ? code : null;
}

/** The lookup result for the user matching `code`, or `not_found`. `self` compares id and username with the session. */
export function lookupResultFrom(
  users: readonly User[] | undefined,
  code: string,
  self: { readonly userId: string | undefined; readonly username: string | undefined },
): CodeLookupResult {
  // Usernames are exact-match; only accept the user whose username is this code.
  const user = (users ?? []).find((u) => typeof u.username === 'string' && u.username === code);
  const userId = user?.id;
  if (!user || typeof userId !== 'string' || userId === '') return { ok: false, reason: 'not_found' };
  const ownCode = typeof self.username === 'string' ? normalizeFriendCode(self.username) : null;
  return {
    ok: true,
    userId,
    displayName: displayNameOf(user.display_name, user.username),
    self: userId === self.userId || code === ownCode,
  };
}

function isUserId(value: string): boolean {
  return value.trim() !== '' && value.length <= 128;
}

// --- nakama-js implementation ----------------------------------------------

/** All edges of one state, following cursors (bounded by FRIEND_MAX_PAGES). */
async function listState(client: FriendsClient, session: Session, state: FriendState): Promise<FriendEntry[]> {
  const entries: FriendEntry[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < FRIEND_MAX_PAGES; page++) {
    const result = await client.listFriends(session, state, FRIEND_PAGE_SIZE, cursor);
    for (const friend of result.friends ?? []) {
      const entry = toFriendEntry(friend);
      // Keep only edges in the requested state, in case the server ignores the filter.
      if (entry && entry.state === state) entries.push(entry);
    }
    cursor = result.cursor || undefined;
    if (!cursor) break;
  }
  return entries;
}

/** Every friend edge of the session's user, split by state. Rejects on a network or server failure. */
export async function listFriendsSnapshot(client: FriendsClient, session: Session): Promise<FriendsSnapshot> {
  const states: FriendState[] = [
    FRIEND_STATE.FRIEND,
    FRIEND_STATE.REQUEST_SENT,
    FRIEND_STATE.REQUEST_RECEIVED,
    FRIEND_STATE.BLOCKED,
  ];
  const lists = await Promise.all(states.map((state) => listState(client, session, state)));
  return toFriendsSnapshot(lists.flat());
}

/** FriendsBackend over nakama-js and a session source (GuestAuth). */
export class NakamaFriendsBackend implements FriendsBackend {
  private readonly client: FriendsClient;
  private readonly auth: SessionSource;

  constructor(options: FriendsBackendOptions) {
    this.client = options.client;
    this.auth = options.auth;
  }

  async list(): Promise<FriendsSnapshot> {
    const { session } = await this.auth.signIn();
    return listFriendsSnapshot(this.client, session);
  }

  async recentPlayers(): Promise<readonly RecentPlayerEntry[]> {
    const { session } = await this.auth.signIn();
    // Fresh friend list every call, so a block made a moment ago is filtered out.
    const snapshot = await listFriendsSnapshot(this.client, session);
    return loadRecentPlayers(this.client, session, snapshot);
  }

  async lookupCode(input: string): Promise<CodeLookupResult> {
    const code = friendCodeFromInput(input);
    if (code === null) return { ok: false, reason: 'bad_code' };
    try {
      const { session } = await this.auth.signIn();
      const users = await this.client.getUsers(session, undefined, [code]);
      return lookupResultFrom(users.users, code, { userId: session.user_id, username: session.username });
    } catch {
      return { ok: false, reason: 'network' };
    }
  }

  add(userId: string): Promise<FriendActionResult> {
    return this.edgeAction(userId, (session, ids) => this.client.addFriends(session, ids));
  }

  remove(userId: string): Promise<FriendActionResult> {
    return this.edgeAction(userId, (session, ids) => this.client.deleteFriends(session, ids));
  }

  block(userId: string): Promise<FriendActionResult> {
    return this.edgeAction(userId, (session, ids) => this.client.blockFriends(session, ids));
  }

  async invite(userId: string, roomCode: string): Promise<InviteResult> {
    const code = normalizeRoomCode(roomCode);
    if (!isUserId(userId) || !isRoomCode(code)) return { ok: false, reason: 'invite_bad_request' };
    let session: Session;
    try {
      ({ session } = await this.auth.signIn());
    } catch {
      return { ok: false, reason: 'network' };
    }
    const request: InviteToTableRequest = { userId, code };
    try {
      const response = await this.client.rpc(session, 'invite_to_table', request);
      return inviteResultFromPayload(response.payload);
    } catch (error) {
      return { ok: false, reason: await inviteErrorFrom(error) };
    }
  }

  /** One AddFriends/DeleteFriends/BlockFriends call by id, with the shared error mapping. */
  private async edgeAction(
    userId: string,
    call: (session: Session, ids: string[]) => Promise<boolean>,
  ): Promise<FriendActionResult> {
    if (!isUserId(userId)) return { ok: false, reason: 'not_found' };
    let session: Session;
    try {
      ({ session } = await this.auth.signIn());
    } catch {
      return { ok: false, reason: 'network' };
    }
    if (userId === session.user_id) return { ok: false, reason: 'not_found' };
    try {
      await call(session, [userId]);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: await friendErrorFrom(error) };
    }
  }
}

/** The production FriendsBackend, built on the app's shared client and GuestAuth (see services.ts). */
export function createFriendsBackend(options: FriendsBackendOptions): FriendsBackend {
  return new NakamaFriendsBackend(options);
}
