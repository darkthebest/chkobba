import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { useSkin } from '@/skins';

import { DEFAULT_SOUND_SETTINGS, SoundContext, type SoundId, type SoundSettings } from './soundContext';

const STORAGE_KEY = 'chkobba.sound';
/** The loop's loudness at full level: it sits under the game, never over it. */
const AMBIENCE_GAIN = 0.5;

/** Each effect's recordings; a sound with several takes picks one at random so repeats don't sound mechanical. */
const SOURCES: Record<SoundId, readonly number[]> = {
  place: [
    require('../../assets/sounds/place-1.mp3'),
    require('../../assets/sounds/place-2.mp3'),
    require('../../assets/sounds/place-3.mp3'),
    require('../../assets/sounds/place-4.mp3'),
  ],
  sweep: [require('../../assets/sounds/sweep-1.mp3'), require('../../assets/sounds/sweep-2.mp3')],
  shuffle: [require('../../assets/sounds/shuffle.mp3')],
  deal: [require('../../assets/sounds/deal.mp3')],
  turn: [require('../../assets/sounds/turn.mp3')],
  tick: [require('../../assets/sounds/tick.mp3')],
  chkobba: [require('../../assets/sounds/chkobba.mp3')],
  roundEnd: [require('../../assets/sounds/roundEnd.mp3')],
  win: [require('../../assets/sounds/win.mp3')],
  lose: [require('../../assets/sounds/lose.mp3')],
};

/** Per-effect level, so frequent sounds sit under the rare ones. */
const VOLUME: Partial<Record<SoundId, number>> = { place: 0.8, sweep: 0.7, shuffle: 0.6, deal: 0.6, tick: 0.5 };

const level = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;

function parseSettings(raw: string | null): SoundSettings {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (typeof value !== 'object' || value === null) return DEFAULT_SOUND_SETTINGS;
    const saved = value as Partial<Record<keyof SoundSettings, unknown>>;
    return {
      effects: level(saved.effects, DEFAULT_SOUND_SETTINGS.effects),
      ambience: level(saved.ambience, DEFAULT_SOUND_SETTINGS.ambience),
      muted: typeof saved.muted === 'boolean' ? saved.muted : DEFAULT_SOUND_SETTINGS.muted,
    };
  } catch {
    return DEFAULT_SOUND_SETTINGS;
  }
}

/**
 * Owns the app's audio: preloaded players for every effect, the table style's
 * ambience loop, and the remembered levels. Respects the iPhone silent switch
 * and mixes with the player's own music.
 */
export function SoundProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS);
  const current = useRef(settings);
  useEffect(() => {
    current.current = settings;
  }, [settings]);
  const players = useRef(new Map<SoundId, AudioPlayer[]>());
  const { skin } = useSkin();
  const ambienceSource = skin.ambience;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSettingsState(parseSettings(raw));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false }).catch(() => {});
    const loaded = players.current;
    for (const id of Object.keys(SOURCES) as SoundId[]) {
      loaded.set(
        id,
        SOURCES[id].map((source) => createAudioPlayer(source)),
      );
    }
    return () => {
      for (const takes of loaded.values()) for (const player of takes) player.remove();
      loaded.clear();
    };
  }, []);

  // One looping player per table style; level and mute only change its volume or pause it.
  const ambiencePlayer = useRef<AudioPlayer | null>(null);
  useEffect(() => {
    if (ambienceSource === undefined) return;
    const player = createAudioPlayer(ambienceSource);
    player.loop = true;
    ambiencePlayer.current = player;
    // Browsers refuse audio until the first user gesture; start the loop on it.
    const resume = () => {
      const { ambience, muted } = current.current;
      if (ambience > 0 && !muted) player.play();
    };
    const web = Platform.OS === 'web' && typeof document !== 'undefined';
    if (web) document.addEventListener('pointerdown', resume, { once: true });
    return () => {
      if (web) document.removeEventListener('pointerdown', resume);
      ambiencePlayer.current = null;
      player.pause();
      player.remove();
    };
  }, [ambienceSource]);

  useEffect(() => {
    const player = ambiencePlayer.current;
    if (!player) return;
    const volume = settings.muted ? 0 : settings.ambience * AMBIENCE_GAIN;
    if (volume === 0) {
      player.pause();
      return;
    }
    player.volume = volume;
    player.play();
  }, [settings.ambience, settings.muted, ambienceSource]);

  const play = useCallback((id: SoundId) => {
    const { effects, muted } = current.current;
    if (muted || effects === 0) return;
    const takes = players.current.get(id);
    if (!takes || takes.length === 0) return;
    const player = takes[Math.floor(Math.random() * takes.length)]!;
    player.volume = (VOLUME[id] ?? 1) * effects;
    // Restart from the top, so quick repeats (cards landing one after another) each sound.
    player.seekTo(0).catch(() => {});
    player.play();
  }, []);

  const setSettings = useCallback((patch: Partial<SoundSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, setSettings, play }), [settings, setSettings, play]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}
