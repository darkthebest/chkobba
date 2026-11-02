import { DINERI_SUIT, type Card } from '../cards';
import type { PlayerView } from '../view';
import type { Bot } from './types';

/**
 * Default cut decision: keep cards worth protecting (sevens, sixes for
 * bermila, diamonds) and throw the rest on the table, where the cutter, who
 * plays first, has the first chance to build a capture around it.
 */
export function keepCutCard(card: Card): boolean {
  return card.rank === '7' || card.rank === '6' || card.suit === DINERI_SUIT;
}

/** The bot's own cut decision, falling back to `keepCutCard`. */
export function chooseCut(bot: Bot, view: PlayerView): boolean {
  if (bot.chooseCut) return bot.chooseCut(view);
  const card = view.cut?.card;
  if (!card) throw new Error('chooseCut: this seat is not cutting');
  return keepCutCard(card);
}
