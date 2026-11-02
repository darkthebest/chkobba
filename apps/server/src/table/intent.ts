import {
  RANKS,
  SUITS,
  applyCut,
  applyMove,
  type CardId,
  type MoveError,
  type MoveResult,
} from '@chkobba/rules';
import { OpCode, type CutIntent, type ErrorCode, type PlayIntent, type SitIntent } from '@chkobba/protocol';
import {
  applyOutcome,
  botSeat,
  findHumanSeat,
  humanSeat,
  refreshTurn,
  roomOf,
  startGame,
  withSeat,
} from './lifecycle';
import { findMember, isPresent } from './room';
import { SEAT_COUNT, type HumanSeat, type Member, type Presence, type PrivateRoom, type TableState } from './types';

export type IntentResult =
  | { readonly ok: true; readonly state: TableState }
  | { readonly ok: false; readonly error: ErrorCode };

/** No legal capture can list more cards than the deck holds. */
const MAX_CAPTURE_IDS = 40;

interface Actor {
  readonly index: number;
  readonly seat: HumanSeat;
}

/**
 * Applies one client message. `payload` is untrusted (already JSON-decoded by
 * the adapter) and is validated here. Checks run in order: seat, opcode,
 * phase, turn, payload, engine legality. On failure the input state is
 * returned untouched alongside an error code.
 *
 * On a private table SIT and START come from any present member, seated or
 * standing (a non-member gets `not_seated`); PLAY, CUT and BACK still need
 * the seat. Public tables answer SIT and START with `not_private`.
 */
export function intent(
  state: TableState,
  from: Presence,
  opcode: number,
  payload: unknown,
  now: number,
): IntentResult {
  const room = roomOf(state);
  if (room !== null && (opcode === OpCode.SIT || opcode === OpCode.START)) {
    return roomIntent(state, room, from, opcode, payload, now);
  }
  const found = findHumanSeat(state, from.userId);
  if (!found || found.seat.sessionId !== from.sessionId) return fail('not_seated');
  switch (opcode) {
    case OpCode.PLAY:
      return play(state, found, payload, now);
    case OpCode.CUT:
      return cut(state, found, payload, now);
    case OpCode.BACK:
      return { ok: true, state: back(state, found, now) };
    case OpCode.SIT:
    case OpCode.START:
      return fail('not_private');
    default:
      return fail('bad_opcode');
  }
}

function roomIntent(
  state: TableState,
  room: PrivateRoom,
  from: Presence,
  opcode: typeof OpCode.SIT | typeof OpCode.START,
  payload: unknown,
  now: number,
): IntentResult {
  const found = findMember(room, from.userId);
  if (!found || !isPresent(found.member) || found.member.sessionId !== from.sessionId) return fail('not_seated');
  return opcode === OpCode.SIT ? sit(state, found.member, payload, now) : start(state, room, found.member, now);
}

/**
 * Waiting: take an empty seat, switching from the current one if any.
 * Playing or between rounds: a standing member takes over a bot seat; a seat
 * held by a human (even a disconnected one) stays theirs.
 */
function sit(state: TableState, member: Member, payload: unknown, now: number): IntentResult {
  if (state.phase === 'finished') return fail('wrong_phase');
  const request = parseSitIntent(payload);
  if (!request) return fail('bad_payload');
  const target = request.seat;
  const current = findHumanSeat(state, member.userId);
  if (state.phase === 'waiting') {
    if (state.seats[target] !== null) return fail('seat_taken');
    const vacated = current ? withSeat(state, current.index, null) : state;
    return { ok: true, state: withSeat(vacated, target, current ? current.seat : humanSeat(member)) };
  }
  if (current) return fail('already_seated');
  const slot = state.seats[target];
  if (!slot || slot.kind !== 'bot') return fail('seat_taken');
  return { ok: true, state: takeOver(state, target, humanSeat(member), now) };
}

/**
 * A standing member replaces the bot at `index`. Behaves like a reconnect
 * handback: if the seat is to act, a pending bot pace on it is cancelled and
 * the person gets a fresh turn timer (`refreshTurn`; a no-op otherwise).
 */
function takeOver(state: TableState, index: number, seat: HumanSeat, now: number): TableState {
  return refreshTurn(withSeat(state, index, seat), now);
}

/**
 * Host only, while waiting, with at least one human seated: bots fill the
 * empty seats and the next game starts with its own seed. With nobody seated
 * there is no player to start for, so it fails like a START outside the
 * waiting room (`wrong_phase`).
 */
function start(state: TableState, room: PrivateRoom, member: Member, now: number): IntentResult {
  if (room.hostUserId !== member.userId) return fail('not_host');
  if (state.phase !== 'waiting') return fail('wrong_phase');
  if (!state.seats.some((slot) => slot !== null && slot.kind === 'human')) return fail('wrong_phase');
  const seats = state.seats.map((slot, index) => slot ?? botSeat(index));
  const next: TableState = { ...state, seats, room: { ...room, gameNo: room.gameNo + 1 } };
  return { ok: true, state: startGame(next, now) };
}

function play(state: TableState, actor: Actor, payload: unknown, now: number): IntentResult {
  const game = state.phase === 'playing' ? state.game : null;
  if (!game || game.phase !== 'playing') return fail('wrong_phase');
  if (game.turn !== actor.index) return fail('not_your_turn');
  const move = parsePlayIntent(payload);
  if (!move) return fail('bad_payload');
  return settle(state, actor, applyMove(game, { seat: actor.index, ...move }), now);
}

function cut(state: TableState, actor: Actor, payload: unknown, now: number): IntentResult {
  const game = state.phase === 'playing' ? state.game : null;
  if (!game || game.phase !== 'cutting') return fail('wrong_phase');
  if (game.turn !== actor.index) return fail('not_your_turn');
  const decision = parseCutIntent(payload);
  if (!decision) return fail('bad_payload');
  return settle(state, actor, applyCut(game, { seat: actor.index, keep: decision.keep }), now);
}

/** "I'm here": clears away and the miss streak; the seat's own timer applies again from now. */
function back(state: TableState, actor: Actor, now: number): TableState {
  if (!actor.seat.away && actor.seat.missed === 0) return state;
  return refreshTurn(withSeat(state, actor.index, { ...actor.seat, away: false, missed: 0 }), now);
}

/** A real action by the player: resets their miss streak and away status, then records the step. */
function settle(state: TableState, actor: Actor, result: MoveResult, now: number): IntentResult {
  if (!result.ok) return fail(errorCodeFor(result.error));
  const present = withSeat(state, actor.index, { ...actor.seat, away: false, missed: 0 });
  return { ok: true, state: applyOutcome(present, result.state, result.events, now) };
}

function fail(error: ErrorCode): IntentResult {
  return { ok: false, error };
}

function errorCodeFor(error: MoveError): ErrorCode {
  switch (error) {
    case 'NOT_YOUR_TURN':
      return 'not_your_turn';
    case 'CARD_NOT_IN_HAND':
    case 'ILLEGAL_CAPTURE':
      return 'illegal_move';
    case 'GAME_NOT_IN_PROGRESS':
    case 'ROUND_NOT_OVER':
    case 'NOT_CUTTING':
      return 'wrong_phase';
    default: {
      const unhandled: never = error;
      throw new Error(`Unhandled move error: ${String(unhandled)}`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isCardId(value: unknown): value is CardId {
  if (typeof value !== 'string' || value.length !== 2) return false;
  const rank = value.charAt(0);
  const suit = value.charAt(1);
  return RANKS.some((r) => r === rank) && SUITS.some((s) => s === suit);
}

/**
 * Validates a PLAY payload. Duplicate capture ids are rejected: the engine's
 * capture comparison checks length and membership only, so `[X, X]` would
 * match a legal `[X, Y]` and capture just X.
 */
export function parsePlayIntent(payload: unknown): PlayIntent | null {
  if (!isRecord(payload)) return null;
  const { cardId, capture } = payload;
  if (!isCardId(cardId) || !Array.isArray(capture) || capture.length > MAX_CAPTURE_IDS) return null;
  const ids: CardId[] = [];
  for (const id of capture) {
    if (!isCardId(id) || ids.indexOf(id) !== -1) return null;
    ids.push(id);
  }
  return { cardId, capture: ids };
}

export function parseCutIntent(payload: unknown): CutIntent | null {
  if (!isRecord(payload) || typeof payload.keep !== 'boolean') return null;
  return { keep: payload.keep };
}

/** Validates a SIT payload: an integer seat index 0-3. */
export function parseSitIntent(payload: unknown): SitIntent | null {
  if (!isRecord(payload)) return null;
  const seat = payload.seat;
  if (typeof seat !== 'number' || seat !== Math.floor(seat) || seat < 0 || seat >= SEAT_COUNT) return null;
  return { seat };
}
