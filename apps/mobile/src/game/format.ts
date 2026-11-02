import type { Card, GameEvent, Suit } from '@chkobba/rules';
import type { TFunction } from 'i18next';

import type { SeatInfo } from './GameClient';

export const SUIT_SYMBOLS: Record<Suit, string> = { D: '♦', H: '♥', S: '♠', C: '♣' };

export function isRedSuit(suit: Suit): boolean {
  return suit === 'D' || suit === 'H';
}

export function cardLabel(card: Card): string {
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

export function cardsLabel(cards: readonly Card[]): string {
  return cards.map(cardLabel).join(' + ');
}

/** One human-readable line for the action log, or null for events not worth showing. `mySeat` gets the "you" wording. */
export function describeEvent(event: GameEvent, players: readonly SeatInfo[], mySeat: number, tr: TFunction): string | null {
  const name = (seat: number) => players[seat]?.name ?? tr('common.seatN', { n: seat + 1 });
  // i18next context: `log.cutOffered_you` ("You cut the deck") for our own seat.
  const who = (seat: number) => ({ name: name(seat), context: seat === mySeat ? 'you' : undefined });
  switch (event.type) {
    case 'dealerDrawn': {
      const last = event.draws[event.draws.length - 1] ?? [];
      const card = last.find((d) => d.seat === event.dealer)?.card;
      return tr('log.dealerDrawn', { ...who(event.dealer), card: card ? cardLabel(card) : '?' });
    }
    case 'cutOffered':
      return tr('log.cutOffered', who(event.seat));
    case 'cutResolved':
      return event.kept || !event.card
        ? tr('log.cutKept', who(event.seat))
        : tr('log.cutThrown', { ...who(event.seat), card: cardLabel(event.card) });
    case 'redealt':
      return tr('log.redealt');
    case 'cardPlayed': {
      if (event.captured.length === 0) return tr('log.placed', { ...who(event.seat), card: cardLabel(event.card) });
      const took = tr('log.took', { ...who(event.seat), cards: cardsLabel(event.captured), card: cardLabel(event.card) });
      return event.chkobba ? `${took}  ${tr('log.chkobba')}` : took;
    }
    case 'tableCollected':
      return tr('log.tableCollected', { count: event.cards.length });
    case 'handsDealt':
      return event.deal === 1 ? null : tr('log.newDeal', { deal: event.deal });
    case 'roundStarted':
      return tr('log.roundStarted', { ...who(event.dealer), round: event.round });
    case 'roundEnded':
    case 'gameEnded':
      return null;
  }
}
