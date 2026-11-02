import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { DEVICE_ID_KEY } from '../deviceId';
import { createDeviceIdStore as createAndroidStore } from '../deviceIdStore.android';
import { createDeviceIdStore as createIosStore } from '../deviceIdStore.ios';
import { createDeviceIdStore as createWebStore } from '../deviceIdStore.web';

// Distinct values (the real ones come from the native module, which Jest doesn't load).
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 1,
  ALWAYS: 2,
  WHEN_PASSCODE_SET_THIS_DEVICE_ONLY: 3,
  ALWAYS_THIS_DEVICE_ONLY: 4,
  WHEN_UNLOCKED: 5,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

jest.mock('expo-application', () => ({
  getAndroidId: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' },
  CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  digestStringAsync: jest.fn(),
}));

const VALID_ID = 'chk-11111111-2222-4333-8444-555555555555';
const OTHER_VALID_ID = 'chk-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ANDROID_ID = 'f00dfacecafe1234';
/** Upper case, to check the store lowercases the digest. */
const DIGEST_HEX = 'AB12'.repeat(16);
const DERIVED_ID = `chk-a-${DIGEST_HEX.toLowerCase()}`;

describe('deviceIdStore.ios', () => {
  const getItemAsync = jest.mocked(SecureStore.getItemAsync);
  const setItemAsync = jest.mocked(SecureStore.setItemAsync);

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when the Keychain has no item', async () => {
    // Arrange
    getItemAsync.mockResolvedValue(null);

    // Act
    const loaded = await createIosStore().load();

    // Assert
    expect(loaded).toBeNull();
  });

  it('should return null when the stored value is malformed', async () => {
    // Arrange
    getItemAsync.mockResolvedValue('not a device id!');

    // Act
    const loaded = await createIosStore().load();

    // Assert
    expect(loaded).toBeNull();
  });

  it('should return null when the stored value lacks the app prefix', async () => {
    // Arrange
    getItemAsync.mockResolvedValue('11111111-2222-4333-8444-555555555555');

    // Act
    const loaded = await createIosStore().load();

    // Assert
    expect(loaded).toBeNull();
  });

  it('should return the stored id when it is valid', async () => {
    // Arrange
    getItemAsync.mockResolvedValue(VALID_ID);

    // Act
    const loaded = await createIosStore().load();

    // Assert
    expect(loaded).toBe(VALID_ID);
  });

  it('should read the item under the device id key with AFTER_FIRST_UNLOCK', async () => {
    // Arrange
    getItemAsync.mockResolvedValue(null);

    // Act
    await createIosStore().load();

    // Assert
    expect(getItemAsync).toHaveBeenCalledWith(DEVICE_ID_KEY, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  });

  it('should write the id under the device id key with AFTER_FIRST_UNLOCK', async () => {
    // Arrange
    const store = createIosStore();

    // Act
    await store.save(VALID_ID);

    // Assert
    expect(setItemAsync).toHaveBeenCalledWith(DEVICE_ID_KEY, VALID_ID, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  });

  it('should not write with a THIS_DEVICE_ONLY accessibility, so backups carry the item over', async () => {
    // Arrange
    const store = createIosStore();
    const deviceOnly = [
      SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
      SecureStore.ALWAYS_THIS_DEVICE_ONLY,
    ];

    // Act
    await store.save(VALID_ID);

    // Assert
    const options = setItemAsync.mock.calls[0][2];
    expect(deviceOnly).not.toContain(options?.keychainAccessible);
  });

  it('should reject an invalid id without writing it', async () => {
    // Arrange
    const store = createIosStore();

    // Act
    const saving = store.save('bad id');

    // Assert
    await expect(saving).rejects.toThrow('malformed device id');
    expect(setItemAsync).not.toHaveBeenCalled();
  });
});

describe('deviceIdStore.android', () => {
  const getAndroidId = jest.mocked(Application.getAndroidId);
  const digestStringAsync = jest.mocked(Crypto.digestStringAsync);

  beforeEach(async () => {
    await AsyncStorage.clear();
    getAndroidId.mockReturnValue(ANDROID_ID);
    digestStringAsync.mockResolvedValue(DIGEST_HEX);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should derive chk-a- plus 64 lowercase hex chars from the ANDROID_ID', async () => {
    // Arrange
    const store = createAndroidStore();

    // Act
    const loaded = await store.load();

    // Assert
    expect(loaded).toMatch(/^chk-a-[0-9a-f]{64}$/);
  });

  it('should return the lowercased digest behind the chk-a- prefix', async () => {
    // Arrange
    const store = createAndroidStore();

    // Act
    const loaded = await store.load();

    // Assert
    expect(loaded).toBe(DERIVED_ID);
  });

  it('should hash the ANDROID_ID plus a salt with SHA-256 as hex', async () => {
    // Arrange
    const store = createAndroidStore();

    // Act
    await store.load();

    // Assert
    expect(digestStringAsync).toHaveBeenCalledWith(
      Crypto.CryptoDigestAlgorithm.SHA256,
      expect.stringMatching(new RegExp(`^${ANDROID_ID}.+`)),
      { encoding: Crypto.CryptoEncoding.HEX },
    );
  });

  it('should never put the raw ANDROID_ID in the returned id', async () => {
    // Arrange
    const store = createAndroidStore();

    // Act
    const loaded = await store.load();

    // Assert
    expect(loaded).not.toContain(ANDROID_ID);
  });

  it.each([
    { scenario: 'getAndroidId returns null', setUp: () => getAndroidId.mockReturnValue(null as unknown as string) },
    { scenario: 'getAndroidId returns an empty string', setUp: () => getAndroidId.mockReturnValue('') },
    { scenario: 'getAndroidId returns only whitespace', setUp: () => getAndroidId.mockReturnValue('   ') },
    {
      scenario: 'getAndroidId throws',
      setUp: () =>
        getAndroidId.mockImplementation(() => {
          throw new Error('no android id');
        }),
    },
  ])('should return null when $scenario and no fallback is saved', async ({ setUp }) => {
    // Arrange
    setUp();
    const store = createAndroidStore();

    // Act
    const loaded = await store.load();

    // Assert
    expect(loaded).toBeNull();
  });

  it('should prefer a saved fallback over the derived id', async () => {
    // Arrange
    const store = createAndroidStore();
    await store.save(VALID_ID);

    // Act
    const loaded = await store.load();

    // Assert
    expect(loaded).toBe(VALID_ID);
  });

  it('should not persist anything when saving the derived id', async () => {
    // Arrange
    const store = createAndroidStore();

    // Act
    await store.save(DERIVED_ID);

    // Assert
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('should keep loading the derived id after saving the derived id', async () => {
    // Arrange
    const store = createAndroidStore();
    await store.save(DERIVED_ID);
    getAndroidId.mockReturnValue('0123456789abcdef');
    digestStringAsync.mockResolvedValue('cd34'.repeat(16));

    // Act
    const loaded = await store.load();

    // Assert
    expect(loaded).toBe(`chk-a-${'cd34'.repeat(16)}`);
  });

  it('should persist any other valid id as the fallback', async () => {
    // Arrange
    const store = createAndroidStore();
    await store.save(OTHER_VALID_ID);

    // Act
    const loaded = await createAndroidStore().load();

    // Assert
    expect(loaded).toBe(OTHER_VALID_ID);
  });

  it('should persist the fallback when there is no ANDROID_ID', async () => {
    // Arrange
    getAndroidId.mockReturnValue('');
    const store = createAndroidStore();
    await store.save(VALID_ID);

    // Act
    const loaded = await store.load();

    // Assert
    expect(loaded).toBe(VALID_ID);
  });

  it('should not write the fallback under the shared device id key', async () => {
    // Arrange
    const store = createAndroidStore();

    // Act
    await store.save(OTHER_VALID_ID);

    // Assert
    expect(await AsyncStorage.getItem(DEVICE_ID_KEY)).toBeNull();
  });

  it('should reject an invalid id without writing it', async () => {
    // Arrange
    const store = createAndroidStore();

    // Act
    const saving = store.save('nope');

    // Assert
    await expect(saving).rejects.toThrow('malformed device id');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('deviceIdStore.web', () => {
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  function memoryStorage(): Storage & { readonly data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      get length() {
        return data.size;
      },
      clear: jest.fn(() => data.clear()),
      getItem: jest.fn((key: string) => data.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        data.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        data.delete(key);
      }),
      key: jest.fn(() => null),
    };
  }

  function installLocalStorage(value: Storage): void {
    Object.defineProperty(globalThis, 'localStorage', { value, configurable: true, writable: true });
  }

  afterEach(() => {
    if (hadLocalStorage && originalDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalDescriptor);
    } else {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    }
    jest.clearAllMocks();
  });

  it('should return null when localStorage has no id', async () => {
    // Arrange
    installLocalStorage(memoryStorage());

    // Act
    const loaded = await createWebStore().load();

    // Assert
    expect(loaded).toBeNull();
  });

  it('should load the id stored under chkobba.online.deviceId', async () => {
    // Arrange
    const storage = memoryStorage();
    storage.data.set('chkobba.online.deviceId', VALID_ID);
    installLocalStorage(storage);

    // Act
    const loaded = await createWebStore().load();

    // Assert
    expect(loaded).toBe(VALID_ID);
  });

  it('should return null when the stored id is malformed', async () => {
    // Arrange
    const storage = memoryStorage();
    storage.data.set('chkobba.online.deviceId', 'garbage');
    installLocalStorage(storage);

    // Act
    const loaded = await createWebStore().load();

    // Assert
    expect(loaded).toBeNull();
  });

  it('should save the id under chkobba.online.deviceId', async () => {
    // Arrange
    const storage = memoryStorage();
    installLocalStorage(storage);

    // Act
    await createWebStore().save(VALID_ID);

    // Assert
    expect(storage.data.get('chkobba.online.deviceId')).toBe(VALID_ID);
  });

  it('should return null when localStorage throws on read', async () => {
    // Arrange
    const storage = memoryStorage();
    jest.mocked(storage.getItem).mockImplementation(() => {
      throw new Error('SecurityError');
    });
    installLocalStorage(storage);

    // Act
    const loaded = await createWebStore().load();

    // Assert
    expect(loaded).toBeNull();
  });

  it('should resolve without saving when localStorage throws on write', async () => {
    // Arrange
    const storage = memoryStorage();
    jest.mocked(storage.setItem).mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    installLocalStorage(storage);

    // Act
    const saving = createWebStore().save(VALID_ID);

    // Assert
    await expect(saving).resolves.toBeUndefined();
  });

  it('should return null when the localStorage getter itself throws', async () => {
    // Arrange
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });

    // Act
    const loaded = await createWebStore().load();

    // Assert
    expect(loaded).toBeNull();
  });

  it('should resolve without saving when localStorage is unavailable', async () => {
    // Arrange
    delete (globalThis as { localStorage?: Storage }).localStorage;

    // Act
    const saving = createWebStore().save(VALID_ID);

    // Assert
    await expect(saving).resolves.toBeUndefined();
  });

  it('should reject an invalid id without writing it', async () => {
    // Arrange
    const storage = memoryStorage();
    installLocalStorage(storage);

    // Act
    const saving = createWebStore().save('bad');

    // Assert
    await expect(saving).rejects.toThrow('malformed device id');
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});
