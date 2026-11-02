/**
 * InviteFriendsSheet: the private room's "Invite friends" list. A fake
 * FriendsBackend and ProfileBackend are injected, and availability comes from
 * a SocialContext value built here.
 */
import { FRIEND_STATE } from '@chkobba/protocol';
import { FIXTURE_ROOM_CODE } from '@chkobba/protocol/testing';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { FriendEntry, FriendsBackend, FriendsSnapshot, InviteResult } from '@/online/friends';
import type { Availability } from '@/online/presence';
import type { Profile, ProfileBackend, SetNameResult } from '@/online/profile';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';

import { InviteFriendsSheet } from '../InviteFriendsSheet';

// The real module builds a nakama-js client; every test injects its backends instead.
jest.mock('@/online/services', () => ({
  getFriendsBackend: () => {
    throw new Error('getFriendsBackend must not be used in these tests');
  },
  getProfileBackend: () => {
    throw new Error('getProfileBackend must not be used in these tests');
  },
}));

const CODE = FIXTURE_ROOM_CODE;

function friend(userId: string, displayName: string): FriendEntry {
  return { userId, displayName, code: null, state: FRIEND_STATE.FRIEND, updatedAt: 0 };
}

const FRIENDS: readonly FriendEntry[] = [
  friend('u-omar', 'Omar'),
  friend('u-sami', 'Sami'),
  friend('u-lina', 'Lina'),
  friend('u-nadia', 'Nadia'),
  friend('u-karim', 'Karim'),
];

const AVAILABILITY: { readonly [userId: string]: Availability } = {
  'u-omar': 'offline',
  'u-sami': 'playing',
  'u-lina': 'room',
  'u-nadia': 'online',
  // u-karim has no presence: offline.
};

function makeBackend(friends: readonly FriendEntry[] = FRIENDS) {
  const snapshot: FriendsSnapshot = { friends, incoming: [], outgoing: [], blocked: [] };
  return {
    list: jest.fn((): Promise<FriendsSnapshot> => Promise.resolve(snapshot)),
    recentPlayers: jest.fn(() => Promise.resolve([])),
    lookupCode: jest.fn(() => Promise.resolve({ ok: false as const, reason: 'not_found' as const })),
    add: jest.fn(() => Promise.resolve({ ok: true as const })),
    remove: jest.fn(() => Promise.resolve({ ok: true as const })),
    block: jest.fn(() => Promise.resolve({ ok: true as const })),
    invite: jest.fn((_userId: string, _code: string): Promise<InviteResult> => Promise.resolve({ ok: true, sent: true })),
  } satisfies FriendsBackend;
}

function makeProfile(namePicked: boolean) {
  const profile: Profile = {
    displayName: 'Guest4821',
    namePicked,
    renameAvailableAt: null,
    friendCode: 'HJKM6789',
    listed: false,
    presenceVisibility: 'everyone',
  };
  return {
    getProfile: jest.fn((): Promise<Profile> => Promise.resolve(profile)),
    setDisplayName: jest.fn(
      (name: string): Promise<SetNameResult> =>
        Promise.resolve({ ok: true, profile: { ...profile, displayName: name, namePicked: true } }),
    ),
  } satisfies ProfileBackend;
}

function socialValue(): SocialContextValue {
  return {
    state: { ...EMPTY_SOCIAL_STATE, connected: true, availability: AVAILABILITY },
    friends: null,
    ensureConnected: jest.fn(() => Promise.resolve(true)),
    refreshFriends: () => Promise.resolve(),
    dismissInvite: () => Promise.resolve(),
    setActivity: () => {},
    presenceVisibility: 'everyone',
    setPresenceVisibility: () => Promise.resolve({ ok: false, reason: 'network' }),
    handInProgress: false,
    setHandInProgress: () => {},
    onEvent: () => () => {},
  };
}

/** Lets backend and profile promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function setup(options: { namePicked?: boolean; friends?: readonly FriendEntry[] } = {}) {
  const backend = makeBackend(options.friends);
  const profile = makeProfile(options.namePicked ?? true);
  const social = socialValue();
  const onClose = jest.fn();
  await render(
    <SocialContext.Provider value={social}>
      <InviteFriendsSheet roomCode={CODE} onClose={onClose} friends={backend} profile={profile} />
    </SocialContext.Provider>,
  );
  await settle();
  return { backend, profile, social, onClose };
}

async function press(testID: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(testID));
  await settle();
}

describe('InviteFriendsSheet', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should connect and load the friend list on open', async () => {
    // Arrange / Act
    const { backend, social } = await setup();

    // Assert
    expect(social.ensureConnected).toHaveBeenCalled();
    expect(backend.list).toHaveBeenCalled();
    expect(screen.getByTestId('invite-sheet')).toBeOnTheScreen();
  });

  it('should sort online, then in a room, in a game, offline (by name within each)', async () => {
    // Arrange / Act
    await setup();

    // Assert
    const order = screen.getAllByTestId(/^invite-row-/).map((row) => row.props.testID);
    expect(order).toEqual(['invite-row-u-nadia', 'invite-row-u-lina', 'invite-row-u-sami', 'invite-row-u-karim', 'invite-row-u-omar']);
  });

  it('should show each friend\'s availability and let offline friends be invited', async () => {
    // Arrange / Act
    await setup();

    // Assert
    expect(screen.getByText('In a room')).toBeOnTheScreen();
    expect(screen.getAllByText('Offline')).toHaveLength(2);
    expect(screen.getByTestId('invite-send-u-omar')).toBeEnabled();
  });

  it('should label Invite with the friend\'s name', async () => {
    // Arrange / Act
    await setup();

    // Assert
    expect(screen.getByLabelText('Invite, Sami')).toBeOnTheScreen();
  });

  it('should show the empty state without friends', async () => {
    // Arrange / Act
    await setup({ friends: [] });

    // Assert
    expect(screen.getByTestId('invite-empty')).toHaveTextContent('No friends online right now. Add friends from the Friends screen.');
  });

  it('should invite with the room code and then show Invited, disabled', async () => {
    // Arrange
    const { backend } = await setup();

    // Act
    await press('invite-send-u-sami');

    // Assert
    expect(backend.invite).toHaveBeenCalledWith('u-sami', CODE);
    expect(screen.getByTestId('invite-sent-u-sami')).toBeDisabled();
    expect(screen.getByTestId('invite-sent-u-sami')).toHaveTextContent('Invited');
    expect(screen.queryByTestId('invite-send-u-sami')).not.toBeOnTheScreen();
  });

  it('should show Invited when the server reports sent: false', async () => {
    // Arrange
    const { backend } = await setup();
    backend.invite.mockResolvedValueOnce({ ok: true, sent: false });

    // Act
    await press('invite-send-u-nadia');

    // Assert
    expect(screen.getByTestId('invite-sent-u-nadia')).toBeOnTheScreen();
    expect(screen.queryByTestId('invite-error-u-nadia')).not.toBeOnTheScreen();
  });

  it('should show a localized error on that row and keep Invite available', async () => {
    // Arrange
    const { backend } = await setup();
    backend.invite.mockResolvedValueOnce({ ok: false, reason: 'invite_rate_limited' });

    // Act
    await press('invite-send-u-lina');

    // Assert
    expect(screen.getByTestId('invite-error-u-lina')).toHaveTextContent('Too many invites. Try again in a few minutes.');
    expect(screen.getByTestId('invite-send-u-lina')).toBeEnabled();
    expect(screen.queryByTestId('invite-error-u-sami')).not.toBeOnTheScreen();
  });

  it('should treat a rejected invite as a network error', async () => {
    // Arrange
    const { backend } = await setup();
    backend.invite.mockRejectedValueOnce(new Error('offline'));

    // Act
    await press('invite-send-u-lina');

    // Assert
    expect(screen.getByTestId('invite-error-u-lina')).toHaveTextContent(
      "Couldn't reach the server. Check your connection and try again.",
    );
  });

  describe('name gate', () => {
    it('should open the name gate on the first invite before a name is picked', async () => {
      // Arrange
      const { backend } = await setup({ namePicked: false });

      // Act
      await press('invite-send-u-sami');

      // Assert
      expect(screen.getByTestId('friends-name-gate')).toBeOnTheScreen();
      expect(backend.invite).not.toHaveBeenCalled();
    });

    it('should send the invite after Continue', async () => {
      // Arrange
      const { backend, profile } = await setup({ namePicked: false });
      await press('invite-send-u-sami');

      // Act
      await press('finding-name-submit');

      // Assert
      expect(profile.setDisplayName).toHaveBeenCalled();
      expect(backend.invite).toHaveBeenCalledWith('u-sami', CODE);
      expect(screen.queryByTestId('friends-name-gate')).not.toBeOnTheScreen();
      expect(screen.getByTestId('invite-sent-u-sami')).toBeOnTheScreen();
    });

    it('should not invite when the name gate is cancelled', async () => {
      // Arrange
      const { backend } = await setup({ namePicked: false });
      await press('invite-send-u-sami');

      // Act
      await press('finding-name-cancel');

      // Assert
      expect(backend.invite).not.toHaveBeenCalled();
      expect(screen.getByTestId('invite-send-u-sami')).toBeOnTheScreen();
    });
  });

  it('should close from the sheet\'s close button', async () => {
    // Arrange
    const { onClose } = await setup();

    // Act
    await press('sheet-close');

    // Assert
    expect(onClose).toHaveBeenCalled();
  });
});
