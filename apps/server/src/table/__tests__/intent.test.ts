import { describe, it, expect } from 'vitest';
import { OpCode } from '@chkobba/protocol';
import { legalMoves, type GameState } from '@chkobba/rules';
import { createTable, intent, join, leave, nextWakeAt, tick, type Joiner, type Presence, type TableState } from '../index';

const NOW = 1_000_000;
const SEED = 'intent-seed';
const HUMANS: readonly Joiner[] = [0, 1, 2, 3].map((i) => ({
  userId: `user-${i}`,
  sessionId: `session-${i}`,
  name: `Player ${i}`,
}));

/** Seats the first `count` humans in order, so HUMANS[i] holds seat i. */
function seatHumans(count: number, seed: string = SEED): TableState {
  let state = createTable({ now: NOW, seed });
  for (let i = 0; i < count; i++) {
    const joined = join(state, HUMANS[i]!, NOW);
    if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
    state = joined.state;
  }
  return state;
}

function presenceOf(seat: number): Presence {
  const human = HUMANS[seat]!;
  return { userId: human.userId, sessionId: human.sessionId };
}

function gameOf(state: TableState): GameState {
  if (!state.game) throw new Error('table has no game');
  return state.game;
}

/** Four humans seated: the game starts immediately in the cut. */
function cuttingTable(): TableState {
  const state = seatHumans(4);
  if (gameOf(state).phase !== 'cutting') throw new Error('expected the round to open with a cut');
  return state;
}

/** Four humans, cut resolved (kept) by the cutter, so a hand is in play. */
function playingTable(): TableState {
  let state = cuttingTable();
  while (gameOf(state).phase === 'cutting') {
    const result = intent(state, presenceOf(gameOf(state).turn), OpCode.CUT, { keep: true }, NOW);
    if (!result.ok) throw new Error(`cut failed: ${result.error}`);
    state = result.state;
  }
  return state;
}

/** Drives a table with 4 humans until the first round summary. */
function betweenTable(): TableState {
  let state = playingTable();
  let now = NOW;
  for (let guard = 0; state.phase === 'playing' && guard < 1000; guard++) {
    const game = gameOf(state);
    const result =
      game.phase === 'cutting'
        ? intent(state, presenceOf(game.turn), OpCode.CUT, { keep: true }, now)
        : intent(state, presenceOf(game.turn), OpCode.PLAY, legalMoves(game)[0], now);
    if (!result.ok) throw new Error(`intent failed: ${result.error}`);
    state = result.state;
    now += 10;
  }
  if (state.phase !== 'between' && state.phase !== 'finished') throw new Error('round did not end');
  return state;
}

/** Two humans who never act; backfill and timeouts take the game to the end. */
function finishedTable(): TableState {
  let state = seatHumans(2);
  for (let guard = 0; state.phase !== 'finished' && guard < 20000; guard++) {
    const wake = nextWakeAt(state);
    if (wake === null) throw new Error('table stalled');
    state = tick(state, wake);
  }
  if (state.phase !== 'finished') throw new Error('game did not finish');
  return state;
}

/** Runs an intent and reports the result together with whether the input state was left untouched. */
function attempt(state: TableState, from: Presence, opcode: number, payload: unknown) {
  const before = JSON.stringify(state);
  const result = intent(state, from, opcode, payload, NOW);
  return { result, unchanged: JSON.stringify(state) === before };
}

function rejected(error: string) {
  return { result: { ok: false, error }, unchanged: true };
}

describe('intent', () => {
  describe('identity', () => {
    it('should reject a user who holds no seat with not_seated', () => {
      // Arrange
      const state = playingTable();
      const stranger: Presence = { userId: 'stranger', sessionId: 'session-x' };

      // Act
      const outcome = attempt(state, stranger, OpCode.PLAY, legalMoves(gameOf(state))[0]);

      // Assert
      expect(outcome).toEqual(rejected('not_seated'));
    });

    it('should reject a seated user sending from a session that is not theirs with not_seated', () => {
      // Arrange
      const state = playingTable();
      const turn = gameOf(state).turn;
      const forged: Presence = { userId: HUMANS[turn]!.userId, sessionId: 'session-forged' };

      // Act
      const outcome = attempt(state, forged, OpCode.PLAY, legalMoves(gameOf(state))[0]);

      // Assert
      expect(outcome).toEqual(rejected('not_seated'));
    });

    it('should reject a stale session with not_seated when the same user rejoined with a new session', () => {
      // Arrange
      const playing = playingTable();
      const turn = gameOf(playing).turn;
      const rejoined = join(playing, { ...HUMANS[turn]!, sessionId: 'session-new' }, NOW);
      if (!rejoined.ok) throw new Error('rejoin failed');

      // Act
      const outcome = attempt(rejoined.state, presenceOf(turn), OpCode.PLAY, legalMoves(gameOf(playing))[0]);

      // Assert
      expect(outcome).toEqual(rejected('not_seated'));
    });

    it('should reject the old session with not_seated when the user disconnected', () => {
      // Arrange
      const playing = playingTable();
      const turn = gameOf(playing).turn;
      const left = leave(playing, presenceOf(turn), NOW);

      // Act
      const outcome = attempt(left, presenceOf(turn), OpCode.PLAY, legalMoves(gameOf(playing))[0]);

      // Assert
      expect(outcome).toEqual(rejected('not_seated'));
    });

    it('should accept the play from the new session when the same user rejoined', () => {
      // Arrange
      const playing = playingTable();
      const turn = gameOf(playing).turn;
      const rejoined = join(playing, { ...HUMANS[turn]!, sessionId: 'session-new' }, NOW);
      if (!rejoined.ok) throw new Error('rejoin failed');
      const fresh: Presence = { userId: HUMANS[turn]!.userId, sessionId: 'session-new' };

      // Act
      const result = intent(rejoined.state, fresh, OpCode.PLAY, legalMoves(gameOf(playing))[0], NOW);

      // Assert
      expect(result.ok).toBe(true);
    });

    it('should check the seat before the opcode when an unseated user sends an unknown opcode', () => {
      // Arrange
      const state = playingTable();
      const stranger: Presence = { userId: 'stranger', sessionId: 'session-x' };

      // Act
      const outcome = attempt(state, stranger, 999, null);

      // Assert
      expect(outcome).toEqual(rejected('not_seated'));
    });
  });

  describe('opcode', () => {
    it.each([0, 4, 99, OpCode.SNAPSHOT, OpCode.ERROR, -1, 1.5, Number.NaN])(
      'should reject opcode %s with bad_opcode',
      (opcode) => {
        // Arrange
        const state = playingTable();
        const turn = gameOf(state).turn;

        // Act
        const outcome = attempt(state, presenceOf(turn), opcode, legalMoves(gameOf(state))[0]);

        // Assert
        expect(outcome).toEqual(rejected('bad_opcode'));
      },
    );

    it('should reject an unknown opcode with bad_opcode while the table is still waiting', () => {
      // Arrange
      const state = seatHumans(1);

      // Act
      const outcome = attempt(state, presenceOf(0), 42, {});

      // Assert
      expect(outcome).toEqual(rejected('bad_opcode'));
    });
  });

  describe('phase', () => {
    it('should reject PLAY during the cut with wrong_phase', () => {
      // Arrange
      const state = cuttingTable();
      const cutter = gameOf(state).turn;
      const card = gameOf(state).cutCard!.id;

      // Act
      const outcome = attempt(state, presenceOf(cutter), OpCode.PLAY, { cardId: card, capture: [] });

      // Assert
      expect(outcome).toEqual(rejected('wrong_phase'));
    });

    it('should reject CUT while a hand is in play with wrong_phase', () => {
      // Arrange
      const state = playingTable();
      const turn = gameOf(state).turn;

      // Act
      const outcome = attempt(state, presenceOf(turn), OpCode.CUT, { keep: true });

      // Assert
      expect(outcome).toEqual(rejected('wrong_phase'));
    });

    it.each([
      { name: 'PLAY', opcode: OpCode.PLAY, payload: { cardId: 'AS', capture: [] } },
      { name: 'CUT', opcode: OpCode.CUT, payload: { keep: true } },
    ])('should reject $name while the table is waiting with wrong_phase', ({ opcode, payload }) => {
      // Arrange
      const state = seatHumans(3);

      // Act
      const outcome = attempt(state, presenceOf(0), opcode, payload);

      // Assert
      expect(outcome).toEqual(rejected('wrong_phase'));
    });

    it.each([
      { name: 'PLAY', opcode: OpCode.PLAY, payload: { cardId: 'AS', capture: [] } },
      { name: 'CUT', opcode: OpCode.CUT, payload: { keep: false } },
    ])('should reject $name during the round summary with wrong_phase', ({ opcode, payload }) => {
      // Arrange
      const state = betweenTable();
      const seat = gameOf(state).turn;

      // Act
      const outcome = attempt(state, presenceOf(seat), opcode, payload);

      // Assert
      expect(outcome).toEqual(rejected('wrong_phase'));
    });

    it.each([
      { name: 'PLAY', opcode: OpCode.PLAY, payload: { cardId: 'AS', capture: [] } },
      { name: 'CUT', opcode: OpCode.CUT, payload: { keep: true } },
    ])('should reject $name after the game finished with wrong_phase', ({ opcode, payload }) => {
      // Arrange
      const state = finishedTable();

      // Act
      const outcome = attempt(state, presenceOf(0), opcode, payload);

      // Assert
      expect(outcome).toEqual(rejected('wrong_phase'));
    });
  });

  describe('turn', () => {
    it('should reject CUT from a seat that is not cutting with not_your_turn', () => {
      // Arrange
      const state = cuttingTable();
      const other = (gameOf(state).turn + 1) % 4;

      // Act
      const outcome = attempt(state, presenceOf(other), OpCode.CUT, { keep: true });

      // Assert
      expect(outcome).toEqual(rejected('not_your_turn'));
    });

    it('should reject PLAY of an own card out of turn with not_your_turn', () => {
      // Arrange
      const state = playingTable();
      const other = (gameOf(state).turn + 1) % 4;
      const ownCard = gameOf(state).hands[other]![0]!.id;

      // Act
      const outcome = attempt(state, presenceOf(other), OpCode.PLAY, { cardId: ownCard, capture: [] });

      // Assert
      expect(outcome).toEqual(rejected('not_your_turn'));
    });

    it('should reject an out-of-turn seat replaying the legal move of the seat on turn with not_your_turn', () => {
      // Arrange
      const state = playingTable();
      const other = (gameOf(state).turn + 2) % 4;
      const move = legalMoves(gameOf(state))[0]!;

      // Act
      const outcome = attempt(state, presenceOf(other), OpCode.PLAY, { cardId: move.cardId, capture: move.capture });

      // Assert
      expect(outcome).toEqual(rejected('not_your_turn'));
    });

    it('should check the turn before the payload when an out-of-turn seat sends garbage', () => {
      // Arrange
      const state = playingTable();
      const other = (gameOf(state).turn + 1) % 4;

      // Act
      const outcome = attempt(state, presenceOf(other), OpCode.PLAY, 'garbage');

      // Assert
      expect(outcome).toEqual(rejected('not_your_turn'));
    });
  });

  describe('PLAY payload', () => {
    const state = playingTable();
    const game = gameOf(state);
    const handCard = game.hands[game.turn]![0]!.id;
    const tableCard = game.table[0]!.id;
    const malformed: { name: string; payload: unknown }[] = [
      { name: 'null', payload: null },
      { name: 'undefined', payload: undefined },
      { name: 'a string', payload: handCard },
      { name: 'a number', payload: 42 },
      { name: 'an array', payload: [handCard, []] },
      { name: 'an empty object', payload: {} },
      { name: 'a missing capture', payload: { cardId: handCard } },
      { name: 'a missing cardId', payload: { capture: [] } },
      { name: 'a numeric cardId', payload: { cardId: 7, capture: [] } },
      { name: 'a null cardId', payload: { cardId: null, capture: [] } },
      { name: 'an unknown cardId', payload: { cardId: 'ZZ', capture: [] } },
      { name: 'a removed rank (8)', payload: { cardId: '8D', capture: [] } },
      { name: 'a lowercase cardId', payload: { cardId: handCard.toLowerCase(), capture: [] } },
      { name: 'a padded cardId', payload: { cardId: ` ${handCard}`, capture: [] } },
      { name: 'a string capture', payload: { cardId: handCard, capture: tableCard } },
      { name: 'an object capture', payload: { cardId: handCard, capture: { 0: tableCard } } },
      { name: 'a null capture', payload: { cardId: handCard, capture: null } },
      { name: 'a numeric capture id', payload: { cardId: handCard, capture: [1] } },
      { name: 'an unknown capture id', payload: { cardId: handCard, capture: ['XX'] } },
      { name: 'duplicate capture ids', payload: { cardId: handCard, capture: ['AS', 'AS'] } },
      { name: 'a duplicated table card', payload: { cardId: handCard, capture: [tableCard, tableCard] } },
      { name: 'an oversized capture list', payload: { cardId: handCard, capture: new Array(41).fill(tableCard) } },
    ];

    it.each(malformed)('should reject $name with bad_payload', ({ payload }) => {
      // Arrange
      const turn = game.turn;

      // Act
      const outcome = attempt(state, presenceOf(turn), OpCode.PLAY, payload);

      // Assert
      expect(outcome).toEqual(rejected('bad_payload'));
    });
  });

  describe('CUT payload', () => {
    const state = cuttingTable();
    const cutter = gameOf(state).turn;
    const malformed: { name: string; payload: unknown }[] = [
      { name: 'null', payload: null },
      { name: 'undefined', payload: undefined },
      { name: 'a string', payload: 'keep' },
      { name: 'a boolean', payload: true },
      { name: 'an array', payload: [true] },
      { name: 'an empty object', payload: {} },
      { name: 'a string keep', payload: { keep: 'true' } },
      { name: 'a numeric keep', payload: { keep: 1 } },
      { name: 'a null keep', payload: { keep: null } },
    ];

    it.each(malformed)('should reject $name with bad_payload', ({ payload }) => {
      // Arrange
      const from = presenceOf(cutter);

      // Act
      const outcome = attempt(state, from, OpCode.CUT, payload);

      // Assert
      expect(outcome).toEqual(rejected('bad_payload'));
    });
  });

  describe('engine legality', () => {
    it('should reject capturing a card that is not on the table with illegal_move', () => {
      // Arrange
      const state = playingTable();
      const game = gameOf(state);
      const move = { cardId: game.hands[game.turn]![0]!.id, capture: [game.stock[0]!.id] };

      // Act
      const outcome = attempt(state, presenceOf(game.turn), OpCode.PLAY, move);

      // Assert
      expect(outcome).toEqual(rejected('illegal_move'));
    });

    it('should reject playing a card from another seat hand with illegal_move', () => {
      // Arrange
      const state = playingTable();
      const game = gameOf(state);
      const foreign = game.hands[(game.turn + 1) % 4]![0]!.id;

      // Act
      const outcome = attempt(state, presenceOf(game.turn), OpCode.PLAY, { cardId: foreign, capture: [] });

      // Assert
      expect(outcome).toEqual(rejected('illegal_move'));
    });

    it('should reject playing a stock card with illegal_move', () => {
      // Arrange
      const state = playingTable();
      const game = gameOf(state);

      // Act
      const outcome = attempt(state, presenceOf(game.turn), OpCode.PLAY, { cardId: game.stock[0]!.id, capture: [] });

      // Assert
      expect(outcome).toEqual(rejected('illegal_move'));
    });

    it('should reject a hand card with a capture the engine does not list as legal with illegal_move', () => {
      // Arrange
      const state = playingTable();
      const game = gameOf(state);
      const legal = legalMoves(game);
      const isLegal = (cardId: string, capture: string[]) =>
        legal.some((m) => m.cardId === cardId && m.capture.length === capture.length && capture.every((id) => m.capture.some((c) => c === id)));
      const candidates: { cardId: string; capture: string[] }[] = [];
      for (const card of game.hands[game.turn]!) {
        candidates.push({ cardId: card.id, capture: [] });
        for (const t of game.table) candidates.push({ cardId: card.id, capture: [t.id] });
        candidates.push({ cardId: card.id, capture: game.table.map((t) => t.id) });
      }
      const illegal = candidates.find((c) => !isLegal(c.cardId, c.capture));
      if (!illegal) throw new Error('seed produced no illegal candidate; pick another seed');

      // Act
      const outcome = attempt(state, presenceOf(game.turn), OpCode.PLAY, illegal);

      // Assert
      expect(outcome).toEqual(rejected('illegal_move'));
    });
  });

  describe('accepted intents', () => {
    it('should accept a legal CUT that throws the cut card', () => {
      // Arrange
      const state = cuttingTable();
      const cutter = gameOf(state).turn;

      // Act
      const result = intent(state, presenceOf(cutter), OpCode.CUT, { keep: false }, NOW);

      // Assert
      expect(result.ok).toBe(true);
    });

    it('should append log entries with consecutive increasing seq after a legal CUT', () => {
      // Arrange
      const state = cuttingTable();
      const cutter = gameOf(state).turn;

      // Act
      const result = intent(state, presenceOf(cutter), OpCode.CUT, { keep: true }, NOW);

      // Assert
      if (!result.ok) throw new Error(result.error);
      const added = result.state.log.slice(state.log.length).map((e) => e.seq);
      const expected = added.map((_, i) => state.seq + i + 1);
      expect({ added, last: result.state.seq, nonEmpty: added.length > 0 }).toEqual({
        added: expected,
        last: state.seq + added.length,
        nonEmpty: true,
      });
    });

    it('should log a cutResolved event for the cutter after a legal CUT', () => {
      // Arrange
      const state = cuttingTable();
      const cutter = gameOf(state).turn;

      // Act
      const result = intent(state, presenceOf(cutter), OpCode.CUT, { keep: true }, NOW);

      // Assert
      if (!result.ok) throw new Error(result.error);
      expect(result.state.log[state.log.length]?.event).toEqual({ type: 'cutResolved', seat: cutter, kept: true, card: null });
    });

    it('should leave the input state untouched after a legal CUT', () => {
      // Arrange
      const state = cuttingTable();
      const before = JSON.stringify(state);

      // Act
      intent(state, presenceOf(gameOf(state).turn), OpCode.CUT, { keep: true }, NOW);

      // Assert
      expect(JSON.stringify(state)).toBe(before);
    });

    it('should append a cardPlayed entry with the next seq after a legal PLAY', () => {
      // Arrange
      const state = playingTable();
      const game = gameOf(state);
      const move = legalMoves(game)[0]!;

      // Act
      const result = intent(state, presenceOf(game.turn), OpCode.PLAY, { cardId: move.cardId, capture: move.capture }, NOW);

      // Assert
      if (!result.ok) throw new Error(result.error);
      const first = result.state.log[state.log.length];
      expect({ seq: first?.seq, type: first?.event.type, seat: first?.event.type === 'cardPlayed' ? first.event.seat : null }).toEqual({
        seq: state.seq + 1,
        type: 'cardPlayed',
        seat: game.turn,
      });
    });

    it('should keep log seq strictly increasing across many legal plays', () => {
      // Arrange
      let state = playingTable();

      // Act
      for (let i = 0; i < 12 && state.phase === 'playing'; i++) {
        const game = gameOf(state);
        const result =
          game.phase === 'cutting'
            ? intent(state, presenceOf(game.turn), OpCode.CUT, { keep: true }, NOW)
            : intent(state, presenceOf(game.turn), OpCode.PLAY, legalMoves(game)[i % legalMoves(game).length], NOW);
        if (!result.ok) throw new Error(result.error);
        state = result.state;
      }

      // Assert
      const seqs = state.log.map((e) => e.seq);
      expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    });

    it('should pass the turn to the next seat after a legal PLAY', () => {
      // Arrange
      const state = playingTable();
      const game = gameOf(state);
      const move = legalMoves(game)[0]!;

      // Act
      const result = intent(state, presenceOf(game.turn), OpCode.PLAY, { cardId: move.cardId, capture: move.capture }, NOW);

      // Assert
      expect(result.ok && gameOf(result.state).turn).toBe((game.turn + 1) % 4);
    });

    it('should play for the sender seat and ignore a seat field smuggled into the payload', () => {
      // Arrange
      const state = playingTable();
      const game = gameOf(state);
      const move = legalMoves(game)[0]!;
      const spoofedSeat = (game.turn + 1) % 4;
      const payload = { cardId: move.cardId, capture: move.capture, seat: spoofedSeat, extra: true };

      // Act
      const result = intent(state, presenceOf(game.turn), OpCode.PLAY, payload, NOW);

      // Assert
      const event = result.ok ? result.state.log[state.log.length]?.event : undefined;
      expect(event?.type === 'cardPlayed' ? event.seat : null).toBe(game.turn);
    });

    it('should return the same state for BACK when the player is neither away nor missing turns', () => {
      // Arrange
      const state = playingTable();

      // Act
      const result = intent(state, presenceOf(1), OpCode.BACK, null, NOW);

      // Assert
      expect(result.ok && result.state).toBe(state);
    });
  });
});
