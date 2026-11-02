import type { Seat } from '@chkobba/rules';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

import { BUBBLE_MS, EMOTE_COOLDOWN_MS, type EmoteId } from '@/emotes/catalog';
import { resetEmotePrefsForTests, setEmotePrefs } from '@/emotes/prefs';
import type { EmoteEvent } from '@/game/GameClient';
import { LocalGameClient, type Scheduler } from '@/game/LocalGameClient';
import { SkinProvider, type SkinId } from '@/skins';

import { GameTable } from '../../GameTable';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 2, fontScale: 1 })),
}));

const windowDimensions = jest.requireMock<{ default: jest.Mock }>(
  'react-native/Libraries/Utilities/useWindowDimensions',
).default;

const noopScheduler: Scheduler = () => () => {};

/** A local game whose emotes we control: what we send is recorded, and `receive` plays another seat's emote. */
async function setup(skin: SkinId = 'cafe') {
  const client = new LocalGameClient({ seed: 'emotes-ui', playerCount: 4, dealer: 3, rules: { cutCardChoice: false }, scheduler: noopScheduler });
  const listeners = new Set<(event: EmoteEvent) => void>();
  const sent: EmoteId[] = [];
  client.emote = (id: EmoteId) => {
    sent.push(id);
  };
  client.subscribeEmotes = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  await render(
    <SkinProvider initial={skin}>
      <GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />
    </SkinProvider>,
  );
  const receive = async (seat: Seat, id: EmoteId) => {
    await act(async () => {
      for (const listener of listeners) listener({ seat, id });
    });
  };
  return { sent, receive };
}

async function wait(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('table emotes', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    resetEmotePrefsForTests();
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should show the quick row with the default emotes and a more button', async () => {
    // Act
    await setup();

    // Assert
    for (const id of ['thumbs', 'laugh', 'yalla', 'facepalm']) expect(screen.getByTestId(`emote-quick-${id}`)).toBeOnTheScreen();
    expect(screen.getByTestId('emote-more')).toBeOnTheScreen();
  });

  it('should send a quick emote and show it above our avatar', async () => {
    // Arrange
    const { sent } = await setup();

    // Act
    await fireEvent.press(screen.getByTestId('emote-quick-yalla'));

    // Assert
    expect(sent).toEqual(['yalla']);
    expect(screen.getByTestId('emote-0')).toHaveTextContent('Yalla!');
  });

  it('should put the quick row and our bubble beside the hand on desktop', async () => {
    // Arrange
    windowDimensions.mockReturnValue({ width: 1440, height: 900, scale: 2, fontScale: 1 });
    try {
      await setup();
      const handRow = screen.getByTestId('hand-row');

      // Act
      await fireEvent.press(within(handRow).getByTestId('emote-quick-yalla'));

      // Assert
      expect(within(handRow).getByTestId('emote-bar')).toBeOnTheScreen();
      expect(screen.getAllByTestId('emote-0')).toHaveLength(1);
      expect(within(handRow).getByTestId('emote-0')).toHaveTextContent('Yalla!');
    } finally {
      windowDimensions.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
    }
  });

  it('should ignore a second emote during the cooldown', async () => {
    // Arrange
    const { sent } = await setup();
    await fireEvent.press(screen.getByTestId('emote-quick-thumbs'));

    // Act
    await fireEvent.press(screen.getByTestId('emote-quick-laugh'));

    // Assert
    expect(sent).toEqual(['thumbs']);
  });

  it('should move the last sent emote to the front once the cooldown ends', async () => {
    // Arrange
    await setup();
    await fireEvent.press(screen.getByTestId('emote-more'));
    await fireEvent.press(screen.getByTestId('emote-pick-bravo'));

    // Act
    await wait(EMOTE_COOLDOWN_MS);

    // Assert
    const quick = screen.getAllByTestId(/^emote-quick-/).map((node) => node.props.testID as string);
    expect(quick).toEqual(['emote-quick-bravo', 'emote-quick-thumbs', 'emote-quick-laugh', 'emote-quick-yalla']);
  });

  it('should send from the picker and close it', async () => {
    // Arrange
    const { sent } = await setup();
    await fireEvent.press(screen.getByTestId('emote-more'));

    // Act
    await fireEvent.press(screen.getByTestId('emote-pick-mabrouk'));

    // Assert
    expect(sent).toEqual(['mabrouk']);
    expect(screen.queryByTestId('emote-picker')).toBeNull();
  });

  it('should show another seat’s emote at that seat, then clear it', async () => {
    // Arrange
    const { receive } = await setup();

    // Act
    await receive(2, 'laugh');
    const shown = screen.getByTestId('emote-2');
    await wait(BUBBLE_MS);

    // Assert
    expect(shown).toHaveTextContent('😂');
    expect(screen.queryByTestId('emote-2')).toBeNull();
  });

  it('should hide a muted seat’s emotes and mark the seat', async () => {
    // Arrange
    const { receive } = await setup();
    await fireEvent.press(screen.getByTestId('seat-2-avatar'));
    await fireEvent.press(screen.getByTestId('emote-mute'));

    // Act
    await receive(2, 'laugh');

    // Assert
    expect(screen.queryByTestId('emote-2')).toBeNull();
    expect(screen.getByTestId('seat-2-muted')).toBeOnTheScreen();
  });

  it('should hide every other seat’s emotes when emotes are off in Settings', async () => {
    // Arrange
    setEmotePrefs({ mutedAll: true });
    const { receive } = await setup();

    // Act
    await receive(1, 'fire');

    // Assert
    expect(screen.queryByTestId('emote-1')).toBeNull();
  });

  it.each(['minimal', 'sahara', 'sidi', 'neon'] as const)('should render bubbles in the %s table style', async (skin) => {
    // Arrange
    const { receive } = await setup(skin);

    // Act
    await receive(3, 'khsara');

    // Assert
    expect(screen.getByTestId('emote-3')).toHaveTextContent('Ya khsara…');
  });
});
