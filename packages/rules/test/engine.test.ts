import { describe, expect, it } from 'vitest';
import {
  applyCut,
  applyMove,
  cardValue,
  createGame,
  legalMoves,
  startNextRound,
  viewFor,
  type GameState,
  type MoveResult,
  type PlayMove,
} from '../src';
import { ids, scenario, startedGame } from './helpers';

function ok(result: MoveResult): Extract<MoveResult, { ok: true }> {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

const play = (seat: number, cardId: string, capture: string[] = []): PlayMove =>
  ({ seat, cardId, capture }) as PlayMove;

describe('createGame', () => {
  it('deals 4 to the table and 3 to each of 4 players once the cut is resolved', () => {
    const { state } = startedGame({ seed: 1 });
    expect(state.phase).toBe('playing');
    expect(state.table).toHaveLength(4);
    expect(state.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(state.stock).toHaveLength(24);
    expect(state.round).toBe(1);
  });

  it('deals a 2-player game', () => {
    const { state } = startedGame({ seed: 1, playerCount: 2 });
    expect(state.hands.map((h) => h.length)).toEqual([3, 3]);
    expect(state.stock).toHaveLength(30);
  });

  it('deals straight away when the cut rule is off', () => {
    const { state, events } = createGame({ seed: 1, dealer: 3, rules: { cutCardChoice: false } });
    expect(state.phase).toBe('playing');
    expect(state.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(events.map((e) => e.type)).toEqual(['roundStarted', 'handsDealt']);
  });

  it('lets the seat after the dealer cut and lead', () => {
    expect(createGame({ seed: 1, dealer: 3 }).state.turn).toBe(0);
    expect(createGame({ seed: 1, dealer: 1 }).state.turn).toBe(2);
    expect(startedGame({ seed: 1, dealer: 1 }).state.turn).toBe(2);
  });

  it('is deterministic for a given seed', () => {
    const a = startedGame({ seed: 'abc' }).state;
    const b = startedGame({ seed: 'abc' }).state;
    const c = startedGame({ seed: 'abd' }).state;
    expect(a).toEqual(b);
    expect(ids(a.table)).not.toEqual(ids(c.table));
  });

  it('never opens with three of a kind on the table, redealing when needed', () => {
    for (const cutCardChoice of [true, false]) {
      let sawRedeal = false;
      for (let seed = 0; seed < 400; seed++) {
        const { state, events } = startedGame({ seed, dealer: 3, rules: { cutCardChoice } });
        const counts: Record<string, number> = {};
        for (const c of state.table) counts[c.rank] = (counts[c.rank] ?? 0) + 1;
        expect(Math.max(...Object.values(counts))).toBeLessThan(3);
        for (const e of events) {
          if (e.type === 'redealt' || (e.type === 'roundStarted' && e.redeals > 0)) sawRedeal = true;
        }
      }
      expect(sawRedeal).toBe(true);
    }
  });
});

describe('drawing for the first dealer', () => {
  it('gives the deal to the lowest card, redrawing ties among the lowest', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { state, events } = createGame({ seed });
      const drawn = events[0];
      if (drawn?.type !== 'dealerDrawn') throw new Error('expected a dealer draw first');
      expect(state.dealer).toBe(drawn.dealer);
      const last = drawn.draws[drawn.draws.length - 1]!;
      const values = last.map((d) => cardValue(d.card, state.rules));
      const lowest = Math.min(...values);
      expect(values.filter((v) => v === lowest)).toHaveLength(1);
      expect(last.find((d) => cardValue(d.card, state.rules) === lowest)!.seat).toBe(drawn.dealer);
      // Every redraw only involves the players tied for lowest in the previous draw.
      for (let i = 1; i < drawn.draws.length; i++) {
        const prev = drawn.draws[i - 1]!;
        const prevLowest = Math.min(...prev.map((d) => cardValue(d.card, state.rules)));
        const tied = prev.filter((d) => cardValue(d.card, state.rules) === prevLowest).map((d) => d.seat);
        expect(drawn.draws[i]!.map((d) => d.seat)).toEqual(tied);
      }
    }
  });

  it('skips the draw when the dealer is given', () => {
    const { events } = createGame({ seed: 1, dealer: 2 });
    expect(events.some((e) => e.type === 'dealerDrawn')).toBe(false);
  });
});

describe('the cut', () => {
  const cutting = () => createGame({ seed: 'cut', dealer: 3 }).state;

  it('shows the cut card only to the cutter', () => {
    const state = cutting();
    expect(state.phase).toBe('cutting');
    expect(viewFor(state, 0).cut).toEqual({ seat: 0, card: state.cutCard });
    expect(viewFor(state, 1).cut).toEqual({ seat: 0, card: null });
    expect(JSON.stringify(viewFor(state, 1))).not.toContain(JSON.stringify(state.cutCard));
    expect(viewFor(state, 0).legalMoves).toEqual([]);
  });

  it('keeping puts the cut card in the cutter’s hand with two more', () => {
    const state = cutting();
    const cut = state.cutCard!;
    const { state: next, events } = ok(applyCut(state, { seat: 0, keep: true }));
    expect(next.phase).toBe('playing');
    expect(next.hands[0]).toHaveLength(3);
    expect(ids(next.hands[0]!)).toContain(cut.id);
    expect(next.table).toHaveLength(4);
    expect(ids(next.table)).not.toContain(cut.id);
    expect(next.turn).toBe(0);
    // A kept card is never revealed in the public events.
    expect(events[0]).toEqual({ type: 'cutResolved', seat: 0, kept: true, card: null });
  });

  it('throwing puts the cut card face up on the table with three more', () => {
    const state = cutting();
    const cut = state.cutCard!;
    const { state: next, events } = ok(applyCut(state, { seat: 0, keep: false }));
    expect(ids(next.table)).toContain(cut.id);
    expect(next.table).toHaveLength(4);
    expect(next.hands.flat().map((c) => c.id)).not.toContain(cut.id);
    expect(next.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(events[0]).toEqual({ type: 'cutResolved', seat: 0, kept: false, card: cut });
  });

  it('only the cutter may cut, and only while cutting', () => {
    const state = cutting();
    expect(applyCut(state, { seat: 1, keep: true })).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    const played = ok(applyCut(state, { seat: 0, keep: true })).state;
    expect(applyCut(played, { seat: 0, keep: true })).toEqual({ ok: false, error: 'NOT_CUTTING' });
    expect(applyMove(state, { seat: 0, cardId: 'AS', capture: [] })).toEqual({ ok: false, error: 'GAME_NOT_IN_PROGRESS' });
  });

  it('starts every round with a cut by the seat after the new dealer', () => {
    const state: GameState = { ...startedGame({ seed: 4, dealer: 3 }).state, phase: 'roundOver' };
    const { state: next, events } = ok(startNextRound(state));
    expect(next.phase).toBe('cutting');
    expect(next.dealer).toBe(0);
    expect(next.turn).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['roundStarted', 'cutOffered']);
  });
});

describe('legalMoves', () => {
  const state = scenario({ hands: [['QD', '2S', 'KH'], [], [], []], table: ['QS', '5H', '5C'] });

  it('forces the played card to capture when it can (default)', () => {
    const moves = legalMoves(state).map((m) => `${m.cardId}:${m.capture.join('+')}`);
    // QD must take QS; 2S cannot capture so it is placed; KH (10) must take 5H+5C.
    expect(moves).toEqual(['QD:QS', '2S:', 'KH:5H+5C']);
  });

  it('forces a capture when any card can, in mustCaptureIfAnyCardCan mode', () => {
    const s = { ...state, rules: { ...state.rules, captureObligation: 'mustCaptureIfAnyCardCan' as const } };
    expect(legalMoves(s).every((m) => m.capture.length > 0)).toBe(true);
  });

  it('allows placing any card in optional mode', () => {
    const s = { ...state, rules: { ...state.rules, captureObligation: 'optional' as const } };
    expect(legalMoves(s).filter((m) => m.capture.length === 0)).toHaveLength(3);
  });

  it('is empty when the round is over', () => {
    expect(legalMoves({ ...state, phase: 'roundOver' })).toEqual([]);
  });
});

describe('applyMove', () => {
  it('rejects plays out of turn, unknown cards and illegal captures', () => {
    const state = scenario({ hands: [['QD', '2S'], ['AH'], ['3H'], ['4H']], table: ['QS', '5H'] });
    expect(applyMove(state, play(1, 'AH'))).toEqual({ ok: false, error: 'NOT_YOUR_TURN' });
    expect(applyMove(state, play(0, 'KD'))).toEqual({ ok: false, error: 'CARD_NOT_IN_HAND' });
    expect(applyMove(state, play(0, 'QD'))).toEqual({ ok: false, error: 'ILLEGAL_CAPTURE' });
    expect(applyMove(state, play(0, '2S', ['5H']))).toEqual({ ok: false, error: 'ILLEGAL_CAPTURE' });
  });

  it('captures into the team pile and passes the turn', () => {
    const state = scenario({ hands: [['QD', '2S'], ['AH'], ['3H'], ['4H']], table: ['QS', '5H'] });
    const { state: next, events } = ok(applyMove(state, play(0, 'QD', ['QS'])));
    expect(ids(next.table)).toEqual(['5H']);
    expect(ids(next.piles[0])).toEqual(['QD', 'QS']);
    expect(next.turn).toBe(1);
    expect(next.lastCapturer).toBe(0);
    expect(events).toEqual([
      expect.objectContaining({ type: 'cardPlayed', seat: 0, chkobba: false }),
    ]);
  });

  it('pools partner captures into the same team pile', () => {
    const state = scenario({
      hands: [['2S'], ['3S'], ['5D'], ['6H']],
      table: ['5H', 'AC'],
      turn: 2,
    });
    const { state: next } = ok(applyMove(state, play(2, '5D', ['5H'])));
    expect(ids(next.piles[0])).toEqual(['5D', '5H']);
  });

  it('places a card that cannot capture', () => {
    const state = scenario({ hands: [['2S', 'QD'], ['AH'], ['3H'], ['4H']], table: ['5H'] });
    const { state: next } = ok(applyMove(state, play(0, '2S')));
    expect(ids(next.table)).toEqual(['5H', '2S']);
  });

  it('scores a chkobba for clearing the table', () => {
    const state = scenario({ hands: [['7D', 'AS'], ['AH'], ['3H'], ['4H']], table: ['3S', '4C'] });
    const { state: next, events } = ok(applyMove(state, play(0, '7D', ['3S', '4C'])));
    expect(next.chkobbas).toEqual([1, 0]);
    expect(events[0]).toMatchObject({ type: 'cardPlayed', chkobba: true });
  });

  it('does not mutate the input state', () => {
    const state = scenario({ hands: [['7D', 'AS'], ['AH'], ['3H'], ['4H']], table: ['3S', '4C'] });
    const snapshot = JSON.stringify(state);
    applyMove(state, play(0, '7D', ['3S', '4C']));
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('deals three more cards to everyone when all hands are empty', () => {
    const stock = ['AD', '2D', '3D', '4D', '5D', '6D', 'AS', '2S', '3S', '4S', '5S', '6S'];
    const state = scenario({ hands: [[], [], [], ['KH']], table: ['2C'], stock, turn: 3, dealer: 3 });
    const { state: next, events } = ok(applyMove(state, play(3, 'KH')));
    expect(next.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(next.stock).toHaveLength(0);
    expect(next.deal).toBe(2);
    expect(next.turn).toBe(0);
    expect(events.map((e) => e.type)).toEqual(['cardPlayed', 'handsDealt']);
  });

  it('does not count a chkobba on the last card of the round', () => {
    const state = scenario({ hands: [[], [], [], ['7D']], table: ['3S', '4C'], turn: 3, dealer: 3 });
    const { state: next, events } = ok(applyMove(state, play(3, '7D', ['3S', '4C'])));
    expect(events[0]).toMatchObject({ type: 'cardPlayed', chkobba: false });
    expect(next.chkobbas).toEqual([0, 0]);
  });

  it('counts a last-card chkobba when the variant allows it', () => {
    const state = scenario({
      hands: [[], [], [], ['7D']],
      table: ['3S', '4C'],
      turn: 3,
      dealer: 3,
      rules: { lastCardChkobba: true },
    });
    const { state: next } = ok(applyMove(state, play(3, '7D', ['3S', '4C'])));
    expect(next.chkobbas).toEqual([0, 1]);
  });

  it('gives leftover table cards to the last capturer and scores the round', () => {
    const state = scenario({
      hands: [[], [], [], ['2H']],
      table: ['KS', 'QS'],
      turn: 3,
      dealer: 3,
      lastCapturer: 2,
      piles: [['7D', '7S', 'AD'], ['AS']],
    });
    const { state: next, events } = ok(applyMove(state, play(3, '2H')));
    expect(events.map((e) => e.type)).toEqual(['cardPlayed', 'tableCollected', 'roundEnded']);
    expect(ids(next.piles[0])).toEqual(['7D', '7S', 'AD', 'KS', 'QS', '2H']);
    expect(next.phase).toBe('roundOver');
    expect(next.lastRound?.teams[0].total).toBe(4); // karta, dineri, bermila, 7aya
    expect(next.scores).toEqual([4, 0]);
  });

  it('ends the game when a team reaches the target', () => {
    const state: GameState = {
      ...scenario({
        hands: [[], [], [], ['2H']],
        table: [],
        turn: 3,
        dealer: 3,
        piles: [['7D', '7S', 'AD'], ['AS']],
        lastCapturer: 0,
      }),
      scores: [19, 10],
    };
    const { state: next, events } = ok(applyMove(state, play(3, '2H')));
    expect(next.phase).toBe('gameOver');
    expect(next.winner).toBe(0);
    expect(events[events.length - 1]).toMatchObject({ type: 'gameEnded', winner: 0 });
    expect(applyMove(next, play(0, '2H'))).toEqual({ ok: false, error: 'GAME_NOT_IN_PROGRESS' });
  });
});

describe('startNextRound', () => {
  it('only works between rounds, and rotates the dealer', () => {
    const { state } = startedGame({ seed: 5, dealer: 3 });
    expect(startNextRound(state)).toEqual({ ok: false, error: 'ROUND_NOT_OVER' });

    const over: GameState = { ...state, phase: 'roundOver', scores: [7, 4] };
    const { state: next } = ok(startNextRound(over));
    expect(next.round).toBe(2);
    expect(next.dealer).toBe(0);
    expect(next.turn).toBe(1);
    expect(next.phase).toBe('cutting');
    expect(next.scores).toEqual([7, 4]);
    expect(next.piles).toEqual([[], []]);
  });
});

describe('viewFor', () => {
  it('shows only the viewer’s own hand and their legal moves', () => {
    const { state } = startedGame({ seed: 9, dealer: 3 });
    const view = viewFor(state, 0);
    expect(view.hand).toEqual(state.hands[0]);
    expect(view.handCounts).toEqual([3, 3, 3, 3]);
    expect(JSON.stringify(view)).not.toContain(JSON.stringify(state.hands[1]));
    expect(view).not.toHaveProperty('stock');
    expect(view.legalMoves.length).toBeGreaterThan(0);
    expect(viewFor(state, 1).legalMoves).toEqual([]);
  });
});
