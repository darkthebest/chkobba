/**
 * PrivacySettings: the "Who can see you" radio in lobby Settings. It saves the
 * choice through the social context, shows one inline alert on failure, and
 * refuses to fire a save for the choice already selected or while one runs.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { en } from '@/i18n/locales/en';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';

import { PrivacySettings } from '../PrivacySettings';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function makeSocial(overrides: Partial<SocialContextValue> = {}): SocialContextValue {
  return {
    state: EMPTY_SOCIAL_STATE,
    friends: null,
    ensureConnected: jest.fn(() => Promise.resolve(true)),
    refreshFriends: jest.fn(() => Promise.resolve()),
    dismissInvite: jest.fn(() => Promise.resolve()),
    setActivity: jest.fn(),
    presenceVisibility: 'everyone',
    setPresenceVisibility: jest.fn(() => Promise.resolve({ ok: true, visibility: 'nobody', updatedAt: 1 })),
    handInProgress: false,
    setHandInProgress: jest.fn(),
    onEvent: jest.fn(() => () => undefined),
    ...overrides,
  };
}

/** Lets the save promise settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function renderSettings(social: SocialContextValue = makeSocial()): Promise<SocialContextValue> {
  await render(
    <SocialContext.Provider value={social}>
      <PrivacySettings />
    </SocialContext.Provider>,
  );
  return social;
}

describe('PrivacySettings', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should show the saved choice as the checked radio', async () => {
    // Arrange & Act
    await renderSettings();

    // Assert
    expect(screen.getByTestId('privacy-everyone')).toBeChecked();
    expect(screen.getByTestId('privacy-nobody')).not.toBeChecked();
  });

  it('should save Nobody when Nobody is pressed', async () => {
    // Arrange
    const social = await renderSettings();

    // Act
    await fireEvent.press(screen.getByTestId('privacy-nobody'));
    await settle();

    // Assert
    expect(social.setPresenceVisibility).toHaveBeenCalledWith('nobody');
  });

  it('should not save anything when the current choice is pressed', async () => {
    // Arrange
    const social = await renderSettings();

    // Act
    await fireEvent.press(screen.getByTestId('privacy-everyone'));
    await settle();

    // Assert
    expect(social.setPresenceVisibility).not.toHaveBeenCalled();
  });

  it('should show the inline alert when the save fails', async () => {
    // Arrange
    const social = makeSocial({
      setPresenceVisibility: jest.fn(() => Promise.resolve({ ok: false, reason: 'network' })),
    });
    await renderSettings(social);

    // Act
    await fireEvent.press(screen.getByTestId('privacy-nobody'));
    await settle();

    // Assert
    expect(screen.getByTestId('privacy-error')).toHaveTextContent(en.directory.errors.network);
  });

  it('should keep the saved choice checked when the save fails', async () => {
    // Arrange
    const social = makeSocial({
      setPresenceVisibility: jest.fn(() => Promise.resolve({ ok: false, reason: 'presence_bad_request' })),
    });
    await renderSettings(social);

    // Act
    await fireEvent.press(screen.getByTestId('privacy-nobody'));
    await settle();

    // Assert
    expect(screen.getByTestId('privacy-everyone')).toBeChecked();
  });

  it('should run one save at a time while a choice is in flight', async () => {
    // Arrange
    const answer = deferred<{ ok: true; visibility: 'nobody'; updatedAt: number }>();
    const setPresenceVisibility = jest.fn(() => answer.promise);
    await renderSettings(makeSocial({ setPresenceVisibility }));

    // Act
    await fireEvent.press(screen.getByTestId('privacy-nobody'));
    await fireEvent.press(screen.getByTestId('privacy-everyone'));
    await act(async () => answer.resolve({ ok: true, visibility: 'nobody', updatedAt: 1 }));
    await settle();

    // Assert
    expect(setPresenceVisibility).toHaveBeenCalledTimes(1);
    expect(setPresenceVisibility).toHaveBeenCalledWith('nobody');
  });
});
