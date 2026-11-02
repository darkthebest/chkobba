import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useLanguage, type Script } from '@/i18n';

import { cafeSkin } from './cafe';
import { minimalSkin } from './minimal';
import { neonSkin } from './neon';
import { saharaSkin } from './sahara';
import { sidiSkin } from './sidi';
import type { Skin, SkinId } from './types';

export type { Skin, SkinId } from './types';

/** All skins in picker order. */
export const SKINS: readonly Skin[] = [cafeSkin, minimalSkin, saharaSkin, sidiSkin, neonSkin];
export const DEFAULT_SKIN_ID: SkinId = 'cafe';

const STORAGE_KEY = 'chkobba.skin';

export function getSkin(id: string | null | undefined): Skin {
  return SKINS.find((s) => s.id === id) ?? cafeSkin;
}

/** The skin with its text fonts swapped for its Arabic-script fonts when the language needs them. */
export function localizeSkin(skin: Skin, script: Script): Skin {
  if (script !== 'arabic') return skin;
  const f = skin.tokens.fonts;
  const fonts = { ...f, display: f.arabic, bodyBold: f.arabic, body: f.arabicBody, bodyItalic: f.arabicBody };
  return { ...skin, tokens: { ...skin.tokens, fonts } };
}

interface SkinContextValue {
  skin: Skin;
  setSkin: (id: SkinId) => void;
}

const SkinContext = createContext<SkinContextValue>({ skin: cafeSkin, setSkin: () => {} });

/** Holds the selected skin and remembers it across launches (best effort; storage can fail). */
export function SkinProvider({ children, initial = DEFAULT_SKIN_ID }: { children: ReactNode; initial?: SkinId }) {
  const [skinId, setSkinId] = useState<SkinId>(initial);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && SKINS.some((s) => s.id === saved)) setSkinId(saved as SkinId);
      })
      .catch(() => {});
  }, []);

  const setSkin = (id: SkinId) => {
    setSkinId(id);
    AsyncStorage.setItem(STORAGE_KEY, id).catch(() => {});
  };

  const { script } = useLanguage();
  const skin = useMemo(() => localizeSkin(getSkin(skinId), script), [skinId, script]);
  return <SkinContext.Provider value={{ skin, setSkin }}>{children}</SkinContext.Provider>;
}

export function useSkin(): SkinContextValue {
  return useContext(SkinContext);
}
