import { describe, expect, it } from 'vitest';
import {
  createBot,
  createGame,
  createHeuristicBot,
  createMonteCarloBot,
  createRandom,
  sampleWorld,
  startNextRound,
  unseenCards,
  viewFor,
  type Bot,
  type GameState,
} from '../src';
import { botStep, ids, scenario, startedGame } from './helpers';

/** Plays to the end and returns the winning team. Levels alternate teams by game to cancel seat bias. */
function playGame(seed: number, bots: Bot[], target = 11): GameState {
  let { state } = createGame({ seed, playerCount: 4, rules: { targetScore: target } });
  for (;;) {
    while (state.phase === 'playing' || state.phase === 'cutting') state = botStep(state, bots).state;
    if (state.phase === 'gameOver') return state;
    const next = startNextRound(state);
    if (!next.ok) throw new Error(next.error);
    state = next.state;
  }
}

describe('sampling hidden information', () => {
  it('counts exactly the cards the seat cannot see', () => {
    const { state } = startedGame({ seed: 'unseen' });
    const view = viewFor(state, 0);
    // 40 - own hand (3) - table (4) = 33 cards: 9 in other hands + 24 in stock.
    expect(unseenCards(view)).toHaveLength(33);
  });

  it('treats captured cards as known', () => {
    const state = scenario({
      hands: [['AS'], ['2S'], ['3S'], ['4S']],
      table: ['5S'],
      piles: [['7D', '6D'], ['KH']],
    });
    const unseen = ids(unseenCards(viewFor(state, 0)));
    expect(unseen).not.toContain('7D');
    expect(unseen).not.toContain('KH');
    expect(unseen).toHaveLength(40 - 1 - 1 - 3);
  });

  it('samples a full, consistent world that keeps the seat’s own hand', () => {
    const { state } = startedGame({ seed: 'world' });
    const view = viewFor(state, 0);
    const world = sampleWorld(view, createRandom(1));
    expect(world.hands[0]).toEqual(state.hands[0]);
    expect(world.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(world.stock).toHaveLength(24);
    const all = [...world.stock, ...world.table, ...world.hands.flat(), ...world.piles.flat()].map((c) => c.id);
    expect(new Set(all).size).toBe(40);
  });
});

describe('monteCarloBot', () => {
  const bot = createMonteCarloBot({ worlds: 16 });

  it('returns a legal move and is deterministic for the same view', () => {
    const { state } = startedGame({ seed: 'mc' });
    const view = viewFor(state, state.turn);
    const move = bot.chooseMove(view);
    expect(view.legalMoves).toContainEqual(move);
    expect(createMonteCarloBot({ worlds: 16 }).chooseMove(view)).toEqual(move);
  });

  it('takes a chkobba when one is available', () => {
    const state = scenario({
      hands: [['5D', 'KS', '2H'], ['AH', '6C', '3H'], ['3C', '4C', 'QC'], ['4H', 'JH', '7S']],
      table: ['3S', '2C'],
      stock: ['AD', '2D', '3D', '4D', '6D', '7D', 'QD', 'JD', 'KD', 'AC', '5C', '6S'],
    });
    expect(bot.chooseMove(viewFor(state, 0))).toMatchObject({ cardId: '5D', capture: ['3S', '2C'] });
  });

  it('beats the heuristic bot more often than not', () => {
    let wins = 0;
    const games = 16;
    for (let g = 0; g < games; g++) {
      const hardTeam = g % 2;
      const bots = [0, 1, 2, 3].map((s) => (s % 2 === hardTeam ? createMonteCarloBot({ worlds: 24 }) : createHeuristicBot()));
      if (playGame(300 + g, bots).winner === hardTeam) wins++;
    }
    expect(wins).toBeGreaterThan(games / 2);
  }, 60_000);
});

describe('bot levels', () => {
  it.each(['easy', 'normal', 'hard'] as const)('%s bots finish a game with legal moves', (level) => {
    const bots = [0, 1, 2, 3].map((s) => createBot(level, s));
    const end = playGame(42, bots);
    expect(end.phase).toBe('gameOver');
  });

  it('normal beats easy more often than not', () => {
    let wins = 0;
    const games = 20;
    for (let g = 0; g < games; g++) {
      const normalTeam = g % 2;
      const bots = [0, 1, 2, 3].map((s) => createBot(s % 2 === normalTeam ? 'normal' : 'easy', `${g}-${s}`));
      if (playGame(600 + g, bots).winner === normalTeam) wins++;
    }
    expect(wins).toBeGreaterThan(games / 2);
  });
});
