/**
 * Shared private-table (room) snapshot fixtures. Server (Vitest) and mobile
 * (Jest) tests import them via `@chkobba/protocol/testing`, so both sides agree
 * on the shape of a Snapshot with and without `room`. Pure data: no
 * test-framework imports.
 *
 * Never import this file from `src/index.ts`, so the server bundle never
 * includes it.
 */
import { DEFAULT_RULES, parseCard } from '@chkobba/rules';
import type { PlayerView } from '@chkobba/rules';
import type { PlayerInfo, Snapshot } from '../index';
import type { RoomInfo } from '../room';

/** A valid, already-normalized room code. */
export const FIXTURE_ROOM_CODE = 'K7M2QX';
/** Fixed server clock for every fixture. */
export const FIXTURE_SERVER_TIME = 1790000000000;

function human(name: string): PlayerInfo {
  return { name, isBot: false, away: false, connected: true };
}

function bot(name: string): PlayerInfo {
  return { name, isBot: true, away: false, connected: true };
}

/**
 * Seat 0's view at the start of round 2 (scores 3-5), first deal, seat 0 to
 * play: 12 cards in hands, 4 on the table, 24 in the stock, empty piles.
 */
export const SEATED_VIEW: PlayerView = {
  seat: 0,
  playerCount: 4,
  rules: DEFAULT_RULES,
  phase: 'playing',
  round: 2,
  deal: 1,
  dealer: 3,
  turn: 0,
  hand: ['7D', '3H', 'KS'].map(parseCard),
  handCounts: [3, 3, 3, 3],
  table: ['4C', '2S', 'QH', 'AD'].map(parseCard),
  stockCount: 24,
  cut: null,
  pileCounts: [0, 0],
  piles: [[], []],
  lastCapturer: null,
  chkobbas: [0, 0],
  scores: [3, 5],
  lastRound: null,
  winner: null,
  legalMoves: [
    { seat: 0, cardId: '7D', capture: ['4C', '2S', 'AD'] },
    { seat: 0, cardId: '3H', capture: ['2S', 'AD'] },
    { seat: 0, cardId: 'KS', capture: ['QH', '2S'] },
  ],
};

/** Waiting room: host Hamza in seat 0, Sami in seat 2, Lina standing. */
const WAITING_PLAYERS: readonly (PlayerInfo | null)[] = [human('Hamza'), null, human('Sami'), null];

function waitingRoom(you: number): RoomInfo {
  return {
    code: FIXTURE_ROOM_CODE,
    members: [
      { name: 'Hamza', seat: 0, isHost: true, userId: 'user-hamza' },
      { name: 'Sami', seat: 2, isHost: false, userId: 'user-sami' },
      { name: 'Lina', seat: null, isHost: false, userId: 'user-lina' },
    ],
    you,
    scores: null,
    resetAt: null,
  };
}

/** In game: Hamza and Sami seated, bots in seats 1 and 3, Lina standing. */
const PLAYING_PLAYERS: readonly (PlayerInfo | null)[] = [human('Hamza'), bot('Bot 1'), human('Sami'), bot('Bot 3')];

function playingRoom(you: number): RoomInfo {
  return {
    code: FIXTURE_ROOM_CODE,
    members: [
      { name: 'Hamza', seat: 0, isHost: true, userId: 'user-hamza' },
      { name: 'Sami', seat: 2, isHost: false, userId: 'user-sami' },
      { name: 'Lina', seat: null, isHost: false, userId: 'user-lina' },
    ],
    you,
    scores: [3, 5],
    resetAt: null,
  };
}

/** The host, seated in seat 0 of a private table that is still waiting. */
export const PRIVATE_WAITING_SEATED_SNAPSHOT: Snapshot = {
  seat: 0,
  phase: 'waiting',
  view: null,
  players: WAITING_PLAYERS,
  log: [],
  turnDeadline: null,
  backfillAt: null,
  nextRoundAt: null,
  serverTime: FIXTURE_SERVER_TIME,
  room: waitingRoom(0),
};

/** A standing member (Lina) of a private table that is still waiting. */
export const PRIVATE_WAITING_STANDING_SNAPSHOT: Snapshot = {
  seat: -1,
  phase: 'waiting',
  view: null,
  players: WAITING_PLAYERS,
  log: [],
  turnDeadline: null,
  backfillAt: null,
  nextRoundAt: null,
  serverTime: FIXTURE_SERVER_TIME,
  room: waitingRoom(2),
};

/** The host, seated in seat 0 of a private table mid-game, with their own view. */
export const PRIVATE_PLAYING_SEATED_SNAPSHOT: Snapshot = {
  seat: 0,
  phase: 'playing',
  view: SEATED_VIEW,
  players: PLAYING_PLAYERS,
  log: [],
  turnDeadline: FIXTURE_SERVER_TIME + 20000,
  backfillAt: null,
  nextRoundAt: null,
  serverTime: FIXTURE_SERVER_TIME,
  room: playingRoom(0),
};

/** A standing member (Lina) watching a private table mid-game: no view, scores in `room`. */
export const PRIVATE_PLAYING_STANDING_SNAPSHOT: Snapshot = {
  seat: -1,
  phase: 'playing',
  view: null,
  players: PLAYING_PLAYERS,
  log: [],
  turnDeadline: FIXTURE_SERVER_TIME + 20000,
  backfillAt: null,
  nextRoundAt: null,
  serverTime: FIXTURE_SERVER_TIME,
  room: playingRoom(2),
};

/** Seat 0 at a public (quick match) table mid-game: no `room` field at all. */
export const PUBLIC_PLAYING_SNAPSHOT: Snapshot = {
  seat: 0,
  phase: 'playing',
  view: SEATED_VIEW,
  players: [human('Hamza'), bot('Bot 1'), human('Sami'), bot('Bot 3')],
  log: [],
  turnDeadline: FIXTURE_SERVER_TIME + 20000,
  backfillAt: null,
  nextRoundAt: null,
  serverTime: FIXTURE_SERVER_TIME,
};
