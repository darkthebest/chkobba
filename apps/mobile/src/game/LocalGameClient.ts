import {
  applyCut,
  applyMove,
  chooseCut,
  createGame,
  createBot as createLevelBot,
  startNextRound,
  viewFor,
  type Bot,
  type BotLevel,
  type CardId,
  type GameEvent,
  type GameState,
  type MoveResult,
  type PlayerCount,
  type RulesConfig,
  type Seat,
} from '@chkobba/rules';

import type { EmoteId } from '@chkobba/protocol';

import type { EmoteEvent, GameClient, GameSnapshot, LogEntry, SeatInfo } from './GameClient';

/** Schedules `fn` after `ms` and returns a cancel function. Injectable for tests. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

export const timeoutScheduler: Scheduler = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export interface LocalGameOptions {
  readonly seed: string | number;
  readonly playerCount: PlayerCount;
  readonly rules?: Partial<RulesConfig>;
  readonly humanSeat?: Seat;
  /** First dealer; when omitted everyone draws and the lowest card deals. */
  readonly dealer?: Seat;
  /** Difficulty of every bot seat (ignored when createBot is given). */
  readonly botLevel?: BotLevel;
  readonly createBot?: (seat: Seat) => Bot;
  /** Pause before each bot move so the human can follow the play. */
  readonly botDelayMs?: number;
  /** Extra pause after any capture so the swept cards can animate away. */
  readonly captureDelayMs?: number;
  /** Extra pause after a chkobba so its celebration can play out. */
  readonly celebrationDelayMs?: number;
  /** Extra pause before the first bot action, while the dealer draw is shown. */
  readonly introDelayMs?: number;
  readonly scheduler?: Scheduler;
  readonly names?: readonly string[];
  /**
   * Bots react with emotes (sweeps, big captures, replies to ours). Defaults to
   * on in the app and off when a test injects its own `scheduler`, so timer
   * counts in existing tests stay exact.
   */
  readonly botEmotes?: boolean;
  /** Pause before a bot's emote. */
  readonly emoteDelayMs?: number;
  /** Randomness for bot emotes only (the game itself stays seeded). Injectable for tests. */
  readonly random?: () => number;
}

/** How likely a bot answers our emote, and with what. */
const REPLY_CHANCE = 0.35;
const REPLIES: Partial<Record<EmoteId, readonly EmoteId[]>> = {
  thumbs: ['thumbs', 'bravo'],
  laugh: ['laugh', 'facepalm'],
  facepalm: ['laugh', 'chwaya'],
  fire: ['wow', 'fire'],
  wow: ['laugh', 'thumbs'],
  pray: ['chwaya', 'laugh'],
  yalla: ['chwaya', 'laugh'],
  sahha: ['sahha', 'thumbs'],
  mabrouk: ['sahha', 'thumbs'],
  bravo: ['sahha', 'thumbs'],
  khsara: ['laugh', 'chwaya'],
  chwaya: ['yalla', 'laugh'],
};
const HAYA = '7D';

const DEFAULT_NAMES: Record<PlayerCount, readonly string[]> = {
  2: ['You', 'Hédi'],
  4: ['You', 'Hédi', 'Amira', 'Karim'],
};
const LOG_LIMIT = 20;

/** Offline game: the full authoritative state lives here; the UI only ever sees the human's PlayerView. */
export class LocalGameClient implements GameClient {
  readonly seat: Seat;
  readonly captureHints: boolean;
  private state: GameState;
  private log: LogEntry[];
  private seq = 0;
  private snapshot: GameSnapshot;
  private readonly players: SeatInfo[];
  private readonly bots: Map<Seat, Bot>;
  private readonly listeners = new Set<() => void>();
  private readonly scheduler: Scheduler;
  private readonly botDelayMs: number;
  private readonly captureDelayMs: number;
  private readonly celebrationDelayMs: number;
  private introDelayMs: number;
  private cancelPending: (() => void) | null = null;
  private running = false;
  private readonly emoteListeners = new Set<(event: EmoteEvent) => void>();
  private readonly emoteTimers = new Set<() => void>();
  private readonly botEmotes: boolean;
  private readonly emoteDelayMs: number;
  private readonly random: () => number;

  constructor(options: LocalGameOptions) {
    this.seat = options.humanSeat ?? 0;
    this.scheduler = options.scheduler ?? timeoutScheduler;
    this.botDelayMs = options.botDelayMs ?? 900;
    this.captureDelayMs = options.captureDelayMs ?? 500;
    this.celebrationDelayMs = options.celebrationDelayMs ?? 1400;
    this.botEmotes = options.botEmotes ?? options.scheduler === undefined;
    this.emoteDelayMs = options.emoteDelayMs ?? 700;
    this.random = options.random ?? Math.random;

    const names = options.names ?? DEFAULT_NAMES[options.playerCount];
    const level = options.botLevel ?? 'normal';
    this.captureHints = level === 'easy';
    const createBot = options.createBot ?? ((seat: Seat) => createLevelBot(level, `${options.seed}:${seat}`));
    this.players = [];
    this.bots = new Map();
    for (let seat = 0; seat < options.playerCount; seat++) {
      const isBot = seat !== this.seat;
      this.players.push({ seat, name: names[seat] ?? `Seat ${seat + 1}`, isBot });
      if (isBot) this.bots.set(seat, createBot(seat));
    }

    const { state, events } = createGame({
      seed: options.seed,
      playerCount: options.playerCount,
      rules: options.rules,
      dealer: options.dealer,
    });
    // Only pause for the intro when there is a dealer draw to show.
    this.introDelayMs = events.some((e) => e.type === 'dealerDrawn') ? (options.introDelayMs ?? 2600) : 0;
    this.state = state;
    this.log = this.toEntries(events);
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): GameSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(): void {
    this.running = true;
    this.scheduleBot();
  }

  stop(): void {
    this.running = false;
    this.cancelPending?.();
    this.cancelPending = null;
    for (const cancel of this.emoteTimers) cancel();
    this.emoteTimers.clear();
  }

  /** Our own emote: the UI shows it; a bot may answer. */
  emote(id: EmoteId): void {
    if (!this.botEmotes || !this.running || this.random() >= REPLY_CHANCE) return;
    const bots = [...this.bots.keys()];
    const seat = bots[Math.floor(this.random() * bots.length)];
    const replies = REPLIES[id] ?? ['thumbs'];
    const reply = replies[Math.floor(this.random() * replies.length)];
    if (seat !== undefined && reply !== undefined) this.botEmote(seat, reply, this.emoteDelayMs + 500);
  }

  subscribeEmotes = (listener: (event: EmoteEvent) => void): (() => void) => {
    this.emoteListeners.add(listener);
    return () => {
      this.emoteListeners.delete(listener);
    };
  };

  async play(cardId: CardId, capture: readonly CardId[]): Promise<void> {
    this.introDelayMs = 0;
    this.commit(applyMove(this.state, { seat: this.seat, cardId, capture }));
  }

  async cut(keep: boolean): Promise<void> {
    this.introDelayMs = 0;
    this.commit(applyCut(this.state, { seat: this.seat, keep }));
  }

  async nextRound(): Promise<void> {
    this.commit(startNextRound(this.state));
  }

  private commit(result: MoveResult): void {
    if (!result.ok) throw new Error(result.error);
    this.state = result.state;
    this.log = this.log.concat(this.toEntries(result.events)).slice(-LOG_LIMIT);
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
    this.reactTo(result.events);
    this.scheduleBot();
  }

  /** At most one bot emote per move: a cheer, a groan or a boast. */
  private reactTo(events: readonly GameEvent[]): void {
    if (!this.botEmotes || !this.running) return;
    for (const event of events) {
      const reaction = this.reactionTo(event);
      if (reaction) {
        this.botEmote(reaction.seat, reaction.id, this.emoteDelayMs);
        return;
      }
    }
  }

  private reactionTo(event: GameEvent): EmoteEvent | null {
    const pick = (seats: readonly Seat[]) => seats[Math.floor(this.random() * seats.length)];
    const botsOf = (team: number, except?: Seat) => [...this.bots.keys()].filter((s) => s % 2 === team && s !== except);
    if (event.type === 'gameEnded') {
      const seat = pick(botsOf(event.winner));
      return seat !== undefined && this.random() < 0.8 ? { seat, id: 'bravo' } : null;
    }
    if (event.type !== 'cardPlayed' || event.captured.length === 0) return null;
    const team = event.seat % 2;
    const mates = botsOf(team, event.seat);
    const rivals = botsOf(1 - team);
    const sweeperIsBot = this.bots.has(event.seat);
    const roll = this.random();
    if (event.chkobba) {
      const mate = pick(mates);
      if (mate !== undefined && roll < 0.5) return { seat: mate, id: 'mabrouk' };
      if (sweeperIsBot && roll < 0.7) return { seat: event.seat, id: 'fire' };
      const rival = pick(rivals);
      return rival !== undefined && roll < 0.9 ? { seat: rival, id: 'khsara' } : null;
    }
    if (event.captured.some((card) => card.id === HAYA)) {
      const rival = pick(rivals);
      return rival !== undefined && roll < 0.35 ? { seat: rival, id: 'facepalm' } : null;
    }
    if (event.captured.length >= 3 && sweeperIsBot && roll < 0.25) return { seat: event.seat, id: 'fire' };
    return null;
  }

  private botEmote(seat: Seat, id: EmoteId, delay: number): void {
    const cancel = this.scheduler(() => {
      this.emoteTimers.delete(cancel);
      for (const listener of this.emoteListeners) listener({ seat, id });
    }, delay);
    this.emoteTimers.add(cancel);
  }

  private toEntries(events: readonly GameEvent[]): LogEntry[] {
    return events.map((event) => ({ seq: ++this.seq, event }));
  }

  private scheduleBot(): void {
    if (!this.running || this.cancelPending) return;
    const { phase, turn } = this.state;
    const bot = this.bots.get(turn);
    if ((phase !== 'playing' && phase !== 'cutting') || !bot) return;

    const lastPlay = [...this.log].reverse().find((e) => e.event.type !== 'handsDealt')?.event;
    const captured = lastPlay?.type === 'cardPlayed' && lastPlay.captured.length > 0;
    const swept = lastPlay?.type === 'cardPlayed' && lastPlay.chkobba;
    const delay =
      this.botDelayMs + this.introDelayMs + (captured ? this.captureDelayMs : 0) + (swept ? this.celebrationDelayMs : 0);
    this.introDelayMs = 0;
    this.cancelPending = this.scheduler(() => {
      this.cancelPending = null;
      const view = viewFor(this.state, turn);
      this.commit(
        this.state.phase === 'cutting'
          ? applyCut(this.state, { seat: turn, keep: chooseCut(bot, view) })
          : applyMove(this.state, bot.chooseMove(view)),
      );
    }, delay);
  }

  private buildSnapshot(): GameSnapshot {
    return { view: viewFor(this.state, this.seat), players: this.players, log: this.log };
  }
}
