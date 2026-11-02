import { Client } from '@heroiclabs/nakama-js';

import { createDirectoryBackend } from '../directory';
import { createNakamaBackend, createNakamaClient, GuestAuth } from '../nakama';
import { NakamaProfileBackend } from '../profile';
import { SocialSocket } from '../socialSocket';
import {
  getDirectoryBackend,
  getFriendsBackend,
  getGuestAuth,
  getNakamaClient,
  getSocialSocket,
  getOnlineBackend,
  getProfileBackend,
  resetOnlineServicesForTests,
} from '../services';

// Construction spies around the real implementations: nothing here signs in, so no request is made.
jest.mock('../nakama', () => {
  const actual = jest.requireActual<typeof import('../nakama')>('../nakama');
  return {
    ...actual,
    createNakamaClient: jest.fn(actual.createNakamaClient),
    createNakamaBackend: jest.fn(actual.createNakamaBackend),
    GuestAuth: jest.fn((options: ConstructorParameters<typeof actual.GuestAuth>[0]) => new actual.GuestAuth(options)),
  };
});

jest.mock('../profile', () => {
  const actual = jest.requireActual<typeof import('../profile')>('../profile');
  return {
    ...actual,
    NakamaProfileBackend: jest.fn(
      (options: ConstructorParameters<typeof actual.NakamaProfileBackend>[0]) => new actual.NakamaProfileBackend(options),
    ),
  };
});

jest.mock('../directory', () => {
  const actual = jest.requireActual<typeof import('../directory')>('../directory');
  return {
    ...actual,
    createDirectoryBackend: jest.fn(actual.createDirectoryBackend),
  };
});

// GuestAuth builds the platform device id store; keep the Keychain out of reach.
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 0,
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const GuestAuthMock = jest.mocked(GuestAuth);
const createNakamaClientMock = jest.mocked(createNakamaClient);
const createNakamaBackendMock = jest.mocked(createNakamaBackend);
const NakamaProfileBackendMock = jest.mocked(NakamaProfileBackend);
const createDirectoryBackendMock = jest.mocked(createDirectoryBackend);

describe('online services', () => {
  beforeEach(() => {
    resetOnlineServicesForTests();
    jest.clearAllMocks();
  });

  describe('singletons', () => {
    it('should return the same client across calls', () => {
      // Act
      const first = getNakamaClient();

      // Assert
      expect(getNakamaClient()).toBe(first);
    });

    it('should build a real nakama-js client once', () => {
      // Act
      getNakamaClient();
      getNakamaClient();

      // Assert
      expect(createNakamaClientMock).toHaveBeenCalledTimes(1);
    });

    it('should return a nakama-js Client', () => {
      // Act
      const client = getNakamaClient();

      // Assert
      expect(client).toBeInstanceOf(Client);
    });

    it('should return the same GuestAuth across calls', () => {
      // Act
      const first = getGuestAuth();

      // Assert
      expect(getGuestAuth()).toBe(first);
    });

    it('should return the same online backend across calls', () => {
      // Act
      const first = getOnlineBackend();

      // Assert
      expect(getOnlineBackend()).toBe(first);
    });

    it('should return the same profile backend across calls', () => {
      // Act
      const first = getProfileBackend();

      // Assert
      expect(getProfileBackend()).toBe(first);
    });

    it('should construct each service once when all getters are called repeatedly', () => {
      // Act
      for (let i = 0; i < 3; i += 1) {
        getOnlineBackend();
        getProfileBackend();
        getGuestAuth();
        getNakamaClient();
      }

      // Assert
      expect([
        createNakamaClientMock.mock.calls.length,
        GuestAuthMock.mock.calls.length,
        createNakamaBackendMock.mock.calls.length,
        NakamaProfileBackendMock.mock.calls.length,
      ]).toEqual([1, 1, 1, 1]);
    });
  });

  describe('sharing', () => {
    it('should build the GuestAuth on the shared client', () => {
      // Act
      const auth = getGuestAuth();

      // Assert
      expect(GuestAuthMock).toHaveBeenCalledWith({ client: getNakamaClient() });
      expect(auth).toBeInstanceOf(jest.requireActual<typeof import('../nakama')>('../nakama').GuestAuth);
    });

    it('should give the online backend the shared client and GuestAuth', () => {
      // Act
      getOnlineBackend();

      // Assert
      expect(createNakamaBackendMock).toHaveBeenCalledWith(
        expect.objectContaining({ client: getNakamaClient(), auth: getGuestAuth() }),
      );
    });

    it('should give the profile backend the same client and GuestAuth as the online backend', () => {
      // Arrange
      getOnlineBackend();

      // Act
      getProfileBackend();

      // Assert
      const online = createNakamaBackendMock.mock.calls[0][0];
      const profile = NakamaProfileBackendMock.mock.calls[0][0];
      expect([profile.client, profile.auth]).toEqual([online?.client, online?.auth]);
    });

    it('should share the same instances by identity between both backends', () => {
      // Arrange
      getProfileBackend();

      // Act
      getOnlineBackend();

      // Assert
      const online = createNakamaBackendMock.mock.calls[0][0];
      const profile = NakamaProfileBackendMock.mock.calls[0][0];
      expect(profile.client === online?.client && profile.auth === online?.auth).toBe(true);
    });
  });

  describe('resetOnlineServicesForTests', () => {
    it('should yield new instances of every service', () => {
      // Arrange
      const before = [getNakamaClient(), getGuestAuth(), getOnlineBackend(), getProfileBackend()];

      // Act
      resetOnlineServicesForTests();

      // Assert
      const after = [getNakamaClient(), getGuestAuth(), getOnlineBackend(), getProfileBackend()];
      expect(after.map((service, i) => service !== before[i])).toEqual([true, true, true, true]);
    });

    it('should build the new GuestAuth on the new client', () => {
      // Arrange
      const oldClient = getNakamaClient();
      getGuestAuth();
      resetOnlineServicesForTests();

      // Act
      getGuestAuth();

      // Assert
      const newAuthClient = GuestAuthMock.mock.calls[1][0].client;
      expect(newAuthClient !== oldClient && newAuthClient === getNakamaClient()).toBe(true);
    });
  });

  describe('directory backend', () => {
    it('should return the same directory backend across calls', () => {
      // Act
      const first = getDirectoryBackend();

      // Assert
      expect(getDirectoryBackend()).toBe(first);
    });

    it('should create the directory backend only once', () => {
      // Act
      getDirectoryBackend();
      getDirectoryBackend();

      // Assert
      expect(createDirectoryBackendMock).toHaveBeenCalledTimes(1);
    });

    it('should give the directory backend the shared client and GuestAuth', () => {
      // Act
      getDirectoryBackend();

      // Assert
      expect(createDirectoryBackendMock).toHaveBeenCalledWith({
        client: getNakamaClient(),
        auth: getGuestAuth(),
      });
    });

    it('should yield a new directory backend after reset', () => {
      // Arrange
      const before = getDirectoryBackend();

      // Act
      resetOnlineServicesForTests();

      // Assert
      expect(getDirectoryBackend()).not.toBe(before);
    });

    it('should build the directory backend again after reset', () => {
      // Arrange
      getDirectoryBackend();
      resetOnlineServicesForTests();

      // Act
      getDirectoryBackend();

      // Assert
      expect(createDirectoryBackendMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('friends backend and social socket', () => {
    let fetchSpy: jest.SpyInstance;
    let createSocketSpy: jest.SpyInstance;

    beforeEach(() => {
      fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'));
      createSocketSpy = jest.spyOn(Client.prototype, 'createSocket');
    });

    afterEach(() => {
      resetOnlineServicesForTests();
      jest.restoreAllMocks();
    });

    it('should return the same friends backend across calls', () => {
      // Act
      const first = getFriendsBackend();

      // Assert
      expect(getFriendsBackend()).toBe(first);
    });

    it('should return the same social socket across calls', () => {
      // Act
      const first = getSocialSocket();

      // Assert
      expect(getSocialSocket()).toBe(first);
    });

    it('should return a SocialSocket that is off until started', () => {
      // Act
      const social = getSocialSocket();

      // Assert
      expect([social instanceof SocialSocket, social.getConnectionPhase()]).toEqual([true, 'off']);
    });

    it('should build neither singleton until first use', () => {
      // Act
      getNakamaClient();

      // Assert
      expect([GuestAuthMock.mock.calls.length, createNakamaBackendMock.mock.calls.length]).toEqual([0, 0]);
    });

    it('should make no request when the friends backend and social socket are created', async () => {
      // Act
      getFriendsBackend();
      getSocialSocket();
      await Promise.resolve();

      // Assert
      expect([fetchSpy.mock.calls.length, createSocketSpy.mock.calls.length]).toEqual([0, 0]);
    });

    it('should yield a new friends backend and social socket after reset', () => {
      // Arrange
      const friends = getFriendsBackend();
      const social = getSocialSocket();

      // Act
      resetOnlineServicesForTests();

      // Assert
      expect([getFriendsBackend() !== friends, getSocialSocket() !== social]).toEqual([true, true]);
    });

    it('should stop the social socket when reset', () => {
      // Arrange
      const social = getSocialSocket();
      const stop = jest.spyOn(social, 'stop');

      // Act
      resetOnlineServicesForTests();

      // Assert
      expect(stop).toHaveBeenCalledTimes(1);
    });

    it('should build the social socket on the shared GuestAuth (its session lookup goes through it)', async () => {
      // Arrange
      const resume = jest.spyOn(getGuestAuth(), 'resume').mockResolvedValue(null);

      // Act
      await getSocialSocket().start();

      // Assert
      expect([resume.mock.calls.length, createSocketSpy.mock.calls.length]).toEqual([1, 0]);
    });
  });
});
