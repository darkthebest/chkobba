import type { Card, CardId } from './cards';
import type { RulesConfig } from './config';
import type { RngState } from './rng';

/** Seats are numbered in turn order. Partners sit opposite: seats 0+2 vs 1+3. */
export type Seat = number;
/** Team index: seat % 2. With two players each player is their own team. */
export type Team = 0 | 1;
export type PlayerCount = 2 | 4;

/** 'cutting': the first player has seen the cut card and must keep it or throw it on the table. */
export type Phase = 'cutting' | 'playing' | 'roundOver' | 'gameOver';

/** A player's only action: play one card, capturing the listed table cards (empty = place it). */
export interface PlayMove {
  readonly seat: Seat;
  readonly cardId: CardId;
  readonly capture: readonly CardId[];
}

/** The cutter keeps the cut card (and is dealt 2 more) or throws it face up on the table. */
export interface CutDecision {
  readonly seat: Seat;
  readonly keep: boolean;
}

export interface DealerDraw {
  readonly seat: Seat;
  readonly card: Card;
}

export interface TeamRoundScore {
  readonly cards: number;
  readonly dineri: number;
  readonly sevens: number;
  readonly sixes: number;
  readonly hasHaya: boolean;
  readonly chkobbas: number;
  /** Points earned this round by category. */
  readonly points: {
    readonly karta: number;
    readonly dineri: number;
    readonly bermila: number;
    readonly haya: number;
    readonly chkobba: number;
  };
  readonly total: number;
}

export interface RoundResult {
  readonly round: number;
  /** Indexed by team. */
  readonly teams: readonly [TeamRoundScore, TeamRoundScore];
  /** Team that captured all ten diamonds, if any. */
  readonly allDineri: Team | null;
}

/** Full authoritative state. Plain serializable data: safe to store in a Nakama match. */
export interface GameState {
  readonly rules: RulesConfig;
  readonly playerCount: PlayerCount;
  readonly phase: Phase;
  readonly rng: RngState;
  readonly round: number;
  /** 1-based deal number within the round (each deal gives 3 cards to every hand). */
  readonly deal: number;
  readonly dealer: Seat;
  readonly turn: Seat;
  readonly stock: readonly Card[];
  /** Card the cutter is looking at during the 'cutting' phase (hidden from everyone else). */
  readonly cutCard: Card | null;
  readonly table: readonly Card[];
  /** Indexed by seat. */
  readonly hands: readonly (readonly Card[])[];
  /** Captured cards, indexed by team. */
  readonly piles: readonly [readonly Card[], readonly Card[]];
  /** Chkobbas this round, indexed by team. */
  readonly chkobbas: readonly [number, number];
  readonly lastCapturer: Seat | null;
  /** Cumulative game score, indexed by team. */
  readonly scores: readonly [number, number];
  readonly lastRound: RoundResult | null;
  readonly winner: Team | null;
}

export type GameEvent =
  /** Game start: everyone draws, lowest card deals; each inner list is one drawing round (ties redraw). */
  | { readonly type: 'dealerDrawn'; readonly draws: readonly (readonly DealerDraw[])[]; readonly dealer: Seat }
  | { readonly type: 'roundStarted'; readonly round: number; readonly dealer: Seat; readonly redeals: number }
  | { readonly type: 'cutOffered'; readonly round: number; readonly seat: Seat }
  /** `card` is only revealed when it was thrown on the table; a kept card stays secret. */
  | { readonly type: 'cutResolved'; readonly seat: Seat; readonly kept: boolean; readonly card: Card | null }
  /** The opening table had three of a kind: everything is reshuffled and cut again. */
  | { readonly type: 'redealt'; readonly round: number }
  | { readonly type: 'handsDealt'; readonly round: number; readonly deal: number }
  | {
      readonly type: 'cardPlayed';
      readonly seat: Seat;
      readonly card: Card;
      readonly captured: readonly Card[];
      readonly chkobba: boolean;
    }
  | { readonly type: 'tableCollected'; readonly team: Team; readonly cards: readonly Card[] }
  | { readonly type: 'roundEnded'; readonly result: RoundResult; readonly scores: readonly [number, number] }
  | { readonly type: 'gameEnded'; readonly winner: Team; readonly scores: readonly [number, number] };

export type MoveError =
  | 'GAME_NOT_IN_PROGRESS'
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_IN_HAND'
  | 'ILLEGAL_CAPTURE'
  | 'ROUND_NOT_OVER'
  | 'NOT_CUTTING';

export type MoveResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: MoveError };
