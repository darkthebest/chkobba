import { fireEvent, render, screen } from '@testing-library/react-native';

import { GameTable } from '@/components/GameTable';
import { LocalGameClient, type Scheduler } from '@/game/LocalGameClient';

import { DEFAULT_SOUND_SETTINGS, SoundContext } from '../soundContext';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 2, fontScale: 1 })),
}));

const noopScheduler: Scheduler = () => () => {};

async function renderTable(client: LocalGameClient) {
  const play = jest.fn();
  await render(
    <SoundContext.Provider value={{ settings: DEFAULT_SOUND_SETTINGS, setSettings: jest.fn(), play }}>
      <GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />
    </SoundContext.Provider>,
  );
  return play;
}

describe('useTableSounds', () => {
  it('should stay silent when the table first shows', async () => {
    // Arrange
    const client = new LocalGameClient({ seed: 'snd', playerCount: 4, dealer: 3, rules: { cutCardChoice: false }, scheduler: noopScheduler });

    // Act
    const play = await renderTable(client);

    // Assert
    expect(play).not.toHaveBeenCalled();
  });

  it('should play the card sound when a card is played', async () => {
    // Arrange
    const client = new LocalGameClient({
      seed: 'snd',
      playerCount: 4,
      dealer: 3,
      botLevel: 'easy',
      rules: { cutCardChoice: false },
      scheduler: noopScheduler,
    });
    const move = client.getSnapshot().view.legalMoves[0]!;
    const play = await renderTable(client);

    // Act
    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    await fireEvent.press(screen.getByTestId(move.capture.length === 0 ? 'option-place' : 'option-1'));

    // Assert
    expect(play).toHaveBeenCalledWith('place');
  });

  it('should open the sound settings from the table without leaving the game', async () => {
    // Arrange
    const client = new LocalGameClient({ seed: 'snd', playerCount: 4, dealer: 3, rules: { cutCardChoice: false }, scheduler: noopScheduler });
    const setSettings = jest.fn();
    await render(
      <SoundContext.Provider value={{ settings: DEFAULT_SOUND_SETTINGS, setSettings, play: jest.fn() }}>
        <GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />
      </SoundContext.Provider>,
    );

    // Act
    await fireEvent.press(screen.getByTestId('sound-button'));
    await fireEvent.press(screen.getByTestId('sound-mute-muted'));

    // Assert
    expect(screen.getByTestId('sound-sheet')).toBeOnTheScreen();
    expect(setSettings).toHaveBeenCalledWith({ muted: true });
    expect(screen.getByTestId('hand')).toBeOnTheScreen();
  });
});
