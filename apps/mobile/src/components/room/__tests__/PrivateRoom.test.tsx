/**
 * PrivateRoom: the waiting-room view. It is pure presentation over a
 * hand-built `RoomController`, so every test feeds the controller state the
 * hook would produce and asserts what the player sees.
 */
import { FIXTURE_ROOM_CODE } from '@chkobba/protocol/testing';
import type { Seat } from '@chkobba/rules';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { useWindowDimensions } from 'react-native';

import type { RoomController, RoomMemberView, RoomSeat } from '@/game/useRoomController';
import { i18n } from '@/i18n';
import type { FriendsBackend, FriendsSnapshot } from '@/online/friends';

import { PrivateRoom } from '../PrivateRoom';

const EMPTY_FRIENDS: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };

/** The player sheet reads the friend list from this fake (no SocialContext in these tests). */
const mockFriends: FriendsBackend = {
  list: jest.fn(async () => EMPTY_FRIENDS),
  recentPlayers: jest.fn(async () => []),
  lookupCode: jest.fn(async () => ({ ok: false as const, reason: 'not_found' as const })),
  add: jest.fn(async () => ({ ok: true as const })),
  remove: jest.fn(async () => ({ ok: true as const })),
  block: jest.fn(async () => ({ ok: true as const })),
  invite: jest.fn(async () => ({ ok: true as const, sent: true })),
};

jest.mock('@/online/services', () => ({
  getFriendsBackend: jest.fn(() => mockFriends),
  getProfileBackend: jest.fn(),
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 2, fontScale: 1 })),
}));

const CODE = FIXTURE_ROOM_CODE;
const LINK = `http://192.168.1.10:8081/t/${CODE}`;

function seatState(seat: Seat, overrides: Partial<RoomSeat> = {}): RoomSeat {
  return {
    seat,
    kind: 'empty',
    name: null,
    isHost: false,
    team: seat % 2 === 0 ? 0 : 1,
    canSit: false,
    canTakeOver: false,
    ...overrides,
  };
}

const HOST: RoomMemberView = { name: 'Hamza', seat: 0, isHost: true, isMe: true };
const SAMI: RoomMemberView = { name: 'Sami', seat: 2, isHost: false, isMe: false };
const LINA_STANDING: RoomMemberView = { name: 'Lina', seat: null, isHost: false, isMe: false };

/** A waiting room: the viewer (Hamza) in seat 0, Sami in seat 2, seats 1 and 3 open. */
function defaultSeats(): RoomSeat[] {
  return [
    seatState(0, { kind: 'me', name: 'Hamza', isHost: true }),
    seatState(1, { canSit: true }),
    seatState(2, { kind: 'human', name: 'Sami' }),
    seatState(3, { canSit: true }),
  ];
}

function makeRoom(overrides: Partial<RoomController> = {}): RoomController {
  return {
    code: CODE,
    seats: defaultSeats(),
    standing: [],
    members: [HOST, SAMI],
    mySeat: 0,
    amHost: true,
    phase: 'waiting',
    inGame: false,
    canStart: true,
    canSit: () => false,
    canTakeOver: () => false,
    sit: jest.fn(),
    start: jest.fn(),
    takeOver: jest.fn(),
    share: jest.fn(),
    copy: jest.fn(),
    shareState: 'idle',
    link: null,
    resetCountdown: null,
    scores: null,
    actionError: null,
    ...overrides,
  };
}

async function renderRoom(room: RoomController, onLeave = jest.fn()) {
  const view = await render(<PrivateRoom room={room} onLeave={onLeave} />);
  return { view, onLeave };
}

describe('PrivateRoom', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    jest.clearAllMocks();
  });

  describe('seats', () => {
    it('should offer "Sit here" on an empty seat when the viewer is standing', async () => {
      // Arrange
      const room = makeRoom({
        mySeat: null,
        amHost: false,
        members: [HOST, SAMI, LINA_STANDING],
        standing: [{ ...LINA_STANDING, isMe: true }],
      });

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-sit-1')).toHaveAccessibleName('Sit here');
    });

    it('should send the seat someone picked when they sit down', async () => {
      // Arrange
      const room = makeRoom({
        mySeat: null,
        amHost: false,
        members: [HOST, SAMI, LINA_STANDING],
        standing: [{ ...LINA_STANDING, isMe: true }],
      });
      await renderRoom(room);

      // Act
      await fireEvent.press(screen.getByTestId('room-sit-1'));

      // Assert
      expect(room.sit).toHaveBeenCalledWith(1);
    });

    it('should offer "Move here" on an empty seat when the viewer already has one', async () => {
      // Arrange
      const room = makeRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-sit-3')).toHaveAccessibleName('Move here');
    });

    it('should send the new seat when a seated player switches', async () => {
      // Arrange
      const room = makeRoom();
      await renderRoom(room);

      // Act
      await fireEvent.press(screen.getByTestId('room-sit-3'));

      // Assert
      expect(room.sit).toHaveBeenCalledWith(3);
    });

    it('should name the viewer and mark their own seat', async () => {
      // Arrange
      const room = makeRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(within(screen.getByTestId('room-seat-0')).getByText('Hamza (you)')).toBeOnTheScreen();
    });
  });

  describe('player sheet', () => {
    const SAMI_ID = 'user-sami';
    const LINA_ID = 'user-lina';

    /** Lets the sheet's friend-list load settle inside act. */
    async function settle(): Promise<void> {
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
    }

    /** The default room with user ids on everyone, Lina standing and a bot in seat 1. */
    function socialRoom(): RoomController {
      const lina = { ...LINA_STANDING, userId: LINA_ID };
      return makeRoom({
        members: [{ ...HOST, userId: 'user-hamza' }, { ...SAMI, userId: SAMI_ID }, lina],
        standing: [lina],
        seats: [
          seatState(0, { kind: 'me', name: 'Hamza', isHost: true }),
          seatState(1, { kind: 'bot', name: 'Bot 1' }),
          seatState(2, { kind: 'human', name: 'Sami' }),
          seatState(3, { canSit: true }),
        ],
      });
    }

    it('should open the player sheet for another seated member', async () => {
      // Arrange
      await renderRoom(socialRoom());

      // Act
      await fireEvent.press(screen.getByTestId('room-seat-2-player'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet')).toHaveTextContent(/Sami/);
    });

    it('should offer Add friend in the sheet for a seated member', async () => {
      // Arrange
      await renderRoom(socialRoom());

      // Act
      await fireEvent.press(screen.getByTestId('room-seat-2-player'));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet-add')).toHaveTextContent('Add friend');
    });

    it('should name the seated member in the player options label', async () => {
      // Arrange
      const room = socialRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-seat-2-player')).toHaveAccessibleName('Sami: player options');
    });

    it('should open the player sheet for a standing member', async () => {
      // Arrange
      await renderRoom(socialRoom());

      // Act
      await fireEvent.press(screen.getByTestId(`room-standing-${LINA_ID}`));
      await settle();

      // Assert
      expect(screen.getByTestId('player-sheet')).toHaveTextContent(/Lina/);
    });

    it('should not offer emote mute in the room sheet', async () => {
      // Arrange
      await renderRoom(socialRoom());

      // Act
      await fireEvent.press(screen.getByTestId('room-seat-2-player'));
      await settle();

      // Assert
      expect(screen.queryByTestId('player-sheet-mute')).not.toBeOnTheScreen();
    });

    it('should close the sheet when its close button is pressed', async () => {
      // Arrange
      await renderRoom(socialRoom());
      await fireEvent.press(screen.getByTestId('room-seat-2-player'));
      await settle();

      // Act
      await fireEvent.press(screen.getByTestId('sheet-close'));

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });

    it.each([
      { scenario: 'our own seat', seat: 0 },
      { scenario: 'a bot seat', seat: 1 },
      { scenario: 'an empty seat', seat: 3 },
    ])('should not offer player options on $scenario', async ({ seat }) => {
      // Arrange
      const room = socialRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.queryByTestId(`room-seat-${seat}-player`)).not.toBeOnTheScreen();
    });

    it('should not offer player options on ourselves while standing', async () => {
      // Arrange
      const me = { ...LINA_STANDING, userId: LINA_ID, isMe: true };
      const room = makeRoom({ mySeat: null, amHost: false, members: [HOST, SAMI, me], standing: [me] });

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.queryByTestId(`room-standing-${LINA_ID}`)).not.toBeOnTheScreen();
    });

    it('should not offer player options on a member without a user id', async () => {
      // Arrange
      const room = makeRoom({ members: [HOST, SAMI, LINA_STANDING], standing: [LINA_STANDING] });

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.queryAllByTestId(/^room-(seat-\d-player|standing-)/)).toHaveLength(0);
    });

    it('should still sit on an empty seat next to a member with player options', async () => {
      // Arrange
      const room = socialRoom();
      await renderRoom(room);

      // Act
      await fireEvent.press(screen.getByTestId('room-sit-3'));

      // Assert
      expect(room.sit).toHaveBeenCalledWith(3);
    });

    it('should not open the sheet when an empty seat is taken', async () => {
      // Arrange
      await renderRoom(socialRoom());

      // Act
      await fireEvent.press(screen.getByTestId('room-sit-3'));

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });
  });

  describe('invite friends', () => {
    /** Lets the invite sheet's friend-list load settle inside act. */
    async function settle(): Promise<void> {
      await act(async () => {
        for (let i = 0; i < 10; i++) await Promise.resolve();
      });
    }

    it.each([
      ['the host', makeRoom],
      ['a guest', () => makeRoom({ amHost: false, members: [{ ...HOST, isHost: false }, { ...SAMI, isHost: true }] })],
    ])('should open the invite sheet for %s', async (_label, room) => {
      // Arrange
      await renderRoom(room());
      expect(screen.queryByTestId('invite-sheet')).not.toBeOnTheScreen();

      // Act
      await fireEvent.press(screen.getByTestId('room-invite'));
      await settle();

      // Assert
      expect(screen.getByTestId('invite-sheet')).toBeOnTheScreen();
      expect(screen.getByTestId('room-invite')).toHaveTextContent('Invite friends');
    });

    it('should open the invite sheet in the desktop layout', async () => {
      // Arrange
      const dimensions = jest.mocked(useWindowDimensions);
      dimensions.mockReturnValue({ width: 1280, height: 800, scale: 1, fontScale: 1 });
      try {
        await renderRoom(makeRoom());

        // Act
        await fireEvent.press(screen.getByTestId('room-invite'));
        await settle();

        // Assert
        expect(screen.getByTestId('invite-sheet')).toBeOnTheScreen();
      } finally {
        dimensions.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
      }
    });

    it('should close the invite sheet', async () => {
      // Arrange
      await renderRoom(makeRoom());
      await fireEvent.press(screen.getByTestId('room-invite'));
      await settle();

      // Act
      await fireEvent.press(screen.getByTestId('sheet-close'));

      // Assert
      expect(screen.queryByTestId('invite-sheet')).not.toBeOnTheScreen();
    });
  });

  describe('host controls', () => {
    it('should show Start to the host and start the game when pressed', async () => {
      // Arrange
      const room = makeRoom();

      // Act
      await renderRoom(room);
      await fireEvent.press(screen.getByTestId('room-start'));

      // Assert
      expect(room.start).toHaveBeenCalledTimes(1);
    });

    it('should disable Start while the host may not start', async () => {
      // Arrange
      const room = makeRoom({ canStart: false });

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-start')).toBeDisabled();
    });

    it('should hide Start from a guest and say the host starts', async () => {
      // Arrange
      const room = makeRoom({ amHost: false });

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.queryByTestId('room-start')).not.toBeOnTheScreen();
    });

    it('should tell a guest that the host starts the game', async () => {
      // Arrange
      const room = makeRoom({ amHost: false });

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByText('Waiting for the host to start…')).toBeOnTheScreen();
    });

    it('should not show Start during a game', async () => {
      // Arrange
      const room = makeRoom({ phase: 'playing', inGame: true });

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.queryByTestId('room-start')).not.toBeOnTheScreen();
    });

    it('should move the host crown to the new host when the old one leaves', async () => {
      // Arrange
      const before = makeRoom();
      const after = makeRoom({
        members: [{ name: 'Sami', seat: 2, isHost: true, isMe: false }],
        mySeat: 2,
        amHost: true,
        seats: [
          seatState(0, { canSit: true }),
          seatState(1, { canSit: true }),
          seatState(2, { kind: 'me', name: 'Sami', isHost: true }),
          seatState(3, { canSit: true }),
        ],
      });
      const { view } = await renderRoom(before);

      // Act
      await view.rerender(<PrivateRoom room={after} onLeave={jest.fn()} />);

      // Assert
      expect(screen.getAllByTestId('room-host-crown')).toHaveLength(1);
    });

    it('should draw the crown on the new host seat after the handover', async () => {
      // Arrange
      const before = makeRoom();
      const after = makeRoom({
        members: [{ name: 'Sami', seat: 2, isHost: true, isMe: false }],
        mySeat: 2,
        amHost: true,
        seats: [
          seatState(0, { canSit: true }),
          seatState(1, { canSit: true }),
          seatState(2, { kind: 'me', name: 'Sami', isHost: true }),
          seatState(3, { canSit: true }),
        ],
      });
      const { view } = await renderRoom(before);

      // Act
      await view.rerender(<PrivateRoom room={after} onLeave={jest.fn()} />);

      // Assert
      expect(within(screen.getByTestId('room-seat-2')).getByTestId('room-host-crown')).toBeOnTheScreen();
    });
  });

  describe('standing member during a game', () => {
    function spectatingRoom(): RoomController {
      return makeRoom({
        phase: 'playing',
        inGame: true,
        mySeat: null,
        amHost: false,
        scores: [3, 5],
        members: [HOST, SAMI, { ...LINA_STANDING, isMe: true }],
        standing: [{ ...LINA_STANDING, isMe: true }],
        seats: [
          seatState(0, { kind: 'human', name: 'Hamza', isHost: true }),
          seatState(1, { kind: 'bot', name: 'Bot 1', canTakeOver: true }),
          seatState(2, { kind: 'human', name: 'Sami' }),
          seatState(3, { kind: 'bot', name: 'Bot 3', canTakeOver: true }),
        ],
      });
    }

    it('should show both team scores to a standing member', async () => {
      // Arrange
      const room = spectatingRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(within(screen.getByTestId('room-scores')).getByText('5')).toBeOnTheScreen();
    });

    it('should offer Take over on the bot seats only', async () => {
      // Arrange
      const room = spectatingRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-takeover-1')).toBeOnTheScreen();
    });

    it('should not offer Take over on a human seat', async () => {
      // Arrange
      const room = spectatingRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.queryByTestId('room-takeover-0')).not.toBeOnTheScreen();
    });

    it('should take over the bot seat that was pressed', async () => {
      // Arrange
      const room = spectatingRoom();
      await renderRoom(room);

      // Act
      await fireEvent.press(screen.getByTestId('room-takeover-3'));

      // Assert
      expect(room.takeOver).toHaveBeenCalledWith(3);
    });

    it('should tell a standing member the game is still running', async () => {
      // Arrange
      const room = spectatingRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-waiting-game')).toHaveTextContent('Waiting for this game to end…');
    });
  });

  describe('sharing', () => {
    it('should render the code and link as selectable text in the fallback', async () => {
      // Arrange
      const room = makeRoom({ shareState: 'unavailable', link: LINK });

      // Act
      await renderRoom(room);

      // Assert
      expect(within(screen.getByTestId('room-code-fallback')).getByText(LINK)).toHaveProp('selectable', true);
    });

    it('should render the code itself as selectable in the fallback', async () => {
      // Arrange
      const room = makeRoom({ shareState: 'unavailable', link: LINK });

      // Act
      await renderRoom(room);

      // Assert
      expect(within(screen.getByTestId('room-code-fallback')).getByText(CODE)).toHaveProp('selectable', true);
    });

    it('should ask the controller to share when Share is pressed', async () => {
      // Arrange
      const room = makeRoom();
      await renderRoom(room);

      // Act
      await fireEvent.press(screen.getByTestId('room-share'));

      // Assert
      expect(room.share).toHaveBeenCalledTimes(1);
    });

    it('should ask the controller to copy when Copy is pressed', async () => {
      // Arrange
      const room = makeRoom();
      await renderRoom(room);

      // Act
      await fireEvent.press(screen.getByTestId('room-copy'));

      // Assert
      expect(room.copy).toHaveBeenCalledTimes(1);
    });

    it('should show the copied note after a copy', async () => {
      // Arrange
      const room = makeRoom({ shareState: 'copied' });

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-copied')).toHaveTextContent('Code copied');
    });
  });

  describe('left-to-right code', () => {
    it('should lay the room code out left to right', async () => {
      // Arrange
      const room = makeRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-code').parent).toHaveStyle({ direction: 'ltr' });
    });
  });

  describe('Derja catalog', () => {
    it('should render the whole room in Derja without mirroring the code', async () => {
      // Arrange
      await act(async () => {
        await i18n.changeLanguage('aeb');
      });
      const room = makeRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-code')).toHaveTextContent(CODE);
    });

    it('should translate the room title and the controls in Derja', async () => {
      // Arrange
      await act(async () => {
        await i18n.changeLanguage('aeb');
      });
      const room = makeRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByText(/طاولة خاصّة/)).toBeOnTheScreen();
    });

    it('should keep the Start button and seat hints in Derja', async () => {
      // Arrange
      await act(async () => {
        await i18n.changeLanguage('aeb');
      });
      const room = makeRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-start')).toHaveAccessibleName(/ابدا الطرح/);
    });

    it('should keep the code left to right under Derja', async () => {
      // Arrange
      await act(async () => {
        await i18n.changeLanguage('aeb');
      });
      const room = makeRoom();

      // Act
      await renderRoom(room);

      // Assert
      expect(screen.getByTestId('room-code').parent).toHaveStyle({ direction: 'ltr' });
    });
  });
});
