import type { EmoteId } from '@chkobba/protocol';
import type { CardId, GameEvent, PlayerView, Seat } from '@chkobba/rules';

export interface SeatInfo {
  readonly seat: Seat;
  readonly name: string;
  readonly isBot: boolean;
  /** Online only: missed turns in a row; a bot plays for them until they act again. */
  readonly away?: boolean;
  /** Online only: false while this human's connection is gone (a bot plays meanwhile). */
  readonly connected?: boolean;
  /** Online only: the Nakama user id of a human seat; absent for bots and offline play. */
  readonly userId?: string;
}

/** A public event with a monotonically increasing sequence number, so the UI can tell new events from old. */
export interface LogEntry {
  readonly seq: number;
  readonly event: GameEvent;
}

/** Someone else at the table sent an emote. Transient: not part of the snapshot. */
export interface EmoteEvent {
  readonly seat: Seat;
  readonly id: EmoteId;
}

/** Online table lifecycle, wider than the engine's phase. */
export type OnlineTablePhase = 'waiting' | 'playing' | 'between' | 'finished';

/** Link state of an online client. */
export type ConnectionState = 'connecting' | 'online' | 'reconnecting';

/** A problem reported by an online client. `id` increases with each new error, so the UI can show each once. */
export interface OnlineError {
  readonly id: number;
  /** A server ErrorCode (e.g. `not_your_turn`) or a client one (`table_full`, `join_failed`, `offline`). */
  readonly code: string;
  /** True when the client gave up: the table cannot be (re)joined. */
  readonly fatal: boolean;
}

/** One human present at a private table (seated or standing). */
export interface RoomMemberState {
  readonly name: string;
  /** Seat index, or null while standing. */
  readonly seat: Seat | null;
  readonly isHost: boolean;
  /** The member's user id, when the server sent one (for "Add friend"). */
  readonly userId?: string;
}

/** A private table's room: its code, members and the host. Absent on public tables. */
export interface RoomState {
  readonly code: string;
  /** In join order (earliest first). */
  readonly members: readonly RoomMemberState[];
  /** Our own entry: an index into `members`, from the server's `RoomInfo.you`. */
  readonly myIndex: number;
  /** Our own seat, or null while standing. */
  readonly mySeat: Seat | null;
  readonly amHost: boolean;
  /** Team scores of the game in progress (standing members get no view); null while waiting. */
  readonly scores: readonly [number, number] | null;
  /** Local-clock ms when a finished game returns to the room; null otherwise. */
  readonly resetAt: number | null;
}

/** Online-only table information: the waiting room and the server-driven lifecycle. */
export interface OnlineInfo {
  readonly phase: OnlineTablePhase;
  /** Occupied seats (humans and bots), for the "Finding players" screen. */
  readonly seatsFilled: number;
  readonly seatCount: number;
  /** Local-clock ms when bots fill the empty seats; null when no backfill timer runs. */
  readonly backfillAt: number | null;
  /** Local-clock ms when the next round starts automatically; set only in phase 'between'. */
  readonly nextRoundAt?: number | null;
  /**
   * False until the server sent a game view. While false, `GameSnapshot.view`
   * is a placeholder and the table must not be shown.
   */
  readonly started: boolean;
  /** Local-clock ms when the current `phase` was first seen (e.g. for a "next round soon" indicator). */
  readonly phaseSince: number;
  readonly lastError: OnlineError | null;
  /** Private tables only: the room. */
  readonly room?: RoomState;
  /**
   * Changes each time a private table returns to its room after a game (0 at
   * first), so the UI can remount the table per game. Constant on public
   * tables. NakamaGameClient always sets it; absent reads as 0.
   */
  readonly gameKey?: number;
}

export interface GameSnapshot {
  readonly view: PlayerView;
  readonly players: readonly SeatInfo[];
  /** Recent public events, oldest first. Drives the action log and animations. */
  readonly log: readonly LogEntry[];
  /** Online only: local-clock ms when the current human turn times out; null when no timer runs. */
  readonly turnDeadline?: number | null;
  /** Online only: link state. Absent for local games. */
  readonly connection?: ConnectionState;
  /** Online only: waiting room and table lifecycle. Absent for local games. */
  readonly online?: OnlineInfo;
}

/**
 * Everything the UI needs from a game, independent of where the game runs.
 * LocalGameClient runs the engine and bots in-process (offline MVP);
 * NakamaGameClient implements the same contract against the server.
 */
export interface GameClient {
  /** The seat this client plays. */
  readonly seat: Seat;
  /** Online only: the authoritative match id, for the app-level room session. */
  readonly matchId?: string;
  /**
   * Shows each hand card's capture options (Easy bots). Otherwise the player
   * picks the table cards to take themselves, which is the game's real skill.
   */
  readonly captureHints?: boolean;
  getSnapshot(): GameSnapshot;
  /** useSyncExternalStore-compatible subscription. */
  subscribe(listener: () => void): () => void;
  /** Starts (or resumes) the game loop: bot turns, network connection, etc. */
  start(): void;
  /** Pauses the game loop and releases timers or connections. Safe to call repeatedly. */
  stop(): void;
  play(cardId: CardId, capture: readonly CardId[]): Promise<void>;
  /** As the cutter: keep the cut card (true) or throw it face up on the table (false). */
  cut(keep: boolean): Promise<void>;
  /** Starts the next round after a summary. Online this is a no-op: the server advances by itself. */
  nextRound(): Promise<void>;
  /** Online only: "I'm here", clears our away status so the bot stops playing for us. */
  back?(): Promise<void>;
  /** Sends a table emote. Fire and forget: a dropped emote is never an error for the player. */
  emote?(id: EmoteId): void;
  /** Emotes from the other seats (never our own), in arrival order. */
  subscribeEmotes?(listener: (event: EmoteEvent) => void): () => void;
  /**
   * Private tables only: sit in an empty seat or switch seats (waiting), or take
   * over a bot seat while standing (in game). The server answers with a snapshot
   * or an error (e.g. `seat_taken`).
   */
  sit?(seat: Seat): Promise<void>;
  /** Private tables only, host only: fill the empty seats with bots and start the game. */
  startGame?(): Promise<void>;
}
