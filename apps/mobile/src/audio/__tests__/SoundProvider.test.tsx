import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, waitFor } from '@testing-library/react-native';

import { SoundProvider } from '../SoundProvider';
import { useSound, type SoundContextValue } from '../soundContext';

interface FakePlayer {
  volume: number;
  loop: boolean;
  play: jest.Mock;
  pause: jest.Mock;
  seekTo: jest.Mock;
  remove: jest.Mock;
}

const mockPlayers: FakePlayer[] = [];
const mockSetAudioMode = jest.fn(async (_mode: unknown) => undefined);
jest.mock('expo-audio', () => ({
  createAudioPlayer: () => {
    const player: FakePlayer = {
      volume: 1,
      loop: false,
      play: jest.fn(),
      pause: jest.fn(),
      seekTo: jest.fn(async () => undefined),
      remove: jest.fn(),
    };
    mockPlayers.push(player);
    return player;
  },
  setAudioModeAsync: (mode: unknown) => mockSetAudioMode(mode),
}));

async function renderProvider(): Promise<{ current: SoundContextValue }> {
  const ref = { current: null as unknown as SoundContextValue };
  function Probe() {
    ref.current = useSound();
    return null;
  }
  await render(
    <SoundProvider>
      <Probe />
    </SoundProvider>,
  );
  return ref;
}

const played = (players: readonly FakePlayer[] = mockPlayers) => players.filter((p) => p.play.mock.calls.length > 0).length;

describe('SoundProvider', () => {
  beforeEach(async () => {
    mockPlayers.length = 0;
    mockSetAudioMode.mockClear();
    await AsyncStorage.clear();
  });

  it('should respect the silent switch and mix with other apps', async () => {
    // Arrange & Act
    await renderProvider();

    // Assert
    expect(mockSetAudioMode).toHaveBeenCalledWith(expect.objectContaining({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }));
  });

  it('should play an effect when effects are on', async () => {
    // Arrange
    const sound = await renderProvider();

    // Act
    await act(async () => sound.current.play('turn'));

    // Assert
    expect(played(mockPlayers.slice(0, -1))).toBe(1);
  });

  it('should scale effects by their level and stay silent at zero', async () => {
    // Arrange
    const sound = await renderProvider();
    await act(async () => sound.current.setSettings({ effects: 0.5 }));

    // Act
    await act(async () => sound.current.play('turn'));

    // Assert
    const turn = mockPlayers.find((p) => p.play.mock.calls.length > 0 && !p.loop)!;
    expect(turn.volume).toBe(0.5);

    await act(async () => sound.current.setSettings({ effects: 0 }));
    turn.play.mockClear();
    await act(async () => sound.current.play('turn'));
    expect(turn.play).not.toHaveBeenCalled();
  });

  it('should loop the table style background quietly and pause it when muted', async () => {
    // Arrange
    const sound = await renderProvider();
    const loop = mockPlayers.find((p) => p.loop)!;

    // Assert: on by default, under the effects
    expect(loop.play).toHaveBeenCalled();
    expect(loop.volume).toBeGreaterThan(0);
    expect(loop.volume).toBeLessThan(0.5);

    // Act
    await act(async () => sound.current.setSettings({ muted: true }));

    // Assert
    expect(loop.pause).toHaveBeenCalled();
  });

  it('should stop the background when its level is off, without touching effects', async () => {
    // Arrange
    const sound = await renderProvider();
    const loop = mockPlayers.find((p) => p.loop)!;

    // Act
    await act(async () => sound.current.setSettings({ ambience: 0 }));
    await act(async () => sound.current.play('turn'));

    // Assert
    expect(loop.pause).toHaveBeenCalled();
    expect(played(mockPlayers.filter((p) => !p.loop))).toBe(1);
  });

  it('should play nothing when muted and remember it', async () => {
    // Arrange
    const sound = await renderProvider();

    // Act
    await act(async () => sound.current.setSettings({ muted: true }));
    await act(async () => sound.current.play('turn'));

    // Assert
    expect(played(mockPlayers.filter((p) => !p.loop))).toBe(0);
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem('chkobba.sound'))!)).toMatchObject({ muted: true }));
  });

  it('should load the saved settings', async () => {
    // Arrange
    await AsyncStorage.setItem('chkobba.sound', JSON.stringify({ effects: 0.25, ambience: 0, muted: true }));

    // Act
    const sound = await renderProvider();

    // Assert
    await waitFor(() => expect(sound.current.settings).toEqual({ effects: 0.25, ambience: 0, muted: true }));
  });
});
