import { ROOM_MAX_MEMBERS, type ErrorCode } from '@chkobba/protocol';
import { findHumanSeat, humanSeat, refreshTurn, roomOf, startGame, withSeat } from './lifecycle';
import { findMember, withMembers } from './room';
import {
  ABSENT_SESSION,
  MAX_NAME_LENGTH,
  STANDING_SEAT,
  type HumanSeat,
  type Joiner,
  type Member,
  type Presence,
  type PrivateRoom,
  type TableState,
} from './types';

/** `seat` is STANDING_SEAT for a private-table member who holds no seat. */
export type JoinResult =
  | { readonly ok: true; readonly state: TableState; readonly seat: number }
  | { readonly ok: false; readonly error: Extract<ErrorCode, 'table_full' | 'room_full'> };

/**
 * Seats a player. A user who already holds a seat reclaims it with the new
 * session (reconnect, or a second device taking over) and their current
 * display name, so a rename shows up on the next snapshot. Otherwise, while
 * waiting, the lowest free seat is claimed (the first human seated starts the
 * backfill clock, `waitingSince`); the game starts as soon as all
 * four seats hold humans. Once the game has started only reservations count.
 * Private tables follow `joinRoom` instead.
 */
export function join(state: TableState, joiner: Joiner, now: number): JoinResult {
  const room = roomOf(state);
  if (room !== null) return joinRoom(state, room, joiner, now);

  const reserved = findHumanSeat(state, joiner.userId);
  if (reserved) {
    const seat: HumanSeat = { ...reserved.seat, sessionId: joiner.sessionId, name: cleanName(joiner.name) };
    return { ok: true, seat: reserved.index, state: refreshTurn(withSeat(state, reserved.index, seat), now) };
  }

  const free = state.phase === 'waiting' ? state.seats.indexOf(null) : -1;
  if (free === -1) return { ok: false, error: 'table_full' };

  const seat = humanSeat({ ...joiner, name: cleanName(joiner.name) });
  const firstHuman = !hasHuman(state);
  const seated = withSeat(firstHuman ? { ...state, waitingSince: now } : state, free, seat);
  const full = seated.seats.indexOf(null) === -1;
  return { ok: true, seat: free, state: full ? startGame(seated, now) : seated };
}

/**
 * A session left. While waiting the seat is simply freed (nothing to hand
 * back yet); freeing the last human seat stops the backfill clock. Once playing the seat stays reserved for the user and a bot
 * plays it until they rejoin. A stale session (already replaced by a newer
 * join of the same user) is ignored. Private tables follow `leaveRoom` instead.
 */
export function leave(state: TableState, presence: Presence, now: number): TableState {
  const room = roomOf(state);
  if (room !== null) return leaveRoom(state, room, presence, now);

  const found = findHumanSeat(state, presence.userId);
  if (!found || found.seat.sessionId !== presence.sessionId) return state;
  if (state.phase === 'waiting') {
    const freed = withSeat(state, found.index, null);
    return hasHuman(freed) ? freed : { ...freed, waitingSince: null };
  }
  return refreshTurn(withSeat(state, found.index, { ...found.seat, sessionId: null }), now);
}

/**
 * Private table: a known user reclaims their seat or member entry with the
 * new session and name. A newcomer joins the members (up to
 * ROOM_MAX_MEMBERS) and, while waiting, sits in the lowest free seat; during
 * a game, or with all four seats taken, they stand. The first member present
 * becomes host. Four humans never start the game: only the host's START does.
 */
function joinRoom(state: TableState, room: PrivateRoom, joiner: Joiner, now: number): JoinResult {
  const known = findMember(room, joiner.userId);
  const reserved = findHumanSeat(state, joiner.userId);
  if (!known && !reserved && room.members.length >= ROOM_MAX_MEMBERS) return { ok: false, error: 'room_full' };

  const name = cleanName(joiner.name);
  const member: Member = known
    ? { ...known.member, sessionId: joiner.sessionId, name }
    : { userId: joiner.userId, sessionId: joiner.sessionId, name, joinedAt: now };
  const members = known ? replaceAt(room.members, known.index, member) : room.members.concat([member]);
  const present = withMembers(state, room, members);

  if (reserved) {
    const seat: HumanSeat = { ...reserved.seat, sessionId: joiner.sessionId, name };
    return { ok: true, seat: reserved.index, state: refreshTurn(withSeat(present, reserved.index, seat), now) };
  }
  const free = state.phase === 'waiting' && !known ? state.seats.indexOf(null) : -1;
  if (free === -1) return { ok: true, seat: STANDING_SEAT, state: present };
  return { ok: true, seat: free, state: withSeat(present, free, humanSeat(member)) };
}

/**
 * Private table: while waiting the member is removed and their seat freed.
 * During a game a seated member keeps the reserved seat (a bot plays it) and
 * stays a member, marked absent; a standing member is removed. The host
 * changes only when the host is removed (see `room.ts`).
 */
function leaveRoom(state: TableState, room: PrivateRoom, presence: Presence, now: number): TableState {
  const seated = findHumanSeat(state, presence.userId);
  if (seated) {
    if (seated.seat.sessionId !== presence.sessionId) return state;
    if (state.phase === 'waiting') {
      return withMembers(withSeat(state, seated.index, null), room, withoutMember(room, presence.userId));
    }
    const members = room.members.map((m) => (m.userId === presence.userId ? { ...m, sessionId: ABSENT_SESSION } : m));
    const reserved = withSeat(state, seated.index, { ...seated.seat, sessionId: null });
    return refreshTurn(withMembers(reserved, room, members), now);
  }
  const standing = findMember(room, presence.userId);
  if (!standing || standing.member.sessionId !== presence.sessionId) return state;
  return withMembers(state, room, withoutMember(room, presence.userId));
}

function withoutMember(room: PrivateRoom, userId: string): Member[] {
  return room.members.filter((m) => m.userId !== userId);
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

function hasHuman(state: TableState): boolean {
  return state.seats.some((slot) => slot !== null && slot.kind === 'human');
}

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : 'Player';
}
