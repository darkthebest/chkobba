import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import LobbyScreen from '@/app/index';
import { DEFAULT_SOUND_SETTINGS, SoundContext } from '@/audio/soundContext';
import { i18n, LanguageProvider } from '@/i18n';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';

import type { Profile, SetNameResult } from '@/online/profile';

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    router: { push: (...args: unknown[]) => mockPush(...args) },
    // The lobby is always focused in these tests.
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  };
});

// The real module builds a nakama-js client; Settings only reaches it on Save.
const mockProfileBackend = {
  getProfile: jest.fn(async (): Promise<Profile> => {
    throw new Error('getProfile should not be called');
  }),
  setDisplayName: jest.fn(async (_name: string): Promise<SetNameResult> => ({ ok: false, reason: 'network' })),
};
const mockGetProfileBackend = jest.fn(() => mockProfileBackend);
jest.mock('@/online/services', () => ({
  getProfileBackend: () => mockGetProfileBackend(),
}));

const PROFILE_CACHE_KEY = 'chkobba.online.profile';
const MINUTE = 60_000;

async function seedProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

function socialValue(state: Partial<SocialContextValue['state']>, setActivity = jest.fn()): SocialContextValue {
  return {
    state: { ...EMPTY_SOCIAL_STATE, ...state },
    friends: null,
    ensureConnected: () => Promise.resolve(true),
    refreshFriends: () => Promise.resolve(),
    dismissInvite: () => Promise.resolve(),
    setActivity,
    presenceVisibility: 'everyone',
    setPresenceVisibility: () => Promise.resolve({ ok: false, reason: 'network' }),
    handInProgress: false,
    setHandInProgress: () => {},
    onEvent: () => () => {},
  };
}

async function renderWithSocial(value: SocialContextValue): Promise<void> {
  await render(
    <SocialContext.Provider value={value}>
      <LobbyScreen />
    </SocialContext.Provider>,
  );
}

async function openSettings(): Promise<void> {
  await render(<LobbyScreen />);
  await fireEvent.press(screen.getByTestId('open-settings'));
  await screen.findByTestId('settings-name-input');
}

describe('LobbyScreen', () => {
  beforeEach(() => mockPush.mockClear());

  it('shows Guest in the header before a name is saved', async () => {
    await render(<LobbyScreen />);
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Guest');
  });

  it('shows the open-tables panel as coming soon', async () => {
    await render(<LobbyScreen />);
    expect(screen.getByTestId('open-tables')).toHaveTextContent(/coming soon/);
  });

  describe('players', () => {
    it('should open the players directory from the Players tile', async () => {
      // Arrange
      await render(<LobbyScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('tile-players'));

      // Assert
      expect(mockPush).toHaveBeenCalledWith('/players');
    });

    it('should no longer show a Ranking tile (ranking is a tab in the directory)', async () => {
      // Arrange
      await render(<LobbyScreen />);

      // Assert
      expect(screen.queryByTestId('tile-ranking')).not.toBeOnTheScreen();
    });
  });

  describe('friends', () => {
    it('should open the friends screen from the Friends tile', async () => {
      // Arrange
      await render(<LobbyScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('tile-friends'));

      // Assert
      expect(mockPush).toHaveBeenCalledWith('/friends');
    });

    it('should hide the request badge when there are no incoming requests', async () => {
      // Arrange & Act
      await renderWithSocial(socialValue({ connected: true, incomingRequests: 0 }));

      // Assert
      expect(screen.queryByTestId('tile-friends-badge', { includeHiddenElements: true })).not.toBeOnTheScreen();
      expect(screen.getByTestId('tile-friends')).toHaveAccessibleName('Friends');
    });

    it('should show the incoming request count on the Friends tile', async () => {
      // Arrange & Act
      await renderWithSocial(socialValue({ connected: true, incomingRequests: 3 }));

      // Assert
      expect(screen.getByTestId('tile-friends-badge', { includeHiddenElements: true })).toHaveTextContent('3');
      expect(screen.getByTestId('tile-friends')).toHaveAccessibleName('Friends, 3 friend requests');
    });

    it('should cap the request badge at 9+', async () => {
      // Arrange & Act
      await renderWithSocial(socialValue({ connected: true, incomingRequests: 12 }));

      // Assert
      expect(screen.getByTestId('tile-friends-badge', { includeHiddenElements: true })).toHaveTextContent('9+');
      expect(screen.getByTestId('tile-friends')).toHaveAccessibleName('Friends, 12 friend requests');
    });

    it('should show Online on the profile chip while connected', async () => {
      // Arrange & Act
      await renderWithSocial(socialValue({ connected: true }));

      // Assert
      expect(screen.getByTestId('profile-status')).toHaveTextContent('Online');
    });

    it('should show Offline on the profile chip while disconnected', async () => {
      // Arrange & Act
      await render(<LobbyScreen />);

      // Assert
      expect(screen.getByTestId('profile-status')).toHaveTextContent('Offline');
    });

    it('should set the lobby activity when the home screen is focused', async () => {
      // Arrange
      const setActivity = jest.fn();

      // Act
      await renderWithSocial(socialValue({ connected: true }, setActivity));

      // Assert
      expect(setActivity).toHaveBeenCalledWith('lobby');
    });
  });

  describe('private tables', () => {
    it('should enable the Private table tile', async () => {
      // Arrange & Act
      await render(<LobbyScreen />);

      // Assert
      expect(screen.getByTestId('tile-private')).toBeEnabled();
    });

    it('should open the private table screen from the Private table tile', async () => {
      // Arrange
      await render(<LobbyScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('tile-private'));

      // Assert
      expect(mockPush).toHaveBeenCalledWith('/private');
    });

    it('should open the join sheet from Join with code', async () => {
      // Arrange
      await render(<LobbyScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('join-code-entry'));

      // Assert
      expect(screen.getByTestId('join-code-sheet')).toBeOnTheScreen();
    });

    it('should navigate to the table route with the code when joining', async () => {
      // Arrange
      await render(<LobbyScreen />);
      await fireEvent.press(screen.getByTestId('join-code-entry'));
      await fireEvent.changeText(screen.getByTestId('join-code-input'), 'k7m-2qx');

      // Act
      await fireEvent.press(screen.getByTestId('join-code-submit'));

      // Assert
      expect(mockPush).toHaveBeenCalledWith({ pathname: '/t/[code]', params: { code: 'K7M2QX' } });
    });

    it('should close the join sheet when joining', async () => {
      // Arrange
      await render(<LobbyScreen />);
      await fireEvent.press(screen.getByTestId('join-code-entry'));
      await fireEvent.changeText(screen.getByTestId('join-code-input'), 'K7M2QX');

      // Act
      await fireEvent.press(screen.getByTestId('join-code-submit'));

      // Assert
      expect(screen.queryByTestId('join-code-sheet')).not.toBeOnTheScreen();
    });

    it('should close the join sheet without navigating when it is dismissed', async () => {
      // Arrange
      await render(<LobbyScreen />);
      await fireEvent.press(screen.getByTestId('join-code-entry'));

      // Act
      await fireEvent.press(screen.getByTestId('sheet-close'));

      // Assert
      expect(screen.queryByTestId('join-code-sheet')).not.toBeOnTheScreen();
    });
  });

  it('opens the finding-players screen from Quick match', async () => {
    await render(<LobbyScreen />);
    expect(screen.getByTestId('tile-quick')).toBeEnabled();
    await fireEvent.press(screen.getByTestId('tile-quick'));
    expect(mockPush).toHaveBeenCalledWith('/finding');
  });

  it('starts a bot game with the chosen settings', async () => {
    await render(<LobbyScreen />);
    await fireEvent.press(screen.getByTestId('tile-bots'));
    expect(screen.getByTestId('bots-sheet')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('mode-2'));
    await fireEvent.press(screen.getByTestId('target-11'));
    await fireEvent.press(screen.getByTestId('level-hard'));
    await fireEvent.press(screen.getByTestId('start'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/game', params: { players: '2', target: '11', level: 'hard' } });
  });

  it('opens settings with the table style picker', async () => {
    await render(<LobbyScreen />);
    await fireEvent.press(screen.getByTestId('open-settings'));
    expect(screen.getByTestId('skin-cafe')).toBeOnTheScreen();
    expect(screen.getByTestId('skin-minimal')).toBeOnTheScreen();
    expect(screen.getByTestId('skin-sahara')).toBeOnTheScreen();
    expect(screen.getByTestId('skin-sidi')).toBeOnTheScreen();
    expect(screen.getByTestId('skin-neon')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sheet-close'));
    expect(screen.queryByTestId('settings-sheet')).not.toBeOnTheScreen();
  });

  it('sets the effects and background levels and mutes from Settings', async () => {
    const setSettings = jest.fn();
    await render(
      <SoundContext.Provider value={{ settings: DEFAULT_SOUND_SETTINGS, setSettings, play: jest.fn() }}>
        <LobbyScreen />
      </SoundContext.Provider>,
    );
    await fireEvent.press(screen.getByTestId('open-settings'));
    await fireEvent.press(screen.getByTestId('sound-effects-2'));
    expect(setSettings).toHaveBeenLastCalledWith({ effects: 0.5 });
    await fireEvent.press(screen.getByTestId('sound-ambience-0'));
    expect(setSettings).toHaveBeenLastCalledWith({ ambience: 0 });
    await fireEvent.press(screen.getByTestId('sound-mute-muted'));
    expect(setSettings).toHaveBeenLastCalledWith({ muted: true });
  });

  it('opens how to play with the rules and every scoring point', async () => {
    await render(<LobbyScreen />);
    await fireEvent.press(screen.getByTestId('open-help'));
    expect(screen.getByTestId('how-to-play')).toBeOnTheScreen();
    for (const name of ['Karta', 'Dineri', 'Bermila', '7aya', 'Chkobba']) expect(screen.getByText(name)).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('sheet-close'));
    expect(screen.queryByTestId('help-sheet')).not.toBeOnTheScreen();
  });

  it('switches the whole lobby to Derja from the language picker', async () => {
    await render(
      <LanguageProvider initial="en">
        <LobbyScreen />
      </LanguageProvider>,
    );
    await fireEvent.press(screen.getByTestId('open-settings'));
    await fireEvent.press(screen.getByTestId('language-aeb'));

    await waitFor(() => expect(screen.getByText(/اختار طاولة/)).toBeOnTheScreen());
    expect(screen.getByText(/الإعدادات/)).toBeOnTheScreen();
    expect(screen.getByTestId('language-root')).toHaveStyle({ direction: 'rtl' });

    await AsyncStorage.clear();
    await act(() => i18n.changeLanguage('en'));
  });

  describe('Settings name', () => {
    beforeEach(async () => {
      await seedProfile({
        displayName: 'Hamza',
        namePicked: true,
        renameAvailableAt: null,
        friendCode: null,
        listed: false,
        presenceVisibility: 'everyone',
      });
    });

    afterEach(async () => {
      await AsyncStorage.clear();
      jest.clearAllMocks();
    });

    it('should show the cached name in the header instead of Guest', async () => {
      // Arrange & Act
      await render(<LobbyScreen />);

      // Assert
      expect(await screen.findByText('Hamza')).toBeOnTheScreen();
      expect(screen.getByTestId('profile-name')).toHaveTextContent('Hamza');
    });

    it('should show the new name in the header after a successful save', async () => {
      // Arrange
      mockProfileBackend.setDisplayName.mockResolvedValueOnce({
        ok: true,
        profile: {
          displayName: 'Hédi',
          namePicked: true,
          renameAvailableAt: null,
          friendCode: null,
          listed: false,
          presenceVisibility: 'everyone',
        },
      });
      await openSettings();
      await fireEvent.changeText(screen.getByTestId('settings-name-input'), 'Hédi');

      // Act
      await fireEvent.press(screen.getByTestId('settings-name-submit'));

      // Assert
      await waitFor(() => expect(screen.getByTestId('profile-name')).toHaveTextContent('Hédi'));
    });

    it('should show the cached name when Settings opens', async () => {
      // Arrange
      await render(<LobbyScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('open-settings'));

      // Assert
      expect(await screen.findByTestId('settings-name-input')).toHaveDisplayValue('Hamza');
    });

    it('should not read the profile from the network when Settings opens', async () => {
      // Arrange
      await render(<LobbyScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('open-settings'));
      await screen.findByTestId('settings-name-input');

      // Assert
      expect(mockProfileBackend.getProfile).not.toHaveBeenCalled();
    });

    it('should not save anything when Settings opens', async () => {
      // Arrange
      await render(<LobbyScreen />);

      // Act
      await fireEvent.press(screen.getByTestId('open-settings'));
      await screen.findByTestId('settings-name-input');

      // Assert
      expect(mockProfileBackend.setDisplayName).not.toHaveBeenCalled();
    });

    it('should keep Save disabled until the name changes', async () => {
      // Arrange
      await openSettings();

      // Act
      await fireEvent.changeText(screen.getByTestId('settings-name-input'), ' Hamza ');

      // Assert
      expect(screen.getByTestId('settings-name-submit')).toBeDisabled();
    });

    it('should save a changed name through the profile backend', async () => {
      // Arrange
      mockProfileBackend.setDisplayName.mockResolvedValueOnce({
        ok: true,
        profile: {
          displayName: 'Hédi',
          namePicked: true,
          renameAvailableAt: null,
          friendCode: null,
          listed: false,
          presenceVisibility: 'everyone',
        },
      });
      await openSettings();
      await fireEvent.changeText(screen.getByTestId('settings-name-input'), 'Hédi');

      // Act
      await fireEvent.press(screen.getByTestId('settings-name-submit'));

      // Assert
      expect(mockProfileBackend.setDisplayName).toHaveBeenCalledWith('Hédi');
    });

    it('should show the saved line after a successful save', async () => {
      // Arrange
      mockProfileBackend.setDisplayName.mockResolvedValueOnce({
        ok: true,
        profile: {
          displayName: 'Hédi',
          namePicked: true,
          renameAvailableAt: null,
          friendCode: null,
          listed: false,
          presenceVisibility: 'everyone',
        },
      });
      await openSettings();
      await fireEvent.changeText(screen.getByTestId('settings-name-input'), 'Hédi');

      // Act
      await fireEvent.press(screen.getByTestId('settings-name-submit'));

      // Assert
      expect(await screen.findByTestId('settings-name-saved')).toHaveTextContent('Name saved');
    });

    it('should show the rate-limit error when the server refuses the rename', async () => {
      // Arrange
      mockProfileBackend.setDisplayName.mockResolvedValueOnce({ ok: false, reason: 'name_rate_limited' });
      await openSettings();
      await fireEvent.changeText(screen.getByTestId('settings-name-input'), 'Hédi');

      // Act
      await fireEvent.press(screen.getByTestId('settings-name-submit'));

      // Assert
      expect(await screen.findByTestId('settings-name-error')).toHaveTextContent(
        'You changed your name recently. Try again later.',
      );
    });

    it('should show the cooldown from the refreshed cache when the rename is rate limited', async () => {
      // Arrange
      mockProfileBackend.setDisplayName.mockImplementationOnce(async () => {
        // The real backend refreshes the cache with the server cooldown before answering.
        await seedProfile({
          displayName: 'Hamza',
          namePicked: true,
          renameAvailableAt: Date.now() + 30 * MINUTE,
          friendCode: null,
          listed: false,
          presenceVisibility: 'everyone',
        });
        return { ok: false, reason: 'name_rate_limited' };
      });
      await openSettings();
      await fireEvent.changeText(screen.getByTestId('settings-name-input'), 'Hédi');

      // Act
      await fireEvent.press(screen.getByTestId('settings-name-submit'));

      // Assert
      expect(await screen.findByTestId('settings-name-cooldown')).toHaveTextContent('You can rename again in 30 min');
    });

    it('should show the cached cooldown when Settings opens during one', async () => {
      // Arrange
      await seedProfile({
        displayName: 'Hamza',
        namePicked: true,
        renameAvailableAt: Date.now() + 10 * MINUTE,
        friendCode: null,
        listed: false,
        presenceVisibility: 'everyone',
      });

      // Act
      await openSettings();

      // Assert
      expect(screen.getByTestId('settings-name-cooldown')).toHaveTextContent('You can rename again in 10 min');
    });
  });
});
