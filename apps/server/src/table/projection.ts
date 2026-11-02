import { viewFor } from '@chkobba/rules';
import type { LogEntry, PlayerInfo, RoomInfo, RoomMember, Snapshot, TableLabel } from '@chkobba/protocol';
import { findHumanSeat, isConnected, roomOf } from './lifecycle';
import { findMember } from './room';
import { BACKFILL_MS, SEAT_COUNT, STANDING_SEAT, type PrivateRoom, type SeatSlot, type TableState } from './types';

/**
 * What one seat may see. The only game data is `viewFor(game, seat)`, which
 * carries that seat's own hand, counts for everyone else and no stock, so no
 * other hand, the stock or a hidden cut card can reach this snapshot. Human
 * players carry their `userId` but never a session id. `now` is stamped as `serverTime`.
 * On a private table the snapshot also carries `room`, with `you` pointing at
 * the seat holder's member entry (-1 when the seat holds no member, e.g. a bot).
 */
export function snapshotFor(state: TableState, seat: number, sinceSeq: number, now: number): Snapshot {
  if (seat !== Math.floor(seat) || seat < 0 || seat >= SEAT_COUNT) {
    throw new RangeError(`snapshotFor: invalid seat ${seat}`);
  }
  const slot = state.seats[seat];
  return buildSnapshot(state, seat, slot && slot.kind === 'human' ? slot.userId : null, sinceSeq, now);
}

/**
 * Snapshot for a member of a private table, seated or standing. A seated
 * member gets the same snapshot as `snapshotFor(their seat)`. A standing
 * member gets `seat: -1` and `view: null`: no `PlayerView` is built for them,
 * so they see no cards at all, only seats, names and `room.scores`.
 */
export function snapshotForMember(state: TableState, userId: string, sinceSeq: number, now: number): Snapshot {
  const room = roomOf(state);
  if (room === null || findMember(room, userId) === null) {
    throw new RangeError('snapshotForMember: not a member of a private table');
  }
  const seated = findHumanSeat(state, userId);
  return buildSnapshot(state, seated ? seated.index : STANDING_SEAT, userId, sinceSeq, now);
}

/** Nakama match label; the adapter passes `JSON.stringify(label(state))`. Never carries the room code. */
export function label(state: TableState): TableLabel {
  const seatsFree = state.seats.filter((slot) => slot === null).length;
  if (roomOf(state) !== null) return { open: false, mode: '2v2', seatsFree, private: true };
  return { open: state.phase === 'waiting' && seatsFree > 0, mode: '2v2', seatsFree, private: false };
}

/** `seat` is 0-3 or STANDING_SEAT; `userId` finds the recipient's member entry on private tables. */
function buildSnapshot(
  state: TableState,
  seat: number,
  userId: string | null,
  sinceSeq: number,
  now: number,
): Snapshot {
  const room = roomOf(state);
  const snapshot: Snapshot = {
    seat,
    phase: state.phase,
    view: state.game && seat !== STANDING_SEAT ? viewFor(state.game, seat) : null,
    players: state.seats.map(playerInfo),
    log: logSince(state.log, sinceSeq),
    turnDeadline: state.turnDeadline,
    backfillAt:
      room === null && state.phase === 'waiting' && state.waitingSince !== null ? state.waitingSince + BACKFILL_MS : null,
    // While between rounds, `nextActionAt` is when `tick` starts the next round.
    nextRoundAt: state.phase === 'between' ? state.nextActionAt : null,
    serverTime: now,
  };
  // Public snapshots carry no `room` key at all.
  return room === null ? snapshot : { ...snapshot, room: roomInfo(state, room, userId) };
}

/** Members carry their `userId` (for "Add friend") but never a session id; `scores` let standing members follow the game without a view. */
function roomInfo(state: TableState, room: PrivateRoom, userId: string | null): RoomInfo {
  const members: RoomMember[] = room.members.map((member) => {
    const seated = findHumanSeat(state, member.userId);
    return {
      name: member.name,
      seat: seated ? seated.index : null,
      isHost: member.userId === room.hostUserId,
      userId: member.userId,
    };
  });
  const you = userId === null ? null : findMember(room, userId);
  const game = state.game;
  return {
    code: room.code,
    members,
    you: you ? you.index : -1,
    scores: game ? [game.scores[0], game.scores[1]] : null,
    // A finished private table schedules its return to the room in `nextActionAt`.
    resetAt: state.phase === 'finished' ? state.nextActionAt : null,
  };
}

/**
 * A human seat carries its holder's `userId` (also while disconnected or away,
 * since the seat stays reserved for them) so a client can offer "add friend"
 * from the table. Bots and empty seats have no `userId` key at all. Only
 * seated humans appear here; standing members are listed in `room.members`,
 * which never carries ids.
 */
function playerInfo(slot: SeatSlot): PlayerInfo | null {
  if (slot === null) return null;
  if (slot.kind === 'bot') return { name: slot.name, isBot: true, away: false, connected: true };
  return { name: slot.name, isBot: false, away: slot.away, connected: isConnected(slot), userId: slot.userId };
}

/** Entries after `sinceSeq` (0 = the whole log). */
function logSince(log: readonly LogEntry[], sinceSeq: number): LogEntry[] {
  return log.filter((entry) => entry.seq > sinceSeq);
}
