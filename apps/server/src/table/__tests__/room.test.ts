/**
 * Private tables (rooms) in the pure table core: join, leave, SIT, START and
 * the host model. See docs/adr/0002-private-tables-room-codes-and-host-model.md.
 */
import { describe, it, expect } from 'vitest';
import { OpCode, ROOM_MAX_MEMBERS } from '@chkobba/protocol';
import {
  ABSENT_SESSION,
  BACKFILL_MS,
  STANDING_SEAT,
  intent,
  join,
  leave,
  nextWakeAt,
  tick,
  type IntentResult,
  type TableState,
} from '..';
import { T0, joiner, mustJoin, presence, privateTable, tableWithHumans } from './helpers';

/** The host (u1 unless given) sends START; throws when rejected. */
function mustStart(state: TableState, host: number = 1, now: number = T0): TableState {
  const result = intent(state, presence(host), OpCode.START, undefined, now);
  if (!result.ok) throw new Error(`START rejected: ${result.error}`);
  return result.state;
}

/** Leaves with the default session `s<n>`. */
function leaveAs(state: TableState, n: number, now: number = T0): TableState {
  return leave(state, presence(n), now);
}

function sit(state: TableState, n: number, payload: unknown, now: number = T0): IntentResult {
  return intent(state, presence(n), OpCode.SIT, payload, now);
}

/** userIds in each seat (null when empty, 'bot' for a bot). */
function seatOwners(state: TableState): (string | null)[] {
  return state.seats.map((slot) => (slot === null ? null : slot.kind === 'bot' ? 'bot' : slot.userId));
}

function memberIds(state: TableState): string[] {
  return (state.room?.members ?? []).map((m) => m.userId);
}

function hostOf(state: TableState): string | null | undefined {
  return state.room?.hostUserId;
}

/**
 * Waiting room where u5 is the host and stands, with u1..u4 seated in seats
 * 0-3 behind u5 in join order (members: u5, u1, u2, u3, u4). Built by having
 * u1..u4 leave (u5 inherits the host role) and rejoin.
 */
function standingHostRoom(): TableState {
  let state = privateTable(5);
  for (let n = 1; n <= 4; n++) state = leaveAs(state, n);
  for (let n = 1; n <= 4; n++) state = mustJoin(state, joiner(n), T0 + n);
  return state;
}

/** Same as `standingHostRoom` but with nobody seated (members: u5 only). */
function nobodySeatedRoom(): TableState {
  let state = privateTable(5);
  for (let n = 1; n <= 4; n++) state = leaveAs(state, n);
  return state;
}

/** A table state saved before private tables existed: no `room` key at all. */
function withoutRoomKey(state: TableState): TableState {
  const { room, ...legacy } = state;
  void room;
  return legacy as TableState;
}

describe('private table join', () => {
  it.each([
    { n: 1, seat: 0 },
    { n: 2, seat: 1 },
    { n: 3, seat: 2 },
    { n: 4, seat: 3 },
  ])('should seat member u$n in seat $seat when joining an empty-ish waiting room in turn', ({ n, seat }) => {
    // Arrange
    const state = privateTable(n - 1);

    // Act
    const result = join(state, joiner(n), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat });
  });

  it('should seat a newcomer in the lowest free seat when an earlier seat was freed', () => {
    // Arrange
    const state = leaveAs(privateTable(3), 1);

    // Act
    const result = join(state, joiner(9), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: 0 });
  });

  it('should leave a newcomer standing when all four seats are taken', () => {
    // Arrange
    const state = privateTable(4);

    // Act
    const result = join(state, joiner(5), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: STANDING_SEAT });
  });

  it('should add a standing newcomer to the members without giving them a seat', () => {
    // Arrange
    const state = privateTable(4);

    // Act
    const joined = mustJoin(state, joiner(5), T0);

    // Assert
    expect({ members: memberIds(joined), seats: seatOwners(joined) }).toEqual({
      members: ['u1', 'u2', 'u3', 'u4', 'u5'],
      seats: ['u1', 'u2', 'u3', 'u4'],
    });
  });

  it('should leave a newcomer standing when they join during a game even if a seat is held by a bot', () => {
    // Arrange
    const started = mustStart(privateTable(2));

    // Act
    const result = join(started, joiner(9), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: STANDING_SEAT });
  });

  it('should accept members up to ROOM_MAX_MEMBERS', () => {
    // Arrange
    const state = privateTable(ROOM_MAX_MEMBERS - 1);

    // Act
    const result = join(state, joiner(ROOM_MAX_MEMBERS), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: STANDING_SEAT });
  });

  it('should reject a newcomer with room_full when ROOM_MAX_MEMBERS are already present', () => {
    // Arrange
    const state = privateTable(ROOM_MAX_MEMBERS);

    // Act
    const result = join(state, joiner(ROOM_MAX_MEMBERS + 1), T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'room_full' });
  });

  it('should let a known member reconnect when the room is full', () => {
    // Arrange
    const state = privateTable(ROOM_MAX_MEMBERS);

    // Act
    const result = join(state, joiner(ROOM_MAX_MEMBERS, 's-new'), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: STANDING_SEAT });
  });

  it('should never start the game when four humans have joined', () => {
    // Arrange
    const state = privateTable(3);

    // Act
    const joined = mustJoin(state, joiner(4), T0);

    // Assert
    expect({ phase: joined.phase, game: joined.game }).toEqual({ phase: 'waiting', game: null });
  });
});

describe('private table reclaim by userId', () => {
  const rejoin = { userId: 'u2', sessionId: 's2-new', name: 'Renamed' };

  it('should give a seated member back the same seat when they join again', () => {
    // Arrange
    const state = privateTable(3);

    // Act
    const result = join(state, rejoin, T0 + 1000);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: 1 });
  });

  it('should refresh the seat session and name when a seated member reclaims their seat', () => {
    // Arrange
    const state = privateTable(3);

    // Act
    const joined = mustJoin(state, rejoin, T0 + 1000);

    // Assert
    expect(joined.seats[1]).toMatchObject({ kind: 'human', userId: 'u2', sessionId: 's2-new', name: 'Renamed' });
  });

  it('should refresh the member session and name but keep the join time when a member reclaims', () => {
    // Arrange
    const state = privateTable(3);

    // Act
    const joined = mustJoin(state, rejoin, T0 + 1000);

    // Assert
    expect(joined.room?.members[1]).toEqual({ userId: 'u2', sessionId: 's2-new', name: 'Renamed', joinedAt: T0 });
  });

  it('should not duplicate the member entry when a member reclaims', () => {
    // Arrange
    const state = privateTable(3);

    // Act
    const joined = mustJoin(state, rejoin, T0 + 1000);

    // Assert
    expect(memberIds(joined)).toEqual(['u1', 'u2', 'u3']);
  });

  it('should keep a standing member standing when they reconnect while a seat is free', () => {
    // Arrange
    const state = leaveAs(privateTable(5), 1);

    // Act
    const result = join(state, joiner(5, 's5-new'), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: STANDING_SEAT });
  });

  it('should leave the free seat empty when a standing member reconnects while waiting', () => {
    // Arrange
    const state = leaveAs(privateTable(5), 1);

    // Act
    const joined = mustJoin(state, joiner(5, 's5-new'), T0);

    // Assert
    expect(seatOwners(joined)).toEqual([null, 'u2', 'u3', 'u4']);
  });

  it('should mark a seated member present again when they reconnect during a game', () => {
    // Arrange
    const dropped = leaveAs(mustStart(privateTable(4)), 2);

    // Act
    const joined = mustJoin(dropped, joiner(2, 's2-new'), T0 + 1000);

    // Assert
    expect({ member: joined.room?.members[1]?.sessionId, seat: joined.seats[1] }).toMatchObject({
      member: 's2-new',
      seat: { kind: 'human', userId: 'u2', sessionId: 's2-new' },
    });
  });
});

describe('private table leave', () => {
  it('should free the seat and remove the member when a member leaves while waiting', () => {
    // Arrange
    const state = privateTable(3);

    // Act
    const left = leaveAs(state, 2);

    // Assert
    expect({ members: memberIds(left), seats: seatOwners(left) }).toEqual({
      members: ['u1', 'u3'],
      seats: ['u1', null, 'u3', null],
    });
  });

  it('should ignore a leave from a stale session of a seated member', () => {
    // Arrange
    const state = mustJoin(privateTable(2), joiner(2, 's2-new'), T0);

    // Act
    const left = leave(state, presence(2, 's2'), T0);

    // Assert
    expect(left).toBe(state);
  });

  it('should ignore a leave from a stale session of a standing member', () => {
    // Arrange
    const state = mustJoin(privateTable(5), joiner(5, 's5-new'), T0);

    // Act
    const left = leave(state, presence(5, 's5'), T0);

    // Assert
    expect(left).toBe(state);
  });

  it('should keep a seated member as absent when they drop during a game', () => {
    // Arrange
    const started = mustStart(privateTable(4));

    // Act
    const left = leaveAs(started, 2);

    // Assert
    expect(left.room?.members[1]).toMatchObject({ userId: 'u2', sessionId: ABSENT_SESSION });
  });

  it('should keep the seat reserved but disconnected when a seated member drops during a game', () => {
    // Arrange
    const started = mustStart(privateTable(4));

    // Act
    const left = leaveAs(started, 2);

    // Assert
    expect(left.seats[1]).toMatchObject({ kind: 'human', userId: 'u2', sessionId: null });
  });

  it('should remove a standing member when they leave during a game', () => {
    // Arrange
    const started = mustStart(privateTable(5));

    // Act
    const left = leaveAs(started, 5);

    // Assert
    expect(memberIds(left)).toEqual(['u1', 'u2', 'u3', 'u4']);
  });
});

describe('private table host', () => {
  it('should make the first member the host', () => {
    // Arrange
    const state = privateTable(0);

    // Act
    const joined = mustJoin(state, joiner(1), T0);

    // Assert
    expect(hostOf(joined)).toBe('u1');
  });

  it('should keep the first member as host when others join after them', () => {
    // Arrange
    const state = privateTable(1);

    // Act
    const joined = mustJoin(mustJoin(state, joiner(2), T0), joiner(3), T0);

    // Assert
    expect(hostOf(joined)).toBe('u1');
  });

  it('should pass the host to the next member in join order when the host leaves while waiting', () => {
    // Arrange
    const state = privateTable(3);

    // Act
    const left = leaveAs(state, 1);

    // Assert
    expect(hostOf(left)).toBe('u2');
  });

  it('should keep the host when a non-host member leaves while waiting', () => {
    // Arrange
    const state = privateTable(3);

    // Act
    const left = leaveAs(state, 2);

    // Assert
    expect(hostOf(left)).toBe('u1');
  });

  it('should leave the room with no host when the last member leaves', () => {
    // Arrange
    const state = privateTable(1);

    // Act
    const left = leaveAs(state, 1);

    // Assert
    expect(hostOf(left)).toBeNull();
  });

  it('should make a newcomer host when they join an empty room', () => {
    // Arrange
    const state = leaveAs(privateTable(1), 1);

    // Act
    const joined = mustJoin(state, joiner(7), T0);

    // Assert
    expect(hostOf(joined)).toBe('u7');
  });

  it('should keep the host when the seated host disconnects during a game', () => {
    // Arrange
    const started = mustStart(privateTable(4));

    // Act
    const left = leaveAs(started, 1);

    // Assert
    expect(hostOf(left)).toBe('u1');
  });

  it('should pass the host to the earliest present member when a standing host leaves mid-game', () => {
    // Arrange: members u5 (host, standing), u1..u4 seated; u1 drops so u2 is the earliest present
    const started = mustStart(standingHostRoom(), 5);
    const u1Dropped = leaveAs(started, 1);

    // Act
    const left = leaveAs(u1Dropped, 5);

    // Assert
    expect(hostOf(left)).toBe('u2');
  });
});

describe('private table SIT', () => {
  it('should move a seated member to an empty seat when they SIT while waiting', () => {
    // Arrange
    const state = privateTable(2);

    // Act
    const result = sit(state, 1, { seat: 3 });

    // Assert
    expect(result.ok && seatOwners(result.state)).toEqual([null, 'u2', null, 'u1']);
  });

  it('should keep the seat session and name when a member switches seats', () => {
    // Arrange
    const state = privateTable(2);

    // Act
    const result = sit(state, 1, { seat: 2 });

    // Assert
    expect(result.ok && result.state.seats[2]).toMatchObject({ kind: 'human', userId: 'u1', sessionId: 's1', name: 'Player 1' });
  });

  it('should seat a standing member in an empty seat when they SIT while waiting', () => {
    // Arrange
    const state = leaveAs(privateTable(5), 3);

    // Act
    const result = sit(state, 5, { seat: 2 });

    // Assert
    expect(result.ok && seatOwners(result.state)).toEqual(['u1', 'u2', 'u5', 'u4']);
  });

  it('should reject SIT with seat_taken when the target seat holds another member', () => {
    // Arrange
    const state = privateTable(2);

    // Act
    const result = sit(state, 1, { seat: 1 });

    // Assert
    expect(result).toEqual({ ok: false, error: 'seat_taken' });
  });

  it('should reject SIT with seat_taken when a member targets their own seat', () => {
    // Arrange
    const state = privateTable(2);

    // Act
    const result = sit(state, 1, { seat: 0 });

    // Assert
    expect(result).toEqual({ ok: false, error: 'seat_taken' });
  });

  it.each([
    { label: 'a fractional seat', payload: { seat: 1.5 } },
    { label: 'a negative seat', payload: { seat: -1 } },
    { label: 'seat 4', payload: { seat: 4 } },
    { label: 'a string seat', payload: { seat: '1' } },
    { label: 'NaN', payload: { seat: Number.NaN } },
    { label: 'no seat field', payload: {} },
    { label: 'null', payload: null },
    { label: 'an array', payload: [1] },
  ])('should reject SIT with bad_payload when the payload has $label', ({ payload }) => {
    // Arrange
    const state = privateTable(1);

    // Act
    const result = sit(state, 1, payload);

    // Assert
    expect(result).toEqual({ ok: false, error: 'bad_payload' });
  });

  it('should check the phase before the payload when a SIT arrives on a finished table', () => {
    // Arrange
    const finished: TableState = { ...mustStart(privateTable(2)), phase: 'finished' };

    // Act
    const result = sit(finished, 1, { seat: 'nope' });

    // Assert
    expect(result).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('should let a standing member take over a bot seat during a game', () => {
    // Arrange: u4 leaves before START, so seat 3 is a bot
    const started = mustStart(leaveAs(privateTable(5), 4));

    // Act
    const result = sit(started, 5, { seat: 3 });

    // Assert
    expect(result.ok && result.state.seats[3]).toMatchObject({ kind: 'human', userId: 'u5', sessionId: 's5' });
  });

  it('should reject SIT with already_seated when a seated member asks for a bot seat during a game', () => {
    // Arrange
    const started = mustStart(privateTable(2));

    // Act
    const result = sit(started, 1, { seat: 3 });

    // Assert
    expect(result).toEqual({ ok: false, error: 'already_seated' });
  });

  it('should reject SIT with seat_taken when a standing member targets a human seat during a game', () => {
    // Arrange
    const started = mustStart(privateTable(5));

    // Act
    const result = sit(started, 5, { seat: 0 });

    // Assert
    expect(result).toEqual({ ok: false, error: 'seat_taken' });
  });

  it('should reject SIT with seat_taken when a standing member targets a disconnected human seat during a game', () => {
    // Arrange
    const dropped = leaveAs(mustStart(privateTable(5)), 2);

    // Act
    const result = sit(dropped, 5, { seat: 1 });

    // Assert
    expect(result).toEqual({ ok: false, error: 'seat_taken' });
  });
});

describe('private table START', () => {
  it('should reject START with not_host when a non-host member sends it', () => {
    // Arrange
    const state = privateTable(2);

    // Act
    const result = intent(state, presence(2), OpCode.START, undefined, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'not_host' });
  });

  it('should reject START with wrong_phase when nobody is seated', () => {
    // Arrange
    const state = nobodySeatedRoom();

    // Act
    const result = intent(state, presence(5), OpCode.START, undefined, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it.each(['playing', 'between', 'finished'] as const)(
    'should reject START with wrong_phase when the table is %s',
    (phase) => {
      // Arrange
      const state: TableState = { ...mustStart(privateTable(2)), phase };

      // Act
      const result = intent(state, presence(1), OpCode.START, undefined, T0);

      // Assert
      expect(result).toEqual({ ok: false, error: 'wrong_phase' });
    },
  );

  it('should start the game when the host sends START', () => {
    // Arrange
    const state = privateTable(2);

    // Act
    const started = mustStart(state);

    // Assert
    expect({ phase: started.phase, gamePhase: started.game?.phase }).toEqual({ phase: 'playing', gamePhase: 'cutting' });
  });

  it('should fill empty seats with bots and keep the seated humans when the host starts', () => {
    // Arrange
    const state = sit(privateTable(2), 2, { seat: 2 });
    if (!state.ok) throw new Error('arrange: SIT rejected');

    // Act
    const started = mustStart(state.state);

    // Assert
    expect(seatOwners(started)).toEqual(['u1', 'bot', 'u2', 'bot']);
  });

  it('should let a standing host start the game for the seated members', () => {
    // Arrange
    const state = standingHostRoom();

    // Act
    const started = mustStart(state, 5);

    // Assert
    expect(seatOwners(started)).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('should increment gameNo from 0 to 1 when the first game starts', () => {
    // Arrange
    const state = privateTable(1);

    // Act
    const started = mustStart(state);

    // Assert
    expect(started.room?.gameNo).toBe(1);
  });

  it('should increment gameNo again when a later game starts', () => {
    // Arrange
    const base = privateTable(1);
    const afterOneGame: TableState = { ...base, room: { ...base.room!, gameNo: 1 } };

    // Act
    const started = mustStart(afterOneGame);

    // Assert
    expect(started.room?.gameNo).toBe(2);
  });

  it('should deal a different game when the same table starts its next game', () => {
    // Arrange
    const base = privateTable(1);
    const afterOneGame: TableState = { ...base, room: { ...base.room!, gameNo: 1 } };
    const first = mustStart(base);

    // Act
    const second = mustStart(afterOneGame);

    // Assert
    expect(second.game?.stock).not.toEqual(first.game?.stock);
  });
});

describe('private table tick', () => {
  it('should stay waiting when ticked far past BACKFILL_MS', () => {
    // Arrange
    const state = privateTable(1);

    // Act
    const ticked = tick(state, T0 + BACKFILL_MS * 10);

    // Assert
    expect(ticked.phase).toBe('waiting');
  });

  it('should leave every empty seat empty when ticked far past BACKFILL_MS', () => {
    // Arrange
    const state = privateTable(1);

    // Act
    const ticked = tick(state, T0 + BACKFILL_MS * 10);

    // Assert
    expect(seatOwners(ticked)).toEqual(['u1', null, null, null]);
  });

  it('should schedule no wake-up while a private table waits for START', () => {
    // Arrange
    const state = tick(privateTable(1), T0 + BACKFILL_MS * 10);

    // Act
    const wake = nextWakeAt(state);

    // Assert
    expect(wake).toBeNull();
  });
});

describe('room intents and seat checks', () => {
  it.each([
    { label: 'SIT', opcode: OpCode.SIT, payload: { seat: 1 } },
    { label: 'START', opcode: OpCode.START, payload: undefined },
  ])('should reject $label with not_private when a seated player sends it on a public table', ({ opcode, payload }) => {
    // Arrange
    const state = tableWithHumans(1);

    // Act
    const result = intent(state, presence(1), opcode, payload, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'not_private' });
  });

  it.each([
    { label: 'PLAY', opcode: OpCode.PLAY, payload: { cardId: '1D', capture: [] } },
    { label: 'CUT', opcode: OpCode.CUT, payload: { keep: true } },
    { label: 'BACK', opcode: OpCode.BACK, payload: undefined },
  ])('should reject $label with not_seated when a standing member sends it', ({ opcode, payload }) => {
    // Arrange
    const started = mustStart(privateTable(5));

    // Act
    const result = intent(started, presence(5), opcode, payload, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'not_seated' });
  });

  it.each([
    { label: 'SIT', opcode: OpCode.SIT, payload: { seat: 3 } },
    { label: 'START', opcode: OpCode.START, payload: undefined },
  ])('should reject $label with not_seated when the sender is not a member', ({ opcode, payload }) => {
    // Arrange
    const state = privateTable(2);

    // Act
    const result = intent(state, presence(9), opcode, payload, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'not_seated' });
  });

  it('should reject SIT with not_seated when a member sends it from a stale session', () => {
    // Arrange
    const state = mustJoin(privateTable(2), joiner(2, 's2-new'), T0);

    // Act
    const result = intent(state, presence(2, 's2'), OpCode.SIT, { seat: 3 }, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'not_seated' });
  });
});

describe('legacy state without a room key', () => {
  it('should seat a newcomer like a public table', () => {
    // Arrange
    const legacy = withoutRoomKey(tableWithHumans(1));

    // Act
    const result = join(legacy, joiner(2), T0);

    // Assert
    expect(result).toMatchObject({ ok: true, seat: 1 });
  });

  it('should start the game when the fourth human joins', () => {
    // Arrange
    const legacy = withoutRoomKey(tableWithHumans(3));

    // Act
    const joined = mustJoin(legacy, joiner(4), T0);

    // Assert
    expect(joined.phase).toBe('playing');
  });

  it('should backfill with bots when BACKFILL_MS has passed', () => {
    // Arrange
    const legacy = withoutRoomKey(tableWithHumans(1));

    // Act
    const ticked = tick(legacy, T0 + BACKFILL_MS);

    // Assert
    expect(seatOwners(ticked)).toEqual(['u1', 'bot', 'bot', 'bot']);
  });

  it('should schedule the backfill wake-up like a public table', () => {
    // Arrange
    const legacy = withoutRoomKey(tableWithHumans(1));

    // Act
    const wake = nextWakeAt(legacy);

    // Assert
    expect(wake).toBe(T0 + BACKFILL_MS);
  });

  it('should reject SIT with not_private', () => {
    // Arrange
    const legacy = withoutRoomKey(tableWithHumans(1));

    // Act
    const result = intent(legacy, presence(1), OpCode.SIT, { seat: 1 }, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'not_private' });
  });

  it('should free the seat when the human leaves while waiting', () => {
    // Arrange
    const legacy = withoutRoomKey(tableWithHumans(2));

    // Act
    const left = leaveAs(legacy, 2);

    // Assert
    expect(seatOwners(left)).toEqual(['u1', null, null, null]);
  });
});
