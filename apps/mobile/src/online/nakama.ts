import {
  isRoomCode,
  normalizeRoomCode,
  type CreatePrivateTableResponse,
  type JoinByCodeRequest,
} from '@chkobba/protocol';
import { Client, Session, type MatchData, type Socket } from '@heroiclabs/nakama-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { DEVICE_ID_KEY, DEVICE_ID_PREFIX, isValidDeviceId, type DeviceIdStore } from './deviceId';
import { createDeviceIdStore } from './deviceIdStore';
import type {
  JoinByCodeResult,
  JoinMetadata,
  JoinResult,
  MatchSocket,
  MatchSocketHandlers,
  OnlineServicesBackend,
} from './NakamaGameClient';
import { CreatePrivateTableError } from './roomErrors';

/**
 * Nakama access for the mobile app: client configuration, guest (device)
 * login with a durable device id and a persisted session, the quick_match
 * and private-table RPCs, and an adapter from nakama-js to the small `OnlineBackend` port that
 * NakamaGameClient depends on.
 */

export interface NakamaConfig {
  readonly host: string;
  readonly port: string;
  readonly serverKey: string;
  readonly useSSL: boolean;
}

/** Raw env values; Expo only inlines `process.env.EXPO_PUBLIC_*` when read with literal dot access. */
export interface NakamaEnv {
  readonly host?: string;
  readonly port?: string;
  readonly serverKey?: string;
  readonly ssl?: string;
}

const LOCAL_DEFAULTS: NakamaConfig = { host: '127.0.0.1', port: '7350', serverKey: 'defaultkey', useSSL: false };

function readEnv(): NakamaEnv {
  return {
    host: process.env.EXPO_PUBLIC_NAKAMA_HOST,
    port: process.env.EXPO_PUBLIC_NAKAMA_PORT,
    serverKey: process.env.EXPO_PUBLIC_NAKAMA_KEY,
    ssl: process.env.EXPO_PUBLIC_NAKAMA_SSL,
  };
}

/** Config from EXPO_PUBLIC_NAKAMA_* with local-dev defaults; malformed values fall back to the default. */
export function nakamaConfig(env: NakamaEnv = readEnv()): NakamaConfig {
  const host = env.host?.trim();
  const port = env.port?.trim();
  const serverKey = env.serverKey?.trim();
  const ssl = env.ssl?.trim().toLowerCase();
  const portNumber = Number(port);
  return {
    host: host && /^[A-Za-z0-9.-]{1,253}$/.test(host) ? host : LOCAL_DEFAULTS.host,
    port: port && Number.isInteger(portNumber) && portNumber > 0 && portNumber < 65536 ? port : LOCAL_DEFAULTS.port,
    serverKey: serverKey ? serverKey : LOCAL_DEFAULTS.serverKey,
    useSSL: ssl === 'true' || ssl === '1' ? true : ssl === 'false' || ssl === '0' ? false : LOCAL_DEFAULTS.useSSL,
  };
}

export function createNakamaClient(config: NakamaConfig = nakamaConfig()): Client {
  // autoRefreshSession off: GuestAuth refreshes explicitly and persists the result.
  return new Client(config.serverKey, config.host, config.port, config.useSSL, 7000, false);
}

/** The subset of AsyncStorage used here, so tests can pass an in-memory store. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Fills `count` random bytes. */
export type RandomBytes = (count: number) => Uint8Array;

/** A new random (v4) UUID. */
export type NewUuid = () => string;

/** Cryptographic random bytes from the platform CSPRNG (expo-crypto). */
export const defaultRandomBytes: RandomBytes = (count) => Crypto.getRandomBytes(count);

/** Formats 16 random bytes as a UUID v4. */
export function uuidFromBytes(bytes: Uint8Array): string {
  const b = Array.from(bytes.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Cryptographic UUID v4 from the platform CSPRNG. Built from random bytes rather than
 * `randomUUID`, which browsers only expose on secure origins (not `http://<LAN-IP>`).
 */
export const defaultUuid: NewUuid = () => uuidFromBytes(defaultRandomBytes(16));

const SESSION_KEY = 'chkobba.online.session';
/** Set in the KeyValueStore once the legacy AsyncStorage id has been migrated to the DeviceIdStore. */
const DEVICE_ID_MIGRATED_KEY = 'chkobba.online.deviceIdMigrated';

/** A new random device id, `chk-<uuid v4>`. The only place the app creates one. */
export function newDeviceId(uuid: NewUuid = defaultUuid): string {
  const id = `${DEVICE_ID_PREFIX}${uuid()}`;
  if (!isValidDeviceId(id)) throw new Error('newDeviceId: malformed uuid');
  return id;
}

/** HTTP status of a failed nakama-js call (it rejects with the fetch Response), or null. */
function httpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('status' in error)) return null;
  const { status } = error;
  return typeof status === 'number' ? status : null;
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/**
 * True when a call failed because the session's account is gone, so only a new
 * sign-in can help. Nakama answers 401 `Auth token invalid` once a session is
 * revoked (e.g. the account was deleted while the server ran). After a
 * database wipe the token still verifies, so most calls succeed with empty
 * data, and only `getAccount` notices: 404 `Account not found.`. Treat a 404
 * as stale only for `getAccount`.
 */
export function isStaleSessionError(error: unknown): boolean {
  const status = httpStatus(error);
  return status === HTTP_UNAUTHORIZED || status === HTTP_NOT_FOUND;
}
/** Refresh a session this long before it expires, so a socket connect never races the expiry. */
const EXPIRY_MARGIN_SEC = 60;

interface StoredSession {
  readonly token: string;
  readonly refreshToken: string;
}

function parseStoredSession(text: string | null): StoredSession | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || !('token' in value) || !('refreshToken' in value)) return null;
    const { token, refreshToken } = value;
    return typeof token === 'string' && typeof refreshToken === 'string' ? { token, refreshToken } : null;
  } catch {
    return null;
  }
}

/** The platform the app runs on; only Android migrates through `linkDevice`. */
export type DevicePlatform = typeof Platform.OS;

/** Logs an event without ids or other personal data. */
export type AuthLog = (message: string) => void;

const defaultLog: AuthLog = (message) => console.warn(message);

export interface GuestAuthOptions {
  readonly client: Client;
  readonly store?: KeyValueStore;
  /** Where the durable guest credential lives; defaults to the platform's store. */
  readonly deviceIdStore?: DeviceIdStore;
  /** Picks the legacy-id migration; defaults to `Platform.OS`. */
  readonly platform?: DevicePlatform;
  readonly uuid?: NewUuid;
  readonly now?: () => number;
  readonly log?: AuthLog;
}

/** A signed-in session. */
export interface SignedIn {
  readonly session: Session;
}

/**
 * How the one-time legacy-id migration ended.
 * - `done`: set the migrated flag. `deviceId` is the id to use (null: none yet,
 *   create one); `accountChanged` means the cached session may belong to
 *   another account and is dropped.
 * - `retry`: a network or server problem; use `deviceId` for now and try
 *   again on the next launch.
 */
type Migration =
  | { readonly status: 'done'; readonly deviceId: string | null; readonly accountChanged: boolean }
  | { readonly status: 'retry'; readonly deviceId: string };

/**
 * Guest login: restores the persisted session (checking once that its account
 * still exists), refreshes it near expiry, and otherwise authenticates with the
 * device id (creating the account; the server picks its username, the friend
 * code). Concurrent callers share one in-flight request. A caller that finds
 * the account gone later calls `invalidate` and signs in again.
 *
 * The device id comes from the platform `DeviceIdStore` (it survives a
 * reinstall). Builds before that kept it in AsyncStorage; the first sign-in
 * migrates that legacy id once (see `migrate`). The legacy value is left in
 * place for one release as a rollback path.
 */
export class GuestAuth {
  private readonly client: Client;
  private readonly store: KeyValueStore;
  private readonly deviceIdStore: DeviceIdStore;
  private readonly platform: DevicePlatform;
  private readonly uuid: NewUuid;
  private readonly now: () => number;
  private readonly log: AuthLog;
  private session: Session | null = null;
  private deviceId: string | null = null;
  private pending: Promise<SignedIn> | null = null;
  private resuming: Promise<SignedIn | null> | null = null;

  constructor(options: GuestAuthOptions) {
    this.client = options.client;
    this.store = options.store ?? AsyncStorage;
    this.deviceIdStore = options.deviceIdStore ?? createDeviceIdStore();
    this.platform = options.platform ?? Platform.OS;
    this.uuid = options.uuid ?? defaultUuid;
    this.now = options.now ?? Date.now;
    this.log = options.log ?? defaultLog;
  }

  /** A session valid for at least another minute. */
  signIn(): Promise<SignedIn> {
    if (!this.pending) {
      this.pending = this.ensureSession().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /**
   * The persisted session, refreshed if it is near expiry, without ever
   * authenticating: no account is created or signed in to. Resolves null when
   * nothing is stored, the refresh token was rejected, or the stored session's
   * account is gone (only `signIn` recovers from those), and rejects on a
   * network failure. For launch-time work that
   * must not create a guest account (the social socket, ADR-0003).
   */
  resume(): Promise<SignedIn | null> {
    // An in-flight sign-in yields the same session this would.
    if (this.pending) return this.pending;
    if (!this.resuming) {
      this.resuming = this.resumeSession().finally(() => {
        this.resuming = null;
      });
    }
    return this.resuming;
  }

  /** Forgets the persisted session (not the device id), e.g. after the server rejected it. */
  async signOut(): Promise<void> {
    this.session = null;
    await this.store.removeItem(SESSION_KEY);
  }

  /**
   * Drops `stale` after a call showed its account is gone (`isStaleSessionError`),
   * so the next `signIn` authenticates with the device id again. A no-op when
   * the session was already replaced, so callers that saw the same stale
   * session lead to one re-authentication, not one each.
   */
  async invalidate(stale: Session): Promise<void> {
    const currentToken = this.session?.token ?? parseStoredSession(await this.store.getItem(SESSION_KEY))?.token;
    if (currentToken !== stale.token) return;
    await this.signOut();
  }

  private async ensureSession(): Promise<SignedIn> {
    // Before restoring: the migration may adopt a session or drop one that belongs to another account.
    const deviceId = await this.resolveDeviceId();
    const nowSec = this.now() / 1000;
    const restored = this.session === null;
    const current = this.session ?? (await this.restore());
    if (current && !current.isexpired(nowSec + EXPIRY_MARGIN_SEC)) {
      // A session from storage is checked once: its account may be gone (database wiped or account deleted).
      if (restored && !(await this.isLive(current))) return this.authenticate(deviceId);
      this.session = current;
      return { session: current };
    }
    if (current && !current.isrefreshexpired(nowSec + EXPIRY_MARGIN_SEC)) {
      try {
        const refreshed = await this.client.sessionRefresh(current);
        return this.adopt(refreshed);
      } catch (error) {
        // 401: refresh token revoked or unknown; fall through to device auth. Anything else is a network problem.
        if (httpStatus(error) === null) throw error;
      }
    }
    return this.authenticate(deviceId);
  }

  private async resumeSession(): Promise<SignedIn | null> {
    if (this.session === null && (await this.store.getItem(SESSION_KEY)) === null) return null;
    // A stored session means this device has an account, so the one-time migration may run
    // (it never creates one: its legacy sign-in uses create=false) and may drop the session.
    await this.resolveDeviceId();
    const nowSec = this.now() / 1000;
    const restored = this.session === null;
    const current = this.session ?? (await this.restore());
    if (!current) return null;
    if (!current.isexpired(nowSec + EXPIRY_MARGIN_SEC)) {
      // A stored session whose account is gone is dropped; only `signIn` creates the replacement.
      if (restored && !(await this.isLive(current))) return null;
      this.session = current;
      return { session: current };
    }
    if (current.isrefreshexpired(nowSec + EXPIRY_MARGIN_SEC)) return null;
    try {
      return await this.adopt(await this.client.sessionRefresh(current));
    } catch (error) {
      // An HTTP answer (401): the refresh token is gone, and only device auth can recover.
      if (httpStatus(error) !== null) return null;
      throw error;
    }
  }

  /** The device id to authenticate with, resolved once per instance (the app shares one, see services.ts). */
  private async resolveDeviceId(): Promise<string> {
    if (this.deviceId === null) this.deviceId = await this.loadDeviceId();
    return this.deviceId;
  }

  private async loadDeviceId(): Promise<string> {
    let durable = await this.deviceIdStore.load();
    if ((await this.store.getItem(DEVICE_ID_MIGRATED_KEY)) === null) {
      const migration = await this.migrate(durable);
      // Not flagged: the next launch tries again, and this one uses the legacy id.
      if (migration.status === 'retry') return migration.deviceId;
      if (migration.accountChanged) await this.signOut();
      await this.store.setItem(DEVICE_ID_MIGRATED_KEY, '1');
      durable = migration.deviceId;
    }
    if (durable !== null) return durable;
    // Fresh install with nothing durable yet (no Keychain item, no ANDROID_ID).
    const created = newDeviceId(this.uuid);
    await this.deviceIdStore.save(created);
    return created;
  }

  /** Moves a valid legacy AsyncStorage id (read once) over to the durable store. */
  private async migrate(durable: string | null): Promise<Migration> {
    const legacy = await this.store.getItem(DEVICE_ID_KEY);
    if (legacy === null || !isValidDeviceId(legacy) || legacy === durable) {
      return { status: 'done', deviceId: durable, accountChanged: false };
    }
    if (durable === null) {
      // iOS: an empty Keychain takes the legacy id. Android without ANDROID_ID: it becomes the saved fallback.
      await this.deviceIdStore.save(legacy);
      return { status: 'done', deviceId: legacy, accountChanged: false };
    }
    // Both exist and differ. iOS (and anywhere but Android): the Keychain wins, so a cached session is the legacy account's.
    if (this.platform !== 'android') return { status: 'done', deviceId: durable, accountChanged: true };
    return this.linkLegacyAccount(legacy, durable);
  }

  /**
   * Android: adds the durable id to the legacy account, so later launches (and
   * reinstalls) sign in to the same account with the durable id.
   */
  private async linkLegacyAccount(legacy: string, durable: string): Promise<Migration> {
    let legacySession: Session;
    try {
      // create=false: a legacy account deleted on the server must not come back as an empty one.
      legacySession = await this.client.authenticateDevice(legacy, false);
    } catch (error) {
      if (httpStatus(error) === HTTP_NOT_FOUND) return { status: 'done', deviceId: durable, accountChanged: true };
      return { status: 'retry', deviceId: legacy };
    }
    // Same account whatever happens next, so this session stays valid.
    await this.adopt(legacySession);
    try {
      await this.client.linkDevice(legacySession, { id: durable });
    } catch (error) {
      if (httpStatus(error) !== HTTP_CONFLICT) return { status: 'retry', deviceId: legacy };
      // The durable id already belongs to another account: keep the legacy one. A saved
      // (non-derived) id is the Android store's fallback, which `load` prefers from now on.
      await this.deviceIdStore.save(legacy);
      this.log('GuestAuth: durable device id belongs to another account; kept the legacy guest account');
      return { status: 'done', deviceId: legacy, accountChanged: false };
    }
    return { status: 'done', deviceId: durable, accountChanged: false };
  }

  private async authenticate(deviceId: string): Promise<SignedIn> {
    // No username: the server's before-hook generates the friend code on account creation. A rare
    // code clash answers 409 and the hook picks a fresh code on each call, so one retry is enough.
    let session: Session;
    try {
      session = await this.client.authenticateDevice(deviceId, true);
    } catch (error) {
      if (httpStatus(error) !== HTTP_CONFLICT) throw error;
      session = await this.client.authenticateDevice(deviceId, true);
    }
    return this.adopt(session);
  }

  /**
   * Whether a session read from storage still has an account on the server.
   * A refreshed or newly authenticated session needs no check: the server just
   * issued it. False (and the session dropped) on 401/404; rejects on anything
   * else, such as a network failure.
   */
  private async isLive(session: Session): Promise<boolean> {
    try {
      await this.client.getAccount(session);
      return true;
    } catch (error) {
      if (!isStaleSessionError(error)) throw error;
      await this.signOut();
      this.log('GuestAuth: the stored session has no account on the server; dropped it');
      return false;
    }
  }

  private async adopt(session: Session): Promise<SignedIn> {
    this.session = session;
    const stored: StoredSession = { token: session.token, refreshToken: session.refresh_token };
    await this.store.setItem(SESSION_KEY, JSON.stringify(stored));
    return { session };
  }

  private async restore(): Promise<Session | null> {
    const stored = parseStoredSession(await this.store.getItem(SESSION_KEY));
    if (!stored) return null;
    try {
      return Session.restore(stored.token, stored.refreshToken);
    } catch {
      await this.store.removeItem(SESSION_KEY);
      return null;
    }
  }
}

/** Nakama match ids look like `<uuid>.<node>`. */
const MATCH_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

/** Calls the `quick_match` RPC and returns the table's match id. */
export async function quickMatch(client: Client, session: Session): Promise<string> {
  const response = await client.rpc(session, 'quick_match', {});
  const payload: unknown = response.payload;
  if (typeof payload !== 'object' || payload === null || !('matchId' in payload)) {
    throw new Error('quick_match: malformed response');
  }
  const { matchId } = payload;
  if (typeof matchId !== 'string' || !MATCH_ID_PATTERN.test(matchId)) throw new Error('quick_match: malformed match id');
  return matchId;
}

/** Longest raw input sent to join_by_code (the server rejects more than 32 chars before normalizing). */
const MAX_RAW_CODE_CHARS = 32;

/**
 * The `message` of a failed RPC. nakama-js rejects with the fetch `Response`,
 * whose body is `{"code":<n>,"error":{…},"message":"<message>"}`. Null for a
 * timeout, a network error or an unreadable body.
 */
export async function rpcErrorMessage(error: unknown): Promise<string | null> {
  if (typeof error !== 'object' || error === null || !('json' in error) || typeof error.json !== 'function') return null;
  try {
    const body: unknown = await error.json();
    if (typeof body !== 'object' || body === null || !('message' in body)) return null;
    return typeof body.message === 'string' ? body.message : null;
  } catch {
    return null;
  }
}

/** RPC error message → `join_by_code` failure reason. A 401 (free-text message) and anything unknown is `network`. */
function joinByCodeFailure(message: string | null): Exclude<JoinByCodeResult, { ok: true }>['reason'] {
  switch (message) {
    case 'room_not_found':
      return 'not_found';
    case 'room_bad_code':
      return 'bad_code';
    case 'room_rate_limited':
      return 'rate_limited';
    default:
      return 'network';
  }
}

/** Calls `create_private_table`. Rejects with a `CreatePrivateTableError`. */
export async function createPrivateTable(client: Client, session: Session): Promise<CreatePrivateTableResponse> {
  let payload: unknown;
  try {
    payload = (await client.rpc(session, 'create_private_table', {})).payload;
  } catch (error) {
    const message = await rpcErrorMessage(error);
    throw new CreatePrivateTableError(message === 'room_rate_limited' ? 'rate_limited' : 'network');
  }
  if (typeof payload !== 'object' || payload === null || !('matchId' in payload) || !('code' in payload)) {
    throw new CreatePrivateTableError('network');
  }
  const { matchId, code } = payload;
  if (typeof matchId !== 'string' || !MATCH_ID_PATTERN.test(matchId) || typeof code !== 'string' || !isRoomCode(code)) {
    throw new CreatePrivateTableError('network');
  }
  return { matchId, code };
}

/**
 * Calls `join_by_code`. The input is normalized first; one that can't be a
 * code resolves `bad_code` without a request. Never rejects.
 */
export async function joinByCode(client: Client, session: Session, input: string): Promise<JoinByCodeResult> {
  const code = input.length > MAX_RAW_CODE_CHARS ? '' : normalizeRoomCode(input);
  if (!isRoomCode(code)) return { ok: false, reason: 'bad_code' };
  const request: JoinByCodeRequest = { code };
  let payload: unknown;
  try {
    payload = (await client.rpc(session, 'join_by_code', request)).payload;
  } catch (error) {
    return { ok: false, reason: joinByCodeFailure(await rpcErrorMessage(error)) };
  }
  if (typeof payload !== 'object' || payload === null || !('matchId' in payload)) return { ok: false, reason: 'network' };
  const { matchId } = payload;
  if (typeof matchId !== 'string' || !MATCH_ID_PATTERN.test(matchId)) return { ok: false, reason: 'network' };
  return { ok: true, matchId };
}

/** Nakama realtime error codes (rtapi.Error.Code). */
const SOCKET_MATCH_NOT_FOUND = 4;
const SOCKET_MATCH_JOIN_REJECTED = 5;

function socketError(error: unknown): { code: number | null; message: string } | null {
  if (typeof error !== 'object' || error === null || !('message' in error)) return null;
  const { message } = error;
  if (typeof message !== 'string') return null;
  const code = 'code' in error && typeof error.code === 'number' ? error.code : null;
  return { code, message };
}

/** Maps a joinMatch rejection to a JoinResult; rethrows anything that looks like a transport failure. */
export function joinFailure(error: unknown): JoinResult {
  const parsed = socketError(error);
  if (!parsed) throw error;
  if (parsed.message === 'table_full') return { ok: false, reason: 'table_full' };
  // Private tables: a missing or wrong code (or a dead room) and a room with no space left.
  if (parsed.message === 'room_not_found') return { ok: false, reason: 'room_not_found' };
  if (parsed.message === 'room_full') return { ok: false, reason: 'room_full' };
  if (parsed.code === SOCKET_MATCH_NOT_FOUND || /match not found/i.test(parsed.message)) {
    return { ok: false, reason: 'not_found' };
  }
  if (parsed.code === SOCKET_MATCH_JOIN_REJECTED) return { ok: false, reason: 'rejected', detail: parsed.message };
  throw error;
}

class NakamaMatchSocket implements MatchSocket {
  private closed = false;

  constructor(private readonly socket: Socket) {}

  async joinMatch(matchId: string, metadata?: JoinMetadata): Promise<JoinResult> {
    try {
      if (metadata === undefined) await this.socket.joinMatch(matchId);
      else await this.socket.joinMatch(matchId, undefined, metadata);
      return { ok: true };
    } catch (error) {
      return joinFailure(error);
    }
  }

  leaveMatch(matchId: string): Promise<void> {
    return this.socket.leaveMatch(matchId);
  }

  send(matchId: string, opCode: number, data: string): Promise<void> {
    return this.socket.sendMatchState(matchId, opCode, data);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    // The adapter's close event calls ondisconnect even with disconnect(false); detach first.
    this.socket.ondisconnect = () => undefined;
    this.socket.onmatchdata = () => undefined;
    this.socket.disconnect(false);
  }
}

export interface NakamaBackendOptions {
  readonly config?: NakamaConfig;
  readonly client?: Client;
  /** A shared GuestAuth; it must be built on `client`. The store/platform/uuid/now options then do not apply. */
  readonly auth?: GuestAuth;
  readonly store?: KeyValueStore;
  readonly deviceIdStore?: DeviceIdStore;
  readonly platform?: DevicePlatform;
  readonly uuid?: NewUuid;
  readonly now?: () => number;
}

/** The production OnlineBackend: nakama-js behind the port NakamaGameClient expects. */
export function createNakamaBackend(options: NakamaBackendOptions = {}): OnlineServicesBackend {
  const config = options.config ?? nakamaConfig();
  const client = options.client ?? createNakamaClient(config);
  const auth =
    options.auth ??
    new GuestAuth({
      client,
      store: options.store,
      deviceIdStore: options.deviceIdStore,
      platform: options.platform,
      uuid: options.uuid,
      now: options.now,
    });
  // A WebSocket refused for a bad token looks like any other failed connect (no status code), so
  // after repeated failures drop the stored session: the next attempt refreshes or re-authenticates.
  let connectFailures = 0;

  return {
    async signIn() {
      // The clock offset comes from each snapshot's `serverTime` (NakamaGameClient), not from sign-in.
      await auth.signIn();
    },
    async quickMatch() {
      const { session } = await auth.signIn();
      return quickMatch(client, session);
    },
    async createPrivateTable() {
      let session: Session;
      try {
        ({ session } = await auth.signIn());
      } catch {
        throw new CreatePrivateTableError('network');
      }
      return createPrivateTable(client, session);
    },
    async joinByCode(code: string) {
      let session: Session;
      try {
        ({ session } = await auth.signIn());
      } catch {
        return { ok: false, reason: 'network' };
      }
      return joinByCode(client, session, code);
    },
    async openSocket(handlers: MatchSocketHandlers) {
      const { session } = await auth.signIn();
      const socket = client.createSocket(config.useSSL, false);
      socket.onmatchdata = (data: MatchData) => handlers.onMatchData(data.op_code, data.data);
      socket.ondisconnect = () => handlers.onDisconnect();
      try {
        await socket.connect(session, false);
      } catch (error) {
        socket.ondisconnect = () => undefined;
        socket.disconnect(false);
        connectFailures++;
        if (connectFailures >= 2) {
          connectFailures = 0;
          await auth.signOut();
        }
        throw error;
      }
      connectFailures = 0;
      return new NakamaMatchSocket(socket);
    },
  };
}
