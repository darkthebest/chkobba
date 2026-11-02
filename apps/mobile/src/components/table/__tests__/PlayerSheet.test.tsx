/**
 * PlayerSheet: another human's options at an online table (friend state, Block,
 * emote mute). Driven by a fake FriendsBackend through SocialContext, a fake
 * ProfileBackend for the name gate, and a small stateful EmotesContext.
 */
import { FRIEND_STATE, type FriendState } from '@chkobba/protocol';
import type { Seat } from '@chkobba/rules';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState, type ReactNode } from 'react';

import { EmotesContext, type Emotes } from '@/emotes/useEmotes';
import type { PlayerSheetTarget, TableController } from '@/game/useTableController';
import { i18n } from '@/i18n';
import type { FriendActionResult, FriendEntry, FriendsBackend, FriendsSnapshot } from '@/online/friends';
import type { Profile, ProfileBackend, SetNameResult } from '@/online/profile';
import { getProfileBackend } from '@/online/services';
import { SocialContext, type SocialContextValue, EMPTY_SOCIAL_STATE } from '@/online/socialContext';

import { PlayerSheet, edgeOf } from '../PlayerSheet';

jest.mock('@/online/services', () => ({
  getProfileBackend: jest.fn(),
  getFriendsBackend: jest.fn(() => {
    throw new Error('tests pass the friends backend through SocialContext');
  }),
}));

const AMIRA = 'user-amira';
const TARGET: PlayerSheetTarget = { seat: 1, userId: AMIRA, name: 'Amira' };

type FakeFriends = FriendsBackend & {
  list: jest.Mock<Promise<FriendsSnapshot>, []>;
  add: jest.Mock<Promise<FriendActionResult>, [string]>;
  remove: jest.Mock<Promise<FriendActionResult>, [string]>;
  block: jest.Mock<Promise<FriendActionResult>, [string]>;
};

const EMPTY: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };

function entry(userId: string, state: FriendState): FriendEntry {
  return { userId, displayName: 'Amira', code: null, state, updatedAt: 0 };
}

/** A friend list holding Amira in `state` (or not at all for null). */
function snapshotWith(state: FriendState | null): FriendsSnapshot {
  if (state === null) return EMPTY;
  const e = [entry(AMIRA, state)];
  switch (state) {
    case FRIEND_STATE.FRIEND:
      return { ...EMPTY, friends: e };
    case FRIEND_STATE.REQUEST_SENT:
      return { ...EMPTY, outgoing: e };
    case FRIEND_STATE.REQUEST_RECEIVED:
      return { ...EMPTY, incoming: e };
    case FRIEND_STATE.BLOCKED:
      return { ...EMPTY, blocked: e };
  }
}

function fakeFriends(state: FriendState | null = null): FakeFriends {
  return {
    list: jest.fn(async () => snapshotWith(state)),
    recentPlayers: jest.fn(async () => []),
    lookupCode: jest.fn(async () => ({ ok: false as const, reason: 'not_found' as const })),
    add: jest.fn(async (_userId: string): Promise<FriendActionResult> => ({ ok: true })),
    remove: jest.fn(async (_userId: string): Promise<FriendActionResult> => ({ ok: true })),
    block: jest.fn(async (_userId: string): Promise<FriendActionResult> => ({ ok: true })),
    invite: jest.fn(async () => ({ ok: true as const, sent: true })),
  };
}

function fakeProfile(namePicked: boolean): ProfileBackend & { setDisplayName: jest.Mock } {
  const profile: Profile = {
    displayName: 'Guest4821',
    namePicked,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
  };
  return {
    getProfile: jest.fn(async () => profile),
    setDisplayName: jest.fn(
      async (name: string): Promise<SetNameResult> => ({ ok: true, profile: { ...profile, displayName: name, namePicked: true } }),
    ),
  };
}

function socialWith(friends: FriendsBackend): SocialContextValue & { refreshFriends: jest.Mock } {
  return {
    state: EMPTY_SOCIAL_STATE,
    friends,
    ensureConnected: jest.fn(async () => true),
    refreshFriends: jest.fn(async () => undefined),
    dismissInvite: jest.fn(async () => undefined),
    setActivity: jest.fn(),
    presenceVisibility: 'everyone',
    setPresenceVisibility: jest.fn(async () => ({ ok: false as const, reason: 'network' as const })),
    handInProgress: false,
    setHandInProgress: jest.fn(),
    onEvent: jest.fn(() => () => undefined),
  };
}

/** A real per-seat mute set behind EmotesContext, with a spy on toggleMute. */
function EmotesHarness({ enabled, toggleSpy, children }: { enabled: boolean; toggleSpy: jest.Mock; children: ReactNode }) {
  const [muted, setMuted] = useState<ReadonlySet<Seat>>(new Set());
  const emotes: Emotes = {
    enabled,
    bubbles: new Map(),
    quick: [],
    cooling: false,
    send: jest.fn(),
    muted,
    toggleMute: (seat) => {
      toggleSpy(seat);
      setMuted((prev) => {
        const next = new Set(prev);
        if (next.has(seat)) next.delete(seat);
        else next.add(seat);
        return next;
      });
    },
    pickerOpen: false,
    setPickerOpen: jest.fn(),
    menuSeat: null,
    setMenuSeat: jest.fn(),
  };
  return <EmotesContext.Provider value={emotes}>{children}</EmotesContext.Provider>;
}

interface Options {
  state?: FriendState | null;
  friends?: FakeFriends;
  namePicked?: boolean;
  target?: PlayerSheetTarget | null;
  emotesEnabled?: boolean;
}

/** Lets the friend, profile and gate promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function renderSheet({ state = null, friends, namePicked = true, target = TARGET, emotesEnabled = true }: Options = {}) {
  const backend = friends ?? fakeFriends(state);
  const profile = fakeProfile(namePicked);
  jest.mocked(getProfileBackend).mockReturnValue(profile);
  const social = socialWith(backend);
  const toggleMute = jest.fn();
  const closePlayerSheet = jest.fn();
  const c = { playerSheet: target, closePlayerSheet } as unknown as TableController;
  await render(
    <SocialContext.Provider value={social}>
      <EmotesHarness enabled={emotesEnabled} toggleSpy={toggleMute}>
        <PlayerSheet c={c} />
      </EmotesHarness>
    </SocialContext.Provider>,
  );
  await settle();
  return { backend, profile, social, toggleMute, closePlayerSheet };
}

describe('PlayerSheet', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('opening', () => {
    it('should render nothing when no player is targeted', async () => {
      // Arrange
      const target = null;

      // Act
      await renderSheet({ target });

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });

    it('should open with the other player name as the title', async () => {
      // Arrange
      const target = TARGET;

      // Act
      await renderSheet({ target });

      // Assert
      expect(screen.getByTestId('player-sheet')).toHaveTextContent(/Amira/);
    });

    it('should show the loading state while the friend list loads', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.list.mockReturnValue(new Promise<FriendsSnapshot>(() => undefined));

      // Act
      await renderSheet({ friends });

      // Assert
      expect(screen.getByTestId('player-sheet-loading')).toBeOnTheScreen();
    });

    it('should not offer Block before the friend state is known', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.list.mockReturnValue(new Promise<FriendsSnapshot>(() => undefined));

      // Act
      await renderSheet({ friends });

      // Assert
      expect(screen.queryByTestId('player-sheet-block')).not.toBeOnTheScreen();
    });

    it('should close when the close button is pressed', async () => {
      // Arrange
      const { closePlayerSheet } = await renderSheet();

      // Act
      await fireEvent.press(screen.getByTestId('sheet-close'));

      // Assert
      expect(closePlayerSheet).toHaveBeenCalledTimes(1);
    });
  });

  describe('friend state', () => {
    it.each([
      { scenario: 'there is no edge', state: null, testID: 'player-sheet-add', label: 'Add friend' },
      { scenario: 'a request was sent', state: FRIEND_STATE.REQUEST_SENT, testID: 'player-sheet-sent', label: 'Request sent' },
      { scenario: 'they are friends', state: FRIEND_STATE.FRIEND, testID: 'player-sheet-friends', label: 'Friends' },
      { scenario: 'they sent a request', state: FRIEND_STATE.REQUEST_RECEIVED, testID: 'player-sheet-accept', label: 'Accept request' },
      { scenario: 'they are blocked', state: FRIEND_STATE.BLOCKED, testID: 'player-sheet-unblock', label: 'Unblock' },
    ])('should show $label when $scenario', async ({ state, testID, label }) => {
      // Arrange
      const friends = fakeFriends(state);

      // Act
      await renderSheet({ friends });

      // Assert
      expect(screen.getByTestId(testID)).toHaveTextContent(label);
    });

    it.each([
      { scenario: 'there is no edge', state: null },
      { scenario: 'a request was sent', state: FRIEND_STATE.REQUEST_SENT },
      { scenario: 'they are friends', state: FRIEND_STATE.FRIEND },
      { scenario: 'they sent a request', state: FRIEND_STATE.REQUEST_RECEIVED },
    ])('should offer Block when $scenario', async ({ state }) => {
      // Arrange
      const friends = fakeFriends(state);

      // Act
      await renderSheet({ friends });

      // Assert
      expect(screen.getByTestId('player-sheet-block')).toBeOnTheScreen();
    });

    it('should not offer Block or Add while the player is blocked', async () => {
      // Arrange
      const friends = fakeFriends(FRIEND_STATE.BLOCKED);

      // Act
      await renderSheet({ friends });

      // Assert
      expect(screen.queryAllByTestId(/^player-sheet-(block|add|accept)$/)).toHaveLength(0);
    });

    it('should find the edge in whichever list holds the player', () => {
      // Arrange
      const snapshot = snapshotWith(FRIEND_STATE.REQUEST_RECEIVED);

      // Act
      const edge = edgeOf(snapshot, AMIRA);

      // Assert
      expect(edge).toBe(FRIEND_STATE.REQUEST_RECEIVED);
    });

    it('should report no edge for a player missing from every list', () => {
      // Arrange
      const snapshot = snapshotWith(FRIEND_STATE.FRIEND);

      // Act
      const edge = edgeOf(snapshot, 'someone-else');

      // Assert
      expect(edge).toBeNull();
    });
  });

  describe('Add friend', () => {
    it('should send the request straight away when a name is already picked', async () => {
      // Arrange
      const { backend } = await renderSheet({ namePicked: true });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-add'));
      await settle();

      // Assert
      expect(backend.add).toHaveBeenCalledWith(AMIRA);
    });

    it('should show Request sent after the request goes through', async () => {
      // Arrange
      await renderSheet({ namePicked: true });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-add'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-sent')).toBeOnTheScreen();
    });

    it('should refresh the shared friend list after the request goes through', async () => {
      // Arrange
      const { social } = await renderSheet({ namePicked: true });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-add'));
      await settle();

      // Assert
      expect(social.refreshFriends).toHaveBeenCalledTimes(1);
    });

    it('should open the name gate first when no name is picked yet', async () => {
      // Arrange
      await renderSheet({ namePicked: false });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-add'));
      await settle();

      // Assert
      expect(screen.getByTestId('friends-name-gate')).toBeOnTheScreen();
    });

    it('should not send the request while the name gate is open', async () => {
      // Arrange
      const { backend } = await renderSheet({ namePicked: false });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-add'));
      await settle();

      // Assert
      expect(backend.add).not.toHaveBeenCalled();
    });

    it('should send the request once the name is saved in the gate', async () => {
      // Arrange
      const { backend } = await renderSheet({ namePicked: false });
      await fireEvent.press(screen.getByTestId('player-sheet-add'));
      await settle();

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(backend.add).toHaveBeenCalledWith(AMIRA);
    });

    it('should show the server error when the request fails', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.add.mockResolvedValue({ ok: false, reason: 'friend_their_limit' });
      await renderSheet({ friends });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-add'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-error')).toHaveTextContent('This player already has 200 friends.');
    });

    it('should show the network error when the request throws', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.add.mockRejectedValue(new Error('offline'));
      await renderSheet({ friends });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-add'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-error')).toHaveTextContent("Couldn't reach the server.", { exact: false });
    });
  });

  describe('Accept request', () => {
    it('should open the name gate first when no name is picked yet', async () => {
      // Arrange
      await renderSheet({ state: FRIEND_STATE.REQUEST_RECEIVED, namePicked: false });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-accept'));
      await settle();

      // Assert
      expect(screen.getByTestId('friends-name-gate')).toBeOnTheScreen();
    });

    it('should accept once the name is saved in the gate', async () => {
      // Arrange
      const { backend } = await renderSheet({ state: FRIEND_STATE.REQUEST_RECEIVED, namePicked: false });
      await fireEvent.press(screen.getByTestId('player-sheet-accept'));
      await settle();

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(backend.add).toHaveBeenCalledWith(AMIRA);
    });

    it('should show Friends after accepting', async () => {
      // Arrange
      await renderSheet({ state: FRIEND_STATE.REQUEST_RECEIVED, namePicked: true });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-accept'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-friends')).toBeOnTheScreen();
    });
  });

  describe('Block', () => {
    it('should ask for confirmation before blocking', async () => {
      // Arrange
      await renderSheet();

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Assert
      expect(screen.getByTestId('friends-confirm-block')).toHaveTextContent(/Block Amira\?/);
    });

    it('should not block before the confirmation', async () => {
      // Arrange
      const { backend } = await renderSheet();

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Assert
      expect(backend.block).not.toHaveBeenCalled();
    });

    it('should not block when the confirmation is cancelled', async () => {
      // Arrange
      const { backend } = await renderSheet();
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Act
      await fireEvent.press(screen.getByTestId('friends-confirm-block-cancel'));
      await settle();

      // Assert
      expect(backend.block).not.toHaveBeenCalled();
    });

    it('should block the player when confirmed', async () => {
      // Arrange
      const { backend } = await renderSheet();
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Act
      await fireEvent.press(screen.getByTestId('friends-confirm-block-ok'));
      await settle();

      // Assert
      expect(backend.block).toHaveBeenCalledWith(AMIRA);
    });

    it("should mute that seat's emotes when the block goes through", async () => {
      // Arrange
      const { toggleMute } = await renderSheet();
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Act
      await fireEvent.press(screen.getByTestId('friends-confirm-block-ok'));
      await settle();

      // Assert
      expect(toggleMute).toHaveBeenCalledWith(TARGET.seat);
    });

    it('should show the muted hint after blocking', async () => {
      // Arrange
      await renderSheet();
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Act
      await fireEvent.press(screen.getByTestId('friends-confirm-block-ok'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-muted')).toHaveTextContent('Emotes muted');
    });

    it('should offer Unblock after blocking', async () => {
      // Arrange
      await renderSheet();
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Act
      await fireEvent.press(screen.getByTestId('friends-confirm-block-ok'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-unblock')).toBeOnTheScreen();
    });

    it('should not unmute a seat that was already muted when blocking', async () => {
      // Arrange
      const { toggleMute } = await renderSheet();
      await fireEvent.press(screen.getByTestId('player-sheet-mute'));
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Act
      await fireEvent.press(screen.getByTestId('friends-confirm-block-ok'));
      await settle();

      // Assert
      expect(toggleMute).toHaveBeenCalledTimes(1);
    });

    it('should leave emotes unmuted when the block fails', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.block.mockResolvedValue({ ok: false, reason: 'network' });
      const { toggleMute } = await renderSheet({ friends });
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Act
      await fireEvent.press(screen.getByTestId('friends-confirm-block-ok'));
      await settle();

      // Assert
      expect(toggleMute).not.toHaveBeenCalled();
    });

    it('should show the error when the block fails', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.block.mockResolvedValue({ ok: false, reason: 'network' });
      await renderSheet({ friends });
      await fireEvent.press(screen.getByTestId('player-sheet-block'));

      // Act
      await fireEvent.press(screen.getByTestId('friends-confirm-block-ok'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-error')).toBeOnTheScreen();
    });
  });

  describe('Unblock', () => {
    it('should remove the block edge when Unblock is pressed', async () => {
      // Arrange
      const { backend } = await renderSheet({ state: FRIEND_STATE.BLOCKED });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-unblock'));
      await settle();

      // Assert
      expect(backend.remove).toHaveBeenCalledWith(AMIRA);
    });

    it('should offer Add friend after unblocking', async () => {
      // Arrange
      await renderSheet({ state: FRIEND_STATE.BLOCKED });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-unblock'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-add')).toBeOnTheScreen();
    });
  });

  describe('emote mute', () => {
    it('should mute the seat when the mute button is pressed', async () => {
      // Arrange
      const { toggleMute } = await renderSheet();

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-mute'));

      // Assert
      expect(toggleMute).toHaveBeenCalledWith(TARGET.seat);
    });

    it('should relabel the button as Unmute once the seat is muted', async () => {
      // Arrange
      await renderSheet();

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-mute'));

      // Assert
      expect(screen.getByTestId('player-sheet-mute')).toHaveTextContent('Unmute emotes');
    });

    it('should not show the muted hint for a plain mute without a block', async () => {
      // Arrange
      await renderSheet();

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-mute'));

      // Assert
      expect(screen.queryByTestId('player-sheet-muted')).not.toBeOnTheScreen();
    });

    it('should hide the mute button when the client has no emotes', async () => {
      // Arrange
      const emotesEnabled = false;

      // Act
      await renderSheet({ emotesEnabled });

      // Assert
      expect(screen.queryByTestId('player-sheet-mute')).not.toBeOnTheScreen();
    });
  });

  describe('network error', () => {
    it('should show the load error when the friend list fails', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.list.mockRejectedValue(new Error('offline'));

      // Act
      await renderSheet({ friends });

      // Assert
      expect(screen.getByTestId('player-sheet-load-error')).toHaveTextContent("Couldn't reach the server.", { exact: false });
    });

    it('should not offer Block while the friend state failed to load', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.list.mockRejectedValue(new Error('offline'));

      // Act
      await renderSheet({ friends });

      // Assert
      expect(screen.queryByTestId('player-sheet-block')).not.toBeOnTheScreen();
    });

    it('should load the friend list again when Try again is pressed', async () => {
      // Arrange
      const friends = fakeFriends();
      friends.list.mockRejectedValueOnce(new Error('offline'));
      await renderSheet({ friends });

      // Act
      await fireEvent.press(screen.getByTestId('player-sheet-retry'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-add')).toBeOnTheScreen();
    });
  });

  describe('Derja', () => {
    beforeEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('aeb');
      });
    });

    afterEach(async () => {
      await act(async () => {
        await i18n.changeLanguage('en');
      });
    });

    it('should label Add friend in Derja', async () => {
      // Arrange
      const state = null;

      // Act
      await renderSheet({ state });

      // Assert
      expect(screen.getByTestId('player-sheet-add')).toHaveAccessibleName(/زيدو صاحب/);
    });

    it('should label Block in Derja', async () => {
      // Arrange
      const state = FRIEND_STATE.FRIEND;

      // Act
      await renderSheet({ state });

      // Assert
      expect(screen.getByTestId('player-sheet-block')).toHaveAccessibleName(/بلوكي/);
    });

    it('should show the friends status in Derja', async () => {
      // Arrange
      const state = FRIEND_STATE.FRIEND;

      // Act
      await renderSheet({ state });

      // Assert
      expect(screen.getByTestId('player-sheet-friends')).toHaveTextContent(/صحاب/);
    });

    it('should keep the player name in the Derja title', async () => {
      // Arrange
      const target = TARGET;

      // Act
      await renderSheet({ target });

      // Assert
      expect(screen.getByTestId('player-sheet')).toHaveTextContent(/Amira/);
    });
  });
});
