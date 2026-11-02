import type { Card } from './cards';
import type { RulesConfig } from './config';
import { legalMoves } from './engine';
import type { GameState, Phase, PlayMove, PlayerCount, RoundResult, Seat, Team } from './types';

/**
 * What one seat is allowed to see. This is the only shape that should ever
 * leave the authority (server or local client) for a given player, and the only
 * input bots get — so bots can't cheat and the server never leaks hidden hands.
 */
export interface PlayerView {
  readonly seat: Seat;
  readonly playerCount: PlayerCount;
  readonly rules: RulesConfig;
  readonly phase: Phase;
  readonly round: number;
  readonly deal: number;
  readonly dealer: Seat;
  readonly turn: Seat;
  readonly hand: readonly Card[];
  /** Cards in each seat's hand (counts only). */
  readonly handCounts: readonly number[];
  readonly table: readonly Card[];
  readonly stockCount: number;
  /**
   * During the 'cutting' phase: who is cutting, and the cut card itself only
   * for that seat (everyone else just sees that a cut is happening).
   */
  readonly cut: { readonly seat: Seat; readonly card: Card | null } | null;
  /** Captured card counts per team (piles are face down). */
  readonly pileCounts: readonly [number, number];
  /**
   * Captured cards per team. Piles are face down, but every captured card was
   * shown on the table first, so this is what a player with perfect memory knows.
   */
  readonly piles: readonly [readonly Card[], readonly Card[]];
  /** Seat that made the last capture this round (it collects the leftover table). */
  readonly lastCapturer: Seat | null;
  readonly chkobbas: readonly [number, number];
  readonly scores: readonly [number, number];
  readonly lastRound: RoundResult | null;
  readonly winner: Team | null;
  /** Legal moves for this seat; empty when it is not this seat's turn. */
  readonly legalMoves: readonly PlayMove[];
}

export function viewFor(state: GameState, seat: Seat): PlayerView {
  return {
    seat,
    playerCount: state.playerCount,
    rules: state.rules,
    phase: state.phase,
    round: state.round,
    deal: state.deal,
    dealer: state.dealer,
    turn: state.turn,
    hand: state.hands[seat] ?? [],
    handCounts: state.hands.map((h) => h.length),
    table: state.table,
    stockCount: state.stock.length,
    cut:
      state.phase === 'cutting' && state.cutCard
        ? { seat: state.turn, card: state.turn === seat ? state.cutCard : null }
        : null,
    pileCounts: [state.piles[0].length, state.piles[1].length],
    piles: state.piles,
    lastCapturer: state.lastCapturer,
    chkobbas: state.chkobbas,
    scores: state.scores,
    lastRound: state.lastRound,
    winner: state.winner,
    legalMoves: state.phase === 'playing' && state.turn === seat ? legalMoves(state) : [],
  };
}
