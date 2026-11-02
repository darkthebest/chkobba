import type { Seat } from '@chkobba/rules';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import type { GameClient, SeatInfo } from '@/game/GameClient';
import { useT } from '@/i18n';

import { BUBBLE_MS, EMOTE_COOLDOWN_MS, emoteName, nextQuick, type EmoteId } from './catalog';
import { setEmotePrefs, useEmotePrefs } from './prefs';

export interface EmoteBubble {
  readonly id: EmoteId;
  /** Changes with every emote, so a repeat from the same seat replays the animation. */
  readonly key: number;
}

export interface Emotes {
  /** False when the client can't send emotes (then no emote UI is shown). */
  readonly enabled: boolean;
  /** The bubble currently up at each seat, ours included. */
  readonly bubbles: ReadonlyMap<Seat, EmoteBubble>;
  /** The quick row: most recently sent first. */
  readonly quick: readonly EmoteId[];
  /** True for EMOTE_COOLDOWN_MS after we send one. */
  readonly cooling: boolean;
  send(id: EmoteId): void;
  /** Seats whose emotes we hide (this device only). */
  readonly muted: ReadonlySet<Seat>;
  toggleMute(seat: Seat): void;
  readonly pickerOpen: boolean;
  setPickerOpen(open: boolean): void;
  /** The seat whose emote menu (mute) is open, or null. */
  readonly menuSeat: Seat | null;
  setMenuSeat(seat: Seat | null): void;
}

/**
 * Table emotes for one game: what we send (with the cooldown and the
 * last-used quick row) and the bubbles others send, minus muted seats.
 */
export function useEmotes(client: GameClient, mySeat: Seat, players: readonly SeatInfo[]): Emotes {
  const tr = useT();
  const prefs = useEmotePrefs();
  const [bubbles, setBubbles] = useState<ReadonlyMap<Seat, EmoteBubble>>(new Map());
  const [cooling, setCooling] = useState(false);
  const [muted, setMuted] = useState<ReadonlySet<Seat>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [menuSeat, setMenuSeat] = useState<Seat | null>(null);
  const timers = useRef(new Map<Seat, ReturnType<typeof setTimeout>>());
  const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keySeq = useRef(0);

  // Read the latest values from inside long-lived callbacks.
  const live = useRef({ muted, mutedAll: prefs.mutedAll, players, cooling, quick: prefs.quick });
  useEffect(() => {
    live.current = { muted, mutedAll: prefs.mutedAll, players, cooling, quick: prefs.quick };
  });

  const show = useCallback((seat: Seat, id: EmoteId) => {
    const key = ++keySeq.current;
    setBubbles((prev) => new Map(prev).set(seat, { id, key }));
    const old = timers.current.get(seat);
    if (old) clearTimeout(old);
    timers.current.set(
      seat,
      setTimeout(() => {
        timers.current.delete(seat);
        setBubbles((prev) => {
          if (prev.get(seat)?.key !== key) return prev;
          const next = new Map(prev);
          next.delete(seat);
          return next;
        });
      }, BUBBLE_MS),
    );
  }, []);

  useEffect(() => {
    if (!client.subscribeEmotes) return;
    return client.subscribeEmotes(({ seat, id }) => {
      const { muted: hidden, mutedAll, players: seats } = live.current;
      if (seat === mySeat || mutedAll || hidden.has(seat)) return;
      show(seat, id);
      const name = seats[seat]?.name ?? '';
      AccessibilityInfo.announceForAccessibility(tr('emotes.said', { name, emote: emoteName(id, tr) }));
    });
  }, [client, mySeat, show, tr]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
      if (cooldown.current) clearTimeout(cooldown.current);
    };
  }, []);

  const send = useCallback(
    (id: EmoteId) => {
      if (!client.emote || live.current.cooling) return;
      live.current = { ...live.current, cooling: true };
      client.emote(id);
      show(mySeat, id);
      setPickerOpen(false);
      setCooling(true);
      // The quick row reorders when the cooldown ends, never under the player's finger.
      cooldown.current = setTimeout(() => {
        cooldown.current = null;
        setCooling(false);
        setEmotePrefs({ quick: nextQuick(live.current.quick, id) });
      }, EMOTE_COOLDOWN_MS);
    },
    [client, mySeat, show],
  );

  const toggleMute = useCallback((seat: Seat) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(seat)) next.delete(seat);
      else next.add(seat);
      return next;
    });
    // Muting also clears what that seat has up right now.
    setBubbles((prev) => {
      if (!prev.has(seat)) return prev;
      const next = new Map(prev);
      next.delete(seat);
      return next;
    });
    setMenuSeat(null);
  }, []);

  return {
    enabled: client.emote !== undefined,
    bubbles,
    quick: prefs.quick,
    cooling,
    send,
    muted,
    toggleMute,
    pickerOpen,
    setPickerOpen,
    menuSeat,
    setMenuSeat,
  };
}

export const EmotesContext = createContext<Emotes | null>(null);

/** The table's emotes, or null outside a game (components then render nothing). */
export function useEmotesContext(): Emotes | null {
  return useContext(EmotesContext);
}
