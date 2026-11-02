import {
  BOX_PRICES,
  DUPE_COINS,
  MATCH_WIN_COINS,
  STARTING_COINS,
  boxSize,
  openBoxes,
  rollDeck,
} from '../economy';
import { DECKS } from '../themes';

const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

const commonPool = DECKS.filter((deck) => deck.rarity === 'common');
const rarePool = DECKS.filter((deck) => deck.rarity === 'rare');
const epicPool = DECKS.filter((deck) => deck.rarity === 'epic');
const mythicPool = DECKS.filter((deck) => deck.rarity === 'mythic');

describe('deck economy', () => {
  it('starts with a real balance and pays a fixed match reward', () => {
    expect(STARTING_COINS).toBe(500);
    expect(MATCH_WIN_COINS).toBe(25);
    expect(BOX_PRICES).toEqual({ one: 100, five: 450 });
    expect(DUPE_COINS).toEqual({ common: 10, rare: 40, epic: 150, mythic: 500 });
    expect(boxSize('one')).toBe(1);
    expect(boxSize('five')).toBe(5);
  });

  it('maps rolls to every rarity band at the edges', () => {
    expect(rollDeck(sequence(0, 0)).rarity).toBe('common');
    expect(rollDeck(sequence(0.649, 0)).rarity).toBe('common');
    expect(rollDeck(sequence(0.65, 0)).rarity).toBe('rare');
    expect(rollDeck(sequence(0.849, 0)).rarity).toBe('rare');
    expect(rollDeck(sequence(0.85, 0)).rarity).toBe('epic');
    expect(rollDeck(sequence(0.949, 0)).rarity).toBe('epic');
    expect(rollDeck(sequence(0.95, 0)).rarity).toBe('mythic');
    expect(rollDeck(sequence(0.999, 0.99)).rarity).toBe('mythic');
  });

  it('picks a deck from the rolled rarity pool', () => {
    expect(rollDeck(sequence(0, 0))).toBe(commonPool[0]);
    expect(rollDeck(sequence(0.65, 0))).toBe(rarePool[0]);
    expect(rollDeck(sequence(0.85, 0))).toBe(epicPool[0]);
    expect(rollDeck(sequence(0.95, 0))).toBe(mythicPool[0]);
  });

  it('charges for one box and unlocks a deck', () => {
    const target = commonPool[0];
    const opening = openBoxes(STARTING_COINS, [], 'one', sequence(0, 0));
    expect(opening).not.toBeNull();
    expect(opening?.spent).toBe(100);
    expect(opening?.coins).toBe(400);
    expect(opening?.owned).toEqual([target.id]);
    expect(opening?.results).toEqual([{ deck: target, duplicate: false, refund: 0 }]);
  });

  it('rejects a box that costs more than the balance', () => {
    expect(openBoxes(99, [], 'one', sequence(0, 0))).toBeNull();
    expect(openBoxes(449, [], 'five', sequence(0, 0))).toBeNull();
  });

  it('refunds duplicates instead of unlocking the same deck twice', () => {
    const target = commonPool[0];
    const opening = openBoxes(500, [target.id], 'one', sequence(0, 0));
    expect(opening?.coins).toBe(500 - 100 + DUPE_COINS.common);
    expect(opening?.owned).toEqual([target.id]);
    expect(opening?.results[0]).toEqual({ deck: target, duplicate: true, refund: 10 });
  });

  it('opens five boxes at once, refunding any duplicates among them', () => {
    const target = commonPool[0];
    const opening = openBoxes(500, [], 'five', sequence(0.1, 0, 0.1, 0.2, 0.1, 0.4, 0.1, 0.6, 0.1, 0.8));
    expect(opening?.spent).toBe(450);
    expect(opening?.owned).toHaveLength(5);
    expect(opening?.coins).toBe(50);
    expect(opening?.results.every((result) => !result.duplicate)).toBe(true);

    const withDuplicates = openBoxes(1000, [], 'five', sequence(0, 0, 0, 0, 0, 0, 0, 0, 0, 0));
    expect(withDuplicates?.owned).toEqual([target.id]);
    expect(withDuplicates?.coins).toBe(1000 - 450 + DUPE_COINS.common * 4);
    expect(withDuplicates?.results.filter((result) => result.duplicate)).toHaveLength(4);
  });

  it('keeps premium duplicate refunds worth more than cheap box rolls', () => {
    const mythic = mythicPool[0];
    const opening = openBoxes(1000, [mythic.id], 'five', sequence(0.95, 0));
    expect(opening?.owned).toEqual([mythic.id]);
    expect(opening?.coins).toBe(1000 - 450 + DUPE_COINS.mythic * 5);
  });

  it('never returns an owned list with duplicates', () => {
    const opening = openBoxes(5000, DECKS.map((deck) => deck.id), 'five', sequence(0, 0));
    expect(new Set(opening?.owned).size).toBe(DECKS.length);
    expect(opening?.owned).toHaveLength(DECKS.length);
  });
});
