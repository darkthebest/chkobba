import { describe, it, expect } from 'vitest';
import { OpCode, ROOM_RESET_MS } from '@chkobba/protocol';
import { createGame } from '@chkobba/rules';
import {
  PLAY_MS,
  SEAT_COUNT,
  TABLE_RULES,
  intent,
  leave,
  nextWakeAt,
  tick,
  type IntentResult,
  type Presence,
  type TableState,
} from '..';
import { SEED, T0, driveToTurn, driveUntil, joiner, mustJoin, presence, privateTable, type Driven } from './helpers';

/**
 * Private tables over a whole game: the return to the room after
 * ROOM_RESET_MS, the next game's seed, and a standing member taking over a
 * bot seat mid-game. Every game is driven by `tick` alone (idle humans time
 * out, then go away and bots play for them), so runs are deterministic.
 */

function mustIntent(state: TableState, from: Presence, opcode: number, payload: unknown, now: number): TableState {
  const result = intent(state, from, opcode, payload, now);
  if (!result.ok) throw new Error(`intent ${opcode} from ${from.userId} rejected: ${result.error}`);
  return result.state;
}

/** Private table with `members` humans (u1 host); u1 sends START at `now`. */
function startedRoom(members: number, now: number = T0): TableState {
  return mustIntent(privateTable(members, now), presence(1), OpCode.START, {}, now);
}

function driveToFinished(state: TableState, now: number): Driven {
  return driveUntil(state, (s) => s.phase === 'finished', now);
}

/** `tick` at the scheduled return to the room. */
function resetOf(finished: TableState): TableState {
  if (finished.nextActionAt === null) throw new Error('finished private table has no reset scheduled');
  return tick(finished, finished.nextActionAt);
}

function memo<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => {
    if (value === undefined) value = build();
    return value;
  };
}

/**
 * u1 (host, seat 0), u2 (seat 1), u3 (seat 2); START fills seat 3 with a bot.
 * u4 joins mid-game and stands; u2 disconnects right after the start. Played
 * to the end. State is immutable, so the run is computed once and shared.
 */
const mixedRoom = memo(() => {
  let state = startedRoom(3);
  state = mustJoin(state, joiner(4), T0);
  state = leave(state, presence(2), T0);
  const { state: finished, now } = driveToFinished(state, T0);
  return { finished, now, reset: resetOf(finished) };
});

/** Same as mixedRoom without u4, but the host u1 is the one who disconnects. */
const hostDroppedRoom = memo(() => {
  const state = leave(startedRoom(3), presence(1), T0);
  const { state: finished } = driveToFinished(state, T0);
  return { finished, reset: resetOf(finished) };
});

/** All four humans disconnect right after the start; bots play the whole game. */
const desertedRoom = memo(() => {
  let state = startedRoom(4);
  for (let n = 1; n <= 4; n++) state = leave(state, presence(n), T0);
  const { state: finished } = driveToFinished(state, T0);
  return { finished, reset: resetOf(finished) };
});

describe('private table game and reset to the room', () => {
  describe('finished phase', () => {
    it('should reach the finished phase when a private game is driven by tick', () => {
      // Arrange
      const run = mixedRoom;

      // Act
      const { finished } = run();

      // Assert
      expect(finished.phase).toBe('finished');
    });

    it('should schedule the next wake-up at finishedAt plus ROOM_RESET_MS', () => {
      // Arrange
      const { finished } = mixedRoom();

      // Act
      const wake = nextWakeAt(finished);

      // Assert
      expect(wake).toBe((finished.finishedAt ?? Number.NaN) + ROOM_RESET_MS);
    });

    it('should not reset when tick runs one millisecond before ROOM_RESET_MS elapses', () => {
      // Arrange
      const { finished } = mixedRoom();
      const justBefore = (finished.finishedAt ?? Number.NaN) + ROOM_RESET_MS - 1;

      // Act
      const after = tick(finished, justBefore);

      // Assert
      expect(after).toBe(finished);
    });

    it('should keep the host while the host is only disconnected during the game', () => {
      // Arrange
      const run = hostDroppedRoom;

      // Act
      const { finished } = run();

      // Assert
      expect(finished.room?.hostUserId).toBe('u1');
    });
  });

  describe('reset after ROOM_RESET_MS', () => {
    it('should return to the waiting phase with no game', () => {
      // Arrange
      const run = mixedRoom;

      // Act
      const { reset } = run();

      // Assert
      expect({ phase: reset.phase, game: reset.game }).toEqual({ phase: 'waiting', game: null });
    });

    it('should clear every timer and the finish time', () => {
      // Arrange
      const run = mixedRoom;

      // Act
      const { reset } = run();

      // Assert
      expect({
        waitingSince: reset.waitingSince,
        turnDeadline: reset.turnDeadline,
        nextActionAt: reset.nextActionAt,
        finishedAt: reset.finishedAt,
      }).toEqual({ waitingSince: null, turnDeadline: null, nextActionAt: null, finishedAt: null });
    });

    it('should keep connected humans seated, free the disconnected human and empty the bot seat', () => {
      // Arrange
      const run = mixedRoom;

      // Act
      const { reset } = run();

      // Assert
      expect(reset.seats).toEqual([
        { kind: 'human', userId: 'u1', sessionId: 's1', name: 'Player 1', missed: 0, away: false },
        null,
        { kind: 'human', userId: 'u3', sessionId: 's3', name: 'Player 3', missed: 0, away: false },
        null,
      ]);
    });

    it('should clear the miss streak and away flag of a human who went away during the game', () => {
      // Arrange
      const { finished, reset } = mixedRoom();
      const flags = (state: TableState) => {
        const slot = state.seats[0];
        return slot && slot.kind === 'human' ? { missed: slot.missed > 0, away: slot.away } : null;
      };

      // Act
      const change = { before: flags(finished), after: flags(reset) };

      // Assert
      expect(change).toEqual({ before: { missed: true, away: true }, after: { missed: false, away: false } });
    });

    it('should drop the disconnected member and keep present ones in join order', () => {
      // Arrange
      const run = mixedRoom;

      // Act
      const { reset } = run();

      // Assert
      expect(reset.room?.members.map((m) => m.userId)).toEqual(['u1', 'u3', 'u4']);
    });

    it('should keep the host when the host is still present', () => {
      // Arrange
      const run = mixedRoom;

      // Act
      const { reset } = run();

      // Assert
      expect(reset.room?.hostUserId).toBe('u1');
    });

    it('should pass the host to the earliest present member when the host was dropped', () => {
      // Arrange
      const run = hostDroppedRoom;

      // Act
      const { reset } = run();

      // Assert
      expect(reset.room?.hostUserId).toBe('u2');
    });

    it('should keep seq and clear the log', () => {
      // Arrange
      const { finished, reset } = mixedRoom();

      // Act
      const result = { seq: reset.seq, log: reset.log };

      // Assert
      expect({ result, hadEntries: finished.seq > 0 }).toEqual({ result: { seq: finished.seq, log: [] }, hadEntries: true });
    });

    it('should keep the room code and game count', () => {
      // Arrange
      const run = mixedRoom;

      // Act
      const { reset } = run();

      // Assert
      expect({ code: reset.room?.code, gameNo: reset.room?.gameNo }).toEqual({ code: 'K7M2QX', gameNo: 1 });
    });

    it('should schedule nothing once back in the room', () => {
      // Arrange
      const { reset } = mixedRoom();

      // Act
      const wake = nextWakeAt(reset);

      // Assert
      expect(wake).toBeNull();
    });

    it('should leave a consistent empty room when everyone was disconnected at reset', () => {
      // Arrange
      const run = desertedRoom;

      // Act
      const { reset } = run();

      // Assert
      expect({ phase: reset.phase, members: reset.room?.members, hostUserId: reset.room?.hostUserId, seats: reset.seats }).toEqual({
        phase: 'waiting',
        members: [],
        hostUserId: null,
        seats: [null, null, null, null],
      });
    });
  });

  describe('second game', () => {
    function secondStart(): TableState {
      const { reset, finished } = mixedRoom();
      const at = finished.nextActionAt ?? T0;
      return mustIntent(reset, presence(1), OpCode.START, {}, at);
    }

    it('should count the second game in the room', () => {
      // Arrange
      const start = secondStart;

      // Act
      const second = start();

      // Assert
      expect(second.room?.gameNo).toBe(2);
    });

    it('should seed the first game with `${seed}:1`', () => {
      // Arrange
      const expected = createGame({ seed: `${SEED}:1`, playerCount: SEAT_COUNT, rules: TABLE_RULES }).state;

      // Act
      const first = startedRoom(3);

      // Assert
      expect(first.game).toEqual(expected);
    });

    it('should seed the second game with `${seed}:2`', () => {
      // Arrange
      const expected = createGame({ seed: `${SEED}:2`, playerCount: SEAT_COUNT, rules: TABLE_RULES }).state;

      // Act
      const second = secondStart();

      // Assert
      expect(second.game).toEqual(expected);
    });

    it('should deal the second game differently from the first', () => {
      // Arrange
      const first = startedRoom(3);

      // Act
      const second = secondStart();

      // Assert
      expect(JSON.stringify(second.game)).not.toBe(JSON.stringify(first.game));
    });

    it('should refill the freed seats with bots when the second game starts', () => {
      // Arrange
      const start = secondStart;

      // Act
      const second = start();

      // Assert
      expect(second.seats.map((s) => (s ? s.kind : null))).toEqual(['human', 'bot', 'human', 'bot']);
    });
  });
});

describe('takeover of a bot seat by a standing member', () => {
  /** u1 (seat 0, host) and u2 (seat 1); START puts bots on seats 2 and 3; u5 joins and stands. */
  function roomWithStander(): TableState {
    return mustJoin(startedRoom(2), joiner(5), T0);
  }

  function sit(state: TableState, who: number, seat: number, now: number): IntentResult {
    return intent(state, presence(who), OpCode.SIT, { seat }, now);
  }

  const atBotTurn = memo(() => {
    const driven = driveToTurn(roomWithStander(), 2, T0, 'playing');
    const result = sit(driven.state, 5, 2, driven.now);
    if (!result.ok) throw new Error(`takeover rejected: ${result.error}`);
    return { before: driven.state, now: driven.now, taken: result.state };
  });

  it('should make the bot seat the standing member human seat', () => {
    // Arrange
    const run = atBotTurn;

    // Act
    const { taken } = run();

    // Assert
    expect(taken.seats[2]).toEqual({ kind: 'human', userId: 'u5', sessionId: 's5', name: 'Player 5', missed: 0, away: false });
  });

  it('should cancel the pending bot move and start a fresh human timer when the seat is to act', () => {
    // Arrange
    const run = atBotTurn;

    // Act
    const { taken, now } = run();

    // Assert
    expect({ turnDeadline: taken.turnDeadline, nextActionAt: taken.nextActionAt }).toEqual({
      turnDeadline: now + PLAY_MS,
      nextActionAt: null,
    });
  });

  it('should have had a bot move pending on that seat before the takeover', () => {
    // Arrange
    const run = atBotTurn;

    // Act
    const { before } = run();

    // Assert
    expect({ nextActionAt: before.nextActionAt !== null, turnDeadline: before.turnDeadline }).toEqual({
      nextActionAt: true,
      turnDeadline: null,
    });
  });

  it('should not let the bot play the turn when the cancelled bot pace comes due', () => {
    // Arrange
    const { before, taken } = atBotTurn();
    const cancelledAt = before.nextActionAt ?? Number.NaN;

    // Act
    const after = tick(taken, cancelledAt);

    // Assert
    expect(after).toBe(taken);
  });

  it('should leave the timers alone when the taken-over seat is not to act', () => {
    // Arrange
    const { state, now } = driveToTurn(roomWithStander(), 3, T0, 'playing');

    // Act
    const result = sit(state, 5, 2, now);

    // Assert
    expect(
      result.ok ? { turnDeadline: result.state.turnDeadline, nextActionAt: result.state.nextActionAt } : result.error,
    ).toEqual({ turnDeadline: state.turnDeadline, nextActionAt: state.nextActionAt });
  });

  it('should refuse the reserved seat of a disconnected human with seat_taken', () => {
    // Arrange
    const state = leave(roomWithStander(), presence(2), T0);

    // Act
    const result = sit(state, 5, 1, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'seat_taken' });
  });

  it('should refuse the seat of a connected human with seat_taken', () => {
    // Arrange
    const state = roomWithStander();

    // Act
    const result = sit(state, 5, 0, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'seat_taken' });
  });

  it('should refuse a takeover by an already seated member with already_seated', () => {
    // Arrange
    const state = roomWithStander();

    // Act
    const result = sit(state, 1, 2, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'already_seated' });
  });

  it('should refuse SIT once the game is finished with wrong_phase', () => {
    // Arrange
    const { state, now } = driveToFinished(roomWithStander(), T0);

    // Act
    const result = sit(state, 5, 2, now);

    // Assert
    expect(result).toEqual({ ok: false, error: 'wrong_phase' });
  });
});
