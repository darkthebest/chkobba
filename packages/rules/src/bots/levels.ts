import { createRandom } from '../rng';
import { createHeuristicBot } from './heuristicBot';
import { createMonteCarloBot } from './monteCarloBot';
import type { Bot } from './types';

export type BotLevel = 'easy' | 'normal' | 'hard';
export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

/** Easy: the heuristic bot, but it plays a random legal move `mistakeRate` of the time. */
export function createEasyBot(random: () => number, mistakeRate = 0.35): Bot {
  const heuristic = createHeuristicBot();
  return {
    id: 'easy',
    chooseMove(view) {
      const moves = view.legalMoves;
      if (moves.length > 1 && random() < mistakeRate) {
        return moves[Math.floor(random() * moves.length)] as (typeof moves)[number];
      }
      return heuristic.chooseMove(view);
    },
  };
}

/** One bot for the given difficulty. `seed` only affects the easy bot's mistakes. */
export function createBot(level: BotLevel, seed: string | number = 0): Bot {
  switch (level) {
    case 'easy':
      return createEasyBot(createRandom(`easy:${seed}`));
    case 'normal':
      return createHeuristicBot();
    case 'hard':
      return createMonteCarloBot();
  }
}
