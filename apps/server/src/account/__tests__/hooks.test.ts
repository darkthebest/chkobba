/**
 * Account hooks called directly with fake ctx/logger/nk. Name rules themselves
 * are covered in rules.test.ts and profanity.test.ts; this suite covers what
 * the hooks add: locked fields, error codes, the cooldown read from storage,
 * the NameRecord write and the default name for new device accounts.
 * The hooks read `Date.now()`, so the clock is faked (Date only).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DIRECTORY_COLLECTION,
  DIRECTORY_OWN_COLLECTION,
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  NAME_ERROR_CODES,
  OWN_CLAIM_KEY_PREFIX,
  PROFILE_COLLECTION,
  PROFILE_NAME_KEY,
  RENAME_COOLDOWN_MS,
  foldName,
  isFriendCode,
  nameClaimKey,
  type NameClaim,
  type NameErrorCode,
} from '@chkobba/protocol';
import { afterAuthenticateDevice, afterUpdateAccount, beforeAuthenticateDevice, beforeUpdateAccount } from '../hooks';
import { createContext, createFakeLogger, createFakeNk } from '../../__tests__/fakes';
import { SYSTEM_USER_ID } from '../../rpc/roomStore';

const NOW = 1_700_000_000_000;
const USER = 'user-1';
const OTHER = 'user-2';
/** A timestamp late enough for any rename to pass the cooldown after a pick at NOW. */
const LATER = NOW + RENAME_COOLDOWN_MS;

let logger: ReturnType<typeof createFakeLogger>;
let nk: ReturnType<typeof createFakeNk>;

/** An update request; `null` fields model Nakama's unset wrappers, so the type is loosened. */
function update(fields: { [key: string]: string | null | undefined }): nkruntime.UserUpdateAccount {
  return { userId: '', ...fields } as nkruntime.UserUpdateAccount;
}

function before(data: nkruntime.UserUpdateAccount, userId: string | undefined = USER): nkruntime.UserUpdateAccount {
  return beforeUpdateAccount(createContext(userId), logger, nk, data);
}

/** What `fn` threw, or undefined. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

function seedNameRecord(value: unknown): void {
  nk.fake.seedStorage(PROFILE_COLLECTION, PROFILE_NAME_KEY, USER, value);
}

function storedNameRecord(): unknown {
  return nk.fake.storedValue(PROFILE_COLLECTION, PROFILE_NAME_KEY, USER);
}

function claimKeyFor(name: string): string {
  return nameClaimKey(foldName(name));
}

/** Seeds a claim for `owner` on the key `name` folds to, as a previous update would have. */
function seedClaim(owner: string, name: string, claimedAt: number = NOW): string {
  const fold = foldName(name);
  return nk.fake.seedStorage(DIRECTORY_COLLECTION, nameClaimKey(fold), SYSTEM_USER_ID, {
    userId: owner,
    name,
    fold,
    claimedAt,
  });
}

function storedClaim(name: string): nkruntime.StorageObject | undefined {
  return nk.fake.storedObject(DIRECTORY_COLLECTION, claimKeyFor(name), SYSTEM_USER_ID);
}

function storedOwn(userId: string = USER): nkruntime.StorageObject | undefined {
  return nk.fake.storedObject(DIRECTORY_OWN_COLLECTION, OWN_CLAIM_KEY_PREFIX + userId, userId);
}

/** Runs the pair of hooks Nakama runs for one update. */
function pick(name: string, userId: string = USER): void {
  const request = update({ displayName: name });
  before(request, userId);
  afterUpdateAccount(createContext(userId), logger, nk, undefined, request);
}

/** Runs `afterAuthenticateDevice` like a device sign-in; `created: false` is a returning account. */
function authenticate(created: boolean | undefined = false, userId: string = USER): void {
  afterAuthenticateDevice(createContext(userId), logger, nk, { created }, {
    account: { id: 'device-1' },
  } as nkruntime.AuthenticateDeviceRequest);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  logger = createFakeLogger();
  nk = createFakeNk();
  nk.fake.useMemoryStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('beforeUpdateAccount', () => {
  describe('locked fields', () => {
    it('should throw username_locked with code 3 when the request sets a username', () => {
      // Arrange
      const data = update({ username: 'newname' });

      // Act
      const error = thrown(() => before(data));

      // Assert
      expect(error).toEqual({ message: 'username_locked', code: 3 });
    });

    it.each([
      { field: 'avatarUrl', value: 'https://example.com/a.png' },
      { field: 'avatarUrl', value: '' },
      { field: 'location', value: 'Tunis' },
      { field: 'location', value: '' },
    ])('should throw field_locked with code 3 when the request sets $field to "$value"', ({ field, value }) => {
      // Arrange
      const data = update({ [field]: value });

      // Act
      const error = thrown(() => before(data));

      // Assert
      expect(error).toEqual({ message: 'field_locked', code: 3 });
    });

    it('should treat null locked fields as absent', () => {
      // Arrange
      const data = update({ username: null, avatarUrl: null, location: null, langTag: 'fr' });

      // Act
      const result = before(data);

      // Assert
      expect(result).toBe(data);
    });

    it('should return the data unchanged when only langTag and timezone are set', () => {
      // Arrange
      const data = update({ langTag: 'aeb', timezone: 'Africa/Tunis' });

      // Act
      const result = before(data);

      // Assert
      expect(result).toEqual({ userId: '', langTag: 'aeb', timezone: 'Africa/Tunis' });
    });

    it('should not read the name record when no displayName is set', () => {
      // Arrange
      const data = update({ langTag: 'aeb' });

      // Act
      before(data);

      // Assert
      expect(nk.storageRead).not.toHaveBeenCalled();
    });
  });

  describe('display name validation', () => {
    it.each<{ name: string; code: NameErrorCode }>([
      { name: 'Ab', code: 'name_too_short' },
      { name: '   ', code: 'name_too_short' },
      { name: '', code: 'name_too_short' },
      { name: 'A'.repeat(17), code: 'name_too_long' },
      { name: 'Bad!Name', code: 'name_bad_chars' },
      { name: 'Hitler', code: 'name_not_allowed' },
    ])('should throw $code with code 3 when the display name is "$name"', ({ name, code }) => {
      // Arrange
      const data = update({ displayName: name });

      // Act
      const error = thrown(() => before(data));

      // Assert
      expect(error).toEqual({ message: code, code: 3 });
    });

    it('should return the data with a normalized displayName when the name is valid', () => {
      // Arrange
      const data = update({ displayName: '  Ab  cd ', langTag: 'en' });

      // Act
      const result = before(data);

      // Assert
      expect(result).toEqual({ userId: '', displayName: 'Ab cd', langTag: 'en' });
    });

    it('should return the same request object, never null, when the name is valid', () => {
      // Arrange
      const data = update({ displayName: 'Hamza' });

      // Act
      const result = before(data);

      // Assert
      expect(result).toBe(data);
    });

    it('should throw with code 16 when there is no user id', () => {
      // Arrange
      const data = update({ displayName: 'Hamza' });

      // Act
      const error = thrown(() => before(data, ''));

      // Assert
      expect(error).toMatchObject({ code: 16 });
    });

    it('should fall back to the request userId when the context has none', () => {
      // Arrange
      const data = update({ displayName: 'Hamza', userId: USER });

      // Act
      before(data, undefined);

      // Assert
      expect(nk.storageRead).toHaveBeenCalledWith([{ collection: PROFILE_COLLECTION, key: PROFILE_NAME_KEY, userId: USER }]);
    });
  });

  describe('rename cooldown', () => {
    it('should throw name_rate_limited with code 8 when the last rename was 1 ms short of the cooldown', () => {
      // Arrange
      seedNameRecord({ pickedAt: NOW - 10 * RENAME_COOLDOWN_MS, changedAt: NOW - RENAME_COOLDOWN_MS + 1 });

      // Act
      const error = thrown(() => before(update({ displayName: 'Hamza' })));

      // Assert
      expect(error).toEqual({ message: 'name_rate_limited', code: 8 });
    });

    it('should allow the rename exactly at the cooldown boundary', () => {
      // Arrange
      seedNameRecord({ pickedAt: NOW - 10 * RENAME_COOLDOWN_MS, changedAt: NOW - RENAME_COOLDOWN_MS });

      // Act
      const result = before(update({ displayName: 'Hamza' }));

      // Assert
      expect(result.displayName).toBe('Hamza');
    });

    it('should allow the rename when the name was picked but never changed', () => {
      // Arrange
      seedNameRecord({ pickedAt: NOW - 1, changedAt: null });

      // Act
      const result = before(update({ displayName: 'Hamza' }));

      // Assert
      expect(result.displayName).toBe('Hamza');
    });

    it('should allow the rename when there is no name record', () => {
      // Arrange (empty storage)

      // Act
      const result = before(update({ displayName: 'Hamza' }));

      // Assert
      expect(result.displayName).toBe('Hamza');
    });

    it.each([
      { scenario: 'a string', value: { pickedAt: 'yesterday', changedAt: NOW - 1 } },
      { scenario: 'missing changedAt', value: { pickedAt: NOW - 1 } },
      { scenario: 'a non-finite changedAt', value: { pickedAt: NOW - 1, changedAt: Infinity } },
      { scenario: 'a string changedAt', value: { pickedAt: NOW - 1, changedAt: 'now' } },
    ])('should treat a malformed record ($scenario) as absent and allow the rename', ({ value }) => {
      // Arrange
      seedNameRecord(value);

      // Act
      const result = before(update({ displayName: 'Hamza' }));

      // Assert
      expect(result.displayName).toBe('Hamza');
    });

    it('should log a warning when the stored record is malformed', () => {
      // Arrange
      seedNameRecord({ pickedAt: 'yesterday', changedAt: null });

      // Act
      before(update({ displayName: 'Hamza' }));

      // Assert
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should propagate a storage read failure', () => {
      // Arrange
      nk.storageRead.mockImplementation(() => {
        throw new Error('db down');
      });

      // Act
      const error = thrown(() => before(update({ displayName: 'Hamza' })));

      // Assert
      expect(error).toEqual(new Error('db down'));
    });
  });
});

describe('afterUpdateAccount', () => {
  function after(request: nkruntime.UserUpdateAccount, userId: string | undefined = USER): void {
    afterUpdateAccount(createContext(userId), logger, nk, undefined, request);
  }

  it('should not write anything when the request has no displayName', () => {
    // Arrange
    const request = update({ langTag: 'en' });

    // Act
    after(request);

    // Assert
    expect(nk.storageWrite).not.toHaveBeenCalled();
  });

  it('should record the first pick with changedAt null when there is no record', () => {
    // Arrange
    const request = update({ displayName: 'Hamza' });

    // Act
    after(request);

    // Assert
    expect(storedNameRecord()).toEqual({ pickedAt: NOW, changedAt: null });
  });

  it('should keep pickedAt and set changedAt to now on a later rename', () => {
    // Arrange
    seedNameRecord({ pickedAt: NOW - 5000, changedAt: null });

    // Act
    after(update({ displayName: 'Hamza' }));

    // Assert
    expect(storedNameRecord()).toEqual({ pickedAt: NOW - 5000, changedAt: NOW });
  });

  it('should write a server-owned, owner-readable profile/name object for the context user', () => {
    // Arrange
    const request = update({ displayName: 'Hamza' });

    // Act
    after(request);

    // Assert
    expect(nk.storageWrite.mock.calls[0]?.[0]).toEqual([
      {
        collection: 'profile',
        key: 'name',
        userId: USER,
        value: { pickedAt: NOW, changedAt: null },
        permissionRead: 1,
        permissionWrite: 0,
      },
    ]);
  });

  it('should not throw when the storage write fails', () => {
    // Arrange
    nk.storageWrite.mockImplementation(() => {
      throw new Error('db down');
    });

    // Act
    const error = thrown(() => after(update({ displayName: 'Hamza' })));

    // Assert
    expect(error).toBeUndefined();
  });

  it('should log an error when the storage write fails', () => {
    // Arrange
    nk.storageWrite.mockImplementation(() => {
      throw new Error('db down');
    });

    // Act
    after(update({ displayName: 'Hamza' }));

    // Assert
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('should warn and write nothing when there is no user id', () => {
    // Arrange
    const request = update({ displayName: 'Hamza' });

    // Act
    after(request, '');

    // Assert
    expect({ warned: logger.warn.mock.calls.length, writes: nk.storageWrite.mock.calls.length }).toEqual({ warned: 1, writes: 0 });
  });
});

describe('afterAuthenticateDevice', () => {
  function authenticated(created: boolean | undefined, userId: string | undefined = USER): void {
    afterAuthenticateDevice(createContext(userId), logger, nk, { created }, { account: { id: 'device-1' } } as nkruntime.AuthenticateDeviceRequest);
  }

  it('should give a new account a PlayerNNNN display name and touch nothing else', () => {
    // Arrange (new device account)

    // Act
    authenticated(true);

    // Assert
    expect(nk.accountUpdateId).toHaveBeenCalledWith(USER, null, expect.stringMatching(/^Player\d{4}$/), null, null, null, null);
  });

  it('should not update an existing account', () => {
    // Arrange (returning device account)

    // Act
    authenticated(false);

    // Assert
    expect(nk.accountUpdateId).not.toHaveBeenCalled();
  });

  it('should warn and skip the default name when the context has no user id', () => {
    // Arrange (new account, empty ctx.userId)

    // Act
    authenticated(true, '');

    // Assert
    expect({ warned: logger.warn.mock.calls.length, updates: nk.accountUpdateId.mock.calls.length }).toEqual({ warned: 1, updates: 0 });
  });

  it('should not throw when accountUpdateId fails', () => {
    // Arrange
    nk.accountUpdateId.mockImplementation(() => {
      throw new Error('db down');
    });

    // Act
    const error = thrown(() => authenticated(true));

    // Assert
    expect(error).toBeUndefined();
  });

  it('should log an error when accountUpdateId fails', () => {
    // Arrange
    nk.accountUpdateId.mockImplementation(() => {
      throw new Error('db down');
    });

    // Act
    authenticated(true);

    // Assert
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});

describe('claim lifecycle', () => {
  describe('first pick', () => {
    it('should acquire the claim and write the own record', () => {
      // Arrange
      const name = 'Hedi';

      // Act
      pick(name);

      // Assert
      expect({ claim: storedClaim(name)?.value, own: storedOwn()?.value }).toEqual({
        claim: { userId: USER, name, fold: 'hedi', claimedAt: NOW },
        own: { claimKey: claimKeyFor(name), fold: 'hedi', name, claimedAt: NOW },
      });
    });
  });

  describe('rename to a new fold', () => {
    it('should move the new claim in, delete the old one and point the own record at it', () => {
      // Arrange
      pick('Hedi');
      vi.setSystemTime(LATER);
      const request = update({ displayName: 'Sami' });

      // Act
      before(request);
      afterUpdateAccount(createContext(USER), logger, nk, undefined, request);

      // Assert
      expect({
        old: storedClaim('Hedi'),
        current: storedClaim('Sami')?.value,
        own: storedOwn()?.value,
      }).toEqual({
        old: undefined,
        current: { userId: USER, name: 'Sami', fold: 'sami', claimedAt: LATER },
        own: { claimKey: claimKeyFor('Sami'), fold: 'sami', name: 'Sami', claimedAt: LATER },
      });
    });
  });

  describe('casing-only and accent-only rename', () => {
    it.each([
      { scenario: 'casing', nextName: 'HEDI' },
      { scenario: 'accent', nextName: 'Hédi' },
    ])('should keep the claim after a $scenario-only rename', ({ nextName }) => {
      // Arrange
      pick('Hedi');
      vi.setSystemTime(LATER);
      const request = update({ displayName: nextName });

      // Act: the full before+after sequence a real rename runs.
      before(request);
      afterUpdateAccount(createContext(USER), logger, nk, undefined, request);

      // Assert: the release guard left the claim the before hook just kept in place.
      expect({ claim: storedClaim('Hedi')?.value, own: storedOwn()?.value }).toEqual({
        claim: { userId: USER, name: 'Hedi', fold: 'hedi', claimedAt: NOW },
        own: { claimKey: claimKeyFor('Hedi'), fold: 'hedi', name: nextName, claimedAt: NOW },
      });
    });
  });

  describe('clash across casing and accents', () => {
    it('should reject a spelling that folds to a live foreign claim', () => {
      // Arrange
      seedClaim(OTHER, 'Hedi');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Hedi' });

      // Act
      const error = thrown(() => before(update({ displayName: 'HÉDI' })));

      // Assert
      expect(error).toEqual({ message: 'name_taken', code: 3 });
    });

    it('should leave the existing claim untouched when the clash is rejected', () => {
      // Arrange
      const version = seedClaim(OTHER, 'Hedi');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Hedi' });

      // Act
      thrown(() => before(update({ displayName: 'HÉDI' })));

      // Assert
      expect(storedClaim('Hedi')).toMatchObject({ version, value: { userId: OTHER } });
    });
  });

  describe('stale reclaim', () => {
    it('should let a new account take a claim whose owner renamed to a different fold', () => {
      // Arrange
      seedClaim(OTHER, 'Hedi');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Sami' });

      // Act
      before(update({ displayName: 'Hedi' }));

      // Assert
      expect(storedClaim('Hedi')?.value).toEqual({ userId: USER, name: 'Hedi', fold: 'hedi', claimedAt: NOW });
    });

    it('should let a new account take a claim whose owner account is gone', () => {
      // Arrange: no account for OTHER, so usersGetId returns none.
      seedClaim(OTHER, 'Hedi');

      // Act
      before(update({ displayName: 'Hedi' }));

      // Assert
      expect(storedClaim('Hedi')?.value).toEqual({ userId: USER, name: 'Hedi', fold: 'hedi', claimedAt: NOW });
    });
  });

  describe('sign-in backfill', () => {
    it('should list a named account that has no own record', () => {
      // Arrange
      seedNameRecord({ pickedAt: NOW - 5000, changedAt: null });
      nk.fake.seedAccount(USER, { username: 'USER0001', displayName: 'Hedi' });

      // Act
      authenticate(false);

      // Assert
      expect({ claim: storedClaim('Hedi')?.value, own: storedOwn()?.value }).toEqual({
        claim: { userId: USER, name: 'Hedi', fold: 'hedi', claimedAt: NOW },
        own: { claimKey: claimKeyFor('Hedi'), fold: 'hedi', name: 'Hedi', claimedAt: NOW },
      });
    });

    it('should not throw and keep the account unlisted when a live foreign claim holds the name', () => {
      // Arrange
      seedClaim(OTHER, 'Hedi');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Hedi' });
      seedNameRecord({ pickedAt: NOW - 5000, changedAt: null });
      nk.fake.seedAccount(USER, { username: 'USER0001', displayName: 'Hedi' });

      // Act
      const error = thrown(() => authenticate(false));

      // Assert
      expect(error).toBeUndefined();
    });

    it('should write no own record when the backfill name is taken', () => {
      // Arrange
      seedClaim(OTHER, 'Hedi');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Hedi' });
      seedNameRecord({ pickedAt: NOW - 5000, changedAt: null });
      nk.fake.seedAccount(USER, { username: 'USER0001', displayName: 'Hedi' });

      // Act
      authenticate(false);

      // Assert
      expect(storedOwn()).toBeUndefined();
    });

    it('should neither delete nor rewrite the foreign claim when the backfill name is taken', () => {
      // Arrange
      const version = seedClaim(OTHER, 'Hedi');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Hedi' });
      seedNameRecord({ pickedAt: NOW - 5000, changedAt: null });
      nk.fake.seedAccount(USER, { username: 'USER0001', displayName: 'Hedi' });

      // Act
      authenticate(false);

      // Assert
      expect({
        claim: storedClaim('Hedi')?.value,
        version: storedClaim('Hedi')?.version,
        deletes: nk.storageDelete.mock.calls.length,
      }).toEqual({
        claim: { userId: OTHER, name: 'Hedi', fold: 'hedi', claimedAt: NOW },
        version,
        deletes: 0,
      });
    });

    it('should log the clash without logging an error', () => {
      // Arrange
      seedClaim(OTHER, 'Hedi');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Hedi' });
      seedNameRecord({ pickedAt: NOW - 5000, changedAt: null });
      nk.fake.seedAccount(USER, { username: 'USER0001', displayName: 'Hedi' });

      // Act
      authenticate(false);

      // Assert
      expect({ infos: logger.info.mock.calls.length, errors: logger.error.mock.calls.length }).toEqual({ infos: 1, errors: 0 });
    });
  });

  describe('in-sync own record whose claim moved', () => {
    /** A picked 'Hedi': claim, NameRecord and own record all point at the same key. */
    function pickHedi(): void {
      pick('Hedi');
      nk.fake.seedAccount(USER, { username: 'USER0001', displayName: 'Hedi' });
    }

    it('should re-create the claim and rewrite the own record when the claim row vanished', () => {
      // Arrange
      pickHedi();
      nk.storageDelete([{ collection: DIRECTORY_COLLECTION, key: claimKeyFor('Hedi'), userId: SYSTEM_USER_ID }]);
      vi.setSystemTime(LATER);

      // Act
      authenticate(false);

      // Assert
      expect({ claim: storedClaim('Hedi')?.value, own: storedOwn()?.value }).toEqual({
        claim: { userId: USER, name: 'Hedi', fold: 'hedi', claimedAt: LATER },
        own: { claimKey: claimKeyFor('Hedi'), fold: 'hedi', name: 'Hedi', claimedAt: LATER },
      });
    });

    it('should leave a live foreign claim byte-identical and the own record unwritten', () => {
      // Arrange: the own record points at the key another account now owns.
      pickHedi();
      const version = seedClaim(OTHER, 'Hedi');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Hedi' });
      const ownBefore = storedOwn()?.value;

      // Act
      const error = thrown(() => authenticate(false));

      // Assert
      expect({
        error,
        claim: storedClaim('Hedi')?.value,
        version: storedClaim('Hedi')?.version,
        own: storedOwn()?.value,
      }).toEqual({
        error: undefined,
        claim: { userId: OTHER, name: 'Hedi', fold: 'hedi', claimedAt: NOW },
        version,
        own: ownBefore,
      });
    });

    it('should log and return normally when the claim read faults on a matching own record', () => {
      // Arrange: only the directory read the in-sync branch adds fails, so the
      // sign-in reaches that branch before the fault.
      pickHedi();
      nk.storageRead.mockImplementation((keys) => {
        if (keys.some((key) => key.collection === DIRECTORY_COLLECTION)) throw new Error('db down');
        const found: nkruntime.StorageObject[] = [];
        for (const key of keys) {
          const object = nk.fake.storedObject(key.collection, key.key, key.userId ?? '');
          if (object !== undefined) found.push(object);
        }
        return found;
      });

      // Act
      const error = thrown(() => authenticate(false));

      // Assert
      expect({ error, warned: logger.warn.mock.calls.length > 0 }).toEqual({ error: undefined, warned: true });
    });
  });

  describe('storage failure vs clash', () => {
    it('should answer name_storage_error with code 13 when the claim write faults', () => {
      // Arrange
      nk.fake.failStorageWrites();

      // Act
      const error = thrown(() => before(update({ displayName: 'Hedi' })));

      // Assert
      expect(error).toEqual({ message: 'name_storage_error', code: 13 });
    });

    it('should never answer name_taken when the claim write faults', () => {
      // Arrange
      nk.fake.failStorageWrites();

      // Act
      const error = thrown(() => before(update({ displayName: 'Hedi' }))) as { message?: string };

      // Assert
      expect(error.message).not.toBe('name_taken');
    });

    it('should answer name_storage_error when the claim re-read faults', () => {
      // Arrange: the key is occupied, and every directory read throws while the
      // profile read the cooldown makes still succeeds.
      seedClaim(OTHER, 'Hedi');
      nk.storageRead.mockImplementation((keys) => {
        if (keys.some((key) => key.collection === DIRECTORY_COLLECTION)) throw new Error('db down');
        return [];
      });

      // Act
      const error = thrown(() => before(update({ displayName: 'Hedi' })));

      // Assert
      expect(error).toEqual({ message: 'name_storage_error', code: 13 });
    });

    it('should log and not throw when the after hook write faults', () => {
      // Arrange
      nk.fake.failStorageWrites();

      // Act
      const error = thrown(() =>
        afterUpdateAccount(createContext(USER), logger, nk, undefined, update({ displayName: 'Hedi' })),
      );

      // Assert
      expect({ error, errors: logger.error.mock.calls.length }).toEqual({ error: undefined, errors: 1 });
    });

    it('should log and not throw when sign-in reconciliation faults', () => {
      // Arrange
      seedNameRecord({ pickedAt: NOW - 5000, changedAt: null });
      nk.fake.seedAccount(USER, { username: 'USER0001', displayName: 'Hedi' });
      nk.fake.failStorageWrites();

      // Act
      const error = thrown(() => authenticate(false));

      // Assert
      expect({ error, warned: logger.warn.mock.calls.length > 0 }).toEqual({ error: undefined, warned: true });
    });
  });

  describe('cooldown untouched', () => {
    it('should answer name_rate_limited inside the cooldown and consume no claim', () => {
      // Arrange
      seedNameRecord({ pickedAt: NOW - 10 * RENAME_COOLDOWN_MS, changedAt: NOW - RENAME_COOLDOWN_MS + 1 });

      // Act
      const error = thrown(() => before(update({ displayName: 'Hedi' })));

      // Assert
      expect({ error, claim: storedClaim('Hedi'), writes: nk.storageWrite.mock.calls.length }).toEqual({
        error: { message: 'name_rate_limited', code: 8 },
        claim: undefined,
        writes: 0,
      });
    });
  });

  describe('rejected rename', () => {
    it('should keep the original claim and own record exactly as before', () => {
      // Arrange
      pick('Hedi');
      const originalClaim = storedClaim('Hedi');
      const originalOwn = storedOwn()?.value;
      seedClaim(OTHER, 'Sami');
      nk.fake.seedAccount(OTHER, { username: 'OTHER001', displayName: 'Sami' });
      vi.setSystemTime(LATER);

      // Act
      const error = thrown(() => before(update({ displayName: 'Sami' })));

      // Assert
      expect({ error, claim: storedClaim('Hedi'), own: storedOwn()?.value }).toEqual({
        error: { message: 'name_taken', code: 3 },
        claim: originalClaim,
        own: originalOwn,
      });
    });
  });

  describe('simultaneous picks', () => {
    it('should let exactly one account own the key and reject the other as taken', () => {
      // Arrange: the fake cannot interleave a read between a check and a write,
      // and the create-only write is the atomic step, so back-to-back before
      // hooks model two racers that both saw the key absent.
      nk.fake.seedAccount(USER, { username: 'USER0001', displayName: 'Hedi' });

      // Act: the first create-only write wins; the second is rejected and re-read.
      const winner = before(update({ displayName: 'Hedi' }), USER);
      const error = thrown(() => before(update({ displayName: 'HÉDI' }), OTHER));

      // Assert
      expect({
        winner: winner.displayName,
        error,
        owner: (storedClaim('Hedi')?.value as NameClaim | undefined)?.userId,
      }).toEqual({ winner: 'Hedi', error: { message: 'name_taken', code: 3 }, owner: USER });
    });
  });
});

describe('NAME_ERROR_CODES coverage', () => {
  /**
   * One request per code. Typed as a full record, so adding a code to the
   * protocol without a trigger here fails typecheck.
   */
  const TRIGGERS: { readonly [C in NameErrorCode]: () => unknown } = {
    name_too_short: () => before(update({ displayName: 'Ab' })),
    name_too_long: () => before(update({ displayName: 'A'.repeat(17) })),
    name_bad_chars: () => before(update({ displayName: 'Bad!Name' })),
    name_not_allowed: () => before(update({ displayName: 'Hitler' })),
    name_taken: () => {
      // A live foreign claim on the fold the requested spelling produces.
      nk.fake.seedAccount('holder-user', { username: 'HOLDER12', displayName: 'Hedi' });
      nk.fake.seedStorage(DIRECTORY_COLLECTION, nameClaimKey(foldName('Hedi')), SYSTEM_USER_ID, {
        userId: 'holder-user',
        name: 'Hedi',
        fold: 'hedi',
        claimedAt: NOW - 1000,
      });
      return before(update({ displayName: 'HÉDI' }));
    },
    name_rate_limited: () => {
      seedNameRecord({ pickedAt: NOW - 2 * RENAME_COOLDOWN_MS, changedAt: NOW - 1 });
      return before(update({ displayName: 'Hamza' }));
    },
    username_locked: () => before(update({ username: 'other' })),
    field_locked: () => before(update({ avatarUrl: '' })),
  };

  it.each([...NAME_ERROR_CODES])('should be able to reject an update with %s', (code) => {
    // Arrange
    const trigger = TRIGGERS[code];

    // Act
    const error = thrown(trigger);

    // Assert
    expect(error).toMatchObject({ message: code });
  });
});

describe('beforeAuthenticateDevice', () => {
  /** Tries the hook makes, each reading FRIEND_CODE_LENGTH bytes of one secureRandomBytes call. */
  const TRIES = 5;

  /** The byte vector that makes the hook's codes come out as `codes`, in try order. */
  function bytesFor(...codes: string[]): number[] {
    return codes.join('').split('').map((ch) => FRIEND_CODE_ALPHABET.indexOf(ch));
  }

  function request(username?: string): nkruntime.AuthenticateDeviceRequest {
    const data: nkruntime.AuthenticateDeviceRequest = { account: { id: 'device-1' } };
    if (username !== undefined) data.username = username;
    return data;
  }

  function signIn(data: nkruntime.AuthenticateDeviceRequest): nkruntime.AuthenticateDeviceRequest {
    return beforeAuthenticateDevice(createContext(), logger, nk, data);
  }

  function takeUsername(username: string, userId: string = `holder-${username}`): void {
    nk.fake.seedAccount(userId, { username, displayName: '' });
  }

  describe('client-sent username is always replaced', () => {
    it.each([
      { scenario: 'missing', username: undefined },
      { scenario: 'a legacy guest name', username: 'Guest-AB12' },
      { scenario: 'a lowercase valid code', username: 'zzzz2345' },
      { scenario: 'an uppercase valid code', username: 'ZZZZ2345' },
    ])('should set the generated code when the client username is $scenario', ({ username }) => {
      // Arrange
      nk.fake.pushRandomBytes(bytesFor('JKLMNPQR'));

      // Act
      const result = signIn(request(username));

      // Assert
      expect(result.username).toBe('JKLMNPQR');
    });

    it.each([
      { scenario: 'missing', username: undefined },
      { scenario: 'a legacy guest name', username: 'Guest-AB12' },
      { scenario: 'a lowercase valid code', username: 'zzzz2345' },
      { scenario: 'an uppercase valid code', username: 'ZZZZ2345' },
    ])('should end with a valid friend code different from the client username when it is $scenario', ({ username }) => {
      // Arrange (default random bytes)

      // Act
      const result = signIn(request(username));

      // Assert
      expect({ valid: isFriendCode(result.username ?? ''), same: result.username === username }).toEqual({ valid: true, same: false });
    });

    it('should return the same request object', () => {
      // Arrange
      const data = request('Guest-AB12');

      // Act
      const result = signIn(data);

      // Assert
      expect(result).toBe(data);
    });

    it('should read all its random bytes in one secureRandomBytes call', () => {
      // Arrange (default random bytes)

      // Act
      signIn(request());

      // Assert
      expect(nk.secureRandomBytes.mock.calls).toEqual([[FRIEND_CODE_LENGTH * TRIES]]);
    });

    it('should look up the candidate code by exact username', () => {
      // Arrange
      nk.fake.pushRandomBytes(bytesFor('JKLMNPQR'));

      // Act
      signIn(request());

      // Assert
      expect(nk.usersGetUsername.mock.calls).toEqual([[['JKLMNPQR']]]);
    });
  });

  describe('clashes and profanity', () => {
    it('should retry with the next code when the first one is already taken', () => {
      // Arrange
      takeUsername('ABCDEFGH');
      nk.fake.pushRandomBytes(bytesFor('ABCDEFGH', 'JKLMNPQR'));

      // Act
      const result = signIn(request());

      // Assert
      expect(result.username).toBe('JKLMNPQR');
    });

    it('should skip a code that spells a blocked word', () => {
      // Arrange
      nk.fake.pushRandomBytes(bytesFor('FUCKAAAA', 'JKLMNPQR'));

      // Act
      const result = signIn(request());

      // Assert
      expect(result.username).toBe('JKLMNPQR');
    });

    it('should not look up a code that spells a blocked word', () => {
      // Arrange
      nk.fake.pushRandomBytes(bytesFor('FUCKAAAA', 'JKLMNPQR'));

      // Act
      signIn(request());

      // Assert
      expect(nk.usersGetUsername.mock.calls).toEqual([[['JKLMNPQR']]]);
    });

    it('should keep the last clean candidate when all 5 codes are taken', () => {
      // Arrange
      const codes = ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD', 'EEEEEEEE'];
      codes.forEach((code) => takeUsername(code));
      nk.fake.pushRandomBytes(bytesFor(...codes));

      // Act
      const result = signIn(request('Guest-AB12'));

      // Assert
      expect(result.username).toBe('EEEEEEEE');
    });

    it('should keep the last clean candidate when the final try is dirty and the others are taken', () => {
      // Arrange
      const taken = ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD'];
      taken.forEach((code) => takeUsername(code));
      nk.fake.pushRandomBytes(bytesFor(...taken, 'FUCKAAAA'));

      // Act
      const result = signIn(request());

      // Assert
      expect(result.username).toBe('DDDDDDDD');
    });

    it('should not log a warning when all 5 codes are taken', () => {
      // Arrange
      const codes = ['AAAAAAAA', 'BBBBBBBB', 'CCCCCCCC', 'DDDDDDDD', 'EEEEEEEE'];
      codes.forEach((code) => takeUsername(code));
      nk.fake.pushRandomBytes(bytesFor(...codes));

      // Act
      signIn(request());

      // Assert
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should leave the username unchanged and warn when all 5 codes are dirty', () => {
      // Arrange
      nk.fake.pushRandomBytes(bytesFor('FUCKAAAA', '5LUTAAAA', 'B4ST4RDA', 'M3RD3BCD', 'ZAMELXYZ'));

      // Act
      const result = signIn(request('Guest-AB12'));

      // Assert
      expect({ username: result.username, warned: logger.warn.mock.calls.length }).toEqual({ username: 'Guest-AB12', warned: 1 });
    });
  });

  describe('failures never reject the sign-in', () => {
    it('should return the request unchanged when secureRandomBytes throws', () => {
      // Arrange
      nk.secureRandomBytes.mockImplementation(() => {
        throw new Error('rng down');
      });
      const data = request('Guest-AB12');

      // Act
      const result = signIn(data);

      // Assert
      expect({ same: result === data, username: result.username }).toEqual({ same: true, username: 'Guest-AB12' });
    });

    it('should log a warning when secureRandomBytes throws', () => {
      // Arrange
      nk.secureRandomBytes.mockImplementation(() => {
        throw new Error('rng down');
      });

      // Act
      signIn(request());

      // Assert
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should not throw when usersGetUsername throws', () => {
      // Arrange
      nk.fake.failUsersGetUsername();

      // Act
      const error = thrown(() => signIn(request()));

      // Assert
      expect(error).toBeUndefined();
    });

    it('should return the request with its username unchanged when usersGetUsername throws', () => {
      // Arrange
      nk.fake.failUsersGetUsername();
      const data = request('Guest-AB12');

      // Act
      const result = signIn(data);

      // Assert
      expect({ same: result === data, username: result.username }).toEqual({ same: true, username: 'Guest-AB12' });
    });

    it('should log a warning when usersGetUsername throws', () => {
      // Arrange
      nk.fake.failUsersGetUsername();

      // Act
      signIn(request());

      // Assert
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });
  });
});
