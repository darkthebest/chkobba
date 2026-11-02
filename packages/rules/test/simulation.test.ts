import { describe, expect, it } from 'vitest';
import {
  createGame,
  createHeuristicBot,
  createRandom,
  createRandomBot,
  startNextRound,
  type Bot,
  type GameState,
  type PlayerCount,
  type Team,
} from '../src';
import { botStep } from './helpers';

const MAX_ROUNDS = 60;

function cardsInPlay(state: GameState): number {
  return (
    (state.cutCard ? 1 : 0) +
    state.stock.length +
    state.table.length +
    state.hands.reduce((n, h) => n + h.length, 0) +
    state.piles[0].length +
    state.piles[1].length
  );
}

/** Plays a full game with one bot per seat, asserting invariants along the way. */
function playGame(seed: number, playerCount: PlayerCount, bots: Bot[]): GameState {
  let { state } = createGame({ seed, playerCount });
  for (let rounds = 0; rounds < MAX_ROUNDS; rounds++) {
    while (state.phase === 'playing' || state.phase === 'cutting') {
      expect(cardsInPlay(state)).toBe(40);
      state = botStep(state, bots).state;
    }
    const round = state.lastRound;
    expect(round).not.toBeNull();
    for (const team of round!.teams) {
      expect(team.points.karta + team.points.dineri + team.points.bermila + team.points.haya).toBeLessThanOrEqual(4);
    }
    // At most one team scores each category.
    const t = round!.teams;
    expect(t[0].points.haya + t[1].points.haya).toBe(1);
    expect(t[0].points.karta + t[1].points.karta).toBeLessThanOrEqual(1);
    expect(t[0].cards + t[1].cards).toBeLessThanOrEqual(40);

    if (state.phase === 'gameOver') return state;
    const next = startNextRound(state);
    if (!next.ok) throw new Error(next.error);
    state = next.state;
  }
  throw new Error(`seed ${seed}: game did not finish in ${MAX_ROUNDS} rounds`);
}

describe('full-game simulation', () => {
  it.each([4, 2] as const)('plays %i-player games to completion with valid scores', (playerCount) => {
    for (let seed = 0; seed < 60; seed++) {
      const random = createRandom(seed);
      const bots = Array.from({ length: playerCount }, (_, i) =>
        i % 2 === 0 ? createHeuristicBot() : createRandomBot(random),
      );
      const end = playGame(seed, playerCount, bots);
      const winner = end.winner as Team;
      expect(end.scores[winner]).toBeGreaterThanOrEqual(end.rules.targetScore);
      expect(end.scores[winner]).toBeGreaterThan(end.scores[winner === 0 ? 1 : 0]);
    }
  });

  it('heuristic bots beat random bots most of the time', () => {
    let wins = 0;
    const games = 80;
    for (let seed = 0; seed < games; seed++) {
      const random = createRandom(`r${seed}`);
      const heuristic = createHeuristicBot();
      const rnd = createRandomBot(random);
      const end = playGame(1000 + seed, 4, [heuristic, rnd, heuristic, rnd]);
      if (end.winner === 0) wins++;
    }
    expect(wins / games).toBeGreaterThan(0.75);
  });

  it('replays identically from the same seed', () => {
    const run = () => {
      const random = createRandom('replay');
      return playGame(42, 4, [createHeuristicBot(), createRandomBot(random), createHeuristicBot(), createRandomBot(random)]);
    };
    expect(run()).toEqual(run());
  });
});
