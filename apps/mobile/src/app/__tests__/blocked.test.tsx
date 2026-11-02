/**
 * `/blocked`: the management surface for blocks, reached from Friends. It reads
 * the same friends snapshot and the same controller as `/friends`, so an
 * Unblock here has to update the shared lists without a reload.
 */
import { FRIEND_STATE } from '@chkobba/protocol';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import BlockedScreen from '@/app/blocked';
import type { FriendActionResult, FriendEntry, FriendsBackend, FriendsSnapshot } from '@/online/friends';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';

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
}));

jest.mock('@/online/services', () => ({
  getProfileBackend: () => {
    throw new Error('getProfileBackend must not be used in these tests');
  },
  getFriendsBackend: () => {
    throw new Error('getFriendsBackend must not be used in these tests');
  },
}));

function blocked(userId: string, displayName: string): FriendEntry {
  return { userId, displayName, code: null, state: FRIEND_STATE.BLOCKED, updatedAt: 0 };
}

/** One blocked player; `unblock` succeeds and the next load returns an empty list. */
function makeBackend(initial: readonly FriendEntry[] = [blocked('u-lina', 'Lina')]) {
  let snapshot: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: initial };
  const backend = {
    list: jest.fn((): Promise<FriendsSnapshot> => Promise.resolve(snapshot)),
    recentPlayers: jest.fn(() => Promise.resolve([])),
    lookupCode: jest.fn(),
    add: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    remove: jest.fn(
      (_id: string): Promise<FriendActionResult> => {
        // Unblock is `remove`: the server drops the edge, so the next list reflects it.
        snapshot = { ...snapshot, blocked: [] };
        return Promise.resolve({ ok: true });
      },
    ),
    block: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    invite: jest.fn(() => Promise.resolve({ ok: true as const, sent: true })),
  } satisfies FriendsBackend;
  return backend;
}

function makeSocial(friends: FriendsBackend): SocialContextValue {
  return {
    state: EMPTY_SOCIAL_STATE,
    friends,
    error: null,
    ensureConnected: jest.fn(() => Promise.resolve(true)),
    refreshFriends: jest.fn(() => Promise.resolve()),
    invites: [],
    dismissInvite: jest.fn(),
    activity: null,
    setActivity: jest.fn(),
    presenceVisibility: 'everyone',
    setPresenceVisibility: jest.fn(() => Promise.resolve({ ok: false, reason: 'network' })),
    handInProgress: false,
    setHandInProgress: jest.fn(),
    onEvent: jest.fn(() => () => undefined),
  } as unknown as SocialContextValue;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function renderScreen(backend: FriendsBackend = makeBackend()) {
  await render(
    <SocialContext.Provider value={makeSocial(backend)}>
      <BlockedScreen />
    </SocialContext.Provider>,
  );
  await settle();
  return backend;
}

describe('/blocked', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should list every blocked player', async () => {
    // Arrange
    const backend = makeBackend([blocked('u-lina', 'Lina'), blocked('u-omar', 'Omar')]);

    // Act
    await renderScreen(backend);

    // Assert
    expect(screen.getByTestId('friend-row-u-lina')).toBeOnTheScreen();
    expect(screen.getByTestId('friend-row-u-omar')).toBeOnTheScreen();
  });

  it('should show an empty state when nothing is blocked', async () => {
    // Arrange
    // (backend with no blocks)

    // Act
    await renderScreen(makeBackend([]));

    // Assert
    expect(screen.getByTestId('blocked-empty')).toHaveTextContent("You haven't blocked anyone.");
  });

  it('should unblock the player from the row and drop it from the list', async () => {
    // Arrange
    const backend = await renderScreen();

    // Act
    await fireEvent.press(screen.getByTestId('friend-unblock-u-lina'));
    await settle();

    // Assert
    expect(backend.remove).toHaveBeenCalledWith('u-lina');
    expect(screen.queryByTestId('friend-row-u-lina')).not.toBeOnTheScreen();
  });

  it('should go back to the friends screen', async () => {
    // Arrange
    await renderScreen();

    // Act
    await fireEvent.press(screen.getByTestId('blocked-back'));

    // Assert
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('should fall back to /friends when there is no history (a deep link)', async () => {
    // Arrange
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await renderScreen();

    // Act
    await fireEvent.press(screen.getByTestId('blocked-back'));

    // Assert
    expect(mockRouter.replace).toHaveBeenCalledWith('/friends');
  });
});
