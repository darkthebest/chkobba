/**
 * NakamaGameClient against a fake OnlineBackend / MatchSocket. No network, no
 * timers: reconnect delays go through an injected manual scheduler, the clock
 * is a mutable number, and the jitter source is a constant. Snapshots with a
 * game view come from the server-generated fixtures (see protocol.test.ts).
 */
import { ROOM_JOIN_CODE_KEY } from '@chkobba/protocol';
import {
  FIXTURE_ROOM_CODE,
  PRIVATE_PLAYING_SEATED_SNAPSHOT,
  PRIVATE_PLAYING_STANDING_SNAPSHOT,
  PRIVATE_WAITING_SEATED_SNAPSHOT,
  PRIVATE_WAITING_STANDING_SNAPSHOT,
  PUBLIC_PLAYING_SNAPSHOT,
} from '@chkobba/protocol/testing';

import type { Scheduler } from '@/game/LocalGameClient';

import {
  NakamaGameClient,
  type JoinResult,
  type MatchSocket,
  type MatchSocketHandlers,
  type NakamaGameClientOptions,
  type OnlineBackend,
} from '../NakamaGameClient';
import { OpCode, type Snapshot } from '../protocol';

import between from './fixtures/between.json';
import delta from './fixtures/delta.json';
import playing from './fixtures/snapshot.json';
import waiting from './fixtures/waiting.json';

const LOCAL_NOW = 5_000_000;
const MATCH_ID = 'match-1';

type Json = { [key: string]: unknown };

/** A fixture as an open record so tests can override fields before sending it. */
function fixture(source: unknown, overrides: Json = {}): Json {
  return { ...(JSON.parse(JSON.stringify(source)) as Json), ...overrides };
}

/** A minimal waiting-room snapshot. */
function waitingSnapshot(overrides: Partial<Snapshot> = {}): Json {
  return fixture(waiting, overrides as Json);
}

class FakeSocket implements MatchSocket {
  readonly joinMatch = jest.fn(async (_matchId: string): Promise<JoinResult> => this.nextJoin());
  readonly leaveMatch = jest.fn(async (_matchId: string): Promise<void> => undefined);
  readonly send = jest.fn(async (_matchId: string, _opCode: number, _data: string): Promise<void> => undefined);
  readonly close = jest.fn((): void => undefined);

  constructor(
    readonly handlers: MatchSocketHandlers,
    private readonly nextJoin: () => JoinResult,
  ) {}

  emitSnapshot(snapshot: Json): void {
    this.handlers.onMatchData(OpCode.SNAPSHOT, JSON.stringify(snapshot));
  }

  emitError(code: string): void {
    this.handlers.onMatchData(OpCode.ERROR, JSON.stringify({ code }));
  }

  drop(): void {
    this.handlers.onDisconnect();
  }
}

interface ScheduledCall {
  readonly fn: () => void;
  readonly ms: number;
}

function createHarness(options: Partial<NakamaGameClientOptions> = {}) {
  const sockets: FakeSocket[] = [];
  const joinResults: JoinResult[] = [];
  let quickMatchCount = 0;
  const backend = {
    signIn: jest.fn(async (): Promise<void> => undefined),
    quickMatch: jest.fn(async (): Promise<string> => `quick-${++quickMatchCount}`),
    openSocket: jest.fn(async (handlers: MatchSocketHandlers): Promise<MatchSocket> => {
      const socket = new FakeSocket(handlers, () => joinResults.shift() ?? { ok: true });
      sockets.push(socket);
      return socket;
    }),
  } satisfies OnlineBackend;

  const scheduled: ScheduledCall[] = [];
  const scheduler: Scheduler = (fn, ms) => {
    const call = { fn, ms };
    scheduled.push(call);
    return () => {
      const i = scheduled.indexOf(call);
      if (i !== -1) scheduled.splice(i, 1);
    };
  };

  const clock = { now: LOCAL_NOW };
  const client = new NakamaGameClient({
    matchId: MATCH_ID,
    backend,
    now: () => clock.now,
    scheduler,
    random: () => 0.5,
    ...options,
  });

  const lastSocket = (): FakeSocket => {
    const socket = sockets[sockets.length - 1];
    if (!socket) throw new Error('no socket opened');
    return socket;
  };

  return {
    client,
    backend,
    sockets,
    joinResults,
    scheduled,
    clock,
    lastSocket,
    /** Runs the next scheduled reconnect, then lets its async connect settle. */
    async runNextTimer(): Promise<void> {
      const call = scheduled.shift();
      if (!call) throw new Error('nothing scheduled');
      call.fn();
      await flush();
    },
  };
}

/** Lets chained promise callbacks (signIn → openSocket → joinMatch) settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** A started, joined client. */
async function onlineHarness(options: Partial<NakamaGameClientOptions> = {}) {
  const harness = createHarness(options);
  harness.client.start();
  await flush();
  return harness;
}

/** With random = 0.5 the jitter factor is 0.8 + 0.2 * 0.5 = 0.9. */
const JITTER = 0.9;

describe('NakamaGameClient', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('connecting', () => {
    it('should start in the connecting state when created', () => {
      // Arrange
      const { client } = createHarness();

      // Act
      const snapshot = client.getSnapshot();

      // Assert
      expect(snapshot.connection).toBe('connecting');
    });

    it('should join the given match when started', async () => {
      // Arrange
      const harness = createHarness();

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.lastSocket().joinMatch).toHaveBeenCalledWith(MATCH_ID);
    });

    it('should report online when the join succeeds', async () => {
      // Arrange
      const harness = createHarness();

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.client.getSnapshot().connection).toBe('online');
    });

    it('should not start twice when start is called again while running', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.backend.openSocket).toHaveBeenCalledTimes(1);
    });
  });

  describe('snapshots', () => {
    it('should notify subscribers when a snapshot arrives', async () => {
      // Arrange
      const harness = await onlineHarness();
      const listener = jest.fn();
      harness.client.subscribe(listener);

      // Act
      harness.lastSocket().emitSnapshot(waitingSnapshot());

      // Assert
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should stop notifying a listener when it unsubscribes', async () => {
      // Arrange
      const harness = await onlineHarness();
      const listener = jest.fn();
      const unsubscribe = harness.client.subscribe(listener);
      unsubscribe();

      // Act
      harness.lastSocket().emitSnapshot(waitingSnapshot());

      // Assert
      expect(listener).not.toHaveBeenCalled();
    });

    it('should ignore a snapshot that does not decode', async () => {
      // Arrange
      const harness = await onlineHarness();
      const listener = jest.fn();
      harness.client.subscribe(listener);

      // Act
      harness.lastSocket().handlers.onMatchData(OpCode.SNAPSHOT, '{"seat":0}');

      // Assert
      expect(listener).not.toHaveBeenCalled();
    });

    it('should map the waiting room to online info when no game view has arrived', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitSnapshot(waitingSnapshot({ serverTime: LOCAL_NOW, backfillAt: LOCAL_NOW + 14_000 }));

      // Assert
      expect(harness.client.getSnapshot().online).toMatchObject({
        phase: 'waiting',
        seatsFilled: 1,
        seatCount: 4,
        backfillAt: LOCAL_NOW + 14_000,
        nextRoundAt: null,
        started: false,
        lastError: null,
      });
    });

    it('should list empty seats as disconnected humans with no name while waiting', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitSnapshot(waitingSnapshot());

      // Assert
      expect(harness.client.getSnapshot().players[1]).toEqual({
        seat: 1,
        name: '',
        isBot: false,
        away: false,
        connected: false,
      });
    });

    it('should mirror the server view and mark the game started when a view arrives', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitSnapshot(fixture(playing));

      // Assert
      expect(harness.client.getSnapshot()).toMatchObject({ view: playing.view, online: { started: true, phase: 'playing' } });
    });

    it('should take the seat assigned by the server', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitSnapshot(fixture(playing));

      // Assert
      expect(harness.client.seat).toBe(playing.seat);
    });

    it('should map player away and connected flags per seat', async () => {
      // Arrange
      const harness = await onlineHarness();
      const players = [
        { name: 'Amira', isBot: false, away: true, connected: true },
        { name: 'Bot', isBot: true, away: false, connected: true },
        { name: 'Karim', isBot: false, away: false, connected: false },
        { name: 'Hédi', isBot: false, away: false, connected: true },
      ];

      // Act
      harness.lastSocket().emitSnapshot(fixture(playing, { players }));

      // Assert
      expect(harness.client.getSnapshot().players).toEqual(players.map((info, seat) => ({ seat, ...info })));
    });

    it('should count bots and humans as filled seats', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitSnapshot(fixture(between));

      // Assert
      expect(harness.client.getSnapshot().online?.seatsFilled).toBe(4);
    });

    it('should expose the between phase and the next round time when the round is over', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitSnapshot(fixture(between, { serverTime: LOCAL_NOW, nextRoundAt: LOCAL_NOW + 8000 }));

      // Assert
      expect(harness.client.getSnapshot().online).toMatchObject({ phase: 'between', nextRoundAt: LOCAL_NOW + 8000 });
    });

    it('should record when the table phase changed', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(waitingSnapshot());
      harness.clock.now = LOCAL_NOW + 3000;

      // Act
      harness.lastSocket().emitSnapshot(fixture(playing));

      // Assert
      expect(harness.client.getSnapshot().online?.phaseSince).toBe(LOCAL_NOW + 3000);
    });
  });

  describe('intents', () => {
    it('should send PLAY with the card and capture when playing', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(playing));

      // Act
      await harness.client.play('7D', ['3H', '4S']);

      // Assert
      expect(harness.lastSocket().send).toHaveBeenCalledWith(
        MATCH_ID,
        OpCode.PLAY,
        JSON.stringify({ cardId: '7D', capture: ['3H', '4S'] }),
      );
    });

    it('should send CUT with the keep flag when cutting', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(playing));

      // Act
      await harness.client.cut(false);

      // Assert
      expect(harness.lastSocket().send).toHaveBeenCalledWith(MATCH_ID, OpCode.CUT, JSON.stringify({ keep: false }));
    });

    it('should send BACK with an empty payload when the player says they are back', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      await harness.client.back();

      // Assert
      expect(harness.lastSocket().send).toHaveBeenCalledWith(MATCH_ID, OpCode.BACK, '');
    });

    it('should send BACK before PLAY when our seat is away', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(between)); // seat 0 timed out and is away

      // Act
      await harness.client.play('7D', []);

      // Assert
      expect(harness.lastSocket().send.mock.calls.map((call) => call[1])).toEqual([OpCode.BACK, OpCode.PLAY]);
    });

    it('should send BACK before CUT when our seat is away', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(between));

      // Act
      await harness.client.cut(true);

      // Assert
      expect(harness.lastSocket().send.mock.calls.map((call) => call[1])).toEqual([OpCode.BACK, OpCode.CUT]);
    });

    it('should not send BACK before PLAY when our seat is present', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(playing));

      // Act
      await harness.client.play('7D', []);

      // Assert
      expect(harness.lastSocket().send.mock.calls.map((call) => call[1])).toEqual([OpCode.PLAY]);
    });

    it('should send nothing when asked for the next round', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(between));

      // Act
      await harness.client.nextRound();

      // Assert
      expect(harness.lastSocket().send).not.toHaveBeenCalled();
    });

    it('should reject a play with offline when the client was never started', async () => {
      // Arrange
      const { client } = createHarness();

      // Act
      const result = client.play('7D', []);

      // Assert
      await expect(result).rejects.toThrow('offline');
    });

    it('should reject a play with offline while reconnecting', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();

      // Act
      const result = harness.client.play('7D', []);

      // Assert
      await expect(result).rejects.toThrow('offline');
    });

    it('should reject a cut with offline while reconnecting', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();

      // Act
      const result = harness.client.cut(true);

      // Assert
      await expect(result).rejects.toThrow('offline');
    });
  });

  describe('emotes', () => {
    function emitEmote(harness: Awaited<ReturnType<typeof onlineHarness>>, payload: unknown): void {
      harness.lastSocket().handlers.onMatchData(OpCode.EMOTE_SHOWN, JSON.stringify(payload));
    }

    it('should send EMOTE with the id', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(waitingSnapshot());

      // Act
      harness.client.emote('yalla');
      await flush();

      // Assert
      expect(harness.lastSocket().send).toHaveBeenCalledWith(MATCH_ID, OpCode.EMOTE, JSON.stringify({ id: 'yalla' }));
    });

    it('should swallow the failure when an emote is sent while offline', () => {
      // Arrange
      const harness = createHarness();

      // Act
      const send = () => harness.client.emote('thumbs');

      // Assert
      expect(send).not.toThrow();
    });

    it('should pass on an emote from another seat', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(waitingSnapshot());
      const listener = jest.fn();
      harness.client.subscribeEmotes(listener);

      // Act
      emitEmote(harness, { seat: 2, id: 'mabrouk' });

      // Assert
      expect(listener).toHaveBeenCalledWith({ seat: 2, id: 'mabrouk' });
    });

    it.each([
      { scenario: 'the echo of our own emote', payload: { seat: 0, id: 'laugh' } },
      { scenario: 'an unknown emote', payload: { seat: 1, id: 'kiss' } },
      { scenario: 'a seat out of range', payload: { seat: 7, id: 'laugh' } },
      { scenario: 'a payload without a seat', payload: { id: 'laugh' } },
    ])('should ignore $scenario', async ({ payload }) => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(waitingSnapshot());
      const listener = jest.fn();
      harness.client.subscribeEmotes(listener);

      // Act
      emitEmote(harness, payload);

      // Assert
      expect(listener).not.toHaveBeenCalled();
    });

    it('should stop passing on emotes after unsubscribing', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(waitingSnapshot());
      const listener = jest.fn();
      harness.client.subscribeEmotes(listener)();

      // Act
      emitEmote(harness, { seat: 1, id: 'fire' });

      // Assert
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('log', () => {
    it('should keep only the most recent 20 entries of a full log', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitSnapshot(fixture(between));

      // Assert
      expect(harness.client.getSnapshot().log.map((entry) => entry.seq)).toEqual(
        between.log.slice(-20).map((entry) => entry.seq),
      );
    });

    it('should append a log delta after the entries already seen', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(between));

      // Act
      harness.lastSocket().emitSnapshot(fixture(delta));

      // Assert
      expect(harness.client.getSnapshot().log.map((entry) => entry.seq)).toEqual(
        [...between.log, ...delta.log].slice(-20).map((entry) => entry.seq),
      );
    });

    it('should keep the log when a snapshot carries no new entries', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(between));
      const before = harness.client.getSnapshot().log;

      // Act
      harness.lastSocket().emitSnapshot(fixture(between, { log: [] }));

      // Assert
      expect(harness.client.getSnapshot().log).toEqual(before);
    });

    it('should drop entries already seen when the server resends the log from seq 1', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(between));
      harness.lastSocket().emitSnapshot(fixture(delta));
      const before = harness.client.getSnapshot().log;

      // Act
      harness.lastSocket().emitSnapshot(fixture(delta, { log: [...between.log, ...delta.log] }));

      // Assert
      expect(harness.client.getSnapshot().log).toEqual(before);
    });

    it('should not duplicate entries when the full log is resent after a rejoin', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(between));
      harness.lastSocket().drop();
      await harness.runNextTimer();

      // Act
      harness.lastSocket().emitSnapshot(fixture(delta, { log: [...between.log, ...delta.log] }));

      // Assert
      const seqs = harness.client.getSnapshot().log.map((entry) => entry.seq);
      expect(seqs).toEqual([...between.log, ...delta.log].slice(-20).map((entry) => entry.seq));
    });
  });

  describe('errors', () => {
    it('should expose a server error as a non-fatal lastError', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitError('not_your_turn');

      // Assert
      expect(harness.client.getSnapshot().online?.lastError).toEqual({ id: 1, code: 'not_your_turn', fatal: false });
    });

    it('should give each server error a new id when the same code repeats', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitError('illegal_move');

      // Act
      harness.lastSocket().emitError('illegal_move');

      // Assert
      expect(harness.client.getSnapshot().online?.lastError?.id).toBe(2);
    });

    it('should ignore an error with an unknown code', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitError('server_on_fire');

      // Assert
      expect(harness.client.getSnapshot().online?.lastError).toBeNull();
    });

    it('should ignore match data with an unknown opcode', async () => {
      // Arrange
      const harness = await onlineHarness();
      const listener = jest.fn();
      harness.client.subscribe(listener);

      // Act
      harness.lastSocket().handlers.onMatchData(42, JSON.stringify({ code: 'bad_opcode' }));

      // Assert
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('clock offset', () => {
    it.each([
      ['ahead of', 5000],
      ['behind', -5000],
    ])('should convert the turn deadline to local time when the server clock is %s the local one', async (_label, offset) => {
      // Arrange
      const harness = await onlineHarness();
      const serverNow = LOCAL_NOW + offset;

      // Act
      harness.lastSocket().emitSnapshot(fixture(playing, { serverTime: serverNow, turnDeadline: serverNow + 20_000 }));

      // Assert
      expect(harness.client.getSnapshot().turnDeadline).toBe(LOCAL_NOW + 20_000);
    });

    it.each([
      ['ahead of', 7000],
      ['behind', -7000],
    ])('should convert backfillAt to local time when the server clock is %s the local one', async (_label, offset) => {
      // Arrange
      const harness = await onlineHarness();
      const serverNow = LOCAL_NOW + offset;

      // Act
      harness.lastSocket().emitSnapshot(waitingSnapshot({ serverTime: serverNow, backfillAt: serverNow + 15_000 }));

      // Assert
      expect(harness.client.getSnapshot().online?.backfillAt).toBe(LOCAL_NOW + 15_000);
    });

    it.each([
      ['ahead of', 3000],
      ['behind', -3000],
    ])('should convert nextRoundAt to local time when the server clock is %s the local one', async (_label, offset) => {
      // Arrange
      const harness = await onlineHarness();
      const serverNow = LOCAL_NOW + offset;

      // Act
      harness.lastSocket().emitSnapshot(fixture(between, { serverTime: serverNow, nextRoundAt: serverNow + 8000 }));

      // Assert
      expect(harness.client.getSnapshot().online?.nextRoundAt).toBe(LOCAL_NOW + 8000);
    });

    it('should keep the offset of the least delayed sample when a later snapshot arrives late', async () => {
      // Arrange
      const offset = 5000;
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(playing, { serverTime: LOCAL_NOW + offset }));
      harness.clock.now = LOCAL_NOW + 1000;
      const sentAt = LOCAL_NOW + 1000 + offset - 400; // built 400 ms before it reached us

      // Act
      harness.lastSocket().emitSnapshot(fixture(playing, { serverTime: sentAt, turnDeadline: sentAt + 20_000 }));

      // Assert
      expect(harness.client.getSnapshot().turnDeadline).toBe(sentAt + 20_000 - offset);
    });

    it('should raise the offset when a less delayed sample arrives', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(playing, { serverTime: LOCAL_NOW + 4600 }));

      // Act
      harness.lastSocket().emitSnapshot(fixture(playing, { serverTime: LOCAL_NOW + 5000, turnDeadline: LOCAL_NOW + 25_000 }));

      // Assert
      expect(harness.client.getSnapshot().turnDeadline).toBe(LOCAL_NOW + 20_000);
    });
  });

  describe('table full and missing tables', () => {
    it('should ask quick match for another table when the first join finds the table full', async () => {
      // Arrange
      const harness = createHarness();
      harness.joinResults.push({ ok: false, reason: 'table_full' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.lastSocket().joinMatch.mock.calls.map((call) => call[0])).toEqual([MATCH_ID, 'quick-1']);
    });

    it('should switch to the new match id when the retry joins', async () => {
      // Arrange
      const harness = createHarness();
      harness.joinResults.push({ ok: false, reason: 'table_full' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.client.matchId).toBe('quick-1');
    });

    it('should stop after three quick match retries when every table is full', async () => {
      // Arrange
      const harness = createHarness();
      for (let i = 0; i < 4; i++) harness.joinResults.push({ ok: false, reason: 'table_full' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.backend.quickMatch).toHaveBeenCalledTimes(3);
    });

    it('should report a fatal table_full error when the retries run out', async () => {
      // Arrange
      const harness = createHarness();
      for (let i = 0; i < 4; i++) harness.joinResults.push({ ok: false, reason: 'table_full' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.client.getSnapshot().online?.lastError).toEqual({ id: 1, code: 'table_full', fatal: true });
    });

    it('should close the socket when the retries run out', async () => {
      // Arrange
      const harness = createHarness();
      for (let i = 0; i < 4; i++) harness.joinResults.push({ ok: false, reason: 'table_full' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.lastSocket().close).toHaveBeenCalled();
    });

    it('should honour a custom quick match retry limit', async () => {
      // Arrange
      const harness = createHarness({ maxQuickMatchRetries: 1 });
      for (let i = 0; i < 2; i++) harness.joinResults.push({ ok: false, reason: 'table_full' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.client.getSnapshot().online?.lastError?.code).toBe('table_full');
    });

    it('should report a fatal match_ended error when the match is not found', async () => {
      // Arrange
      const harness = createHarness();
      harness.joinResults.push({ ok: false, reason: 'not_found' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.client.getSnapshot().online?.lastError).toEqual({ id: 1, code: 'match_ended', fatal: true });
    });

    it('should not ask quick match for another table when the match is not found', async () => {
      // Arrange
      const harness = createHarness();
      harness.joinResults.push({ ok: false, reason: 'not_found' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.backend.quickMatch).not.toHaveBeenCalled();
    });

    it('should report a fatal join_failed error when the server rejects the join', async () => {
      // Arrange
      const harness = createHarness();
      harness.joinResults.push({ ok: false, reason: 'rejected', detail: 'nope' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.client.getSnapshot().online?.lastError).toEqual({ id: 1, code: 'join_failed', fatal: true });
    });

    it('should not retry a full table through quick match when rejoining after a disconnect', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();
      harness.joinResults.push({ ok: false, reason: 'table_full' });

      // Act
      await harness.runNextTimer();

      // Assert
      expect(harness.backend.quickMatch).not.toHaveBeenCalled();
    });
  });

  describe('reconnect', () => {
    it('should report reconnecting when the socket drops', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().drop();

      // Assert
      expect(harness.client.getSnapshot().connection).toBe('reconnecting');
    });

    it('should schedule the first reconnect after the 500 ms base delay with jitter', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().drop();

      // Assert
      expect(harness.scheduled.map((call) => call.ms)).toEqual([500 * JITTER]);
    });

    it.each([
      [0, 400],
      [0.999, 500],
    ])('should keep the jitter within 80-100%% of the delay when random returns %s', async (random, expected) => {
      // Arrange
      const harness = await onlineHarness({ random: () => random });

      // Act
      harness.lastSocket().drop();

      // Assert
      expect(harness.scheduled[0]?.ms).toBe(expected);
    });

    it('should double the delay per failed attempt up to the 10 s cap', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.backend.signIn.mockRejectedValue(new Error('network down'));
      harness.lastSocket().drop();
      const delays: number[] = [];

      // Act
      for (let attempt = 0; attempt < 7; attempt++) {
        delays.push(harness.scheduled[0]?.ms ?? -1);
        await harness.runNextTimer();
      }

      // Assert
      expect(delays).toEqual([500, 1000, 2000, 4000, 8000, 10_000, 10_000].map((ms) => ms * JITTER));
    });

    it('should sign in again when the reconnect timer fires', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();

      // Act
      await harness.runNextTimer();

      // Assert
      expect(harness.backend.signIn).toHaveBeenCalledTimes(2);
    });

    it('should rejoin the same match on a new socket when reconnecting', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();

      // Act
      await harness.runNextTimer();

      // Assert
      expect(harness.sockets.map((socket) => socket.joinMatch.mock.calls[0]?.[0])).toEqual([MATCH_ID, MATCH_ID]);
    });

    it('should report online again when the rejoin succeeds', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();

      // Act
      await harness.runNextTimer();

      // Assert
      expect(harness.client.getSnapshot().connection).toBe('online');
    });

    it('should reset the backoff when a reconnect succeeds', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.backend.signIn.mockRejectedValueOnce(new Error('network down'));
      harness.lastSocket().drop();
      await harness.runNextTimer(); // fails
      await harness.runNextTimer(); // succeeds

      // Act
      harness.lastSocket().drop();

      // Assert
      expect(harness.scheduled.map((call) => call.ms)).toEqual([500 * JITTER]);
    });

    it('should retry with backoff when the first connection fails before any join', async () => {
      // Arrange
      const harness = createHarness();
      harness.backend.openSocket.mockRejectedValueOnce(new Error('refused'));

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.client.getSnapshot().connection).toBe('connecting');
    });

    it('should ignore match data from the old socket after reconnecting', async () => {
      // Arrange
      const harness = await onlineHarness();
      const oldSocket = harness.lastSocket();
      oldSocket.drop();
      await harness.runNextTimer();

      // Act
      oldSocket.emitError('not_your_turn');

      // Assert
      expect(harness.client.getSnapshot().online?.lastError).toBeNull();
    });

    it('should send intents on the new socket after reconnecting', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();
      await harness.runNextTimer();

      // Act
      await harness.client.cut(true);

      // Assert
      expect(harness.sockets[1]?.send).toHaveBeenCalledWith(MATCH_ID, OpCode.CUT, JSON.stringify({ keep: true }));
    });
  });

  describe('stop', () => {
    it('should leave the match when stopped', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.client.stop();
      await flush();

      // Assert
      expect(harness.lastSocket().leaveMatch).toHaveBeenCalledWith(MATCH_ID);
    });

    it('should close the socket after leaving when stopped', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.client.stop();
      await flush();

      // Assert
      expect(harness.lastSocket().close).toHaveBeenCalledTimes(1);
    });

    it('should still close the socket when leaving fails', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().leaveMatch.mockRejectedValueOnce(new Error('gone'));

      // Act
      harness.client.stop();
      await flush();

      // Assert
      expect(harness.lastSocket().close).toHaveBeenCalledTimes(1);
    });

    it('should leave only once when stopped twice', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.client.stop();

      // Act
      harness.client.stop();
      await flush();

      // Assert
      expect(harness.lastSocket().leaveMatch).toHaveBeenCalledTimes(1);
    });

    it('should not schedule a reconnect when the socket drops after stop', async () => {
      // Arrange
      const harness = await onlineHarness();
      const socket = harness.lastSocket();
      harness.client.stop();

      // Act
      socket.drop();

      // Assert
      expect(harness.scheduled).toHaveLength(0);
    });

    it('should not report reconnecting when the socket drops after stop', async () => {
      // Arrange
      const harness = await onlineHarness();
      const socket = harness.lastSocket();
      harness.client.stop();

      // Act
      socket.drop();

      // Assert
      expect(harness.client.getSnapshot().connection).toBe('online');
    });

    it('should cancel a pending reconnect when stopped', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();

      // Act
      harness.client.stop();

      // Assert
      expect(harness.scheduled).toHaveLength(0);
    });

    it('should ignore snapshots from the socket after stop', async () => {
      // Arrange
      const harness = await onlineHarness();
      const socket = harness.lastSocket();
      harness.client.stop();
      const listener = jest.fn();
      harness.client.subscribe(listener);

      // Act
      socket.emitSnapshot(waitingSnapshot());

      // Assert
      expect(listener).not.toHaveBeenCalled();
    });

    it('should not open a socket when stopped while signing in', async () => {
      // Arrange
      const harness = createHarness();
      harness.client.start();
      harness.client.stop();

      // Act
      await flush();

      // Assert
      expect(harness.backend.openSocket).not.toHaveBeenCalled();
    });
  });
});

describe('NakamaGameClient private tables', () => {
  const PRIVATE = { privateCode: FIXTURE_ROOM_CODE };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('construction', () => {
    it.each([
      ['lowercase', 'k7m2qx'],
      ['dashed', 'K7M-2QX'],
      ['too short', 'K7M2Q'],
      ['outside the alphabet', 'K7M2Q0'],
      ['empty', ''],
    ])('should throw a RangeError when privateCode is %s', (_label, privateCode) => {
      // Arrange
      const build = () => createHarness({ privateCode });

      // Act
      const act = () => build();

      // Assert
      expect(act).toThrow(RangeError);
    });

    it('should accept a normalized room code as privateCode', () => {
      // Arrange
      const build = () => createHarness(PRIVATE);

      // Act
      const act = () => build();

      // Assert
      expect(act).not.toThrow();
    });
  });

  describe('join metadata', () => {
    it('should send the room code as join metadata on the first join', async () => {
      // Arrange
      const harness = createHarness(PRIVATE);

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.lastSocket().joinMatch.mock.calls).toEqual([[MATCH_ID, { [ROOM_JOIN_CODE_KEY]: FIXTURE_ROOM_CODE }]]);
    });

    it('should send the room code as join metadata again when reconnecting', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);
      harness.lastSocket().drop();

      // Act
      await harness.runNextTimer();

      // Assert
      expect(harness.lastSocket().joinMatch.mock.calls).toEqual([[MATCH_ID, { [ROOM_JOIN_CODE_KEY]: FIXTURE_ROOM_CODE }]]);
    });

    it('should send no join metadata for a quick match table', async () => {
      // Arrange
      const harness = createHarness();

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.lastSocket().joinMatch.mock.calls).toEqual([[MATCH_ID]]);
    });

    it('should send no join metadata for a quick match table when reconnecting', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().drop();

      // Act
      await harness.runNextTimer();

      // Assert
      expect(harness.lastSocket().joinMatch.mock.calls).toEqual([[MATCH_ID]]);
    });
  });

  describe('join refusals', () => {
    it.each(['room_not_found', 'room_full'] as const)(
      'should report a fatal %s error when the private join is refused',
      async (reason) => {
        // Arrange
        const harness = createHarness(PRIVATE);
        harness.joinResults.push({ ok: false, reason });

        // Act
        harness.client.start();
        await flush();

        // Assert
        expect(harness.client.getSnapshot().online?.lastError).toEqual({ id: 1, code: reason, fatal: true });
      },
    );

    it.each(['room_not_found', 'room_full'] as const)(
      'should neither retry nor ask quick match when the private join fails with %s',
      async (reason) => {
        // Arrange
        const harness = createHarness(PRIVATE);
        harness.joinResults.push({ ok: false, reason });

        // Act
        harness.client.start();
        await flush();

        // Assert
        expect({
          joins: harness.lastSocket().joinMatch.mock.calls.length,
          quickMatches: harness.backend.quickMatch.mock.calls.length,
          scheduled: harness.scheduled.length,
        }).toEqual({ joins: 1, quickMatches: 0, scheduled: 0 });
      },
    );

    it.each(['room_not_found', 'room_full'] as const)(
      'should close the socket when the private join fails with %s',
      async (reason) => {
        // Arrange
        const harness = createHarness(PRIVATE);
        harness.joinResults.push({ ok: false, reason });

        // Act
        harness.client.start();
        await flush();

        // Assert
        expect(harness.lastSocket().close).toHaveBeenCalled();
      },
    );

    it('should not ask quick match for another table when a private join finds the table full', async () => {
      // Arrange
      const harness = createHarness(PRIVATE);
      harness.joinResults.push({ ok: false, reason: 'table_full' });

      // Act
      harness.client.start();
      await flush();

      // Assert
      expect(harness.backend.quickMatch).not.toHaveBeenCalled();
    });

    it('should report a fatal room_not_found error when the room is gone on reconnect', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);
      harness.lastSocket().drop();
      harness.joinResults.push({ ok: false, reason: 'room_not_found' });

      // Act
      await harness.runNextTimer();

      // Assert
      expect(harness.client.getSnapshot().online?.lastError).toEqual({ id: 1, code: 'room_not_found', fatal: true });
    });
  });

  describe('room mapping', () => {
    it('should map the room members, code and scores into online.room', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_STANDING_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.room).toMatchObject({
        code: FIXTURE_ROOM_CODE,
        members: PRIVATE_PLAYING_STANDING_SNAPSHOT.room?.members,
        scores: [3, 5],
      });
    });

    it('should set mySeat to the snapshot seat when seated', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_SEATED_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.room?.mySeat).toBe(0);
    });

    it('should set mySeat to null when the snapshot seat is -1', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_STANDING_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.room?.mySeat).toBeNull();
    });

    it('should set mySeat to null after standing up from a seat', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_SEATED_SNAPSHOT));

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_STANDING_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.room?.mySeat).toBeNull();
    });

    it('should set amHost when our member entry is the host', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_SEATED_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.room?.amHost).toBe(true);
    });

    it('should clear amHost when our member entry is not the host', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_STANDING_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.room?.amHost).toBe(false);
    });

    it.each([
      ['ahead of', 6000],
      ['behind', -6000],
    ])('should convert resetAt to local time when the server clock is %s the local one', async (_label, offset) => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);
      const serverNow = LOCAL_NOW + offset;
      const room = { ...PRIVATE_PLAYING_SEATED_SNAPSHOT.room, resetAt: serverNow + 15_000 };

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_SEATED_SNAPSHOT, { serverTime: serverNow, room }));

      // Assert
      expect(harness.client.getSnapshot().online?.room?.resetAt).toBe(LOCAL_NOW + 15_000);
    });

    it('should keep resetAt null when the server sends none', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_SEATED_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.room?.resetAt).toBeNull();
    });

    it('should not mark the game started for a standing member mid-game', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_STANDING_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.started).toBe(false);
    });

    it('should leave out the room key when the snapshot is public', async () => {
      // Arrange
      const harness = await onlineHarness();

      // Act
      harness.lastSocket().emitSnapshot(fixture(PUBLIC_PLAYING_SNAPSHOT));

      // Assert
      expect('room' in (harness.client.getSnapshot().online ?? {})).toBe(false);
    });

    it('should leave out the room key before any snapshot arrives', () => {
      // Arrange
      const { client } = createHarness(PRIVATE);

      // Act
      const online = client.getSnapshot().online ?? {};

      // Assert
      expect('room' in online).toBe(false);
    });
  });

  describe('reset to the room after a game', () => {
    /** A private client that played a game (log seqs 1-45) and then got the waiting-room snapshot. */
    async function resetHarness() {
      const harness = await onlineHarness(PRIVATE);
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_SEATED_SNAPSHOT, { log: between.log }));
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_SEATED_SNAPSHOT));
      return harness;
    }

    it('should turn started off when the table returns to waiting', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_SEATED_SNAPSHOT));

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_SEATED_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.started).toBe(false);
    });

    it('should clear the last game view when the table returns to waiting', async () => {
      // Arrange
      const harness = await resetHarness();

      // Act
      const { view } = harness.client.getSnapshot();

      // Assert
      expect({ hand: view.hand, table: view.table, legalMoves: view.legalMoves, scores: view.scores }).toEqual({
        hand: [],
        table: [],
        legalMoves: [],
        scores: [0, 0],
      });
    });

    it('should clear the log when the table returns to waiting', async () => {
      // Arrange
      const harness = await resetHarness();

      // Act
      const { log } = harness.client.getSnapshot();

      // Assert
      expect(log).toEqual([]);
    });

    it('should bump gameKey when the table returns to waiting', async () => {
      // Arrange
      const harness = await resetHarness();

      // Act
      const gameKey = harness.client.getSnapshot().online?.gameKey;

      // Assert
      expect(gameKey).toBe(1);
    });

    it('should bump gameKey once per game', async () => {
      // Arrange
      const harness = await resetHarness();
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_SEATED_SNAPSHOT));

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_SEATED_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.gameKey).toBe(2);
    });

    it('should keep gameKey at 0 when the first room snapshot is already waiting', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_SEATED_SNAPSHOT));
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_WAITING_STANDING_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.gameKey).toBe(0);
    });

    it('should keep gameKey at 0 on a public table', async () => {
      // Arrange
      const harness = await onlineHarness();
      harness.lastSocket().emitSnapshot(fixture(playing));

      // Act
      harness.lastSocket().emitSnapshot(waitingSnapshot());

      // Assert
      expect(harness.client.getSnapshot().online?.gameKey).toBe(0);
    });

    it('should still drop log entries of the previous game when the next game resends them', async () => {
      // Arrange
      const harness = await resetHarness();

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_SEATED_SNAPSHOT, { log: [...between.log, ...delta.log] }));

      // Assert
      expect(harness.client.getSnapshot().log.map((entry) => entry.seq)).toEqual(delta.log.map((entry) => entry.seq));
    });

    it('should mark the next game started when its first view arrives', async () => {
      // Arrange
      const harness = await resetHarness();

      // Act
      harness.lastSocket().emitSnapshot(fixture(PRIVATE_PLAYING_SEATED_SNAPSHOT));

      // Assert
      expect(harness.client.getSnapshot().online?.started).toBe(true);
    });
  });

  describe('room actions', () => {
    it.each([0, 1, 2, 3])('should send SIT with {"seat":%i} when sitting', async (seat) => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      await harness.client.sit(seat);

      // Assert
      expect(harness.lastSocket().send).toHaveBeenCalledWith(MATCH_ID, OpCode.SIT, `{"seat":${seat}}`);
    });

    it.each([-1, 4, 1.5, Number.NaN])('should reject sit with a RangeError when the seat is %p', async (seat) => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      const result = harness.client.sit(seat);

      // Assert
      await expect(result).rejects.toThrow(RangeError);
    });

    it('should send nothing when sit is given an out-of-range seat', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      await harness.client.sit(4).catch(() => undefined);

      // Assert
      expect(harness.lastSocket().send).not.toHaveBeenCalled();
    });

    it('should send START with an empty payload when the host starts the game', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);

      // Act
      await harness.client.startGame();

      // Assert
      expect(harness.lastSocket().send).toHaveBeenCalledWith(MATCH_ID, OpCode.START, '');
    });

    it('should reject sit with offline when the client was never started', async () => {
      // Arrange
      const { client } = createHarness(PRIVATE);

      // Act
      const result = client.sit(0);

      // Assert
      await expect(result).rejects.toThrow('offline');
    });

    it('should reject startGame with offline while reconnecting', async () => {
      // Arrange
      const harness = await onlineHarness(PRIVATE);
      harness.lastSocket().drop();

      // Act
      const result = harness.client.startGame();

      // Assert
      await expect(result).rejects.toThrow('offline');
    });
  });
});
