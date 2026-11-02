import {
  DEFAULT_PRESENCE_VISIBILITY,
  INVITE_TTL_MS,
  isRoomCode,
  NOTIFICATION_CODES,
  type PresenceActivity,
  type PresenceVisibility,
  type TableInviteContent,
} from '@chkobba/protocol';
import type { Client, Notification, Presence, Session, Socket, StatusPresenceEvent } from '@heroiclabs/nakama-js';
import { AppState, Platform } from 'react-native';

import { timeoutScheduler, type Scheduler } from '@/game/LocalGameClient';

import { displayNameOf, timeMs, type FriendsBackend, type FriendsSnapshot } from './friends';
import type { GuestAuth, NakamaConfig, SignedIn } from './nakama';
import { decodeAvailability, encodeStatus, type Availability } from './presence';

/**
 * The app-level social socket (ADR-0003): one Nakama socket that owns the
 * player's status, follows mutual friends and receives notifications. It
 * appears online only when the presence setting is Everyone; Nobody connects
 * with the status off, which Nakama enforces for every observer (ADR-0004).
 * The per-game socket in `NakamaGameClient` is separate and always connects
 * with the status off.
 *
 * Connection (resolved question 6):
 * - `start()` at launch connects only when a stored session exists; it never
 *   creates a guest account (`GuestAuth.resume`).
 * - `ensureConnected()` on first Friends or online use may sign in or create
 *   the guest (`GuestAuth.signIn`).
 * - Background disconnects and foreground reconnects. A network drop
 *   reconnects with capped exponential backoff. `stop()` never reconnects.
 *
 * Friend state is the source of truth (technical decision 8): notifications
 * only refresh the friend list (`FriendsBackend.list`) and emit toast events.
 */

// --- Public types ----------------------------------------------------------

export type { Availability } from './presence';

export interface TableInvite {
  /** Notification id; `dismissInvite` deletes it. */
  readonly id: string;
  readonly fromUserId: string;
  readonly fromName: string;
  /** Normalized room code. */
  readonly code: string;
  /** Epoch ms: the server's `create_time`, or the local receive time when that is missing or in the future. */
  readonly sentAt: number;
  /** Older than `INVITE_TTL_MS`; `join_by_code` stays the final liveness check. */
  readonly expired: boolean;
}

export interface SocialState {
  readonly connected: boolean;
  /**
   * Live availability for the followed set: mutual friends plus the temporary
   * directory follows. Friend-facing lists only read entries for their own
   * members, so a temporary follow never appears as a friend.
   */
  readonly availability: { readonly [userId: string]: Availability };
  /** Incoming friend requests, from the friend list. */
  readonly incomingRequests: number;
  /** Oldest first. */
  readonly invites: readonly TableInvite[];
}

/** Toast triggers. Only live notifications emit; the inbox loaded on connect doesn't. */
export type SocialEvent =
  | { readonly type: 'friend_request'; readonly userId: string; readonly displayName: string | null }
  | { readonly type: 'friend_accept'; readonly userId: string; readonly displayName: string | null }
  | { readonly type: 'table_invite'; readonly invite: TableInvite };

/**
 * Where the socket is in its life:
 * - `off`: not wanted (initial, after `stop()`, or `start()` found no stored session).
 * - `connecting`: a session lookup or socket connect is in flight.
 * - `connected`: the socket is up.
 * - `backoff`: a retry is scheduled after a failed connect or a network drop.
 * - `background`: wanted, but the app is in the background; reconnects on foreground.
 */
export type ConnectionPhase = 'off' | 'connecting' | 'connected' | 'backoff' | 'background';

/** The nakama-js socket members used here, so tests can pass a small fake. */
export type SocialSocketPort = Pick<
  Socket,
  | 'connect'
  | 'disconnect'
  | 'followUsers'
  | 'unfollowUsers'
  | 'updateStatus'
  | 'ondisconnect'
  | 'onstatuspresence'
  | 'onnotification'
>;

/** The nakama-js client calls made here. */
export type SocialClient = Pick<Client, 'listNotifications' | 'deleteNotifications'>;

export type SocialAuth = Pick<GuestAuth, 'signIn' | 'resume'>;

export type SocialFriends = Pick<FriendsBackend, 'list'>;

/** Whether the app is in the foreground, and changes to it. */
export interface ForegroundSource {
  isForeground(): boolean;
  /** Returns an unsubscribe function. */
  subscribe(listener: (foreground: boolean) => void): () => void;
}

export interface SocialSocketOptions {
  readonly client: SocialClient;
  /** A new, unconnected socket per connection attempt. */
  readonly createSocket: () => SocialSocketPort;
  readonly auth: SocialAuth;
  readonly friends: SocialFriends;
  /** Local clock in ms. */
  readonly now?: () => number;
  readonly scheduler?: Scheduler;
  readonly foreground?: ForegroundSource;
  /** [0, 1) for backoff jitter. */
  readonly random?: () => number;
  /** Logs without ids or other personal data. */
  readonly log?: (message: string) => void;
}

// --- Constants and pure helpers --------------------------------------------

/** Ids per follow call: 50 UUIDs stay well under Nakama's 4096-byte socket message limit (Task 4.1). */
export const FOLLOW_CHUNK_SIZE = 50;
/**
 * Most directory rows followed at once. A phone-width directory screen shows
 * about 20 rows, so 30 covers a screen and a little scrolling. The cap matters
 * because every followed user delivers presence events for as long as the
 * directory stays open: following an unbounded result set would turn one
 * search into a stream of traffic.
 */
export const TEMPORARY_FOLLOW_LIMIT = 30;
export const RECONNECT_BASE_MS = 1000;
export const RECONNECT_MAX_MS = 30000;
/** Nakama accepts 1–100 per `listNotifications` page. */
export const NOTIFICATION_PAGE_SIZE = 100;
/** Safety stop for inbox paging. */
export const NOTIFICATION_MAX_PAGES = 10;
/** Ids per `deleteNotifications` call (sent as query parameters). */
const DELETE_CHUNK_SIZE = 50;
/** Longest sender name kept from an invite; display names are much shorter. */
const MAX_INVITE_NAME_CHARS = 64;

/** Splits `items` into consecutive chunks of at most `size`. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/**
 * Delay before reconnect number `attempt` (0-based): exponential from
 * RECONNECT_BASE_MS, capped at RECONNECT_MAX_MS, with "equal jitter" (half
 * fixed, half random) so clients don't all return at once after a server restart.
 */
export function backoffDelay(attempt: number, random: () => number): number {
  const exp = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, Math.max(0, attempt)));
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(exp / 2 + (exp / 2) * r);
}

/** A TABLE_INVITE `content`, which may arrive as an object (nakama-js parses it) or as a JSON string; null when malformed. */
export function parseInviteContent(content: unknown): TableInviteContent | null {
  let value = content;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null) return null;
  if (!('v' in value) || value.v !== 1) return null;
  if (!('code' in value) || typeof value.code !== 'string' || !isRoomCode(value.code)) return null;
  if (!('fromName' in value) || typeof value.fromName !== 'string') return null;
  return { v: 1, code: value.code, fromName: value.fromName };
}

/** True when an invite sent at `sentAt` is older than INVITE_TTL_MS at `now`. */
export function isInviteExpired(sentAt: number, now: number): boolean {
  return now - sentAt >= INVITE_TTL_MS;
}

/** A `TableInvite` from a notification, or null when it isn't a well-formed invite. */
export function toTableInvite(notification: Notification, now: number): TableInvite | null {
  if (notification.code !== NOTIFICATION_CODES.TABLE_INVITE) return null;
  const { id, sender_id: fromUserId } = notification;
  if (typeof id !== 'string' || id === '' || typeof fromUserId !== 'string' || fromUserId === '') return null;
  const content = parseInviteContent(notification.content);
  if (content === null) return null;
  const created = timeMs(notification.create_time);
  const sentAt = created > 0 && created <= now ? created : now;
  return {
    id,
    fromUserId,
    fromName: displayNameOf(content.fromName.slice(0, MAX_INVITE_NAME_CHARS), undefined),
    code: content.code,
    sentAt,
    expired: isInviteExpired(sentAt, now),
  };
}

const AVAILABILITY_RANK: { readonly [A in Availability]: number } = { offline: 0, online: 1, room: 2, playing: 3 };

/** The presence status, which nakama-js leaves out of its `Presence` type. */
function presenceStatus(presence: Presence): string | undefined {
  return 'status' in presence && typeof presence.status === 'string' ? presence.status : undefined;
}

interface TrackedPresence {
  readonly userId: string;
  readonly status: string | undefined;
}

/** The app's foreground state: page visibility on web, AppState on iOS and Android. */
export function defaultForegroundSource(): ForegroundSource {
  if (Platform.OS === 'web') {
    const visible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
    return {
      isForeground: visible,
      subscribe(listener) {
        if (typeof document === 'undefined') return () => undefined;
        const onChange = () => listener(visible());
        document.addEventListener('visibilitychange', onChange);
        return () => document.removeEventListener('visibilitychange', onChange);
      },
    };
  }
  return {
    isForeground: () => AppState.currentState !== 'background',
    subscribe(listener) {
      // `inactive` (iOS control centre, app switcher peek) is neither: the socket stays as it is.
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') listener(true);
        else if (state === 'background') listener(false);
      });
      return () => subscription.remove();
    },
  };
}

const defaultLog = (message: string) => console.warn(message);

const EMPTY_STATE: SocialState = { connected: false, availability: {}, incomingRequests: 0, invites: [] };

// --- SocialSocket ----------------------------------------------------------

export class SocialSocket {
  private readonly client: SocialClient;
  private readonly createSocket: () => SocialSocketPort;
  private readonly auth: SocialAuth;
  private readonly friends: SocialFriends;
  private readonly now: () => number;
  private readonly scheduler: Scheduler;
  private readonly foreground: ForegroundSource;
  private readonly random: () => number;
  private readonly log: (message: string) => void;

  private phase: ConnectionPhase = 'off';
  /** Set by `ensureConnected`: connects may sign in or create the guest. `start` alone only resumes. */
  private allowSignUp = false;
  /** Bumped by every connect attempt and teardown; callbacks from an older socket or attempt are ignored. */
  private epoch = 0;
  /** Bumped by `stop()`; async results from before it are dropped. */
  private run = 0;
  private socket: SocialSocketPort | null = null;
  private connecting: Promise<boolean> | null = null;
  private attempt = 0;
  private cancelRetry: (() => void) | null = null;
  private unwatchForeground: (() => void) | null = null;
  private activity: PresenceActivity = 'lobby';
  /** Effective presence choice; the next connect uses it (see `setVisibility`). */
  private visibility: PresenceVisibility = DEFAULT_PRESENCE_VISIBILITY;
  private selfUserId: string | null = null;

  private friendIds: readonly string[] = [];
  private blocked = new Set<string>();
  private names = new Map<string, string>();
  private incomingRequests = 0;
  /** Directory users the UI wants followed for availability; never friendships, replaced wholesale. */
  private temporaryFollowIds: readonly string[] = [];
  /** Users followed on the current socket (mutual friends plus temporary follows actually applied). */
  private followed = new Set<string>();
  /** Serializes follow passes so concurrent UI updates diff against a settled applied set. */
  private syncChain: Promise<void> = Promise.resolve();
  /** Presences by session id (a status change is a leave and a join of the same session). */
  private presences = new Map<string, TrackedPresence>();
  private invites: TableInvite[] = [];
  /** Invites dismissed in this run, so a failed delete doesn't bring them back on reconnect. */
  private dismissed = new Set<string>();
  private cancelExpiry: (() => void) | null = null;
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;

  private state: SocialState = EMPTY_STATE;
  private readonly stateListeners = new Set<(state: SocialState) => void>();
  private readonly eventListeners = new Set<(event: SocialEvent) => void>();

  constructor(options: SocialSocketOptions) {
    this.client = options.client;
    this.createSocket = options.createSocket;
    this.auth = options.auth;
    this.friends = options.friends;
    this.now = options.now ?? Date.now;
    this.scheduler = options.scheduler ?? timeoutScheduler;
    this.foreground = options.foreground ?? defaultForegroundSource();
    this.random = options.random ?? Math.random;
    this.log = options.log ?? defaultLog;
  }

  // --- Public API ----------------------------------------------------------

  getState(): SocialState {
    return this.state;
  }

  getConnectionPhase(): ConnectionPhase {
    return this.phase;
  }

  /** Called with every new state. Returns an unsubscribe function. */
  subscribe(listener: (state: SocialState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Toast events. Returns an unsubscribe function. */
  onEvent(listener: (event: SocialEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * App launch: connects only if a stored session exists, never creating an
   * account. Resolves once that is decided (connected, retrying or off).
   */
  async start(): Promise<void> {
    if (this.phase !== 'off') return;
    this.watchForeground();
    if (!this.foreground.isForeground()) {
      this.phase = 'background';
      return;
    }
    await this.connect();
  }

  /**
   * First Friends or online use: connects, signing in (or creating the guest)
   * if needed. Resolves true once connected, false if this attempt failed (a
   * retry is then scheduled) or the app is in the background.
   */
  ensureConnected(): Promise<boolean> {
    this.allowSignUp = true;
    this.watchForeground();
    switch (this.phase) {
      case 'connected':
        return Promise.resolve(true);
      case 'connecting':
        // A `start()` attempt that finds no session falls back to signing in now that it is allowed.
        return this.connecting ?? Promise.resolve(false);
      case 'background':
        if (!this.foreground.isForeground()) return Promise.resolve(false);
        this.attempt = 0;
        return this.connect();
      case 'backoff':
      case 'off':
        this.attempt = 0;
        return this.connect();
    }
  }

  /** Disconnects for good (e.g. sign-out) and clears the state. Only `start`/`ensureConnected` connect again. */
  stop(): void {
    this.run++;
    this.allowSignUp = false;
    this.teardown('off');
    this.stopWatchingForeground();
    this.cancelExpiry?.();
    this.cancelExpiry = null;
    this.friendIds = [];
    this.temporaryFollowIds = [];
    this.blocked = new Set();
    this.names = new Map();
    this.incomingRequests = 0;
    this.invites = [];
    this.dismissed = new Set();
    this.refreshAgain = false;
    this.attempt = 0;
    this.publish();
  }

  /** Sets the public status (activity only, never a code: ADR-0003). Re-sent after each reconnect. */
  setActivity(activity: PresenceActivity): void {
    if (activity === this.activity) return;
    this.activity = activity;
    if (this.phase === 'connected') void this.sendStatus(this.epoch);
  }

  /**
   * Applies the saved presence choice (ADR-0004). Everyone connects with the
   * status on; Nobody connects appear-offline, so Nakama hides the player from
   * everyone, friends included. A live or retrying socket reconnects through
   * the normal path: the old socket is closed before the new attempt, so a
   * failed reconnect leaves the player offline and the existing backoff retries
   * with this choice. A socket that isn't up yet simply remembers it.
   */
  async setVisibility(visibility: PresenceVisibility): Promise<void> {
    if (visibility === this.visibility) return;
    this.visibility = visibility;
    if (this.phase === 'off' || this.phase === 'background') return;
    this.attempt = 0;
    const connecting = this.connect();
    // The old socket is already closed: publish the gap instead of stale availability.
    this.publish();
    try {
      await connecting;
    } catch {
      // `connect` only rejects for an unexpected fault; the socket is closed, so stay offline for the retry.
      this.scheduleReconnect();
    }
  }

  /**
   * Reloads the friend list, then follows added mutual friends and unfollows
   * removed ones. Call after any friend action. Never rejects.
   */
  refreshFriends(): Promise<void> {
    if (this.phase === 'off') return Promise.resolve();
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    const refreshing = this.runRefresh().finally(() => {
      this.refreshing = null;
      if (this.refreshAgain) {
        this.refreshAgain = false;
        void this.refreshFriends();
      }
    });
    this.refreshing = refreshing;
    return refreshing;
  }

  /**
   * Replaces the set of directory users the UI wants followed for live
   * availability. These follows are presentation-only: they are capped, never
   * added to friend state, and overwrite the previous temporary set. The socket
   * keeps following mutual friends regardless, and applies only the difference
   * from what it already follows, so this can never drop a real follow. Never
   * rejects.
   */
  setTemporaryFollows(userIds: readonly string[]): Promise<void> {
    const wanted: string[] = [];
    const seen = new Set<string>();
    for (const id of userIds) {
      // Skip blanks and the player's own id; dedupe before the cap so a repeated id doesn't use a slot.
      if (id === '' || id === this.selfUserId || seen.has(id)) continue;
      seen.add(id);
      if (wanted.length === TEMPORARY_FOLLOW_LIMIT) break;
      wanted.push(id);
    }
    this.temporaryFollowIds = wanted;
    return this.syncFollows();
  }

  /**
   * The directory closed: unfollows the temporary ids that aren't mutual
   * friends (real friends stay followed) and drops their availability. Never
   * rejects.
   */
  clearTemporaryFollows(): Promise<void> {
    this.temporaryFollowIds = [];
    return this.syncFollows();
  }

  /** Hides an invite (joined or dismissed) and deletes its notification. Never rejects. */
  async dismissInvite(id: string): Promise<void> {
    this.dismissed.add(id);
    const before = this.invites.length;
    this.invites = this.invites.filter((invite) => invite.id !== id);
    if (this.invites.length !== before) {
      this.scheduleExpiry();
      this.publish();
    }
    await this.deleteNotifications([id]);
  }

  // --- Connection ----------------------------------------------------------

  private connect(): Promise<boolean> {
    this.cancelRetryTimer();
    this.closeSocket();
    const epoch = ++this.epoch;
    this.phase = 'connecting';
    const connecting = this.attemptConnect(epoch).finally(() => {
      if (this.connecting === connecting) this.connecting = null;
    });
    this.connecting = connecting;
    return connecting;
  }

  private async sessionForConnect(): Promise<SignedIn | null> {
    const resumed = await this.auth.resume();
    if (resumed !== null || !this.allowSignUp) return resumed;
    return this.auth.signIn();
  }

  private async attemptConnect(epoch: number): Promise<boolean> {
    let signedIn: SignedIn | null;
    try {
      signedIn = await this.sessionForConnect();
    } catch {
      if (epoch === this.epoch) this.scheduleReconnect();
      return false;
    }
    if (epoch !== this.epoch) return false;
    if (signedIn === null && this.allowSignUp) {
      // `ensureConnected` arrived while a resume-only attempt was in flight.
      return this.attemptConnect(epoch);
    }
    if (signedIn === null) {
      // No stored session at launch: stay off until the first online use.
      this.phase = 'off';
      this.stopWatchingForeground();
      return false;
    }
    const socket = this.createSocket();
    socket.ondisconnect = () => this.handleDisconnect(epoch);
    socket.onstatuspresence = (event) => {
      if (epoch === this.epoch) this.applyPresenceEvent(event);
    };
    socket.onnotification = (notification) => {
      if (epoch === this.epoch) this.handleNotifications([notification], true);
    };
    this.socket = socket;
    // Nobody: status off, so Nakama publishes no presence for this session to anyone.
    try {
      await socket.connect(signedIn.session, this.visibility === 'everyone');
    } catch {
      if (epoch !== this.epoch) return false;
      this.closeSocket();
      this.scheduleReconnect();
      return false;
    }
    // A teardown during the connect already closed this socket.
    if (epoch !== this.epoch) return false;
    this.phase = 'connected';
    this.attempt = 0;
    this.selfUserId = signedIn.session.user_id ?? null;
    this.publish();
    void this.afterConnect(epoch, signedIn.session);
    return true;
  }

  /** Status first (it decides how followers see us), then follows, then the inbox (it needs the blocked list). */
  private async afterConnect(epoch: number, session: Session): Promise<void> {
    await this.sendStatus(epoch);
    if (epoch !== this.epoch) return;
    await this.refreshFriends();
    if (epoch !== this.epoch) return;
    await this.loadNotifications(epoch, session);
  }

  private handleDisconnect(epoch: number): void {
    // Connect failures also close the socket; `attemptConnect` handles those.
    if (epoch !== this.epoch || this.phase !== 'connected') return;
    this.epoch++;
    this.detach(this.socket);
    this.socket = null;
    this.resetSocketState();
    if (this.foreground.isForeground()) this.scheduleReconnect();
    else this.phase = 'background';
    this.publish();
  }

  private scheduleReconnect(): void {
    this.cancelRetryTimer();
    const delay = backoffDelay(this.attempt, this.random);
    this.attempt++;
    this.phase = 'backoff';
    this.cancelRetry = this.scheduler(() => {
      this.cancelRetry = null;
      if (this.phase === 'backoff') void this.connect();
    }, delay);
  }

  private cancelRetryTimer(): void {
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  /** Closes any socket, drops what belonged to it and moves to `next`. */
  private teardown(next: ConnectionPhase): void {
    this.epoch++;
    this.cancelRetryTimer();
    this.closeSocket();
    this.connecting = null;
    this.resetSocketState();
    this.phase = next;
  }

  private resetSocketState(): void {
    this.followed = new Set();
    this.presences = new Map();
  }

  private detach(socket: SocialSocketPort | null): void {
    if (!socket) return;
    socket.ondisconnect = () => undefined;
    socket.onstatuspresence = () => undefined;
    socket.onnotification = () => undefined;
  }

  private closeSocket(): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    // nakama-js calls ondisconnect on close even with disconnect(false); detach first.
    this.detach(socket);
    try {
      socket.disconnect(false);
    } catch {
      // Already closed.
    }
  }

  private watchForeground(): void {
    if (this.unwatchForeground) return;
    this.unwatchForeground = this.foreground.subscribe((foreground) => this.handleForeground(foreground));
  }

  private stopWatchingForeground(): void {
    this.unwatchForeground?.();
    this.unwatchForeground = null;
  }

  private handleForeground(foreground: boolean): void {
    if (foreground) {
      if (this.phase !== 'background') return;
      this.attempt = 0;
      void this.connect();
      return;
    }
    if (this.phase === 'off' || this.phase === 'background') return;
    this.teardown('background');
    this.publish();
  }

  private async sendStatus(epoch: number): Promise<void> {
    // An appear-offline socket has no status to publish; only Everyone's status is public.
    if (this.visibility !== 'everyone') return;
    const socket = this.socket;
    if (!socket || epoch !== this.epoch) return;
    try {
      await socket.updateStatus(encodeStatus(this.activity));
    } catch {
      // The socket is going down; the reconnect sends it again.
    }
  }

  // --- Friends and presence ------------------------------------------------

  private async runRefresh(): Promise<void> {
    const run = this.run;
    let snapshot: FriendsSnapshot;
    try {
      snapshot = await this.friends.list();
    } catch {
      return;
    }
    if (run !== this.run) return;
    this.applySnapshot(snapshot);
    await this.syncFollows();
  }

  private applySnapshot(snapshot: FriendsSnapshot): void {
    this.friendIds = snapshot.friends.map((friend) => friend.userId);
    this.blocked = new Set(snapshot.blocked.map((entry) => entry.userId));
    this.incomingRequests = snapshot.incoming.length;
    const names = new Map<string, string>();
    for (const entry of [...snapshot.friends, ...snapshot.incoming, ...snapshot.outgoing]) {
      names.set(entry.userId, entry.displayName);
    }
    this.names = names;
    // Hide invites from users blocked since they arrived.
    const fromBlocked = this.invites.filter((invite) => this.blocked.has(invite.fromUserId));
    if (fromBlocked.length > 0) {
      this.invites = this.invites.filter((invite) => !this.blocked.has(invite.fromUserId));
      this.scheduleExpiry();
      void this.deleteNotifications(fromBlocked.map((invite) => invite.id));
    }
    this.publish();
  }

  /**
   * Mutual friends plus the temporary directory follows, deduplicated. This is
   * the only set that may be followed or shown as available.
   */
  private desiredFollows(): Set<string> {
    const wanted = new Set(this.friendIds);
    for (const id of this.temporaryFollowIds) wanted.add(id);
    // The id can be unknown when the directory sets follows before connecting; drop it once it is.
    if (this.selfUserId !== null) wanted.delete(this.selfUserId);
    return wanted;
  }

  /**
   * Queues a follow pass. Passes are serialized so two quick UI updates cannot
   * interleave their deltas against a half-applied `followed`; a pass with
   * nothing to change issues no call. Never rejects.
   */
  private syncFollows(): Promise<void> {
    const next = this.syncChain.then(() => this.runSyncFollows());
    // `runSyncFollows` catches its own network faults; this keeps a surprise fault from stalling the chain.
    this.syncChain = next.catch(() => undefined);
    return this.syncChain;
  }

  /** Applies only the delta between the desired set and what the current socket already follows. */
  private async runSyncFollows(): Promise<void> {
    const socket = this.socket;
    const epoch = this.epoch;
    if (this.phase !== 'connected' || !socket) return;
    const wanted = this.desiredFollows();
    const toUnfollow = [...this.followed].filter((id) => !wanted.has(id));
    const toFollow = [...wanted].filter((id) => !this.followed.has(id));
    if (toUnfollow.length === 0 && toFollow.length === 0) return;
    try {
      for (const ids of chunk(toUnfollow, FOLLOW_CHUNK_SIZE)) {
        await socket.unfollowUsers(ids);
        if (epoch !== this.epoch) return;
        for (const id of ids) this.followed.delete(id);
        for (const [sessionId, presence] of this.presences) {
          if (!wanted.has(presence.userId)) this.presences.delete(sessionId);
        }
        this.publish();
      }
      for (const ids of chunk(toFollow, FOLLOW_CHUNK_SIZE)) {
        const status = await socket.followUsers(ids);
        if (epoch !== this.epoch) return;
        for (const id of ids) this.followed.add(id);
        // Online users only; `presences` is undefined when none are.
        this.trackJoins(status.presences ?? []);
        this.publish();
      }
    } catch {
      // Best effort: leave `followed` as it is so the next pass retries exactly the delta that failed.
    }
  }

  private applyPresenceEvent(event: StatusPresenceEvent): void {
    // Leaves first: a status change is the old status in `leaves` and the new one in `joins`.
    for (const presence of event.leaves ?? []) {
      if (typeof presence.session_id === 'string') this.presences.delete(presence.session_id);
    }
    this.trackJoins(event.joins ?? []);
    this.publish();
  }

  private trackJoins(joins: readonly Presence[]): void {
    for (const presence of joins) {
      const { user_id: userId, session_id: sessionId } = presence;
      if (typeof userId !== 'string' || typeof sessionId !== 'string' || sessionId === '') continue;
      // Every socket hears about the user's own sessions; only followed users count (friends or temporary).
      if (userId === this.selfUserId || !this.followed.has(userId)) continue;
      this.presences.set(sessionId, { userId, status: presenceStatus(presence) });
    }
  }

  private availability(): { [userId: string]: Availability } {
    const result: { [userId: string]: Availability } = {};
    if (this.phase !== 'connected') return result;
    // The desired set, not `followed`: clearing temporary follows drops their
    // entries at once even if the unfollow call has yet to succeed. The friend
    // UI only looks up its own members, so these ids stay out of friend lists.
    for (const userId of this.desiredFollows()) result[userId] = 'offline';
    for (const presence of this.presences.values()) {
      const current = result[presence.userId];
      if (current === undefined) continue;
      const next = decodeAvailability({ status: presence.status });
      // Several devices: show the busiest.
      if (AVAILABILITY_RANK[next] > AVAILABILITY_RANK[current]) result[presence.userId] = next;
    }
    return result;
  }

  // --- Notifications -------------------------------------------------------

  private async loadNotifications(epoch: number, session: Session): Promise<void> {
    const loaded: Notification[] = [];
    let cursor: string | undefined;
    try {
      for (let page = 0; page < NOTIFICATION_MAX_PAGES; page++) {
        const list = await this.client.listNotifications(session, NOTIFICATION_PAGE_SIZE, cursor);
        if (epoch !== this.epoch) return;
        const notifications = list.notifications ?? [];
        loaded.push(...notifications);
        const next = list.cacheable_cursor || undefined;
        if (notifications.length < NOTIFICATION_PAGE_SIZE || !next || next === cursor) break;
        cursor = next;
      }
    } catch {
      if (epoch !== this.epoch) return;
      this.log('SocialSocket: could not load notifications');
    }
    this.handleNotifications(loaded, false);
  }

  /**
   * Friend requests and accepts are deleted once seen and only refresh the
   * list (a stale request from a since-blocked sender is deleted silently).
   * Invites stay until joined or dismissed. Unknown codes are left alone.
   */
  private handleNotifications(notifications: readonly Notification[], live: boolean): void {
    const now = this.now();
    const toDelete: string[] = [];
    const friendEvents: { type: 'friend_request' | 'friend_accept'; userId: string }[] = [];
    const inviteEvents: TableInvite[] = [];
    let refresh = false;
    let invitesChanged = false;
    for (const notification of notifications) {
      const { id, sender_id: senderId } = notification;
      if (typeof id !== 'string' || id === '') continue;
      const sender = typeof senderId === 'string' && senderId !== '' ? senderId : null;
      switch (notification.code) {
        case NOTIFICATION_CODES.FRIEND_REQUEST:
        case NOTIFICATION_CODES.FRIEND_ACCEPT: {
          toDelete.push(id);
          if (sender !== null && this.blocked.has(sender)) break;
          refresh = true;
          if (live && sender !== null) {
            const type = notification.code === NOTIFICATION_CODES.FRIEND_REQUEST ? 'friend_request' : 'friend_accept';
            friendEvents.push({ type, userId: sender });
          }
          break;
        }
        case NOTIFICATION_CODES.TABLE_INVITE: {
          const invite = toTableInvite(notification, now);
          if (invite === null || this.blocked.has(invite.fromUserId) || invite.fromUserId === this.selfUserId) {
            toDelete.push(id);
            break;
          }
          if (this.dismissed.has(id)) {
            toDelete.push(id);
            break;
          }
          if (this.invites.some((existing) => existing.id === id)) break;
          this.invites = [...this.invites, invite].sort((a, b) => a.sentAt - b.sentAt);
          invitesChanged = true;
          refresh = true;
          if (live && !invite.expired) inviteEvents.push(invite);
          break;
        }
        default:
          break;
      }
    }
    if (toDelete.length > 0) void this.deleteNotifications(toDelete);
    if (invitesChanged) {
      this.scheduleExpiry();
      this.publish();
    }
    for (const invite of inviteEvents) this.emit({ type: 'table_invite', invite });
    if (!refresh) return;
    const run = this.run;
    void this.refreshFriends().then(() => {
      if (run !== this.run) return;
      for (const event of friendEvents) {
        this.emit({ ...event, displayName: this.names.get(event.userId) ?? null });
      }
    });
  }

  private async deleteNotifications(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const signedIn = await this.auth.resume();
      if (signedIn === null) return;
      for (const part of chunk(ids, DELETE_CHUNK_SIZE)) {
        await this.client.deleteNotifications(signedIn.session, part);
      }
    } catch {
      this.log('SocialSocket: could not delete notifications');
    }
  }

  /** Re-flags invites as they pass INVITE_TTL_MS, one timer for the next to expire. */
  private scheduleExpiry(): void {
    this.cancelExpiry?.();
    this.cancelExpiry = null;
    const now = this.now();
    let next = Infinity;
    for (const invite of this.invites) {
      if (!invite.expired) next = Math.min(next, invite.sentAt + INVITE_TTL_MS);
    }
    if (next === Infinity) return;
    this.cancelExpiry = this.scheduler(() => {
      this.cancelExpiry = null;
      const at = this.now();
      this.invites = this.invites.map((invite) =>
        !invite.expired && isInviteExpired(invite.sentAt, at) ? { ...invite, expired: true } : invite,
      );
      this.scheduleExpiry();
      this.publish();
    }, Math.max(0, next - now));
  }

  // --- State ---------------------------------------------------------------

  private publish(): void {
    this.state = {
      connected: this.phase === 'connected',
      availability: this.availability(),
      incomingRequests: this.incomingRequests,
      invites: this.invites,
    };
    for (const listener of [...this.stateListeners]) listener(this.state);
  }

  private emit(event: SocialEvent): void {
    for (const listener of [...this.eventListeners]) listener(event);
  }
}

export interface NakamaSocialSocketOptions {
  readonly client: Client;
  readonly config: NakamaConfig;
  readonly auth: SocialAuth;
  readonly friends: SocialFriends;
}

/** The production social socket on the app's shared client and GuestAuth (wired up in services.ts). */
export function createSocialSocket(options: NakamaSocialSocketOptions): SocialSocket {
  return new SocialSocket({
    client: options.client,
    createSocket: () => options.client.createSocket(options.config.useSSL, false),
    auth: options.auth,
    friends: options.friends,
  });
}
