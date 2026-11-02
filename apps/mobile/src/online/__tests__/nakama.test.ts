import { Session, type Client } from '@heroiclabs/nakama-js';

import { DEVICE_ID_KEY, type DeviceIdStore } from '../deviceId';
import {
  GuestAuth,
  createNakamaBackend,
  createPrivateTable,
  joinByCode,
  rpcErrorMessage,
  uuidFromBytes,
  type AuthLog,
  type DevicePlatform,
  type KeyValueStore,
} from '../nakama';
import { CreatePrivateTableError, isCreatePrivateTableError } from '../roomErrors';

describe('uuidFromBytes', () => {
  it('formats 16 bytes as a v4 UUID with the RFC 4122 variant', () => {
    const bytes = new Uint8Array(16).fill(0xff);
    expect(uuidFromBytes(bytes)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(uuidFromBytes(new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
  });
});

/** Keys GuestAuth uses in its KeyValueStore (private in nakama.ts, but part of what's on disk). */
const SESSION_KEY = 'chkobba.online.session';
const MIGRATED_KEY = 'chkobba.online.deviceIdMigrated';

const NOW_MS = 1_800_000_000_000;
const NOW_SEC = NOW_MS / 1000;
const UUID = '0f0f0f0f-1e1e-4d2d-8c3c-4b4b4b4b4b4b';
const LEGACY_ID = 'chk-11111111-2222-4333-8444-555555555555';
const KEYCHAIN_ID = 'chk-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const DERIVED_ID = `chk-a-${'ab12'.repeat(16)}`;

function base64Json(value: object): string {
  return btoa(JSON.stringify(value));
}

/** A real nakama-js Session whose JWT carries `uid` and expires an hour after NOW. */
function makeSession(userId: string): Session {
  const token = `h.${base64Json({ uid: userId, usn: 'Guest', exp: NOW_SEC + 3600 })}.s`;
  const refresh = `h.${base64Json({ uid: userId, exp: NOW_SEC + 86_400 })}.s`;
  return new Session(token, refresh, false);
}

function storedSession(userId: string): string {
  const session = makeSession(userId);
  return JSON.stringify({ token: session.token, refreshToken: session.refresh_token });
}

/** A nakama-js rejection: the fetch Response, of which only `.status` matters. */
function httpError(status: number): { status: number; statusText: string } {
  return { status, statusText: `HTTP ${status}` };
}

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

/** iOS / web style: one slot (Keychain or localStorage). */
function memoryDeviceIdStore(initial: string | null = null) {
  let value = initial;
  const store = {
    load: jest.fn(async () => value),
    save: jest.fn(async (id: string) => {
      value = id;
    }),
  };
  return store satisfies DeviceIdStore;
}

/** Android style: a derived id (null without ANDROID_ID) and a saved fallback that `load` prefers. */
function androidDeviceIdStore(derived: string | null) {
  let fallback: string | null = null;
  const store = {
    load: jest.fn(async () => fallback ?? derived),
    save: jest.fn(async (id: string) => {
      if (id !== derived) fallback = id;
    }),
  };
  return store satisfies DeviceIdStore;
}

function fakeClient() {
  return {
    authenticateDevice: jest.fn(async (id: string, _create?: boolean, _username?: string) => makeSession(`user-of-${id}`)),
    linkDevice: jest.fn(async (_session: Session, _request: { id?: string }) => true),
    sessionRefresh: jest.fn(async (session: Session) => session),
    getAccount: jest.fn(async (session: Session) => ({ user: { id: session.user_id } })),
  };
}

type FakeClient = ReturnType<typeof fakeClient>;

interface Setup {
  readonly platform: DevicePlatform;
  readonly deviceIdStore: DeviceIdStore;
  readonly store: KeyValueStore;
  readonly client: FakeClient;
  readonly log?: AuthLog;
}

function createAuth({ platform, deviceIdStore, store, client, log = jest.fn() }: Setup): GuestAuth {
  return new GuestAuth({
    client: client as unknown as Client,
    store,
    deviceIdStore,
    platform,
    log,
    uuid: () => UUID,
    now: () => NOW_MS,
  });
}

/** Ids passed to `authenticateDevice` with create=true, i.e. the id the guest signs in with. */
function signInIds(client: FakeClient): string[] {
  return client.authenticateDevice.mock.calls.filter(([, create]) => create === true).map(([id]) => id);
}

describe('GuestAuth device id', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fresh install', () => {
    it.each<DevicePlatform>(['ios', 'web'])('should sign in with a new chk-<uuid> id on %s', async (platform) => {
      // Arrange
      const client = fakeClient();
      const auth = createAuth({ platform, deviceIdStore: memoryDeviceIdStore(), store: memoryKeyValueStore(), client });

      // Act
      await auth.signIn();

      // Assert
      expect(signInIds(client)).toEqual([`chk-${UUID}`]);
    });

    it('should save the new id in the device id store', async () => {
      // Arrange
      const deviceIdStore = memoryDeviceIdStore();
      const auth = createAuth({ platform: 'ios', deviceIdStore, store: memoryKeyValueStore(), client: fakeClient() });

      // Act
      await auth.signIn();

      // Assert
      expect(deviceIdStore.save).toHaveBeenCalledWith(`chk-${UUID}`);
    });

    it('should set the migrated flag', async () => {
      // Arrange
      const store = memoryKeyValueStore();
      const auth = createAuth({ platform: 'ios', deviceIdStore: memoryDeviceIdStore(), store, client: fakeClient() });

      // Act
      await auth.signIn();

      // Assert
      expect(store.data.get(MIGRATED_KEY)).toBe('1');
    });

    it('should not write the new id to the legacy AsyncStorage key', async () => {
      // Arrange
      const store = memoryKeyValueStore();
      const auth = createAuth({ platform: 'ios', deviceIdStore: memoryDeviceIdStore(), store, client: fakeClient() });

      // Act
      await auth.signIn();

      // Assert
      expect(store.data.has(DEVICE_ID_KEY)).toBe(false);
    });
  });

  describe('reinstall (durable id present, AsyncStorage empty)', () => {
    it.each([
      { platform: 'ios' as const, makeStore: () => memoryDeviceIdStore(KEYCHAIN_ID), durable: KEYCHAIN_ID },
      { platform: 'android' as const, makeStore: () => androidDeviceIdStore(DERIVED_ID), durable: DERIVED_ID },
    ])('should sign in with the durable id on $platform', async ({ platform, makeStore, durable }) => {
      // Arrange
      const client = fakeClient();
      const auth = createAuth({ platform, deviceIdStore: makeStore(), store: memoryKeyValueStore(), client });

      // Act
      await auth.signIn();

      // Assert
      expect(signInIds(client)).toEqual([durable]);
    });

    it.each([
      { platform: 'ios' as const, makeStore: () => memoryDeviceIdStore(KEYCHAIN_ID) },
      { platform: 'android' as const, makeStore: () => androidDeviceIdStore(DERIVED_ID) },
    ])('should neither save an id nor link a device on $platform', async ({ platform, makeStore }) => {
      // Arrange
      const client = fakeClient();
      const deviceIdStore = makeStore();
      const auth = createAuth({ platform, deviceIdStore, store: memoryKeyValueStore(), client });

      // Act
      await auth.signIn();

      // Assert
      expect({ saves: deviceIdStore.save.mock.calls.length, links: client.linkDevice.mock.calls.length }).toEqual({
        saves: 0,
        links: 0,
      });
    });
  });

  describe('legacy upgrade on iOS', () => {
    it('should save the legacy id into the empty Keychain', async () => {
      // Arrange
      const deviceIdStore = memoryDeviceIdStore();
      const store = memoryKeyValueStore({ [DEVICE_ID_KEY]: LEGACY_ID });
      const auth = createAuth({ platform: 'ios', deviceIdStore, store, client: fakeClient() });

      // Act
      await auth.signIn();

      // Assert
      expect(deviceIdStore.save.mock.calls).toEqual([[LEGACY_ID]]);
    });

    it('should sign in with the legacy id', async () => {
      // Arrange
      const client = fakeClient();
      const store = memoryKeyValueStore({ [DEVICE_ID_KEY]: LEGACY_ID });
      const auth = createAuth({ platform: 'ios', deviceIdStore: memoryDeviceIdStore(), store, client });

      // Act
      await auth.signIn();

      // Assert
      expect(signInIds(client)).toEqual([LEGACY_ID]);
    });

    it('should set the migrated flag and keep the legacy value for rollback', async () => {
      // Arrange
      const store = memoryKeyValueStore({ [DEVICE_ID_KEY]: LEGACY_ID });
      const auth = createAuth({ platform: 'ios', deviceIdStore: memoryDeviceIdStore(), store, client: fakeClient() });

      // Act
      await auth.signIn();

      // Assert
      expect({ flag: store.data.get(MIGRATED_KEY), legacy: store.data.get(DEVICE_ID_KEY) }).toEqual({
        flag: '1',
        legacy: LEGACY_ID,
      });
    });

    it('should ignore a malformed legacy value and create a new id', async () => {
      // Arrange
      const client = fakeClient();
      const store = memoryKeyValueStore({ [DEVICE_ID_KEY]: 'not-ours' });
      const auth = createAuth({ platform: 'ios', deviceIdStore: memoryDeviceIdStore(), store, client });

      // Act
      await auth.signIn();

      // Assert
      expect(signInIds(client)).toEqual([`chk-${UUID}`]);
    });

    it('should sign in with the Keychain id when legacy and Keychain differ', async () => {
      // Arrange
      const client = fakeClient();
      const store = memoryKeyValueStore({ [DEVICE_ID_KEY]: LEGACY_ID });
      const auth = createAuth({ platform: 'ios', deviceIdStore: memoryDeviceIdStore(KEYCHAIN_ID), store, client });

      // Act
      await auth.signIn();

      // Assert
      expect(signInIds(client)).toEqual([KEYCHAIN_ID]);
    });

    it('should drop the cached session when legacy and Keychain differ', async () => {
      // Arrange
      const client = fakeClient();
      const store = memoryKeyValueStore({
        [DEVICE_ID_KEY]: LEGACY_ID,
        [SESSION_KEY]: storedSession('legacy-account'),
      });
      const auth = createAuth({ platform: 'ios', deviceIdStore: memoryDeviceIdStore(KEYCHAIN_ID), store, client });

      // Act
      const { session } = await auth.signIn();

      // Assert
      expect(session.user_id).toBe(`user-of-${KEYCHAIN_ID}`);
    });

    it('should keep the cached session when legacy and Keychain hold the same id', async () => {
      // Arrange
      const client = fakeClient();
      const store = memoryKeyValueStore({
        [DEVICE_ID_KEY]: KEYCHAIN_ID,
        [SESSION_KEY]: storedSession('same-account'),
      });
      const auth = createAuth({ platform: 'ios', deviceIdStore: memoryDeviceIdStore(KEYCHAIN_ID), store, client });

      // Act
      const { session } = await auth.signIn();

      // Assert
      expect(session.user_id).toBe('same-account');
    });
  });

  describe('legacy upgrade on Android', () => {
    function androidSetup(derived: string | null = DERIVED_ID) {
      const client = fakeClient();
      const deviceIdStore = androidDeviceIdStore(derived);
      const store = memoryKeyValueStore({ [DEVICE_ID_KEY]: LEGACY_ID });
      const log = jest.fn<void, [string]>();
      const setup: Setup = { platform: 'android', deviceIdStore, store, client, log };
      return { client, deviceIdStore, store, log, setup };
    }

    describe('when linkDevice succeeds', () => {
      it('should sign in to the legacy account without creating one', async () => {
        // Arrange
        const { client, setup } = androidSetup();
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(client.authenticateDevice).toHaveBeenCalledWith(LEGACY_ID, false);
      });

      it('should link the durable id to the legacy session', async () => {
        // Arrange
        const { client, setup } = androidSetup();
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(client.linkDevice).toHaveBeenCalledWith(
          expect.objectContaining({ user_id: `user-of-${LEGACY_ID}` }),
          { id: DERIVED_ID },
        );
      });

      it('should return the legacy account session', async () => {
        // Arrange
        const { setup } = androidSetup();
        const auth = createAuth(setup);

        // Act
        const { session } = await auth.signIn();

        // Assert
        expect(session.user_id).toBe(`user-of-${LEGACY_ID}`);
      });

      it('should use the durable id from then on', async () => {
        // Arrange
        const { client, setup } = androidSetup();
        const auth = createAuth(setup);
        await auth.signIn();
        await auth.signOut();

        // Act
        await auth.signIn();

        // Assert
        expect(signInIds(client)).toEqual([DERIVED_ID]);
      });

      it('should set the migrated flag', async () => {
        // Arrange
        const { store, setup } = androidSetup();
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(store.data.get(MIGRATED_KEY)).toBe('1');
      });
    });

    describe('when linkDevice answers 409 (durable id owned by another account)', () => {
      function conflictSetup() {
        const context = androidSetup();
        context.client.linkDevice.mockRejectedValue(httpError(409));
        return context;
      }

      it('should save the legacy id as the fallback', async () => {
        // Arrange
        const { deviceIdStore, setup } = conflictSetup();
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(deviceIdStore.save.mock.calls).toEqual([[LEGACY_ID]]);
      });

      it('should log a message without any device id', async () => {
        // Arrange
        const { log, setup } = conflictSetup();
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        const messages = log.mock.calls.map(([message]) => message);
        expect({
          count: messages.length,
          leaksId: messages.some((m) => m.includes(LEGACY_ID) || m.includes(DERIVED_ID) || m.includes('chk-')),
        }).toEqual({ count: 1, leaksId: false });
      });

      it('should use the legacy id from then on', async () => {
        // Arrange
        const { client, setup } = conflictSetup();
        const auth = createAuth(setup);
        await auth.signIn();
        await auth.signOut();

        // Act
        await auth.signIn();

        // Assert
        expect(signInIds(client)).toEqual([LEGACY_ID]);
      });

      it('should set the migrated flag', async () => {
        // Arrange
        const { store, setup } = conflictSetup();
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(store.data.get(MIGRATED_KEY)).toBe('1');
      });

      it('should not retry the link on the next launch', async () => {
        // Arrange
        const { client, setup } = conflictSetup();
        await createAuth(setup).signIn();

        // Act
        await createAuth(setup).signIn();

        // Assert
        expect(client.linkDevice).toHaveBeenCalledTimes(1);
      });

      it('should sign in with the saved legacy fallback on the next launch', async () => {
        // Arrange
        const { client, store, setup } = conflictSetup();
        await createAuth(setup).signIn();
        await store.removeItem(SESSION_KEY);

        // Act
        await createAuth(setup).signIn();

        // Assert
        expect(signInIds(client)).toEqual([LEGACY_ID]);
      });
    });

    describe('when the legacy sign-in answers 404 (legacy account gone)', () => {
      it('should sign in with the durable id', async () => {
        // Arrange
        const { client, setup } = androidSetup();
        client.authenticateDevice.mockRejectedValueOnce(httpError(404));
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(signInIds(client)).toEqual([DERIVED_ID]);
      });

      it('should not link a device', async () => {
        // Arrange
        const { client, setup } = androidSetup();
        client.authenticateDevice.mockRejectedValueOnce(httpError(404));
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(client.linkDevice).not.toHaveBeenCalled();
      });

      it('should set the migrated flag', async () => {
        // Arrange
        const { client, store, setup } = androidSetup();
        client.authenticateDevice.mockRejectedValueOnce(httpError(404));
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(store.data.get(MIGRATED_KEY)).toBe('1');
      });
    });

    describe.each([
      { scenario: 'the legacy sign-in fails with a network error', fail: (c: FakeClient) => c.authenticateDevice.mockRejectedValueOnce(new TypeError('Network request failed')) },
      { scenario: 'the legacy sign-in answers 500', fail: (c: FakeClient) => c.authenticateDevice.mockRejectedValueOnce(httpError(500)) },
      { scenario: 'linkDevice fails with a network error', fail: (c: FakeClient) => c.linkDevice.mockRejectedValueOnce(new TypeError('Network request failed')) },
      { scenario: 'linkDevice answers 500', fail: (c: FakeClient) => c.linkDevice.mockRejectedValueOnce(httpError(500)) },
    ])('when $scenario', ({ fail }) => {
      it('should use the legacy id for this launch', async () => {
        // Arrange
        const { client, setup } = androidSetup();
        fail(client);
        const auth = createAuth(setup);
        await auth.signIn();
        await auth.signOut();

        // Act
        await auth.signIn();

        // Assert
        expect(signInIds(client).pop()).toBe(LEGACY_ID);
      });

      it('should not set the migrated flag', async () => {
        // Arrange
        const { client, store, setup } = androidSetup();
        fail(client);
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(store.data.has(MIGRATED_KEY)).toBe(false);
      });

      it('should not save anything in the device id store', async () => {
        // Arrange
        const { client, deviceIdStore, setup } = androidSetup();
        fail(client);
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(deviceIdStore.save).not.toHaveBeenCalled();
      });

      it('should try the migration again on the next launch', async () => {
        // Arrange
        const { client, setup } = androidSetup();
        fail(client);
        await createAuth(setup).signIn();

        // Act
        await createAuth(setup).signIn();

        // Assert
        expect(client.authenticateDevice.mock.calls.filter(([, create]) => create === false)).toHaveLength(2);
      });
    });

    describe('when the device has no ANDROID_ID', () => {
      it('should save the legacy id as the fallback', async () => {
        // Arrange
        const { deviceIdStore, setup } = androidSetup(null);
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(deviceIdStore.save.mock.calls).toEqual([[LEGACY_ID]]);
      });

      it('should sign in with the legacy id without linking', async () => {
        // Arrange
        const { client, setup } = androidSetup(null);
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect({ ids: signInIds(client), links: client.linkDevice.mock.calls.length }).toEqual({
          ids: [LEGACY_ID],
          links: 0,
        });
      });

      it('should set the migrated flag', async () => {
        // Arrange
        const { store, setup } = androidSetup(null);
        const auth = createAuth(setup);

        // Act
        await auth.signIn();

        // Assert
        expect(store.data.get(MIGRATED_KEY)).toBe('1');
      });
    });
  });

  describe('when the migrated flag is set', () => {
    function flaggedSetup(platform: DevicePlatform) {
      const client = fakeClient();
      const deviceIdStore = platform === 'android' ? androidDeviceIdStore(DERIVED_ID) : memoryDeviceIdStore(KEYCHAIN_ID);
      const store = memoryKeyValueStore({ [DEVICE_ID_KEY]: LEGACY_ID, [MIGRATED_KEY]: '1' });
      return { client, deviceIdStore, store, setup: { platform, deviceIdStore, store, client } };
    }

    it.each<DevicePlatform>(['android', 'ios'])('should never read the legacy id on %s', async (platform) => {
      // Arrange
      const { store, setup } = flaggedSetup(platform);
      const auth = createAuth(setup);

      // Act
      await auth.signIn();

      // Assert
      expect(store.getItem).not.toHaveBeenCalledWith(DEVICE_ID_KEY);
    });

    it('should never call linkDevice', async () => {
      // Arrange
      const { client, setup } = flaggedSetup('android');
      const auth = createAuth(setup);

      // Act
      await auth.signIn();

      // Assert
      expect(client.linkDevice).not.toHaveBeenCalled();
    });

    it('should sign in with the durable id only', async () => {
      // Arrange
      const { client, setup } = flaggedSetup('android');
      const auth = createAuth(setup);

      // Act
      await auth.signIn();

      // Assert
      expect(client.authenticateDevice.mock.calls.map(([id, create]) => [id, create])).toEqual([[DERIVED_ID, true]]);
    });

    it('should create and save a new id when the durable store is empty', async () => {
      // Arrange
      const client = fakeClient();
      const deviceIdStore = memoryDeviceIdStore();
      const store = memoryKeyValueStore({ [DEVICE_ID_KEY]: LEGACY_ID, [MIGRATED_KEY]: '1' });
      const auth = createAuth({ platform: 'ios', deviceIdStore, store, client });

      // Act
      await auth.signIn();

      // Assert
      expect(deviceIdStore.save.mock.calls).toEqual([[`chk-${UUID}`]]);
    });
  });
});

/*
 * Account creation: the server's before-auth hook picks the username (the
 * friend code), so the client sends none. A code clash answers 409 and the
 * hook picks a fresh code on each call, so one retry is enough.
 */
describe('GuestAuth account creation', () => {
  /** Migration already done, durable Keychain id present: sign-in goes straight to device auth. */
  function creationSetup() {
    const client = fakeClient();
    const deviceIdStore = memoryDeviceIdStore(KEYCHAIN_ID);
    const store = memoryKeyValueStore({ [MIGRATED_KEY]: '1' });
    const auth = createAuth({ platform: 'ios', deviceIdStore, store, client });
    return { client, store, auth };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should send no username argument when creating the account', async () => {
    // Arrange
    const { client, auth } = creationSetup();

    // Act
    await auth.signIn();

    // Assert
    expect(client.authenticateDevice.mock.calls).toEqual([[KEYCHAIN_ID, true]]);
  });

  describe('when the first attempt answers 409', () => {
    it('should retry once with the same id and still no username', async () => {
      // Arrange
      const { client, auth } = creationSetup();
      client.authenticateDevice.mockRejectedValueOnce(httpError(409));

      // Act
      await auth.signIn();

      // Assert
      expect(client.authenticateDevice.mock.calls).toEqual([
        [KEYCHAIN_ID, true],
        [KEYCHAIN_ID, true],
      ]);
    });

    it('should resolve the session from the retry', async () => {
      // Arrange
      const { client, auth } = creationSetup();
      client.authenticateDevice.mockRejectedValueOnce(httpError(409));

      // Act
      const { session } = await auth.signIn();

      // Assert
      expect(session.user_id).toBe(`user-of-${KEYCHAIN_ID}`);
    });

    it('should persist the session from the retry', async () => {
      // Arrange
      const { client, store, auth } = creationSetup();
      client.authenticateDevice.mockRejectedValueOnce(httpError(409));

      // Act
      await auth.signIn();

      // Assert
      expect(store.data.get(SESSION_KEY)).toBe(storedSession(`user-of-${KEYCHAIN_ID}`));
    });
  });

  describe('when both attempts answer 409', () => {
    it('should reject with the second 409', async () => {
      // Arrange
      const { client, auth } = creationSetup();
      const second = httpError(409);
      client.authenticateDevice.mockRejectedValueOnce(httpError(409)).mockRejectedValueOnce(second);

      // Act
      const result = auth.signIn();

      // Assert
      await expect(result).rejects.toBe(second);
    });

    it('should not make a third attempt', async () => {
      // Arrange
      const { client, auth } = creationSetup();
      client.authenticateDevice.mockRejectedValue(httpError(409));

      // Act
      await auth.signIn().catch(() => undefined);

      // Assert
      expect(client.authenticateDevice).toHaveBeenCalledTimes(2);
    });

    it('should not persist a session', async () => {
      // Arrange
      const { client, store, auth } = creationSetup();
      client.authenticateDevice.mockRejectedValue(httpError(409));

      // Act
      await auth.signIn().catch(() => undefined);

      // Assert
      expect(store.data.has(SESSION_KEY)).toBe(false);
    });
  });

  describe.each([
    { scenario: 'a 500', error: httpError(500) },
    { scenario: 'a 400', error: httpError(400) },
    { scenario: 'a network error', error: new TypeError('Network request failed') },
  ])('when the first attempt fails with $scenario', ({ error }) => {
    it('should reject with that error', async () => {
      // Arrange
      const { client, auth } = creationSetup();
      client.authenticateDevice.mockRejectedValueOnce(error);

      // Act
      const result = auth.signIn();

      // Assert
      await expect(result).rejects.toBe(error);
    });

    it('should not retry', async () => {
      // Arrange
      const { client, auth } = creationSetup();
      client.authenticateDevice.mockRejectedValueOnce(error);

      // Act
      await auth.signIn().catch(() => undefined);

      // Assert
      expect(client.authenticateDevice).toHaveBeenCalledTimes(1);
    });
  });
});

/*
 * A stored session whose account is gone (live checks on Nakama 3.40): after a
 * database wipe the token still verifies and GetAccount answers 404 `Account
 * not found.`; once the account is deleted while the server runs, every call
 * answers 401 `Auth token invalid`. GuestAuth checks a session read from
 * storage once; `signIn` then authenticates the device again, `resume` drops
 * it and resolves null without creating an account.
 */
describe('GuestAuth stale stored session', () => {
  const STORED_USER = 'stored-account';

  function staleSetup() {
    const client = fakeClient();
    const deviceIdStore = memoryDeviceIdStore(KEYCHAIN_ID);
    const store = memoryKeyValueStore({ [MIGRATED_KEY]: '1', [SESSION_KEY]: storedSession(STORED_USER) });
    const auth = createAuth({ platform: 'ios', deviceIdStore, store, client });
    return { client, store, auth };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('when the stored account still exists', () => {
    it('should reuse the stored session without authenticating', async () => {
      // Arrange
      const { client, auth } = staleSetup();

      // Act
      const { session } = await auth.signIn();

      // Assert
      expect([session.user_id, client.authenticateDevice.mock.calls.length]).toEqual([STORED_USER, 0]);
    });

    it('should check the account only once per run', async () => {
      // Arrange
      const { client, auth } = staleSetup();

      // Act
      await auth.signIn();
      await auth.signIn();
      await auth.resume();

      // Assert
      expect(client.getAccount).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    { scenario: '404 (database wiped)', error: httpError(404) },
    { scenario: '401 (session revoked)', error: httpError(401) },
  ])('when the account check answers $scenario', ({ error }) => {
    it('signIn should authenticate the device with create=true', async () => {
      // Arrange
      const { client, auth } = staleSetup();
      client.getAccount.mockRejectedValueOnce(error);

      // Act
      const { session } = await auth.signIn();

      // Assert
      expect([session.user_id, client.authenticateDevice.mock.calls]).toEqual([
        `user-of-${KEYCHAIN_ID}`,
        [[KEYCHAIN_ID, true]],
      ]);
    });

    it('signIn should persist the new session', async () => {
      // Arrange
      const { client, store, auth } = staleSetup();
      client.getAccount.mockRejectedValueOnce(error);

      // Act
      await auth.signIn();

      // Assert
      expect(store.data.get(SESSION_KEY)).toBe(storedSession(`user-of-${KEYCHAIN_ID}`));
    });

    it('resume should resolve null without creating an account', async () => {
      // Arrange
      const { client, auth } = staleSetup();
      client.getAccount.mockRejectedValueOnce(error);

      // Act
      const result = await auth.resume();

      // Assert
      expect([result, client.authenticateDevice.mock.calls.length]).toEqual([null, 0]);
    });

    it('resume should drop the stored session', async () => {
      // Arrange
      const { client, store, auth } = staleSetup();
      client.getAccount.mockRejectedValueOnce(error);

      // Act
      await auth.resume();

      // Assert
      expect(store.data.has(SESSION_KEY)).toBe(false);
    });

    it('a later resume should resolve null without another request', async () => {
      // Arrange
      const { client, auth } = staleSetup();
      client.getAccount.mockRejectedValueOnce(error);
      await auth.resume();

      // Act
      const result = await auth.resume();

      // Assert
      expect([result, client.getAccount.mock.calls.length]).toEqual([null, 1]);
    });
  });

  describe('when the account check fails with a network error', () => {
    it('signIn should reject and keep the stored session', async () => {
      // Arrange
      const { client, store, auth } = staleSetup();
      const failure = new TypeError('Network request failed');
      client.getAccount.mockRejectedValueOnce(failure);

      // Act
      const result = auth.signIn();

      // Assert
      await expect(result).rejects.toBe(failure);
      expect([store.data.get(SESSION_KEY), client.authenticateDevice.mock.calls.length]).toEqual([
        storedSession(STORED_USER),
        0,
      ]);
    });

    it('resume should reject and keep the stored session', async () => {
      // Arrange
      const { client, store, auth } = staleSetup();
      client.getAccount.mockRejectedValueOnce(new TypeError('Network request failed'));

      // Act
      const result = auth.resume();

      // Assert
      await expect(result).rejects.toThrow('Network request failed');
      expect(store.data.get(SESSION_KEY)).toBe(storedSession(STORED_USER));
    });
  });
});

describe('GuestAuth.invalidate', () => {
  function signedInSetup() {
    const client = fakeClient();
    const deviceIdStore = memoryDeviceIdStore(KEYCHAIN_ID);
    const store = memoryKeyValueStore({ [MIGRATED_KEY]: '1', [SESSION_KEY]: storedSession('gone-account') });
    const auth = createAuth({ platform: 'ios', deviceIdStore, store, client });
    return { client, store, auth };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should make the next signIn authenticate the device again', async () => {
    // Arrange
    const { client, auth } = signedInSetup();
    const { session: stale } = await auth.signIn();

    // Act
    await auth.invalidate(stale);
    const { session } = await auth.signIn();

    // Assert
    expect([session.user_id, client.authenticateDevice.mock.calls]).toEqual([
      `user-of-${KEYCHAIN_ID}`,
      [[KEYCHAIN_ID, true]],
    ]);
  });

  it('should drop the stored session', async () => {
    // Arrange
    const { store, auth } = signedInSetup();
    const { session: stale } = await auth.signIn();

    // Act
    await auth.invalidate(stale);

    // Assert
    expect(store.data.has(SESSION_KEY)).toBe(false);
  });

  it('should re-authenticate once when two callers drop the same stale session', async () => {
    // Arrange
    const { client, auth } = signedInSetup();
    const { session: stale } = await auth.signIn();

    // Act: the second caller learns about the stale session after the first already renewed it.
    await auth.invalidate(stale);
    const { session: fresh } = await auth.signIn();
    await auth.invalidate(stale);
    const { session } = await auth.signIn();

    // Assert
    expect([session, client.authenticateDevice.mock.calls.length]).toEqual([fresh, 1]);
  });

  it('should drop a stale session that is only on disk', async () => {
    // Arrange: this run has not signed in yet.
    const { store, auth } = signedInSetup();
    const stale = makeSession('gone-account');

    // Act
    await auth.invalidate(stale);

    // Assert
    expect(store.data.has(SESSION_KEY)).toBe(false);
  });
});

/*
 * Private-table RPCs. nakama-js 2.8.0 rejects a failed RPC with the fetch
 * Response; its body is `{"code":<n>,"error":{…},"message":"<message>"}`
 * (shapes from the live checks on Nakama 3.40).
 */

const ROOM_MATCH_ID = '0f1e2d3c-4b5a-4968-8776-655443322110.chkobba-local';
const ROOM_CODE = 'K7M2QX';

/** The fetch Response nakama-js rejects with, carrying a Nakama RPC error body. */
function rpcErrorResponse(status: number, grpcCode: number, message: string) {
  return {
    status,
    statusText: `HTTP ${status}`,
    json: jest.fn(async () => ({ code: grpcCode, error: { stackTrace: 'at rpc (index.js:1)' }, message })),
  };
}

/** A Response whose body is not JSON (e.g. an HTML error page from a proxy). */
function unreadableResponse(status: number) {
  return {
    status,
    statusText: `HTTP ${status}`,
    json: jest.fn(async () => {
      throw new SyntaxError('Unexpected token < in JSON at position 0');
    }),
  };
}

function rpcClient() {
  return {
    rpc: jest.fn(async (_session: Session, _id: string, _input: object): Promise<{ id: string; payload?: object }> => ({
      id: 'rpc',
      payload: {},
    })),
  };
}

type RpcClient = ReturnType<typeof rpcClient>;

function asClient(client: RpcClient): Client {
  return client as unknown as Client;
}

/** Runs `promise` and returns what it rejected with (fails the test when it resolves). */
async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('rpcErrorMessage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return the message of a Nakama RPC error body', async () => {
    // Arrange
    const error = rpcErrorResponse(404, 5, 'room_not_found');

    // Act
    const message = await rpcErrorMessage(error);

    // Assert
    expect(message).toBe('room_not_found');
  });

  it.each<[string, unknown]>([
    ['the error is a timeout Error', new Error('Request timed out.')],
    ['the error is a string', 'timeout'],
    ['the error is null', null],
    ['the body is not JSON', unreadableResponse(502)],
    ['the body has no message', { status: 500, json: async () => ({ code: 13 }) }],
    ['the message is a number', { status: 500, json: async () => ({ message: 13 }) }],
    ['the body is null', { status: 500, json: async () => null }],
    ['json is not a function', { status: 500, json: 'room_not_found' }],
  ])('should return null when %s', async (_case, error) => {
    // Arrange
    const input = error;

    // Act
    const message = await rpcErrorMessage(input);

    // Assert
    expect(message).toBeNull();
  });
});

describe('joinByCode', () => {
  const session = makeSession('player');

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve the match id when the code is found', async () => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockResolvedValueOnce({ id: 'join_by_code', payload: { matchId: ROOM_MATCH_ID } });

    // Act
    const result = await joinByCode(asClient(client), session, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: true, matchId: ROOM_MATCH_ID });
  });

  it.each([
    ['lowercase', 'k7m2qx'],
    ['dashed lowercase', 'k7m-2qx'],
    ['spaced', ' K7M 2QX '],
    ['dashed', 'K7M-2QX'],
  ])('should send the normalized code when the input is %s', async (_label, input) => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockResolvedValueOnce({ id: 'join_by_code', payload: { matchId: ROOM_MATCH_ID } });

    // Act
    await joinByCode(asClient(client), session, input);

    // Assert
    expect(client.rpc).toHaveBeenCalledWith(session, 'join_by_code', { code: ROOM_CODE });
  });

  it.each<[string, () => unknown, string]>([
    ['404 room_not_found', () => rpcErrorResponse(404, 5, 'room_not_found'), 'not_found'],
    ['400 room_bad_code', () => rpcErrorResponse(400, 3, 'room_bad_code'), 'bad_code'],
    ['429 room_rate_limited', () => rpcErrorResponse(429, 8, 'room_rate_limited'), 'rate_limited'],
    ['401 with a free-text message', () => rpcErrorResponse(401, 16, 'join_by_code requires an authenticated user'), 'network'],
    ['500 with an unknown message', () => rpcErrorResponse(500, 13, 'internal'), 'network'],
    ['a timeout', () => new Error('Request timed out.'), 'network'],
    ['a fetch TypeError', () => new TypeError('Network request failed'), 'network'],
    ['a body that is not JSON', () => unreadableResponse(502), 'network'],
  ])('should map %s to %s', async (_case, makeError, reason) => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockRejectedValueOnce(makeError());

    // Act
    const result = await joinByCode(asClient(client), session, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason });
  });

  it.each<[string, object | undefined]>([
    ['the payload is missing', undefined],
    ['the payload has no matchId', { code: ROOM_CODE }],
    ['the matchId is a number', { matchId: 42 }],
    ['the matchId is empty', { matchId: '' }],
    ['the matchId has a slash', { matchId: '../admin' }],
    ['the matchId is too long', { matchId: 'a'.repeat(129) }],
  ])('should resolve network when %s', async (_case, payload) => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockResolvedValueOnce({ id: 'join_by_code', payload });

    // Act
    const result = await joinByCode(asClient(client), session, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it.each([
    ['empty', ''],
    ['too short', 'K7M2Q'],
    ['too long', 'K7M2QXA'],
    ['using 0', 'K7M2Q0'],
    ['using O', 'K7M2QO'],
    ['using 1', 'K7M2Q1'],
    ['punctuated', 'K7M.2QX'],
    ['longer than 32 raw characters', `${'-'.repeat(27)}K7M2QX`],
  ])('should resolve bad_code without a request when the input is %s', async (_label, input) => {
    // Arrange
    const client = rpcClient();

    // Act
    const result = await joinByCode(asClient(client), session, input);

    // Assert
    expect({ result, requests: client.rpc.mock.calls.length }).toEqual({
      result: { ok: false, reason: 'bad_code' },
      requests: 0,
    });
  });
});

describe('createPrivateTable', () => {
  const session = makeSession('host');

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve the match id and code when the table is created', async () => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockResolvedValueOnce({ id: 'create_private_table', payload: { matchId: ROOM_MATCH_ID, code: ROOM_CODE } });

    // Act
    const result = await createPrivateTable(asClient(client), session);

    // Assert
    expect(result).toEqual({ matchId: ROOM_MATCH_ID, code: ROOM_CODE });
  });

  it('should drop extra fields from the response', async () => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockResolvedValueOnce({
      id: 'create_private_table',
      payload: { matchId: ROOM_MATCH_ID, code: ROOM_CODE, hostUserId: 'u1' },
    });

    // Act
    const result = await createPrivateTable(asClient(client), session);

    // Assert
    expect(Object.keys(result).sort()).toEqual(['code', 'matchId']);
  });

  it('should call create_private_table with an empty payload', async () => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockResolvedValueOnce({ id: 'create_private_table', payload: { matchId: ROOM_MATCH_ID, code: ROOM_CODE } });

    // Act
    await createPrivateTable(asClient(client), session);

    // Assert
    expect(client.rpc).toHaveBeenCalledWith(session, 'create_private_table', {});
  });

  it.each<[string, object | undefined]>([
    ['the payload is missing', undefined],
    ['the matchId is missing', { code: ROOM_CODE }],
    ['the code is missing', { matchId: ROOM_MATCH_ID }],
    ['the matchId is a number', { matchId: 7, code: ROOM_CODE }],
    ['the matchId has a space', { matchId: 'match 1', code: ROOM_CODE }],
    ['the matchId is empty', { matchId: '', code: ROOM_CODE }],
    ['the code is lowercase', { matchId: ROOM_MATCH_ID, code: 'k7m2qx' }],
    ['the code is too short', { matchId: ROOM_MATCH_ID, code: 'K7M2Q' }],
    ['the code uses 0', { matchId: ROOM_MATCH_ID, code: 'K7M2Q0' }],
    ['the code is a number', { matchId: ROOM_MATCH_ID, code: 123456 }],
  ])('should reject with a network CreatePrivateTableError when %s', async (_case, payload) => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockResolvedValueOnce({ id: 'create_private_table', payload });

    // Act
    const error = await rejectionOf(createPrivateTable(asClient(client), session));

    // Assert
    expect(error).toEqual(expect.objectContaining({ name: 'CreatePrivateTableError', reason: 'network' }));
  });

  it.each<[string, () => unknown, string]>([
    ['429 room_rate_limited', () => rpcErrorResponse(429, 8, 'room_rate_limited'), 'rate_limited'],
    ['401 with a free-text message', () => rpcErrorResponse(401, 16, 'create_private_table requires an authenticated user'), 'network'],
    ['500 with an unknown message', () => rpcErrorResponse(500, 13, 'internal'), 'network'],
    ['a timeout', () => new Error('Request timed out.'), 'network'],
    ['a body that is not JSON', () => unreadableResponse(502), 'network'],
  ])('should map %s to a %s CreatePrivateTableError', async (_case, makeError, reason) => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockRejectedValueOnce(makeError());

    // Act
    const error = await rejectionOf(createPrivateTable(asClient(client), session));

    // Assert
    expect(error).toEqual(expect.objectContaining({ name: 'CreatePrivateTableError', reason }));
  });

  it('should reject with an instance of CreatePrivateTableError', async () => {
    // Arrange
    const client = rpcClient();
    client.rpc.mockRejectedValueOnce(rpcErrorResponse(429, 8, 'room_rate_limited'));

    // Act
    const error = await rejectionOf(createPrivateTable(asClient(client), session));

    // Assert
    expect(error instanceof CreatePrivateTableError && isCreatePrivateTableError(error)).toBe(true);
  });

  it.each([
    ['rate_limited', 'room_rate_limited'],
    ['network', 'offline'],
  ] as const)('should use %s as reason and %s as message', (reason, message) => {
    // Arrange
    const build = () => new CreatePrivateTableError(reason);

    // Act
    const error = build();

    // Assert
    expect({ reason: error.reason, message: error.message }).toEqual({ reason, message });
  });
});

describe('createNakamaBackend private-table RPCs', () => {
  const CONFIG = { host: 'nakama.test', port: '7350', serverKey: 'k', useSSL: false };

  function backendWith(client: RpcClient, signIn: () => Promise<{ session: Session }>) {
    const auth = { signIn: jest.fn(signIn) } as unknown as GuestAuth;
    return createNakamaBackend({ config: CONFIG, client: asClient(client), auth });
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should resolve network from joinByCode when sign-in fails', async () => {
    // Arrange
    const client = rpcClient();
    const backend = backendWith(client, async () => {
      throw new TypeError('Network request failed');
    });

    // Act
    const result = await backend.joinByCode(ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('should reject createPrivateTable with a network error when sign-in fails', async () => {
    // Arrange
    const client = rpcClient();
    const backend = backendWith(client, async () => {
      throw new TypeError('Network request failed');
    });

    // Act
    const error = await rejectionOf(backend.createPrivateTable());

    // Assert
    expect(error).toEqual(expect.objectContaining({ name: 'CreatePrivateTableError', reason: 'network' }));
  });

  it('should call join_by_code with the signed-in session', async () => {
    // Arrange
    const client = rpcClient();
    const session = makeSession('player');
    client.rpc.mockResolvedValueOnce({ id: 'join_by_code', payload: { matchId: ROOM_MATCH_ID } });
    const backend = backendWith(client, async () => ({ session }));

    // Act
    await backend.joinByCode('k7m-2qx');

    // Assert
    expect(client.rpc).toHaveBeenCalledWith(session, 'join_by_code', { code: ROOM_CODE });
  });
});
