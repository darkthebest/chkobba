import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import type { TableController } from './useTableController';

/**
 * Desktop keyboard play (web only):
 * ← → choose a hand card · 1–9 take that numbered capture · Enter play the only
 * option (without hints: place the card) or continue past the round summary · Esc cancel the selection ·
 * K / T keep or throw the cut card · Enter/Esc skip the dealer draw.
 * No shortcuts while the player sheet is open: its own buttons (and Esc, via the modal) handle keys.
 */
export function useTableKeyboard(c: TableController, enabled = Platform.OS === 'web') {
  // Keep the listener stable and read the latest controller through a ref.
  const latest = useRef(c);
  useEffect(() => {
    latest.current = c;
  });

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const ctl = latest.current;
      if (ctl.playerSheetSeat !== null) return;

      if (ctl.intro) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault();
          ctl.dismissIntro();
        }
        return;
      }
      if (ctl.iAmCutting) {
        if (e.key === 'k' || e.key === 'K') ctl.cut(true);
        if (e.key === 't' || e.key === 'T') ctl.cut(false);
        return;
      }
      if (ctl.showSummary) {
        if (e.key === 'Enter' && ctl.view.phase === 'roundOver') {
          e.preventDefault();
          ctl.nextRound();
        }
        return;
      }
      if (!ctl.myTurn) return;

      const hand = ctl.view.hand;
      const index = hand.findIndex((card) => card.id === ctl.selectedId);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const next = index === -1 ? (step === 1 ? 0 : hand.length - 1) : (index + step + hand.length) % hand.length;
        ctl.select(hand[next]?.id ?? null);
      } else if (e.key === 'Escape') {
        ctl.select(null);
      } else if (/^[1-9]$/.test(e.key)) {
        const option = ctl.previewMoves.find((m) => m.n === Number(e.key));
        if (option && ctl.selectedMoves.length > 0) ctl.play(option.move);
      } else if (e.key === 'Enter' || e.key === ' ') {
        // Without hints Enter only places: captures are picked on the table.
        const move = ctl.hints
          ? ctl.selectedMoves.length === 1
            ? ctl.selectedMoves[0]
            : undefined
          : ctl.selectedMoves.find((m) => m.capture.length === 0);
        if (move) {
          e.preventDefault();
          ctl.play(move);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
