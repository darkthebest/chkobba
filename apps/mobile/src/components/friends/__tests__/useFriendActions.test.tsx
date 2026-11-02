/**
 * useFriendActions with the real controller and sections:
 * Add and Accept go through the name gate on first use, Remove and Block ask
 * first, Decline, Cancel and Unblock run straight away. A fake FriendsBackend
 * and ProfileBackend are injected; the social context is the empty default.
 */
import { FRIEND_STATE, type FriendState } from '@chkobba/protocol';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import { useFriendsController } from '@/friends/useFriendsController';
import type {
  CodeLookupResult,
  FriendActionResult,
  FriendEntry,
  FriendsBackend,
  FriendsSnapshot,
  RecentPlayerEntry,
} from '@/online/friends';
import type { Profile, ProfileBackend, SetNameResult } from '@/online/profile';

import { FriendsSections } from '../FriendsSections';
import { useFriendActions } from '../useFriendActions';

// The real module builds a nakama-js client; every test injects its backends instead.
jest.mock('@/online/services', () => ({
  getFriendsBackend: () => {
    throw new Error('getFriendsBackend must not be used in these tests');
  },
  getProfileBackend: () => {
    throw new Error('getProfileBackend must not be used in these tests');
  },
}));

function entry(userId: string, displayName: string, state: FriendState): FriendEntry {
  return { userId, displayName, code: null, state, updatedAt: 0 };
}

const SNAPSHOT: FriendsSnapshot = {
  friends: [entry('u-sami', 'Sami', FRIEND_STATE.FRIEND)],
  incoming: [entry('u-nadia', 'Nadia', FRIEND_STATE.REQUEST_RECEIVED)],
  outgoing: [entry('u-omar', 'Omar', FRIEND_STATE.REQUEST_SENT)],
  blocked: [entry('u-lina', 'Lina', FRIEND_STATE.BLOCKED)],
};
const RECENT: readonly RecentPlayerEntry[] = [{ userId: 'u-karim', displayName: 'Karim', lastPlayedAt: 1000, state: null }];

function makeBackend() {
  return {
    list: jest.fn((): Promise<FriendsSnapshot> => Promise.resolve(SNAPSHOT)),
    recentPlayers: jest.fn((): Promise<readonly RecentPlayerEntry[]> => Promise.resolve(RECENT)),
    lookupCode: jest.fn(
      (_code: string): Promise<CodeLookupResult> =>
        Promise.resolve({ ok: true, userId: 'u-zied', displayName: 'Zied', self: false }),
    ),
    add: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    remove: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    block: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    invite: jest.fn(() => Promise.resolve({ ok: true as const, sent: true })),
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

function Harness({ backend, profile }: { backend: FriendsBackend; profile: ProfileBackend }) {
  const controller = useFriendsController({ friends: backend });
  const actions = useFriendActions({ controller, profile });
  return (
    <View>
      <FriendsSections controller={controller} onAction={actions.perform} />
      {actions.sheet}
    </View>
  );
}

/** Lets backend and profile promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function setup(options: { namePicked?: boolean } = {}) {
  const backend = makeBackend();
  const profile = makeProfile(options.namePicked ?? false);
  await render(<Harness backend={backend} profile={profile} />);
  await settle();
  return { backend, profile };
}

async function press(testID: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(testID));
  await settle();
}

describe('useFriendActions', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('name gate before a name is picked', () => {
    it('should not open the name gate just for browsing', async () => {
      // Arrange
      // (first-visit profile)

      // Act
      await setup();

      // Assert
      expect(screen.queryByTestId('friends-name-gate')).not.toBeOnTheScreen();
    });

    it.each([
      ['Add on a recent player', 'recent-add-u-karim'],
      ['Accept on a request', 'friend-accept-u-nadia'],
    ])('should open the name gate on %s', async (_label, testID) => {
      // Arrange
      await setup();

      // Act
      await press(testID);

      // Assert
      expect(screen.getByTestId('friends-name-gate')).toBeOnTheScreen();
    });

    it.each([
      ['Add on a recent player', 'recent-add-u-karim'],
      ['Accept on a request', 'friend-accept-u-nadia'],
    ])('should not call the backend for %s before Continue', async (_label, testID) => {
      // Arrange
      const { backend } = await setup();

      // Act
      await press(testID);

      // Assert
      expect(backend.add).not.toHaveBeenCalled();
    });

    it.each([
      ['Add on a recent player', 'recent-add-u-karim', 'u-karim'],
      ['Accept on a request', 'friend-accept-u-nadia', 'u-nadia'],
    ])('should run %s after Continue', async (_label, testID, userId) => {
      // Arrange
      const { backend } = await setup();
      await press(testID);

      // Act
      await press('finding-name-submit');

      // Assert
      expect(backend.add).toHaveBeenCalledWith(userId);
    });

    it('should save the name on Continue', async () => {
      // Arrange
      const { profile } = await setup();
      await press('recent-add-u-karim');

      // Act
      await press('finding-name-submit');

      // Assert
      expect(profile.setDisplayName).toHaveBeenCalledWith('Guest4821');
    });

    it('should close the name gate after Continue', async () => {
      // Arrange
      await setup();
      await press('recent-add-u-karim');

      // Act
      await press('finding-name-submit');

      // Assert
      expect(screen.queryByTestId('friends-name-gate')).not.toBeOnTheScreen();
    });

    it('should drop the action when the name gate is cancelled', async () => {
      // Arrange
      const { backend } = await setup();
      await press('recent-add-u-karim');

      // Act
      await press('finding-name-cancel');

      // Assert
      expect(backend.add).not.toHaveBeenCalled();
    });

    it('should not ask again for the next Add once a name was picked', async () => {
      // Arrange
      const { backend } = await setup();
      await press('friend-accept-u-nadia');
      await press('finding-name-submit');

      // Act
      await press('recent-add-u-karim');

      // Assert
      expect(backend.add).toHaveBeenCalledWith('u-karim');
    });

    it.each([
      ['Decline', 'friend-decline-u-nadia'],
      ['Cancel request', 'friend-cancel-u-omar'],
      ['Unblock', 'friend-unblock-u-lina'],
    ])('should run %s without the name gate', async (_label, testID) => {
      // Arrange
      await setup();

      // Act
      await press(testID);

      // Assert
      expect(screen.queryByTestId('friends-name-gate')).not.toBeOnTheScreen();
    });

    it.each([
      ['Decline', 'friend-decline-u-nadia', 'u-nadia'],
      ['Cancel request', 'friend-cancel-u-omar', 'u-omar'],
      ['Unblock', 'friend-unblock-u-lina', 'u-lina'],
    ])('should call remove for %s straight away', async (_label, testID, userId) => {
      // Arrange
      const { backend } = await setup();

      // Act
      await press(testID);

      // Assert
      expect(backend.remove).toHaveBeenCalledWith(userId);
    });

    it('should block without the name gate after confirming', async () => {
      // Arrange
      await setup();
      await press('friend-block-u-sami');

      // Act
      await press('friends-confirm-block-ok');

      // Assert
      expect(screen.queryByTestId('friends-name-gate')).not.toBeOnTheScreen();
    });
  });

  describe('name already picked', () => {
    it.each([
      ['Add on a recent player', 'recent-add-u-karim', 'u-karim'],
      ['Accept on a request', 'friend-accept-u-nadia', 'u-nadia'],
    ])('should run %s straight away', async (_label, testID, userId) => {
      // Arrange
      const { backend } = await setup({ namePicked: true });

      // Act
      await press(testID);

      // Assert
      expect(backend.add).toHaveBeenCalledWith(userId);
    });

    it('should never show the name gate', async () => {
      // Arrange
      await setup({ namePicked: true });

      // Act
      await press('recent-add-u-karim');

      // Assert
      expect(screen.queryByTestId('friends-name-gate')).not.toBeOnTheScreen();
    });
  });

  describe('Remove', () => {
    it('should ask before removing a friend', async () => {
      // Arrange
      await setup();

      // Act
      await press('friend-remove-u-sami');

      // Assert
      expect(screen.getByTestId('friends-confirm-remove-body')).toHaveTextContent('Remove Sami from your friends?');
    });

    it('should not remove before the confirmation', async () => {
      // Arrange
      const { backend } = await setup();

      // Act
      await press('friend-remove-u-sami');

      // Assert
      expect(backend.remove).not.toHaveBeenCalled();
    });

    it('should remove the friend after confirming', async () => {
      // Arrange
      const { backend } = await setup();
      await press('friend-remove-u-sami');

      // Act
      await press('friends-confirm-remove-ok');

      // Assert
      expect(backend.remove).toHaveBeenCalledWith('u-sami');
    });

    it('should keep the friend when the confirmation is cancelled', async () => {
      // Arrange
      const { backend } = await setup();
      await press('friend-remove-u-sami');

      // Act
      await press('friends-confirm-remove-cancel');

      // Assert
      expect(backend.remove).not.toHaveBeenCalled();
    });
  });

  describe('Block', () => {
    it('should ask before blocking, naming the player', async () => {
      // Arrange
      await setup();

      // Act
      await press('recent-block-u-karim');

      // Assert
      expect(screen.getByText('Block Karim?')).toBeOnTheScreen();
    });

    it('should block the player after confirming', async () => {
      // Arrange
      const { backend } = await setup();
      await press('recent-block-u-karim');

      // Act
      await press('friends-confirm-block-ok');

      // Assert
      expect(backend.block).toHaveBeenCalledWith('u-karim');
    });

    it('should hide the player from recent players right away', async () => {
      // Arrange
      const backend = makeBackend();
      backend.block.mockReturnValueOnce(new Promise(() => undefined));
      await render(<Harness backend={backend} profile={makeProfile(true)} />);
      await settle();
      await press('recent-block-u-karim');

      // Act
      await press('friends-confirm-block-ok');

      // Assert
      expect(screen.queryByTestId('recent-row-u-karim')).not.toBeOnTheScreen();
    });

    it('should list the player under Blocked right away', async () => {
      // Arrange
      const backend = makeBackend();
      backend.block.mockReturnValueOnce(new Promise(() => undefined));
      await render(<Harness backend={backend} profile={makeProfile(true)} />);
      await settle();
      await press('recent-block-u-karim');

      // Act
      await press('friends-confirm-block-ok');

      // Assert
      expect(screen.getByTestId('friend-row-u-karim')).toBeOnTheScreen();
    });

    it('should not block when the confirmation is cancelled', async () => {
      // Arrange
      const { backend } = await setup();
      await press('recent-block-u-karim');

      // Act
      await press('friends-confirm-block-cancel');

      // Assert
      expect(backend.block).not.toHaveBeenCalled();
    });
  });

  describe('pending and errors', () => {
    it('should disable the row buttons while the action is in flight', async () => {
      // Arrange
      const backend = makeBackend();
      backend.block.mockReturnValueOnce(new Promise(() => undefined));
      await render(<Harness backend={backend} profile={makeProfile(true)} />);
      await settle();
      await press('friend-block-u-sami');

      // Act
      await press('friends-confirm-block-ok');

      // Assert (Sami now sits under Blocked while the block is in flight)
      expect(screen.getByTestId('friend-unblock-u-sami')).toBeDisabled();
    });

    it('should show the localized outgoing-limit error on the row after a failed Add', async () => {
      // Arrange
      const backend = makeBackend();
      backend.add.mockResolvedValueOnce({ ok: false, reason: 'friend_outgoing_limit' });
      await render(<Harness backend={backend} profile={makeProfile(true)} />);
      await settle();

      // Act
      await press('recent-add-u-karim');

      // Assert
      expect(screen.getByTestId('recent-error-u-karim')).toHaveTextContent(
        'You have 50 pending requests. Wait for some answers or cancel a few.',
      );
    });

    it('should offer Add again on the row after a failed Add', async () => {
      // Arrange
      const backend = makeBackend();
      backend.add.mockResolvedValueOnce({ ok: false, reason: 'friend_outgoing_limit' });
      await render(<Harness backend={backend} profile={makeProfile(true)} />);
      await settle();

      // Act
      await press('recent-add-u-karim');

      // Assert
      expect(screen.getByTestId('recent-add-u-karim')).toBeEnabled();
    });
  });
});
