/**
 * Pure competitive-stats reducer (ADR-0005): the untrusted-read parser, the
 * finish fold and the seat→team mapping. No storage and no clock here; the
 * match adapter supplies the finished game's result and the server time.
 */
import { describe, expect, it } from 'vitest';
import type { CompetitiveStats } from '@chkobba/protocol';
import { EMPTY_COMPETITIVE, applyResult, competitiveResultFor, readCompetitive, teamOf } from '../competitive';

const T0 = 1_700_000_000_000;

/** A fully valid stored record; every counter is a finite, non-negative integer. */
const VALID: CompetitiveStats = { games: 3, wins: 2, chkobbas: 5, currentStreak: 1, bestStreak: 2, updatedAt: T0 };

const COUNTERS = ['games', 'wins', 'chkobbas', 'currentStreak', 'bestStreak'] as const;

describe('readCompetitive', () => {
  it('should round-trip a valid record', () => {
    // Arrange
    const stored = VALID;

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(stored);
  });

  it.each([
    { scenario: 'null', value: null },
    { scenario: 'a string', value: 'stats' },
    { scenario: 'a number', value: 42 },
    { scenario: 'undefined', value: undefined },
  ])('should read $scenario as empty', ({ value }) => {
    // Arrange / Act
    const record = readCompetitive(value);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it.each(COUNTERS)('should read a record missing %s as empty', (field) => {
    // Arrange
    const missing: Record<string, unknown> = { ...VALID };
    delete missing[field];

    // Act
    const record = readCompetitive(missing);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it.each(COUNTERS)('should read a non-number %s as empty', (field) => {
    // Arrange
    const stored: Record<string, unknown> = { ...VALID, [field]: '3' };

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it.each(COUNTERS)('should read a NaN %s as empty', (field) => {
    // Arrange
    const stored: Record<string, unknown> = { ...VALID, [field]: NaN };

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it.each(COUNTERS)('should read an infinite %s as empty', (field) => {
    // Arrange
    const stored: Record<string, unknown> = { ...VALID, [field]: Infinity };

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it.each(COUNTERS)('should read a negative %s as empty', (field) => {
    // Arrange
    const stored: Record<string, unknown> = { ...VALID, [field]: -1 };

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it.each(COUNTERS)('should read a fractional %s as empty', (field) => {
    // Arrange
    const stored: Record<string, unknown> = { ...VALID, [field]: 1.5 };

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it.each([
    { scenario: 'a string', value: 'now' },
    { scenario: 'NaN', value: NaN },
    { scenario: 'Infinity', value: Infinity },
    { scenario: 'negative infinity', value: -Infinity },
  ])('should read a non-finite updatedAt ($scenario) as empty', ({ value }) => {
    // Arrange
    const stored: Record<string, unknown> = { ...VALID, updatedAt: value };

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it('should read a negative chkobbas as empty rather than a reduced total', () => {
    // Arrange
    const stored: Record<string, unknown> = { ...VALID, chkobbas: -2 };

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });

  it('should read a fractional chkobbas as empty rather than a reduced total', () => {
    // Arrange
    const stored: Record<string, unknown> = { ...VALID, chkobbas: 1.5 };

    // Act
    const record = readCompetitive(stored);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });
});

describe('applyResult', () => {
  it('should add a game and a win and grow the streak when the team won', () => {
    // Arrange
    const record = EMPTY_COMPETITIVE;

    // Act
    const next = applyResult(record, true, 2, T0);

    // Assert
    expect(next).toEqual({ games: 1, wins: 1, chkobbas: 2, currentStreak: 1, bestStreak: 1, updatedAt: T0 });
  });

  it('should add a game without a win and reset the streak while keeping bestStreak when the team lost', () => {
    // Arrange
    const record: CompetitiveStats = { games: 5, wins: 4, chkobbas: 3, currentStreak: 2, bestStreak: 2, updatedAt: T0 - 1000 };

    // Act
    const next = applyResult(record, false, 1, T0);

    // Assert
    expect(next).toEqual({ games: 6, wins: 4, chkobbas: 4, currentStreak: 0, bestStreak: 2, updatedAt: T0 });
  });

  it('should raise bestStreak when the current streak passes it', () => {
    // Arrange
    const record: CompetitiveStats = { games: 4, wins: 2, chkobbas: 0, currentStreak: 2, bestStreak: 2, updatedAt: T0 - 1000 };

    // Act
    const next = applyResult(record, true, 0, T0);

    // Assert
    expect({ currentStreak: next.currentStreak, bestStreak: next.bestStreak }).toEqual({ currentStreak: 3, bestStreak: 3 });
  });

  it('should keep bestStreak when the current streak is still below it', () => {
    // Arrange
    const record: CompetitiveStats = { games: 9, wins: 6, chkobbas: 0, currentStreak: 1, bestStreak: 5, updatedAt: T0 - 1000 };

    // Act
    const next = applyResult(record, true, 0, T0);

    // Assert
    expect({ currentStreak: next.currentStreak, bestStreak: next.bestStreak }).toEqual({ currentStreak: 2, bestStreak: 5 });
  });

  it('should accumulate the team chkobba sweeps', () => {
    // Arrange
    const record: CompetitiveStats = { games: 2, wins: 1, chkobbas: 4, currentStreak: 1, bestStreak: 1, updatedAt: T0 - 1000 };

    // Act
    const next = applyResult(record, true, 3, T0);

    // Assert
    expect(next.chkobbas).toBe(7);
  });

  it('should stamp updatedAt with the passed clock', () => {
    // Arrange
    const record = EMPTY_COMPETITIVE;

    // Act
    const next = applyResult(record, false, 0, T0);

    // Assert
    expect(next.updatedAt).toBe(T0);
  });

  it('should contribute zero rather than shrink the total for a negative chkobba count', () => {
    // Arrange
    const record: CompetitiveStats = { games: 2, wins: 1, chkobbas: 4, currentStreak: 0, bestStreak: 1, updatedAt: T0 - 1000 };

    // Act
    const next = applyResult(record, true, -3, T0);

    // Assert
    expect(next.chkobbas).toBe(4);
  });

  it.each([
    { scenario: 'fractional', value: 1.9, expected: 5 },
    { scenario: 'NaN', value: NaN, expected: 4 },
    { scenario: 'infinite', value: Infinity, expected: 4 },
  ])('should floor a $scenario chkobba count without reducing the total', ({ value, expected }) => {
    // Arrange
    const record: CompetitiveStats = { games: 2, wins: 1, chkobbas: 4, currentStreak: 0, bestStreak: 1, updatedAt: T0 - 1000 };

    // Act
    const next = applyResult(record, true, value, T0);

    // Assert
    expect(next.chkobbas).toBe(expected);
  });

  it('should not mutate the record it is given', () => {
    // Arrange
    const record = EMPTY_COMPETITIVE;

    // Act
    applyResult(record, true, 5, T0);

    // Assert
    expect(record).toEqual(EMPTY_COMPETITIVE);
  });
});

describe('teamOf', () => {
  it.each([
    { seat: 0, team: 0 },
    { seat: 1, team: 1 },
    { seat: 2, team: 0 },
    { seat: 3, team: 1 },
  ])('should map seat $seat to team $team', ({ seat, team }) => {
    // Arrange / Act
    const mapped = teamOf(seat);

    // Assert
    expect(mapped).toBe(team);
  });
});

describe('competitiveResultFor', () => {
  /** The teams' sweep counts differ, so a result carrying the wrong team's count is visible. */
  const game = { winner: 1, chkobbas: [2, 5] } as const;

  it.each([
    { seat: 0, won: false, chkobbas: 2 },
    { seat: 1, won: true, chkobbas: 5 },
    { seat: 2, won: false, chkobbas: 2 },
    { seat: 3, won: true, chkobbas: 5 },
  ])("should give seat $seat its team's outcome and sweep count", ({ seat, won, chkobbas }) => {
    // Arrange
    const finished = game;

    // Act
    const result = competitiveResultFor(finished, seat);

    // Assert
    expect(result).toEqual({ won, chkobbas });
  });

  it('should be null while the game has no winner', () => {
    // Arrange
    const undecided = { winner: null, chkobbas: [1, 0] } as const;

    // Act
    const result = competitiveResultFor(undecided, 0);

    // Assert
    expect(result).toBeNull();
  });
});
