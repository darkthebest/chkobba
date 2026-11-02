import { useEffect, useRef } from 'react';

import type { TableController } from '@/game/useTableController';

import { useSound } from './soundContext';

/** The turn clock ticks over its last seconds. */
const TICK_FROM_SECONDS = 5;

/**
 * Plays the table's sounds, each timed with what the player sees: a card lands,
 * captured cards sweep, the chkobba celebration, deals, round and game ends,
 * and online the turn chime and the last seconds of our clock. Never replays
 * what happened before the table mounted.
 */
export function useTableSounds(c: TableController): void {
  const { play } = useSound();
  const { log, staged, celebration, showSummary, view, myTurn, myTeam, turnTimer, mySeat } = c;
  const online = c.connection !== undefined;

  const seenSeq = useRef(log[log.length - 1]?.seq ?? 0);
  useEffect(() => {
    const fresh = log.filter((entry) => entry.seq > seenSeq.current);
    if (fresh.length === 0) return;
    seenSeq.current = fresh[fresh.length - 1]!.seq;
    if (fresh.some((entry) => entry.event.type === 'cardPlayed')) play('place');
    // A round opens with a shuffle; the later deals of the round only fan out the cards.
    const deal = fresh.find((entry) => entry.event.type === 'handsDealt')?.event;
    if (deal?.type === 'handsDealt') play(deal.deal === 1 ? 'shuffle' : 'deal');
  }, [log, play]);

  useOnRise(staged.sweeping, () => play('sweep'));

  const lastCelebration = useRef(celebration?.seq ?? null);
  useEffect(() => {
    if (!celebration || celebration.seq === lastCelebration.current) return;
    lastCelebration.current = celebration.seq;
    play('chkobba');
  }, [celebration, play]);

  useOnRise(showSummary, () => {
    if (view.phase !== 'gameOver') play('roundEnd');
    else play(view.winner === myTeam ? 'win' : 'lose');
  });

  useOnRise(online && myTurn, () => play('turn'));

  const mine = turnTimer?.seat === mySeat ? turnTimer.secondsLeft : null;
  const lastTick = useRef<number | null>(null);
  useEffect(() => {
    if (mine === null || mine > TICK_FROM_SECONDS) {
      lastTick.current = null; // a new countdown ticks again
      return;
    }
    if (mine <= 0 || mine === lastTick.current) return;
    lastTick.current = mine;
    play('tick');
  }, [mine, play]);
}

/** Runs `effect` when `value` turns true (not when it is already true on mount). */
function useOnRise(value: boolean, effect: () => void): void {
  const previous = useRef(value);
  const latest = useRef(effect);
  useEffect(() => {
    latest.current = effect;
  });
  useEffect(() => {
    if (value && !previous.current) latest.current();
    previous.current = value;
  }, [value]);
}
