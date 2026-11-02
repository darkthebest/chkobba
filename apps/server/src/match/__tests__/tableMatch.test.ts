/**
 * Nakama adapter for `chkobba_table`: handler functions are called directly
 * with fake ctx/logger/nk/dispatcher. Game rules, timers and bots are the pure
 * core's job (tested under src/table); this suite covers the I/O mapping:
 * seat reservations, who receives what, when, and when the match ends.
 * Handlers read `Date.now()`, so the clock is faked (Date only).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMOTE_COOLDOWN_MS,
  OpCode,
  ROOM_COLLECTION,
  ROOM_JOIN_CODE_KEY,
  ROOM_MAX_MEMBERS,
  type EmoteShown,
  type ErrorPayload,
  type Snapshot,
  type TableLabel,
} from '@chkobba/protocol';
import {
  COMPETITIVE_STATS_KEY,
  RECENT_PLAYERS_KEY,
  SOCIAL_COLLECTION,
  STATS_COLLECTION,
} from '@chkobba/protocol';
import { SYSTEM_USER_ID } from '../../rpc/roomStore';
import type { Card } from '@chkobba/rules';
import {
  EMPTY_TIMEOUT_MS,
  JOIN_TIMEOUT_MS,
  LINGER_AFTER_FINISH_MS,
  MAX_MESSAGE_BYTES,
  TICK_RATE,
  canonicalJson,
  snapshotFingerprint,
  matchInit,
  matchJoin,
  matchJoinAttempt,
  matchLeave,
  matchLoop,
  matchSignal,
  matchTerminate,
  terminationReason,
  type TableMatchState,
} from '../tableMatch';
import { BACKFILL_MS } from '../../table';
import { MAX_SIGNAL_BYTES } from '../../social/matchSignal';
import {
  createContext,
  createFakeDispatcher,
  createFakeLogger,
  createFakeNk,
  createPresence,
  FAKE_SEED,
  jsonMessage,
  rawMessage,
} from '../../__tests__/fakes';

const T0 = 1_700_000_000_000;

type FakeDispatcher = ReturnType<typeof createFakeDispatcher>;

interface Sent {
  readonly opCode: number;
  readonly payload: unknown;
  readonly presences: unknown;
}

const ctx = createContext();
let logger: ReturnType<typeof createFakeLogger>;
let nk: ReturnType<typeof createFakeNk>;
let dispatcher: FakeDispatcher;

function resetFakes(): void {
  logger = createFakeLogger();
  nk = createFakeNk();
  dispatcher = createFakeDispatcher();
}

function at(ms: number): void {
  vi.setSystemTime(ms);
}

function init(now: number = T0): TableMatchState {
  at(now);
  return matchInit(ctx, logger, nk, {}).state;
}

function attempt(state: TableMatchState, presence: nkruntime.Presence, now: number) {
  at(now);
  return matchJoinAttempt(ctx, logger, nk, dispatcher, 0, state, presence, {});
}

function attemptOk(state: TableMatchState, presence: nkruntime.Presence, now: number): TableMatchState {
  const result = attempt(state, presence, now);
  if (!result.accept) throw new Error(`join attempt of ${presence.userId} rejected: ${result.rejectMessage}`);
  return result.state;
}

function join(state: TableMatchState, presence: nkruntime.Presence, now: number): TableMatchState {
  at(now);
  return matchJoin(ctx, logger, nk, dispatcher, 0, state, [presence]).state;
}

/** Accepted join attempt followed by the join, both at `now`. */
function seat(state: TableMatchState, presence: nkruntime.Presence, now: number): TableMatchState {
  return join(attemptOk(state, presence, now), presence, now);
}

function leave(state: TableMatchState, presence: nkruntime.Presence, now: number): TableMatchState {
  at(now);
  return matchLeave(ctx, logger, nk, dispatcher, 0, state, [presence]).state;
}

function loop(
  state: TableMatchState,
  now: number,
  messages: nkruntime.MatchMessage[] = [],
  d: FakeDispatcher = dispatcher,
): TableMatchState | null {
  at(now);
  const result = matchLoop(ctx, logger, nk, d, 0, state, messages);
  return result === null ? null : result.state;
}

function loopOk(state: TableMatchState, now: number, messages: nkruntime.MatchMessage[] = []): TableMatchState {
  const next = loop(state, now, messages);
  if (next === null) throw new Error('match terminated unexpectedly');
  return next;
}

function sent(d: FakeDispatcher = dispatcher): Sent[] {
  return d.broadcastMessage.mock.calls.map((call) => ({
    opCode: call[0] as number,
    payload: JSON.parse(call[1] as string) as unknown,
    presences: call[2],
  }));
}

function snapshotsTo(sessionId: string, d: FakeDispatcher = dispatcher): Snapshot[] {
  return sent(d)
    .filter((m) => m.opCode === OpCode.SNAPSHOT)
    .filter((m) => Array.isArray(m.presences) && m.presences.some((p: nkruntime.Presence) => p.sessionId === sessionId))
    .map((m) => m.payload as Snapshot);
}

function lastLabel(d: FakeDispatcher = dispatcher): TableLabel {
  const calls = d.matchLabelUpdate.mock.calls;
  const last = calls[calls.length - 1];
  if (!last) throw new Error('no label update');
  return JSON.parse(last[0] as string) as TableLabel;
}

function seatOf(state: TableMatchState, userId: string): number {
  return state.table.seats.findIndex((slot) => slot !== null && slot.kind === 'human' && slot.userId === userId);
}

/** Deep copy with every object's keys reversed, as a Go map round-trip may reorder them. */
function reorderKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reorderKeys) as unknown as T;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(record).reverse()) out[key] = reorderKeys(record[key]);
    return out as T;
  }
  return value;
}

const ids = (list: readonly Card[]): string[] => list.map((c) => c.id);

const u1 = createPresence(1);
const u2 = createPresence(2);
const u3 = createPresence(3);
const u4 = createPresence(4);
const u5 = createPresence(5);

/** Four humans seated at T0: the game starts immediately. */
function fullTable(): TableMatchState {
  let state = init();
  for (const p of [u1, u2, u3, u4]) state = seat(state, p, T0);
  return state;
}

describe('tableMatch adapter', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    resetFakes();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('matchInit', () => {
    it('should run at the module tick rate with the open label', () => {
      // Arrange
      at(T0);

      // Act
      const result = matchInit(ctx, logger, nk, {});

      // Assert
      expect({ tickRate: result.tickRate, label: JSON.parse(result.label) as TableLabel }).toEqual({
        tickRate: TICK_RATE,
        label: { open: true, mode: '2v2', seatsFree: 4, private: false },
      });
    });
  });

  describe('matchJoinAttempt', () => {
    it('should accept a stranger and claim the lowest free seat when the table is waiting', () => {
      // Arrange
      const state = init();

      // Act
      const result = attempt(state, u1, T0);

      // Assert
      expect({ accept: result.accept, seat: seatOf(result.state, 'u1') }).toEqual({ accept: true, seat: 0 });
    });

    it('should reject a stranger with table_full when the game has started', () => {
      // Arrange
      const state = fullTable();

      // Act
      const result = attempt(state, u5, T0 + 1000);

      // Assert
      expect({ accept: result.accept, rejectMessage: result.rejectMessage }).toEqual({
        accept: false,
        rejectMessage: 'table_full',
      });
    });

    it('should leave the state untouched when the attempt is rejected', () => {
      // Arrange
      const state = fullTable();

      // Act
      const result = attempt(state, u5, T0 + 1000);

      // Assert
      expect(result.state).toBe(state);
    });

    it('should accept the user holding a reserved seat when they reconnect to a started game', () => {
      // Arrange
      const left = leave(fullTable(), u2, T0 + 1000);
      const u2Again = createPresence(2, 's2-new');

      // Act
      const result = attempt(left, u2Again, T0 + 2000);

      // Assert
      expect({ accept: result.accept, seat: seatOf(result.state, 'u2') }).toEqual({ accept: true, seat: 1 });
    });

    it('should reject the last seat for the second of two simultaneous attempts', () => {
      // Arrange
      let state = init();
      for (const p of [u1, u2, u3]) state = seat(state, p, T0);
      const first = attemptOk(state, u4, T0);

      // Act
      const second = attempt(first, u5, T0);

      // Assert
      expect(second.accept).toBe(false);
    });

    it('should not send a snapshot to a session whose join has not completed', () => {
      // Arrange
      const state = init();

      // Act
      attempt(state, u1, T0);

      // Assert
      expect(dispatcher.broadcastMessage).not.toHaveBeenCalled();
    });
  });

  describe('reservation expiry', () => {
    it('should keep the reserved seat when the join is still within the timeout', () => {
      // Arrange
      const reserved = attemptOk(init(), u1, T0);

      // Act
      const next = loopOk(reserved, T0 + JOIN_TIMEOUT_MS);

      // Assert
      expect(seatOf(next, 'u1')).toBe(0);
    });

    it('should free the seat when matchJoin never comes within the timeout', () => {
      // Arrange
      const reserved = attemptOk(init(), u1, T0);

      // Act
      const next = loopOk(reserved, T0 + JOIN_TIMEOUT_MS + 1);

      // Assert
      expect({ seats: next.table.seats, connections: next.connections }).toEqual({
        seats: [null, null, null, null],
        connections: {},
      });
    });

    it('should republish the open label when an expired reservation frees the seat', () => {
      // Arrange
      const reserved = attemptOk(init(), u1, T0);
      dispatcher.matchLabelUpdate.mockClear();

      // Act
      loopOk(reserved, T0 + JOIN_TIMEOUT_MS + 1);

      // Assert
      expect(lastLabel().seatsFree).toBe(4);
    });
  });

  describe('snapshots', () => {
    it('should send the joining session a full snapshot only to its own presence', () => {
      // Arrange
      const reserved = attemptOk(init(), u1, T0);

      // Act
      join(reserved, u1, T0);

      // Assert
      expect(dispatcher.broadcastMessage.mock.calls.map((call) => [call[0], call[2]])).toEqual([[OpCode.SNAPSHOT, [u1]]]);
    });

    it('should address each start-of-game snapshot to one presence with its own seat and cut view', () => {
      // Arrange
      let state = init();
      for (const p of [u1, u2, u3]) state = seat(state, p, T0);
      dispatcher.broadcastMessage.mockClear();

      // Act
      const started = seat(state, u4, T0);

      // Assert
      const game = started.table.game!;
      const problems: string[] = [];
      for (const call of dispatcher.broadcastMessage.mock.calls) {
        const presences = call[2] as nkruntime.Presence[];
        const snapshot = JSON.parse(call[1] as string) as Snapshot;
        if (presences.length !== 1) problems.push(`sent to ${presences.length} presences`);
        const recipient = presences[0]!;
        const seatIndex = seatOf(started, recipient.userId);
        if (snapshot.seat !== seatIndex) problems.push(`${recipient.userId} got seat ${snapshot.seat}`);
        // Hands are dealt after the cut; only the cutter may see the cut card.
        const cutCard = snapshot.view!.cut?.card ?? null;
        if (cutCard !== null && seatIndex !== game.turn) problems.push(`${recipient.userId} saw the cut card`);
      }
      expect(problems).toEqual([]);
    });

    it('should send nothing when a loop has nothing due', () => {
      // Arrange
      const state = seat(init(), u1, T0);
      dispatcher.broadcastMessage.mockClear();

      // Act
      loopOk(state, T0 + 1000);

      // Assert
      expect(dispatcher.broadcastMessage).not.toHaveBeenCalled();
    });

    it('should send nothing when Nakama hands the state back with reordered keys', () => {
      // Arrange
      const state = seat(seat(init(), u1, T0), u2, T0);
      dispatcher.broadcastMessage.mockClear();

      // Act
      loopOk(reorderKeys(state), T0 + 1000);

      // Assert
      expect(dispatcher.broadcastMessage).not.toHaveBeenCalled();
    });

    it('should send nothing on idle loops while waiting even though serverTime moves every loop', () => {
      // Arrange
      let state = seat(seat(init(), u1, T0), u2, T0);
      dispatcher.broadcastMessage.mockClear();

      // Act
      for (let t = T0 + 1000; t < T0 + BACKFILL_MS; t += 1000) state = loopOk(state, t);

      // Assert
      expect(dispatcher.broadcastMessage).not.toHaveBeenCalled();
    });

    it('should send nothing on idle loops while a human turn timer runs', () => {
      // Arrange
      let state = fullTable();
      const deadline = state.table.turnDeadline!;
      dispatcher.broadcastMessage.mockClear();

      // Act
      for (let t = T0 + 1000; t < deadline; t += 1000) state = loopOk(state, t);

      // Assert
      expect({ timerRan: deadline > T0 + 1000, sent: dispatcher.broadcastMessage.mock.calls.length }).toEqual({
        timerRan: true,
        sent: 0,
      });
    });

    it('should stamp each sent snapshot with the server time of the call that sent it', () => {
      // Arrange
      const state = seat(init(), u1, T0);
      dispatcher.broadcastMessage.mockClear();

      // Act
      seat(state, u2, T0 + 2500);

      // Assert
      expect([...snapshotsTo('s1'), ...snapshotsTo('s2')].map((s) => s.serverTime)).toEqual([T0 + 2500, T0 + 2500]);
    });

    it('should fingerprint snapshots without serverTime or the log', () => {
      // Arrange
      seat(init(), u1, T0);
      const base = snapshotsTo('s1')[0]!;

      // Act
      const a = snapshotFingerprint(3, base);
      const b = snapshotFingerprint(3, { ...base, serverTime: T0 + 60_000, log: [] });
      const c = snapshotFingerprint(3, { ...base, backfillAt: (base.backfillAt ?? 0) + 1 });

      // Assert
      expect({ sameDespiteTime: a === b, differsOnChange: a !== c }).toEqual({ sameDespiteTime: true, differsOnChange: true });
    });

    it('should send the other seated session a snapshot when someone takes a seat', () => {
      // Arrange
      const state = seat(init(), u1, T0);
      dispatcher.broadcastMessage.mockClear();

      // Act
      seat(state, u2, T0 + 500);

      // Assert
      expect(snapshotsTo('s1').map((s) => s.players[1]?.name)).toEqual(['Player 2']);
    });
  });

  describe('reconnection', () => {
    function reconnectDuringGame() {
      const playing = fullTable();
      expect(playing.table.log.length).toBeGreaterThan(0);
      const u1New = createPresence(1, 's1-new');
      const reserved = attemptOk(playing, u1New, T0 + 3000);
      dispatcher.broadcastMessage.mockClear();
      dispatcher.matchKick.mockClear();
      return { u1New, reserved };
    }

    it('should kick the older session of the same user when the new session joins', () => {
      // Arrange
      const { u1New, reserved } = reconnectDuringGame();

      // Act
      join(reserved, u1New, T0 + 3000);

      // Assert
      expect(dispatcher.matchKick.mock.calls).toEqual([[[u1]]]);
    });

    it('should send the new session the whole log from seq 1', () => {
      // Arrange
      const { u1New, reserved } = reconnectDuringGame();

      // Act
      const joined = join(reserved, u1New, T0 + 3000);

      // Assert
      const snapshots = snapshotsTo('s1-new');
      expect(snapshots.map((s) => s.log.map((e) => e.seq))).toEqual([joined.table.log.map((_entry, i) => i + 1)]);
    });

    it('should not send anything to the replaced session', () => {
      // Arrange
      const { u1New, reserved } = reconnectDuringGame();

      // Act
      const joined = join(reserved, u1New, T0 + 3000);
      loopOk(joined, T0 + 4000);

      // Assert
      expect(snapshotsTo('s1')).toEqual([]);
    });
  });

  describe('display names', () => {
    function seatNameSeenBy(sessionId: string, seatIndex: number): string | undefined {
      const snapshots = snapshotsTo(sessionId);
      return snapshots[snapshots.length - 1]?.players[seatIndex]?.name;
    }

    it('should use the account display name as the seat name', () => {
      // Arrange
      nk.fake.seedAccount('u1', { username: 'Player 1', displayName: 'Hamza' });

      // Act
      seat(init(), u1, T0);

      // Assert
      expect(seatNameSeenBy('s1', 0)).toBe('Hamza');
    });

    it.each([
      { scenario: 'empty', displayName: '' },
      { scenario: 'blank', displayName: '   ' },
    ])('should fall back to the username when the display name is $scenario', ({ displayName }) => {
      // Arrange
      nk.fake.seedAccount('u1', { username: 'Player 1', displayName });

      // Act
      seat(init(), u1, T0);

      // Assert
      expect(seatNameSeenBy('s1', 0)).toBe('Player 1');
    });

    it('should still accept the join when the display name lookup throws', () => {
      // Arrange
      nk.fake.failUsersGetId();

      // Act
      const result = attempt(init(), u1, T0);

      // Assert
      expect(result.accept).toBe(true);
    });

    it('should log a warning when the display name lookup throws', () => {
      // Arrange
      nk.fake.failUsersGetId();

      // Act
      attempt(init(), u1, T0);

      // Assert
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should use the username as the seat name when the display name lookup throws', () => {
      // Arrange
      nk.fake.seedAccount('u1', { username: 'Player 1', displayName: 'Hamza' });
      nk.fake.failUsersGetId();

      // Act
      seat(init(), u1, T0);

      // Assert
      expect(seatNameSeenBy('s1', 0)).toBe('Player 1');
    });

    it('should not look the display name up again when the join completes', () => {
      // Arrange
      nk.fake.seedAccount('u1', { username: 'Player 1', displayName: 'Hamza' });
      const reserved = attemptOk(init(), u1, T0);
      nk.usersGetId.mockClear();

      // Act
      join(reserved, u1, T0);

      // Assert
      expect(nk.usersGetId).not.toHaveBeenCalled();
    });

    it('should show the new name to the other seats when a renamed player reconnects', () => {
      // Arrange
      nk.fake.seedAccount('u1', { username: 'Player 1', displayName: 'Old' });
      const left = leave(fullTable(), u1, T0 + 1000);
      nk.fake.seedAccount('u1', { username: 'Player 1', displayName: 'New' });
      dispatcher.broadcastMessage.mockClear();

      // Act
      seat(left, createPresence(1, 's1-new'), T0 + 2000);

      // Assert
      expect(seatNameSeenBy('s2', 0)).toBe('New');
    });
  });

  describe('errors', () => {
    function waitingWithTwo(): TableMatchState {
      const state = seat(seat(init(), u1, T0), u2, T0);
      dispatcher.broadcastMessage.mockClear();
      return state;
    }

    function errorsSent(): { presences: unknown; payload: unknown }[] {
      return sent()
        .filter((m) => m.opCode === OpCode.ERROR)
        .map((m) => ({ presences: m.presences, payload: m.payload }));
    }

    it('should send bad_payload only to the sender when the body is not JSON', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      loopOk(state, T0 + 1000, [rawMessage(u1, OpCode.PLAY, '{not json')]);

      // Assert
      const expected: ErrorPayload = { code: 'bad_payload' };
      expect(errorsSent()).toEqual([{ presences: [u1], payload: expected }]);
    });

    it('should send bad_payload only to the sender when the body exceeds the size limit', () => {
      // Arrange
      const state = waitingWithTwo();
      const oversized = { cardId: '1D', capture: [], pad: 'x'.repeat(MAX_MESSAGE_BYTES) };

      // Act
      loopOk(state, T0 + 1000, [jsonMessage(u2, OpCode.PLAY, oversized)]);

      // Assert
      const expected: ErrorPayload = { code: 'bad_payload' };
      expect(errorsSent()).toEqual([{ presences: [u2], payload: expected }]);
    });

    it('should send wrong_phase only to the sender when a card is played while waiting', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      loopOk(state, T0 + 1000, [jsonMessage(u1, OpCode.PLAY, { cardId: '1D', capture: [] })]);

      // Assert
      const expected: ErrorPayload = { code: 'wrong_phase' };
      expect(errorsSent()).toEqual([{ presences: [u1], payload: expected }]);
    });

    it('should accept an empty body as a payload-less BACK without any error', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      loopOk(state, T0 + 1000, [rawMessage(u1, OpCode.BACK, '')]);

      // Assert
      expect(errorsSent()).toEqual([]);
    });

    it('should leave the table untouched when a message is rejected', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      const next = loopOk(state, T0 + 1000, [rawMessage(u1, OpCode.PLAY, '{not json')]);

      // Assert
      expect(next.table).toBe(state.table);
    });
  });

  describe('emotes', () => {
    function waitingWithTwo(): TableMatchState {
      const state = seat(seat(init(), u1, T0), u2, T0);
      dispatcher.broadcastMessage.mockClear();
      return state;
    }

    function emotesSent(): { presences: unknown; payload: unknown }[] {
      return sent()
        .filter((m) => m.opCode === OpCode.EMOTE_SHOWN)
        .map((m) => ({ presences: m.presences, payload: m.payload }));
    }

    it('should relay an emote to every seated session, sender included', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      loopOk(state, T0 + 1000, [jsonMessage(u2, OpCode.EMOTE, { id: 'yalla' })]);

      // Assert
      const expected: EmoteShown = { seat: 1, id: 'yalla' };
      expect(emotesSent()).toEqual([{ presences: [u1, u2], payload: expected }]);
    });

    it('should drop a second emote from the same seat inside the cooldown', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      const next = loopOk(state, T0 + 1000, [jsonMessage(u1, OpCode.EMOTE, { id: 'laugh' })]);
      loopOk(next, T0 + 1000 + EMOTE_COOLDOWN_MS - 1, [jsonMessage(u1, OpCode.EMOTE, { id: 'fire' })]);

      // Assert
      expect(emotesSent().map((m) => m.payload)).toEqual([{ seat: 0, id: 'laugh' }]);
    });

    it('should keep a separate cooldown per seat', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      loopOk(state, T0 + 1000, [jsonMessage(u1, OpCode.EMOTE, { id: 'laugh' }), jsonMessage(u2, OpCode.EMOTE, { id: 'fire' })]);

      // Assert
      expect(emotesSent().map((m) => m.payload)).toEqual([
        { seat: 0, id: 'laugh' },
        { seat: 1, id: 'fire' },
      ]);
    });

    it('should relay again once the cooldown has passed', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      const next = loopOk(state, T0 + 1000, [jsonMessage(u1, OpCode.EMOTE, { id: 'laugh' })]);
      loopOk(next, T0 + 1000 + EMOTE_COOLDOWN_MS, [jsonMessage(u1, OpCode.EMOTE, { id: 'bravo' })]);

      // Assert
      expect(emotesSent().map((m) => m.payload)).toEqual([
        { seat: 0, id: 'laugh' },
        { seat: 0, id: 'bravo' },
      ]);
    });

    it('should send bad_payload only to the sender for an unknown emote and relay nothing', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      loopOk(state, T0 + 1000, [jsonMessage(u1, OpCode.EMOTE, { id: 'kiss' })]);

      // Assert
      const errors = sent().filter((m) => m.opCode === OpCode.ERROR);
      const expected: ErrorPayload = { code: 'bad_payload' };
      expect({ errors: errors.map((m) => ({ presences: m.presences, payload: m.payload })), emotes: emotesSent() }).toEqual({
        errors: [{ presences: [u1], payload: expected }],
        emotes: [],
      });
    });

    it('should leave the table state untouched', () => {
      // Arrange
      const state = waitingWithTwo();

      // Act
      const next = loopOk(state, T0 + 1000, [jsonMessage(u1, OpCode.EMOTE, { id: 'thumbs' })]);

      // Assert
      expect(next.table).toBe(state.table);
    });

    it('should accept emotes on match state saved before emotes existed', () => {
      // Arrange
      const { emoteAt: _emoteAt, ...legacy } = waitingWithTwo();

      // Act
      loopOk(legacy as TableMatchState, T0 + 1000, [jsonMessage(u1, OpCode.EMOTE, { id: 'thumbs' })]);

      // Assert
      expect(emotesSent().map((m) => m.payload)).toEqual([{ seat: 0, id: 'thumbs' }]);
    });
  });

  describe('label', () => {
    it('should update the label when a seat is claimed', () => {
      // Arrange
      const state = init();

      // Act
      attempt(state, u1, T0);

      // Assert
      expect(lastLabel()).toEqual({ open: true, mode: '2v2', seatsFree: 3, private: false });
    });

    it('should not update the label when a loop changes nothing', () => {
      // Arrange
      const state = seat(init(), u1, T0);
      dispatcher.matchLabelUpdate.mockClear();

      // Act
      loopOk(state, T0 + 1000);

      // Assert
      expect(dispatcher.matchLabelUpdate).not.toHaveBeenCalled();
    });

    it('should not update the label when the reserved user completes the join', () => {
      // Arrange
      const reserved = attemptOk(init(), u1, T0);
      dispatcher.matchLabelUpdate.mockClear();

      // Act
      join(reserved, u1, T0);

      // Assert
      expect(dispatcher.matchLabelUpdate).not.toHaveBeenCalled();
    });

    it('should close the label when the backfill starts the game', () => {
      // Arrange
      const state = seat(init(), u1, T0);
      dispatcher.matchLabelUpdate.mockClear();

      // Act
      loopOk(state, T0 + BACKFILL_MS);

      // Assert
      expect(dispatcher.matchLabelUpdate.mock.calls.map((call) => JSON.parse(call[0] as string) as TableLabel)).toEqual([
        { open: false, mode: '2v2', seatsFree: 0, private: false },
      ]);
    });
  });

  describe('termination', () => {
    it('should keep a table nobody joined running at 59 s', () => {
      // Arrange
      const state = init();

      // Act
      const next = loop(state, T0 + EMPTY_TIMEOUT_MS - 1000);

      // Assert
      expect(next).not.toBeNull();
    });

    it('should end a table nobody joined after 60 s', () => {
      // Arrange
      const state = init();

      // Act
      const next = loop(state, T0 + EMPTY_TIMEOUT_MS);

      // Assert
      expect(next).toBeNull();
    });

    it('should keep the table running at 59 s after the last session left', () => {
      // Arrange
      const left = leave(seat(init(), u1, T0), u1, T0 + 5000);

      // Act
      const next = loop(left, T0 + 5000 + EMPTY_TIMEOUT_MS - 1000);

      // Assert
      expect(next).not.toBeNull();
    });

    it('should end the table 60 s after the last session left', () => {
      // Arrange
      const left = leave(seat(init(), u1, T0), u1, T0 + 5000);

      // Act
      const next = loop(left, T0 + 5000 + EMPTY_TIMEOUT_MS);

      // Assert
      expect(next).toBeNull();
    });

    it('should not count a table as empty while a session is connected', () => {
      // Arrange
      const state = seat(init(), u1, T0);

      // Act
      const next = loopOk(state, T0 + EMPTY_TIMEOUT_MS + 1000);

      // Assert
      expect(next.emptySince).toBeNull();
    });
  });

  describe('a full game with two idle humans and two backfilled bots', () => {
    /** Upper bound on 1 s loops; a game to 21 with idle humans takes far fewer. */
    const MAX_LOOPS = 20000;

    interface Run {
      readonly finished: TableMatchState | null;
      readonly snapshotCount: number;
      /** Snapshots whose view carried a dealt hand (so the leak checks are not vacuous). */
      readonly handSnapshotCount: number;
      readonly addressing: string[];
      readonly wrongHands: string[];
      readonly leaks: string[];
      readonly otherOpcodes: number[];
    }

    let run: Run;

    beforeAll(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      resetFakes();
      const addressing: string[] = [];
      const wrongHands: string[] = [];
      const leaks: string[] = [];
      const otherOpcodes: number[] = [];
      let snapshotCount = 0;
      let handSnapshotCount = 0;

      const check = (state: TableMatchState, d: FakeDispatcher, when: number): void => {
        for (const call of d.broadcastMessage.mock.calls) {
          const opCode = call[0] as number;
          if (opCode !== OpCode.SNAPSHOT) {
            otherOpcodes.push(opCode);
            continue;
          }
          snapshotCount++;
          const presences = call[2] as nkruntime.Presence[];
          const recipient = presences[0];
          const connection = recipient ? state.connections[recipient.sessionId] : undefined;
          if (presences.length !== 1 || !recipient || !connection || canonicalJson(connection.presence) !== canonicalJson(recipient)) {
            addressing.push(`t=${when}: sent to ${JSON.stringify(presences)}`);
            continue;
          }
          const snapshot = JSON.parse(call[1] as string) as Snapshot;
          const seatIndex = seatOf(state, recipient.userId);
          const game = state.table.game;
          if (snapshot.seat !== seatIndex) addressing.push(`t=${when}: ${recipient.userId} got seat ${snapshot.seat}`);
          if (game === null || snapshot.view === null) continue;
          if (snapshot.view.hand.length > 0) handSnapshotCount++;
          if (canonicalJson(ids(snapshot.view.hand)) !== canonicalJson(ids(game.hands[seatIndex] ?? []))) {
            wrongHands.push(`t=${when}: ${recipient.userId}`);
          }
          const hidden = new Set<string>(ids(game.stock));
          game.hands.forEach((hand, i) => {
            if (i !== seatIndex) for (const id of ids(hand)) hidden.add(id);
          });
          if (game.cutCard !== null && game.turn !== seatIndex) hidden.add(game.cutCard.id);
          const view = snapshot.view;
          const visible = [
            ...ids(view.hand),
            ...ids(view.table),
            ...ids(view.piles[0]),
            ...ids(view.piles[1]),
            ...(view.cut && view.cut.card ? [view.cut.card.id] : []),
          ];
          const leaked = visible.filter((id) => hidden.has(id));
          const raw = call[1] as string;
          if (leaked.length > 0) leaks.push(`t=${when}: ${recipient.userId} saw ${leaked.join(',')}`);
          if (raw.includes('"hands":') || raw.includes('"stock":')) leaks.push(`t=${when}: raw hands/stock field`);
        }
        d.broadcastMessage.mockClear();
      };

      let state = init();
      state = attemptOk(state, u1, T0);
      state = join(state, u1, T0);
      check(state, dispatcher, T0);
      state = attemptOk(state, u2, T0);
      state = join(state, u2, T0);
      check(state, dispatcher, T0);

      let now = T0;
      let finished: TableMatchState | null = null;
      for (let i = 0; i < MAX_LOOPS; i++) {
        now += 1000;
        const next = loop(state, now);
        if (next === null) break;
        state = next;
        check(state, dispatcher, now);
        if (state.table.phase === 'finished') {
          finished = state;
          break;
        }
      }
      run = { finished, snapshotCount, handSnapshotCount, addressing, wrongHands, leaks, otherOpcodes };
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it('should reach the finished phase through 1 s loops', () => {
      // Arrange (game played in beforeAll)
      const finished = run.finished;

      // Act
      const phase = finished === null ? null : finished.table.phase;

      // Assert
      expect(phase).toBe('finished');
    });

    it('should have sent snapshots carrying dealt hands during the game', () => {
      // Arrange
      const { snapshotCount, handSnapshotCount } = run;

      // Act
      const enough = snapshotCount > 0 && handSnapshotCount > 100;

      // Assert
      expect({ enough, snapshotCount, handSnapshotCount }).toMatchObject({ enough: true });
    });

    it('should address every snapshot to exactly the recipient presence and its seat', () => {
      // Arrange
      const problems = run.addressing;

      // Act
      const count = problems.length;

      // Assert
      expect({ count, first: problems.slice(0, 5) }).toEqual({ count: 0, first: [] });
    });

    it('should put only the recipient seat hand in every snapshot view', () => {
      // Arrange
      const problems = run.wrongHands;

      // Act
      const count = problems.length;

      // Assert
      expect({ count, first: problems.slice(0, 5) }).toEqual({ count: 0, first: [] });
    });

    it('should never reveal another hand, the stock or a hidden cut card in any snapshot', () => {
      // Arrange
      const problems = run.leaks;

      // Act
      const count = problems.length;

      // Assert
      expect({ count, first: problems.slice(0, 5) }).toEqual({ count: 0, first: [] });
    });

    it('should send no error when nobody sends a message', () => {
      // Arrange
      const opcodes = run.otherOpcodes;

      // Act
      const unique = Array.from(new Set(opcodes));

      // Assert
      expect(unique).toEqual([]);
    });

    it('should keep the finished table up at 59 s after the finish', () => {
      // Arrange
      const finished = run.finished!;
      const finishedAt = finished.table.finishedAt!;

      // Act
      const next = loop(finished, finishedAt + LINGER_AFTER_FINISH_MS - 1000, [], createFakeDispatcher());

      // Assert
      expect(next).not.toBeNull();
    });

    it('should end the match 60 s after the finish', () => {
      // Arrange
      const finished = run.finished!;
      const finishedAt = finished.table.finishedAt!;

      // Act
      const next = loop(finished, finishedAt + LINGER_AFTER_FINISH_MS, [], createFakeDispatcher());

      // Assert
      expect(next).toBeNull();
    });
  });

  describe('matchTerminate and matchSignal', () => {
    it('should return the state unchanged on terminate', () => {
      // Arrange
      const state = init();

      // Act
      const result = matchTerminate(ctx, logger, nk, dispatcher, 0, state, 10);

      // Assert
      expect(result.state).toBe(state);
    });

    it('should return the state unchanged on signal', () => {
      // Arrange
      const state = init();

      // Act
      const result = matchSignal(ctx, logger, nk, dispatcher, 0, state, 'anything');

      // Assert
      expect(result.state).toBe(state);
    });

    describe('matchSignal', () => {
      const SIGNAL_CODE = 'K7M2QX';
      const memberQuery = (userId: string | undefined): string => JSON.stringify({ type: 'is_member', userId });

      /** A private table with `users` present, joined through the room code at T0. */
      function privateRoom(users: readonly nkruntime.Presence[]): TableMatchState {
        at(T0);
        let state = matchInit(ctx, logger, nk, { private: 'true', code: SIGNAL_CODE }).state;
        for (const presence of users) {
          at(T0);
          const attempt = matchJoinAttempt(ctx, logger, nk, dispatcher, 0, state, presence, {
            [ROOM_JOIN_CODE_KEY]: SIGNAL_CODE,
          });
          if (!attempt.accept) throw new Error(`join attempt of ${presence.userId} rejected: ${attempt.rejectMessage}`);
          at(T0);
          state = matchJoin(ctx, logger, nk, dispatcher, 0, attempt.state, [presence]).state;
        }
        return state;
      }

      it('should answer yes to a present member of a private room', () => {
        // Arrange
        const state = privateRoom([u1]);

        // Act
        const result = matchSignal(ctx, logger, nk, dispatcher, 0, state, memberQuery(u1.userId));

        // Assert
        expect(result.data).toBe('yes');
      });

      it('should answer no to a member who left the room', () => {
        // Arrange
        const left = leave(privateRoom([u1]), u1, T0 + 1000);

        // Act
        const result = matchSignal(ctx, logger, nk, dispatcher, 0, left, memberQuery(u1.userId));

        // Assert
        expect(result.data).toBe('no');
      });

      it('should answer no on a public table', () => {
        // Arrange
        const state = init();

        // Act
        const result = matchSignal(ctx, logger, nk, dispatcher, 0, state, memberQuery(u1.userId));

        // Assert
        expect(result.data).toBe('no');
      });

      it.each([
        { scenario: 'an empty string', data: '' },
        { scenario: 'an empty object', data: '{}' },
        { scenario: 'a query without a user id', data: '{"type":"is_member"}' },
        { scenario: 'a query over 1024 bytes', data: 'x'.repeat(MAX_SIGNAL_BYTES + 1) },
      ])('should answer no to $scenario', ({ data }) => {
        // Arrange
        const state = privateRoom([u1]);

        // Act
        const result = matchSignal(ctx, logger, nk, dispatcher, 0, state, data);

        // Assert
        expect(result.data).toBe('no');
      });

      it('should return the same state object for every answer', () => {
        // Arrange
        const room = privateRoom([u1]);
        const left = leave(room, u1, T0 + 1000);
        const publicTable = init();
        const cases: Array<{ state: TableMatchState; data: string }> = [
          { state: room, data: memberQuery(u1.userId) },
          { state: left, data: memberQuery(u1.userId) },
          { state: publicTable, data: memberQuery(u1.userId) },
          { state: room, data: '' },
          { state: room, data: '{}' },
          { state: room, data: '{"type":"is_member"}' },
          { state: room, data: 'x'.repeat(MAX_SIGNAL_BYTES + 1) },
        ];

        // Act
        const unchanged = cases.map(
          ({ state, data }) => matchSignal(ctx, logger, nk, dispatcher, 0, state, data).state === state,
        );

        // Assert
        expect(unchanged).toEqual(cases.map(() => true));
      });
    });
  });
});

describe('tableMatch adapter on private tables', () => {
  const CODE = 'K7M2QX';
  const PRIVATE_PARAMS = { private: 'true', code: CODE };
  /** The match id `createContext()` puts in `ctx` (the adapter reads it to own the code record). */
  const OWN_MATCH_ID = 'match-1';
  const u6 = createPresence(6);
  const u7 = createPresence(7);
  const u8 = createPresence(8);
  const u9 = createPresence(9);

  function initPrivate(params: { [key: string]: unknown } = PRIVATE_PARAMS, now: number = T0): TableMatchState {
    at(now);
    return matchInit(ctx, logger, nk, params).state;
  }

  function attemptWith(state: TableMatchState, presence: nkruntime.Presence, now: number, metadata: { [key: string]: unknown }) {
    at(now);
    return matchJoinAttempt(ctx, logger, nk, dispatcher, 0, state, presence, metadata);
  }

  /** Join attempt with the room code, then the join, both at `now`. */
  function enter(state: TableMatchState, presence: nkruntime.Presence, now: number = T0): TableMatchState {
    const result = attemptWith(state, presence, now, { [ROOM_JOIN_CODE_KEY]: CODE });
    if (!result.accept) throw new Error(`join attempt of ${presence.userId} rejected: ${result.rejectMessage}`);
    return join(result.state, presence, now);
  }

  function roomOf(state: TableMatchState, users: readonly nkruntime.Presence[]): TableMatchState {
    let next = state;
    for (const p of users) next = enter(next, p);
    return next;
  }

  /** u1 (host) sends START in a loop at `now`. */
  function start(state: TableMatchState, now: number): TableMatchState {
    return loopOk(state, now, [jsonMessage(u1, OpCode.START, {})]);
  }

  function seedCodeRecord(matchId: string): void {
    nk.fake.useMemoryStorage();
    nk.fake.seedStorage(ROOM_COLLECTION, CODE, SYSTEM_USER_ID, { matchId, createdAt: T0 });
  }

  function storedCodeRecord(): unknown {
    return nk.fake.storedValue(ROOM_COLLECTION, CODE, SYSTEM_USER_ID);
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    resetFakes();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('matchInit', () => {
    it.each([
      { scenario: "the string 'true'", flag: 'true' },
      { scenario: 'the boolean true', flag: true },
    ])('should label the table private and closed when private is $scenario', ({ flag }) => {
      // Arrange
      at(T0);

      // Act
      const result = matchInit(ctx, logger, nk, { private: flag, code: CODE });

      // Assert
      expect(JSON.parse(result.label)).toEqual({ open: false, mode: '2v2', seatsFree: 4, private: true });
    });

    it('should never put the room code in the label', () => {
      // Arrange
      at(T0);

      // Act
      const result = matchInit(ctx, logger, nk, PRIVATE_PARAMS);

      // Assert
      expect(result.label).not.toContain(CODE);
    });

    it('should keep the room code in the table state', () => {
      // Arrange
      at(T0);

      // Act
      const result = matchInit(ctx, logger, nk, PRIVATE_PARAMS);

      // Assert
      expect(result.state.table.room?.code).toBe(CODE);
    });

    it.each([
      { scenario: 'a malformed code', params: { private: 'true', code: 'K7M2Q' } },
      { scenario: 'a lowercase code', params: { private: 'true', code: 'k7m2qx' } },
      { scenario: 'a non-string code', params: { private: 'true', code: 123456 } },
      { scenario: 'no code', params: { private: 'true' } },
      { scenario: "private 'false'", params: { private: 'false', code: CODE } },
    ])('should create a public table when the params have $scenario', ({ params }) => {
      // Arrange
      at(T0);

      // Act
      const result = matchInit(ctx, logger, nk, params);

      // Assert
      expect({ room: result.state.table.room, label: JSON.parse(result.label) as TableLabel }).toEqual({
        room: null,
        label: { open: true, mode: '2v2', seatsFree: 4, private: false },
      });
    });

    it('should log the fallback without the code value', () => {
      // Arrange
      at(T0);

      // Act
      matchInit(ctx, logger, nk, { private: 'true', code: 'K7M2Q' });

      // Assert
      expect({ logged: logger.error.mock.calls.length, leaked: JSON.stringify(logger.error.mock.calls).includes('K7M2Q') }).toEqual({
        logged: 1,
        leaked: false,
      });
    });
  });

  describe('matchJoinAttempt', () => {
    it.each([
      { scenario: 'no metadata code', metadata: {} },
      { scenario: 'a wrong code', metadata: { [ROOM_JOIN_CODE_KEY]: 'ABCDEF' } },
      { scenario: 'a non-string code', metadata: { [ROOM_JOIN_CODE_KEY]: 42 } },
    ])('should reject a newcomer with $scenario as room_not_found', ({ metadata }) => {
      // Arrange
      const state = initPrivate();

      // Act
      const result = attemptWith(state, u1, T0, metadata);

      // Assert
      expect({ accept: result.accept, rejectMessage: result.rejectMessage }).toEqual({ accept: false, rejectMessage: 'room_not_found' });
    });

    it('should leave the state untouched when a newcomer is rejected', () => {
      // Arrange
      const state = initPrivate();

      // Act
      const result = attemptWith(state, u1, T0, {});

      // Assert
      expect(result.state).toBe(state);
    });

    it('should reject a newcomer when the metadata is null', () => {
      // Arrange
      const state = initPrivate();

      // Act
      const result = attemptWith(state, u1, T0, null as unknown as { [key: string]: unknown });

      // Assert
      expect(result.accept).toBe(false);
    });

    it.each([
      { scenario: 'the exact code', supplied: CODE },
      { scenario: 'a lowercase code with a dash', supplied: 'k7m-2qx' },
      { scenario: 'a code with spaces', supplied: 'K7M 2QX' },
    ])('should admit a newcomer with $scenario', ({ supplied }) => {
      // Arrange
      const state = initPrivate();

      // Act
      const result = attemptWith(state, u1, T0, { [ROOM_JOIN_CODE_KEY]: supplied });

      // Assert
      expect(result.accept).toBe(true);
    });

    it('should admit a member reconnecting from a new session without a code', () => {
      // Arrange
      const state = roomOf(initPrivate(), [u1]);

      // Act
      const result = attemptWith(state, createPresence(1, 's1-new'), T0 + 1000, {});

      // Assert
      expect(result.accept).toBe(true);
    });

    it('should admit a seated member reconnecting mid-game without a code', () => {
      // Arrange
      const playing = start(roomOf(initPrivate(), [u1, u2]), T0 + 1000);
      const left = leave(playing, u2, T0 + 2000);

      // Act
      const result = attemptWith(left, createPresence(2, 's2-new'), T0 + 3000, {});

      // Assert
      expect(result.accept).toBe(true);
    });

    it(`should admit ${ROOM_MAX_MEMBERS} members`, () => {
      // Arrange
      const state = initPrivate();

      // Act
      const full = roomOf(state, [u1, u2, u3, u4, u5, u6, u7, u8]);

      // Assert
      expect(full.table.room?.members.length).toBe(ROOM_MAX_MEMBERS);
    });

    it('should reject one more newcomer with room_full', () => {
      // Arrange
      const full = roomOf(initPrivate(), [u1, u2, u3, u4, u5, u6, u7, u8]);

      // Act
      const result = attemptWith(full, u9, T0, { [ROOM_JOIN_CODE_KEY]: CODE });

      // Assert
      expect({ accept: result.accept, rejectMessage: result.rejectMessage }).toEqual({ accept: false, rejectMessage: 'room_full' });
    });

    it('should accept any metadata on a public table', () => {
      // Arrange
      const state = init();

      // Act
      const result = attemptWith(state, u1, T0, { [ROOM_JOIN_CODE_KEY]: 'WRONG1', other: 'x' });

      // Assert
      expect(result.accept).toBe(true);
    });
  });

  describe('matchJoin', () => {
    it('should kick a session that joins a private table with no reservation', () => {
      // Arrange
      const state = initPrivate();

      // Act
      join(state, u1, T0);

      // Assert
      expect(dispatcher.matchKick.mock.calls).toEqual([[[u1]]]);
    });

    it('should not add an unreserved newcomer to the room', () => {
      // Arrange
      const state = initPrivate();

      // Act
      const next = join(state, u1, T0);

      // Assert
      expect({ members: next.table.room?.members, connections: next.connections }).toEqual({ members: [], connections: {} });
    });

    it('should admit an unreserved session of an existing member and kick only its older session', () => {
      // Arrange
      const state = roomOf(initPrivate(), [u1]);
      dispatcher.matchKick.mockClear();

      // Act
      join(state, createPresence(1, 's1-new'), T0 + 1000);

      // Assert
      expect(dispatcher.matchKick.mock.calls).toEqual([[[u1]]]);
    });
  });

  describe('snapshots', () => {
    it('should send a standing member a snapshot with seat -1 while waiting', () => {
      // Arrange
      const state = roomOf(initPrivate(), [u1, u2, u3, u4]);
      dispatcher.broadcastMessage.mockClear();

      // Act
      enter(state, u5);

      // Assert
      const last = snapshotsTo('s5').pop();
      expect({ seat: last?.seat, view: last?.view, you: last?.room?.you }).toEqual({ seat: -1, view: null, you: 4 });
    });

    it('should send a standing member no view once the game has started', () => {
      // Arrange
      const state = roomOf(initPrivate(), [u1, u2, u3, u4, u5]);
      dispatcher.broadcastMessage.mockClear();

      // Act
      const playing = start(state, T0 + 1000);

      // Assert
      const last = snapshotsTo('s5').pop();
      expect({ phase: playing.table.phase, seat: last?.seat, view: last?.view, scores: last?.room?.scores }).toEqual({
        phase: 'playing',
        seat: -1,
        view: null,
        scores: [0, 0],
      });
    });

    it('should never send a standing member any card', () => {
      // Arrange
      const state = roomOf(initPrivate(), [u1, u2, u3, u4, u5]);
      dispatcher.broadcastMessage.mockClear();

      // Act
      let playing = start(state, T0 + 1000);
      for (let t = T0 + 2000; t <= T0 + 60_000; t += 1000) playing = loopOk(playing, t);

      // Assert
      const raw = dispatcher.broadcastMessage.mock.calls
        .filter((call) => (call[2] as nkruntime.Presence[]).some((p) => p.sessionId === 's5'))
        .map((call) => call[1] as string);
      expect({ sent: raw.length > 0, withCards: raw.filter((text) => text.includes('"hand"') || text.includes('"view":{')) }).toEqual({
        sent: true,
        withCards: [],
      });
    });

    it('should send snapshots only to the presence they belong to', () => {
      // Arrange
      const state = roomOf(initPrivate(), [u1, u2, u3, u4, u5]);
      dispatcher.broadcastMessage.mockClear();

      // Act
      start(state, T0 + 1000);

      // Assert
      expect(dispatcher.broadcastMessage.mock.calls.map((call) => (call[2] as unknown[]).length)).toEqual([1, 1, 1, 1, 1]);
    });

    it('should not backfill a private table with bots while waiting', () => {
      // Arrange
      const state = roomOf(initPrivate(), [u1]);

      // Act
      const next = loopOk(state, T0 + BACKFILL_MS + 1000);

      // Assert
      expect(next.table.phase).toBe('waiting');
    });
  });

  describe('a finished private game', () => {
    /** Upper bound on 1 s loops; a game to 21 with idle humans takes far fewer. */
    const MAX_LOOPS = 20000;
    let finished: TableMatchState | null = null;

    beforeAll(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      resetFakes();
      let state = start(roomOf(initPrivate(), [u1]), T0 + 1000);
      let now = T0 + 1000;
      for (let i = 0; i < MAX_LOOPS && finished === null; i++) {
        now += 1000;
        const next = loop(state, now);
        if (next === null) break;
        state = next;
        if (state.table.phase === 'finished') finished = state;
      }
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it('should reach the finished phase through 1 s loops', () => {
      // Arrange (game played in beforeAll)
      const state = finished;

      // Act
      const phase = state === null ? null : state.table.phase;

      // Assert
      expect(phase).toBe('finished');
    });

    it('should keep the table running past the public linger time and return it to the waiting room', () => {
      // Arrange
      let state = finished!;
      const end = state.table.finishedAt! + LINGER_AFTER_FINISH_MS + 1000;
      let closedAt: number | null = null;

      // Act
      for (let t = state.table.finishedAt! + 1000; t <= end && closedAt === null; t += 1000) {
        const next = loop(state, t, [], createFakeDispatcher());
        if (next === null) closedAt = t;
        else state = next;
      }

      // Assert
      expect({ closedAt, phase: state.table.phase, u1Seat: seatOf(state, 'u1') }).toEqual({ closedAt: null, phase: 'waiting', u1Seat: 0 });
    });

    it('should not give a finished private table a termination reason after the linger time', () => {
      // Arrange
      const state = finished!;
      const stuck: TableMatchState = { ...state, table: { ...state.table, nextActionAt: null } };

      // Act
      const reason = terminationReason(stuck, state.table.finishedAt! + LINGER_AFTER_FINISH_MS);

      // Assert
      expect(reason).toBeNull();
    });
  });

  describe('termination and the code record', () => {
    it('should close an empty private table after the empty timeout', () => {
      // Arrange
      const state = initPrivate();

      // Act
      const next = loop(state, T0 + EMPTY_TIMEOUT_MS);

      // Assert
      expect(next).toBeNull();
    });

    it('should delete the code record when the empty table closes', () => {
      // Arrange
      seedCodeRecord(OWN_MATCH_ID);
      const state = initPrivate();

      // Act
      loop(state, T0 + EMPTY_TIMEOUT_MS);

      // Assert
      expect(storedCodeRecord()).toBeUndefined();
    });

    it('should keep the code record while the empty table is still within the timeout', () => {
      // Arrange
      seedCodeRecord(OWN_MATCH_ID);
      const state = initPrivate();

      // Act
      loopOk(state, T0 + EMPTY_TIMEOUT_MS - 1000);

      // Assert
      expect(storedCodeRecord()).toEqual({ matchId: OWN_MATCH_ID, createdAt: T0 });
    });

    it('should delete the code record in matchTerminate', () => {
      // Arrange
      seedCodeRecord(OWN_MATCH_ID);
      const state = roomOf(initPrivate(), [u1]);

      // Act
      matchTerminate(ctx, logger, nk, dispatcher, 0, state, 10);

      // Assert
      expect(storedCodeRecord()).toBeUndefined();
    });

    it('should keep the code record when it points at another match on close', () => {
      // Arrange
      seedCodeRecord('other-match');
      const state = initPrivate();

      // Act
      loop(state, T0 + EMPTY_TIMEOUT_MS);

      // Assert
      expect(storedCodeRecord()).toEqual({ matchId: 'other-match', createdAt: T0 });
    });

    it('should keep the code record when it points at another match on terminate', () => {
      // Arrange
      seedCodeRecord('other-match');
      const state = initPrivate();

      // Act
      matchTerminate(ctx, logger, nk, dispatcher, 0, state, 10);

      // Assert
      expect(storedCodeRecord()).toEqual({ matchId: 'other-match', createdAt: T0 });
    });

    it('should not throw from matchTerminate when storage fails', () => {
      // Arrange
      nk.storageRead.mockImplementation(() => {
        throw new Error('storage down');
      });
      const state = initPrivate();

      // Act
      const call = () => matchTerminate(ctx, logger, nk, dispatcher, 0, state, 10);

      // Assert
      expect(call).not.toThrow();
    });

    it('should not touch storage when a public table terminates', () => {
      // Arrange
      const state = init();

      // Act
      matchTerminate(ctx, logger, nk, dispatcher, 0, state, 10);

      // Assert
      expect(nk.storageRead.mock.calls.length + nk.storageDelete.mock.calls.length).toBe(0);
    });
  });

  describe('match state saved before private tables', () => {
    function legacyState(): TableMatchState {
      const state = init();
      const { room: _room, ...table } = state.table;
      return { ...state, table: table as TableMatchState['table'] };
    }

    it('should admit a join attempt without a code', () => {
      // Arrange
      const state = legacyState();

      // Act
      const result = attempt(state, u1, T0);

      // Assert
      expect(result.accept).toBe(true);
    });

    it('should keep a public label', () => {
      // Arrange
      const state = legacyState();

      // Act
      attempt(state, u1, T0);

      // Assert
      expect(lastLabel()).toEqual({ open: true, mode: '2v2', seatsFree: 3, private: false });
    });

    it('should send snapshots without a room key', () => {
      // Arrange
      const reserved = attemptOk(legacyState(), u1, T0);

      // Act
      join(reserved, u1, T0);

      // Assert
      expect(snapshotsTo('s1').map((s) => 'room' in s)).toEqual([false]);
    });

    it('should terminate without touching storage', () => {
      // Arrange
      const state = legacyState();

      // Act
      matchTerminate(ctx, logger, nk, dispatcher, 0, state, 10);

      // Assert
      expect(nk.storageRead).not.toHaveBeenCalled();
    });
  });
});

describe('tableMatch adapter recent players', () => {
  /** Upper bound on 1 s loops; a game to 21 with idle humans takes far fewer. */
  const MAX_LOOPS = 20000;
  const CODE = 'K7M2QX';
  /** Session of u3 after reconnecting. */
  const u3again = createPresence(3, 's3-again');
  const u2again = createPresence(2, 's2-again');

  interface RecentRecord {
    tables: { endedAt: number; players: { userId: string; name: string }[] }[];
  }

  function recentOf(fakeNk: ReturnType<typeof createFakeNk>, userId: string): RecentRecord | undefined {
    return fakeNk.fake.storedValue(SOCIAL_COLLECTION, RECENT_PLAYERS_KEY, userId) as RecentRecord | undefined;
  }

  /** Every recent-players storage write, as the owner's user id, in order. */
  function recentWrites(fakeNk: ReturnType<typeof createFakeNk>): string[] {
    const owners: string[] = [];
    for (const [writes] of fakeNk.storageWrite.mock.calls) {
      for (const w of writes) if (w.collection === SOCIAL_COLLECTION && w.key === RECENT_PLAYERS_KEY) owners.push(w.userId ?? '');
    }
    return owners;
  }

  interface CompetitiveRecord {
    games: number;
    wins: number;
    chkobbas: number;
    currentStreak: number;
    bestStreak: number;
    updatedAt: number;
  }

  function competitiveOf(
    fakeNk: ReturnType<typeof createFakeNk>,
    userId: string,
  ): CompetitiveRecord | undefined {
    return fakeNk.fake.storedValue(STATS_COLLECTION, COMPETITIVE_STATS_KEY, userId) as CompetitiveRecord | undefined;
  }

  /** Every competitive-stats storage write, as the owner's user id, in order. */
  function competitiveWrites(fakeNk: ReturnType<typeof createFakeNk>): string[] {
    const owners: string[] = [];
    for (const [writes] of fakeNk.storageWrite.mock.calls) {
      for (const w of writes) {
        if (w.collection === STATS_COLLECTION && w.key === COMPETITIVE_STATS_KEY) owners.push(w.userId ?? '');
      }
    }
    return owners;
  }

  function player(n: number) {
    return { userId: `u${n}`, name: `Player ${n}` };
  }

  /** Loops every second from `from` until `done` holds; returns the state and the time it held at. */
  function loopUntil(state: TableMatchState, from: number, done: (s: TableMatchState) => boolean) {
    let current = state;
    let now = from;
    for (let i = 0; i < MAX_LOOPS; i++) {
      if (done(current)) return { state: current, now };
      now += 1000;
      current = loopOk(current, now);
    }
    throw new Error('loopUntil: condition not met');
  }

  const isFinished = (s: TableMatchState): boolean => s.table.phase === 'finished';

  /** Strips the recent-players fields, like match state saved before they existed. */
  function legacy(state: TableMatchState): TableMatchState {
    const { gameKey: _gameKey, roster: _roster, recentWritten: _recentWritten, ...rest } = state;
    return rest as TableMatchState;
  }

  /** Strips the stats ledger, like match state saved before it existed. */
  function withoutStatsWritten(state: TableMatchState): TableMatchState {
    const { statsWritten: _statsWritten, ...rest } = state;
    return rest as TableMatchState;
  }

  function enter(state: TableMatchState, presence: nkruntime.Presence, now: number): TableMatchState {
    at(now);
    const result = matchJoinAttempt(ctx, logger, nk, dispatcher, 0, state, presence, { [ROOM_JOIN_CODE_KEY]: CODE });
    if (!result.accept) throw new Error(`join attempt of ${presence.userId} rejected: ${result.rejectMessage}`);
    return join(result.state, presence, now);
  }

  function initPrivate(now: number = T0): TableMatchState {
    at(now);
    return matchInit(ctx, logger, nk, { private: 'true', code: CODE }).state;
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    resetFakes();
    nk.fake.useMemoryStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('a public game with a leaver and a reconnecting leaver', () => {
    /**
     * u1..u4 sit at T0 (the game starts). u2 leaves at T0+1s for good; u3
     * leaves at T0+2s and reconnects with a new session at T0+3s. Then the
     * game is played out by timeouts and bots.
     */
    let run: {
      nk: ReturnType<typeof createFakeNk>;
      afterLeave: TableMatchState;
      finished: TableMatchState;
      finishedAt: number;
      /** Recent-players write owners over the run (mock calls are reset after each test). */
      writes: string[];
    };

    beforeAll(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      resetFakes();
      nk.fake.useMemoryStorage();
      const runNk = nk;
      let state = fullTable();
      state = leave(state, u2, T0 + 1000);
      const afterLeave = state;
      state = leave(state, u3, T0 + 2000);
      state = seat(state, u3again, T0 + 3000);
      const done = loopUntil(state, T0 + 3000, isFinished);
      run = { nk: runNk, afterLeave, finished: done.state, finishedAt: done.now, writes: recentWrites(runNk) };
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it('should write the leaver at leave time with everyone who sat so far', () => {
      // Arrange
      const fakeNk = run.nk;

      // Act
      const record = recentOf(fakeNk, 'u2');

      // Assert
      expect(record).toEqual({ tables: [{ endedAt: T0 + 1000, players: [player(1), player(3), player(4)] }] });
    });

    it('should mark the leaver as written right after the leave', () => {
      // Arrange
      const state = run.afterLeave;

      // Act
      const written = state.recentWritten;

      // Assert
      expect(written).toEqual(['u2']);
    });

    it('should not write a reconnected leaver again when the game finishes', () => {
      // Arrange
      const fakeNk = run.nk;

      // Act
      const u3Writes = run.writes.filter((owner) => owner === 'u3');

      // Assert
      expect({ u3Writes: u3Writes.length, endedAt: recentOf(fakeNk, 'u3')?.tables.map((t) => t.endedAt) }).toEqual({
        u3Writes: 1,
        endedAt: [T0 + 2000],
      });
    });

    it('should give players seated at the finish every roster member, leavers included', () => {
      // Arrange
      const fakeNk = run.nk;

      // Act
      const records = { u1: recentOf(fakeNk, 'u1'), u4: recentOf(fakeNk, 'u4') };

      // Assert
      expect(records).toEqual({
        u1: { tables: [{ endedAt: run.finishedAt, players: [player(2), player(3), player(4)] }] },
        u4: { tables: [{ endedAt: run.finishedAt, players: [player(1), player(2), player(3)] }] },
      });
    });

    it('should write each roster member exactly once over the game', () => {
      // Arrange
      const writes = run.writes;

      // Act
      const owners = writes.slice().sort();

      // Assert
      expect(owners).toEqual(['u1', 'u2', 'u3', 'u4']);
    });

    it('should not write anything more on later loops of the finished table', () => {
      // Arrange
      const before = recentWrites(run.nk).length;
      nk = run.nk;

      // Act
      loopOk(run.finished, run.finishedAt + 1000);

      // Assert
      expect(recentWrites(run.nk).length).toBe(before);
    });

    it('should not write the leaver again when the same user leaves a second time', () => {
      // Arrange
      nk = run.nk;
      const before = recentWrites(run.nk).length;
      const back = seat(run.afterLeave, u2again, T0 + 1500);

      // Act
      leave(back, u2again, T0 + 1600);

      // Assert
      expect(recentWrites(run.nk).length).toBe(before);
    });
  });

  describe('leaving outside a running game', () => {
    it('should not write a player who leaves a waiting table', () => {
      // Arrange
      let state = init();
      state = seat(state, u1, T0);
      state = seat(state, u2, T0);

      // Act
      leave(state, u2, T0 + 1000);

      // Assert
      expect(recentWrites(nk)).toEqual([]);
    });

    it('should not write when an older session of a seated user leaves', () => {
      // Arrange
      const state = seat(fullTable(), createPresence(2, 's2-new'), T0 + 1000);

      // Act
      leave(state, u2, T0 + 2000);

      // Assert
      expect(recentWrites(nk)).toEqual([]);
    });
  });

  describe('a private room with a takeover, played twice', () => {
    const u5 = createPresence(5);

    /**
     * u1 (host) and u2 sit; START puts bots on seats 2 and 3; u5 enters and
     * stands, then takes over seat 2 by SIT. The game is played out, the table
     * returns to the room, u1 starts a second game and it is played out too.
     */
    let run: {
      nk: ReturnType<typeof createFakeNk>;
      afterTakeover: TableMatchState;
      firstFinishedAt: number;
      secondStart: TableMatchState;
      secondFinishedAt: number;
      secondFinished: TableMatchState;
      writes: string[];
    };

    beforeAll(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      resetFakes();
      nk.fake.useMemoryStorage();
      const runNk = nk;
      let state = initPrivate();
      state = enter(state, u1, T0);
      state = enter(state, u2, T0);
      state = loopOk(state, T0 + 1000, [jsonMessage(u1, OpCode.START, {})]);
      state = enter(state, u5, T0 + 1000);
      state = loopOk(state, T0 + 2000, [jsonMessage(u5, OpCode.SIT, { seat: 2 })]);
      const afterTakeover = state;
      const first = loopUntil(state, T0 + 2000, isFinished);
      const backInRoom = loopUntil(first.state, first.now, (s) => s.table.phase === 'waiting');
      const secondStart = loopOk(backInRoom.state, backInRoom.now + 1000, [jsonMessage(u1, OpCode.START, {})]);
      const second = loopUntil(secondStart, backInRoom.now + 1000, isFinished);
      run = {
        nk: runNk,
        afterTakeover,
        firstFinishedAt: first.now,
        secondStart,
        secondFinishedAt: second.now,
        secondFinished: second.state,
        writes: recentWrites(runNk),
      };
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it('should append the member who took over a bot seat to the roster', () => {
      // Arrange
      const state = run.afterTakeover;

      // Act
      const roster = state.roster;

      // Assert
      expect(roster).toEqual([player(1), player(2), player(5)]);
    });

    it('should give the takeover member the players who sat before them when the game finishes', () => {
      // Arrange
      const fakeNk = run.nk;

      // Act
      const oldest = recentOf(fakeNk, 'u5')?.tables.slice(-1);

      // Assert
      expect(oldest).toEqual([{ endedAt: run.firstFinishedAt, players: [player(1), player(2)] }]);
    });

    it('should start a new roster with a new game key when the second private game starts', () => {
      // Arrange
      const state = run.secondStart;

      // Act
      const roster = { gameKey: state.gameKey, recentWritten: state.recentWritten };

      // Assert
      expect(roster).toEqual({ gameKey: `${FAKE_SEED}:2`, recentWritten: [] });
    });

    it('should record the second private game as a separate table, newest first', () => {
      // Arrange
      const fakeNk = run.nk;

      // Act
      const endedAt = recentOf(fakeNk, 'u1')?.tables.map((t) => t.endedAt);

      // Assert
      expect(endedAt).toEqual([run.secondFinishedAt, run.firstFinishedAt]);
    });

    it('should write every roster member once per game', () => {
      // Arrange
      const writes = run.writes;

      // Act
      const owners = writes.slice().sort();

      // Assert
      expect(owners).toEqual(['u1', 'u1', 'u2', 'u2', 'u5', 'u5']);
    });

    it('should mark every roster member written once the second game finishes', () => {
      // Arrange
      const state = run.secondFinished;

      // Act
      const written = state.recentWritten.slice().sort();

      // Assert
      expect(written).toEqual(['u1', 'u2', 'u5']);
    });
  });

  describe('when storage fails', () => {
    it('should not break matchLeave when the recent-players read fails', () => {
      // Arrange
      const state = fullTable();
      nk.fake.failStorageReads();

      // Act
      const next = leave(state, u2, T0 + 1000);

      // Assert
      expect(seatOf(next, 'u2')).toBe(1);
    });

    it('should log a warning when the recent-players write fails at leave time', () => {
      // Arrange
      const state = fullTable();
      nk.fake.failStorageWrites();

      // Act
      leave(state, u2, T0 + 1000);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(expect.any(String), 'u2', expect.stringContaining('storageWrite failed'));
    });

    it('should not break matchLoop when the recent-players writes fail at the finish', () => {
      // Arrange
      const finishing = loopUntil(fullTable(), T0, isFinished);
      const unwritten: TableMatchState = { ...finishing.state, recentWritten: [] };
      nk.fake.failStorageWrites();

      // Act
      const next = loop(unwritten, finishing.now + 1000);

      // Assert
      expect(next?.table.phase).toBe('finished');
    });
  });

  describe('match state saved before recent players', () => {
    it('should write a leaver with the humans seated now', () => {
      // Arrange
      const state = legacy(fullTable());

      // Act
      leave(state, u2, T0 + 1000);

      // Assert
      expect(recentOf(nk, 'u2')).toEqual({ tables: [{ endedAt: T0 + 1000, players: [player(1), player(3), player(4)] }] });
    });

    it('should add the recent-players fields on the next loop', () => {
      // Arrange
      const state = legacy(fullTable());

      // Act
      const next = loopOk(state, T0 + 1000);

      // Assert
      expect({ gameKey: next.gameKey, roster: next.roster, recentWritten: next.recentWritten }).toEqual({
        gameKey: FAKE_SEED,
        roster: [player(1), player(2), player(3), player(4)],
        recentWritten: [],
      });
    });

    it('should keep a waiting table without the fields working', () => {
      // Arrange
      const state = legacy(init());

      // Act
      const next = seat(state, u1, T0);

      // Assert
      expect(seatOf(next, 'u1')).toBe(0);
    });
  });

  describe('competitive stats at the finish', () => {
    /** The one-game record for `seat` in a decided game with its team's sweep count. */
    function expectedResult(
      game: { winner: 0 | 1 | null; chkobbas: readonly [number, number] },
      seat: number,
      now: number,
    ): CompetitiveRecord {
      const team: 0 | 1 = seat % 2 === 0 ? 0 : 1;
      const won = game.winner === team;
      return {
        games: 1,
        wins: won ? 1 : 0,
        chkobbas: game.chkobbas[team],
        currentStreak: won ? 1 : 0,
        bestStreak: won ? 1 : 0,
        updatedAt: now,
      };
    }

    it('should write one decided result per human seat with its team outcome and sweep count', () => {
      // Arrange
      const done = loopUntil(fullTable(), T0, isFinished);
      const game = done.state.table.game;
      if (game === null) throw new Error('a finished table has no game');

      // Act — the finish loop already wrote the records
      const records = [1, 2, 3, 4].map((n) => competitiveOf(nk, `u${n}`));

      // Assert
      expect({ winner: game.winner, records }).toEqual({
        winner: expect.any(Number),
        records: [0, 1, 2, 3].map((seat) => expectedResult(game, seat, done.now)),
      });
    });

    it('should write each player exactly once no matter how long the finished table lingers', () => {
      // Arrange
      const done = loopUntil(fullTable(), T0, isFinished);
      const afterFinish = competitiveWrites(nk);
      const records = [1, 2, 3, 4].map((n) => competitiveOf(nk, `u${n}`));
      let state = done.state;
      let now = done.now;

      // Act
      for (let i = 0; i < 3; i++) {
        now += 1000;
        state = loopOk(state, now);
      }

      // Assert
      expect({
        phase: state.table.phase,
        writes: competitiveWrites(nk),
        records: [1, 2, 3, 4].map((n) => competitiveOf(nk, `u${n}`)),
      }).toEqual({ phase: 'finished', writes: afterFinish, records });
    });

    it('should record a mid-game leaver but no bot seat', () => {
      // Arrange: two humans, then backfill puts bots on the empty seats and starts the game.
      let state = init();
      state = seat(state, u1, T0);
      state = seat(state, u2, T0);
      state = loopOk(state, T0 + BACKFILL_MS);
      const left = leave(state, u1, T0 + BACKFILL_MS + 1000);

      // Act
      const done = loopUntil(left, T0 + BACKFILL_MS + 1000, isFinished);

      // Assert
      expect({
        botSeats: [2, 3].map((index) => done.state.table.seats[index]?.kind),
        writes: competitiveWrites(nk).slice().sort(),
        leaver: competitiveOf(nk, 'u1') !== undefined,
      }).toEqual({ botSeats: ['bot', 'bot'], writes: ['u1', 'u2'], leaver: true });
    });

    it('should count a reconnecting player once for the game', () => {
      // Arrange
      let state = fullTable();
      state = leave(state, u3, T0 + 1000);
      state = seat(state, u3again, T0 + 2000);

      // Act
      loopUntil(state, T0 + 2000, isFinished);

      // Assert
      expect({
        writes: competitiveWrites(nk).filter((owner) => owner === 'u3').length,
        games: competitiveOf(nk, 'u3')?.games,
      }).toEqual({ writes: 1, games: 1 });
    });

    it('should record a private table second game as a separate result', () => {
      // Arrange: u1 and u2 play a game, the room resets, then they start another.
      let state = initPrivate();
      state = enter(state, u1, T0);
      state = enter(state, u2, T0);
      state = loopOk(state, T0 + 1000, [jsonMessage(u1, OpCode.START, {})]);
      const first = loopUntil(state, T0 + 1000, isFinished);
      const backInRoom = loopUntil(first.state, first.now, (s) => s.table.phase === 'waiting');
      const secondStart = loopOk(backInRoom.state, backInRoom.now + 1000, [jsonMessage(u1, OpCode.START, {})]);

      // Act
      const second = loopUntil(secondStart, backInRoom.now + 1000, isFinished);

      // Assert
      expect({
        games: ['u1', 'u2'].map((userId) => competitiveOf(nk, userId)?.games),
        writes: ['u1', 'u2'].map((userId) => competitiveWrites(nk).filter((owner) => owner === userId).length),
        phase: second.state.table.phase,
      }).toEqual({ games: [2, 2], writes: [2, 2], phase: 'finished' });
    });

    it('should keep the match finished, write the other players and not retry a failed write', () => {
      // Arrange: only u2's competitive write throws.
      const memoryWrite = nk.storageWrite.getMockImplementation();
      if (memoryWrite === undefined) throw new Error('memory storage is not enabled');
      nk.storageWrite.mockImplementation((writes) => {
        if (writes.some((w) => w.collection === STATS_COLLECTION && w.userId === 'u2')) {
          throw new Error('storageWrite failed');
        }
        return memoryWrite(writes);
      });

      // Act
      const done = loopUntil(fullTable(), T0, isFinished);
      const after = loopOk(done.state, done.now + 1000);

      // Assert
      expect({
        phase: after.table.phase,
        failed: competitiveOf(nk, 'u2'),
        others: ['u1', 'u3', 'u4'].map((userId) => competitiveOf(nk, userId) !== undefined),
        attempts: competitiveWrites(nk).filter((owner) => owner === 'u2').length,
      }).toEqual({ phase: 'finished', failed: undefined, others: [true, true, true], attempts: 1 });
    });

    it('should write the results for match state saved before the stats ledger existed', () => {
      // Arrange
      const done = loopUntil(fullTable(), T0, isFinished);
      resetFakes();
      nk.fake.useMemoryStorage();
      const legacyState = withoutStatsWritten(done.state);

      // Act
      const next = loopOk(legacyState, done.now + 1000);

      // Assert
      expect({
        writes: competitiveWrites(nk).slice().sort(),
        ledger: (next.statsWritten ?? []).slice().sort(),
      }).toEqual({ writes: ['u1', 'u2', 'u3', 'u4'], ledger: ['u1', 'u2', 'u3', 'u4'] });
    });
  });
});

describe('canonicalJson', () => {
  it('should produce the same text regardless of key order', () => {
    // Arrange
    const a = { x: 1, y: { b: [1, { d: 2, c: 3 }], a: null } };
    const b = { y: { a: null, b: [1, { c: 3, d: 2 }] }, x: 1 };

    // Act
    const same = canonicalJson(a) === canonicalJson(b);

    // Assert
    expect(same).toBe(true);
  });
});
