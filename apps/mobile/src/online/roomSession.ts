/**
 * The private room the player is in right now, shared app-wide.
 *
 * It is client memory only: a room code is a live handle to a running match,
 * so persisting it would resurrect a dead room (or a code the player no longer
 * owns) after a restart. The room screens publish it on the way in; the lobby
 * and the player profile read it to tell whether "Invite to table" is
 * available and where "Back to my table" should go.
 */
export interface RoomSession {
  readonly code: string;
  readonly matchId: string;
}

let session: RoomSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Publishes the room the player is in; publishing an identical value notifies nobody. */
export function publishRoomSession(next: RoomSession): void {
  if (session !== null && session.code === next.code && session.matchId === next.matchId) return;
  session = next;
  emit();
}

/** Forgets the room; a no-op when there is none. */
export function clearRoomSession(): void {
  if (session === null) return;
  session = null;
  emit();
}

/** The current room, or null outside one (safe to call during render). */
export function getRoomSession(): RoomSession | null {
  return session;
}

/** Subscribes to publish/clear; the returned function removes the listener. */
export function subscribeRoomSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
