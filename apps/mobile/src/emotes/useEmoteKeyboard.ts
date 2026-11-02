import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import type { EmoteId } from './catalog';
import type { Emotes } from './useEmotes';

/**
 * Desktop emote keys (web only): E toggles the picker; while it is open 1–9
 * send that tile and Esc closes it. Listens in the capture phase and stops
 * handled keys, so the table's own keys (1–9 pick a capture) don't also fire.
 * `suspended` (e.g. while the player sheet is open) ignores every key without unsubscribing.
 */
export function useEmoteKeyboard(emotes: Emotes, order: readonly EmoteId[], enabled = Platform.OS === 'web', suspended = false) {
  const latest = useRef(emotes);
  const paused = useRef(suspended);
  useEffect(() => {
    latest.current = emotes;
    paused.current = suspended;
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const em = latest.current;
      if (paused.current || !em.enabled || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      let handled = false;
      if (e.key === 'e' || e.key === 'E') {
        em.setPickerOpen(!em.pickerOpen);
        handled = true;
      } else if (em.pickerOpen && e.key === 'Escape') {
        em.setPickerOpen(false);
        handled = true;
      } else if (em.pickerOpen && /^[1-9]$/.test(e.key)) {
        const id = order[Number(e.key) - 1];
        if (id) em.send(id);
        handled = true;
      }
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, order]);
}
