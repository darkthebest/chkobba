import { describe, expect, it } from 'vitest';
import { chooseCut, createGame, createHeuristicBot, keepCutCard, parseCard, viewFor } from '../src';
import { scenario } from './helpers';

const bot = createHeuristicBot();

describe('heuristicBot', () => {
  it('takes a chkobba when one is available', () => {
    const state = scenario({ hands: [['5D', 'KS', '2H'], ['AH'], ['3H'], ['4H']], table: ['3S', '2C'] });
    expect(bot.chooseMove(viewFor(state, 0))).toMatchObject({ cardId: '5D', capture: ['3S', '2C'] });
  });

  it('banks the 7aya by capturing with it', () => {
    const state = scenario({ hands: [['7D', 'KS', '2H'], ['AH'], ['3H'], ['4H']], table: ['KH', '3S', '4C'] });
    expect(bot.chooseMove(viewFor(state, 0))).toMatchObject({ cardId: '7D', capture: ['3S', '4C'] });
  });

  it('grabs the 7aya from the table over a plain capture', () => {
    const state = scenario({ hands: [['7S', 'QS', '2H'], ['AH'], ['3H'], ['4H']], table: ['7D', 'QH', 'KC'] });
    expect(bot.chooseMove(viewFor(state, 0))).toMatchObject({ cardId: '7S', capture: ['7D'] });
  });

  it('avoids leaving a sweepable table when it has to place a card', () => {
    // 2H would leave [3C, 2H] (sum 5, sweepable); JS leaves [3C, JS] (sum 12, safe).
    const state = scenario({ hands: [['2H', 'JS'], ['AH'], ['3H'], ['4H']], table: ['3C'] });
    expect(bot.chooseMove(viewFor(state, 0)).cardId).toBe('JS');
  });

  it('always returns a legal move', () => {
    const state = scenario({ hands: [['AS', '2S', '3S'], ['AH'], ['3H'], ['4H']], table: [] });
    const view = viewFor(state, 0);
    expect(view.legalMoves).toContainEqual(bot.chooseMove(view));
  });
});

describe('cut decision', () => {
  it('keeps sevens, sixes and diamonds and throws the rest', () => {
    expect(['7S', '6C', '2D', 'KD'].map((id) => keepCutCard(parseCard(id)))).toEqual([true, true, true, true]);
    expect(['KS', 'AH', '4C', 'QS'].map((id) => keepCutCard(parseCard(id)))).toEqual([false, false, false, false]);
  });

  it('lets a bot override the default cut rule', () => {
    const state = createGame({ seed: 'cut', dealer: 3 }).state;
    const view = viewFor(state, 0);
    expect(chooseCut(bot, view)).toBe(keepCutCard(state.cutCard!));
    expect(chooseCut({ ...bot, chooseCut: () => false }, view)).toBe(false);
  });
});
