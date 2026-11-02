import { DEFAULT_RULES, type BotLevel, type GameState, type PlayerCount, type RulesConfig } from '@chkobba/rules';
import type { LogEntry, TablePhase } from '@chkobba/protocol';

/** 2v2 only in milestone 1. */
export const SEAT_COUNT: PlayerCount = 4;
export const TABLE_RULES: RulesConfig = DEFAULT_RULES;
export const SERVER_BOT_LEVEL: BotLevel = 'normal';

/** Empty seats fill with bots this long after the first waiting human sat down (`waitingSince`). */
export const BACKFILL_MS = 15000;
/** Time a connected, present human has to play a card. */
export const PLAY_MS = 20000;
/** Time a connected, present human has to resolve the cut. */
export const CUT_MS = 10000;
/** Delay before a bot (or a bot standing in for a human) acts. */
export const BOT_PACE_MS = 1000;
/** Round summary time before the next round starts. */
export const NEXT_ROUND_MS = 8000;
/** Consecutive timeouts after which a human is marked away. */
export const AWAY_AFTER_MISSES = 2;
/** Display names are truncated to this length. */
export const MAX_NAME_LENGTH = 24;

/**
 * A human's seat. It stays reserved for `userId` for the whole game, even while
 * disconnected (`sessionId: null`); a bot plays for them meanwhile.
 */
export interface HumanSeat {
  readonly kind: 'human';
  readonly userId: string;
  /** Current Nakama session; null while disconnected. */
  readonly sessionId: string | null;
  readonly name: string;
  /** Missed turns in a row (timeouts). Reset by any real action. */
  readonly missed: number;
  /** Set after AWAY_AFTER_MISSES misses; a bot plays until they act again. */
  readonly away: boolean;
}

export interface BotSeat {
  readonly kind: 'bot';
  readonly name: string;
}

/** null = empty (only while waiting). */
export type SeatSlot = HumanSeat | BotSeat | null;

/** Snapshot and join seat index of a private-table member who holds no seat. */
export const STANDING_SEAT = -1;
/**
 * `Member.sessionId` of a seated human who disconnected during a game. They
 * stay a member (keeping their place in the join order and their reserved
 * seat) until they reconnect or the table returns to its room. Nakama session
 * ids are never empty.
 */
export const ABSENT_SESSION = '';

/** A human present in a private table, seated or standing. */
export interface Member {
  readonly userId: string;
  /** Current session, or ABSENT_SESSION while a seated member is disconnected during a game. */
  readonly sessionId: string;
  readonly name: string;
  /** Epoch ms of arrival; the host passes to the earliest present member. */
  readonly joinedAt: number;
}

/** Private-table state; null on public tables. */
export interface PrivateRoom {
  readonly code: string;
  /** Present humans in join order. A seated human is also in `seats`. */
  readonly members: readonly Member[];
  /** userId of the host; null only while nobody is present. */
  readonly hostUserId: string | null;
  /** Games started at this table; seeds game n with `${seed}:${n}`. */
  readonly gameNo: number;
}

/**
 * Whole table, held in Nakama match state. Plain JSON-serializable data: no
 * classes, Maps or functions. Every reducer returns a new object and never
 * mutates its input.
 */
export interface TableState {
  /** Seeds the game (and therefore every shuffle). */
  readonly seed: string;
  readonly createdAt: number;
  /**
   * Epoch ms the waiting table went from no seated human to at least one;
   * the backfill clock counts from here. null while no human is seated. A
   * later join (after the last human left) restarts it.
   */
  readonly waitingSince: number | null;
  readonly phase: TablePhase;
  /** Indexed by engine seat; length SEAT_COUNT. Partners sit opposite (0+2, 1+3). */
  readonly seats: readonly SeatSlot[];
  /** null while waiting. */
  readonly game: GameState | null;
  /** Public engine events in order. */
  readonly log: readonly LogEntry[];
  /** Last assigned log seq (0 = none yet). */
  readonly seq: number;
  /** Epoch ms when the current human turn times out; null when no human timer runs. */
  readonly turnDeadline: number | null;
  /**
   * Epoch ms of the next automatic action: a bot move while playing, the next
   * round while between, the return to the room once a private game finished.
   */
  readonly nextActionAt: number | null;
  readonly finishedAt: number | null;
  /**
   * Private-table room; null on public tables. Match state saved before
   * private tables existed has no such key: read it through `roomOf`.
   */
  readonly room: PrivateRoom | null;
}

/** Who sent something: the fields of a Nakama presence that identify a seat holder. */
export interface Presence {
  readonly userId: string;
  readonly sessionId: string;
}

export interface Joiner extends Presence {
  readonly name: string;
}
