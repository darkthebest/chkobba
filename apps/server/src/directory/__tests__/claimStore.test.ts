/**
 * Claim storage against the fake Nakama memory store: the create-only
 * acquisition, the taken-holder re-read, the version-guarded delete and the
 * shape guards that read a malformed record as absent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECTORY_COLLECTION,
  DIRECTORY_OWN_COLLECTION,
  OWN_CLAIM_KEY_PREFIX,
  foldName,
  nameClaimKey,
  type NameClaim,
  type OwnClaim,
} from '@chkobba/protocol';
import {
  acquireClaim,
  deleteClaimAtVersion,
  readClaim,
  readClaimRaw,
  readOwnClaim,
  releaseClaimIfOwned,
  writeOwnClaim,
} from '../claimStore';
import { SYSTEM_USER_ID } from '../../rpc/roomStore';
import { STORAGE_DELETE_REJECTED, createFakeLogger, createFakeNk } from '../../__tests__/fakes';

const NOW = 1_700_000_000_000;
const USER = 'user-1';
const OTHER = 'user-2';
const HEDI_FOLD = foldName('Hedi');
const HEDI_KEY = nameClaimKey(HEDI_FOLD);

const HEDI_CLAIM: NameClaim = { userId: USER, name: 'Hedi', fold: HEDI_FOLD, claimedAt: NOW };
const HEDI_OWN: OwnClaim = { claimKey: HEDI_KEY, fold: HEDI_FOLD, name: 'Hedi', claimedAt: NOW };

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

function storedClaim(key: string = HEDI_KEY): nkruntime.StorageObject | undefined {
  return nk.fake.storedObject(DIRECTORY_COLLECTION, key, SYSTEM_USER_ID);
}

function storedOwn(userId: string = USER): nkruntime.StorageObject | undefined {
  return nk.fake.storedObject(DIRECTORY_OWN_COLLECTION, OWN_CLAIM_KEY_PREFIX + userId, userId);
}

describe('acquireClaim', () => {
  it('should acquire a free key with a create-only write', () => {
    // Arrange (empty store)

    // Act
    const result = acquireClaim(nk, HEDI_KEY, USER, 'Hedi', HEDI_FOLD, NOW);

    // Assert
    expect({ status: result.status, value: storedClaim()?.value }).toEqual({ status: 'acquired', value: HEDI_CLAIM });
  });

  it('should write the claim system-owned and server-only (read 0 / write 0)', () => {
    // Arrange (empty store)

    // Act
    acquireClaim(nk, HEDI_KEY, USER, 'Hedi', HEDI_FOLD, NOW);

    // Assert
    expect(nk.storageWrite.mock.calls[0]?.[0]?.[0]).toEqual(
      expect.objectContaining({
        collection: DIRECTORY_COLLECTION,
        key: HEDI_KEY,
        userId: SYSTEM_USER_ID,
        version: '*',
        permissionRead: 0,
        permissionWrite: 0,
      }),
    );
  });

  it('should return the taken holder record and version when another account owns the key', () => {
    // Arrange
    const held = { ...HEDI_CLAIM, userId: OTHER };
    const version = nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, held);

    // Act
    const result = acquireClaim(nk, HEDI_KEY, USER, 'Hedi', HEDI_FOLD, NOW);

    // Assert
    expect(result).toEqual({ status: 'taken', holder: { record: held, version } });
  });

  it('should not overwrite the holder record when the key is taken', () => {
    // Arrange
    const held = { ...HEDI_CLAIM, userId: OTHER };
    nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, held);

    // Act
    acquireClaim(nk, HEDI_KEY, USER, 'Hedi', HEDI_FOLD, NOW);

    // Assert
    expect(storedClaim()?.value).toEqual(held);
  });

  it('should count a re-acquire by the same account as acquired', () => {
    // Arrange
    nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, HEDI_CLAIM);

    // Act
    const result = acquireClaim(nk, HEDI_KEY, USER, 'Hedi', HEDI_FOLD, NOW);

    // Assert
    expect(result).toEqual({ status: 'acquired' });
  });

  it('should return a null holder when the record vanished between the rejected write and the re-read', () => {
    // Arrange: every write fails, and the re-read finds nothing.
    nk.storageWrite.mockImplementation(() => {
      throw new Error('rejected');
    });

    // Act
    const result = acquireClaim(nk, HEDI_KEY, USER, 'Hedi', HEDI_FOLD, NOW);

    // Assert
    expect(result).toEqual({ status: 'taken', holder: null });
  });

  it('should propagate a re-read failure rather than report a clash', () => {
    // Arrange
    nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, { ...HEDI_CLAIM, userId: OTHER });
    nk.fake.failStorageReads();

    // Act
    const call = () => acquireClaim(nk, HEDI_KEY, USER, 'Hedi', HEDI_FOLD, NOW);

    // Assert
    expect(call).toThrow('storageRead failed');
  });
});

describe('readClaim / readClaimRaw', () => {
  it('should return a valid claim with its version', () => {
    // Arrange
    const version = nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, HEDI_CLAIM);

    // Act
    const stored = readClaim(nk, HEDI_KEY);

    // Assert
    expect(stored).toEqual({ record: HEDI_CLAIM, version });
  });

  it('should read a missing key as absent', () => {
    // Arrange (empty store)

    // Act
    const stored = readClaim(nk, HEDI_KEY);

    // Assert
    expect(stored).toBeNull();
  });

  it('should read a malformed value as absent', () => {
    // Arrange
    nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, { userId: 'other' });

    // Act
    const stored = readClaim(nk, HEDI_KEY);

    // Assert
    expect(stored).toBeNull();
  });

  it('should return a malformed value with its version from the raw read', () => {
    // Arrange
    const malformed = { userId: 'other', name: 'Hedi' };
    const version = nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, malformed);

    // Act
    const stored = readClaimRaw(nk, HEDI_KEY);

    // Assert
    expect(stored).toEqual({ value: malformed, version });
  });

  it('should read a missing key as absent from the raw read', () => {
    // Arrange (empty store)

    // Act
    const stored = readClaimRaw(nk, HEDI_KEY);

    // Assert
    expect(stored).toBeNull();
  });
});

describe('deleteClaimAtVersion', () => {
  it('should delete the claim at the matching version', () => {
    // Arrange
    const version = nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, HEDI_CLAIM);

    // Act
    deleteClaimAtVersion(nk, HEDI_KEY, version);

    // Assert
    expect(storedClaim()).toBeUndefined();
  });

  it('should throw and keep the claim when the version no longer matches', () => {
    // Arrange
    const version = nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, HEDI_CLAIM);

    // Act
    const call = () => deleteClaimAtVersion(nk, HEDI_KEY, 'v-stale');

    // Assert
    expect(call).toThrow(STORAGE_DELETE_REJECTED);
    expect(storedClaim()?.version).toBe(version);
  });
});

describe('readOwnClaim / writeOwnClaim', () => {
  it('should write the own record owner-readable and server-write-only (read 1 / write 0)', () => {
    // Arrange (empty store)

    // Act
    writeOwnClaim(nk, USER, HEDI_OWN);

    // Assert
    expect(nk.storageWrite.mock.calls[0]?.[0]?.[0]).toEqual(
      expect.objectContaining({
        collection: DIRECTORY_OWN_COLLECTION,
        key: OWN_CLAIM_KEY_PREFIX + USER,
        userId: USER,
        permissionRead: 1,
        permissionWrite: 0,
      }),
    );
  });

  it('should read back the own record it wrote', () => {
    // Arrange
    writeOwnClaim(nk, USER, HEDI_OWN);

    // Act
    const own = readOwnClaim(nk, USER);

    // Assert
    expect(own).toEqual(HEDI_OWN);
  });

  it('should read a missing own record as absent', () => {
    // Arrange (empty store)

    // Act
    const own = readOwnClaim(nk, USER);

    // Assert
    expect(own).toBeNull();
  });

  it('should read a malformed own record as absent', () => {
    // Arrange
    nk.fake.seedStorage(DIRECTORY_OWN_COLLECTION, OWN_CLAIM_KEY_PREFIX + USER, USER, { fold: 'hedi' });

    // Act
    const own = readOwnClaim(nk, USER);

    // Assert
    expect(own).toBeNull();
  });
});

describe('releaseClaimIfOwned', () => {
  it('should delete a claim that still points at the user', () => {
    // Arrange
    nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, HEDI_CLAIM);

    // Act
    releaseClaimIfOwned(nk, logger, HEDI_KEY, USER);

    // Assert
    expect(storedClaim()).toBeUndefined();
  });

  it('should keep a claim another account has taken', () => {
    // Arrange
    const foreign = { ...HEDI_CLAIM, userId: OTHER };
    nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, foreign);

    // Act
    releaseClaimIfOwned(nk, logger, HEDI_KEY, USER);

    // Assert
    expect(storedClaim()?.value).toEqual(foreign);
  });

  it('should log and not throw when the release read fails', () => {
    // Arrange
    nk.fake.seedStorage(DIRECTORY_COLLECTION, HEDI_KEY, SYSTEM_USER_ID, HEDI_CLAIM);
    nk.fake.failStorageReads();

    // Act
    const call = () => releaseClaimIfOwned(nk, logger, HEDI_KEY, USER);

    // Assert
    expect({ threw: thrownBy(call), warnings: logger.warn.mock.calls.length }).toEqual({ threw: undefined, warnings: 1 });
  });
});

/** Runs `fn` and returns what it threw (undefined when it returned). */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}
