/**
 * Game roster (who sat in the current game) for the recent-players records.
 * Tables are built with the real pure table core, so game keys and takeovers
 * come from the same code the match adapter runs.
 */
import { describe, expect, it } from 'vitest';
import { OpCode } from '@chkobba/protocol';
import { intent, type TableState } from '../../table';
import { SEED, T0, joiner, mustJoin, presence, privateTable, soloHumanTable, tableWithHumans } from '../../table/__tests__/helpers';
import {
  EMPTY_GAME_ROSTER,
  gameKeyOf,
  markRecentWritten,
  markStatsWritten,
  needsRecentWrite,
  needsStatsWrite,
  trackRoster,
  unwrittenMembers,
  type GameRoster,
} from '../gameRoster';

function mustIntent(state: TableState, who: number, opcode: number, payload: unknown, now: number = T0): TableState {
  const result = intent(state, presence(who), opcode, payload, now);
  if (!result.ok) throw new Error(`intent ${opcode} from u${who} rejected: ${result.error}`);
  return result.state;
}

/** Private table with u1 (host) .. u<members>; u1 sends START. */
function startedRoom(members: number): TableState {
  return mustIntent(privateTable(members), 1, OpCode.START, {});
}

function entry(n: number) {
  return { userId: `u${n}`, name: `Player ${n}` };
}

function rosterOf(
  entries: number[],
  gameKey: string | null = SEED,
  written: string[] = [],
  statsWritten: string[] = [],
): GameRoster {
  return { gameKey, roster: entries.map(entry), recentWritten: written, statsWritten };
}

describe('gameKeyOf', () => {
  it('should be null while no game exists', () => {
    // Arrange
    const waiting = tableWithHumans(2);

    // Act
    const key = gameKeyOf(waiting);

    // Assert
    expect(key).toBeNull();
  });

  it('should be the table seed for a public game', () => {
    // Arrange
    const playing = tableWithHumans(4);

    // Act
    const key = gameKeyOf(playing);

    // Assert
    expect(key).toBe(SEED);
  });

  it('should be the seed and the game number for a private game', () => {
    // Arrange
    const playing = startedRoom(2);

    // Act
    const key = gameKeyOf(playing);

    // Assert
    expect(key).toBe(`${SEED}:1`);
  });

  it('should be null for a private room before START', () => {
    // Arrange
    const room = privateTable(4);

    // Act
    const key = gameKeyOf(room);

    // Assert
    expect(key).toBeNull();
  });
});

describe('trackRoster', () => {
  it('should start a roster of the seated humans in seat order when the first game starts', () => {
    // Arrange
    const playing = tableWithHumans(4);

    // Act
    const next = trackRoster(EMPTY_GAME_ROSTER, playing);

    // Assert
    expect(next).toEqual(rosterOf([1, 2, 3, 4]));
  });

  it('should leave bots out of the roster', () => {
    // Arrange
    const { state } = soloHumanTable();

    // Act
    const next = trackRoster(EMPTY_GAME_ROSTER, state);

    // Assert
    expect(next.roster).toEqual([entry(1)]);
  });

  it('should reset the roster and recentWritten when the game key changes', () => {
    // Arrange
    const previous = rosterOf([7, 8], `${SEED}:1`, ['u7', 'u8']);
    const playing = tableWithHumans(4);

    // Act
    const next = trackRoster(previous, playing);

    // Assert
    expect(next).toEqual(rosterOf([1, 2, 3, 4]));
  });

  it('should keep the last roster as is while no game exists', () => {
    // Arrange
    const previous = rosterOf([1, 2], SEED, ['u2']);
    const waiting = privateTable(4);

    // Act
    const next = trackRoster(previous, waiting);

    // Assert
    expect(next).toBe(previous);
  });

  it('should return the same roster when nobody new sat in the same game', () => {
    // Arrange
    const playing = tableWithHumans(4);
    const current = trackRoster(EMPTY_GAME_ROSTER, playing);

    // Act
    const next = trackRoster(current, playing);

    // Assert
    expect(next).toBe(current);
  });

  it('should append a standing member who takes over a bot seat, keeping recentWritten', () => {
    // Arrange
    const started = mustJoin(startedRoom(2), joiner(5));
    const current: GameRoster = { ...trackRoster(EMPTY_GAME_ROSTER, started), recentWritten: ['u2'] };
    const taken = mustIntent(started, 5, OpCode.SIT, { seat: 2 });

    // Act
    const next = trackRoster(current, taken);

    // Assert
    expect(next).toEqual({ gameKey: `${SEED}:1`, roster: [entry(1), entry(2), entry(5)], recentWritten: ['u2'], statsWritten: [] });
  });

  it('should start an empty stats ledger when the first game starts', () => {
    // Arrange
    const playing = tableWithHumans(4);

    // Act
    const next = trackRoster(EMPTY_GAME_ROSTER, playing);

    // Assert
    expect(next.statsWritten).toEqual([]);
  });

  it('should reset the stats ledger when the game key changes', () => {
    // Arrange
    const previous = rosterOf([7, 8], `${SEED}:1`, ['u7', 'u8'], ['u7']);
    const playing = tableWithHumans(4);

    // Act
    const next = trackRoster(previous, playing);

    // Assert
    expect(next.statsWritten).toEqual([]);
  });

  it('should keep the stats ledger when a standing member takes over a bot seat', () => {
    // Arrange
    const started = mustJoin(startedRoom(2), joiner(5));
    const current: GameRoster = { ...trackRoster(EMPTY_GAME_ROSTER, started), statsWritten: ['u2'] };
    const taken = mustIntent(started, 5, OpCode.SIT, { seat: 2 });

    // Act
    const next = trackRoster(current, taken);

    // Assert
    expect(next.statsWritten).toEqual(['u2']);
  });

  it('should not drop a roster member whose seat is now a bot', () => {
    // Arrange
    const current = rosterOf([1, 2, 3, 4, 9]);
    const playing = tableWithHumans(4);

    // Act
    const next = trackRoster(current, playing);

    // Assert
    expect(next).toBe(current);
  });
});

describe('unwrittenMembers', () => {
  it('should list the roster members not yet written, in roster order', () => {
    // Arrange
    const current = rosterOf([1, 2, 3, 4], SEED, ['u2', 'u4']);

    // Act
    const pending = unwrittenMembers(current);

    // Assert
    expect(pending).toEqual([entry(1), entry(3)]);
  });

  it('should be empty when everyone was written', () => {
    // Arrange
    const current = rosterOf([1, 2], SEED, ['u1', 'u2']);

    // Act
    const pending = unwrittenMembers(current);

    // Assert
    expect(pending).toEqual([]);
  });
});

describe('needsRecentWrite', () => {
  it.each([
    { scenario: 'a roster member not yet written', userId: 'u1', expected: true },
    { scenario: 'a roster member already written', userId: 'u2', expected: false },
    { scenario: 'a user outside the roster', userId: 'u9', expected: false },
  ])('should be $expected for $scenario', ({ userId, expected }) => {
    // Arrange
    const current = rosterOf([1, 2, 3], SEED, ['u2']);

    // Act
    const needed = needsRecentWrite(current, userId);

    // Assert
    expect(needed).toBe(expected);
  });
});

describe('needsStatsWrite', () => {
  it.each([
    { scenario: 'a roster member not yet written', userId: 'u1', expected: true },
    { scenario: 'a roster member already written', userId: 'u2', expected: false },
    { scenario: 'a user outside the roster', userId: 'u9', expected: false },
  ])('should be $expected for $scenario', ({ userId, expected }) => {
    // Arrange
    const current = rosterOf([1, 2, 3], SEED, [], ['u2']);

    // Act
    const needed = needsStatsWrite(current, userId);

    // Assert
    expect(needed).toBe(expected);
  });
});

describe('markStatsWritten', () => {
  it('should append new user ids once each', () => {
    // Arrange
    const current = rosterOf([1, 2, 3], SEED, [], ['u1']);

    // Act
    const next = markStatsWritten(current, ['u2', 'u1', 'u3', 'u2']);

    // Assert
    expect(next.statsWritten).toEqual(['u1', 'u2', 'u3']);
  });

  it('should return the same roster when every id was already written', () => {
    // Arrange
    const current = rosterOf([1, 2], SEED, [], ['u1', 'u2']);

    // Act
    const next = markStatsWritten(current, ['u2', 'u1']);

    // Assert
    expect(next).toBe(current);
  });

  it('should not mutate the roster it is given', () => {
    // Arrange
    const current = rosterOf([1, 2], SEED, []);

    // Act
    markStatsWritten(current, ['u1']);

    // Assert
    expect(current.statsWritten).toEqual([]);
  });
});

describe('markRecentWritten', () => {
  it('should append new user ids once each', () => {
    // Arrange
    const current = rosterOf([1, 2, 3], SEED, ['u1']);

    // Act
    const next = markRecentWritten(current, ['u2', 'u1', 'u3', 'u2']);

    // Assert
    expect(next.recentWritten).toEqual(['u1', 'u2', 'u3']);
  });

  it('should return the same roster when every id was already written', () => {
    // Arrange
    const current = rosterOf([1, 2], SEED, ['u1', 'u2']);

    // Act
    const next = markRecentWritten(current, ['u2', 'u1']);

    // Assert
    expect(next).toBe(current);
  });

  it('should not mutate the roster it is given', () => {
    // Arrange
    const current = rosterOf([1, 2], SEED, []);

    // Act
    markRecentWritten(current, ['u1']);

    // Assert
    expect(current.recentWritten).toEqual([]);
  });
});
