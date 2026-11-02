import type { RulesConfig } from './config';

/** D = diamonds (dineri, the scoring suit), S = spades, H = hearts, C = clubs. */
export const SUITS = ['D', 'S', 'H', 'C'] as const;
export type Suit = (typeof SUITS)[number];

/** The 40-card Chkobba deck: 8s, 9s and 10s are removed. */
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', 'Q', 'J', 'K'] as const;
export type Rank = (typeof RANKS)[number];

/** Stable, serializable card identifier, e.g. "7D" for the seven of diamonds (7aya). */
export type CardId = `${Rank}${Suit}`;

export interface Card {
  readonly id: CardId;
  readonly rank: Rank;
  readonly suit: Suit;
}

export const DINERI_SUIT: Suit = 'D';
export const HAYA_ID: CardId = '7D';

export function makeCard(rank: Rank, suit: Suit): Card {
  return { id: `${rank}${suit}` as CardId, rank, suit };
}

/** Parses "7D", "QS", "AH"… into a Card. Throws on malformed ids. */
export function parseCard(id: string): Card {
  const rank = id.slice(0, -1) as Rank;
  const suit = id.slice(-1) as Suit;
  if (RANKS.indexOf(rank) === -1 || SUITS.indexOf(suit) === -1) {
    throw new Error(`Invalid card id: ${id}`);
  }
  return makeCard(rank, suit);
}

/** A fresh, ordered 40-card deck. Shuffle it with an Rng. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit));
    }
  }
  return deck;
}

const NUMERIC_VALUES: Record<string, number> = {
  A: 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  K: 10,
};

/** Capture value of a rank under the configured face-card values. */
export function rankValue(rank: Rank, rules: Pick<RulesConfig, 'faceValues'>): number {
  if (rank === 'Q') return rules.faceValues === 'Q8_J9_K10' ? 8 : 9;
  if (rank === 'J') return rules.faceValues === 'Q8_J9_K10' ? 9 : 8;
  return NUMERIC_VALUES[rank] as number;
}

export function cardValue(card: Card, rules: Pick<RulesConfig, 'faceValues'>): number {
  return rankValue(card.rank, rules);
}

export function containsCard(cards: readonly Card[], id: CardId): boolean {
  for (const c of cards) if (c.id === id) return true;
  return false;
}

export function removeCards(cards: readonly Card[], ids: readonly CardId[]): Card[] {
  return cards.filter((c) => ids.indexOf(c.id) === -1);
}
