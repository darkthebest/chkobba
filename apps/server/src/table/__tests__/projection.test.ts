import { describe, it, expect } from 'vitest';
import { OpCode, type PlayerInfo, type TableLabel } from '@chkobba/protocol';
import { legalMoves, type Card, type GameState } from '@chkobba/rules';
import {
  BACKFILL_MS,
  createTable,
  intent,
  join,
  label,
  nextWakeAt,
  snapshotFor,
  tick,
  type Joiner,
  type Presence,
  type TableState,
} from '../index';
import { ROOM_RESET_MS } from '@chkobba/protocol';
import { leave, snapshotForMember } from '../index';
import { ROOM_CODE } from './helpers';
import { PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS } from '@chkobba/protocol/testing';

const NOW = 2_000_000;
const SEEDS = ['projection-a', 'projection-b', 'projection-c'];
const HUMANS: readonly Joiner[] = [0, 1, 2, 3].map((i) => ({
  userId: `user-secret-${i}`,
  sessionId: `session-secret-${i}`,
  name: `Player ${i}`,
}));
const CARD_ID_IN_JSON = /"id":"([A2-7QJK][DSHC])"/g;

/** Seats the first `count` humans in order, so HUMANS[i] holds seat i. */
function seatHumans(count: number, seed: string): TableState {
  let state = createTable({ now: NOW, seed });
  for (let i = 0; i < count; i++) {
    const joined = join(state, HUMANS[i]!, NOW);
    if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
    state = joined.state;
  }
  return state;
}

function presenceOf(seat: number): Presence {
  return { userId: HUMANS[seat]!.userId, sessionId: HUMANS[seat]!.sessionId };
}

function gameOf(state: TableState): GameState {
  if (!state.game) throw new Error('table has no game');
  return state.game;
}

function idsOf(list: readonly Card[]): string[] {
  return list.map((c) => c.id);
}

/** Every card id that appears as a `{ id }` anywhere in a JSON-serializable value. */
function cardIdsIn(value: unknown): Set<string> {
  const found = new Set<string>();
  const json = JSON.stringify(value);
  CARD_ID_IN_JSON.lastIndex = 0;
  for (let m = CARD_ID_IN_JSON.exec(json); m !== null; m = CARD_ID_IN_JSON.exec(json)) found.add(m[1]!);
  return found;
}

/** Cards `seat` must not learn: other hands, the stock and a cut card it is not cutting. */
function hiddenFrom(game: GameState, seat: number): string[] {
  const hidden: string[] = idsOf(game.stock);
  game.hands.forEach((hand, s) => {
    if (s !== seat) hidden.push(...idsOf(hand));
  });
  if (game.cutCard && game.turn !== seat) hidden.push(game.cutCard.id);
  return hidden;
}

/** Card ids of the hidden set that occur (quoted) in the JSON of the snapshot. */
function leaks(json: string, hidden: readonly string[], publicIds: ReadonlySet<string>): string[] {
  return hidden.filter((id) => !publicIds.has(id) && json.indexOf(`"${id}"`) !== -1);
}

interface Audit {
  checks: number;
  /** Hidden ids checked against the full snapshot (after exempting public ids). */
  hiddenChecked: number;
  /** Hidden ids checked against the head snapshot (no exemption). */
  hiddenCheckedStrict: number;
  violations: string[];
  keptCuts: number;
}

/**
 * Audits every seat's snapshot at the current moment:
 * - full snapshot (log from 0): hidden ids minus anything already public (table, piles, any log event);
 * - head snapshot (empty log delta): hidden ids with no exemption at all, since the view alone must be clean.
 */
function auditMoment(state: TableState, audit: Audit, where: string): void {
  if (!state.game) return;
  const game = state.game;
  const publicIds = new Set<string>([...idsOf(game.table), ...idsOf(game.piles[0]), ...idsOf(game.piles[1])]);
  cardIdsIn(state.log).forEach((id) => publicIds.add(id));
  for (let seat = 0; seat < 4; seat++) {
    const hidden = hiddenFrom(game, seat);
    audit.checks++;
    audit.hiddenChecked += hidden.filter((id) => !publicIds.has(id)).length;
    audit.hiddenCheckedStrict += hidden.length;
    const full = leaks(JSON.stringify(snapshotFor(state, seat, 0, NOW)), hidden, publicIds);
    const head = leaks(JSON.stringify(snapshotFor(state, seat, state.seq, NOW)), hidden, new Set());
    for (const id of full) audit.violations.push(`${where} seat ${seat} full snapshot leaks ${id}`);
    for (const id of head) audit.violations.push(`${where} seat ${seat} head snapshot leaks ${id}`);
  }
}

/**
 * Plays a whole game where four humans act through `intent`: the cutter always
 * keeps (so kept cut cards are exercised) and the move is picked by a step counter.
 * After every kept cut, each other seat's delta snapshot since just before the cut
 * must not contain the kept card.
 */
function auditHumanGame(seed: string): Audit {
  const audit: Audit = { checks: 0, hiddenChecked: 0, hiddenCheckedStrict: 0, violations: [], keptCuts: 0 };
  let state = seatHumans(4, seed);
  let now = NOW;
  for (let step = 0; state.phase !== 'finished' && step < 20000; step++) {
    auditMoment(state, audit, `${seed}#${step}`);
    const game = state.game;
    if (state.phase === 'playing' && game && game.phase === 'cutting') {
      const cutter = game.turn;
      const keptId = game.cutCard!.id;
      const seqBefore = state.seq;
      const result = intent(state, presenceOf(cutter), OpCode.CUT, { keep: true }, now);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
      audit.keptCuts++;
      for (let seat = 0; seat < 4; seat++) {
        if (seat === cutter) continue;
        const delta = JSON.stringify(snapshotFor(state, seat, seqBefore, NOW));
        const onTable = idsOf(gameOf(state).table).indexOf(keptId) !== -1;
        if (!onTable && delta.indexOf(`"${keptId}"`) !== -1) {
          audit.violations.push(`${seed}#${step} kept cut ${keptId} visible to seat ${seat}`);
        }
      }
    } else if (state.phase === 'playing' && game && game.phase === 'playing') {
      const moves = legalMoves(game);
      const move = moves[step % moves.length]!;
      const result = intent(state, presenceOf(game.turn), OpCode.PLAY, { cardId: move.cardId, capture: move.capture }, now);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    } else {
      const wake = nextWakeAt(state);
      if (wake === null) throw new Error('table stalled');
      now = wake;
      state = tick(state, now);
    }
    now += 1;
  }
  if (state.phase !== 'finished') throw new Error(`${seed} did not finish`);
  auditMoment(state, audit, `${seed}#end`);
  return audit;
}

/** Plays a whole game driven only by `tick`: two idle humans plus backfilled bots. */
function auditTickGame(seed: string): Audit {
  const audit: Audit = { checks: 0, hiddenChecked: 0, hiddenCheckedStrict: 0, violations: [], keptCuts: 0 };
  let state = seatHumans(2, seed);
  for (let step = 0; state.phase !== 'finished' && step < 20000; step++) {
    auditMoment(state, audit, `${seed}#${step}`);
    const wake = nextWakeAt(state);
    if (wake === null) throw new Error('table stalled');
    state = tick(state, wake);
  }
  if (state.phase !== 'finished') throw new Error(`${seed} did not finish`);
  auditMoment(state, audit, `${seed}#end`);
  return audit;
}

describe('snapshotFor', () => {
  describe('hidden information', () => {
    it.each(SEEDS)('should never leak another hand, the stock or a hidden cut card when humans play seed %s', (seed) => {
      // Arrange
      const run = () => auditHumanGame(seed);

      // Act
      const audit = run();

      // Assert
      expect(audit.violations).toEqual([]);
    });

    it.each(SEEDS)('should never leak another hand, the stock or a hidden cut card when bots play seed %s', (seed) => {
      // Arrange
      const run = () => auditTickGame(seed);

      // Act
      const audit = run();

      // Assert
      expect(audit.violations).toEqual([]);
    });

    it('should actually audit hidden cards and kept cuts so the leak check is not vacuous', () => {
      // Arrange
      const seed = SEEDS[0]!;

      // Act
      const audit = auditHumanGame(seed);

      // Assert
      expect({
        manyChecks: audit.checks > 400,
        manyHidden: audit.hiddenChecked > 1000,
        manyHiddenStrict: audit.hiddenCheckedStrict > 10000,
        keptCuts: audit.keptCuts > 1,
      }).toEqual({ manyChecks: true, manyHidden: true, manyHiddenStrict: true, keptCuts: true });
    });

    it('should show the cut card to the cutter so the leak detector would catch it elsewhere', () => {
      // Arrange
      const state = seatHumans(4, SEEDS[0]!);
      const game = gameOf(state);

      // Act
      const json = JSON.stringify(snapshotFor(state, game.turn, state.seq, NOW));

      // Assert
      expect(json).toContain(`"${game.cutCard!.id}"`);
    });

    it.each([1, 2, 3])('should hide the cut card from seat cutter+%i while cutting', (offset) => {
      // Arrange
      const state = seatHumans(4, SEEDS[0]!);
      const game = gameOf(state);
      const other = (game.turn + offset) % 4;

      // Act
      const json = JSON.stringify(snapshotFor(state, other, state.seq, NOW));

      // Assert
      expect(json).not.toContain(`"${game.cutCard!.id}"`);
    });

    it('should hide a kept cut card from every other seat right after the cut', () => {
      // Arrange
      const state = seatHumans(4, SEEDS[1]!);
      const game = gameOf(state);
      const keptId = game.cutCard!.id;
      const result = intent(state, presenceOf(game.turn), OpCode.CUT, { keep: true }, NOW);
      if (!result.ok) throw new Error(result.error);
      const others = [1, 2, 3].map((o) => (game.turn + o) % 4);

      // Act
      const visibleTo = others.filter((seat) => JSON.stringify(snapshotFor(result.state, seat, state.seq, NOW)).indexOf(`"${keptId}"`) !== -1);

      // Assert
      expect(visibleTo).toEqual([]);
    });

    it('should never include session ids in a snapshot', () => {
      // Arrange
      const state = seatHumans(4, SEEDS[0]!);

      // Act
      const json = JSON.stringify([0, 1, 2, 3].map((seat) => snapshotFor(state, seat, 0, NOW)));

      // Assert
      expect(/session-secret/.test(json)).toBe(false);
    });

    it('should carry user ids only as players[].userId of human seats', () => {
      // Arrange
      const state = seatHumans(4, SEEDS[0]!);

      // Act
      const snapshots = [0, 1, 2, 3].map((seat) => snapshotFor(state, seat, 0, NOW));
      const withoutPlayers = JSON.stringify(snapshots.map((s) => ({ ...s, players: [] })));

      // Assert
      for (const snapshot of snapshots) {
        expect(snapshot.players.map((p) => p?.userId)).toEqual(HUMANS.map((h) => h.userId));
      }
      expect(/user-secret/.test(withoutPlayers)).toBe(false);
    });

    it('should keep userId on a disconnected human seat', () => {
      // Arrange
      const state = leave(seatHumans(4, SEEDS[0]!), presenceOf(1), NOW);

      // Act
      const player = snapshotFor(state, 0, 0, NOW).players[1];

      // Assert
      expect(player).toMatchObject({ connected: false, userId: HUMANS[1]!.userId });
    });

    it('should have no userId key for bots and empty seats', () => {
      // Arrange
      const waiting = seatHumans(1, SEEDS[0]!);
      const backfilled = tick(waiting, NOW + BACKFILL_MS);

      // Act
      const empty = snapshotFor(waiting, 0, 0, NOW).players;
      const bots = snapshotFor(backfilled, 0, 0, NOW).players.slice(1);

      // Assert
      expect(empty.slice(1)).toEqual([null, null, null]);
      for (const bot of bots) {
        expect(bot?.isBot).toBe(true);
        expect(Object.prototype.hasOwnProperty.call(bot, 'userId')).toBe(false);
      }
    });

    it('should never include the table seed in a snapshot', () => {
      // Arrange
      const state = seatHumans(4, SEEDS[2]!);

      // Act
      const json = JSON.stringify(snapshotFor(state, 0, 0, NOW));

      // Assert
      expect(json).not.toContain(SEEDS[2]);
    });
  });

  describe('log delta', () => {
    function midGame(): TableState {
      let state = seatHumans(2, SEEDS[0]!);
      for (let i = 0; i < 30; i++) state = tick(state, nextWakeAt(state)!);
      return state;
    }

    it('should return the whole log when sinceSeq is 0', () => {
      // Arrange
      const state = midGame();

      // Act
      const snapshot = snapshotFor(state, 0, 0, NOW);

      // Assert
      expect(snapshot.log).toEqual(state.log);
    });

    it.each([1, 5, 10])('should return only entries with seq greater than %i', (sinceSeq) => {
      // Arrange
      const state = midGame();

      // Act
      const snapshot = snapshotFor(state, 1, sinceSeq, NOW);

      // Assert
      expect(snapshot.log.map((e) => e.seq)).toEqual(state.log.map((e) => e.seq).filter((seq) => seq > sinceSeq));
    });

    it('should return an empty log when the client is up to date', () => {
      // Arrange
      const state = midGame();

      // Act
      const snapshot = snapshotFor(state, 2, state.seq, NOW);

      // Assert
      expect(snapshot.log).toEqual([]);
    });

    it('should return exactly the entries a tick added when asked since the previous seq', () => {
      // Arrange
      const before = midGame();
      const after = tick(before, nextWakeAt(before)!);

      // Act
      const snapshot = snapshotFor(after, 3, before.seq, NOW);

      // Assert
      expect(snapshot.log).toEqual(after.log.slice(before.log.length));
    });
  });

  describe('shape', () => {
    it('should have no view and a backfill time while waiting', () => {
      // Arrange
      const state = seatHumans(1, SEEDS[0]!);

      // Act
      const snapshot = snapshotFor(state, 0, 0, NOW);

      // Assert
      expect({ view: snapshot.view, phase: snapshot.phase, hasBackfill: typeof snapshot.backfillAt === 'number' }).toEqual({
        view: null,
        phase: 'waiting',
        hasBackfill: true,
      });
    });

    it('should report backfillAt as the first join time plus BACKFILL_MS when the table was created earlier', () => {
      // Arrange
      const joinedAt = NOW + 40_000;
      const joined = join(createTable({ now: NOW, seed: SEEDS[0]! }), HUMANS[0]!, joinedAt);
      if (!joined.ok) throw new Error(`join failed: ${joined.error}`);

      // Act
      const snapshot = snapshotFor(joined.state, 0, 0, NOW);

      // Assert
      expect(snapshot.backfillAt).toBe(joinedAt + BACKFILL_MS);
    });

    it('should report backfillAt equal to the scheduled backfill wake-up while waiting', () => {
      // Arrange
      const joined = join(createTable({ now: NOW, seed: SEEDS[0]! }), HUMANS[0]!, NOW + 7_000);
      if (!joined.ok) throw new Error(`join failed: ${joined.error}`);

      // Act
      const snapshot = snapshotFor(joined.state, 0, 0, NOW);

      // Assert
      expect(snapshot.backfillAt).toBe(nextWakeAt(joined.state));
    });

    it('should report no backfill time while waiting with no human seated', () => {
      // Arrange
      const state = createTable({ now: NOW, seed: SEEDS[0]! });

      // Act
      const snapshot = snapshotFor(state, 0, 0, NOW);

      // Assert
      expect(snapshot.backfillAt).toBeNull();
    });

    it('should give the seat its own view and clear the backfill time once playing', () => {
      // Arrange
      const state = seatHumans(4, SEEDS[0]!);

      // Act
      const snapshot = snapshotFor(state, 2, 0, NOW);

      // Assert
      expect({ seat: snapshot.seat, viewSeat: snapshot.view?.seat, backfillAt: snapshot.backfillAt }).toEqual({
        seat: 2,
        viewSeat: 2,
        backfillAt: null,
      });
    });

    it.each([-1, 4, 1.5, Number.NaN])('should throw a RangeError for invalid seat %s', (seat) => {
      // Arrange
      const state = seatHumans(4, SEEDS[0]!);

      // Act
      const call = () => snapshotFor(state, seat, 0, NOW);

      // Assert
      expect(call).toThrow(RangeError);
    });
  });

  describe('timing', () => {
    /** Drives a bot game with tick until `stop` holds; returns the state and the time it was reached. */
    function tickUntil(seed: string, stop: (state: TableState) => boolean): { state: TableState; at: number } {
      let state = seatHumans(2, seed);
      let at = NOW;
      for (let i = 0; !stop(state) && i < 20000; i++) {
        const wake = nextWakeAt(state);
        if (wake === null) throw new Error('table stalled');
        at = wake;
        state = tick(state, at);
      }
      if (!stop(state)) throw new Error('condition never reached');
      return { state, at };
    }

    it.each([NOW, NOW + 12_345, 1_700_000_000_000])('should stamp serverTime with the now passed (%i)', (now) => {
      // Arrange
      const state = seatHumans(4, SEEDS[0]!);

      // Act
      const snapshot = snapshotFor(state, 1, 0, now);

      // Assert
      expect(snapshot.serverTime).toBe(now);
    });

    it('should report nextRoundAt equal to the time tick starts the next round while between', () => {
      // Arrange
      const { state: between, at } = tickUntil(SEEDS[0]!, (s) => s.phase === 'between');

      // Act
      const snapshot = snapshotFor(between, 0, between.seq, at);
      const justBefore = tick(between, snapshot.nextRoundAt! - 1);
      const atNextRound = tick(between, snapshot.nextRoundAt!);

      // Assert
      expect({
        phase: snapshot.phase,
        isFuture: snapshot.nextRoundAt! > at,
        wake: snapshot.nextRoundAt === nextWakeAt(between),
        before: justBefore.phase,
        after: atNextRound.phase,
        roundAfter: atNextRound.game!.round,
      }).toEqual({
        phase: 'between',
        isFuture: true,
        wake: true,
        before: 'between',
        after: 'playing',
        roundAfter: between.game!.round + 1,
      });
    });

    it('should report no nextRoundAt while waiting, playing or finished', () => {
      // Arrange
      const waiting = seatHumans(1, SEEDS[0]!);
      const playing = seatHumans(4, SEEDS[0]!);
      const finished = tickUntil(SEEDS[1]!, (s) => s.phase === 'finished').state;

      // Act
      const values = [waiting, playing, finished].map((s) => [s.phase, snapshotFor(s, 0, 0, NOW).nextRoundAt]);

      // Assert
      expect(values).toEqual([
        ['waiting', null],
        ['playing', null],
        ['finished', null],
      ]);
    });
  });
});

describe('label', () => {
  function labelOf(state: TableState): TableLabel {
    return label(state);
  }

  it('should be open with four free seats when the table is empty', () => {
    // Arrange
    const state = createTable({ now: NOW, seed: SEEDS[0]! });

    // Act
    const result = labelOf(state);

    // Assert
    expect(result).toEqual({ open: true, mode: '2v2', seatsFree: 4, private: false });
  });

  it.each([1, 2, 3])('should be open with %i seated humans while waiting', (count) => {
    // Arrange
    const state = seatHumans(count, SEEDS[0]!);

    // Act
    const result = labelOf(state);

    // Assert
    expect(result).toEqual({ open: true, mode: '2v2', seatsFree: 4 - count, private: false });
  });

  it('should close with no free seats once four humans start the game', () => {
    // Arrange
    const state = seatHumans(4, SEEDS[0]!);

    // Act
    const result = labelOf(state);

    // Assert
    expect(result).toEqual({ open: false, mode: '2v2', seatsFree: 0, private: false });
  });

  it('should close with no free seats once bots backfill the table', () => {
    // Arrange
    const waiting = seatHumans(2, SEEDS[0]!);
    const started = tick(waiting, nextWakeAt(waiting)!);

    // Act
    const result = labelOf(started);

    // Assert
    expect({ phase: started.phase, label: result }).toEqual({
      phase: 'playing',
      label: { open: false, mode: '2v2', seatsFree: 0, private: false },
    });
  });

  it('should stay closed when the game is finished', () => {
    // Arrange
    let state = seatHumans(2, SEEDS[1]!);
    for (let i = 0; state.phase !== 'finished' && i < 20000; i++) state = tick(state, nextWakeAt(state)!);

    // Act
    const result = labelOf(state);

    // Assert
    expect({ phase: state.phase, label: result }).toEqual({
      phase: 'finished',
      label: { open: false, mode: '2v2', seatsFree: 0, private: false },
    });
  });
});

describe('private table projection', () => {
  const STANDER: Joiner = { userId: 'user-secret-standing', sessionId: 'session-secret-standing', name: 'Watcher' };

  function mustOk(result: { ok: true; state: TableState } | { ok: false; error: string }): TableState {
    if (!result.ok) throw new Error(result.error);
    return result.state;
  }

  /** Private table (code ROOM_CODE) with HUMANS[0..count-1] seated in order while waiting; HUMANS[0] is host. */
  function privateSeated(count: number, seed: string): TableState {
    let state = createTable({ now: NOW, seed, privateCode: ROOM_CODE });
    for (let i = 0; i < count; i++) state = mustOk(join(state, HUMANS[i]!, NOW));
    return state;
  }

  /** HUMANS[0] seated and START sent (bots on seats 1-3), then STANDER joins and stands. */
  function startedWithStander(seed: string): TableState {
    const started = mustOk(intent(privateSeated(1, seed), presenceOf(0), OpCode.START, {}, NOW));
    return mustOk(join(started, STANDER, NOW));
  }

  /** Ticks at each scheduled wake-up until `done` holds. */
  function driveTo(state: TableState, done: (s: TableState) => boolean): TableState {
    let current = state;
    for (let step = 0; !done(current) && step < 20000; step++) current = tick(current, nextWakeAt(current)!);
    if (!done(current)) throw new Error('condition not reached');
    return current;
  }

  interface StandingAudit {
    checks: number;
    hiddenChecked: number;
    violations: string[];
  }

  /**
   * Plays a whole private game by tick and audits the standing member's
   * snapshot at every moment: no view, seat -1, and none of the hands, the
   * stock or a cut card (full snapshot with public ids exempted, head
   * snapshot with no exemption).
   */
  function auditStanding(seed: string): StandingAudit {
    const audit: StandingAudit = { checks: 0, hiddenChecked: 0, violations: [] };
    let state = startedWithStander(seed);
    const check = (where: string) => {
      const full = snapshotForMember(state, STANDER.userId, 0, NOW);
      const head = snapshotForMember(state, STANDER.userId, state.seq, NOW);
      audit.checks++;
      if (full.view !== null || full.seat !== -1) audit.violations.push(`${where} standing snapshot has a view or seat`);
      if (!state.game) return;
      const game = state.game;
      const publicIds = new Set<string>([...idsOf(game.table), ...idsOf(game.piles[0]), ...idsOf(game.piles[1])]);
      cardIdsIn(state.log).forEach((id) => publicIds.add(id));
      const hidden = hiddenFrom(game, -1);
      audit.hiddenChecked += hidden.length;
      for (const id of leaks(JSON.stringify(full), hidden, publicIds)) audit.violations.push(`${where} full leaks ${id}`);
      for (const id of leaks(JSON.stringify(head), hidden, new Set())) audit.violations.push(`${where} head leaks ${id}`);
    };
    for (let step = 0; state.phase !== 'finished' && step < 20000; step++) {
      check(`${seed}#${step}`);
      state = tick(state, nextWakeAt(state)!);
    }
    if (state.phase !== 'finished') throw new Error(`${seed} did not finish`);
    check(`${seed}#end`);
    return audit;
  }

  describe('hidden information for a standing member', () => {
    it.each(SEEDS)('should never show a standing member any hand, the stock or a cut card for seed %s', (seed) => {
      // Arrange
      const run = () => auditStanding(seed);

      // Act
      const audit = run();

      // Assert
      expect(audit.violations).toEqual([]);
    });

    it('should actually audit hidden cards for the standing member so the check is not vacuous', () => {
      // Arrange
      const seed = SEEDS[0]!;

      // Act
      const audit = auditStanding(seed);

      // Assert
      expect({ manyChecks: audit.checks > 100, manyHidden: audit.hiddenChecked > 3000 }).toEqual({
        manyChecks: true,
        manyHidden: true,
      });
    });

    it('should give a standing member seat -1 and no view during play', () => {
      // Arrange
      const state = startedWithStander(SEEDS[0]!);

      // Act
      const snapshot = snapshotForMember(state, STANDER.userId, 0, NOW);

      // Assert
      expect({ seat: snapshot.seat, view: snapshot.view, phase: snapshot.phase }).toEqual({ seat: -1, view: null, phase: 'playing' });
    });

    it('should give a seated member the same snapshot as snapshotFor their seat', () => {
      // Arrange
      const state = startedWithStander(SEEDS[1]!);

      // Act
      const snapshot = snapshotForMember(state, HUMANS[0]!.userId, 0, NOW);

      // Assert
      expect(snapshot).toEqual(snapshotFor(state, 0, 0, NOW));
    });
  });

  describe('label', () => {
    it.each([
      ['waiting with free seats', () => privateSeated(2, SEEDS[0]!)],
      ['playing', () => startedWithStander(SEEDS[0]!)],
    ])('should be private and closed while %s', (_, build) => {
      // Arrange
      const state = build();

      // Act
      const result = label(state);

      // Assert
      expect({ private: result.private, open: result.open }).toEqual({ private: true, open: false });
    });

    it('should never carry the room code', () => {
      // Arrange
      const states = [privateSeated(0, SEEDS[0]!), privateSeated(2, SEEDS[0]!), startedWithStander(SEEDS[0]!)];

      // Act
      const json = JSON.stringify(states.map(label));

      // Assert
      expect(json).not.toContain(ROOM_CODE);
    });
  });

  describe('room', () => {
    /** Four HUMANS seated while waiting, STANDER standing (members in join order: HUMANS 0-3, STANDER). */
    function fullWaitingRoom(): TableState {
      return mustOk(join(privateSeated(4, SEEDS[0]!), STANDER, NOW));
    }

    it('should list members with only name, seat, isHost and userId', () => {
      // Arrange
      const state = fullWaitingRoom();

      // Act
      const members = snapshotForMember(state, STANDER.userId, 0, NOW).room?.members;

      // Assert
      expect(members).toEqual([
        { name: 'Player 0', seat: 0, isHost: true, userId: HUMANS[0]!.userId },
        { name: 'Player 1', seat: 1, isHost: false, userId: HUMANS[1]!.userId },
        { name: 'Player 2', seat: 2, isHost: false, userId: HUMANS[2]!.userId },
        { name: 'Player 3', seat: 3, isHost: false, userId: HUMANS[3]!.userId },
        { name: 'Watcher', seat: null, isHost: false, userId: STANDER.userId },
      ]);
    });

    it('should never include session ids, and user ids only in players and room.members, in a private snapshot', () => {
      // Arrange
      const waiting = fullWaitingRoom();
      const playing = startedWithStander(SEEDS[0]!);

      // Act
      const snapshots = [
        ...[0, 1, 2, 3].map((seat) => snapshotFor(waiting, seat, 0, NOW)),
        snapshotForMember(waiting, STANDER.userId, 0, NOW),
        snapshotForMember(playing, STANDER.userId, 0, NOW),
        snapshotForMember(playing, HUMANS[0]!.userId, 0, NOW),
      ];
      const json = JSON.stringify(snapshots);
      const withoutIdFields = JSON.stringify(
        snapshots.map((s) => ({
          ...s,
          players: [],
          room: s.room && { ...s.room, members: s.room.members.map(({ userId: _userId, ...rest }) => rest) },
        })),
      );

      // Assert
      expect(/session-secret/.test(json)).toBe(false);
      expect(/user-secret/.test(withoutIdFields)).toBe(false);
      expect(snapshotForMember(playing, STANDER.userId, 0, NOW).room?.members.map((m) => m.userId)).toEqual([
        HUMANS[0]!.userId,
        STANDER.userId,
      ]);
      expect(snapshotForMember(playing, STANDER.userId, 0, NOW).players.map((p) => p?.userId)).toEqual([
        HUMANS[0]!.userId,
        undefined,
        undefined,
        undefined,
      ]);
    });

    it('should point room.you at the seated member own entry', () => {
      // Arrange
      const state = fullWaitingRoom();

      // Act
      const snapshot = snapshotForMember(state, HUMANS[2]!.userId, 0, NOW);

      // Assert
      expect({ seat: snapshot.seat, you: snapshot.room?.you }).toEqual({ seat: 2, you: 2 });
    });

    it('should point room.you at the standing member own entry', () => {
      // Arrange
      const state = fullWaitingRoom();

      // Act
      const snapshot = snapshotForMember(state, STANDER.userId, 0, NOW);

      // Assert
      expect({ seat: snapshot.seat, you: snapshot.room?.you }).toEqual({ seat: -1, you: 4 });
    });

    it('should report no scores while waiting', () => {
      // Arrange
      const state = fullWaitingRoom();

      // Act
      const snapshot = snapshotForMember(state, STANDER.userId, 0, NOW);

      // Assert
      expect(snapshot.room?.scores).toBeNull();
    });

    it('should report the game scores during play', () => {
      // Arrange
      const state = driveTo(
        startedWithStander(SEEDS[0]!),
        (s) => s.phase === 'playing' && s.game !== null && s.game.scores[0] + s.game.scores[1] > 0,
      );
      const game = gameOf(state);

      // Act
      const snapshot = snapshotForMember(state, STANDER.userId, 0, NOW);

      // Assert
      expect(snapshot.room?.scores).toEqual([game.scores[0], game.scores[1]]);
    });

    it('should report resetAt as finishedAt plus ROOM_RESET_MS once finished', () => {
      // Arrange
      const state = driveTo(startedWithStander(SEEDS[0]!), (s) => s.phase === 'finished');

      // Act
      const snapshot = snapshotForMember(state, STANDER.userId, 0, NOW);

      // Assert
      expect(snapshot.room?.resetAt).toBe((state.finishedAt ?? Number.NaN) + ROOM_RESET_MS);
    });

    it('should report no resetAt while waiting, playing or between rounds', () => {
      // Arrange
      const playing = startedWithStander(SEEDS[0]!);
      const between = driveTo(playing, (s) => s.phase === 'between');
      const states = [fullWaitingRoom(), playing, between];

      // Act
      const result = states.map((s) => [s.phase, snapshotForMember(s, STANDER.userId, 0, NOW).room?.resetAt]);

      // Assert
      expect(result).toEqual([
        ['waiting', null],
        ['playing', null],
        ['between', null],
      ]);
    });

    it('should report no backfillAt on a private table while waiting with humans seated or playing', () => {
      // Arrange
      const states = [privateSeated(1, SEEDS[0]!), fullWaitingRoom(), startedWithStander(SEEDS[0]!)];

      // Act
      const result = states.map((s) => snapshotFor(s, 0, 0, NOW).backfillAt);

      // Assert
      expect(result).toEqual([null, null, null]);
    });

    it('should carry no room key at all in a public snapshot', () => {
      // Arrange
      const state = seatHumans(4, SEEDS[0]!);

      // Act
      const snapshot = snapshotFor(state, 0, 0, NOW);

      // Assert
      expect(Object.prototype.hasOwnProperty.call(snapshot, 'room')).toBe(false);
    });
  });

  describe('snapshotForMember', () => {
    it('should throw a RangeError on a public table', () => {
      // Arrange
      const state = seatHumans(2, SEEDS[0]!);

      // Act
      const call = () => snapshotForMember(state, HUMANS[0]!.userId, 0, NOW);

      // Assert
      expect(call).toThrow(RangeError);
    });

    it('should throw a RangeError for a user who is not a member', () => {
      // Arrange
      const state = privateSeated(2, SEEDS[0]!);

      // Act
      const call = () => snapshotForMember(state, 'not-a-member', 0, NOW);

      // Assert
      expect(call).toThrow(RangeError);
    });

    it('should throw a RangeError for a standing member who left', () => {
      // Arrange
      const playing = startedWithStander(SEEDS[0]!);
      const left = leave(playing, { userId: STANDER.userId, sessionId: STANDER.sessionId }, NOW);

      // Act
      const call = () => snapshotForMember(left, STANDER.userId, 0, NOW);

      // Assert
      expect(call).toThrow(RangeError);
    });
  });
});

describe('players userId against the shared friends fixture', () => {
  /** Per seat: null for an empty seat, else whether it is a bot and which keys it carries. */
  function userIdPattern(players: readonly (PlayerInfo | null)[]): unknown[] {
    return players.map((p) => (p === null ? null : { isBot: p.isBot, keys: Object.keys(p).sort() }));
  }

  /** Public game with humans in seats 0 and 2 and bots in 1 and 3, like the fixture. */
  function humansAcrossBots(): TableState {
    const waiting = leave(seatHumans(3, SEEDS[0]!), presenceOf(1), NOW);
    const playing = tick(waiting, NOW + BACKFILL_MS);
    if (playing.phase !== 'playing') throw new Error(`expected a started game, got ${playing.phase}`);
    return playing;
  }

  it('should project the same userId pattern as PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS (humans keyed, bots not)', () => {
    // Arrange
    const state = humansAcrossBots();

    // Act
    const players = snapshotFor(state, 0, 0, NOW + BACKFILL_MS).players;

    // Assert
    expect(userIdPattern(players)).toEqual(userIdPattern(PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS.players));
  });
});
