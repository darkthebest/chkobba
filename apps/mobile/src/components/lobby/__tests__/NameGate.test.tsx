/**
 * NameGate: the first-visit "Choose your name" step in front of an online flow
 * (ADR-0001). Driven by a fake ProfileBackend; no network.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { NameGate } from '@/components/lobby/NameGate';
import type { Profile, ProfileBackend, SetNameResult } from '@/online/profile';

type FakeProfile = ProfileBackend & {
  getProfile: jest.Mock<Promise<Profile>, []>;
  setDisplayName: jest.Mock<Promise<SetNameResult>, [string]>;
};

function fakeProfile(profile: Profile): FakeProfile {
  return {
    getProfile: jest.fn(async () => profile),
    setDisplayName: jest.fn(
      async (name: string): Promise<SetNameResult> => ({
        ok: true,
        profile: {
          displayName: name,
          namePicked: true,
          renameAvailableAt: null,
          friendCode: null,
          listed: false,
          presenceVisibility: 'everyone',
        },
      }),
    ),
  };
}

const firstVisit = (): FakeProfile =>
  fakeProfile({
    displayName: 'Guest4821',
    namePicked: false,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
  });
const returning = (): FakeProfile =>
  fakeProfile({
    displayName: 'Hamza',
    namePicked: true,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
  });

/** Lets the profile promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function renderGate(profile: ProfileBackend, onCancel = jest.fn()) {
  await render(
    <NameGate profile={profile} onCancel={onCancel} loadingFallback={<Text testID="gate-loading">Loading</Text>}>
      <Text testID="gate-children">Inside</Text>
    </NameGate>,
  );
  return { onCancel };
}

describe('NameGate', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should show the loading fallback while the profile loads', async () => {
    // Arrange
    const profile = firstVisit();
    profile.getProfile.mockReturnValueOnce(new Promise<Profile>(() => undefined));

    // Act
    await renderGate(profile);

    // Assert
    expect(screen.getByTestId('gate-loading')).toBeOnTheScreen();
  });

  it('should not render the children while the profile loads', async () => {
    // Arrange
    const profile = firstVisit();
    profile.getProfile.mockReturnValueOnce(new Promise<Profile>(() => undefined));

    // Act
    await renderGate(profile);

    // Assert
    expect(screen.queryByTestId('gate-children')).not.toBeOnTheScreen();
  });

  it('should show the name form on a first visit', async () => {
    // Arrange
    const profile = firstVisit();

    // Act
    await renderGate(profile);
    await settle();

    // Assert
    expect(screen.getByTestId('finding-name')).toBeOnTheScreen();
  });

  it('should not render the children before a name is picked on a first visit', async () => {
    // Arrange
    const profile = firstVisit();

    // Act
    await renderGate(profile);
    await settle();

    // Assert
    expect(screen.queryByTestId('gate-children')).not.toBeOnTheScreen();
  });

  it('should prefill the name form with the current display name', async () => {
    // Arrange
    const profile = firstVisit();

    // Act
    await renderGate(profile);
    await settle();

    // Assert
    expect(screen.getByTestId('finding-name-input')).toHaveDisplayValue('Guest4821');
  });

  it('should save the unchanged name when Continue is pressed (ADR-0001)', async () => {
    // Arrange
    const profile = firstVisit();
    await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-name-submit'));
    await settle();

    // Assert
    expect(profile.setDisplayName).toHaveBeenCalledWith('Guest4821');
  });

  it('should render the children once the name is saved', async () => {
    // Arrange
    const profile = firstVisit();
    await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-name-submit'));
    await settle();

    // Assert
    expect(screen.getByTestId('gate-children')).toBeOnTheScreen();
  });

  it('should go straight to the children when a name was already picked', async () => {
    // Arrange
    const profile = returning();

    // Act
    await renderGate(profile);
    await settle();

    // Assert
    expect(screen.getByTestId('gate-children')).toBeOnTheScreen();
  });

  it('should not save a name when one was already picked', async () => {
    // Arrange
    const profile = returning();

    // Act
    await renderGate(profile);
    await settle();

    // Assert
    expect(profile.setDisplayName).not.toHaveBeenCalled();
  });

  it('should call onCancel when Cancel is pressed on the name form', async () => {
    // Arrange
    const profile = firstVisit();
    const { onCancel } = await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-name-cancel'));

    // Assert
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should show the retry panel when the profile fails to load', async () => {
    // Arrange
    const profile = firstVisit();
    profile.getProfile.mockRejectedValueOnce(new Error('offline'));

    // Act
    await renderGate(profile);
    await settle();

    // Assert
    expect(screen.getByTestId('finding-error')).toHaveTextContent(
      'The game server could not be reached. Check your connection and try again.',
    );
  });

  it('should reload the profile when Try again is pressed', async () => {
    // Arrange
    const profile = firstVisit();
    profile.getProfile.mockRejectedValueOnce(new Error('offline'));
    await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-retry'));
    await settle();

    // Assert
    expect(profile.getProfile).toHaveBeenCalledTimes(2);
  });

  it('should show the name form after a successful retry', async () => {
    // Arrange
    const profile = firstVisit();
    profile.getProfile.mockRejectedValueOnce(new Error('offline'));
    await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-retry'));
    await settle();

    // Assert
    expect(screen.getByTestId('finding-name')).toBeOnTheScreen();
  });

  it('should call onCancel when Back is pressed on the retry panel', async () => {
    // Arrange
    const profile = firstVisit();
    profile.getProfile.mockRejectedValueOnce(new Error('offline'));
    const { onCancel } = await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-back'));

    // Assert
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('should stay on the name form when the server rejects the name', async () => {
    // Arrange
    const profile = firstVisit();
    profile.setDisplayName.mockResolvedValueOnce({ ok: false, reason: 'name_not_allowed' });
    await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-name-submit'));
    await settle();

    // Assert
    expect(screen.queryByTestId('gate-children')).not.toBeOnTheScreen();
  });

  it('should show the server error when the server rejects the name', async () => {
    // Arrange
    const profile = firstVisit();
    profile.setDisplayName.mockResolvedValueOnce({ ok: false, reason: 'name_not_allowed' });
    await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-name-submit'));
    await settle();

    // Assert
    expect(screen.getByTestId('finding-name-error')).toHaveTextContent("This name isn't allowed. Try another.");
  });

  it('should show the network error and stay on the form when saving throws', async () => {
    // Arrange
    const profile = firstVisit();
    profile.setDisplayName.mockRejectedValueOnce(new Error('socket closed'));
    await renderGate(profile);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-name-submit'));
    await settle();

    // Assert
    expect(screen.getByTestId('finding-name-error')).toHaveTextContent(
      "Couldn't save your name. Check your connection and try again.",
    );
  });
});
