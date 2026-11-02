import type { Bot } from './types';

/** Plays a uniformly random legal move. Useful for tests and simulations. */
export function createRandomBot(random: () => number): Bot {
  return {
    id: 'random',
    chooseMove(view) {
      const moves = view.legalMoves;
      if (moves.length === 0) throw new Error('randomBot: no legal moves');
      return moves[Math.floor(random() * moves.length)] as (typeof moves)[number];
    },
  };
}
