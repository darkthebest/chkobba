import { Session } from '@heroiclabs/nakama-js';

import {
  DEFAULT_PRESENCE_VISIBILITY,
  DIRECTORY_OWN_COLLECTION,
  NAME_ERROR_CODES,
  nameClaimKey,
  OWN_CLAIM_KEY_PREFIX,
  PROFILE_COLLECTION,
  PROFILE_NAME_KEY,
  PROFILE_PREFS_KEY,
  RENAME_COOLDOWN_MS,
  type NameErrorCode,
} from '@chkobba/protocol';

import type { KeyValueStore } from '../nakama';
import {
  friendCodeOf,
  loadCachedProfile,
  NakamaProfileBackend,
  nameErrorFrom,
  parseNameRecord,
  type Profile,
  type ProfileClient,
  type RenewableSessionSource,
} from '../profile';

/** The cache key profile.ts writes (private there, but part of what's on disk). */
const PROFILE_CACHE_KEY = 'chkobba.online.profile';

const NOW_MS = 1_800_000_000_000;
const NOW_SEC = NOW_MS / 1000;
const USER_ID = 'user-1';
const MINUTE_MS = 60 * 1000;
/** A valid friend code (the server-generated username). */
const FRIEND_CODE = 'K7M2QXAB';

type Account = Awaited<ReturnType<ProfileClient['getAccount']>>;
type StorageObjects = Awaited<ReturnType<ProfileClient['readStorageObjects']>>;
type StorageObject = StorageObjects['objects'][number];
type ReadRequest = Parameters<ProfileClient['readStorageObjects']>[1];
type UpdateRequest = Parameters<ProfileClient['updateAccount']>[1];

function base64Json(value: object): string {
  return btoa(JSON.stringify(value));
}

/** A real nakama-js Session whose JWT carries `uid` (empty string: no user id). */
function makeSession(userId: string = USER_ID): Session {
  const token = `h.${base64Json({ uid: userId, usn: 'Guest', exp: NOW_SEC + 3600 })}.s`;
  const refresh = `h.${base64Json({ uid: userId, exp: NOW_SEC + 86_400 })}.s`;
  return new Session(token, refresh, false);
}

/** A nakama-js rejection: the fetch Response with the server's `{ code, message }` JSON body. */
function responseError(status: number, code: number, message: string) {
  return { status, statusText: `HTTP ${status}`, json: async () => ({ code, message }) };
}

/** HTTP status and gRPC code the server uses for each name error. */
function errorStatusOf(reason: NameErrorCode): { status: number; code: number } {
  return reason === 'name_rate_limited' ? { status: 429, code: 8 } : { status: 400, code: 3 };
}

function nameObject(value: unknown, userId: string = USER_ID): StorageObject {
  return { collection: PROFILE_COLLECTION, key: PROFILE_NAME_KEY, user_id: userId, value: value as object };
}

function ownClaimObject(value: unknown, userId: string = USER_ID): StorageObject {
  return { collection: DIRECTORY_OWN_COLLECTION, key: OWN_CLAIM_KEY_PREFIX + userId, user_id: userId, value: value as object };
}

function prefsObject(value: unknown, userId: string = USER_ID): StorageObject {
  return { collection: PROFILE_COLLECTION, key: PROFILE_PREFS_KEY, user_id: userId, value: value as object };
}

/** A well-formed own-claim record for `Hamza`, as the directory write stores it. */
const VALID_OWN_CLAIM = { claimKey: nameClaimKey('hamza'), fold: 'hamza', name: 'Hamza', claimedAt: NOW_MS };
/** A well-formed prefs record choosing the non-default visibility. */
const NOBODY_PREFS = { visibility: 'nobody', updatedAt: NOW_MS };

function memoryKeyValueStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const store = {
    data,
    getItem: jest.fn(async (key: string) => data.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  return store satisfies KeyValueStore;
}

function cachedProfile(store: ReturnType<typeof memoryKeyValueStore>): unknown {
  const text = store.data.get(PROFILE_CACHE_KEY);
  return text === undefined ? undefined : JSON.parse(text);
}

interface ClientState {
  account: Account;
  objects: StorageObject[];
}

function fakeClient(initial: Partial<ClientState> = {}) {
  const state: ClientState = {
    account: { user: { id: USER_ID, username: 'Guest-ABCD', display_name: 'Hamza' } },
    objects: [],
    ...initial,
  };
  const client = {
    state,
    getAccount: jest.fn(async (_session: Session): Promise<Account> => state.account),
    readStorageObjects: jest.fn(
      async (_session: Session, _request: ReadRequest): Promise<StorageObjects> => ({ objects: state.objects }),
    ),
    updateAccount: jest.fn(async (_session: Session, _request: UpdateRequest): Promise<boolean> => true),
  };
  return client satisfies ProfileClient;
}

function fakeAuth(session: Session = makeSession()) {
  const auth = {
    signIn: jest.fn(async () => ({ session })),
    invalidate: jest.fn(async (_stale: Session) => undefined),
  };
  return auth satisfies RenewableSessionSource;
}

interface Setup {
  readonly client?: ReturnType<typeof fakeClient>;
  readonly auth?: ReturnType<typeof fakeAuth>;
  readonly store?: ReturnType<typeof memoryKeyValueStore>;
}

function createBackend({ client = fakeClient(), auth = fakeAuth(), store = memoryKeyValueStore() }: Setup = {}) {
  const backend = new NakamaProfileBackend({ client, auth, store, now: () => NOW_MS });
  return { backend, client, auth, store };
}

const PICKED_PROFILE: Profile = {
  displayName: 'Hamza',
  namePicked: true,
  renameAvailableAt: null,
  friendCode: null,
  listed: false,
  presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('parseNameRecord', () => {
  it.each([
    { scenario: 'an object with changedAt', value: { pickedAt: 1, changedAt: 2 }, expected: { pickedAt: 1, changedAt: 2 } },
    { scenario: 'an object with null changedAt', value: { pickedAt: 1, changedAt: null }, expected: { pickedAt: 1, changedAt: null } },
    { scenario: 'an object without changedAt', value: { pickedAt: 1 }, expected: { pickedAt: 1, changedAt: null } },
    { scenario: 'a JSON string', value: '{"pickedAt":5,"changedAt":6}', expected: { pickedAt: 5, changedAt: 6 } },
  ])('should parse $scenario', ({ value, expected }) => {
    // Act
    const record = parseNameRecord(value);

    // Assert
    expect(record).toEqual(expected);
  });

  it.each([
    { scenario: 'undefined', value: undefined },
    { scenario: 'null', value: null },
    { scenario: 'a number', value: 42 },
    { scenario: 'invalid JSON', value: '{pickedAt' },
    { scenario: 'a JSON string of a non-object', value: '"x"' },
    { scenario: 'a missing pickedAt', value: { changedAt: 1 } },
    { scenario: 'a string pickedAt', value: { pickedAt: '1' } },
    { scenario: 'a non-finite pickedAt', value: { pickedAt: Number.NaN } },
    { scenario: 'a string changedAt', value: { pickedAt: 1, changedAt: 'soon' } },
  ])('should return null for $scenario', ({ value }) => {
    // Act
    const record = parseNameRecord(value);

    // Assert
    expect(record).toBeNull();
  });
});

describe('nameErrorFrom', () => {
  it.each(NAME_ERROR_CODES.map((reason) => ({ reason, ...errorStatusOf(reason) })))(
    'should map a $status response with message $reason to $reason',
    async ({ reason, status, code }) => {
      // Act
      const result = await nameErrorFrom(responseError(status, code, reason));

      // Assert
      expect(result).toBe(reason);
    },
  );

  it.each([
    { scenario: 'null', error: null },
    { scenario: 'a string', error: 'boom' },
    { scenario: 'a TypeError', error: new TypeError('Failed to fetch') },
    { scenario: 'a non-function json', error: { status: 400, json: 'nope' } },
    { scenario: 'an unknown message', error: responseError(400, 3, 'something_else') },
    { scenario: 'a body without message', error: { status: 400, json: async () => ({ code: 3 }) } },
    { scenario: 'a null body', error: { status: 500, json: async () => null } },
    { scenario: 'a rejecting json()', error: { status: 502, json: async () => Promise.reject(new SyntaxError('bad')) } },
  ])('should map $scenario to network', async ({ error }) => {
    // Act
    const result = await nameErrorFrom(error);

    // Assert
    expect(result).toBe('network');
  });
});

describe('loadCachedProfile', () => {
  it('should return the cached profile', async () => {
    // Arrange
    const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(PICKED_PROFILE) });

    // Act
    const profile = await loadCachedProfile(store);

    // Assert
    expect(profile).toEqual(PICKED_PROFILE);
  });

  it('should return a cached profile with a numeric renameAvailableAt', async () => {
    // Arrange
    const cached: Profile = {
      displayName: 'Hamza',
      namePicked: true,
      renameAvailableAt: NOW_MS,
      friendCode: null,
      listed: false,
      presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
    };
    const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(cached) });

    // Act
    const profile = await loadCachedProfile(store);

    // Assert
    expect(profile).toEqual(cached);
  });

  it('should return null when nothing is cached', async () => {
    // Act
    const profile = await loadCachedProfile(memoryKeyValueStore());

    // Assert
    expect(profile).toBeNull();
  });

  it.each([
    { scenario: 'invalid JSON', text: '{oops' },
    { scenario: 'a JSON array', text: '[]' },
    { scenario: 'JSON null', text: 'null' },
    { scenario: 'a missing field', text: JSON.stringify({ displayName: 'Hamza', namePicked: true }) },
    { scenario: 'a blank displayName', text: JSON.stringify({ ...PICKED_PROFILE, displayName: '  ' }) },
    { scenario: 'a non-boolean namePicked', text: JSON.stringify({ ...PICKED_PROFILE, namePicked: 'yes' }) },
    { scenario: 'a string renameAvailableAt', text: JSON.stringify({ ...PICKED_PROFILE, renameAvailableAt: 'later' }) },
  ])('should return null when the cache holds $scenario', async ({ text }) => {
    // Arrange
    const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: text });

    // Act
    const profile = await loadCachedProfile(store);

    // Assert
    expect(profile).toBeNull();
  });

  it('should return null when the store cannot be read', async () => {
    // Arrange
    const store = memoryKeyValueStore();
    store.getItem.mockRejectedValueOnce(new Error('disk'));

    // Act
    const profile = await loadCachedProfile(store);

    // Assert
    expect(profile).toBeNull();
  });

  it('should not go to the network when the backend has a cached profile', async () => {
    // Arrange
    const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(PICKED_PROFILE) });
    const { client, auth } = createBackend({ store });

    // Act
    await loadCachedProfile(store);

    // Assert
    const networkCalls = [auth.signIn, client.getAccount, client.readStorageObjects, client.updateAccount].map(
      (fn) => fn.mock.calls.length,
    );
    expect(networkCalls).toEqual([0, 0, 0, 0]);
  });

  it('should fall back to AsyncStorage when no store is passed', async () => {
    // Act
    const profile = await loadCachedProfile();

    // Assert
    expect(profile).toBeNull();
  });
});

describe('NakamaProfileBackend.getProfile', () => {
  it('should return the display name and namePicked from the account and the name record', async () => {
    // Arrange
    const client = fakeClient({ objects: [nameObject({ pickedAt: NOW_MS - 1000, changedAt: null })] });
    const { backend } = createBackend({ client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile).toEqual(PICKED_PROFILE);
  });

  it('should read the name record of the signed-in user', async () => {
    // Arrange
    const { backend, client } = createBackend();

    // Act
    await backend.getProfile();

    // Assert
    expect(client.readStorageObjects).toHaveBeenCalledWith(expect.any(Session), {
      object_ids: [
        { collection: PROFILE_COLLECTION, key: PROFILE_NAME_KEY, user_id: USER_ID },
        { collection: DIRECTORY_OWN_COLLECTION, key: OWN_CLAIM_KEY_PREFIX + USER_ID, user_id: USER_ID },
        { collection: PROFILE_COLLECTION, key: PROFILE_PREFS_KEY, user_id: USER_ID },
      ],
    });
  });

  it('should write the profile to the cache', async () => {
    // Arrange
    const client = fakeClient({ objects: [nameObject({ pickedAt: 1, changedAt: null })] });
    const { backend, store } = createBackend({ client });

    // Act
    await backend.getProfile();

    // Assert
    expect(cachedProfile(store)).toEqual(PICKED_PROFILE);
  });

  it('should still return the profile when the cache write fails', async () => {
    // Arrange
    const store = memoryKeyValueStore();
    store.setItem.mockRejectedValue(new Error('disk full'));
    const client = fakeClient({ objects: [nameObject({ pickedAt: 1, changedAt: null })] });
    const { backend } = createBackend({ client, store });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile).toEqual(PICKED_PROFILE);
  });

  it('should report namePicked false and fall back to the username for a legacy account', async () => {
    // Arrange
    const client = fakeClient({ account: { user: { id: USER_ID, username: 'Guest-ABCD', display_name: '' } } });
    const { backend } = createBackend({ client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile).toEqual({
      displayName: 'Guest-ABCD',
      namePicked: false,
      renameAvailableAt: null,
      friendCode: null,
      listed: false,
      presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
    });
  });

  it.each([
    { scenario: 'blank display name and username', user: { display_name: ' ', username: '  ' } },
    { scenario: 'no display name or username', user: {} },
    { scenario: 'no user', user: undefined },
  ])('should fall back to Player when the account has $scenario', async ({ user }) => {
    // Arrange
    const client = fakeClient({ account: { user } });
    const { backend } = createBackend({ client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile.displayName).toBe('Player');
  });

  it('should trim the display name', async () => {
    // Arrange
    const client = fakeClient({ account: { user: { username: 'Guest-ABCD', display_name: '  Hamza ' } } });
    const { backend } = createBackend({ client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile.displayName).toBe('Hamza');
  });

  it('should set renameAvailableAt to changedAt plus the cooldown when that is in the future', async () => {
    // Arrange
    const changedAt = NOW_MS - 10 * MINUTE_MS;
    const client = fakeClient({ objects: [nameObject({ pickedAt: 1, changedAt })] });
    const { backend } = createBackend({ client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile.renameAvailableAt).toBe(changedAt + RENAME_COOLDOWN_MS);
  });

  it.each([
    { scenario: 'the cooldown is over', changedAt: NOW_MS - RENAME_COOLDOWN_MS - 1 },
    { scenario: 'the cooldown ends exactly now', changedAt: NOW_MS - RENAME_COOLDOWN_MS },
    { scenario: 'changedAt is null', changedAt: null },
  ])('should set renameAvailableAt to null when $scenario', async ({ changedAt }) => {
    // Arrange
    const client = fakeClient({ objects: [nameObject({ pickedAt: 1, changedAt })] });
    const { backend } = createBackend({ client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile.renameAvailableAt).toBeNull();
  });

  it.each([
    { scenario: 'an object', value: { pickedAt: 1, changedAt: NOW_MS } },
    { scenario: 'a JSON string', value: JSON.stringify({ pickedAt: 1, changedAt: NOW_MS }) },
  ])('should parse the name record stored as $scenario', async ({ value }) => {
    // Arrange
    const client = fakeClient({ objects: [nameObject(value)] });
    const { backend } = createBackend({ client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile).toEqual({
      displayName: 'Hamza',
      namePicked: true,
      renameAvailableAt: NOW_MS + RENAME_COOLDOWN_MS,
      friendCode: null,
      listed: false,
      presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
    });
  });

  it.each([
    { scenario: 'a malformed record', objects: [nameObject({ changedAt: 1 })] },
    { scenario: 'a record of another user', objects: [nameObject({ pickedAt: 1, changedAt: null }, 'user-2')] },
    {
      scenario: 'a record under another key',
      objects: [{ ...nameObject({ pickedAt: 1, changedAt: null }), key: 'avatar' }],
    },
  ])('should report namePicked false for $scenario', async ({ objects }) => {
    // Arrange
    const client = fakeClient({ objects });
    const { backend } = createBackend({ client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect(profile.namePicked).toBe(false);
  });

  it('should reject without writing the cache when the account read fails', async () => {
    // Arrange
    const client = fakeClient();
    client.getAccount.mockRejectedValue(new TypeError('Failed to fetch'));
    const { backend, store } = createBackend({ client });

    // Act
    const result = backend.getProfile();

    // Assert
    await expect(result).rejects.toThrow('Failed to fetch');
    expect(store.setItem).not.toHaveBeenCalled();
  });

  it('should reject when the storage read fails', async () => {
    // Arrange
    const client = fakeClient();
    client.readStorageObjects.mockRejectedValue(new TypeError('Failed to fetch'));
    const { backend } = createBackend({ client });

    // Act
    const result = backend.getProfile();

    // Assert
    await expect(result).rejects.toThrow('Failed to fetch');
  });

  it('should reject when sign-in fails', async () => {
    // Arrange
    const auth = fakeAuth();
    auth.signIn.mockRejectedValue(new TypeError('Failed to fetch'));
    const { backend } = createBackend({ auth });

    // Act
    const result = backend.getProfile();

    // Assert
    await expect(result).rejects.toThrow('Failed to fetch');
  });

  it('should reject when the session has no user id', async () => {
    // Arrange
    const { backend } = createBackend({ auth: fakeAuth(makeSession('')) });

    // Act
    const result = backend.getProfile();

    // Assert
    await expect(result).rejects.toThrow('session has no user id');
  });
});

/*
 * A session whose account is gone (live checks on Nakama 3.40): after a
 * database wipe the token still verifies and only GetAccount notices (404
 * `Account not found.`); a revoked session (account deleted while the server
 * ran) answers 401 `Auth token invalid` everywhere. The backend drops the
 * session and runs the call once more on a new sign-in.
 */
describe('NakamaProfileBackend stale session recovery', () => {
  const STALE_USER = 'user-gone';

  /** An auth whose first signIn hands out the stale session and later ones a fresh one. */
  function renewingAuth() {
    const stale = makeSession(STALE_USER);
    const fresh = makeSession(USER_ID);
    const auth = fakeAuth(fresh);
    auth.signIn.mockResolvedValueOnce({ session: stale });
    return { auth, stale, fresh };
  }

  describe('when getAccount answers 404 once', () => {
    function staleSetup() {
      const { auth, stale, fresh } = renewingAuth();
      const client = fakeClient();
      client.getAccount.mockRejectedValueOnce(responseError(404, 5, 'Account not found.'));
      return { ...createBackend({ auth, client }), stale, fresh };
    }

    it('should drop the stale session', async () => {
      // Arrange
      const { backend, auth, stale } = staleSetup();

      // Act
      await backend.getProfile();

      // Assert
      expect(auth.invalidate.mock.calls).toEqual([[stale]]);
    });

    it('should read the account again with the new session', async () => {
      // Arrange
      const { backend, client, stale, fresh } = staleSetup();

      // Act
      await backend.getProfile();

      // Assert
      expect(client.getAccount.mock.calls.map(([session]) => session)).toEqual([stale, fresh]);
    });

    it('should resolve the profile of the new session', async () => {
      // Arrange
      const { backend } = staleSetup();

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.displayName).toBe('Hamza');
    });
  });

  it('should recover when the storage read answers 401', async () => {
    // Arrange
    const { auth, stale } = renewingAuth();
    const client = fakeClient();
    client.readStorageObjects.mockRejectedValueOnce(responseError(401, 16, 'Auth token invalid'));
    const { backend } = createBackend({ auth, client });

    // Act
    const profile = await backend.getProfile();

    // Assert
    expect([profile.displayName, auth.invalidate.mock.calls]).toEqual(['Hamza', [[stale]]]);
  });

  describe('when every getAccount answers 404', () => {
    function goneSetup() {
      const { auth } = renewingAuth();
      const client = fakeClient();
      client.getAccount.mockRejectedValue(responseError(404, 5, 'Account not found.'));
      return createBackend({ auth, client });
    }

    it('should reject with the second answer', async () => {
      // Arrange
      const { backend } = goneSetup();

      // Act
      const result = backend.getProfile();

      // Assert
      await expect(result).rejects.toMatchObject({ status: 404 });
    });

    it('should retry only once', async () => {
      // Arrange
      const { backend, auth, client } = goneSetup();

      // Act
      await backend.getProfile().catch(() => undefined);

      // Assert
      expect([auth.signIn.mock.calls.length, client.getAccount.mock.calls.length, auth.invalidate.mock.calls.length]).toEqual([
        2, 2, 1,
      ]);
    });
  });

  it.each([
    { scenario: 'a network error', error: new TypeError('Failed to fetch') },
    { scenario: 'a 500', error: responseError(500, 13, 'Internal error') },
  ])('should not drop the session on $scenario', async ({ error }) => {
    // Arrange
    const client = fakeClient();
    client.getAccount.mockRejectedValueOnce(error);
    const { backend, auth } = createBackend({ client });

    // Act
    await backend.getProfile().catch(() => undefined);

    // Assert
    expect([auth.invalidate.mock.calls.length, auth.signIn.mock.calls.length]).toEqual([0, 1]);
  });

  it('should save a new name with the new session when updateAccount answers 401', async () => {
    // Arrange
    const { auth, stale, fresh } = renewingAuth();
    const client = fakeClient();
    client.updateAccount.mockRejectedValueOnce(responseError(401, 16, 'Auth token invalid'));
    const { backend } = createBackend({ auth, client });

    // Act
    const result = await backend.setDisplayName('Hamza');

    // Assert
    expect([result.ok, client.updateAccount.mock.calls.map(([session]) => session)]).toEqual([true, [stale, fresh]]);
  });
});

describe('NakamaProfileBackend.setDisplayName', () => {
  describe('server errors', () => {
    it.each(NAME_ERROR_CODES.map((reason) => ({ reason, ...errorStatusOf(reason) })))(
      'should return $reason when the server rejects with a $status and that message',
      async ({ reason, status, code }) => {
        // Arrange
        const client = fakeClient();
        client.updateAccount.mockRejectedValue(responseError(status, code, reason));
        const { backend } = createBackend({ client });

        // Act
        const result = await backend.setDisplayName('Hamza');

        // Assert
        expect(result).toEqual({ ok: false, reason });
      },
    );

    it.each([
      { scenario: 'an unknown message', error: responseError(400, 3, 'name_unknown') },
      { scenario: 'a non-Response error', error: new TypeError('Failed to fetch') },
      { scenario: 'a rejecting json()', error: { status: 500, json: async () => Promise.reject(new SyntaxError('x')) } },
    ])('should return network for $scenario', async ({ error }) => {
      // Arrange
      const client = fakeClient();
      client.updateAccount.mockRejectedValue(error);
      const { backend } = createBackend({ client });

      // Act
      const result = await backend.setDisplayName('Hamza');

      // Assert
      expect(result).toEqual({ ok: false, reason: 'network' });
    });

    it('should return network when sign-in fails', async () => {
      // Arrange
      const auth = fakeAuth();
      auth.signIn.mockRejectedValue(new TypeError('Failed to fetch'));
      const { backend } = createBackend({ auth });

      // Act
      const result = await backend.setDisplayName('Hamza');

      // Assert
      expect(result).toEqual({ ok: false, reason: 'network' });
    });

    it('should not re-read the profile for errors other than name_rate_limited', async () => {
      // Arrange
      const client = fakeClient();
      client.updateAccount.mockRejectedValue(responseError(400, 3, 'name_not_allowed'));
      const { backend } = createBackend({ client });

      // Act
      await backend.setDisplayName('Hamza');

      // Assert
      expect(client.getAccount).not.toHaveBeenCalled();
    });
  });

  describe('name_rate_limited', () => {
    const changedAt = NOW_MS - 10 * MINUTE_MS;

    function rateLimitedClient() {
      const client = fakeClient({ objects: [nameObject({ pickedAt: 1, changedAt })] });
      client.updateAccount.mockRejectedValue(responseError(429, 8, 'name_rate_limited'));
      return client;
    }

    it('should refresh the cached profile with the new renameAvailableAt', async () => {
      // Arrange
      const { backend, store } = createBackend({ client: rateLimitedClient() });

      // Act
      await backend.setDisplayName('Hamza');

      // Assert
      expect(cachedProfile(store)).toEqual({ ...PICKED_PROFILE, renameAvailableAt: changedAt + RENAME_COOLDOWN_MS });
    });

    it('should still return name_rate_limited', async () => {
      // Arrange
      const { backend } = createBackend({ client: rateLimitedClient() });

      // Act
      const result = await backend.setDisplayName('Hamza');

      // Assert
      expect(result).toEqual({ ok: false, reason: 'name_rate_limited' });
    });

    it('should return name_rate_limited when the refresh fails too', async () => {
      // Arrange
      const client = rateLimitedClient();
      client.getAccount.mockRejectedValue(new TypeError('Failed to fetch'));
      const { backend } = createBackend({ client });

      // Act
      const result = await backend.setDisplayName('Hamza');

      // Assert
      expect(result).toEqual({ ok: false, reason: 'name_rate_limited' });
    });
  });

  describe('client-side format check', () => {
    it.each([
      { scenario: 'too short', name: 'ab', reason: 'name_too_short' },
      { scenario: 'with a tatweel', name: 'حمـزة', reason: 'name_bad_chars' },
      { scenario: '17 characters long', name: 'a'.repeat(17), reason: 'name_too_long' },
    ])('should return $reason for a name $scenario', async ({ name, reason }) => {
      // Arrange
      const { backend } = createBackend();

      // Act
      const result = await backend.setDisplayName(name);

      // Assert
      expect(result).toEqual({ ok: false, reason });
    });

    it.each(['ab', 'حمـزة', 'a'.repeat(17)])('should neither sign in nor update the account for %j', async (name) => {
      // Arrange
      const { backend, client, auth } = createBackend();

      // Act
      await backend.setDisplayName(name);

      // Assert
      expect([auth.signIn.mock.calls.length, client.updateAccount.mock.calls.length]).toEqual([0, 0]);
    });
  });

  describe('success', () => {
    function savingClient() {
      const client = fakeClient({ account: { user: { username: 'Guest-ABCD', display_name: '' } } });
      client.updateAccount.mockImplementation(async (_session, request) => {
        client.state.account = { user: { username: 'Guest-ABCD', display_name: request.display_name } };
        client.state.objects = [nameObject({ pickedAt: NOW_MS, changedAt: null })];
        return true;
      });
      return client;
    }

    it('should send the normalized display name', async () => {
      // Arrange
      const { backend, client } = createBackend({ client: savingClient() });

      // Act
      await backend.setDisplayName('  Ab  cd ');

      // Assert
      expect(client.updateAccount).toHaveBeenCalledWith(expect.any(Session), { display_name: 'Ab cd' });
    });

    it('should return the re-read profile', async () => {
      // Arrange
      const { backend } = createBackend({ client: savingClient() });

      // Act
      const result = await backend.setDisplayName('  Ab  cd ');

      // Assert
      expect(result).toEqual({
        ok: true,
        profile: {
          displayName: 'Ab cd',
          namePicked: true,
          renameAvailableAt: null,
          friendCode: null,
          listed: false,
          presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
        },
      });
    });

    it('should re-read the account after the update', async () => {
      // Arrange
      const { backend, client } = createBackend({ client: savingClient() });

      // Act
      await backend.setDisplayName('Ab cd');

      // Assert
      expect(client.getAccount.mock.invocationCallOrder[0]).toBeGreaterThan(
        client.updateAccount.mock.invocationCallOrder[0],
      );
    });

    it('should write the re-read profile to the cache', async () => {
      // Arrange
      const { backend, store } = createBackend({ client: savingClient() });

      // Act
      await backend.setDisplayName('Ab cd');

      // Assert
      expect(cachedProfile(store)).toEqual({
        displayName: 'Ab cd',
        namePicked: true,
        renameAvailableAt: null,
        friendCode: null,
        listed: false,
        presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
      });
    });
  });

  describe('saved but the re-read fails', () => {
    function rereadFailingClient() {
      const client = fakeClient();
      client.getAccount.mockRejectedValue(new TypeError('Failed to fetch'));
      return client;
    }

    it('should return ok with the normalized name and no cooldown on a first pick', async () => {
      // Arrange
      const { backend } = createBackend({ client: rereadFailingClient() });

      // Act
      const result = await backend.setDisplayName('  Ab  cd ');

      // Assert
      expect(result).toEqual({
        ok: true,
        profile: {
          displayName: 'Ab cd',
          namePicked: true,
          renameAvailableAt: null,
          friendCode: null,
          listed: false,
          presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
        },
      });
    });

    it('should start an approximate local cooldown on a rename after a first pick', async () => {
      // Arrange
      const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(PICKED_PROFILE) });
      const { backend } = createBackend({ client: rereadFailingClient(), store });

      // Act
      const result = await backend.setDisplayName('Ab cd');

      // Assert
      expect(result).toEqual({
        ok: true,
        profile: {
          displayName: 'Ab cd',
          namePicked: true,
          renameAvailableAt: NOW_MS + RENAME_COOLDOWN_MS,
          friendCode: null,
          listed: false,
          presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
        },
      });
    });

    it('should not start a cooldown when the cached profile had no name picked', async () => {
      // Arrange
      const cached: Profile = {
        displayName: 'Guest-ABCD',
        namePicked: false,
        renameAvailableAt: null,
        friendCode: null,
        listed: false,
        presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
      };
      const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(cached) });
      const { backend } = createBackend({ client: rereadFailingClient(), store });

      // Act
      const result = await backend.setDisplayName('Ab cd');

      // Assert
      expect(result).toEqual({
        ok: true,
        profile: {
          displayName: 'Ab cd',
          namePicked: true,
          renameAvailableAt: null,
          friendCode: null,
          listed: false,
          presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
        },
      });
    });

    it('should cache the profile it reports', async () => {
      // Arrange
      const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(PICKED_PROFILE) });
      const { backend } = createBackend({ client: rereadFailingClient(), store });

      // Act
      await backend.setDisplayName('Ab cd');

      // Assert
      expect(cachedProfile(store)).toEqual({
        displayName: 'Ab cd',
        namePicked: true,
        renameAvailableAt: NOW_MS + RENAME_COOLDOWN_MS,
        friendCode: null,
        listed: false,
        presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
      });
    });

    it('should keep the cached friend code', async () => {
      // Arrange
      const cached: Profile = { ...PICKED_PROFILE, friendCode: FRIEND_CODE };
      const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(cached) });
      const { backend } = createBackend({ client: rereadFailingClient(), store });

      // Act
      const result = await backend.setDisplayName('Ab cd');

      // Assert
      expect(result.ok && result.profile.friendCode).toBe(FRIEND_CODE);
    });
  });
});

describe('friendCodeOf', () => {
  it.each([
    { scenario: 'a normalized code', input: 'K7M2QXAB' },
    { scenario: 'lowercase', input: 'k7m2qxab' },
    { scenario: 'lowercase with a dash', input: 'k7m2-qxab' },
    { scenario: 'surrounding and inner spaces', input: ' K7M2 QXAB ' },
  ])('should return the normalized code for $scenario', ({ input }) => {
    // Act
    const code = friendCodeOf(input);

    // Assert
    expect(code).toBe(FRIEND_CODE);
  });

  it.each([
    { scenario: 'a legacy Guest-XXXX username', input: 'Guest-ABCD' },
    { scenario: 'a random Nakama username', input: 'aBcDeFgHiJ' },
    { scenario: 'a code that is too short', input: 'K7M2QXA' },
    { scenario: 'a code that is too long', input: 'K7M2QXABC' },
    { scenario: 'a code with an ambiguous symbol', input: 'K7M2QXA0' },
    { scenario: 'an empty string', input: '' },
    { scenario: 'undefined', input: undefined },
    { scenario: 'null', input: null },
    { scenario: 'a number', input: 12345678 },
    { scenario: 'an object', input: { username: 'K7M2QXAB' } },
  ])('should return null for $scenario', ({ input }) => {
    // Act
    const code = friendCodeOf(input);

    // Assert
    expect(code).toBeNull();
  });
});

describe('Profile.friendCode', () => {
  describe('getProfile', () => {
    it('should report the friend code from a code username', async () => {
      // Arrange
      const client = fakeClient({ account: { user: { id: USER_ID, username: FRIEND_CODE, display_name: 'Hamza' } } });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.friendCode).toBe(FRIEND_CODE);
    });

    it('should normalize a lowercase dashed username', async () => {
      // Arrange
      const client = fakeClient({ account: { user: { id: USER_ID, username: 'k7m2-qxab', display_name: 'Hamza' } } });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.friendCode).toBe(FRIEND_CODE);
    });

    it.each([
      { scenario: 'a legacy Guest-XXXX username', user: { id: USER_ID, username: 'Guest-ABCD', display_name: 'Hamza' } },
      { scenario: 'no username', user: { id: USER_ID, display_name: 'Hamza' } },
      { scenario: 'a non-string username', user: { id: USER_ID, username: 42 as unknown as string, display_name: 'Hamza' } },
    ])('should report null for $scenario', async ({ user }) => {
      // Arrange
      const client = fakeClient({ account: { user } });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.friendCode).toBeNull();
    });

    it('should report null when the account has no user', async () => {
      // Arrange
      const client = fakeClient({ account: {} });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.friendCode).toBeNull();
    });

    it('should cache the friend code', async () => {
      // Arrange
      const client = fakeClient({ account: { user: { id: USER_ID, username: FRIEND_CODE, display_name: 'Hamza' } } });
      const { backend, store } = createBackend({ client });

      // Act
      await backend.getProfile();

      // Assert
      expect(cachedProfile(store)).toEqual({ ...PICKED_PROFILE, namePicked: false, friendCode: FRIEND_CODE });
    });
  });

  describe('loadCachedProfile', () => {
    it('should read a cached friend code back', async () => {
      // Arrange
      const cached: Profile = { ...PICKED_PROFILE, friendCode: FRIEND_CODE };
      const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(cached) });

      // Act
      const profile = await loadCachedProfile(store);

      // Assert
      expect(profile?.friendCode).toBe(FRIEND_CODE);
    });

    it('should read an old cache entry without friendCode as null', async () => {
      // Arrange
      const old = { displayName: 'Hamza', namePicked: true, renameAvailableAt: null };
      const store = memoryKeyValueStore({ [PROFILE_CACHE_KEY]: JSON.stringify(old) });

      // Act
      const profile = await loadCachedProfile(store);

      // Assert
      expect(profile).toEqual({
        ...old,
        friendCode: null,
        listed: false,
        presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
      });
    });

    it('should read a cached friendCode that is not a code as null', async () => {
      // Arrange
      const store = memoryKeyValueStore({
        [PROFILE_CACHE_KEY]: JSON.stringify({ ...PICKED_PROFILE, friendCode: 'Guest-ABCD' }),
      });

      // Act
      const profile = await loadCachedProfile(store);

      // Assert
      expect(profile?.friendCode).toBeNull();
    });
  });
});

describe('Profile.listed and Profile.presenceVisibility', () => {
  describe('getProfile', () => {
    it('should report listed true when the own-claim record is present', async () => {
      // Arrange
      const client = fakeClient({ objects: [ownClaimObject(VALID_OWN_CLAIM)] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.listed).toBe(true);
    });

    it('should parse an own-claim stored as a JSON string', async () => {
      // Arrange
      const client = fakeClient({ objects: [ownClaimObject(JSON.stringify(VALID_OWN_CLAIM))] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.listed).toBe(true);
    });

    it('should ignore an own-claim record of another user', async () => {
      // Arrange
      const client = fakeClient({ objects: [ownClaimObject(VALID_OWN_CLAIM, 'user-2')] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.listed).toBe(false);
    });

    it('should report the visibility chosen in the prefs record', async () => {
      // Arrange
      const client = fakeClient({ objects: [prefsObject(NOBODY_PREFS)] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.presenceVisibility).toBe('nobody');
    });

    it.each([
      { scenario: 'everyone', visibility: 'everyone' },
      { scenario: 'nobody', visibility: 'nobody' },
    ])('should report $scenario when the prefs record says so', async ({ visibility }) => {
      // Arrange
      const client = fakeClient({ objects: [prefsObject({ visibility, updatedAt: NOW_MS })] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.presenceVisibility).toBe(visibility);
    });

    it('should report everyone when there is no prefs record', async () => {
      // Arrange
      const { backend } = createBackend();

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.presenceVisibility).toBe(DEFAULT_PRESENCE_VISIBILITY);
    });

    it('should report listed false when there is no own-claim record', async () => {
      // Arrange
      const { backend } = createBackend();

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.listed).toBe(false);
    });

    it('should report listed false when the own-claim record is a JSON array', async () => {
      // Arrange
      const client = fakeClient({ objects: [ownClaimObject([])] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.listed).toBe(false);
    });

    it.each([
      { scenario: 'invalid JSON', value: '{prefs' },
      { scenario: 'a JSON array', value: [] },
      { scenario: 'a missing updatedAt', value: { visibility: 'nobody' } },
      { scenario: 'a missing visibility', value: { updatedAt: NOW_MS } },
    ])('should report everyone when the prefs record is $scenario', async ({ value }) => {
      // Arrange
      const client = fakeClient({ objects: [prefsObject(value)] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.presenceVisibility).toBe(DEFAULT_PRESENCE_VISIBILITY);
    });

    it.each([
      { scenario: 'a malformed object', value: { claimKey: 'n1', fold: 'hamza' } },
      { scenario: 'invalid JSON', value: '{claimKey' },
    ])('should report listed false when the own-claim is $scenario', async ({ value }) => {
      // Arrange
      const client = fakeClient({ objects: [ownClaimObject(value)] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.listed).toBe(false);
    });

    it.each([
      { scenario: 'an unknown visibility', value: { visibility: 'sometimes', updatedAt: NOW_MS } },
      { scenario: 'a non-numeric updatedAt', value: { visibility: 'nobody', updatedAt: 'now' } },
    ])('should report everyone when the prefs hold $scenario', async ({ value }) => {
      // Arrange
      const client = fakeClient({ objects: [prefsObject(value)] });
      const { backend } = createBackend({ client });

      // Act
      const profile = await backend.getProfile();

      // Assert
      expect(profile.presenceVisibility).toBe(DEFAULT_PRESENCE_VISIBILITY);
    });
  });
});
