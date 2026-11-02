/**
 * Shared helpers for the pure table core tests (seats, tick, intent,
 * projection, full games). Time is a plain epoch-ms number passed to every
 * reducer; there are no timers to fake. Keep this file general: other suites
 * depend on it.
 */
import { legalMoves, type GameState } from '@chkobba/rules';
import { OpCode, type CutIntent, type PlayIntent } from '@chkobba/protocol';
import {
  createTable,
  intent,
  join,
  nextWakeAt,
  tick,
  type HumanSeat,
  type Joiner,
  type Presence,
  type TableState,
} from '..';

/** Fixed start time for every table in tests. */
export const T0 = 1_700_000_000_000;
/** Fixed table seed, so every shuffle and bot decision replays identically. */
export const SEED = 'table-test-seed';
/** Default cap for drive loops; a full game to 21 needs far fewer actions. */
export const MAX_DRIVE_STEPS = 5000;

/** A controllable clock for tests that prefer `clock.advance(ms)` over raw numbers. */
export interface FakeClock {
  now: number;
  advance(ms: number): number;
  set(at: number): number;
}

export function createClock(start: number = T0): FakeClock {
  const clock: FakeClock = {
    now: start,
    advance(ms: number): number {
      clock.now += ms;
      return clock.now;
    },
    set(at: number): number {
      clock.now = at;
      return clock.now;
    },
  };
  return clock;
}

/** userId `u<n>`, sessionId `s<n>` (or the given session). */
export function presence(n: number, sessionId: string = `s${n}`): Presence {
  return { userId: `u${n}`, sessionId };
}

/** A joiner named `Player <n>` with userId `u<n>`. */
export function joiner(n: number, sessionId: string = `s${n}`): Joiner {
  return { ...presence(n, sessionId), name: `Player ${n}` };
}

/** A fresh waiting table created at `now` with the fixed seed. */
export function newTable(now: number = T0, seed: string = SEED): TableState {
  return createTable({ now, seed });
}

/** Room code of every private table in tests. */
export const ROOM_CODE = 'K7M2QX';

/**
 * A fresh private table (code ROOM_CODE) with members u1..u<members> joined
 * at `now`, in order: u1 is host, the first four sit in seats 0-3 and any
 * further ones stand. Nothing starts until the host sends START.
 */
export function privateTable(members: number = 0, now: number = T0, seed: string = SEED): TableState {
  let state = createTable({ now, seed, privateCode: ROOM_CODE });
  for (let n = 1; n <= members; n++) state = mustJoin(state, joiner(n), now);
  return state;
}

/** Joins and throws if the join is rejected. */
export function mustJoin(state: TableState, who: Joiner, now: number = T0): TableState {
  const result = join(state, who, now);
  if (!result.ok) throw new Error(`join of ${who.userId} failed: ${result.error}`);
  return result.state;
}

/** Seats humans u1..u<count> (sessions s1..s<count>) on a fresh table. Four humans start the game at `now`. */
export function tableWithHumans(count: number, now: number = T0, seed: string = SEED): TableState {
  let state = newTable(now, seed);
  for (let n = 1; n <= count; n++) state = mustJoin(state, joiner(n), now);
  return state;
}

/** Four humans seated; the game is started at `now`. */
export function fullHumanTable(now: number = T0, seed: string = SEED): TableState {
  return tableWithHumans(4, now, seed);
}

/** One human (u1 at seat 0) plus three backfilled bots; the game started at T0 + BACKFILL_MS. */
export function soloHumanTable(seed: string = SEED): Driven {
  const waiting = tableWithHumans(1, T0, seed);
  return advance(waiting);
}

/** The started game, or throw. */
export function gameOf(state: TableState): GameState {
  if (state.game === null) throw new Error(`table has no game (phase ${state.phase})`);
  return state.game;
}

/** The engine seat whose turn it is. */
export function turnOf(state: TableState): number {
  return gameOf(state).turn;
}

/** The human seat at `index`, or throw. */
export function humanAt(state: TableState, index: number): HumanSeat {
  const slot = state.seats[index];
  if (!slot || slot.kind !== 'human') throw new Error(`seat ${index} is not a human seat`);
  return slot;
}

/** The presence currently holding a human seat (throws when disconnected). */
export function presenceAt(state: TableState, index: number): Presence {
  const seat = humanAt(state, index);
  if (seat.sessionId === null) throw new Error(`seat ${index} is disconnected`);
  return { userId: seat.userId, sessionId: seat.sessionId };
}

export interface Driven {
  readonly state: TableState;
  /** The time the last action was applied at. */
  readonly now: number;
}

/** Runs the next scheduled tick (`tick(state, nextWakeAt(state))`). Throws when nothing is scheduled. */
export function advance(state: TableState): Driven {
  const at = nextWakeAt(state);
  if (at === null) throw new Error(`nothing scheduled (phase ${state.phase})`);
  return { state: tick(state, at), now: at };
}

/**
 * Ticks at each scheduled wake-up until `done` holds (checked before every
 * step, so an already-matching state is returned as is with `now`).
 */
export function driveUntil(
  state: TableState,
  done: (state: TableState) => boolean,
  now: number = T0,
  maxSteps: number = MAX_DRIVE_STEPS,
): Driven {
  let current: Driven = { state, now };
  for (let step = 0; step < maxSteps; step++) {
    if (done(current.state)) return current;
    current = advance(current.state);
  }
  throw new Error(`driveUntil: condition not met after ${maxSteps} steps`);
}

/** True while the engine waits on `seat` in the given engine phase (any acting phase by default). */
export function isTurnOf(seat: number, phase?: 'cutting' | 'playing'): (state: TableState) => boolean {
  return (state) => {
    if (state.phase !== 'playing' || state.game === null) return false;
    const game = state.game;
    if (game.turn !== seat) return false;
    return phase === undefined ? game.phase === 'cutting' || game.phase === 'playing' : game.phase === phase;
  };
}

/** Drives (timeouts and bot turns) until it is `seat`'s turn. */
export function driveToTurn(state: TableState, seat: number, now: number = T0, phase?: 'cutting' | 'playing'): Driven {
  return driveUntil(state, isTurnOf(seat, phase), now);
}

/** Solo table (u1 at seat 0, three bots) driven to u1's turn, optionally in a given engine phase. */
export function soloAtHumanTurn(phase?: 'cutting' | 'playing'): Driven {
  const started = soloHumanTable();
  return driveToTurn(started.state, 0, started.now, phase);
}

/**
 * Solo table where u1 (seat 0) has let `misses` of their turns time out in a
 * row. The returned `now` is the moment of the last timeout.
 */
export function soloAfterMisses(misses: number): Driven {
  let driven = soloAtHumanTurn();
  for (let i = 0; i < misses; i++) {
    driven = advance(driven.state);
    if (i < misses - 1) driven = driveToTurn(driven.state, 0, driven.now);
  }
  return driven;
}

/** A legal PLAY payload for the seat to move (the engine's first legal move). */
export function firstLegalPlay(state: TableState): PlayIntent {
  const move = legalMoves(gameOf(state))[0];
  if (!move) throw new Error('no legal move available');
  return { cardId: move.cardId, capture: move.capture.slice() };
}

/**
 * The human at the seat to move acts for real: CUT (keep by default) while
 * cutting, otherwise PLAY the first legal move. Throws if the intent is rejected.
 */
export function actAsHuman(state: TableState, now: number, cut: CutIntent = { keep: true }): TableState {
  const game = gameOf(state);
  const from = presenceAt(state, game.turn);
  const result =
    game.phase === 'cutting'
      ? intent(state, from, OpCode.CUT, cut, now)
      : intent(state, from, OpCode.PLAY, firstLegalPlay(state), now);
  if (!result.ok) throw new Error(`human ${game.phase} intent rejected: ${result.error}`);
  return result.state;
}
