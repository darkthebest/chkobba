import {
  applyCut,
  applyMove,
  chooseCut,
  createBot,
  createGame,
  viewFor,
  type GameEvent,
  type GameState,
  type MoveResult,
} from '@chkobba/rules';
import { ROOM_RESET_MS, type LogEntry } from '@chkobba/protocol';
import {
  BOT_PACE_MS,
  CUT_MS,
  NEXT_ROUND_MS,
  PLAY_MS,
  SEAT_COUNT,
  SERVER_BOT_LEVEL,
  TABLE_RULES,
  type BotSeat,
  type HumanSeat,
  type Joiner,
  type PrivateRoom,
  type SeatSlot,
  type TableState,
} from './types';

/** The normal bot is stateless and deterministic, so one instance serves every seat and table. */
const serverBot = createBot(SERVER_BOT_LEVEL);

const BOT_NAMES: readonly string[] = ['Hedi', 'Sonia', 'Mongi', 'Fatma'];

export interface CreateTableOptions {
  readonly now: number;
  /** Seeds every shuffle of the game; the adapter passes `nk.uuidv4()`. */
  readonly seed: string;
  /** Present for private tables: the room code from the create RPC. */
  readonly privateCode?: string;
}

export function createTable(options: CreateTableOptions): TableState {
  const seats: SeatSlot[] = [];
  for (let i = 0; i < SEAT_COUNT; i++) seats.push(null);
  return {
    seed: options.seed,
    createdAt: options.now,
    waitingSince: null,
    phase: 'waiting',
    seats,
    game: null,
    log: [],
    seq: 0,
    turnDeadline: null,
    nextActionAt: null,
    finishedAt: null,
    room: options.privateCode === undefined ? null : { code: options.privateCode, members: [], hostUserId: null, gameNo: 0 },
  };
}

/**
 * The table's private room, or null for a public table. Every private branch
 * goes through here: match state saved before private tables existed has no
 * `room` key at all and reads as public.
 */
export function roomOf(state: TableState): PrivateRoom | null {
  return state.room ?? null;
}

export function botSeat(index: number): BotSeat {
  return { kind: 'bot', name: BOT_NAMES[index] ?? `Bot ${index + 1}` };
}

/** A fresh human seat for `who` (a joiner or a room member), present and with no misses. */
export function humanSeat(who: Joiner): HumanSeat {
  return { kind: 'human', userId: who.userId, sessionId: who.sessionId, name: who.name, missed: 0, away: false };
}

export function isConnected(seat: HumanSeat): boolean {
  return seat.sessionId !== null;
}

/** True when a person (not a stand-in bot) decides this seat's actions right now. */
export function isHumanControlled(slot: SeatSlot | undefined): slot is HumanSeat {
  return slot !== undefined && slot !== null && slot.kind === 'human' && isConnected(slot) && !slot.away;
}

export function findHumanSeat(state: TableState, userId: string): { index: number; seat: HumanSeat } | null {
  for (let index = 0; index < state.seats.length; index++) {
    const seat = state.seats[index];
    if (seat && seat.kind === 'human' && seat.userId === userId) return { index, seat };
  }
  return null;
}

export function withSeat(state: TableState, index: number, slot: SeatSlot): TableState {
  return { ...state, seats: state.seats.map((s, i) => (i === index ? slot : s)) };
}

function appendLog(state: TableState, events: readonly GameEvent[]): TableState {
  if (events.length === 0) return state;
  const entries: LogEntry[] = events.map((event, i) => ({ seq: state.seq + i + 1, event }));
  return { ...state, log: state.log.concat(entries), seq: state.seq + events.length };
}

/**
 * Deals the first round and starts play. A public table plays one game with
 * the table seed; a private table seeds game n (`room.gameNo`, already
 * counted by START) with `${seed}:${n}` so every game deals afresh.
 */
export function startGame(state: TableState, now: number): TableState {
  const room = roomOf(state);
  const seed = room === null ? state.seed : `${state.seed}:${room.gameNo}`;
  const { state: game, events } = createGame({ seed, playerCount: SEAT_COUNT, rules: TABLE_RULES });
  return applyOutcome(state, game, events, now);
}

/**
 * Records an engine step and moves the table on: the next turn, the round
 * summary (`between`) or the end of the game (`finished`). A finished private
 * table schedules its return to the room `ROOM_RESET_MS` later.
 */
export function applyOutcome(
  state: TableState,
  game: GameState,
  events: readonly GameEvent[],
  now: number,
): TableState {
  const logged = appendLog({ ...state, game, turnDeadline: null, nextActionAt: null }, events);
  if (game.phase === 'gameOver') {
    const resetAt = roomOf(state) === null ? null : now + ROOM_RESET_MS;
    return { ...logged, phase: 'finished', finishedAt: now, nextActionAt: resetAt };
  }
  if (game.phase === 'roundOver') return { ...logged, phase: 'between', nextActionAt: now + NEXT_ROUND_MS };
  return refreshTurn({ ...logged, phase: 'playing' }, now);
}

/**
 * Makes the timers match whoever controls the seat to act. Idempotent: a
 * running human deadline or a scheduled bot action is kept as is, so repeated
 * calls (or a spurious BACK) never extend a turn.
 */
export function refreshTurn(state: TableState, now: number): TableState {
  const game = state.game;
  if (state.phase !== 'playing' || game === null) return state;
  if (game.phase !== 'cutting' && game.phase !== 'playing') return state;
  if (isHumanControlled(state.seats[game.turn])) {
    if (state.turnDeadline !== null) return state;
    const limit = game.phase === 'cutting' ? CUT_MS : PLAY_MS;
    return { ...state, turnDeadline: now + limit, nextActionAt: null };
  }
  if (state.nextActionAt !== null) return state;
  return { ...state, turnDeadline: null, nextActionAt: now + BOT_PACE_MS };
}

/** The server bot acts for the seat to move. It only ever sees that seat's view. */
export function botAction(game: GameState): MoveResult {
  const seat = game.turn;
  const view = viewFor(game, seat);
  return game.phase === 'cutting'
    ? applyCut(game, { seat, keep: chooseCut(serverBot, view) })
    : applyMove(game, serverBot.chooseMove(view));
}
