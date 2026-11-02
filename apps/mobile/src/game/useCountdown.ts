import { useEffect, useState } from 'react';

/** Redraw rate of countdowns: smooth enough for a draining ring, cheap enough for a phone. */
const TICK_MS = 250;
/**
 * A deadline that moved by less than this is the same countdown, only corrected
 * (the client refines its server clock offset with each snapshot).
 */
const SAME_DEADLINE_MS = 1000;

export interface Countdown {
  /** Remaining share of the time since the countdown started, 1 → 0. */
  readonly fraction: number;
  /** Whole seconds left (rounded up); null until the first tick measured the clock. */
  readonly secondsLeft: number | null;
}

interface Tick {
  readonly key: string;
  readonly deadline: number;
  readonly startedAt: number;
  readonly now: number;
}

const sameCountdown = (tick: Tick, key: string, deadline: number) =>
  tick.key === key && Math.abs(tick.deadline - deadline) <= SAME_DEADLINE_MS;

/**
 * Counts down to `deadline` (local-clock ms), re-rendering every 250 ms while
 * it runs. Returns null when there is no deadline.
 *
 * `key` names what is being timed (e.g. whose turn, and after which move), so
 * two back-to-back countdowns with close deadlines still restart at 1.
 */
export function useCountdown(deadline: number | null | undefined, key = ''): Countdown | null {
  const [tick, setTick] = useState<Tick | null>(null);

  useEffect(() => {
    if (deadline === null || deadline === undefined) return;
    const update = () =>
      setTick((prev) => {
        const now = Date.now();
        const startedAt = prev !== null && sameCountdown(prev, key, deadline) ? prev.startedAt : now;
        return { key, deadline, startedAt, now };
      });
    const first = setTimeout(update, 0);
    const interval = setInterval(update, TICK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [deadline, key]);

  if (deadline === null || deadline === undefined) return null;
  if (tick === null || !sameCountdown(tick, key, deadline)) return { fraction: 1, secondsLeft: null };
  const remainingMs = Math.max(0, deadline - tick.now);
  const totalMs = deadline - tick.startedAt;
  return {
    fraction: totalMs > 0 ? Math.min(1, remainingMs / totalMs) : 0,
    secondsLeft: Math.ceil(remainingMs / 1000),
  };
}
