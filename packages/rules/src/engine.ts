import { captureOptions } from './captures';
import { cardValue, createDeck, type Card, type CardId } from './cards';
import { resolveRules, type RulesConfig } from './config';
import { seedRng, shuffle, type RngState } from './rng';
import { decideWinner, scoreRound } from './scoring';
import type {
  CutDecision,
  DealerDraw,
  GameEvent,
  GameState,
  MoveResult,
  PlayMove,
  PlayerCount,
  Seat,
  Team,
} from './types';

export const HAND_SIZE = 3;
export const TABLE_SIZE = 4;

export interface NewGameOptions {
  readonly seed: string | number;
  readonly playerCount?: PlayerCount;
  readonly rules?: Partial<RulesConfig>;
  /**
   * Seat that deals the first round (the seat after the dealer leads). When
   * omitted, everyone draws a card and the lowest card deals.
   */
  readonly dealer?: Seat;
}

export function teamOf(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function nextSeat(seat: Seat, playerCount: PlayerCount): Seat {
  return (seat + 1) % playerCount;
}

/** Creates a game, picks the first dealer (by drawing unless given) and starts the first round. */
export function createGame(options: NewGameOptions): { state: GameState; events: GameEvent[] } {
  const playerCount = options.playerCount ?? 4;
  const rules = resolveRules(options.rules);
  let state: GameState = {
    rules,
    playerCount,
    phase: 'playing',
    rng: seedRng(options.seed),
    round: 0,
    deal: 0,
    dealer: 0,
    turn: 0,
    stock: [],
    cutCard: null,
    table: [],
    hands: [],
    piles: [[], []],
    chkobbas: [0, 0],
    lastCapturer: null,
    scores: [0, 0],
    lastRound: null,
    winner: null,
  };

  const events: GameEvent[] = [];
  let dealer = options.dealer;
  if (dealer === undefined) {
    const drawn = drawForDealer(state.rng, playerCount, rules);
    state = { ...state, rng: drawn.rng };
    dealer = drawn.dealer;
    events.push({ type: 'dealerDrawn', draws: drawn.draws, dealer });
  }
  const started = startRound(state, dealer);
  return { state: started.state, events: events.concat(started.events) };
}

/**
 * Everyone draws a card; the lowest capture value deals. Players tied for
 * lowest draw again until one remains.
 */
export function drawForDealer(
  rng: RngState,
  playerCount: PlayerCount,
  rules: Pick<RulesConfig, 'faceValues'>,
): { dealer: Seat; draws: DealerDraw[][]; rng: RngState } {
  let candidates: Seat[] = Array.from({ length: playerCount }, (_, seat) => seat);
  const draws: DealerDraw[][] = [];
  let state = rng;
  for (;;) {
    let deck: Card[];
    [deck, state] = shuffle(createDeck(), state);
    const round = candidates.map((seat, i) => ({ seat, card: deck[i] as Card }));
    draws.push(round);
    const lowest = Math.min(...round.map((d) => cardValue(d.card, rules)));
    candidates = round.filter((d) => cardValue(d.card, rules) === lowest).map((d) => d.seat);
    if (candidates.length === 1) return { dealer: candidates[0] as Seat, draws, rng: state };
  }
}

/** After a round ends, rotates the deal and starts the next round. */
export function startNextRound(state: GameState): MoveResult {
  if (state.phase !== 'roundOver') return { ok: false, error: 'ROUND_NOT_OVER' };
  const { state: next, events } = startRound(state, nextSeat(state.dealer, state.playerCount));
  return { ok: true, state: next, events };
}

function needsRedeal(table: readonly Card[], rules: RulesConfig): boolean {
  if (rules.initialRedeal === 'none') return false;
  const counts: Record<string, number> = {};
  for (const c of table) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
  if (rules.initialRedeal === 'threeOrMoreKings') return (counts.K ?? 0) >= 3;
  for (const rank in counts) if ((counts[rank] as number) >= 3) return true;
  return false;
}

/** A new round: the dealer shuffles; then either the cut is offered or cards are dealt straight away. */
function startRound(state: GameState, dealer: Seat): { state: GameState; events: GameEvent[] } {
  const round = state.round + 1;
  const fresh: GameState = {
    ...state,
    round,
    deal: 1,
    dealer,
    turn: nextSeat(dealer, state.playerCount),
    stock: [],
    cutCard: null,
    table: [],
    hands: [],
    piles: [[], []],
    chkobbas: [0, 0],
    lastCapturer: null,
  };

  if (state.rules.cutCardChoice) {
    const cutting = offerCut(fresh);
    return {
      state: cutting,
      events: [
        { type: 'roundStarted', round, dealer, redeals: 0 },
        { type: 'cutOffered', round, seat: cutting.turn },
      ],
    };
  }

  // No cut: shuffle until the opening table is acceptable, then deal.
  let rng: RngState = fresh.rng;
  let deck: Card[];
  let redeals = -1;
  do {
    [deck, rng] = shuffle(createDeck(), rng);
    redeals++;
  } while (needsRedeal(deck.slice(0, TABLE_SIZE), state.rules));
  const { hands, stock } = dealHands(deck.slice(TABLE_SIZE), state.playerCount);
  return {
    state: { ...fresh, phase: 'playing', rng, stock, hands, table: deck.slice(0, TABLE_SIZE) },
    events: [
      { type: 'roundStarted', round, dealer, redeals },
      { type: 'handsDealt', round, deal: 1 },
    ],
  };
}

/** Shuffles a full deck and shows its top card to the cutter (the seat after the dealer). */
function offerCut(state: GameState): GameState {
  const [deck, rng] = shuffle(createDeck(), state.rng);
  return {
    ...state,
    phase: 'cutting',
    rng,
    turn: nextSeat(state.dealer, state.playerCount),
    cutCard: deck[0] as Card,
    stock: deck.slice(1),
    table: [],
    hands: [],
  };
}

/**
 * The cutter keeps the cut card (it joins their hand and they are dealt 2 more)
 * or throws it face up on the table (the table gets 3 more). If the opening
 * table then holds three of a kind, everything is reshuffled and cut again.
 */
export function applyCut(state: GameState, decision: CutDecision): MoveResult {
  if (state.phase !== 'cutting' || !state.cutCard) return { ok: false, error: 'NOT_CUTTING' };
  if (decision.seat !== state.turn) return { ok: false, error: 'NOT_YOUR_TURN' };

  const cut = state.cutCard;
  const cutter = decision.seat;
  let stock = state.stock.slice();
  const take = (n: number) => {
    const out = stock.slice(0, n);
    stock = stock.slice(n);
    return out;
  };

  const hands: Card[][] = [];
  for (let seat = 0; seat < state.playerCount; seat++) {
    hands.push(decision.keep && seat === cutter ? [cut, ...take(HAND_SIZE - 1)] : take(HAND_SIZE));
  }
  const table = decision.keep ? take(TABLE_SIZE) : [cut, ...take(TABLE_SIZE - 1)];

  const events: GameEvent[] = [{ type: 'cutResolved', seat: cutter, kept: decision.keep, card: decision.keep ? null : cut }];

  if (needsRedeal(table, state.rules)) {
    events.push({ type: 'redealt', round: state.round }, { type: 'cutOffered', round: state.round, seat: cutter });
    return { ok: true, state: offerCut(state), events };
  }

  events.push({ type: 'handsDealt', round: state.round, deal: 1 });
  return {
    ok: true,
    state: { ...state, phase: 'playing', cutCard: null, turn: cutter, stock, hands, table },
    events,
  };
}

function dealHands(stock: readonly Card[], playerCount: PlayerCount): { hands: Card[][]; stock: Card[] } {
  const hands: Card[][] = [];
  for (let seat = 0; seat < playerCount; seat++) {
    hands.push(stock.slice(seat * HAND_SIZE, (seat + 1) * HAND_SIZE));
  }
  return { hands, stock: stock.slice(playerCount * HAND_SIZE) };
}

/** Every legal move for the seat whose turn it is (empty when the game is not in play). */
export function legalMoves(state: GameState): PlayMove[] {
  if (state.phase !== 'playing') return [];
  const seat = state.turn;
  const hand = state.hands[seat] ?? [];
  const { rules } = state;

  const perCard = hand.map((card) => ({ card, options: captureOptions(card, state.table, rules) }));
  const anyCapture = perCard.some((p) => p.options.length > 0);

  const moves: PlayMove[] = [];
  for (const { card, options } of perCard) {
    for (const option of options) {
      moves.push({ seat, cardId: card.id, capture: option.map((c) => c.id) });
    }
    const mayPlace =
      rules.captureObligation === 'optional' ||
      (rules.captureObligation === 'playedCardMustCapture' && options.length === 0) ||
      (rules.captureObligation === 'mustCaptureIfAnyCardCan' && !anyCapture);
    if (mayPlace) moves.push({ seat, cardId: card.id, capture: [] });
  }
  return moves;
}

function sameCapture(a: readonly CardId[], b: readonly CardId[]): boolean {
  if (a.length !== b.length) return false;
  for (const id of a) if (b.indexOf(id) === -1) return false;
  return true;
}

/** True when this play is the final card of the round: the stock is empty and every other hand is empty. */
function isLastPlayOfRound(state: GameState): boolean {
  if (state.stock.length > 0) return false;
  let remaining = 0;
  for (const hand of state.hands) remaining += hand.length;
  return remaining === 1;
}

/** Validates and applies a play. The input state is never mutated. */
export function applyMove(state: GameState, move: PlayMove): MoveResult {
  if (state.phase !== 'playing') return { ok: false, error: 'GAME_NOT_IN_PROGRESS' };
  if (move.seat !== state.turn) return { ok: false, error: 'NOT_YOUR_TURN' };
  const hand = state.hands[move.seat] ?? [];
  const card = hand.find((c) => c.id === move.cardId);
  if (!card) return { ok: false, error: 'CARD_NOT_IN_HAND' };
  const legal = legalMoves(state).some(
    (m) => m.cardId === move.cardId && sameCapture(m.capture, move.capture),
  );
  if (!legal) return { ok: false, error: 'ILLEGAL_CAPTURE' };

  const team = teamOf(move.seat);
  const lastPlay = isLastPlayOfRound(state);
  const captured = state.table.filter((c) => move.capture.indexOf(c.id) !== -1);
  const hands = state.hands.map((h, seat) => (seat === move.seat ? h.filter((c) => c.id !== card.id) : h));

  let table: readonly Card[];
  let piles = state.piles;
  let chkobbas = state.chkobbas;
  let lastCapturer = state.lastCapturer;
  let chkobba = false;

  if (captured.length > 0) {
    table = state.table.filter((c) => move.capture.indexOf(c.id) === -1);
    piles = withTeam(piles, team, piles[team].concat([card], captured));
    lastCapturer = move.seat;
    chkobba = table.length === 0 && (!lastPlay || state.rules.lastCardChkobba);
    if (chkobba) chkobbas = withTeam(chkobbas, team, chkobbas[team] + 1);
  } else {
    table = state.table.concat([card]);
  }

  const events: GameEvent[] = [{ type: 'cardPlayed', seat: move.seat, card, captured, chkobba }];
  const played: GameState = { ...state, hands, table, piles, chkobbas, lastCapturer };

  if (hands.some((h) => h.length > 0)) {
    return { ok: true, state: { ...played, turn: nextSeat(move.seat, state.playerCount) }, events };
  }
  if (played.stock.length > 0) {
    const dealt = dealHands(played.stock, played.playerCount);
    const deal = played.deal + 1;
    events.push({ type: 'handsDealt', round: played.round, deal });
    return {
      ok: true,
      state: { ...played, ...dealt, deal, turn: nextSeat(played.dealer, played.playerCount) },
      events,
    };
  }
  return { ok: true, state: endRound(played, events), events };
}

function withTeam<T>(pair: readonly [T, T], team: Team, value: T): [T, T] {
  return team === 0 ? [value, pair[1]] : [pair[0], value];
}

/** Gives leftover table cards to the last capturer, scores the round and checks for a winner. */
function endRound(state: GameState, events: GameEvent[]): GameState {
  let piles = state.piles;
  if (state.table.length > 0 && state.lastCapturer !== null) {
    const team = teamOf(state.lastCapturer);
    piles = withTeam(piles, team, piles[team].concat(state.table));
    events.push({ type: 'tableCollected', team, cards: state.table });
  }

  const result = scoreRound(state.round, piles, state.chkobbas);
  const scores: [number, number] = [
    state.scores[0] + result.teams[0].total,
    state.scores[1] + result.teams[1].total,
  ];
  events.push({ type: 'roundEnded', result, scores });

  const winner = decideWinner(scores, result, state.rules);
  if (winner !== null) events.push({ type: 'gameEnded', winner, scores });

  return {
    ...state,
    table: [],
    piles,
    scores,
    lastRound: result,
    winner,
    phase: winner === null ? 'roundOver' : 'gameOver',
  };
}
