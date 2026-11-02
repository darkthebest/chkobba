import { createDeck, type Card } from '../cards';
import { seedRng } from '../rng';
import type { GameState } from '../types';
import type { PlayerView } from '../view';

/** Cards this seat cannot account for: not in its hand, on the table, or in either (public) pile. */
export function unseenCards(view: PlayerView): Card[] {
  const known = new Set<string>();
  for (const c of view.hand) known.add(c.id);
  for (const c of view.table) known.add(c.id);
  for (const pile of view.piles) for (const c of pile) known.add(c.id);
  return createDeck().filter((c) => !known.has(c.id));
}

/**
 * One plausible full state consistent with the view: unseen cards are dealt
 * at random to the other hands (by their known sizes) and to the stock.
 */
export function sampleWorld(view: PlayerView, random: () => number): GameState {
  const unseen = unseenCards(view);
  for (let i = unseen.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = unseen[i] as Card;
    unseen[i] = unseen[j] as Card;
    unseen[j] = tmp;
  }

  let next = 0;
  const take = (n: number) => {
    const out = unseen.slice(next, next + n);
    next += n;
    return out;
  };
  const hands = view.handCounts.map((count, seat) => (seat === view.seat ? view.hand.slice() : take(count)));
  const stock = take(view.stockCount);

  return {
    rules: view.rules,
    playerCount: view.playerCount,
    phase: view.phase,
    // Rollouts never cross into the next round, so the deck RNG is irrelevant.
    rng: seedRng(0),
    round: view.round,
    deal: view.deal,
    dealer: view.dealer,
    turn: view.turn,
    stock,
    cutCard: null,
    table: view.table,
    hands,
    piles: view.piles,
    chkobbas: view.chkobbas,
    lastCapturer: view.lastCapturer,
    scores: view.scores,
    lastRound: null,
    winner: null,
  };
}
