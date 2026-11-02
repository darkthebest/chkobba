import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableLabel } from '@chkobba/protocol';
import {
  MATCH_LIST_LIMIT,
  OPEN_TABLES_QUERY,
  RECENT_TABLE_COLLECTION,
  RECENT_TABLE_KEY,
  RECENT_TABLE_WINDOW_MS,
  pickFullestOpenTable,
  rpcQuickMatch,
} from '../quickMatch';
import { TABLE_MATCH_NAME, matchInit } from '../../match/tableMatch';
import { createContext, createFakeLogger, createFakeNk, listedMatch } from '../../__tests__/fakes';

function labelText(seatsFree: number, open: boolean = seatsFree > 0): string {
  const label: TableLabel = { open, mode: '2v2', seatsFree, private: false };
  return JSON.stringify(label);
}

describe('rpcQuickMatch', () => {
  let logger: ReturnType<typeof createFakeLogger>;
  let nk: ReturnType<typeof createFakeNk>;

  beforeEach(() => {
    logger = createFakeLogger();
    nk = createFakeNk();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reject with UNAUTHENTICATED when the context has no user', () => {
    // Arrange
    const ctx = createContext();

    // Act
    const call = () => rpcQuickMatch(ctx, logger, nk, '{}');

    // Assert
    expect(call).toThrow(expect.objectContaining({ code: 16 }));
  });

  it('should neither list nor create a match when the context has no user', () => {
    // Arrange
    const ctx = createContext();

    // Act
    try {
      rpcQuickMatch(ctx, logger, nk, '{}');
    } catch (_error) {
      // expected
    }

    // Assert
    expect(nk.matchList.mock.calls.length + nk.matchCreate.mock.calls.length).toBe(0);
  });

  it('should list authoritative open public 2v2 tables', () => {
    // Arrange
    const ctx = createContext('u1');

    // Act
    rpcQuickMatch(ctx, logger, nk, '');

    // Assert
    expect(nk.matchList).toHaveBeenCalledWith(MATCH_LIST_LIMIT, true, null, null, null, OPEN_TABLES_QUERY);
  });

  it('should query open, 2v2 and non-private labels', () => {
    // Arrange
    const expected = '+label.open:T +label.mode:2v2 +label.private:F';

    // Act
    const query = OPEN_TABLES_QUERY;

    // Assert
    expect(query).toBe(expected);
  });

  it('should return the open match with the fewest free seats', () => {
    // Arrange
    nk.matchList.mockReturnValue([
      listedMatch('m3', labelText(3)),
      listedMatch('m1', labelText(1)),
      listedMatch('m2', labelText(2)),
    ]);

    // Act
    const response = rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect(JSON.parse(response)).toEqual({ matchId: 'm1' });
  });

  it('should not create a match when an open one exists', () => {
    // Arrange
    nk.matchList.mockReturnValue([listedMatch('m2', labelText(2))]);

    // Act
    rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect(nk.matchCreate).not.toHaveBeenCalled();
  });

  it('should create a table match and return its id when none is listed', () => {
    // Arrange
    nk.matchCreate.mockReturnValue('fresh-match');

    // Act
    const response = rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect({ response: JSON.parse(response) as unknown, create: nk.matchCreate.mock.calls }).toEqual({
      response: { matchId: 'fresh-match' },
      create: [[TABLE_MATCH_NAME, {}]],
    });
  });

  it('should filter private tables out of the match list query', () => {
    // Arrange
    const ctx = createContext('u1');

    // Act
    rpcQuickMatch(ctx, logger, nk, '');

    // Assert
    expect(nk.matchList).toHaveBeenCalledWith(MATCH_LIST_LIMIT, true, null, null, null, expect.stringContaining('+label.private:F'));
  });

  it('should never return a private table even when the index lists one', () => {
    // Arrange
    const privateLabel = matchInit(createContext(), logger, nk, { private: 'true', code: 'K7M2QX' }).label;
    nk.matchList.mockReturnValue([listedMatch('private-table', privateLabel)]);
    nk.matchCreate.mockReturnValue('fresh-match');

    // Act
    const response = rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect(JSON.parse(response)).toEqual({ matchId: 'fresh-match' });
  });

  it('should not reuse a recent table that is private', () => {
    // Arrange
    const privateLabel = matchInit(createContext(), logger, nk, { private: 'true', code: 'K7M2QX' }).label;
    nk.storageRead.mockReturnValue([
      { collection: RECENT_TABLE_COLLECTION, key: RECENT_TABLE_KEY, userId: '', version: 'v1', value: { matchId: 'private-table', createdAt: 1_000_000 }, permissionRead: 0, permissionWrite: 0, createTime: 0, updateTime: 0 },
    ]);
    nk.matchGet.mockReturnValue(listedMatch('private-table', privateLabel));
    nk.matchCreate.mockReturnValue('fresh-match');

    // Act
    const response = rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect(JSON.parse(response)).toEqual({ matchId: 'fresh-match' });
  });

  it('should create a table match when every listed match is full or malformed', () => {
    // Arrange
    nk.matchList.mockReturnValue([
      listedMatch('full', labelText(0)),
      listedMatch('bad-json', '{not json'),
      listedMatch('missing-fields', JSON.stringify({ mode: '2v2' })),
    ]);
    nk.matchCreate.mockReturnValue('fresh-match');

    // Act
    const response = rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect(JSON.parse(response)).toEqual({ matchId: 'fresh-match' });
  });
});

describe('rpcQuickMatch recent table (match index lag)', () => {
  const NOW = 1_000_000;
  let logger: ReturnType<typeof createFakeLogger>;
  let nk: ReturnType<typeof createFakeNk>;

  function recentObject(matchId: string, createdAt: number, version = 'v1'): nkruntime.StorageObject {
    return { collection: RECENT_TABLE_COLLECTION, key: RECENT_TABLE_KEY, userId: '', version, value: { matchId, createdAt }, permissionRead: 0, permissionWrite: 0, createTime: 0, updateTime: 0 };
  }

  beforeEach(() => {
    logger = createFakeLogger();
    nk = createFakeNk();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reuse a fresh, open recent table that is not listed yet', () => {
    // Arrange
    nk.storageRead.mockReturnValue([recentObject('recent', NOW - 1000)]);
    nk.matchGet.mockReturnValue(listedMatch('recent', labelText(3)));

    // Act
    const response = rpcQuickMatch(createContext('u2'), logger, nk, '');

    // Assert
    expect({ response: JSON.parse(response) as unknown, created: nk.matchCreate.mock.calls.length }).toEqual({
      response: { matchId: 'recent' },
      created: 0,
    });
  });

  it.each([
    { scenario: 'it is older than the window', createdAt: NOW - RECENT_TABLE_WINDOW_MS, match: listedMatch('recent', labelText(3)) },
    { scenario: 'it is full', createdAt: NOW - 1000, match: listedMatch('recent', labelText(0)) },
    { scenario: 'it has ended', createdAt: NOW - 1000, match: null },
  ])('should create a table when the recent one is unusable because $scenario', ({ createdAt, match }) => {
    // Arrange
    nk.storageRead.mockReturnValue([recentObject('recent', createdAt, 'v7')]);
    nk.matchGet.mockReturnValue(match);
    nk.matchCreate.mockReturnValue('fresh-match');

    // Act
    const response = rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect({ response: JSON.parse(response) as unknown, version: nk.storageWrite.mock.calls[0]?.[0][0]?.version }).toEqual({
      response: { matchId: 'fresh-match' },
      version: 'v7',
    });
  });

  it('should record a created table only if no record exists yet', () => {
    // Arrange
    nk.matchCreate.mockReturnValue('fresh-match');

    // Act
    rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect(nk.storageWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        collection: RECENT_TABLE_COLLECTION,
        key: RECENT_TABLE_KEY,
        value: { matchId: 'fresh-match', createdAt: NOW },
        version: '*',
        permissionRead: 0,
        permissionWrite: 0,
      }),
    ]);
  });

  it("should join the racing winner's table when its own record write loses", () => {
    // Arrange
    nk.storageRead.mockReturnValueOnce([]).mockReturnValueOnce([recentObject('winner', NOW)]);
    nk.storageWrite.mockImplementation(() => {
      throw new Error('version check failed');
    });
    nk.matchGet.mockReturnValue(listedMatch('winner', labelText(3)));
    nk.matchCreate.mockReturnValue('loser');

    // Act
    const response = rpcQuickMatch(createContext('u2'), logger, nk, '');

    // Assert
    expect(JSON.parse(response)).toEqual({ matchId: 'winner' });
  });

  it('should keep its own table when the record write fails and no other table is usable', () => {
    // Arrange
    nk.storageWrite.mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    nk.matchCreate.mockReturnValue('own');

    // Act
    const response = rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect(JSON.parse(response)).toEqual({ matchId: 'own' });
  });

  it('should ignore a malformed record', () => {
    // Arrange
    nk.storageRead.mockReturnValue([{ ...recentObject('x', NOW), value: { matchId: 42 } }]);
    nk.matchCreate.mockReturnValue('fresh-match');

    // Act
    const response = rpcQuickMatch(createContext('u1'), logger, nk, '');

    // Assert
    expect({ response: JSON.parse(response) as unknown, matchGet: nk.matchGet.mock.calls.length }).toEqual({
      response: { matchId: 'fresh-match' },
      matchGet: 0,
    });
  });
});

describe('pickFullestOpenTable', () => {
  it('should return null when no match is listed', () => {
    // Arrange
    const matches: nkruntime.Match[] = [];

    // Act
    const picked = pickFullestOpenTable(matches);

    // Assert
    expect(picked).toBeNull();
  });

  it.each([
    { scenario: 'it has no free seat', label: labelText(0, true) },
    { scenario: 'it is closed', label: labelText(2, false) },
    { scenario: 'its label is not JSON', label: '{not json' },
    { scenario: 'its label is JSON null', label: 'null' },
    { scenario: 'its label lacks seatsFree', label: JSON.stringify({ open: true, mode: '2v2' }) },
    { scenario: 'its seatsFree is a string', label: JSON.stringify({ open: true, seatsFree: '2' }) },
    { scenario: 'its open flag is a string', label: JSON.stringify({ open: 'T', seatsFree: 2 }) },
  ])('should ignore a match when $scenario', ({ label }) => {
    // Arrange
    const matches = [listedMatch('ignored', label), listedMatch('good', labelText(3))];

    // Act
    const picked = pickFullestOpenTable(matches);

    // Assert
    expect(picked).toBe('good');
  });

  it('should keep the first of equally full matches', () => {
    // Arrange
    const matches = [listedMatch('first', labelText(2)), listedMatch('second', labelText(2))];

    // Act
    const picked = pickFullestOpenTable(matches);

    // Assert
    expect(picked).toBe('first');
  });
});
