/**
 * Shared friends fixtures. Server (Vitest) and mobile (Jest) tests import them
 * via `@chkobba/protocol/testing`, so both sides agree on a snapshot whose
 * human seats carry `userId` (needed for "add friend from the table") while
 * bot seats don't. Pure data: no test-framework imports.
 *
 * Never import this file from `src/index.ts`, so the server bundle never
 * includes it.
 */
import type { PlayerInfo, Snapshot } from '../index';
import { PUBLIC_PLAYING_SNAPSHOT } from './roomFixtures';

/** Nakama user id of Hamza (seat 0, the snapshot's own seat). */
export const FIXTURE_USER_ID_HAMZA = '00000000-0000-4000-8000-000000000001';
/** Nakama user id of Sami (seat 2, Hamza's partner). */
export const FIXTURE_USER_ID_SAMI = '00000000-0000-4000-8000-000000000002';

/** A valid, already-normalized friend code (FRIEND_CODE_ALPHABET, 8 symbols). */
export const FIXTURE_FRIEND_CODE = 'K7M2QXAB';

function human(name: string, userId: string): PlayerInfo {
  return { name, isBot: false, away: false, connected: true, userId };
}

function bot(name: string): PlayerInfo {
  return { name, isBot: true, away: false, connected: true };
}

/**
 * `PUBLIC_PLAYING_SNAPSHOT` (seat 0, mid-game) with `userId` on the two human
 * seats (Hamza in 0, Sami in 2) and none on the bots in seats 1 and 3.
 */
export const PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS: Snapshot = {
  ...PUBLIC_PLAYING_SNAPSHOT,
  players: [
    human('Hamza', FIXTURE_USER_ID_HAMZA),
    bot('Bot 1'),
    human('Sami', FIXTURE_USER_ID_SAMI),
    bot('Bot 3'),
  ],
};
