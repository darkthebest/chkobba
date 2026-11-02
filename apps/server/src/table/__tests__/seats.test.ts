import { describe, it, expect } from 'vitest';
import { AWAY_AFTER_MISSES, BOT_PACE_MS, CUT_MS, join, leave, snapshotFor, tick, type TableState } from '..';
import {
  T0,
  driveToTurn,
  fullHumanTable,
  humanAt,
  joiner,
  mustJoin,
  newTable,
  presence,
  soloAfterMisses,
  tableWithHumans,
  turnOf,
} from './helpers';

describe('join', () => {
  it('should seat the first human at seat 0 when the table is empty', () => {
    // Arrange
    const state = newTable();

    // Act
    const result = join(state, joiner(1), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: 0 });
  });

  it('should give each new human the lowest free seat when joining in turn', () => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const result = join(state, joiner(3), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: 2 });
  });

  it('should keep the table waiting when fewer than four humans are seated', () => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const joined = mustJoin(state, joiner(3), T0);

    // Assert
    expect(joined.phase).toBe('waiting');
  });

  it('should start the game immediately when the fourth human joins', () => {
    // Arrange
    const state = tableWithHumans(3);

    // Act
    const joined = mustJoin(state, joiner(4), T0 + 500);

    // Assert
    expect({ phase: joined.phase, hasGame: joined.game !== null, gamePhase: joined.game?.phase }).toEqual({
      phase: 'playing',
      hasGame: true,
      gamePhase: 'cutting',
    });
  });

  it('should seat only humans when four humans fill the table', () => {
    // Arrange
    const state = tableWithHumans(3);

    // Act
    const joined = mustJoin(state, joiner(4), T0);

    // Assert
    expect(joined.seats.map((slot) => slot?.kind)).toEqual(['human', 'human', 'human', 'human']);
  });

  it('should start the cut timer for the human cutter when four humans start the game', () => {
    // Arrange
    const state = tableWithHumans(3);

    // Act
    const joined = mustJoin(state, joiner(4), T0 + 500);

    // Assert
    expect(joined.turnDeadline).toBe(T0 + 500 + CUT_MS);
  });

  it('should reject a new user with table_full when the game has started', () => {
    // Arrange
    const state = fullHumanTable();

    // Act
    const result = join(state, joiner(5), T0 + 1000);

    // Assert
    expect(result).toEqual({ ok: false, error: 'table_full' });
  });

  it('should truncate and trim the display name when seating a human', () => {
    // Arrange
    const state = newTable();

    // Act
    const result = join(state, { userId: 'u1', sessionId: 's1', name: `  ${'x'.repeat(40)}  ` }, T0);

    // Assert
    expect(result.ok && humanAt(result.state, 0).name).toBe('x'.repeat(24));
  });

  it('should fall back to a default name when the display name is blank', () => {
    // Arrange
    const state = newTable();

    // Act
    const result = join(state, { userId: 'u1', sessionId: 's1', name: '   ' }, T0);

    // Assert
    expect(result.ok && humanAt(result.state, 0).name).toBe('Player');
  });
});

describe('leave while waiting', () => {
  it('should free the seat when a human leaves before the game starts', () => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const left = leave(state, presence(1), T0 + 1000);

    // Assert
    expect(left.seats[0]).toBeNull();
  });

  it('should give the freed seat to the next human when a seat was freed while waiting', () => {
    // Arrange
    const state = leave(tableWithHumans(2), presence(1), T0 + 1000);

    // Act
    const result = join(state, joiner(3), T0 + 2000);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: 0 });
  });

  it('should ignore a leave from a user who holds no seat', () => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const left = leave(state, presence(9), T0 + 1000);

    // Assert
    expect(left).toBe(state);
  });
});

describe('disconnect after the game started', () => {
  it('should keep the seat reserved for the user when they leave mid-game', () => {
    // Arrange
    const state = fullHumanTable();

    // Act
    const left = leave(state, presence(2), T0 + 1000);

    // Assert
    expect(left.seats[1]).toMatchObject({ kind: 'human', userId: 'u2', sessionId: null });
  });

  it('should hand the turn to a paced bot when the player to move disconnects', () => {
    // Arrange
    const state = fullHumanTable();
    const seat = turnOf(state);
    const leftAt = T0 + 3000;

    // Act
    const left = leave(state, presence(seat + 1), leftAt);

    // Assert
    expect({ turnDeadline: left.turnDeadline, nextActionAt: left.nextActionAt }).toEqual({
      turnDeadline: null,
      nextActionAt: leftAt + BOT_PACE_MS,
    });
  });

  it('should let the bot act for the disconnected seat when its paced action is due', () => {
    // Arrange
    const state = fullHumanTable();
    const seat = turnOf(state);
    const left = leave(state, presence(seat + 1), T0 + 3000);

    // Act
    const ticked = tick(left, T0 + 3000 + BOT_PACE_MS);

    // Assert
    expect(ticked.seq).toBeGreaterThan(left.seq);
  });

  it('should not count a miss for a disconnected seat when the bot plays for it', () => {
    // Arrange
    const state = fullHumanTable();
    const seat = turnOf(state);
    const left = leave(state, presence(seat + 1), T0 + 3000);

    // Act
    const ticked = tick(left, T0 + 3000 + BOT_PACE_MS);

    // Assert
    expect(humanAt(ticked, seat).missed).toBe(0);
  });

  it('should keep the bot playing a disconnected seat on every later turn', () => {
    // Arrange
    const state = fullHumanTable();
    const seat = (turnOf(state) + 1) % 4;
    const left = leave(state, presence(seat + 1), T0 + 1000);

    // Act
    const atTurn = driveToTurn(left, seat, T0 + 1000);

    // Assert
    expect({ turnDeadline: atTurn.state.turnDeadline, nextActionAt: atTurn.state.nextActionAt }).toEqual({
      turnDeadline: null,
      nextActionAt: atTurn.now + BOT_PACE_MS,
    });
  });

  it('should ignore a leave from a stale session when the user already rejoined on a new session', () => {
    // Arrange
    const state = mustJoin(fullHumanTable(), joiner(2, 's2-new'), T0 + 1000);

    // Act
    const left = leave(state, presence(2, 's2'), T0 + 2000);

    // Assert
    expect(left).toBe(state);
  });

  it('should keep the rejoined session connected when a stale session leaves', () => {
    // Arrange
    const state = mustJoin(fullHumanTable(), joiner(2, 's2-new'), T0 + 1000);

    // Act
    const left = leave(state, presence(2, 's2'), T0 + 2000);

    // Assert
    expect(humanAt(left, 1).sessionId).toBe('s2-new');
  });

  it('should ignore a stale-session leave while the table is still waiting', () => {
    // Arrange
    const state = mustJoin(tableWithHumans(2), joiner(1, 's1-new'), T0 + 1000);

    // Act
    const left = leave(state, presence(1, 's1'), T0 + 2000);

    // Assert
    expect(left.seats[0]).toMatchObject({ userId: 'u1', sessionId: 's1-new' });
  });
});

describe('reconnect', () => {
  function disconnected(seatUser: number): TableState {
    return leave(fullHumanTable(), presence(seatUser), T0 + 1000);
  }

  it('should give the same seat back when the same user rejoins with a new session', () => {
    // Arrange
    const state = disconnected(3);

    // Act
    const result = join(state, joiner(3, 's3-new'), T0 + 2000);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: 2 });
  });

  it('should store the new session on the reclaimed seat when the user rejoins', () => {
    // Arrange
    const state = disconnected(3);

    // Act
    const result = join(state, joiner(3, 's3-new'), T0 + 2000);

    // Assert
    expect(result.ok && result.state.seats[2]).toMatchObject({ kind: 'human', userId: 'u3', sessionId: 's3-new' });
  });

  it('should keep the away status and miss streak when an away user rejoins', () => {
    // Arrange
    const away = soloAfterMisses(AWAY_AFTER_MISSES);
    const left = leave(away.state, presence(1), away.now + 100);

    // Act
    const result = join(left, joiner(1, 's1-new'), away.now + 200);

    // Assert
    expect(result.ok && { missed: humanAt(result.state, 0).missed, away: humanAt(result.state, 0).away }).toEqual({
      missed: AWAY_AFTER_MISSES,
      away: true,
    });
  });

  it('should let a reserved user reclaim the seat even though the game started', () => {
    // Arrange
    const state = disconnected(1);

    // Act
    const result = join(state, joiner(1, 's1-new'), T0 + 2000);

    // Assert
    expect(result.ok).toBe(true);
  });

  it('should start a fresh human timer when the player to move reconnects during the bot pacing', () => {
    // Arrange
    const started = fullHumanTable();
    const seat = turnOf(started);
    const left = leave(started, presence(seat + 1), T0 + 1000);
    const rejoinAt = T0 + 1500;

    // Act
    const result = join(left, joiner(seat + 1, 'fresh'), rejoinAt);

    // Assert
    expect(result.ok && { turnDeadline: result.state.turnDeadline, nextActionAt: result.state.nextActionAt }).toEqual({
      turnDeadline: rejoinAt + CUT_MS,
      nextActionAt: null,
    });
  });

  it('should not extend the running deadline when a connected player joins again from a second device', () => {
    // Arrange
    const started = fullHumanTable();
    const seat = turnOf(started);
    const deadline = started.turnDeadline;

    // Act
    const result = join(started, joiner(seat + 1, 'second-device'), T0 + 5000);

    // Assert
    expect(result.ok && result.state.turnDeadline).toBe(deadline);
  });

  it('should refresh the seat name when the user reclaims the seat with a new name', () => {
    // Arrange
    const state = disconnected(3);

    // Act
    const result = join(state, { ...joiner(3, 's3-new'), name: '  Renamed  ' }, T0 + 2000);

    // Assert
    expect(result.ok && humanAt(result.state, 2).name).toBe('Renamed');
  });

  it('should project the refreshed name to every seat when the user reclaims the seat with a new name', () => {
    // Arrange
    const state = disconnected(3);

    // Act
    const result = join(state, { ...joiner(3, 's3-new'), name: 'Renamed' }, T0 + 2000);

    // Assert
    expect(result.ok && [0, 1, 2, 3].map((seat) => snapshotFor(result.state, seat, 0, T0 + 2000).players[2]?.name)).toEqual([
      'Renamed',
      'Renamed',
      'Renamed',
      'Renamed',
    ]);
  });

  it('should fall back to the default name when the user reclaims the seat with a blank name', () => {
    // Arrange
    const state = disconnected(3);

    // Act
    const result = join(state, { ...joiner(3, 's3-new'), name: '   ' }, T0 + 2000);

    // Assert
    expect(result.ok && humanAt(result.state, 2).name).toBe('Player');
  });

  it('should truncate the name when the user reclaims the seat with an overlong name', () => {
    // Arrange
    const state = disconnected(3);

    // Act
    const result = join(state, { ...joiner(3, 's3-new'), name: 'y'.repeat(40) }, T0 + 2000);

    // Assert
    expect(result.ok && humanAt(result.state, 2).name).toBe('y'.repeat(24));
  });
});
