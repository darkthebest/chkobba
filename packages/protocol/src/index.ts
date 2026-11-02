import type { GameEvent, PlayMove, PlayerView } from '@chkobba/rules';
import type { RoomInfo } from './room';

/**
 * Wire protocol between the authoritative Nakama table and the client.
 * Plain `const` objects and string unions only (no TS `enum`), so the server's
 * ES5 bundle inlines nothing but a few numbers. Changing anything here is a
 * breaking change for shipped mobile builds.
 */

/** Match data opcodes. 1-99: client → server intents; 100+: server → client. */
export const OpCode = {
  PLAY: 1,
  CUT: 2,
  /** "I'm here": clears the away status. No payload. */
  BACK: 3,
  /** A table emote (`EmoteIntent`). */
  EMOTE: 4,
  SIT: 5, // SitIntent
  START: 6, // host only, no payload
  SNAPSHOT: 100,
  ERROR: 101,
  /** Someone at the table sent an emote (`EmoteShown`). */
  EMOTE_SHOWN: 102,
} as const;
export type OpCode = (typeof OpCode)[keyof typeof OpCode];

/** Opcodes a client may send. */
export type IntentOpCode =
  | typeof OpCode.PLAY
  | typeof OpCode.CUT
  | typeof OpCode.BACK
  | typeof OpCode.EMOTE
  | typeof OpCode.SIT
  | typeof OpCode.START;

/** Play a card: the engine's move without the seat (the server knows who sent it). */
export type PlayIntent = Pick<PlayMove, 'cardId' | 'capture'>;

/** Resolve the cut: keep the cut card (true) or throw it on the table (false). */
export interface CutIntent {
  readonly keep: boolean;
}

/**
 * Table lifecycle, wider than the engine's phase:
 * - waiting: seats filling; bots backfill at `backfillAt`.
 * - playing: a round is in progress (cutting or playing).
 * - between: round summary shown; the next round starts automatically.
 * - finished: game over.
 */
export const TABLE_PHASES = ['waiting', 'playing', 'between', 'finished'] as const;
export type TablePhase = (typeof TABLE_PHASES)[number];

/** Public information about one occupied seat. */
export interface PlayerInfo {
  readonly name: string;
  readonly isBot: boolean;
  /** Missed turns in a row; a bot plays for them until they act again. */
  readonly away: boolean;
  /** False while a human's socket is gone; a bot plays for them meanwhile. */
  readonly connected: boolean;
  /** Human seats only; absent for bots. Old decoders drop it. */
  readonly userId?: string;
}

/** Every engine event is public: a kept cut card is never in an event. */
export type PublicEvent = GameEvent;

export interface LogEntry {
  /** Strictly increasing per table, starting at 1. */
  readonly seq: number;
  readonly event: PublicEvent;
}

/** Sent to one presence only (opcode SNAPSHOT). */
export interface Snapshot {
  /**
   * Recipient's seat index, or -1 for a standing member of a private table
   * (who then gets `view: null`).
   */
  readonly seat: number;
  readonly phase: TablePhase;
  /** The recipient's own view; null until the game starts. */
  readonly view: PlayerView | null;
  /** Indexed by seat; null for an empty seat while waiting. */
  readonly players: readonly (PlayerInfo | null)[];
  /** Log entries with `seq` greater than the last one this presence received. */
  readonly log: readonly LogEntry[];
  /** Epoch ms when the current human turn times out; null when no human timer runs. */
  readonly turnDeadline: number | null;
  /**
   * Epoch ms when bots fill the empty seats. Null while waiting with no human
   * seated (the backfill timer only runs once someone sits down) and once the
   * game has started.
   */
  readonly backfillAt: number | null;
  /**
   * Epoch ms when the next round starts automatically. Non-null only in phase
   * 'between'.
   */
  readonly nextRoundAt: number | null;
  /**
   * Server epoch ms when this snapshot was built and sent. Clients derive their
   * clock offset from it to convert the other epoch-ms fields to local time.
   * Snapshots are only sent on change, so this is not a heartbeat.
   */
  readonly serverTime: number;
  /** Private-table information; absent for public tables. */
  readonly room?: RoomInfo;
}

export const ERROR_CODES = [
  'bad_opcode',
  'bad_payload',
  'not_seated',
  'table_full',
  'wrong_phase',
  'not_your_turn',
  'illegal_move',
  'not_host',
  'seat_taken',
  'already_seated',
  'not_private',
  'room_full',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Sent to one presence only (opcode ERROR). */
export interface ErrorPayload {
  readonly code: ErrorCode;
}

export type TableMode = '2v2';

/** Nakama match label (JSON), searched by the quick_match RPC. */
export interface TableLabel {
  /** Accepting new players: waiting with at least one free seat. */
  readonly open: boolean;
  readonly mode: TableMode;
  readonly seatsFree: number;
  readonly private: boolean;
}

export * from './directory';
export * from './emotes';
export * from './friends';
export * from './names';
export * from './room';
export * from './stats';
