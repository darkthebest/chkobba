import { describe, expect, it } from 'vitest';
import { captureOptions, cardValue, createDeck, DEFAULT_RULES, parseCard } from '../src';
import { cards, ids } from './helpers';

const options = (played: string, table: string[], rules = DEFAULT_RULES) =>
  captureOptions(parseCard(played), cards(...table), rules).map(ids);

describe('deck and values', () => {
  it('has 40 unique cards without 8s, 9s and 10s', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map((c) => c.id)).size).toBe(40);
  });

  it('values Queen 8, Jack 9, King 10 by default', () => {
    expect(cardValue(parseCard('QS'), DEFAULT_RULES)).toBe(8);
    expect(cardValue(parseCard('JS'), DEFAULT_RULES)).toBe(9);
    expect(cardValue(parseCard('KS'), DEFAULT_RULES)).toBe(10);
    expect(cardValue(parseCard('AS'), DEFAULT_RULES)).toBe(1);
  });

  it('supports the Jack 8 / Queen 9 variant', () => {
    const rules = { ...DEFAULT_RULES, faceValues: 'J8_Q9_K10' as const };
    expect(cardValue(parseCard('JS'), rules)).toBe(8);
    expect(cardValue(parseCard('QS'), rules)).toBe(9);
  });

  it('rejects malformed card ids', () => {
    expect(() => parseCard('8D')).toThrow();
    expect(() => parseCard('7X')).toThrow();
  });
});

describe('captureOptions', () => {
  it('forces a same-rank capture over sums (rank priority)', () => {
    // Q (8) could take 7+A, but a Queen on the table must be taken instead.
    expect(options('QD', ['QS', '7H', 'AC'])).toEqual([['QS']]);
  });

  it('lets the player choose between several same-rank cards', () => {
    expect(options('5D', ['5S', '2H', '5C'])).toEqual([['5S'], ['5C']]);
  });

  it('finds every sum combination of two or more table cards', () => {
    expect(options('KD', ['6S', '4H', '3C', '7S'])).toEqual([
      ['6S', '4H'],
      ['3C', '7S'],
    ]);
  });

  it('finds sums of three or more cards', () => {
    expect(options('7D', ['AS', '2H', '4C', '3S'])).toEqual([
      ['AS', '2H', '4C'],
      ['4C', '3S'],
    ]);
  });

  it('returns nothing when no capture is possible', () => {
    expect(options('2D', ['5S', '6H'])).toEqual([]);
    expect(options('2D', [])).toEqual([]);
  });

  it('offers both singles and sums when rank priority is off', () => {
    const rules = { ...DEFAULT_RULES, rankPriority: false };
    expect(options('QD', ['QS', '7H', 'AC'], rules)).toEqual([['QS'], ['7H', 'AC']]);
  });

  it('uses face values in sums', () => {
    // King (10) = Queen (8) + 2
    expect(options('KD', ['QS', '2H'])).toEqual([['QS', '2H']]);
  });
});
