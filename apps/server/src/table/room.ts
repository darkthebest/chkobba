import { isConnected } from './lifecycle';
import { ABSENT_SESSION, type Member, type PrivateRoom, type SeatSlot, type TableState } from './types';

/**
 * Private-room membership. Model:
 * - `members` lists every human in the room in join order, seated or standing.
 * - While waiting every member is present: leaving removes the member (and
 *   frees their seat).
 * - During a game (playing, between, finished) a seated member who leaves
 *   keeps the reserved seat and their place in `members`, with
 *   `sessionId: ABSENT_SESSION`; reconnecting fills it in again. A standing
 *   member who leaves is removed.
 * - The return to the room drops absent members and frees their seats.
 * - The host stays the host while they are in `members` (present or not), so
 *   it never changes because a seated host dropped mid-game. When the host is
 *   removed, the role passes to the earliest present member (null if none).
 */

/** False for a seated member who disconnected during a game. */
export function isPresent(member: Member): boolean {
  return member.sessionId !== ABSENT_SESSION;
}

export function findMember(room: PrivateRoom, userId: string): { index: number; member: Member } | null {
  for (let index = 0; index < room.members.length; index++) {
    const member = room.members[index];
    if (member && member.userId === userId) return { index, member };
  }
  return null;
}

/** Sets the member list and settles the host (see the model above). */
export function withMembers(state: TableState, room: PrivateRoom, members: readonly Member[]): TableState {
  const hostStays = room.hostUserId !== null && members.some((m) => m.userId === room.hostUserId);
  const hostUserId = hostStays ? room.hostUserId : earliestPresent(members);
  return { ...state, room: { ...room, members, hostUserId } };
}

/**
 * Back to the waiting room after a finished game: the game, log and timers
 * are cleared (`seq` keeps counting so clients' `seq > lastSeq` filter still
 * works), connected humans keep their seats with a clean miss streak, bot
 * seats and the seats of disconnected humans are emptied, and absent members
 * are dropped. Nobody connected leaves an empty room with no host.
 */
export function resetToRoom(state: TableState, room: PrivateRoom): TableState {
  const seats = state.seats.map(keptSeat);
  const waiting: TableState = {
    ...state,
    phase: 'waiting',
    seats,
    game: null,
    log: [],
    waitingSince: null,
    turnDeadline: null,
    nextActionAt: null,
    finishedAt: null,
  };
  return withMembers(waiting, room, room.members.filter(isPresent));
}

function keptSeat(slot: SeatSlot): SeatSlot {
  if (slot === null || slot.kind === 'bot' || !isConnected(slot)) return null;
  return { ...slot, missed: 0, away: false };
}

/** Members are in join order, so the first present one arrived earliest. */
function earliestPresent(members: readonly Member[]): string | null {
  for (const member of members) {
    if (isPresent(member)) return member.userId;
  }
  return null;
}
