import { startNextRound, type GameState } from '@chkobba/rules';
import { applyOutcome, botAction, botSeat, roomOf, startGame, withSeat } from './lifecycle';
import { resetToRoom } from './room';
import { AWAY_AFTER_MISSES, BACKFILL_MS, type HumanSeat, type TableState } from './types';

/**
 * Advances the table to `now`: bot backfill, turn timeouts, paced bot turns,
 * the next round and, for a finished private table, the return to its room.
 * Performs at most one game action per call (the match ticks once a second,
 * which is the bot pace). Pure and deterministic given the state and `now`.
 * Returns the same object when nothing was due, so the caller can skip
 * broadcasting.
 */
export function tick(state: TableState, now: number): TableState {
  switch (state.phase) {
    case 'waiting':
      return backfill(state, now);
    case 'playing':
      return playDueTurn(state, now);
    case 'between':
      return startDueRound(state, now);
    case 'finished':
      return resetDueRoom(state, now);
    default: {
      const unhandled: never = state.phase;
      throw new Error(`Unhandled table phase: ${String(unhandled)}`);
    }
  }
}

/**
 * Epoch ms at which `tick` will next do something, or null when nothing is
 * scheduled (a finished public table, a private table waiting for START, or
 * waiting with no human seated). Drive a table in tests with
 * `state = tick(state, nextWakeAt(state))`.
 */
export function nextWakeAt(state: TableState): number | null {
  const isPrivate = roomOf(state) !== null;
  switch (state.phase) {
    case 'waiting':
      return !isPrivate && state.waitingSince !== null ? state.waitingSince + BACKFILL_MS : null;
    case 'playing':
      return state.turnDeadline !== null ? state.turnDeadline : state.nextActionAt;
    case 'between':
      return state.nextActionAt;
    case 'finished':
      return isPrivate ? state.nextActionAt : null;
    default: {
      const unhandled: never = state.phase;
      throw new Error(`Unhandled table phase: ${String(unhandled)}`);
    }
  }
}

/**
 * A table nobody sits at never starts; the adapter terminates it instead.
 * Private tables never backfill: the host's START fills the empty seats.
 */
function backfill(state: TableState, now: number): TableState {
  if (roomOf(state) !== null) return state;
  if (state.waitingSince === null || now < state.waitingSince + BACKFILL_MS) return state;
  const seats = state.seats.map((slot, index) => slot ?? botSeat(index));
  return startGame({ ...state, seats }, now);
}

function playDueTurn(state: TableState, now: number): TableState {
  const game = state.game;
  if (game === null) return state;
  if (state.turnDeadline !== null && now >= state.turnDeadline) return timeOut(state, game, now);
  if (state.nextActionAt !== null && now >= state.nextActionAt) return autoplay(state, game, now);
  return state;
}

/** The human ran out of time: the bot plays this turn and the miss counts toward away. */
function timeOut(state: TableState, game: GameState, now: number): TableState {
  const slot = state.seats[game.turn];
  const marked = slot && slot.kind === 'human' ? withSeat(state, game.turn, withMiss(slot)) : state;
  return autoplay(marked, game, now);
}

function withMiss(seat: HumanSeat): HumanSeat {
  const missed = seat.missed + 1;
  return { ...seat, missed, away: seat.away || missed >= AWAY_AFTER_MISSES };
}

function autoplay(state: TableState, game: GameState, now: number): TableState {
  const result = botAction(game);
  if (!result.ok) throw new Error(`Server bot made an illegal ${game.phase} action: ${result.error}`);
  return applyOutcome(state, result.state, result.events, now);
}

/** A finished public table stays as is (the adapter closes it); a private one returns to its room when due. */
function resetDueRoom(state: TableState, now: number): TableState {
  const room = roomOf(state);
  if (room === null || state.nextActionAt === null || now < state.nextActionAt) return state;
  return resetToRoom(state, room);
}

function startDueRound(state: TableState, now: number): TableState {
  const game = state.game;
  if (game === null || state.nextActionAt === null || now < state.nextActionAt) return state;
  const result = startNextRound(game);
  if (!result.ok) throw new Error(`Cannot start the next round: ${result.error}`);
  return applyOutcome(state, result.state, result.events, now);
}
