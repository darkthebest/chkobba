/**
 * Recent players, pure part: how the owner's `social/recent_players` record is
 * updated when a game ends for them, and how an untrusted stored value is read.
 */
import { describe, expect, it } from 'vitest';
import { RECENT_TABLES_MAX, type RecentPlayersRecord, type RecentTable } from '@chkobba/protocol';
import { parseRecentPlayers, recordRecentTable, type RosterEntry } from '../recentPlayers';

const T0 = 1_700_000_000_000;
const EMPTY: RecentPlayersRecord = { tables: [] };

const owner: RosterEntry = { userId: 'owner', name: 'Hamza' };
const sami: RosterEntry = { userId: 'u-sami', name: 'Sami' };
const ines: RosterEntry = { userId: 'u-ines', name: 'Ines' };
const amel: RosterEntry = { userId: 'u-amel', name: 'Amel' };

/** `count` tables, newest first, with endedAt T0 - 1, T0 - 2, ... */
function tablesOf(count: number): RecentTable[] {
  const tables: RecentTable[] = [];
  for (let i = 1; i <= count; i++) tables.push({ endedAt: T0 - i, players: [{ userId: `old-${i}`, name: `Old ${i}` }] });
  return tables;
}

describe('recordRecentTable', () => {
  it('should record the other humans of the table without the owner', () => {
    // Arrange
    const roster = [owner, sami, ines, amel];

    // Act
    const next = recordRecentTable(EMPTY, roster, owner.userId, T0);

    // Assert
    expect(next).toEqual({
      tables: [
        {
          endedAt: T0,
          players: [
            { userId: 'u-sami', name: 'Sami' },
            { userId: 'u-ines', name: 'Ines' },
            { userId: 'u-amel', name: 'Amel' },
          ],
        },
      ],
    });
  });

  it('should drop roster entries with an empty or non-string userId (bots)', () => {
    // Arrange
    const botLike = { userId: '', name: 'Bot 1' };
    const corrupt = { userId: 42, name: 'Bot 3' } as unknown as RosterEntry;
    const roster = [owner, botLike, sami, corrupt];

    // Act
    const next = recordRecentTable(EMPTY, roster, owner.userId, T0);

    // Assert
    expect(next.tables[0]?.players).toEqual([{ userId: 'u-sami', name: 'Sami' }]);
  });

  it('should keep the first entry of a userId listed twice', () => {
    // Arrange
    const renamed = { userId: 'u-sami', name: 'Sami 2' };
    const roster = [owner, sami, ines, renamed];

    // Act
    const next = recordRecentTable(EMPTY, roster, owner.userId, T0);

    // Assert
    expect(next.tables[0]?.players).toEqual([
      { userId: 'u-sami', name: 'Sami' },
      { userId: 'u-ines', name: 'Ines' },
    ]);
  });

  it('should put the new table first, before the existing ones', () => {
    // Arrange
    const record: RecentPlayersRecord = { tables: tablesOf(2) };

    // Act
    const next = recordRecentTable(record, [owner, sami], owner.userId, T0);

    // Assert
    expect(next.tables.map((t) => t.endedAt)).toEqual([T0, T0 - 1, T0 - 2]);
  });

  it(`should keep at most RECENT_TABLES_MAX (${RECENT_TABLES_MAX}) tables, dropping the oldest`, () => {
    // Arrange
    const record: RecentPlayersRecord = { tables: tablesOf(RECENT_TABLES_MAX) };

    // Act
    const next = recordRecentTable(record, [owner, sami], owner.userId, T0);

    // Assert
    expect({ count: next.tables.length, first: next.tables[0]?.endedAt, last: next.tables[next.tables.length - 1]?.endedAt }).toEqual({
      count: RECENT_TABLES_MAX,
      first: T0,
      last: T0 - (RECENT_TABLES_MAX - 1),
    });
  });

  it('should return the same record object when nobody else was at the table', () => {
    // Arrange
    const record: RecentPlayersRecord = { tables: tablesOf(1) };
    const roster = [owner, { userId: '', name: 'Bot 1' }, owner];

    // Act
    const next = recordRecentTable(record, roster, owner.userId, T0);

    // Assert
    expect(next).toBe(record);
  });

  it('should return the same record object for an empty roster', () => {
    // Arrange
    const record = EMPTY;

    // Act
    const next = recordRecentTable(record, [], owner.userId, T0);

    // Assert
    expect(next).toBe(record);
  });

  it('should not mutate the record it is given', () => {
    // Arrange
    const record: RecentPlayersRecord = { tables: tablesOf(1) };
    const before = JSON.stringify(record);

    // Act
    recordRecentTable(record, [owner, sami], owner.userId, T0);

    // Assert
    expect(JSON.stringify(record)).toBe(before);
  });
});

describe('parseRecentPlayers', () => {
  it.each([
    { scenario: 'null', value: null },
    { scenario: 'undefined', value: undefined },
    { scenario: 'a string', value: 'tables' },
    { scenario: 'a number', value: 7 },
    { scenario: 'an array', value: [] },
    { scenario: 'an object without tables', value: { other: [] } },
    { scenario: 'tables that is not an array', value: { tables: { 0: {} } } },
  ])('should read $scenario as an empty record', ({ value }) => {
    // Arrange
    const stored: unknown = value;

    // Act
    const record = parseRecentPlayers(stored);

    // Assert
    expect(record).toEqual(EMPTY);
  });

  it('should read a well-formed record unchanged', () => {
    // Arrange
    const stored = { tables: [{ endedAt: T0, players: [{ userId: 'u-sami', name: 'Sami' }] }] };

    // Act
    const record = parseRecentPlayers(stored);

    // Assert
    expect(record).toEqual(stored);
  });

  it('should drop malformed tables', () => {
    // Arrange
    const good = { endedAt: T0, players: [{ userId: 'u-sami', name: 'Sami' }] };
    const stored = {
      tables: [
        null,
        'table',
        { players: [{ userId: 'u-x', name: 'X' }] },
        { endedAt: T0 },
        { endedAt: '1700000000000', players: [{ userId: 'u-x', name: 'X' }] },
        { endedAt: Infinity, players: [{ userId: 'u-x', name: 'X' }] },
        { endedAt: NaN, players: [{ userId: 'u-x', name: 'X' }] },
        { endedAt: T0, players: 'u-x' },
        good,
      ],
    };

    // Act
    const record = parseRecentPlayers(stored);

    // Assert
    expect(record).toEqual({ tables: [good] });
  });

  it('should drop malformed players and keep the valid ones', () => {
    // Arrange
    const stored = {
      tables: [
        {
          endedAt: T0,
          players: [null, { userId: '', name: 'Empty' }, { userId: 5, name: 'Number' }, { userId: 'u-x' }, { userId: 'u-y', name: 3 }, { userId: 'u-sami', name: 'Sami' }],
        },
      ],
    };

    // Act
    const record = parseRecentPlayers(stored);

    // Assert
    expect(record).toEqual({ tables: [{ endedAt: T0, players: [{ userId: 'u-sami', name: 'Sami' }] }] });
  });

  it('should drop a table left with no valid players', () => {
    // Arrange
    const stored = { tables: [{ endedAt: T0, players: [{ userId: '', name: 'Bot' }] }, { endedAt: T0 - 1, players: [] }] };

    // Act
    const record = parseRecentPlayers(stored);

    // Assert
    expect(record).toEqual(EMPTY);
  });

  it(`should keep only the first RECENT_TABLES_MAX (${RECENT_TABLES_MAX}) tables`, () => {
    // Arrange
    const stored = { tables: tablesOf(RECENT_TABLES_MAX + 5) };

    // Act
    const record = parseRecentPlayers(stored);

    // Assert
    expect(record.tables.map((t) => t.endedAt)).toEqual(tablesOf(RECENT_TABLES_MAX).map((t) => t.endedAt));
  });

  it('should drop extra fields from tables and players', () => {
    // Arrange
    const stored = { tables: [{ endedAt: T0, code: 'K7M2QX', players: [{ userId: 'u-sami', name: 'Sami', sessionId: 's' }] }] };

    // Act
    const record = parseRecentPlayers(stored);

    // Assert
    expect(record).toEqual({ tables: [{ endedAt: T0, players: [{ userId: 'u-sami', name: 'Sami' }] }] });
  });
});
