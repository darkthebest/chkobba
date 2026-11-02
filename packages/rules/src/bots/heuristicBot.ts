import { cardValue, DINERI_SUIT, HAYA_ID, type Card } from '../cards';
import type { PlayMove } from '../types';
import type { PlayerView } from '../view';
import type { Bot } from './types';

/** How much the bot values each thing it captures or gives away. */
export interface HeuristicWeights {
  card: number;
  dineri: number;
  haya: number;
  seven: number;
  six: number;
  chkobba: number;
  /** Penalty when the table left behind can be swept by the next (opposing) player. */
  sweepRisk: number;
}

export const DEFAULT_WEIGHTS: HeuristicWeights = {
  card: 1,
  dineri: 1.5,
  haya: 12,
  seven: 3,
  six: 1,
  chkobba: 20,
  sweepRisk: 9,
};

function cardWorth(card: Card, w: HeuristicWeights): number {
  let v = w.card;
  if (card.suit === DINERI_SUIT) v += w.dineri;
  if (card.id === HAYA_ID) v += w.haya;
  if (card.rank === '7') v += w.seven;
  if (card.rank === '6') v += w.six;
  return v;
}

/**
 * Could some card sweep this whole table? With rankPriority a sweep needs either
 * a single card (taken by its rank) or a table summing to a rank value 1–10.
 */
function sweepable(table: readonly Card[], view: PlayerView): boolean {
  if (table.length === 0) return false;
  if (table.length === 1) return true;
  let sum = 0;
  for (const c of table) sum += cardValue(c, view.rules);
  return sum <= 10;
}

/**
 * Greedy one-ply bot: scores every legal move by what it captures (weighted
 * toward diamonds, sevens and the 7aya), rewards chkobbas, and penalizes leaving
 * a table the next player can sweep or giving away valuable cards.
 */
export function createHeuristicBot(weights: HeuristicWeights = DEFAULT_WEIGHTS): Bot {
  const score = (view: PlayerView, move: PlayMove): number => {
    const card = view.hand.find((c) => c.id === move.cardId) as Card;
    const captured = view.table.filter((c) => move.capture.indexOf(c.id) !== -1);
    const remaining = view.table.filter((c) => move.capture.indexOf(c.id) === -1);
    const isLastCard = view.stockCount === 0 && view.handCounts.reduce((a, b) => a + b, 0) === 1;

    let s = 0;
    if (captured.length > 0) {
      s += cardWorth(card, weights);
      for (const c of captured) s += cardWorth(c, weights);
      if (remaining.length === 0 && (!isLastCard || view.rules.lastCardChkobba)) s += weights.chkobba;
    } else {
      remaining.push(card);
      // Giving a card to the table risks the opponents taking it.
      s -= cardWorth(card, weights) * 0.75;
      // Prefer dumping cards that are hard to capture with a single matching rank.
      s -= cardValue(card, view.rules) * 0.05;
    }

    if (!isLastCard && sweepable(remaining, view)) s -= weights.sweepRisk;
    return s;
  };

  return {
    id: 'heuristic',
    chooseMove(view) {
      const moves = view.legalMoves;
      if (moves.length === 0) throw new Error('heuristicBot: no legal moves');
      let best = moves[0] as PlayMove;
      let bestScore = -Infinity;
      for (const move of moves) {
        const s = score(view, move);
        if (s > bestScore) {
          best = move;
          bestScore = s;
        }
      }
      return best;
    },
  };
}
