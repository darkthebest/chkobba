import { isRoomCode, ROOM_JOIN_CODE_KEY, type EmoteId } from '@chkobba/protocol';
import { DEFAULT_RULES, type CardId, type PlayerView, type Seat } from '@chkobba/rules';

import type {
  ConnectionState,
  EmoteEvent,
  GameClient,
  GameSnapshot,
  LogEntry,
  OnlineError,
  OnlineInfo,
  OnlineTablePhase,
  RoomState,
  SeatInfo,
} from '@/game/GameClient';
import { timeoutScheduler, type Scheduler } from '@/game/LocalGameClient';

import {
  decodeEmoteShown,
  decodeError,
  decodeSnapshot,
  OpCode,
  STANDING_SEAT,
  type CutIntent,
  type EmoteIntent,
  type IntentOpCode,
  type PlayIntent,
  type RoomInfo,
  type SitIntent,
  type Snapshot,
} from './protocol';

/*
 * Ports: what NakamaGameClient needs from the network. `createNakamaBackend`
 * (nakama.ts) adapts nakama-js to them; tests pass a fake.
 */

export type JoinResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'table_full' | 'not_found' | 'room_not_found' | 'room_full' }
  | { readonly ok: false; readonly reason: 'rejected'; readonly detail: string };

/** Join metadata a private table checks (`{ [ROOM_JOIN_CODE_KEY]: code }`). */
export type JoinMetadata = { readonly [key: string]: string };

export interface MatchSocketHandlers {
  onMatchData(opCode: number, data: Uint8Array | string): void;
  /** The connection dropped (never called after `close()`). */
  onDisconnect(): void;
}

/** A connected realtime socket. Transport failures reject; a refused join resolves with `ok: false`. */
export interface MatchSocket {
  /** `metadata` is only sent for private tables; quick-match joins pass none. */
  joinMatch(matchId: string, metadata?: JoinMetadata): Promise<JoinResult>;
  leaveMatch(matchId: string): Promise<void>;
  send(matchId: string, opCode: IntentOpCode, data: string): Promise<void>;
  /** Closes without calling `onDisconnect`. Idempotent. */
  close(): void;
}

export interface OnlineBackend {
  /** Ensures a valid session: restore, refresh or (re)authenticate. */
  signIn(): Promise<void>;
  /** Finds or creates an open table; resolves with its match id. */
  quickMatch(): Promise<string>;
  /** Opens a socket with the current session. */
  openSocket(handlers: MatchSocketHandlers): Promise<MatchSocket>;
}

/** `join_by_code` outcome; anything unexpected (offline, 401, malformed reply) is `network`. */
export type JoinByCodeResult =
  | { readonly ok: true; readonly matchId: string }
  | { readonly ok: false; readonly reason: 'not_found' | 'bad_code' | 'rate_limited' | 'network' };

/**
 * Private-table RPCs, for the screens that start a private session. Kept apart
 * from `OnlineBackend`, which is all NakamaGameClient needs; the app's shared
 * backend (`getOnlineBackend`) implements both.
 */
export interface PrivateTableBackend {
  /**
   * Creates a private table; resolves with its match id and normalized code.
   * Rejects with a `CreatePrivateTableError` (`reason` 'rate_limited' or 'network').
   */
  createPrivateTable(): Promise<{ readonly matchId: string; readonly code: string }>;
  /** Resolves a typed or pasted code (normalized here) to a match id. Never rejects. */
  joinByCode(code: string): Promise<JoinByCodeResult>;
}

/** The app's online backend: the game client's port plus the private-table RPCs. */
export type OnlineServicesBackend = OnlineBackend & PrivateTableBackend;

export interface NakamaGameClientOptions {
  /** The table to join (from the quick_match RPC, or a private table's create/join_by_code RPC). */
  readonly matchId: string;
  /**
   * Set for a private table: its normalized room code. It is sent as join
   * metadata on every join (reconnects included), and a full table is a fatal
   * `room_full` instead of a fresh quick_match lookup. Must pass `isRoomCode`.
   */
  readonly privateCode?: string;
  readonly backend: OnlineBackend;
  /** Local clock in ms. */
  readonly now?: () => number;
  readonly scheduler?: Scheduler;
  /** In [0, 1); jitters reconnect delays. */
  readonly random?: () => number;
  /** First reconnect delay; doubles per attempt up to `maxReconnectDelayMs`. */
  readonly reconnectBaseMs?: number;
  readonly maxReconnectDelayMs?: number;
  /** Fresh quick_match lookups when the table filled up before our first join. */
  readonly maxQuickMatchRetries?: number;
}

const SEAT_COUNT = 4;
/** Same window as LocalGameClient: the UI only needs recent events. */
const LOG_LIMIT = 20;
/** Clock-offset samples kept (one per snapshot); old ones age out so a device clock change is picked up. */
const CLOCK_SAMPLE_LIMIT = 16;

/**
 * Stands in for `GameSnapshot.view` until the server sends a real one
 * (`online.started` is false meanwhile). It is a `cutting` view with no cut,
 * so the table logic sees nobody's turn and no round summary.
 */
const WAITING_VIEW: PlayerView = {
  seat: 0,
  playerCount: 4,
  rules: DEFAULT_RULES,
  phase: 'cutting',
  round: 0,
  deal: 0,
  dealer: 0,
  turn: 0,
  hand: [],
  handCounts: [0, 0, 0, 0],
  table: [],
  stockCount: 0,
  cut: null,
  pileCounts: [0, 0],
  piles: [[], []],
  lastCapturer: null,
  chkobbas: [0, 0],
  scores: [0, 0],
  lastRound: null,
  winner: null,
  legalMoves: [],
};

type RunState = 'idle' | 'running' | 'stopped';

/** A refused join → the fatal `OnlineError` code the UI shows. */
function joinErrorCode(reason: Exclude<JoinResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'not_found':
      return 'match_ended';
    case 'table_full':
    case 'room_not_found':
    case 'room_full':
      return reason;
    case 'rejected':
      return 'join_failed';
  }
}

/**
 * Online game against the authoritative Nakama table. The server owns the
 * game: this client only sends intents and mirrors the snapshots it receives
 * into the same `GameSnapshot` shape LocalGameClient produces, so the table UI
 * works unchanged.
 *
 * Every async flow carries the `generation` it started in; `stop()` and each
 * reconnect bump it, so late callbacks from an old socket are ignored.
 *
 * Private tables (`privateCode` set) play several games on one client: each
 * return to the room clears the view and the log and bumps `online.gameKey`.
 */
export class NakamaGameClient implements GameClient {
  private matchIdValue: string;
  /** Normalized room code of a private table; null for quick match. */
  private readonly privateCode: string | null;
  private readonly backend: OnlineBackend;
  private readonly now: () => number;
  private readonly scheduler: Scheduler;
  private readonly random: () => number;
  private readonly reconnectBaseMs: number;
  private readonly maxReconnectDelayMs: number;
  private readonly maxQuickMatchRetries: number;
  private readonly listeners = new Set<() => void>();
  private readonly emoteListeners = new Set<(event: EmoteEvent) => void>();

  private runState: RunState = 'idle';
  private generation = 0;
  private socket: MatchSocket | null = null;
  private cancelRetry: (() => void) | null = null;
  private reconnectAttempts = 0;
  private quickMatchRetries = 0;
  private joinedOnce = false;
  /** Server clock minus local clock, ms (see `sampleClock`). */
  private clockOffsetMs = 0;
  /** Recent `serverTime - receivedAt` samples, newest last. */
  private clockSamples: number[] = [];
  private errorId = 0;

  private seatValue: Seat = 0;
  /** True while we are a standing member of a private table (snapshot seat -1). */
  private standing = false;
  private room: RoomInfo | null = null;
  private gameKey = 0;
  private view: PlayerView = WAITING_VIEW;
  private started = false;
  private players: readonly SeatInfo[] = [];
  private log: readonly LogEntry[] = [];
  private lastSeq = 0;
  private tablePhase: OnlineTablePhase = 'waiting';
  private phaseSince: number;
  private seatsFilled = 0;
  private serverTurnDeadline: number | null = null;
  private serverBackfillAt: number | null = null;
  private serverNextRoundAt: number | null = null;
  private connection: ConnectionState = 'connecting';
  private lastError: OnlineError | null = null;
  private snapshot: GameSnapshot;

  constructor(options: NakamaGameClientOptions) {
    if (options.privateCode !== undefined && !isRoomCode(options.privateCode)) {
      throw new RangeError('NakamaGameClient: privateCode must be a normalized room code');
    }
    this.matchIdValue = options.matchId;
    this.privateCode = options.privateCode ?? null;
    this.backend = options.backend;
    this.now = options.now ?? Date.now;
    this.scheduler = options.scheduler ?? timeoutScheduler;
    this.random = options.random ?? Math.random;
    this.reconnectBaseMs = options.reconnectBaseMs ?? 500;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs ?? 10000;
    this.maxQuickMatchRetries = options.maxQuickMatchRetries ?? 3;
    this.phaseSince = this.now();
    this.snapshot = this.buildSnapshot();
  }

  /**
   * Our seat, as assigned by the server (0 until the first snapshot). While
   * standing at a private table it keeps the last seat held; use
   * `online.room.mySeat` there.
   */
  get seat(): Seat {
    return this.seatValue;
  }

  /** The table we are (re)joining; changes when a full table sent us to another one. */
  get matchId(): string {
    return this.matchIdValue;
  }

  getSnapshot = (): GameSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): void {
    if (this.runState === 'running') return;
    this.runState = 'running';
    this.reconnectAttempts = 0;
    void this.connect(++this.generation);
  }

  stop(): void {
    if (this.runState !== 'running') return;
    this.runState = 'stopped';
    this.generation++;
    this.cancelRetry?.();
    this.cancelRetry = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      const matchId = this.matchIdValue;
      socket
        .leaveMatch(matchId)
        .catch(() => undefined)
        .then(() => socket.close());
    }
  }

  async play(cardId: CardId, capture: readonly CardId[]): Promise<void> {
    const intent: PlayIntent = { cardId, capture: [...capture] };
    await this.sendIntent(OpCode.PLAY, JSON.stringify(intent));
  }

  async cut(keep: boolean): Promise<void> {
    const intent: CutIntent = { keep };
    await this.sendIntent(OpCode.CUT, JSON.stringify(intent));
  }

  /** Online the server starts the next round by itself (about 8 s after the summary). */
  async nextRound(): Promise<void> {}

  /** "I'm here": clears our away status. Sent automatically before a play or cut while away. */
  async back(): Promise<void> {
    await this.send(OpCode.BACK, '');
  }

  /** Fire and forget: offline or a failed send just means nobody sees it. */
  emote(id: EmoteId): void {
    const intent: EmoteIntent = { id };
    this.send(OpCode.EMOTE, JSON.stringify(intent)).catch(() => undefined);
  }

  subscribeEmotes = (listener: (event: EmoteEvent) => void): (() => void) => {
    this.emoteListeners.add(listener);
    return () => {
      this.emoteListeners.delete(listener);
    };
  };

  /** Private tables: sit, switch seats (waiting) or take over a bot seat (standing, in game). */
  async sit(seat: Seat): Promise<void> {
    if (!Number.isInteger(seat) || seat < 0 || seat >= SEAT_COUNT) throw new RangeError('sit: no such seat');
    const intent: SitIntent = { seat };
    await this.send(OpCode.SIT, JSON.stringify(intent));
  }

  /** Private tables, host only: bots fill the empty seats and the game starts. */
  async startGame(): Promise<void> {
    await this.send(OpCode.START, '');
  }

  private async sendIntent(opCode: typeof OpCode.PLAY | typeof OpCode.CUT, data: string): Promise<void> {
    if (!this.standing && this.players[this.seatValue]?.away === true) await this.back();
    await this.send(opCode, data);
  }

  private async send(opCode: IntentOpCode, data: string): Promise<void> {
    const socket = this.socket;
    if (!socket || this.connection !== 'online') throw new Error('offline');
    await socket.send(this.matchIdValue, opCode, data);
  }

  private isCurrent(generation: number): boolean {
    return this.runState === 'running' && generation === this.generation;
  }

  /** Sign in, open a socket, join the table. Transport failures schedule a retry; refusals are reported. */
  private async connect(generation: number): Promise<void> {
    this.setConnection(this.joinedOnce ? 'reconnecting' : 'connecting');
    let socket: MatchSocket | null = null;
    try {
      await this.backend.signIn();
      if (!this.isCurrent(generation)) return;

      socket = await this.backend.openSocket({
        onMatchData: (opCode, data) => this.handleMatchData(generation, opCode, data),
        onDisconnect: () => this.handleDisconnect(generation),
      });
      if (!this.isCurrent(generation)) {
        socket.close();
        return;
      }
      this.socket = socket;

      for (;;) {
        // A private table admits a newcomer only with its code; send it on every join, reconnects included.
        const result =
          this.privateCode === null
            ? await socket.joinMatch(this.matchIdValue)
            : await socket.joinMatch(this.matchIdValue, { [ROOM_JOIN_CODE_KEY]: this.privateCode });
        if (!this.isCurrent(generation)) return;
        if (result.ok) break;
        // Quick match can hand out a table that filled meanwhile (its label lags): ask for another one.
        // Never for a private table: it is the table we were invited to (full rooms fail with room_full).
        if (
          result.reason === 'table_full' &&
          this.privateCode === null &&
          !this.joinedOnce &&
          this.quickMatchRetries < this.maxQuickMatchRetries
        ) {
          this.quickMatchRetries++;
          this.matchIdValue = await this.backend.quickMatch();
          if (!this.isCurrent(generation)) return;
          continue;
        }
        this.fail(joinErrorCode(result.reason));
        return;
      }

      this.joinedOnce = true;
      this.reconnectAttempts = 0;
      this.setConnection('online');
    } catch {
      if (!this.isCurrent(generation)) return;
      if (socket && this.socket === socket) this.socket = null;
      socket?.close();
      this.scheduleReconnect();
    }
  }

  /** Gives up on this table: closes the socket and reports a fatal error. */
  private fail(code: string): void {
    this.generation++;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.reportError(code, true);
  }

  private handleDisconnect(generation: number): void {
    if (!this.isCurrent(generation) || this.socket === null) return;
    this.socket = null;
    this.generation++;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.setConnection(this.joinedOnce ? 'reconnecting' : 'connecting');
    this.cancelRetry?.();
    const exponential = this.reconnectBaseMs * 2 ** Math.min(this.reconnectAttempts, 16);
    const capped = Math.min(this.maxReconnectDelayMs, exponential);
    // Up to 20% jitter so a server restart does not get every client back at the same instant.
    const delay = Math.round(capped * (0.8 + 0.2 * this.random()));
    this.reconnectAttempts++;
    const generation = ++this.generation;
    this.cancelRetry = this.scheduler(() => {
      this.cancelRetry = null;
      if (this.isCurrent(generation)) void this.connect(generation);
    }, delay);
  }

  private handleMatchData(generation: number, opCode: number, data: Uint8Array | string): void {
    if (!this.isCurrent(generation)) return;
    if (opCode === OpCode.SNAPSHOT) {
      const snapshot = decodeSnapshot(data);
      if (snapshot) this.applySnapshot(snapshot);
    } else if (opCode === OpCode.ERROR) {
      const error = decodeError(data);
      if (error) this.reportError(error.code, false);
    } else if (opCode === OpCode.EMOTE_SHOWN) {
      const shown = decodeEmoteShown(data);
      // The server echoes ours too; the UI already showed it when we sent it.
      if (shown && (this.standing || shown.seat !== this.seatValue)) {
        for (const listener of this.emoteListeners) listener({ seat: shown.seat, id: shown.id });
      }
    }
  }

  private applySnapshot(snapshot: Snapshot): void {
    this.sampleClock(snapshot.serverTime);
    const room = snapshot.room ?? null;
    // A private table back in its room after a game: start over for the next one.
    if (room !== null && snapshot.phase === 'waiting' && this.tablePhase !== 'waiting') this.resetForNextGame();
    this.room = room;
    this.standing = snapshot.seat === STANDING_SEAT;
    if (!this.standing) this.seatValue = snapshot.seat;
    // The log is a delta, except after a (re)join where it restarts at seq 1: keep only what is new.
    // Seqs keep growing across a private table's games, so this filter also holds after a reset.
    const fresh = snapshot.log.filter((entry) => entry.seq > this.lastSeq);
    if (fresh.length > 0) {
      this.log = this.log.concat(fresh).slice(-LOG_LIMIT);
      this.lastSeq = fresh[fresh.length - 1]?.seq ?? this.lastSeq;
    }
    if (snapshot.view) {
      this.view = snapshot.view;
      this.started = true;
    } else if (room !== null) {
      // Private: no view means waiting or standing; never keep the last game's (or seat's) view.
      this.view = WAITING_VIEW;
      this.started = false;
    }
    this.players = snapshot.players.map(
      (info, seat): SeatInfo =>
        info === null
          ? { seat, name: '', isBot: false, away: false, connected: false }
          : {
              seat,
              name: info.name,
              isBot: info.isBot,
              away: info.away,
              connected: info.connected,
              ...(info.userId === undefined ? {} : { userId: info.userId }),
            },
    );
    this.seatsFilled = snapshot.players.filter((info) => info !== null).length;
    if (snapshot.phase !== this.tablePhase) {
      this.tablePhase = snapshot.phase;
      this.phaseSince = this.now();
    }
    this.serverTurnDeadline = snapshot.turnDeadline;
    this.serverBackfillAt = snapshot.backfillAt;
    this.serverNextRoundAt = snapshot.nextRoundAt;
    this.publish();
  }

  /** Clears the finished game so the next one starts from a clean table (and a new `gameKey`). */
  private resetForNextGame(): void {
    this.started = false;
    this.view = WAITING_VIEW;
    this.log = [];
    this.gameKey++;
  }

  /** The room for `OnlineInfo`, with the reset time on the local clock. */
  private roomState(room: RoomInfo): RoomState {
    return {
      code: room.code,
      members: room.members.map((member) => ({
        name: member.name,
        seat: member.seat,
        isHost: member.isHost,
        ...(member.userId === undefined ? {} : { userId: member.userId }),
      })),
      myIndex: room.you,
      mySeat: this.standing ? null : this.seatValue,
      amHost: room.members[room.you]?.isHost ?? false,
      scores: room.scores === null ? null : [room.scores[0], room.scores[1]],
      resetAt: this.toLocal(room.resetAt),
    };
  }

  /**
   * Updates the server-minus-local clock offset. A sample `serverTime - receivedAt`
   * equals the true offset minus that message's one-way latency, so it never
   * overshoots: the largest recent sample is the least-delayed, best estimate.
   */
  private sampleClock(serverTime: number): void {
    this.clockSamples = this.clockSamples.concat(serverTime - this.now()).slice(-CLOCK_SAMPLE_LIMIT);
    this.clockOffsetMs = Math.max(...this.clockSamples);
  }

  private reportError(code: string, fatal: boolean): void {
    this.lastError = { id: ++this.errorId, code, fatal };
    this.publish();
  }

  private setConnection(connection: ConnectionState): void {
    if (connection === this.connection) return;
    this.connection = connection;
    this.publish();
  }

  /** Server epoch ms → local clock ms. */
  private toLocal(serverMs: number | null): number | null {
    return serverMs === null ? null : serverMs - this.clockOffsetMs;
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): GameSnapshot {
    const online: OnlineInfo = {
      phase: this.tablePhase,
      seatsFilled: this.seatsFilled,
      seatCount: SEAT_COUNT,
      backfillAt: this.toLocal(this.serverBackfillAt),
      nextRoundAt: this.toLocal(this.serverNextRoundAt),
      started: this.started,
      phaseSince: this.phaseSince,
      lastError: this.lastError,
      gameKey: this.gameKey,
      // Only private tables carry the key at all, so public snapshots keep their exact shape.
      ...(this.room === null ? {} : { room: this.roomState(this.room) }),
    };
    return {
      view: this.view,
      players: this.players,
      log: this.log,
      turnDeadline: this.toLocal(this.serverTurnDeadline),
      connection: this.connection,
      online,
    };
  }
}
