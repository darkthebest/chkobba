import { createContext, useContext } from 'react';

/** Game sound effects; files live in assets/sounds (see its README for sources). */
export type SoundId = 'place' | 'sweep' | 'shuffle' | 'deal' | 'turn' | 'tick' | 'chkobba' | 'roundEnd' | 'win' | 'lose';

/** Volume steps offered in the UI (0 is off). */
export const SOUND_LEVELS = 4;

export interface SoundSettings {
  /** Card, capture and game event sounds, 0 (off) to 1. */
  effects: number;
  /** The table style's background loop (café murmur), 0 (off) to 1. */
  ambience: number;
  /** Silences everything without losing the two levels. */
  muted: boolean;
}

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { effects: 1, ambience: 0.5, muted: false };

export interface SoundContextValue {
  settings: SoundSettings;
  setSettings: (patch: Partial<SoundSettings>) => void;
  /** Plays an effect (no-op when muted, at level 0, or when audio is unavailable). */
  play: (id: SoundId) => void;
}

/**
 * Kept apart from SoundProvider so screens and tests can read sound state
 * without loading the native audio module; without a provider every call is a no-op.
 */
export const SoundContext = createContext<SoundContextValue>({
  settings: DEFAULT_SOUND_SETTINGS,
  setSettings: () => {},
  play: () => {},
});

export function useSound(): SoundContextValue {
  return useContext(SoundContext);
}
