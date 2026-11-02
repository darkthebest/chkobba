import type { Client, Session } from '@heroiclabs/nakama-js';

import {
  DIRECTORY_RPC_ERROR_CODES,
  isSearchableQuery,
  normalizeQuery,
  PRESENCE_VISIBILITY,
  type CompetitiveStats,
  type DirectoryPlayer,
  type DirectoryRpcErrorCode,
  type GetPlayerProfileRequest,
  type PlayerProfileResponse,
  type PlayerStats,
  type PracticeStats,
  type PresenceVisibility,
  type PresenceVisibilityLabel,
  type SearchPlayersRequest,
  type SearchPlayersResponse,
  type SetPresenceVisibilityRequest,
  type SetPresenceVisibilityResponse,
} from '@chkobba/protocol';

import type { SessionSource } from './profile';

/**
 * Players directory over nakama-js: search by name and read a player's public
 * profile. Both RPCs are server-authoritative; this module only maps their
 * answers and errors. Cursors are opaque: `nextCursor` goes back to the server
 * verbatim, never parsed or rebuilt.
 *
 * Errors follow `friends.ts`: a refusal is a returned reason, so a call site
 * can branch on it without a try/catch. Sign-in, RPC and payload failures all
 * come back as `{ ok: false, reason }`; nothing here rejects.
 */

/** Reason a directory call was refused; the UI translates the code. */
export type DirectoryError = DirectoryRpcErrorCode | 'network';

/**
 * One page of search results, or the reason the search was refused. The
 * success branch is the protocol's `SearchPlayersResponse`, so the wire shape
 * is not restated here.
 */
export type DirectoryPage =
  | ({ readonly ok: true } & SearchPlayersResponse)
  | { readonly ok: false; readonly reason: DirectoryError };

/**
 * One player's public profile, or the reason the read was refused. The success
 * branch is the protocol's `PlayerProfileResponse`.
 */
export type PlayerProfile =
  | ({ readonly ok: true } & PlayerProfileResponse)
  | { readonly ok: false; readonly reason: DirectoryError };

/**
 * The presence choice now saved on the server, or the reason it wasn't. The
 * success branch is the protocol's `SetPresenceVisibilityResponse`.
 */
export type SetPresenceVisibilityResult =
  | ({ readonly ok: true } & SetPresenceVisibilityResponse)
  | { readonly ok: false; readonly reason: DirectoryError };

/** Port for the directory UI, next to `FriendsBackend` and `ProfileBackend`. Never rejects. */
export interface DirectoryBackend {
  /**
   * One page of players whose name starts with `query`. `cursor` is an opaque
   * `nextCursor` from a previous page (absent for the first page). A query too
   * short or too long is a returned `directory_bad_query`, not a throw.
   */
  search(query: string, cursor?: string | null): Promise<DirectoryPage>;
  /** One player's name, presence label and stat blocks. */
  profile(userId: string): Promise<PlayerProfile>;
  /**
   * Saves the caller's presence choice; only this RPC writes the prefs record.
   * The caller still has to apply it to the live socket.
   */
  setPresenceVisibility(visibility: PresenceVisibility): Promise<SetPresenceVisibilityResult>;
}

/** The nakama-js calls this module makes, so tests can pass a small fake. */
export type DirectoryClient = Pick<Client, 'rpc'>;

export interface DirectoryBackendOptions {
  readonly client: DirectoryClient;
  readonly auth: SessionSource;
}

/** Nakama user ids are 36-character UUIDs; leave room, but cap the field (server's MAX_USER_ID_LENGTH). */
const MAX_USER_ID_CHARS = 128;
const HTTP_NOT_FOUND = 404;

// --- Pure helpers ----------------------------------------------------------

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

function isDirectoryRpcErrorCode(value: unknown): value is DirectoryRpcErrorCode {
  return typeof value === 'string' && DIRECTORY_RPC_ERROR_CODES.some((code) => code === value);
}

/**
 * Maps a failed directory call's HTTP status and body to a reason: a server
 * business error (`directory_*` / `presence_bad_request`) by its `message`, a
 * bare 404 to `directory_not_found` (the `friends.ts` convention), and
 * `network` for anything else (401, 5xx, `directory_storage_error`, or an
 * unreadable body). The body's `error.stackTrace` is never inspected.
 */
export function directoryErrorFromBody(status: number, body: unknown): DirectoryError {
  const message = bodyMessage(body);
  if (isDirectoryRpcErrorCode(message)) return message;
  if (status === HTTP_NOT_FOUND) return 'directory_not_found';
  return 'network';
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

/** Maps a nakama-js directory-call rejection (the fetch `Response`); a non-Response rejection is `network`. */
export async function directoryErrorFrom(error: unknown): Promise<DirectoryError> {
  const failure = await failureBody(error);
  return failure === null ? 'network' : directoryErrorFromBody(failure.status, failure.body);
}

function isPresenceLabel(value: unknown): value is PresenceVisibilityLabel {
  return value === 'visible' || value === 'hidden';
}

function isPresenceChoice(value: unknown): value is PresenceVisibility {
  return typeof value === 'string' && PRESENCE_VISIBILITY.some((choice) => choice === value);
}

/** A row from `search_players`, or null when it is missing an id, name or presence label. */
export function toDirectoryPlayer(value: unknown): DirectoryPlayer | null {
  if (typeof value !== 'object' || value === null) return null;
  const userId = 'userId' in value ? value.userId : undefined;
  const name = 'name' in value ? value.name : undefined;
  const presence = 'presence' in value ? value.presence : undefined;
  if (typeof userId !== 'string' || userId === '') return null;
  if (typeof name !== 'string' || name === '') return null;
  if (!isPresenceLabel(presence)) return null;
  return { userId, name, presence };
}

/** `nextCursor` from the server: a string, null, or a missing field (read as null). */
function isNextCursor(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

/** `search_players` success payload → page; a malformed envelope is `network`, malformed rows are dropped. */
export function searchResultFromPayload(payload: unknown): DirectoryPage {
  if (typeof payload !== 'object' || payload === null) return { ok: false, reason: 'network' };
  const players = 'players' in payload ? payload.players : undefined;
  const nextCursor = 'nextCursor' in payload ? payload.nextCursor : undefined;
  const capped = 'capped' in payload ? payload.capped : undefined;
  if (!Array.isArray(players) || !isNextCursor(nextCursor) || typeof capped !== 'boolean') {
    return { ok: false, reason: 'network' };
  }
  const valid: DirectoryPlayer[] = [];
  for (const row of players) {
    const player = toDirectoryPlayer(row);
    if (player) valid.push(player);
  }
  return { ok: true, players: valid, nextCursor: nextCursor ?? null, capped };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** A competitive block from the wire, or null when a field is missing or not a count. */
function parseCompetitiveStats(value: unknown): CompetitiveStats | null {
  if (typeof value !== 'object' || value === null) return null;
  const games = 'games' in value ? value.games : undefined;
  const wins = 'wins' in value ? value.wins : undefined;
  const chkobbas = 'chkobbas' in value ? value.chkobbas : undefined;
  const currentStreak = 'currentStreak' in value ? value.currentStreak : undefined;
  const bestStreak = 'bestStreak' in value ? value.bestStreak : undefined;
  const updatedAt = 'updatedAt' in value ? value.updatedAt : undefined;
  if (!isCount(games) || !isCount(wins) || !isCount(chkobbas)) return null;
  if (!isCount(currentStreak) || !isCount(bestStreak) || !isCount(updatedAt)) return null;
  return { games, wins, chkobbas, currentStreak, bestStreak, updatedAt };
}

/** A practice block from the wire, or null when a field is missing or not a count. */
function parsePracticeStats(value: unknown): PracticeStats | null {
  if (typeof value !== 'object' || value === null) return null;
  const games = 'games' in value ? value.games : undefined;
  const wins = 'wins' in value ? value.wins : undefined;
  const chkobbas = 'chkobbas' in value ? value.chkobbas : undefined;
  const updatedAt = 'updatedAt' in value ? value.updatedAt : undefined;
  if (!isCount(games) || !isCount(wins) || !isCount(chkobbas) || !isCount(updatedAt)) return null;
  return { games, wins, chkobbas, updatedAt };
}

/** Both stat blocks with separate provenance; null when either is malformed. Never summed. */
function parsePlayerStats(value: unknown): PlayerStats | null {
  if (typeof value !== 'object' || value === null) return null;
  const competitive = parseCompetitiveStats('competitive' in value ? value.competitive : undefined);
  const practice = parsePracticeStats('practice' in value ? value.practice : undefined);
  if (competitive === null || practice === null) return null;
  return { competitive, practice };
}

/** `get_player_profile` success payload → profile; a malformed one is `network`. */
export function profileResultFromPayload(payload: unknown): PlayerProfile {
  if (typeof payload !== 'object' || payload === null) return { ok: false, reason: 'network' };
  const userId = 'userId' in payload ? payload.userId : undefined;
  const name = 'name' in payload ? payload.name : undefined;
  const presence = 'presence' in payload ? payload.presence : undefined;
  const stats = parsePlayerStats('stats' in payload ? payload.stats : undefined);
  if (typeof userId !== 'string' || userId === '') return { ok: false, reason: 'network' };
  if (typeof name !== 'string' || name === '') return { ok: false, reason: 'network' };
  if (!isPresenceLabel(presence) || stats === null) return { ok: false, reason: 'network' };
  return { ok: true, userId, name, presence, stats };
}

/** `set_presence_visibility` success payload → saved choice; a malformed one is `network`. */
export function setVisibilityResultFromPayload(payload: unknown): SetPresenceVisibilityResult {
  if (typeof payload !== 'object' || payload === null) return { ok: false, reason: 'network' };
  const visibility = 'visibility' in payload ? payload.visibility : undefined;
  const updatedAt = 'updatedAt' in payload ? payload.updatedAt : undefined;
  if (!isPresenceChoice(visibility) || !isCount(updatedAt)) return { ok: false, reason: 'network' };
  return { ok: true, visibility, updatedAt };
}

/** True for a first-page cursor: absent, null or empty. Anything else is an opaque cursor to send back. */
function isFirstPage(cursor: string | null | undefined): cursor is undefined | null | '' {
  return cursor === undefined || cursor === null || cursor === '';
}

function isUserId(value: string): boolean {
  return value.trim() !== '' && value.length <= MAX_USER_ID_CHARS;
}

// --- nakama-js implementation ----------------------------------------------

/** DirectoryBackend over nakama-js and a session source (GuestAuth). */
export class NakamaDirectoryBackend implements DirectoryBackend {
  private readonly client: DirectoryClient;
  private readonly auth: SessionSource;

  constructor(options: DirectoryBackendOptions) {
    this.client = options.client;
    this.auth = options.auth;
  }

  async search(query: string, cursor?: string | null): Promise<DirectoryPage> {
    // Same gate as the server's normalizeSearch, so a refused query costs no request.
    const normalized = normalizeQuery(query);
    if (!isSearchableQuery(normalized)) return { ok: false, reason: 'directory_bad_query' };
    let session: Session;
    try {
      ({ session } = await this.auth.signIn());
    } catch {
      return { ok: false, reason: 'network' };
    }
    const request: SearchPlayersRequest = isFirstPage(cursor) ? { q: normalized } : { q: normalized, cursor };
    try {
      const response = await this.client.rpc(session, 'search_players', request);
      return searchResultFromPayload(response.payload);
    } catch (error) {
      return { ok: false, reason: await directoryErrorFrom(error) };
    }
  }

  async profile(userId: string): Promise<PlayerProfile> {
    if (!isUserId(userId)) return { ok: false, reason: 'directory_bad_query' };
    let session: Session;
    try {
      ({ session } = await this.auth.signIn());
    } catch {
      return { ok: false, reason: 'network' };
    }
    const request: GetPlayerProfileRequest = { userId };
    try {
      const response = await this.client.rpc(session, 'get_player_profile', request);
      return profileResultFromPayload(response.payload);
    } catch (error) {
      return { ok: false, reason: await directoryErrorFrom(error) };
    }
  }

  async setPresenceVisibility(visibility: PresenceVisibility): Promise<SetPresenceVisibilityResult> {
    let session: Session;
    try {
      ({ session } = await this.auth.signIn());
    } catch {
      return { ok: false, reason: 'network' };
    }
    const request: SetPresenceVisibilityRequest = { visibility };
    try {
      const response = await this.client.rpc(session, 'set_presence_visibility', request);
      return setVisibilityResultFromPayload(response.payload);
    } catch (error) {
      return { ok: false, reason: await directoryErrorFrom(error) };
    }
  }
}

/** The production DirectoryBackend, built on the app's shared client and GuestAuth (see services.ts). */
export function createDirectoryBackend(options: DirectoryBackendOptions): DirectoryBackend {
  return new NakamaDirectoryBackend(options);
}
