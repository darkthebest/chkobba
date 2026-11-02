import {
  clearRoomSession,
  getRoomSession,
  publishRoomSession,
  subscribeRoomSession,
  type RoomSession,
} from '../roomSession';

const ROOM: RoomSession = { code: 'ABCDEF', matchId: 'match-1' };
const OTHER_ROOM: RoomSession = { code: 'GHJKLM', matchId: 'match-2' };

/**
 * The module keeps its session and listeners in module scope, so every test
 * removes its own listener and then clears the session: no state leaks into
 * the next test.
 */
const unsubscribes: (() => void)[] = [];

function subscribe(listener: () => void): () => void {
  const unsubscribe = subscribeRoomSession(listener);
  unsubscribes.push(unsubscribe);
  return unsubscribe;
}

afterEach(() => {
  for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
  clearRoomSession();
});

describe('roomSession', () => {
  it('should have no session before one is published', () => {
    // Act
    const session = getRoomSession();

    // Assert
    expect(session).toBeNull();
  });

  it('should return the published session', () => {
    // Arrange
    publishRoomSession(ROOM);

    // Act
    const session = getRoomSession();

    // Assert
    expect(session).toEqual(ROOM);
  });

  it('should replace the published session with a new one', () => {
    // Arrange
    publishRoomSession(ROOM);

    // Act
    publishRoomSession(OTHER_ROOM);

    // Assert
    expect(getRoomSession()).toEqual(OTHER_ROOM);
  });

  it('should notify a subscriber when the session changes', () => {
    // Arrange
    const listener = jest.fn();
    subscribe(listener);

    // Act
    publishRoomSession(ROOM);

    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should stop notifying after unsubscribe', () => {
    // Arrange
    const listener = jest.fn();
    const unsubscribe = subscribe(listener);
    unsubscribe();

    // Act
    publishRoomSession(ROOM);

    // Assert
    expect(listener).not.toHaveBeenCalled();
  });

  it('should notify nobody when the identical session is published again', () => {
    // Arrange
    publishRoomSession(ROOM);
    const listener = jest.fn();
    subscribe(listener);

    // Act
    publishRoomSession({ code: ROOM.code, matchId: ROOM.matchId });

    // Assert
    expect(listener).not.toHaveBeenCalled();
  });

  it('should notify once for a session that differs in one field', () => {
    // Arrange
    publishRoomSession(ROOM);
    const listener = jest.fn();
    subscribe(listener);

    // Act
    publishRoomSession({ code: ROOM.code, matchId: 'match-9' });

    // Assert
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should notify nobody when clearing an empty session', () => {
    // Arrange
    const listener = jest.fn();
    subscribe(listener);

    // Act
    clearRoomSession();

    // Assert
    expect(listener).not.toHaveBeenCalled();
  });

  it('should notify once and forget the session when clearing a published one', () => {
    // Arrange
    publishRoomSession(ROOM);
    const listener = jest.fn();
    subscribe(listener);

    // Act
    clearRoomSession();

    // Assert
    expect([listener.mock.calls.length, getRoomSession()]).toEqual([1, null]);
  });
});
