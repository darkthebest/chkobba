import type { NakamaGameClient } from './NakamaGameClient';

/**
 * Hands the running client from the "Finding players" screen to the game
 * screen, so the table keeps the same socket and seat. At most one client is
 * held: holding another stops the previous one, so nothing leaks.
 */
let held: NakamaGameClient | null = null;

/** Keeps `client` (already started) for the game screen to pick up. */
export function holdClient(client: NakamaGameClient): void {
  if (held !== null && held !== client) held.stop();
  held = client;
}

/** The held client for `matchId`, without taking it (safe to call during render). */
export function peekClient(matchId: string): NakamaGameClient | null {
  return held !== null && held.matchId === matchId ? held : null;
}

/** True while `client` waits for the game screen; its owner must not stop it then. */
export function isHeld(client: NakamaGameClient): boolean {
  return held === client;
}

/** The game screen took ownership of `client` (it now stops it on unmount). */
export function releaseClient(client: NakamaGameClient): void {
  if (held === client) held = null;
}
