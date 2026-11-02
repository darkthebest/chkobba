import {
  applyCut,
  applyMove,
  chooseCut,
  createGame,
  createHeuristicBot,
  parseCard,
  viewFor,
  type Bot,
  type Card,
  type GameEvent,
  type GameState,
  type NewGameOptions,
  type RulesConfig,
} from '../src';

export function cards(...ids: string[]): Card[] {
  return ids.map(parseCard);
}

/** Builds a mid-round state with exact hands/table/stock for scenario tests. */
export function scenario(opts: {
  hands: string[][];
  table?: string[];
  stock?: string[];
  turn?: number;
  dealer?: number;
  rules?: Partial<RulesConfig>;
  piles?: [string[], string[]];
  lastCapturer?: number | null;
}): GameState {
  const playerCount = opts.hands.length as 2 | 4;
  const dealer = opts.dealer ?? playerCount - 1;
  const { state } = createGame({ seed: 'scenario', playerCount, dealer, rules: opts.rules });
  return {
    ...state,
    phase: 'playing',
    cutCard: null,
    dealer,
    turn: opts.turn ?? (dealer + 1) % playerCount,
    hands: opts.hands.map((h) => cards(...h)),
    table: cards(...(opts.table ?? [])),
    stock: cards(...(opts.stock ?? [])),
    piles: opts.piles ? [cards(...opts.piles[0]), cards(...opts.piles[1])] : [[], []],
    lastCapturer: opts.lastCapturer ?? null,
  };
}

export function ids(list: readonly Card[]): string[] {
  return list.map((c) => c.id);
}

const defaultBot = createHeuristicBot();

/**
 * Advances one action with the seat's bot: a cut decision while cutting,
 * otherwise a card play. Throws on any illegal action.
 */
export function botStep(state: GameState, bots: readonly Bot[]): { state: GameState; events: readonly GameEvent[] } {
  const bot = bots[state.turn] ?? defaultBot;
  const view = viewFor(state, state.turn);
  const result =
    state.phase === 'cutting'
      ? applyCut(state, { seat: state.turn, keep: chooseCut(bot, view) })
      : applyMove(state, bot.chooseMove(view));
  if (!result.ok) throw new Error(`bot made an illegal ${state.phase} action: ${result.error}`);
  return result;
}

/** Resolves pending cuts (including any redeal re-cuts) so the round is in play. */
export function resolveCuts(state: GameState, collect: GameEvent[] = []): GameState {
  let s = state;
  while (s.phase === 'cutting') {
    const step = botStep(s, []);
    collect.push(...step.events);
    s = step.state;
  }
  return s;
}

/** A game whose first round is already dealt and in play. */
export function startedGame(options: NewGameOptions): { state: GameState; events: GameEvent[] } {
  const { state, events } = createGame(options);
  const all = [...events];
  return { state: resolveCuts(state, all), events: all };
}
