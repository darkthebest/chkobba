import { render, screen } from '@testing-library/react-native';

import type { SeatInfo } from '@/game/GameClient';

import { Seat, seatStatus, TurnClock } from '../Seat';

function player(overrides: Partial<SeatInfo> = {}): SeatInfo {
  return { seat: 1, name: 'Amira', isBot: false, away: false, connected: true, ...overrides };
}

async function renderSeat(info: SeatInfo, clock: { progress?: number; secondsLeft?: number | null } = {}) {
  await render(
    <Seat player={info} cardCount={3} isTurn={clock.progress !== undefined} isPartner={false} isDealer={false} {...clock} />,
  );
}

describe('seatStatus', () => {
  it.each([
    { scenario: 'a connected, present human', info: player(), expected: null },
    { scenario: 'a disconnected human', info: player({ connected: false }), expected: 'offline' },
    { scenario: 'an away human', info: player({ away: true }), expected: 'away' },
    { scenario: 'a human both away and disconnected', info: player({ away: true, connected: false }), expected: 'offline' },
    { scenario: 'a disconnected bot', info: player({ isBot: true, connected: false }), expected: null },
    { scenario: 'an away bot', info: player({ isBot: true, away: true }), expected: null },
    { scenario: 'an offline-game seat without online flags', info: { seat: 1, name: 'Bot', isBot: false }, expected: null },
  ])('should return $expected for $scenario', ({ info, expected }) => {
    // Arrange
    const input: SeatInfo = info;

    // Act
    const status = seatStatus(input);

    // Assert
    expect(status).toBe(expected);
  });
});

describe('Seat', () => {
  describe('turn clock', () => {
    it('should expose the seconds left as a timer when the seat is on the clock', async () => {
      // Arrange
      const info = player();

      // Act
      await renderSeat(info, { progress: 0.5, secondsLeft: 12 });

      // Assert
      expect(screen.getByRole('timer', { name: 'Amira: 12 seconds left' })).toBeOnTheScreen();
    });

    it('should use the seat-numbered testID for the clock when the seat is on the clock', async () => {
      // Arrange
      const info = player({ seat: 3 });

      // Act
      await renderSeat(info, { progress: 0.5, secondsLeft: 12 });

      // Assert
      expect(screen.getByTestId('seat-3-clock')).toHaveAccessibleName('Amira: 12 seconds left');
    });

    it('should use the singular when one second is left', async () => {
      // Arrange
      const info = player();

      // Act
      await renderSeat(info, { progress: 0.1, secondsLeft: 1 });

      // Assert
      expect(screen.getByRole('timer', { name: 'Amira: 1 second left' })).toBeOnTheScreen();
    });

    it('should announce a generic turn timer when the clock has not been measured yet', async () => {
      // Arrange
      const info = player();

      // Act
      await renderSeat(info, { progress: 1, secondsLeft: null });

      // Assert
      expect(screen.getByRole('timer', { name: 'Amira: turn timer' })).toBeOnTheScreen();
    });

    it('should not render a timer when the seat is not on the clock', async () => {
      // Arrange
      const info = player();

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.queryByRole('timer')).not.toBeOnTheScreen();
    });

    it('should not render the clock testID when the seat is not on the clock', async () => {
      // Arrange
      const info = player();

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.queryByTestId('seat-1-clock')).not.toBeOnTheScreen();
    });
  });

  describe('status badge', () => {
    it('should show an Offline badge when the human is disconnected', async () => {
      // Arrange
      const info = player({ connected: false });

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.getByTestId('seat-1-status')).toHaveTextContent('Offline');
    });

    it('should label the Offline badge for screen readers when the human is disconnected', async () => {
      // Arrange
      const info = player({ connected: false });

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.getByLabelText('Amira is offline')).toBeOnTheScreen();
    });

    it('should show an Away badge when the human is away', async () => {
      // Arrange
      const info = player({ seat: 2, away: true });

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.getByTestId('seat-2-status')).toHaveTextContent('Away');
    });

    it('should label the Away badge for screen readers when the human is away', async () => {
      // Arrange
      const info = player({ away: true });

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.getByLabelText('Amira is away')).toBeOnTheScreen();
    });

    it('should show Offline rather than Away when the human is both', async () => {
      // Arrange
      const info = player({ away: true, connected: false });

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.getByTestId('seat-1-status')).toHaveTextContent('Offline');
    });

    it('should never badge a bot even when it is flagged away and disconnected', async () => {
      // Arrange
      const info = player({ isBot: true, away: true, connected: false });

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.queryByTestId('seat-1-status')).not.toBeOnTheScreen();
    });

    it('should not badge a connected, present human', async () => {
      // Arrange
      const info = player();

      // Act
      await renderSeat(info);

      // Assert
      expect(screen.queryByTestId('seat-1-status')).not.toBeOnTheScreen();
    });
  });
});

describe('TurnClock', () => {
  it('should announce "Your time" with the seconds left when it wraps the player avatar', async () => {
    // Arrange
    const secondsLeft = 7;

    // Act
    await render(
      <TurnClock secondsLeft={secondsLeft} owner="Your time" testID="my-clock">
        {null}
      </TurnClock>,
    );

    // Assert
    expect(screen.getByTestId('my-clock')).toHaveAccessibleName('Your time: 7 seconds left');
  });
});
