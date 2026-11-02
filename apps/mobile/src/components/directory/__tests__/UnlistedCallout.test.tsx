/**
 * UnlistedCallout: shown only for a player whose cached profile says they are
 * not listed. A dismissal is device-local; choosing a name hides it because the
 * save is what lists the player.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { en } from '@/i18n/locales/en';
import {
  loadCachedProfile,
  subscribeProfile,
  type Profile,
  type ProfileBackend,
  type SetNameResult,
} from '@/online/profile';
import { getProfileBackend } from '@/online/services';

import { UNLISTED_DISMISSED_KEY, UnlistedCallout } from '../UnlistedCallout';

jest.mock('@/online/profile', () => ({
  loadCachedProfile: jest.fn(),
  subscribeProfile: jest.fn(),
}));

jest.mock('@/online/services', () => ({
  getProfileBackend: jest.fn(),
}));

const mockedLoadCachedProfile = jest.mocked(loadCachedProfile);
const mockedSubscribeProfile = jest.mocked(subscribeProfile);
const mockedGetProfileBackend = jest.mocked(getProfileBackend);

function profileOf(overrides: Partial<Profile> = {}): Profile {
  return {
    displayName: 'Hamza',
    namePicked: true,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
    ...overrides,
  };
}

const unlisted = (): Profile => profileOf({ listed: false });
const listed = (): Profile => profileOf({ listed: true });

type FakeProfileBackend = ProfileBackend & {
  getProfile: jest.Mock<Promise<Profile>, []>;
  setDisplayName: jest.Mock<Promise<SetNameResult>, [string]>;
};

function makeProfileBackend(): FakeProfileBackend {
  return {
    getProfile: jest.fn(async () => profileOf()),
    setDisplayName: jest.fn(
      async (name: string): Promise<SetNameResult> => ({
        ok: true,
        profile: profileOf({ displayName: name, listed: true }),
      }),
    ),
  };
}

/** Lets the profile-cache and storage promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function renderCallout() {
  const view = await render(<UnlistedCallout />);
  await settle();
  return view;
}

/** The profile channel's subscribers, captured through the mocked `subscribeProfile`. */
let listeners: ((profile: Profile) => void)[];
let unsubscribes: jest.Mock[];

/** Publishes a fresh profile to the mounted callout, as the backend would. */
function emitProfile(profile: Profile): void {
  for (const listener of [...listeners]) listener(profile);
}

async function openNameSheet(): Promise<void> {
  await fireEvent.press(screen.getByTestId('directory-unlisted-choose-name'));
  await screen.findByTestId('directory-unlisted-sheet');
}

describe('UnlistedCallout', () => {
  let backend: FakeProfileBackend;

  beforeEach(async () => {
    await AsyncStorage.clear();
    backend = makeProfileBackend();
    mockedLoadCachedProfile.mockResolvedValue(unlisted());
    mockedGetProfileBackend.mockReturnValue(backend);
    listeners = [];
    unsubscribes = [];
    mockedSubscribeProfile.mockImplementation((listener) => {
      listeners.push(listener);
      const unsubscribe = jest.fn(() => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      });
      unsubscribes.push(unsubscribe);
      return unsubscribe;
    });
  });

  afterEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('should read the account once when nothing is cached, then show the unlisted state', async () => {
    // Arrange
    mockedLoadCachedProfile.mockResolvedValue(null);
    backend.getProfile.mockResolvedValue(unlisted());

    // Act
    await renderCallout();

    // Assert
    expect(backend.getProfile).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('directory-unlisted')).toBeOnTheScreen();
  });

  it('should render nothing when a fresh read of the account says the player is listed', async () => {
    // Arrange
    mockedLoadCachedProfile.mockResolvedValue(null);
    backend.getProfile.mockResolvedValue(listed());

    // Act
    await renderCallout();

    // Assert
    expect(screen.queryByTestId('directory-unlisted')).not.toBeOnTheScreen();
  });

  it('should render nothing, and not retry, when the fresh read fails', async () => {
    // Arrange
    mockedLoadCachedProfile.mockResolvedValue(null);
    backend.getProfile.mockRejectedValue(new Error('offline'));

    // Act
    await renderCallout();

    // Assert
    expect(screen.queryByTestId('directory-unlisted')).not.toBeOnTheScreen();
    expect(backend.getProfile).toHaveBeenCalledTimes(1);
  });

  it('should render nothing when the cached profile says the player is listed', async () => {
    // Arrange
    mockedLoadCachedProfile.mockResolvedValue(listed());

    // Act
    await renderCallout();

    // Assert
    expect(screen.queryByTestId('directory-unlisted')).not.toBeOnTheScreen();
  });

  it('should explain the unlisted state when the cached profile says so', async () => {
    // Arrange & Act
    await renderCallout();

    // Assert
    expect(screen.getByTestId('directory-unlisted')).toHaveTextContent(en.directory.unlisted.title, {
      exact: false,
    });
    expect(screen.getByTestId('directory-unlisted')).toHaveTextContent(en.directory.unlisted.body, {
      exact: false,
    });
  });

  it('should stay hidden when a dismissal was already stored', async () => {
    // Arrange
    await AsyncStorage.setItem(UNLISTED_DISMISSED_KEY, '1');

    // Act
    await renderCallout();

    // Assert
    expect(screen.queryByTestId('directory-unlisted')).not.toBeOnTheScreen();
  });

  it('should hide the callout when dismissed', async () => {
    // Arrange
    await renderCallout();

    // Act
    await fireEvent.press(screen.getByTestId('directory-unlisted-dismiss'));

    // Assert
    expect(screen.queryByTestId('directory-unlisted')).not.toBeOnTheScreen();
  });

  it('should persist the dismissal for the device', async () => {
    // Arrange
    await renderCallout();

    // Act
    await fireEvent.press(screen.getByTestId('directory-unlisted-dismiss'));
    await settle();

    // Assert
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(UNLISTED_DISMISSED_KEY, '1');
  });

  it('should open the name form prefilled with the current name', async () => {
    // Arrange
    await renderCallout();

    // Act
    await openNameSheet();

    // Assert
    expect(screen.getByTestId('directory-unlisted-name-input')).toHaveDisplayValue('Hamza');
  });

  it('should hide the callout after a successful name save', async () => {
    // Arrange
    await renderCallout();
    await openNameSheet();
    await fireEvent.changeText(screen.getByTestId('directory-unlisted-name-input'), 'Nadia');

    // Act
    await fireEvent.press(screen.getByTestId('directory-unlisted-name-submit'));
    await settle();

    // Assert
    expect(screen.queryByTestId('directory-unlisted')).not.toBeOnTheScreen();
  });

  it('should save the typed name through the profile backend', async () => {
    // Arrange
    await renderCallout();
    await openNameSheet();
    await fireEvent.changeText(screen.getByTestId('directory-unlisted-name-input'), 'Nadia');

    // Act
    await fireEvent.press(screen.getByTestId('directory-unlisted-name-submit'));
    await settle();

    // Assert
    expect(backend.setDisplayName).toHaveBeenCalledWith('Nadia');
  });

  it('should keep the callout and show the reason when the save fails', async () => {
    // Arrange
    backend.setDisplayName.mockResolvedValueOnce({ ok: false, reason: 'name_not_allowed' });
    await renderCallout();
    await openNameSheet();
    await fireEvent.changeText(screen.getByTestId('directory-unlisted-name-input'), 'Nadia');

    // Act
    await fireEvent.press(screen.getByTestId('directory-unlisted-name-submit'));
    await settle();

    // Assert
    expect(screen.getByTestId('directory-unlisted')).toBeOnTheScreen();
    expect(screen.getByTestId('directory-unlisted-name-error')).toHaveTextContent(en.name.errors.name_not_allowed);
  });

  it('should hide the callout when a name claimed elsewhere lists the player, without a remount', async () => {
    // Arrange: a fresh guest sees the callout.
    await renderCallout();
    expect(screen.getByTestId('directory-unlisted')).toBeOnTheScreen();

    // Act: Add's name gate saves through the profile backend, which publishes
    // the fresh, listed profile on the module channel.
    await act(async () => {
      emitProfile(listed());
    });

    // Assert: the same mounted card is gone.
    expect(screen.queryByTestId('directory-unlisted')).not.toBeOnTheScreen();
  });

  it('should unsubscribe from profile changes on unmount', async () => {
    // Arrange
    const view = await renderCallout();
    expect(unsubscribes).toHaveLength(1);

    // Act
    await view.unmount();

    // Assert
    expect(unsubscribes[0]).toHaveBeenCalledTimes(1);
    expect(listeners).toHaveLength(0);
  });
});
