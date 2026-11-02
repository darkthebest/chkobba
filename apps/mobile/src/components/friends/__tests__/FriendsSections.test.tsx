/**
 * FriendsSections and FriendRow: the five lists, their rows' buttons, empty
 * and loading states, pending and per-row errors, over a hand-built
 * controller slice.
 */
import { FRIEND_STATE, type FriendState } from '@chkobba/protocol';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import type { FriendRow as FriendRowEntry } from '@/friends/useFriendsController';
import { i18n } from '@/i18n';
import type { FriendEntry, RecentPlayerEntry } from '@/online/friends';
import type { Availability } from '@/online/presence';

import { FriendsSections, type FriendsSectionsSource } from '../FriendsSections';

function entry(userId: string, displayName: string, state: FriendState): FriendEntry {
  return { userId, displayName, code: null, state, updatedAt: 0 };
}

function friend(userId: string, displayName: string, availability: Availability): FriendRowEntry {
  return { ...entry(userId, displayName, FRIEND_STATE.FRIEND), availability };
}

function recent(userId: string, displayName: string, state: FriendState | null): RecentPlayerEntry {
  return { userId, displayName, lastPlayedAt: 1000, state };
}

function makeSource(overrides: Partial<FriendsSectionsSource> = {}): FriendsSectionsSource {
  return {
    loading: false,
    loadError: null,
    reload: jest.fn(),
    incoming: [entry('u-nadia', 'Nadia', FRIEND_STATE.REQUEST_RECEIVED)],
    outgoing: [entry('u-omar', 'Omar', FRIEND_STATE.REQUEST_SENT)],
    friends: [friend('u-sami', 'Sami', 'online'), friend('u-amel', 'Amel', 'playing')],
    recent: [
      recent('u-karim', 'Karim', null),
      recent('u-sami', 'Sami', FRIEND_STATE.FRIEND),
      recent('u-nadia', 'Nadia', FRIEND_STATE.REQUEST_RECEIVED),
      recent('u-omar', 'Omar', FRIEND_STATE.REQUEST_SENT),
    ],
    blocked: [entry('u-lina', 'Lina', FRIEND_STATE.BLOCKED)],
    pending: new Set<string>(),
    error: null,
    ...overrides,
  };
}

const EMPTY: Partial<FriendsSectionsSource> = { incoming: [], outgoing: [], friends: [], recent: [], blocked: [] };

async function renderSections(source: FriendsSectionsSource = makeSource()) {
  const onAction = jest.fn();
  await render(<FriendsSections controller={source} onAction={onAction} />);
  return { source, onAction };
}

describe('FriendsSections', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    jest.clearAllMocks();
  });

  describe('sections', () => {
    it('should title the five sections in order', async () => {
      // Arrange
      // (default source)

      // Act
      await renderSections();

      // Assert
      expect(
        ['incoming', 'outgoing', 'friends', 'recent', 'blocked'].map(
          (id) => screen.getByTestId(`friends-section-${id}`).props.children,
        ),
      ).toEqual(['Requests', 'Sent', 'Friends', 'Recent players', 'Blocked']);
    });

    it('should expose the section titles as headers', async () => {
      // Arrange
      // (default source)

      // Act
      await renderSections();

      // Assert
      expect(screen.getByRole('header', { name: 'Recent players' })).toBeOnTheScreen();
    });

    it('should show the count of a non-empty section', async () => {
      // Arrange
      // (default source)

      // Act
      await renderSections();

      // Assert
      expect(screen.getByTestId('friends-count-friends')).toHaveTextContent('2');
    });

    it.each([
      ['incoming', 'No friend requests.'],
      ['outgoing', 'No requests waiting for an answer.'],
      ['friends', 'No friends yet. Find someone by name, or add a player from a table.'],
      ['recent', 'Players you meet at online tables show up here.'],
      ['blocked', "You haven't blocked anyone."],
    ])('should show the empty text of the %s section', async (id, text) => {
      // Arrange
      const source = makeSource(EMPTY);

      // Act
      await renderSections(source);

      // Assert
      expect(screen.getByTestId(`friends-empty-${id}`)).toHaveTextContent(text);
    });

    it('should show a friend availability label', async () => {
      // Arrange
      // (default source)

      // Act
      await renderSections();

      // Assert
      expect(screen.getByTestId('friend-availability-u-amel')).toHaveTextContent('In a game');
    });

    it('should keep the friends in the order the controller sorted them', async () => {
      // Arrange
      // (default source: Sami online, then Amel playing)

      // Act
      await renderSections();

      // Assert
      const rows = within(screen.getByTestId('friends-section-friends').parent!.parent!).getAllByTestId(/^friend-name-/);
      expect(rows.map((row) => row.props.children)).toEqual(['Sami', 'Amel']);
    });

    it('should show "Friends" on a recent player who is already a friend', async () => {
      // Arrange
      // (default source)

      // Act
      await renderSections();

      // Assert
      expect(screen.getByTestId('recent-state-u-sami')).toHaveTextContent('Friends');
    });

    it('should show "Request sent" on a recent player with a pending request', async () => {
      // Arrange
      // (default source)

      // Act
      await renderSections();

      // Assert
      expect(screen.getByTestId('recent-state-u-omar')).toHaveTextContent('Request sent');
    });
  });

  describe('row buttons', () => {
    it.each([
      ['friend-accept-u-nadia', 'accept', 'u-nadia', 'Nadia'],
      ['friend-decline-u-nadia', 'decline', 'u-nadia', 'Nadia'],
      ['friend-block-u-nadia', 'block', 'u-nadia', 'Nadia'],
      ['friend-cancel-u-omar', 'cancel', 'u-omar', 'Omar'],
      ['friend-remove-u-sami', 'remove', 'u-sami', 'Sami'],
      ['friend-block-u-sami', 'block', 'u-sami', 'Sami'],
      ['recent-add-u-karim', 'add', 'u-karim', 'Karim'],
      ['recent-block-u-karim', 'block', 'u-karim', 'Karim'],
      ['recent-accept-u-nadia', 'accept', 'u-nadia', 'Nadia'],
      ['friend-unblock-u-lina', 'unblock', 'u-lina', 'Lina'],
    ])('should send %s as the %s action', async (testID, action, userId, displayName) => {
      // Arrange
      const { onAction } = await renderSections();

      // Act
      await fireEvent.press(screen.getByTestId(testID));

      // Assert
      expect(onAction).toHaveBeenCalledWith(action, { userId, displayName });
    });

    it('should not offer Add on a recent player who is already a friend', async () => {
      // Arrange
      // (default source)

      // Act
      await renderSections();

      // Assert
      expect(screen.queryByTestId('recent-add-u-sami')).not.toBeOnTheScreen();
    });

    it('should name the player in each button spoken label', async () => {
      // Arrange
      // (default source)

      // Act
      await renderSections();

      // Assert
      expect(screen.getByTestId('friend-decline-u-nadia')).toHaveAccessibleName('Decline, Nadia');
    });

    it.each(['friend-accept-u-nadia', 'friend-decline-u-nadia', 'friend-block-u-nadia'])(
      'should disable %s while an action for that player is pending',
      async (testID) => {
        // Arrange
        const source = makeSource({ pending: new Set(['u-nadia']) });

        // Act
        await renderSections(source);

        // Assert
        expect(screen.getByTestId(testID)).toBeDisabled();
      },
    );

    it('should keep other players buttons enabled while one is pending', async () => {
      // Arrange
      const source = makeSource({ pending: new Set(['u-nadia']) });

      // Act
      await renderSections(source);

      // Assert
      expect(screen.getByTestId('friend-cancel-u-omar')).toBeEnabled();
    });

    it('should not call the action when a disabled button is pressed', async () => {
      // Arrange
      const { onAction } = await renderSections(makeSource({ pending: new Set(['u-omar']) }));

      // Act
      await fireEvent.press(screen.getByTestId('friend-cancel-u-omar'));

      // Assert
      expect(onAction).not.toHaveBeenCalled();
    });
  });

  describe('errors', () => {
    it('should show the localized outgoing-limit error on that player row', async () => {
      // Arrange
      const source = makeSource({ error: { userId: 'u-karim', reason: 'friend_outgoing_limit' } });

      // Act
      await renderSections(source);

      // Assert
      expect(screen.getByTestId('recent-error-u-karim')).toHaveTextContent(
        'You have 50 pending requests. Wait for some answers or cancel a few.',
      );
    });

    it('should announce a row error as an alert', async () => {
      // Arrange
      const source = makeSource({ error: { userId: 'u-sami', reason: 'network' } });

      // Act
      await renderSections(source);

      // Assert
      expect(screen.getByTestId('friend-error-u-sami')).toHaveProp('accessibilityRole', 'alert');
    });

    it('should show a friend-limit error in Derja', async () => {
      // Arrange
      await act(async () => {
        await i18n.changeLanguage('aeb');
      });
      const source = makeSource({ error: { userId: 'u-karim', reason: 'friend_outgoing_limit' } });

      // Act
      await renderSections(source);

      // Assert
      expect(screen.getByTestId('recent-error-u-karim')).toHaveTextContent(/عندك 50 طلب يستنّاو/);
    });
  });

  describe('loading', () => {
    it('should show a spinner during the first load', async () => {
      // Arrange
      const source = makeSource({ ...EMPTY, loading: true });

      // Act
      await renderSections(source);

      // Assert
      expect(screen.getByTestId('friends-loading')).toBeOnTheScreen();
    });

    it('should keep the lists on screen while a reload runs', async () => {
      // Arrange
      const source = makeSource({ loading: true });

      // Act
      await renderSections(source);

      // Assert
      expect(screen.getByTestId('friends-sections')).toBeOnTheScreen();
    });

    it('should offer Try again when the first load failed', async () => {
      // Arrange
      const { source } = await renderSections(makeSource({ ...EMPTY, loadError: 'network' }));

      // Act
      await fireEvent.press(screen.getByTestId('friends-retry'));

      // Assert
      expect(source.reload).toHaveBeenCalledTimes(1);
    });
  });
});
