import { RANKS, SUITS, type Card, type GameEvent, type PlayMove, type PlayerView } from '@chkobba/rules';
import {
  ERROR_CODES,
  ROOM_MAX_MEMBERS,
  TABLE_PHASES,
  isEmoteId,
  isRoomCode,
  type EmoteShown,
  type ErrorCode,
  type ErrorPayload,
  type LogEntry,
  type PlayerInfo,
  type RoomInfo,
  type RoomMember,
  type Snapshot,
  type TablePhase,
} from '@chkobba/protocol';

/**
 * The wire protocol as the mobile app sees it: the shared types from
 * `@chkobba/protocol`, plus defensive decoders for what the server sends.
 * Everything arriving over the socket is untrusted input, so decoders check
 * the shape and return null instead of throwing or casting blindly.
 */

export { ERROR_CODES, OpCode, TABLE_PHASES } from '@chkobba/protocol';
export type {
  CutIntent,
  EmoteIntent,
  EmoteShown,
  ErrorCode,
  ErrorPayload,
  IntentOpCode,
  LogEntry,
  PlayIntent,
  PlayerInfo,
  RoomInfo,
  RoomMember,
  SitIntent,
  Snapshot,
  TablePhase,
} from '@chkobba/protocol';

/** A snapshot carries one view and a log delta; a full log after a rejoin stays well below this. */
export const MAX_MESSAGE_CHARS = 512 * 1024;
/** Nakama user ids are UUIDs; anything longer is not one. */
const MAX_USER_ID_CHARS = 128;
const SEAT_COUNT = 4;
/** `Snapshot.seat` of a standing member of a private table (who then gets `view: null`). */
export const STANDING_SEAT = -1;

type UnknownRecord = { readonly [key: string]: unknown };

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInt(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

function isSeat(value: unknown): value is number {
  return isInt(value, 0, SEAT_COUNT - 1);
}

function isTeam(value: unknown): value is 0 | 1 {
  return value === 0 || value === 1;
}

function isNullable<T>(value: unknown, guard: (v: unknown) => v is T): value is T | null {
  return value === null || guard(value);
}

function isArrayOf<T>(value: unknown, guard: (v: unknown) => v is T): value is readonly T[] {
  return Array.isArray(value) && value.every((item) => guard(item));
}

function isPair<T>(value: unknown, guard: (v: unknown) => v is T): value is readonly [T, T] {
  return Array.isArray(value) && value.length === 2 && guard(value[0]) && guard(value[1]);
}

function isEpochMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

const RANK_SET: ReadonlySet<unknown> = new Set<unknown>(RANKS);
const SUIT_SET: ReadonlySet<unknown> = new Set<unknown>(SUITS);
const PHASE_SET: ReadonlySet<unknown> = new Set<unknown>(['cutting', 'playing', 'roundOver', 'gameOver']);
const TABLE_PHASE_SET: ReadonlySet<unknown> = new Set<unknown>(TABLE_PHASES);
const ERROR_CODE_SET: ReadonlySet<unknown> = new Set<unknown>(ERROR_CODES);

function isCard(value: unknown): value is Card {
  return (
    isRecord(value) &&
    RANK_SET.has(value.rank) &&
    SUIT_SET.has(value.suit) &&
    value.id === `${String(value.rank)}${String(value.suit)}`
  );
}

function isCardId(value: unknown): value is Card['id'] {
  return typeof value === 'string' && value.length >= 2 && RANK_SET.has(value.slice(0, -1)) && SUIT_SET.has(value.slice(-1));
}

function isPlayMove(value: unknown): value is PlayMove {
  return isRecord(value) && isSeat(value.seat) && isCardId(value.cardId) && isArrayOf(value.capture, isCardId);
}

function isCutState(value: unknown): value is PlayerView['cut'] {
  return value === null || (isRecord(value) && isSeat(value.seat) && isNullable(value.card, isCard));
}

function isRoundResult(value: unknown): value is NonNullable<PlayerView['lastRound']> {
  return isRecord(value) && isInt(value.round) && isPair(value.teams, isRecord) && isNullable(value.allDineri, isTeam);
}

/**
 * Checks every PlayerView field the UI reads. `rules` is only checked to be an
 * object: the server builds it from its own config, and the UI reads a few
 * known flags from it.
 */
function isPlayerView(value: unknown): value is PlayerView {
  return (
    isRecord(value) &&
    isSeat(value.seat) &&
    (value.playerCount === 2 || value.playerCount === 4) &&
    isRecord(value.rules) &&
    PHASE_SET.has(value.phase) &&
    isInt(value.round) &&
    isInt(value.deal) &&
    isSeat(value.dealer) &&
    isSeat(value.turn) &&
    isArrayOf(value.hand, isCard) &&
    isArrayOf(value.handCounts, isInt) &&
    isArrayOf(value.table, isCard) &&
    isInt(value.stockCount) &&
    isCutState(value.cut) &&
    isPair(value.pileCounts, isInt) &&
    isPair(value.piles, (pile): pile is readonly Card[] => isArrayOf(pile, isCard)) &&
    isNullable(value.lastCapturer, isSeat) &&
    isPair(value.chkobbas, isInt) &&
    isPair(value.scores, isInt) &&
    isNullable(value.lastRound, isRoundResult) &&
    isNullable(value.winner, isTeam) &&
    isArrayOf(value.legalMoves, isPlayMove)
  );
}

/** Checks the event type and every field the UI dereferences for it. */
function isGameEvent(value: unknown): value is GameEvent {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'dealerDrawn':
      return isSeat(value.dealer) && isArrayOf(value.draws, (round): round is unknown[] => Array.isArray(round));
    case 'roundStarted':
      return isInt(value.round) && isSeat(value.dealer) && isInt(value.redeals);
    case 'cutOffered':
      return isInt(value.round) && isSeat(value.seat);
    case 'cutResolved':
      return isSeat(value.seat) && typeof value.kept === 'boolean' && isNullable(value.card, isCard);
    case 'redealt':
      return isInt(value.round);
    case 'handsDealt':
      return isInt(value.round) && isInt(value.deal);
    case 'cardPlayed':
      return isSeat(value.seat) && isCard(value.card) && isArrayOf(value.captured, isCard) && typeof value.chkobba === 'boolean';
    case 'tableCollected':
      return isTeam(value.team) && isArrayOf(value.cards, isCard);
    case 'roundEnded':
      return isRoundResult(value.result) && isPair(value.scores, isInt);
    case 'gameEnded':
      return isTeam(value.winner) && isPair(value.scores, isInt);
    default:
      return false;
  }
}

function isLogEntry(value: unknown): value is LogEntry {
  return isRecord(value) && isInt(value.seq, 1) && isGameEvent(value.event);
}

function isPlayerInfo(value: unknown): value is PlayerInfo {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.length <= 128 &&
    typeof value.isBot === 'boolean' &&
    typeof value.away === 'boolean' &&
    typeof value.connected === 'boolean'
  );
}

/** A user id worth keeping: a non-empty string of at most `MAX_USER_ID_CHARS`. */
function isWireUserId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_USER_ID_CHARS;
}

/** Keeps the known fields only; `userId` survives when it is a string and is otherwise left out. */
function toPlayerInfo(value: PlayerInfo): PlayerInfo {
  const { name, isBot, away, connected } = value;
  const userId: unknown = value.userId;
  return isWireUserId(userId)
    ? { name, isBot, away, connected, userId }
    : { name, isBot, away, connected };
}

function isTablePhase(value: unknown): value is TablePhase {
  return TABLE_PHASE_SET.has(value);
}

function isErrorCode(value: unknown): value is ErrorCode {
  return ERROR_CODE_SET.has(value);
}

/** UTF-8 bytes → string, without assuming the platform ships TextDecoder. */
export function utf8ToString(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++] ?? 0;
    let code: number;
    if (b0 < 0x80) code = b0;
    else if (b0 >= 0xc0 && b0 < 0xe0) code = ((b0 & 0x1f) << 6) | ((bytes[i++] ?? 0) & 0x3f);
    else if (b0 >= 0xe0 && b0 < 0xf0)
      code = ((b0 & 0x0f) << 12) | (((bytes[i++] ?? 0) & 0x3f) << 6) | ((bytes[i++] ?? 0) & 0x3f);
    else if (b0 >= 0xf0)
      code =
        ((b0 & 0x07) << 18) |
        (((bytes[i++] ?? 0) & 0x3f) << 12) |
        (((bytes[i++] ?? 0) & 0x3f) << 6) |
        ((bytes[i++] ?? 0) & 0x3f);
    else code = 0xfffd;
    out += String.fromCodePoint(code > 0x10ffff ? 0xfffd : code);
  }
  return out;
}

/** Raw match data → parsed JSON, or undefined when too large or not JSON. */
function parseJson(data: Uint8Array | string): unknown {
  if (typeof data !== 'string' && data.byteLength > MAX_MESSAGE_CHARS * 4) return undefined;
  const text = typeof data === 'string' ? data : utf8ToString(data);
  if (text.length === 0 || text.length > MAX_MESSAGE_CHARS) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/** Decodes an opcode SNAPSHOT payload; null when it is not a well-formed snapshot. */
export function decodeSnapshot(data: Uint8Array | string): Snapshot | null {
  const value = parseJson(data);
  if (!isRecord(value)) return null;
  const { seat, phase, view, players, log, turnDeadline, backfillAt, nextRoundAt, serverTime } = value;
  // seat: 0-3, or -1 for a standing member of a private table (checked against `room` below).
  if (!(isSeat(seat) || seat === STANDING_SEAT) || !isTablePhase(phase)) return null;
  if (!isNullable(view, isPlayerView) || (view !== null && view.seat !== seat)) return null;
  if (!Array.isArray(players) || players.length !== SEAT_COUNT || !players.every((p) => isNullable(p, isPlayerInfo))) {
    return null;
  }
  const seats = players.map((p) => (p === null ? null : toPlayerInfo(p)));
  if (!isArrayOf(log, isLogEntry)) return null;
  for (let i = 1; i < log.length; i++) {
    if ((log[i]?.seq ?? 0) <= (log[i - 1]?.seq ?? 0)) return null;
  }
  if (!isNullable(turnDeadline, isEpochMs) || !isNullable(backfillAt, isEpochMs)) return null;
  if (!isNullable(nextRoundAt, isEpochMs) || !isEpochMs(serverTime)) return null;
  const base = { seat, phase, view, players: seats, log, turnDeadline, backfillAt, nextRoundAt, serverTime };
  if (!('room' in value)) return isSeat(seat) ? base : null;
  // Private table: the room must be well formed, and only a standing member (no view) has seat -1.
  const room = decodeRoomInfo(value.room);
  if (room === null) return null;
  if (!isSeat(seat) && !(seat === STANDING_SEAT && view === null)) return null;
  return { ...base, room };
}

function isRoomMember(value: unknown): value is RoomMember {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name.length <= 128 &&
    isNullable(value.seat, isSeat) &&
    typeof value.isHost === 'boolean'
  );
}

/** Keeps the known fields only; `userId` survives under the same rule as `toPlayerInfo` and is otherwise left out. */
function toRoomMember(value: RoomMember): RoomMember {
  const { name, seat, isHost } = value;
  const userId: unknown = value.userId;
  return isWireUserId(userId) ? { name, seat, isHost, userId } : { name, seat, isHost };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A snapshot's `room`, rebuilt from known fields only; null when malformed. */
function decodeRoomInfo(value: unknown): RoomInfo | null {
  if (!isRecord(value)) return null;
  const { code, members, you, scores, resetAt } = value;
  if (typeof code !== 'string' || !isRoomCode(code)) return null;
  if (!isArrayOf(members, isRoomMember) || members.length < 1 || members.length > ROOM_MAX_MEMBERS) return null;
  if (!isInt(you, 0, members.length - 1)) return null;
  if (!isNullable(scores, (s): s is readonly [number, number] => isPair(s, isFiniteNumber))) return null;
  if (!isNullable(resetAt, isFiniteNumber)) return null;
  return {
    code,
    members: members.map(toRoomMember),
    you,
    scores: scores === null ? null : [scores[0], scores[1]],
    resetAt,
  };
}

/** Decodes an opcode ERROR payload; null when the code is unknown or the payload malformed. */
export function decodeError(data: Uint8Array | string): ErrorPayload | null {
  const value = parseJson(data);
  if (!isRecord(value) || !isErrorCode(value.code)) return null;
  return { code: value.code };
}

/** Decodes an opcode EMOTE_SHOWN payload; null for an unknown emote or a malformed payload. */
export function decodeEmoteShown(data: Uint8Array | string): EmoteShown | null {
  const value = parseJson(data);
  if (!isRecord(value) || !isSeat(value.seat) || !isEmoteId(value.id)) return null;
  return { seat: value.seat, id: value.id };
}
