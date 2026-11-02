import { describe, expect, it } from 'vitest';
import { createDeck, decideWinner, DEFAULT_RULES, scoreRound, type Card } from '../src';
import { cards } from './helpers';

function splitDeck(team0Ids: string[]): [Card[], Card[]] {
  const deck = createDeck();
  return [
    deck.filter((c) => team0Ids.includes(c.id)),
    deck.filter((c) => !team0Ids.includes(c.id)),
  ];
}

describe('scoreRound', () => {
  it('awards karta, dineri, bermila and 7aya', () => {
    // Team 0: 21 cards including 6 diamonds (with 7D), three 7s.
    const team0 = [
      ...['AD', '2D', '3D', '4D', '5D', '7D'],
      ...['7S', '7H'],
      ...['AS', '2S', '3S', '4S', '5S', '6S', 'QS', 'JS', 'KS'],
      ...['AH', '2H', '3H', '4H'],
    ];
    const result = scoreRound(1, splitDeck(team0), [1, 0]);
    expect(result.teams[0].cards).toBe(21);
    expect(result.teams[0].points).toEqual({ karta: 1, dineri: 1, bermila: 1, haya: 1, chkobba: 1 });
    expect(result.teams[0].total).toBe(5);
    expect(result.teams[1].total).toBe(0);
  });

  it('gives nothing for tied categories (beji)', () => {
    // 20-20 cards, 5-5 diamonds, 2-2 sevens and 2-2 sixes.
    const team0 = [
      ...['AD', '2D', '3D', '6D', '7D'],
      ...['7S', '6S'],
      ...['AS', '2S', '3S', '4S', '5S', 'QS', 'JS', 'KS'],
      ...['AH', '2H', '3H', '4H', '5H'],
    ];
    const result = scoreRound(1, splitDeck(team0), [0, 0]);
    expect(result.teams[0].cards).toBe(20);
    for (const team of result.teams) {
      expect(team.points.karta).toBe(0);
      expect(team.points.dineri).toBe(0);
      expect(team.points.bermila).toBe(0);
    }
    expect(result.teams[0].points.haya).toBe(1);
  });

  it('breaks a sevens tie on sixes for bermila', () => {
    const team0 = ['7D', '7S', '6D', '6S', '6H'];
    const result = scoreRound(1, splitDeck(team0), [0, 0]);
    expect(result.teams[0].sevens).toBe(2);
    expect(result.teams[1].sevens).toBe(2);
    expect(result.teams[0].points.bermila).toBe(1);
  });

  it('flags a team that captured all ten diamonds', () => {
    const team0 = ['AD', '2D', '3D', '4D', '5D', '6D', '7D', 'QD', 'JD', 'KD'];
    expect(scoreRound(1, splitDeck(team0), [0, 0]).allDineri).toBe(0);
  });

  it('handles partial piles (leftover cards with no capturer)', () => {
    const result = scoreRound(1, [cards('AS'), []], [0, 0]);
    expect(result.teams[0].points.karta).toBe(1);
  });
});

describe('decideWinner', () => {
  const result = scoreRound(1, [[], []], [0, 0]);

  it('keeps playing below the target', () => {
    expect(decideWinner([20, 18], result, DEFAULT_RULES)).toBeNull();
  });

  it('declares the team that reaches the target', () => {
    expect(decideWinner([21, 18], result, DEFAULT_RULES)).toBe(0);
  });

  it('gives the win to the higher total when both pass the target', () => {
    expect(decideWinner([22, 24], result, DEFAULT_RULES)).toBe(1);
  });

  it('plays another round when both pass the target level', () => {
    expect(decideWinner([22, 22], result, DEFAULT_RULES)).toBeNull();
  });

  it('requires a two-point lead when winByTwo is on', () => {
    const rules = { ...DEFAULT_RULES, winByTwo: true };
    expect(decideWinner([21, 20], result, rules)).toBeNull();
    expect(decideWinner([22, 20], result, rules)).toBe(0);
  });

  it('ends the game on all ten diamonds when enabled', () => {
    const allDineri = { ...result, allDineri: 1 as const };
    expect(decideWinner([3, 2], allDineri, DEFAULT_RULES)).toBeNull();
    expect(decideWinner([3, 2], allDineri, { ...DEFAULT_RULES, instantWinAllDineri: true })).toBe(1);
  });
});
