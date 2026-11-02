/**
 * Route-level friends flows with fake backends: `/friends` shows the player's
 * own code and the lists (phone and desktop layouts, English and Derja), and
 * `/f/CODE` previews the player behind a share link, adding them through the
 * name gate. The friends backend comes from the social context, the profile
 * backend from the mocked services module, as in the app.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FRIEND_STATE } from '@chkobba/protocol';
import { FIXTURE_FRIEND_CODE } from '@chkobba/protocol/testing';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { useWindowDimensions } from 'react-native';

import FriendLinkScreen from '@/app/f/[code]';
import FriendsScreen from '@/app/friends';
import { i18n } from '@/i18n';
import type {
  CodeLookupResult,
  FriendActionResult,
  FriendEntry,
  FriendsBackend,
  FriendsSnapshot,
  RecentPlayerEntry,
} from '@/online/friends';
import { type Profile, type ProfileBackend, type SetNameResult } from '@/online/profile';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';

const OWN_CODE = 'HJKM6789';

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouter.push(...args),
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    back: (...args: unknown[]) => mockRouter.back(...args),
    canGoBack: () => mockRouter.canGoBack(),
  },
  useLocalSearchParams: () => mockParams.current,
}));

const mockBackends: { profile: ProfileBackend | null } = { profile: null };

// The real module builds a nakama-js client; the friends backend comes from the social context instead.
jest.mock('@/online/services', () => ({
  getProfileBackend: () => mockBackends.profile,
  getFriendsBackend: () => {
    throw new Error('the friends backend must come from the social context');
  },
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 2, fontScale: 1 })),
}));
const mockedDimensions = jest.mocked(useWindowDimensions);

function entry(userId: string, displayName: string, state: FriendEntry['state']): FriendEntry {
  return { userId, displayName, code: null, state, updatedAt: 0 };
}

const SNAPSHOT: FriendsSnapshot = {
  friends: [entry('u-sami', 'Sami', FRIEND_STATE.FRIEND)],
  incoming: [entry('u-nadia', 'Nadia', FRIEND_STATE.REQUEST_RECEIVED)],
  outgoing: [],
  blocked: [],
};
const RECENT: readonly RecentPlayerEntry[] = [{ userId: 'u-karim', displayName: 'Karim', lastPlayedAt: 1000, state: null }];

function makeBackend(lookup: CodeLookupResult = { ok: true, userId: 'u-zied', displayName: 'Zied', self: false }) {
  return {
    list: jest.fn((): Promise<FriendsSnapshot> => Promise.resolve(SNAPSHOT)),
    recentPlayers: jest.fn((): Promise<readonly RecentPlayerEntry[]> => Promise.resolve(RECENT)),
    lookupCode: jest.fn((_code: string): Promise<CodeLookupResult> => Promise.resolve(lookup)),
    add: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    remove: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    block: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    invite: jest.fn(() => Promise.resolve({ ok: true as const, sent: true })),
  } satisfies FriendsBackend;
}

function makeProfile(namePicked: boolean): ProfileBackend {
  const profile: Profile = {
    displayName: 'Guest4821',
    namePicked,
    renameAvailableAt: null,
    friendCode: OWN_CODE,
    listed: false,
    presenceVisibility: 'everyone',
  };
  return {
    getProfile: jest.fn((): Promise<Profile> => Promise.resolve(profile)),
    setDisplayName: jest.fn(
      (name: string): Promise<SetNameResult> =>
        Promise.resolve({ ok: true, profile: { ...profile, displayName: name, namePicked: true } }),
    ),
  };
}

function makeSocial(friends: FriendsBackend): SocialContextValue {
  return {
    state: EMPTY_SOCIAL_STATE,
    friends,
    ensureConnected: jest.fn(() => Promise.resolve(true)),
    refreshFriends: jest.fn(() => Promise.resolve()),
    dismissInvite: jest.fn(() => Promise.resolve()),
    setActivity: jest.fn(),
    presenceVisibility: 'everyone',
    setPresenceVisibility: jest.fn(() => Promise.resolve({ ok: false, reason: 'network' })),
    handInProgress: false,
    setHandInProgress: jest.fn(),
    onEvent: jest.fn(() => () => undefined),
  };
}

/** Lets backend and profile promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function renderRoute(
  screenElement: ReactElement,
  options: { backend?: ReturnType<typeof makeBackend>; namePicked?: boolean } = {},
) {
  const backend = options.backend ?? makeBackend();
  const profile = makeProfile(options.namePicked ?? true);
  mockBackends.profile = profile;
  await render(<SocialContext.Provider value={makeSocial(backend)}>{screenElement}</SocialContext.Provider>);
  await settle();
  return { backend, profile };
}

async function switchLanguage(language: 'en' | 'aeb'): Promise<void> {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

function setWidth(width: number): void {
  mockedDimensions.mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });
}

/** Seeds the device-local profile cache the unlisted card reads at mount. */
async function seedCachedProfile(listed: boolean): Promise<void> {
  await AsyncStorage.setItem(
    'chkobba.online.profile',
    JSON.stringify({
      displayName: 'Hamza',
      namePicked: true,
      renameAvailableAt: null,
      friendCode: OWN_CODE,
      listed,
      presenceVisibility: 'everyone',
    }),
  );
}

describe('friend routes', () => {
  beforeEach(async () => {
    mockParams.current = {};
    setWidth(390);
    await AsyncStorage.clear();
  });

  afterEach(async () => {
    await switchLanguage('en');
    mockBackends.profile = null;
    jest.clearAllMocks();
  });

  describe('/friends', () => {
    it('should open the Blocked players screen', async () => {
      // Arrange
      await renderRoute(<FriendsScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('friends-blocked-open'));

      // Assert
      expect(mockRouter.push).toHaveBeenCalledWith('/blocked');
    });

    it('should show the unlisted card, with no dismiss, for an unlisted player', async () => {
      // Arrange
      await seedCachedProfile(false);

      // Act
      await renderRoute(<FriendsScreen />);

      // Assert
      expect(screen.getByTestId('friends-unlisted')).toBeOnTheScreen();
      expect(screen.queryByTestId('friends-unlisted-dismiss')).not.toBeOnTheScreen();
    });

    it('should hide the unlisted card once the player is listed', async () => {
      // Arrange
      await seedCachedProfile(true);

      // Act
      await renderRoute(<FriendsScreen />);

      // Assert
      expect(screen.queryByTestId('friends-unlisted')).not.toBeOnTheScreen();
    });

    it('should open the players directory from the Find players card', async () => {
      // Arrange
      await renderRoute(<FriendsScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('friends-find-players'));

      // Assert
      expect(mockRouter.push).toHaveBeenCalledWith('/players');
    });

    it('should show the Find players card instead of a code', async () => {
      // Arrange
      // (default backends)

      // Act
      await renderRoute(<FriendsScreen />);

      // Assert
      expect(screen.getByTestId('friends-find-players')).toBeOnTheScreen();
      expect(screen.queryByTestId('friends-my-code')).not.toBeOnTheScreen();
    });

    it('should render the sections with the loaded players', async () => {
      // Arrange
      // (default backend)

      // Act
      await renderRoute(<FriendsScreen />);

      // Assert
      expect(
        ['friend-row-u-nadia', 'friend-row-u-sami', 'recent-row-u-karim'].every(
          (id) => screen.queryByTestId(id) !== null,
        ),
      ).toBe(true);
    });

    it('should connect the social socket on open', async () => {
      // Arrange
      const backend = makeBackend();
      const social = makeSocial(backend);
      mockBackends.profile = makeProfile(true);

      // Act
      await render(
        <SocialContext.Provider value={social}>
          <FriendsScreen />
        </SocialContext.Provider>,
      );
      await settle();

      // Assert
      expect(social.ensureConnected).toHaveBeenCalledTimes(1);
    });

    it('should go back to the lobby from the back button', async () => {
      // Arrange
      await renderRoute(<FriendsScreen />);

      // Act
      await fireEvent.press(screen.getByRole('button', { name: 'Back to lobby' }));

      // Assert
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    });

    it('should stack the entry cards and the lists in one column on a phone', async () => {
      // Arrange
      setWidth(390);

      // Act
      await renderRoute(<FriendsScreen />);

      // Assert
      const listsColumn = screen.getByTestId('friends-sections').parent!;
      expect(within(listsColumn).getByTestId('friends-find-players')).toBeOnTheScreen();
    });

    it('should put the entry cards and the lists in separate columns on desktop', async () => {
      // Arrange
      setWidth(1280);

      // Act
      await renderRoute(<FriendsScreen />);

      // Assert
      const listsColumn = screen.getByTestId('friends-sections').parent!;
      expect(within(listsColumn).queryByTestId('friends-find-players')).not.toBeOnTheScreen();
    });

    it('should use the phone layout just below 900 px wide', async () => {
      // Arrange
      setWidth(899);

      // Act
      await renderRoute(<FriendsScreen />);

      // Assert
      const listsColumn = screen.getByTestId('friends-sections').parent!;
      expect(within(listsColumn).getByTestId('friends-find-players')).toBeOnTheScreen();
    });

    it('should render the title in Derja', async () => {
      // Arrange
      await switchLanguage('aeb');

      // Act
      await renderRoute(<FriendsScreen />);

      // Assert
      expect(screen.getAllByRole('header', { name: /الصحاب/ }).length).toBeGreaterThan(0);
    });

  });

  describe('/f/CODE', () => {
    it('should look up the normalized code from the link', async () => {
      // Arrange
      mockParams.current = { code: 'k7m2-qxab' };

      // Act
      const { backend } = await renderRoute(<FriendLinkScreen />);

      // Assert
      expect(backend.lookupCode).toHaveBeenCalledWith(FIXTURE_FRIEND_CODE);
    });

    it('should say "This is your code" for the player own code', async () => {
      // Arrange
      mockParams.current = { code: OWN_CODE };
      const backend = makeBackend({ ok: true, userId: 'u-me', displayName: 'Hamza', self: true });

      // Act
      await renderRoute(<FriendLinkScreen />, { backend });

      // Assert
      expect(screen.getByTestId('friend-link-self')).toHaveTextContent('This is your code');
    });

    it('should say "No player with this code" for an unknown code', async () => {
      // Arrange
      mockParams.current = { code: FIXTURE_FRIEND_CODE };
      const backend = makeBackend({ ok: false, reason: 'not_found' });

      // Act
      await renderRoute(<FriendLinkScreen />, { backend });

      // Assert
      expect(screen.getByTestId('friend-link-not-found')).toHaveTextContent('No player with this code');
    });

    it('should say "No player with this code" for a malformed code', async () => {
      // Arrange
      mockParams.current = { code: 'not-a-code' };

      // Act
      await renderRoute(<FriendLinkScreen />);

      // Assert
      expect(screen.getByTestId('friend-link-not-found')).toHaveTextContent('No player with this code');
    });

    it('should not ask the server about a malformed code', async () => {
      // Arrange
      mockParams.current = { code: 'not-a-code' };

      // Act
      const { backend } = await renderRoute(<FriendLinkScreen />);

      // Assert
      expect(backend.lookupCode).not.toHaveBeenCalled();
    });

    it('should show the name of the player behind a valid code', async () => {
      // Arrange
      mockParams.current = { code: FIXTURE_FRIEND_CODE };

      // Act
      await renderRoute(<FriendLinkScreen />);

      // Assert
      expect(screen.getByTestId('friend-link-name')).toHaveTextContent('Zied');
    });

    it('should not ask for a name just to view the link', async () => {
      // Arrange
      mockParams.current = { code: FIXTURE_FRIEND_CODE };

      // Act
      await renderRoute(<FriendLinkScreen />, { namePicked: false });

      // Assert
      expect(screen.queryByTestId('friends-name-gate')).not.toBeOnTheScreen();
    });

    it('should ask for a name when Add friend is pressed on a first visit', async () => {
      // Arrange
      mockParams.current = { code: FIXTURE_FRIEND_CODE };
      await renderRoute(<FriendLinkScreen />, { namePicked: false });

      // Act
      await fireEvent.press(screen.getByRole('button', { name: 'Add friend, Zied' }));
      await settle();

      // Assert
      expect(screen.getByTestId('friends-name-gate')).toBeOnTheScreen();
    });

    it('should send the request after Continue on the name gate', async () => {
      // Arrange
      mockParams.current = { code: FIXTURE_FRIEND_CODE };
      const { backend } = await renderRoute(<FriendLinkScreen />, { namePicked: false });
      await fireEvent.press(screen.getByTestId('friend-link-add'));
      await settle();

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(backend.add).toHaveBeenCalledWith('u-zied');
    });

    it('should show "Request sent" once the request went out', async () => {
      // Arrange
      mockParams.current = { code: FIXTURE_FRIEND_CODE };
      const backend = makeBackend();
      backend.add.mockReturnValueOnce(new Promise(() => undefined));
      await renderRoute(<FriendLinkScreen />, { backend, namePicked: true });

      // Act
      await fireEvent.press(screen.getByTestId('friend-link-add'));
      await settle();

      // Assert
      expect(screen.getByTestId('friend-link-state')).toHaveTextContent('Request sent');
    });

    it('should offer Try again when the lookup cannot reach the server', async () => {
      // Arrange
      mockParams.current = { code: FIXTURE_FRIEND_CODE };
      const backend = makeBackend({ ok: false, reason: 'network' });
      await renderRoute(<FriendLinkScreen />, { backend });

      // Act
      await fireEvent.press(screen.getByTestId('friend-link-retry'));
      await settle();

      // Assert
      expect(backend.lookupCode).toHaveBeenCalledTimes(2);
    });

    it('should open the friends screen', async () => {
      // Arrange
      mockParams.current = { code: FIXTURE_FRIEND_CODE };
      await renderRoute(<FriendLinkScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('friend-link-open-friends'));

      // Assert
      expect(mockRouter.push).toHaveBeenCalledWith('/friends');
    });

    it('should keep the code unmirrored in Derja', async () => {
      // Arrange
      await switchLanguage('aeb');
      mockParams.current = { code: FIXTURE_FRIEND_CODE };

      // Act
      await renderRoute(<FriendLinkScreen />);

      // Assert
      expect(screen.getByTestId('friend-link-code').parent).toHaveStyle({ direction: 'ltr' });
    });

    it('should say "This is your code" in Derja', async () => {
      // Arrange
      await switchLanguage('aeb');
      mockParams.current = { code: OWN_CODE };
      const backend = makeBackend({ ok: true, userId: 'u-me', displayName: 'Hamza', self: true });

      // Act
      await renderRoute(<FriendLinkScreen />, { backend });

      // Assert
      expect(screen.getByTestId('friend-link-self')).toHaveTextContent(/هذا الكود متاعك/);
    });
  });
});
