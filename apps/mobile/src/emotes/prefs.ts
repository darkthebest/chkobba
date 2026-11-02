import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useSyncExternalStore } from 'react';

import { DEFAULT_QUICK, isEmoteId, QUICK_SIZE, type EmoteId } from './catalog';

const STORAGE_KEY = 'chkobba.emotes';

/** Emote preferences on this device. */
export interface EmotePrefs {
  /** Hide every other player's emotes (Settings). */
  readonly mutedAll: boolean;
  /** The quick row: most recently sent first. */
  readonly quick: readonly EmoteId[];
}

export const DEFAULT_EMOTE_PREFS: EmotePrefs = { mutedAll: false, quick: DEFAULT_QUICK };

let prefs: EmotePrefs = DEFAULT_EMOTE_PREFS;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Keeps only what is valid, so a stale or tampered record can't break the row. */
export function parseEmotePrefs(raw: string | null): Partial<EmotePrefs> {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (typeof value !== 'object' || value === null) return {};
    const out: { mutedAll?: boolean; quick?: EmoteId[] } = {};
    if ('mutedAll' in value && typeof value.mutedAll === 'boolean') out.mutedAll = value.mutedAll;
    if ('quick' in value && Array.isArray(value.quick)) {
      const quick = value.quick.filter(isEmoteId).filter((id, i, all) => all.indexOf(id) === i);
      if (quick.length === QUICK_SIZE) out.quick = quick;
    }
    return out;
  } catch {
    return {};
  }
}

/** Reads the saved preferences once (best effort; storage can fail). */
export function loadEmotePrefs(): Promise<void> {
  loading ??= AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      prefs = { ...prefs, ...parseEmotePrefs(raw) };
      emit();
    })
    .catch(() => {});
  return loading;
}

export function getEmotePrefs(): EmotePrefs {
  return prefs;
}

export function setEmotePrefs(patch: Partial<EmotePrefs>): void {
  prefs = { ...prefs, ...patch };
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)).catch(() => {});
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useEmotePrefs(): EmotePrefs {
  useEffect(() => {
    void loadEmotePrefs();
  }, []);
  return useSyncExternalStore(subscribe, getEmotePrefs, getEmotePrefs);
}

/** Tests only: forget the in-memory copy. */
export function resetEmotePrefsForTests(): void {
  prefs = DEFAULT_EMOTE_PREFS;
  loading = null;
  emit();
}
