import { applyMove, teamOf } from '../engine';
import { createRandom } from '../rng';
import type { GameState, PlayMove } from '../types';
import { viewFor, type PlayerView } from '../view';
import { createHeuristicBot } from './heuristicBot';
import { sampleWorld } from './sampling';
import type { Bot } from './types';

export interface MonteCarloOptions {
  /** Sampled deals of the unseen cards per decision. More is stronger and slower. */
  worlds?: number;
  /** Plays every seat during rollouts. */
  rolloutBot?: Bot;
}

/** A stable seed from what the seat can see, so the same position always gets the same decision. */
function seedFor(view: PlayerView): string {
  const ids = (cards: readonly { id: string }[]) => cards.map((c) => c.id).join('');
  return `${view.round}.${view.deal}.${view.seat}.${ids(view.hand)}.${ids(view.table)}.${view.stockCount}`;
}

/** Plays the round out from `state` and returns the point difference for `team`. */
function rollout(state: GameState, team: 0 | 1, bot: Bot): number {
  let s = state;
  while (s.phase === 'playing') {
    const result = applyMove(s, bot.chooseMove(viewFor(s, s.turn)));
    if (!result.ok) throw new Error(`monteCarloBot rollout: ${result.error}`);
    s = result.state;
  }
  const round = s.lastRound;
  if (!round) return 0;
  return round.teams[team].total - round.teams[team === 0 ? 1 : 0].total;
}

/**
 * Determinized Monte Carlo ("perfect information sampling"): for each legal
 * move, deal the unseen cards many ways, play the rest of the round with the
 * heuristic bot, and pick the move with the best average point difference.
 * It only ever uses information in the PlayerView.
 */
export function createMonteCarloBot(options: MonteCarloOptions = {}): Bot {
  const worlds = options.worlds ?? 64;
  const rolloutBot = options.rolloutBot ?? createHeuristicBot();

  return {
    id: 'monte-carlo',
    chooseMove(view) {
      const moves = view.legalMoves;
      if (moves.length === 0) throw new Error('monteCarloBot: no legal moves');
      if (moves.length === 1) return moves[0] as PlayMove;

      const random = createRandom(seedFor(view));
      const team = teamOf(view.seat);
      const totals = moves.map(() => 0);
      // The same sampled worlds are used for every move, so moves are compared fairly.
      for (let w = 0; w < worlds; w++) {
        const world = sampleWorld(view, random);
        moves.forEach((move, i) => {
          const after = applyMove(world, move);
          if (!after.ok) throw new Error(`monteCarloBot: ${after.error}`);
          totals[i] = (totals[i] as number) + rollout(after.state, team, rolloutBot);
        });
      }

      let best = 0;
      for (let i = 1; i < moves.length; i++) if ((totals[i] as number) > (totals[best] as number)) best = i;
      return moves[best] as PlayMove;
    },
  };
}
