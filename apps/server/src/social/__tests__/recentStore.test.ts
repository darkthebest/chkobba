/**
 * Recent players storage: the read-modify-write of `social/recent_players`
 * against the fake Nakama storage. Best effort: failures are logged, never thrown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RECENT_PLAYERS_KEY, RECENT_TABLES_MAX, SOCIAL_COLLECTION } from '@chkobba/protocol';
import { createFakeLogger, createFakeNk } from '../../__tests__/fakes';
import type { RosterEntry } from '../recentPlayers';
import { writeRecentTable } from '../recentStore';

const T0 = 1_700_000_000_000;
const OWNER = 'u1';
const ROSTER: RosterEntry[] = [
  { userId: 'u1', name: 'Hamza' },
  { userId: 'u2', name: 'Sami' },
  { userId: 'u3', name: 'Ines' },
];

describe('writeRecentTable', () => {
  let nk: ReturnType<typeof createFakeNk>;
  let logger: ReturnType<typeof createFakeLogger>;

  beforeEach(() => {
    nk = createFakeNk();
    logger = createFakeLogger();
    nk.fake.useMemoryStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function stored(userId: string = OWNER): nkruntime.StorageObject | undefined {
    return nk.fake.storedObject(SOCIAL_COLLECTION, RECENT_PLAYERS_KEY, userId);
  }

  it('should store the table under the owner with the other players', () => {
    // Arrange
    const roster = ROSTER;

    // Act
    writeRecentTable(nk, logger, OWNER, roster, T0);

    // Assert
    expect(stored()?.value).toEqual({
      tables: [
        {
          endedAt: T0,
          players: [
            { userId: 'u2', name: 'Sami' },
            { userId: 'u3', name: 'Ines' },
          ],
        },
      ],
    });
  });

  it('should write owner-readable, server-only permissions (read 1, write 0) on the owner record', () => {
    // Arrange
    const roster = ROSTER;

    // Act
    writeRecentTable(nk, logger, OWNER, roster, T0);

    // Assert
    expect(nk.storageWrite.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        collection: SOCIAL_COLLECTION,
        key: RECENT_PLAYERS_KEY,
        userId: OWNER,
        permissionRead: 1,
        permissionWrite: 0,
      }),
    ]);
  });

  it('should read the owner record before writing', () => {
    // Arrange
    const roster = ROSTER;

    // Act
    writeRecentTable(nk, logger, OWNER, roster, T0);

    // Assert
    expect(nk.storageRead).toHaveBeenCalledWith([{ collection: SOCIAL_COLLECTION, key: RECENT_PLAYERS_KEY, userId: OWNER }]);
  });

  it('should prepend the new table to the existing record', () => {
    // Arrange
    const older = { endedAt: T0 - 5000, players: [{ userId: 'u9', name: 'Amel' }] };
    nk.fake.seedStorage(SOCIAL_COLLECTION, RECENT_PLAYERS_KEY, OWNER, { tables: [older] });

    // Act
    writeRecentTable(nk, logger, OWNER, ROSTER, T0);

    // Assert
    expect(stored()?.value).toEqual({
      tables: [
        {
          endedAt: T0,
          players: [
            { userId: 'u2', name: 'Sami' },
            { userId: 'u3', name: 'Ines' },
          ],
        },
        older,
      ],
    });
  });

  it('should replace a malformed existing record with just the new table', () => {
    // Arrange
    nk.fake.seedStorage(SOCIAL_COLLECTION, RECENT_PLAYERS_KEY, OWNER, { tables: 'oops' });

    // Act
    writeRecentTable(nk, logger, OWNER, ROSTER, T0);

    // Assert
    expect(stored()?.value).toEqual({
      tables: [
        {
          endedAt: T0,
          players: [
            { userId: 'u2', name: 'Sami' },
            { userId: 'u3', name: 'Ines' },
          ],
        },
      ],
    });
  });

  it(`should cap the stored record at RECENT_TABLES_MAX (${RECENT_TABLES_MAX}) tables`, () => {
    // Arrange
    const tables = [];
    for (let i = 1; i <= RECENT_TABLES_MAX; i++) tables.push({ endedAt: T0 - i, players: [{ userId: `old-${i}`, name: `Old ${i}` }] });
    nk.fake.seedStorage(SOCIAL_COLLECTION, RECENT_PLAYERS_KEY, OWNER, { tables });

    // Act
    writeRecentTable(nk, logger, OWNER, ROSTER, T0);

    // Assert
    const value = stored()?.value as { tables: { endedAt: number }[] };
    expect({ count: value.tables.length, first: value.tables[0]?.endedAt }).toEqual({ count: RECENT_TABLES_MAX, first: T0 });
  });

  it('should not write when nobody else was at the table', () => {
    // Arrange
    const alone: RosterEntry[] = [{ userId: OWNER, name: 'Hamza' }];

    // Act
    writeRecentTable(nk, logger, OWNER, alone, T0);

    // Assert
    expect(nk.storageWrite).not.toHaveBeenCalled();
  });

  it('should not touch other users records', () => {
    // Arrange
    const roster = ROSTER;

    // Act
    writeRecentTable(nk, logger, OWNER, roster, T0);

    // Assert
    expect({ u2: stored('u2'), u3: stored('u3') }).toEqual({ u2: undefined, u3: undefined });
  });

  describe('when storage fails', () => {
    it('should not throw when the read fails', () => {
      // Arrange
      nk.fake.failStorageReads();

      // Act
      const call = () => writeRecentTable(nk, logger, OWNER, ROSTER, T0);

      // Assert
      expect(call).not.toThrow();
    });

    it('should log a warning naming the owner when the read fails', () => {
      // Arrange
      nk.fake.failStorageReads();

      // Act
      writeRecentTable(nk, logger, OWNER, ROSTER, T0);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(expect.any(String), OWNER, expect.stringContaining('storageRead failed'));
    });

    it('should not write when the read fails', () => {
      // Arrange
      nk.fake.failStorageReads();

      // Act
      writeRecentTable(nk, logger, OWNER, ROSTER, T0);

      // Assert
      expect(nk.storageWrite).not.toHaveBeenCalled();
    });

    it('should not throw when the write fails', () => {
      // Arrange
      nk.fake.failStorageWrites();

      // Act
      const call = () => writeRecentTable(nk, logger, OWNER, ROSTER, T0);

      // Assert
      expect(call).not.toThrow();
    });

    it('should log a warning naming the owner when the write fails', () => {
      // Arrange
      nk.fake.failStorageWrites();

      // Act
      writeRecentTable(nk, logger, OWNER, ROSTER, T0);

      // Assert
      expect(logger.warn).toHaveBeenCalledWith(expect.any(String), OWNER, expect.stringContaining('storageWrite failed'));
    });
  });
});
