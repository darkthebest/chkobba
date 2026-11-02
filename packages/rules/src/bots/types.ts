import type { PlayMove } from '../types';
import type { PlayerView } from '../view';

/**
 * A bot picks a move from what its seat can see. It must return one of
 * `view.legalMoves`. Bots are stateless between turns so any bot can take over
 * any seat at any time (disconnect backfill).
 */
export interface Bot {
  readonly id: string;
  chooseMove(view: PlayerView): PlayMove;
  /** Keep (true) or throw (false) the cut card; bots without an opinion use `keepCutCard`. */
  chooseCut?(view: PlayerView): boolean;
}
