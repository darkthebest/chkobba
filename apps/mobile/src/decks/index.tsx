import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  MATCH_WIN_COINS,
  boxSize,
  openBoxes,
  STARTING_COINS,
  type BoxCount,
  type BoxOpening,
} from './economy';
import { getDeck, type DeckTheme } from './themes';

export { DeckCardBack } from './DeckCardBack';
export { DeckCardFace } from './DeckCardFace';
export { DeckPattern } from './DeckPattern';
export {
  BOX_PRICES,
  DUPE_COINS,
  MATCH_WIN_COINS,
  RARITY_WEIGHTS,
  STARTING_COINS,
  boxSize,
  type BoxCount,
  type BoxOpening,
  type BoxResult,
} from './economy';
export { DECKS, RARITY_ORDER, faceColors, getDeck, type DeckPattern as DeckPatternId, type DeckRarity, type DeckTheme } from './themes';

const VAULT_KEY = 'chkobba.vault.v1';
const DECK_KEY = 'chkobba.deck';

/** Owned decks with their duplicate counts, plus how many boxes were ever opened. */
export type OwnedCounts = Readonly<Record<string, number>>;

interface VaultState {
  coins: number;
  owned: Record<string, number>;
  opened: number;
}

interface DeckContextValue {
  deckId: string | null;
  deck: DeckTheme | null;
  setDeck: (id: string | null) => void;
  coins: number;
  owned: OwnedCounts;
  ownedIds: readonly string[];
  opened: number;
  ready: boolean;
  openBox: (count: BoxCount) => BoxOpening | null;
  awardWin: () => void;
}

const DeckContext = createContext<DeckContextValue>({
  deckId: null,
  deck: null,
  setDeck: () => {},
  coins: STARTING_COINS,
  owned: {},
  ownedIds: [],
  opened: 0,
  ready: false,
  openBox: () => null,
  awardWin: () => {},
});

function parseVault(raw: string | null): VaultState {
  const empty: VaultState = { coins: STARTING_COINS, owned: {}, opened: 0 };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as { coins?: unknown; owned?: unknown; opened?: unknown };
    const coins =
      typeof parsed.coins === 'number' && Number.isFinite(parsed.coins)
        ? Math.max(0, Math.floor(parsed.coins))
        : STARTING_COINS;
    // Counts map (current) or id list (the first shipped format).
    const owned: Record<string, number> = {};
    if (Array.isArray(parsed.owned)) {
      for (const id of parsed.owned) {
        if (typeof id === 'string' && getDeck(id) !== null) owned[id] = (owned[id] ?? 0) + 1;
      }
    } else if (typeof parsed.owned === 'object' && parsed.owned !== null) {
      for (const [id, count] of Object.entries(parsed.owned)) {
        if (typeof id === 'string' && getDeck(id) !== null && typeof count === 'number' && count >= 1) {
          owned[id] = Math.min(99, Math.floor(count));
        }
      }
    }
    const opened =
      typeof parsed.opened === 'number' && Number.isFinite(parsed.opened) && parsed.opened >= 0
        ? Math.floor(parsed.opened)
        : 0;
    return { coins, owned, opened };
  } catch {
    return empty;
  }
}

function saveVault(vault: VaultState): void {
  AsyncStorage.setItem(VAULT_KEY, JSON.stringify(vault)).catch(() => {});
}

/** The selected deck skin and the local coin vault that unlocks the rest. */
export function DeckProvider({ children, initial = null }: { children: ReactNode; initial?: string | null }) {
  const [deckId, setDeckId] = useState<string | null>(initial);
  const [coins, setCoins] = useState(STARTING_COINS);
  const [owned, setOwned] = useState<OwnedCounts>({});
  const [opened, setOpened] = useState(0);
  const [ready, setReady] = useState(false);
  const vaultRef = useRef<VaultState>({ coins: STARTING_COINS, owned: {}, opened: 0 });
  const readyRef = useRef(false);
  const pendingCoins = useRef(0);

  useEffect(() => {
    let alive = true;
    Promise.all([AsyncStorage.getItem(VAULT_KEY), AsyncStorage.getItem(DECK_KEY)])
      .then(([rawVault, savedDeck]) => {
        if (!alive) return;
        const vault = parseVault(rawVault);
        const saved = getDeck(savedDeck);
        if (saved && vault.owned[saved.id] === undefined) {
          vault.owned = { ...vault.owned, [saved.id]: 1 };
        }
        vault.coins += pendingCoins.current;
        pendingCoins.current = 0;
        vaultRef.current = vault;
        readyRef.current = true;
        setCoins(vault.coins);
        setOwned(vault.owned);
        setOpened(vault.opened);
        setDeckId(saved && vault.owned[saved.id] !== undefined ? saved.id : null);
        setReady(true);
        if (rawVault !== JSON.stringify(vault)) saveVault(vault);
        if (savedDeck && !(saved && vault.owned[saved.id] !== undefined)) {
          AsyncStorage.removeItem(DECK_KEY).catch(() => {});
        }
      })
      .catch(() => {
        if (!alive) return;
        vaultRef.current = { coins: STARTING_COINS + pendingCoins.current, owned: {}, opened: 0 };
        pendingCoins.current = 0;
        readyRef.current = true;
        setCoins(vaultRef.current.coins);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const setDeck = useCallback((id: string | null) => {
    const next = id && getDeck(id) && vaultRef.current.owned[id] !== undefined ? id : null;
    setDeckId(next);
    if (next) AsyncStorage.setItem(DECK_KEY, next).catch(() => {});
    else AsyncStorage.removeItem(DECK_KEY).catch(() => {});
  }, []);

  const openBox = useCallback((count: BoxCount) => {
    const current = vaultRef.current;
    const opening = openBoxes(current.coins, Object.keys(current.owned), count);
    if (!opening) return null;
    const owned = { ...current.owned };
    for (const result of opening.results) {
      owned[result.deck.id] = (owned[result.deck.id] ?? 0) + 1;
    }
    const next: VaultState = { coins: opening.coins, owned, opened: current.opened + boxSize(count) };
    vaultRef.current = next;
    setCoins(next.coins);
    setOwned(next.owned);
    setOpened(next.opened);
    saveVault(next);
    return opening;
  }, []);

  const awardWin = useCallback(() => {
    if (!readyRef.current) {
      pendingCoins.current += MATCH_WIN_COINS;
      return;
    }
    const next = { ...vaultRef.current, coins: vaultRef.current.coins + MATCH_WIN_COINS };
    vaultRef.current = next;
    setCoins(next.coins);
    saveVault(next);
  }, []);

  const deck = useMemo(() => getDeck(deckId), [deckId]);
  const ownedIds = useMemo(() => Object.keys(owned), [owned]);
  const value = useMemo(
    () => ({ deckId, deck, setDeck, coins, owned, ownedIds, opened, ready, openBox, awardWin }),
    [deckId, deck, setDeck, coins, owned, ownedIds, opened, ready, openBox, awardWin],
  );
  return <DeckContext.Provider value={value}>{children}</DeckContext.Provider>;
}

export function useDeck(): DeckContextValue {
  return useContext(DeckContext);
}
