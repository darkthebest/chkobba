import { DECKS, type DeckRarity, type DeckTheme } from './themes';

export const STARTING_COINS = 500;
export const MATCH_WIN_COINS = 25;

export const BOX_PRICES = { one: 100, five: 450 } as const;
export type BoxCount = keyof typeof BOX_PRICES;

export const DUPE_COINS: Record<DeckRarity, number> = {
  common: 10,
  rare: 40,
  epic: 150,
  mythic: 500,
};

export const RARITY_WEIGHTS: readonly { id: DeckRarity; weight: number }[] = [
  { id: 'common', weight: 65 },
  { id: 'rare', weight: 20 },
  { id: 'epic', weight: 10 },
  { id: 'mythic', weight: 5 },
];

export interface BoxResult {
  deck: DeckTheme;
  duplicate: boolean;
  refund: number;
}

export interface BoxOpening {
  coins: number;
  owned: string[];
  results: BoxResult[];
  spent: number;
}

export function boxSize(count: BoxCount): number {
  return count === 'one' ? 1 : 5;
}

export function rollDeck(random: () => number = Math.random): DeckTheme {
  const roll = random() * 100;
  let edge = 0;
  let rarity: DeckRarity = 'mythic';
  for (const entry of RARITY_WEIGHTS) {
    edge += entry.weight;
    if (roll < edge) {
      rarity = entry.id;
      break;
    }
  }
  const pool = DECKS.filter((deck) => deck.rarity === rarity);
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}

/** Charges the box price, then rolls `count` decks; a duplicate refunds coins immediately. */
export function openBoxes(
  coins: number,
  owned: readonly string[],
  count: BoxCount,
  random: () => number = Math.random,
): BoxOpening | null {
  const spent = BOX_PRICES[count];
  if (coins < spent) return null;

  let nextCoins = coins - spent;
  const nextOwned = new Set(owned);
  const results: BoxResult[] = [];

  for (let i = 0; i < boxSize(count); i += 1) {
    const deck = rollDeck(random);
    const duplicate = nextOwned.has(deck.id);
    const refund = duplicate ? DUPE_COINS[deck.rarity] : 0;
    if (duplicate) nextCoins += refund;
    else nextOwned.add(deck.id);
    results.push({ deck, duplicate, refund });
  }

  return { coins: nextCoins, owned: [...nextOwned], results, spent };
}
