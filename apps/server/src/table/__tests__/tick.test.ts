import { describe, it, expect } from 'vitest';
import { OpCode } from '@chkobba/protocol';
import {
  AWAY_AFTER_MISSES,
  BACKFILL_MS,
  BOT_PACE_MS,
  CUT_MS,
  NEXT_ROUND_MS,
  PLAY_MS,
  intent,
  leave,
  nextWakeAt,
  tick,
  type TableState,
} from '..';
import {
  T0,
  actAsHuman,
  advance,
  driveToTurn,
  driveUntil,
  firstLegalPlay,
  fullHumanTable,
  gameOf,
  humanAt,
  joiner,
  mustJoin,
  newTable,
  presence,
  soloAfterMisses,
  soloAtHumanTurn,
  soloHumanTable,
  tableWithHumans,
  turnOf,
  type Driven,
} from './helpers';

/** u1 sits at seat 0 with three bots on the solo table. */
const HUMAN = 0;

describe('backfill', () => {
  it('should schedule the backfill 15 s after the first human sat down', () => {
    // Arrange
    const state = tableWithHumans(1);

    // Act
    const wake = nextWakeAt(state);

    // Assert
    expect(wake).toBe(T0 + BACKFILL_MS);
  });

  it('should use a 15 s backfill wait', () => {
    // Arrange
    const expected = 15000;

    // Act
    const actual = BACKFILL_MS;

    // Assert
    expect(actual).toBe(expected);
  });

  it('should return the same state when ticked 1 ms before the backfill is due', () => {
    // Arrange
    const state = tableWithHumans(1);

    // Act
    const ticked = tick(state, T0 + BACKFILL_MS - 1);

    // Assert
    expect(ticked).toBe(state);
  });

  it('should start the game when the backfill is due', () => {
    // Arrange
    const state = tableWithHumans(1);

    // Act
    const ticked = tick(state, T0 + BACKFILL_MS);

    // Assert
    expect(ticked.phase).toBe('playing');
  });

  it('should fill every empty seat with a bot and keep the human seats when the backfill fires', () => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const ticked = tick(state, T0 + BACKFILL_MS);

    // Assert
    expect(ticked.seats.map((slot) => slot?.kind)).toEqual(['human', 'human', 'bot', 'bot']);
  });

  it('should start the game on the first tick at or after the due time when an earlier tick was too early', () => {
    // Arrange
    const state = tableWithHumans(1);
    const late = tick(state, T0 + BACKFILL_MS - 1);

    // Act
    const ticked = tick(late, T0 + BACKFILL_MS);

    // Assert
    expect(ticked.phase).toBe('playing');
  });

  describe('clock starts at the first human join', () => {
    /** Table created at T0; the first human joins 40 s later. */
    const JOINED_AT = T0 + 40_000;

    function lateJoinTable(): TableState {
      return mustJoin(newTable(T0), joiner(1), JOINED_AT);
    }

    it('should record the first join time as waitingSince', () => {
      // Arrange
      const state = newTable(T0);

      // Act
      const joined = mustJoin(state, joiner(1), JOINED_AT);

      // Assert
      expect(joined.waitingSince).toBe(JOINED_AT);
    });

    it('should not backfill at creation + BACKFILL_MS when the first human joined later', () => {
      // Arrange
      const state = lateJoinTable();

      // Act
      const ticked = tick(state, JOINED_AT + BACKFILL_MS - 1);

      // Assert
      expect(ticked).toBe(state);
    });

    it('should schedule the backfill BACKFILL_MS after the first join when the table was created earlier', () => {
      // Arrange
      const state = lateJoinTable();

      // Act
      const wake = nextWakeAt(state);

      // Assert
      expect(wake).toBe(JOINED_AT + BACKFILL_MS);
    });

    it('should backfill exactly BACKFILL_MS after the first join', () => {
      // Arrange
      const state = lateJoinTable();

      // Act
      const ticked = tick(state, JOINED_AT + BACKFILL_MS);

      // Assert
      expect(ticked.phase).toBe('playing');
    });

    it('should not reset the clock when a second human joins', () => {
      // Arrange
      const state = lateJoinTable();

      // Act
      const joined = mustJoin(state, joiner(2), JOINED_AT + 10_000);

      // Assert
      expect(nextWakeAt(joined)).toBe(JOINED_AT + BACKFILL_MS);
    });

    it('should keep the clock running when one of two waiting humans leaves', () => {
      // Arrange
      const two = mustJoin(lateJoinTable(), joiner(2), JOINED_AT + 5_000);

      // Act
      const left = leave(two, presence(1), JOINED_AT + 8_000);

      // Assert
      expect(nextWakeAt(left)).toBe(JOINED_AT + BACKFILL_MS);
    });

    it('should clear waitingSince when the last waiting human leaves', () => {
      // Arrange
      const state = lateJoinTable();

      // Act
      const left = leave(state, presence(1), JOINED_AT + 5_000);

      // Assert
      expect(left.waitingSince).toBeNull();
    });

    it('should restart the clock from the new join when a human joins after the last one left', () => {
      // Arrange
      const left = leave(lateJoinTable(), presence(1), JOINED_AT + 5_000);
      const rejoinedAt = JOINED_AT + 30_000;

      // Act
      const joined = mustJoin(left, joiner(2), rejoinedAt);

      // Assert
      expect(nextWakeAt(joined)).toBe(rejoinedAt + BACKFILL_MS);
    });

    it('should not backfill at the old due time when the clock restarted', () => {
      // Arrange
      const left = leave(lateJoinTable(), presence(1), JOINED_AT + 5_000);
      const joined = mustJoin(left, joiner(2), JOINED_AT + 10_000);

      // Act
      const ticked = tick(joined, JOINED_AT + BACKFILL_MS);

      // Assert
      expect(ticked).toBe(joined);
    });
  });

  it('should schedule nothing when no human is seated', () => {
    // Arrange
    const state = newTable();

    // Act
    const wake = nextWakeAt(state);

    // Assert
    expect(wake).toBeNull();
  });

  it('should never backfill an empty table however late it is ticked', () => {
    // Arrange
    const state = newTable();

    // Act
    const ticked = tick(state, T0 + BACKFILL_MS * 100);

    // Assert
    expect(ticked).toBe(state);
  });

  it('should not backfill when the only human left before the wait elapsed', () => {
    // Arrange
    const state = leave(tableWithHumans(1), presence(1), T0 + 1000);

    // Act
    const ticked = tick(state, T0 + BACKFILL_MS);

    // Assert
    expect(ticked).toBe(state);
  });

  it('should not schedule a backfill when the only human left before the wait elapsed', () => {
    // Arrange
    const state = leave(tableWithHumans(1), presence(1), T0 + 1000);

    // Act
    const wake = nextWakeAt(state);

    // Assert
    expect(wake).toBeNull();
  });
});

describe('turn timers', () => {
  it('should use a 10 s cut timer and a 20 s play timer', () => {
    // Arrange
    const expected = { cut: 10000, play: 20000 };

    // Act
    const actual = { cut: CUT_MS, play: PLAY_MS };

    // Assert
    expect(actual).toEqual(expected);
  });

  it('should give the human cutter CUT_MS to cut when the round starts', () => {
    // Arrange
    const started = fullHumanTable(T0 + 250);

    // Act
    const deadline = nextWakeAt(started);

    // Assert
    expect(deadline).toBe(T0 + 250 + CUT_MS);
  });

  it('should give the next human PLAY_MS to play when the cut is resolved', () => {
    // Arrange
    const started = fullHumanTable();
    const cutAt = T0 + 4000;

    // Act
    const cut = actAsHuman(started, cutAt);

    // Assert
    expect({ gamePhase: gameOf(cut).phase, turnDeadline: cut.turnDeadline }).toEqual({
      gamePhase: 'playing',
      turnDeadline: cutAt + PLAY_MS,
    });
  });

  it('should give the human PLAY_MS on their play turn when bots played before them', () => {
    // Arrange
    const driven = soloAtHumanTurn('playing');

    // Act
    const deadline = driven.state.turnDeadline;

    // Assert
    expect(deadline).toBe(driven.now + PLAY_MS);
  });

  it('should never run a human deadline and a bot action at the same time', () => {
    // Arrange
    const started = soloHumanTable();
    const both: number[] = [];

    // Act
    driveUntil(
      started.state,
      (state) => {
        if (state.turnDeadline !== null && state.nextActionAt !== null) both.push(state.seq);
        return state.phase !== 'playing';
      },
      started.now,
    );

    // Assert
    expect(both).toEqual([]);
  });

  it('should return the same state when ticked before the human deadline', () => {
    // Arrange
    const started = fullHumanTable();

    // Act
    const ticked = tick(started, T0 + CUT_MS - 1);

    // Assert
    expect(ticked).toBe(started);
  });

  it('should pace bot turns BOT_PACE_MS after the previous action', () => {
    // Arrange
    const driven = soloHumanTable();
    const atBot = driveUntil(driven.state, (state) => turnOf(state) !== HUMAN, driven.now);

    // Act
    const wake = nextWakeAt(atBot.state);

    // Assert
    expect(wake).toBe(atBot.now + BOT_PACE_MS);
  });

  it('should perform at most one game action per tick even when ticked far in the future', () => {
    // Arrange
    const driven = soloHumanTable();
    const atBot = driveUntil(driven.state, (state) => turnOf(state) !== HUMAN, driven.now);

    // Act
    const ticked = tick(atBot.state, atBot.now + 60 * 60 * 1000);

    // Assert
    expect(ticked.log.filter((entry) => entry.event.type === 'cardPlayed' || entry.event.type === 'cutResolved').length).toBe(
      atBot.state.log.filter((entry) => entry.event.type === 'cardPlayed' || entry.event.type === 'cutResolved').length + 1,
    );
  });
});

describe('timeouts and away', () => {
  it('should let the bot act for the human when their deadline passes', () => {
    // Arrange
    const driven = soloAtHumanTurn();
    const deadline = driven.state.turnDeadline!;

    // Act
    const ticked = tick(driven.state, deadline);

    // Assert
    expect(ticked.seq).toBeGreaterThan(driven.state.seq);
  });

  it('should count one miss when the human times out once', () => {
    // Arrange
    const driven = soloAtHumanTurn();

    // Act
    const ticked = tick(driven.state, driven.state.turnDeadline!);

    // Assert
    expect({ missed: humanAt(ticked, HUMAN).missed, away: humanAt(ticked, HUMAN).away }).toEqual({
      missed: 1,
      away: false,
    });
  });

  it('should mark the human away after AWAY_AFTER_MISSES timeouts in a row', () => {
    // Arrange
    const misses = AWAY_AFTER_MISSES;

    // Act
    const driven = soloAfterMisses(misses);

    // Assert
    expect({ missed: humanAt(driven.state, HUMAN).missed, away: humanAt(driven.state, HUMAN).away }).toEqual({
      missed: 2,
      away: true,
    });
  });

  it('should count the miss only for the human who timed out when four humans are seated', () => {
    // Arrange
    const started = fullHumanTable();

    // Act
    const driven = advance(started);

    // Assert
    expect(driven.state.seats.map((slot) => (slot && slot.kind === 'human' ? slot.missed : -1))).toEqual(
      [0, 1, 2, 3].map((seat) => (seat === turnOf(started) ? 1 : 0)),
    );
  });

  it('should pace the away human turn like a bot instead of starting a deadline', () => {
    // Arrange
    const away = soloAfterMisses(AWAY_AFTER_MISSES);

    // Act
    const atTurn = driveToTurn(away.state, HUMAN, away.now);

    // Assert
    expect({ turnDeadline: atTurn.state.turnDeadline, nextActionAt: atTurn.state.nextActionAt }).toEqual({
      turnDeadline: null,
      nextActionAt: atTurn.now + BOT_PACE_MS,
    });
  });

  it('should keep playing for the away human without counting more misses', () => {
    // Arrange
    const away = soloAfterMisses(AWAY_AFTER_MISSES);
    const atTurn = driveToTurn(away.state, HUMAN, away.now);

    // Act
    const played = advance(atTurn.state);

    // Assert
    expect({
      acted: played.state.seq > atTurn.state.seq,
      missed: humanAt(played.state, HUMAN).missed,
      away: humanAt(played.state, HUMAN).away,
    }).toEqual({ acted: true, missed: AWAY_AFTER_MISSES, away: true });
  });

  it('should clear away and missed when the human sends BACK', () => {
    // Arrange
    const away = soloAfterMisses(AWAY_AFTER_MISSES);

    // Act
    const result = intent(away.state, presence(1), OpCode.BACK, undefined, away.now + 100);

    // Assert
    expect(result.ok && { missed: humanAt(result.state, HUMAN).missed, away: humanAt(result.state, HUMAN).away }).toEqual({
      missed: 0,
      away: false,
    });
  });

  it('should restore the human timer when an away human sends BACK on their own turn', () => {
    // Arrange
    const away = soloAfterMisses(AWAY_AFTER_MISSES);
    const atTurn = driveToTurn(away.state, HUMAN, away.now);
    const backAt = atTurn.now + 200;

    // Act
    const result = intent(atTurn.state, presence(1), OpCode.BACK, undefined, backAt);

    // Assert
    expect(result.ok && { turnDeadline: result.state.turnDeadline, nextActionAt: result.state.nextActionAt }).toEqual({
      turnDeadline: backAt + (gameOf(atTurn.state).phase === 'cutting' ? CUT_MS : PLAY_MS),
      nextActionAt: null,
    });
  });

  it('should clear a single miss when the human sends BACK', () => {
    // Arrange
    const once = soloAfterMisses(1);

    // Act
    const result = intent(once.state, presence(1), OpCode.BACK, undefined, once.now + 100);

    // Assert
    expect(result.ok && humanAt(result.state, HUMAN).missed).toBe(0);
  });

  it('should return the same state when BACK has nothing to clear', () => {
    // Arrange
    const driven = soloAtHumanTurn();

    // Act
    const result = intent(driven.state, presence(1), OpCode.BACK, undefined, driven.now + 100);

    // Assert
    expect(result.ok && result.state).toBe(driven.state);
  });

  it('should not extend the running deadline when the human sends BACK on their turn', () => {
    // Arrange
    const once = soloAfterMisses(1);
    const atTurn = driveToTurn(once.state, HUMAN, once.now);
    const deadline = atTurn.state.turnDeadline;

    // Act
    const result = intent(atTurn.state, presence(1), OpCode.BACK, undefined, atTurn.now + 5000);

    // Assert
    expect(result.ok && result.state.turnDeadline).toBe(deadline);
  });

  it('should clear away and missed when the away human plays a real card on their turn', () => {
    // Arrange
    const away = soloAfterMisses(AWAY_AFTER_MISSES);
    const atTurn = driveToTurn(away.state, HUMAN, away.now, 'playing');

    // Act
    const result = intent(atTurn.state, presence(1), OpCode.PLAY, firstLegalPlay(atTurn.state), atTurn.now + 200);

    // Assert
    expect(result.ok && { missed: humanAt(result.state, HUMAN).missed, away: humanAt(result.state, HUMAN).away }).toEqual({
      missed: 0,
      away: false,
    });
  });

  it('should reset the miss streak when the human plays after one timeout', () => {
    // Arrange
    const once = soloAfterMisses(1);
    const atTurn = driveToTurn(once.state, HUMAN, once.now, 'playing');

    // Act
    const played = actAsHuman(atTurn.state, atTurn.now + 200);

    // Assert
    expect(humanAt(played, HUMAN).missed).toBe(0);
  });
});

describe('between rounds', () => {
  function toRoundEnd(): Driven {
    const started = soloAfterMisses(AWAY_AFTER_MISSES);
    return driveUntil(started.state, (state) => state.phase === 'between', started.now);
  }

  it('should schedule the next round NEXT_ROUND_MS after the round ends', () => {
    // Arrange
    const ended = toRoundEnd();

    // Act
    const wake = nextWakeAt(ended.state);

    // Assert
    expect(wake).toBe(ended.now + NEXT_ROUND_MS);
  });

  it('should return the same state when ticked before the next round is due', () => {
    // Arrange
    const ended = toRoundEnd();

    // Act
    const ticked = tick(ended.state, ended.now + NEXT_ROUND_MS - 1);

    // Assert
    expect(ticked).toBe(ended.state);
  });

  it('should start the next round when NEXT_ROUND_MS has elapsed', () => {
    // Arrange
    const ended = toRoundEnd();

    // Act
    const ticked = tick(ended.state, ended.now + NEXT_ROUND_MS);

    // Assert
    expect({ phase: ticked.phase, round: gameOf(ticked).round }).toEqual({
      phase: 'playing',
      round: gameOf(ended.state).round + 1,
    });
  });
});

describe('finished', () => {
  it('should schedule nothing and ignore ticks once the game is over', () => {
    // Arrange
    const started = soloAfterMisses(AWAY_AFTER_MISSES);
    const over = driveUntil(started.state, (state) => state.phase === 'finished', started.now);

    // Act
    const ticked = tick(over.state, over.now + 60 * 60 * 1000);

    // Assert
    expect({ wake: nextWakeAt(over.state), same: ticked === over.state }).toEqual({ wake: null, same: true });
  });
});
