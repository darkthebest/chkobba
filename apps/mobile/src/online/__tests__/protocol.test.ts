/**
 * Contract test: the client decoders accept what the real server sends.
 *
 * The JSON fixtures in ./fixtures were generated from the server table core,
 * not written by hand: a throwaway Vitest file imported
 * `apps/server/src/table` (createTable / join / tick / leave, driven with the
 * helpers in `apps/server/src/table/__tests__/helpers.ts`) and wrote
 * `JSON.stringify(snapshotFor(state, seat, sinceSeq, now))` for each state. It
 * was run with the server's Vitest
 * (`pnpm --filter @chkobba/server exec vitest run --config <generator config>`).
 * Regenerate them the same way after any change to the server's Snapshot shape.
 *
 * - waiting.json:  one human seated, backfill timer running, view null
 * - cutting.json:  four humans, the cutter's snapshot (view.cut.card visible)
 * - snapshot.json: playing, cut resolved, one human disconnected, a human to move
 * - between.json:  solo human (away) with bots, round summary, nextRoundAt set
 * - delta.json:    next round in progress, log delta after between.json
 * - finished.json: the same game driven to game over, whole log
 */
import {
  PRIVATE_PLAYING_SEATED_SNAPSHOT,
  PRIVATE_PLAYING_STANDING_SNAPSHOT,
  PRIVATE_WAITING_SEATED_SNAPSHOT,
  PRIVATE_WAITING_STANDING_SNAPSHOT,
  PUBLIC_PLAYING_SNAPSHOT,
  PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS,
} from '@chkobba/protocol/testing';

import { ERROR_CODES, MAX_MESSAGE_CHARS, STANDING_SEAT, decodeError, decodeSnapshot, type Snapshot } from '../protocol';

import between from './fixtures/between.json';
import cutting from './fixtures/cutting.json';
import delta from './fixtures/delta.json';
import finished from './fixtures/finished.json';
import snapshot from './fixtures/snapshot.json';
import waiting from './fixtures/waiting.json';

type Json = { [key: string]: unknown };

const FIXTURES: readonly [string, unknown][] = [
  ['waiting', waiting],
  ['cutting', cutting],
  ['snapshot', snapshot],
  ['between', between],
  ['delta', delta],
  ['finished', finished],
];

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/** A deep copy of snapshot.json as an open record, ready to be broken. */
function playingCopy(): Json {
  return JSON.parse(JSON.stringify(snapshot)) as Json;
}

function mutated(edit: (value: Json) => void): string {
  const value = playingCopy();
  edit(value);
  return JSON.stringify(value);
}

function asRecord(value: unknown): Json {
  if (typeof value !== 'object' || value === null) throw new Error('expected an object');
  return value as Json;
}

function asArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('expected an array');
  return value;
}

describe('decodeSnapshot', () => {
  describe('server fixtures', () => {
    it.each(FIXTURES)('should preserve every field of the %s fixture when decoding a string', (_name, fixture) => {
      // Arrange
      const text = JSON.stringify(fixture);

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded).toEqual(fixture);
    });

    it.each(FIXTURES)('should preserve every field of the %s fixture when decoding UTF-8 bytes', (_name, fixture) => {
      // Arrange
      const data = bytes(JSON.stringify(fixture));

      // Act
      const decoded = decodeSnapshot(data);

      // Assert
      expect(decoded).toEqual(fixture);
    });

    it('should expose the cut card to the cutter when decoding the cutting fixture', () => {
      // Arrange
      const text = JSON.stringify(cutting);

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded?.view?.cut?.card).not.toBeNull();
    });

    it('should keep nextRoundAt when decoding the between fixture', () => {
      // Arrange
      const text = JSON.stringify(between);

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded?.nextRoundAt).toBe(between.nextRoundAt);
    });

    it('should keep a disconnected human when decoding the playing fixture', () => {
      // Arrange
      const text = JSON.stringify(snapshot);

      // Act
      const decoded: Snapshot | null = decodeSnapshot(text);

      // Assert
      expect(decoded?.players.some((player) => player?.connected === false)).toBe(true);
    });
  });

  describe('malformed input', () => {
    const oversized = JSON.stringify({ ...snapshot, padding: 'x'.repeat(MAX_MESSAGE_CHARS) });

    it.each<[string, () => Uint8Array | string]>([
      ['serverTime is missing', () => mutated((v) => delete v.serverTime)],
      ['serverTime is zero', () => mutated((v) => (v.serverTime = 0))],
      ['serverTime is a string', () => mutated((v) => (v.serverTime = '1700000003000'))],
      ['the phase is unknown', () => mutated((v) => (v.phase = 'lobby'))],
      ['the phase is the engine phase', () => mutated((v) => (v.phase = 'cutting'))],
      ['the seat is out of range', () => mutated((v) => (v.seat = 4))],
      ['the seat is a string', () => mutated((v) => (v.seat = '1'))],
      ['the view belongs to another seat', () => mutated((v) => (asRecord(v.view).seat = (Number(v.seat) + 1) % 4))],
      ['a hand card has a forged id', () => mutated((v) => (asRecord(asArray(asRecord(v.view).hand)[0]).id = '10Z'))],
      ['legalMoves is missing', () => mutated((v) => delete asRecord(v.view).legalMoves)],
      ['players has three seats', () => mutated((v) => asArray(v.players).pop())],
      ['a player name is a number', () => mutated((v) => (asRecord(asArray(v.players)[0]).name = 7))],
      ['a player is away as a string', () => mutated((v) => (asRecord(asArray(v.players)[0]).away = 'no'))],
      ['the log repeats a seq', () => mutated((v) => (asRecord(asArray(v.log)[1]).seq = asRecord(asArray(v.log)[0]).seq))],
      ['the log seq decreases', () => mutated((v) => asArray(v.log).reverse())],
      ['a log seq is zero', () => mutated((v) => (asRecord(asArray(v.log)[0]).seq = 0))],
      ['a log event type is unknown', () => mutated((v) => (asRecord(asRecord(asArray(v.log)[0]).event).type = 'cheat'))],
      ['the log is an object', () => mutated((v) => (v.log = {}))],
      ['turnDeadline is a string', () => mutated((v) => (v.turnDeadline = 'soon'))],
      ['backfillAt is negative', () => mutated((v) => (v.backfillAt = -1))],
      ['nextRoundAt is NaN text', () => mutated((v) => (v.nextRoundAt = 'NaN'))],
      ['the text is longer than the limit', () => oversized],
      ['the bytes are longer than the limit', () => bytes(oversized)],
      ['the text is empty', () => ''],
      ['the bytes are empty', () => new Uint8Array(0)],
      ['the text is not JSON', () => '{"seat":0,'],
      ['the bytes are garbage', () => new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0x7b])],
      ['the JSON is null', () => 'null'],
      ['the JSON is an array', () => JSON.stringify([snapshot])],
      ['the JSON is a number', () => '42'],
    ])('should return null when %s', (_case, build) => {
      // Arrange
      const data = build();

      // Act
      const decoded = decodeSnapshot(data);

      // Assert
      expect(decoded).toBeNull();
    });
  });
});

/** A deep copy of a shared room fixture as an open record, edited by `edit`. */
function roomMutated(source: Snapshot, edit: (value: Json) => void): string {
  const value = JSON.parse(JSON.stringify(source)) as Json;
  edit(value);
  return JSON.stringify(value);
}

function roomOf(value: Json): Json {
  return asRecord(value.room);
}

function membersOf(value: Json): unknown[] {
  return asArray(roomOf(value).members);
}

const ROOM_FIXTURES: readonly [string, Snapshot][] = [
  ['private waiting seated', PRIVATE_WAITING_SEATED_SNAPSHOT],
  ['private waiting standing', PRIVATE_WAITING_STANDING_SNAPSHOT],
  ['private playing seated', PRIVATE_PLAYING_SEATED_SNAPSHOT],
  ['private playing standing', PRIVATE_PLAYING_STANDING_SNAPSHOT],
  ['public playing', PUBLIC_PLAYING_SNAPSHOT],
];

describe('decodeSnapshot with private tables', () => {
  describe('shared room fixtures', () => {
    it.each(ROOM_FIXTURES)('should preserve every field of the %s fixture when decoding a string', (_name, fixture) => {
      // Arrange
      const text = JSON.stringify(fixture);

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded).toEqual(fixture);
    });

    it.each(ROOM_FIXTURES)('should preserve every field of the %s fixture when decoding UTF-8 bytes', (_name, fixture) => {
      // Arrange
      const data = bytes(JSON.stringify(fixture));

      // Act
      const decoded = decodeSnapshot(data);

      // Assert
      expect(decoded).toEqual(fixture);
    });

    it('should not add a room key when decoding a public snapshot', () => {
      // Arrange
      const text = JSON.stringify(PUBLIC_PLAYING_SNAPSHOT);

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded !== null && 'room' in decoded).toBe(false);
    });

    it('should accept seat -1 with a null view when the snapshot carries a room', () => {
      // Arrange
      const text = JSON.stringify(PRIVATE_PLAYING_STANDING_SNAPSHOT);

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded?.seat).toBe(STANDING_SEAT);
    });

    it('should drop unknown room and member fields when decoding', () => {
      // Arrange
      const text = roomMutated(PRIVATE_WAITING_SEATED_SNAPSHOT, (v) => {
        roomOf(v).secret = 'host-user-id';
        asRecord(membersOf(v)[0]).sessionId = 's1';
      });

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded?.room).toEqual(PRIVATE_WAITING_SEATED_SNAPSHOT.room);
    });

    it('should keep a member userId when it is a non-empty string of at most 128 characters', () => {
      // Arrange
      const longest = 'u'.repeat(128);
      const text = roomMutated(PRIVATE_WAITING_STANDING_SNAPSHOT, (v) => {
        asRecord(membersOf(v)[2]).userId = longest;
      });

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded?.room?.members.map((m) => m.userId)).toEqual(['user-hamza', 'user-sami', longest]);
    });

    it.each<[string, unknown]>([
      ['empty', ''],
      ['longer than 128 characters', 'u'.repeat(129)],
      ['a number', 42],
      ['null', null],
      ['an object', { id: 'user-lina' }],
    ])('should drop a member userId that is %s and keep the member', (_name, userId) => {
      // Arrange
      const text = roomMutated(PRIVATE_WAITING_STANDING_SNAPSHOT, (v) => {
        asRecord(membersOf(v)[2]).userId = userId;
      });

      // Act
      const decoded = decodeSnapshot(text);
      const member = decoded?.room?.members[2];

      // Assert
      expect({ member, hasKey: member !== undefined && 'userId' in member }).toEqual({
        member: { name: 'Lina', seat: null, isHost: false },
        hasKey: false,
      });
    });

    it('should decode members without a userId from an older server', () => {
      // Arrange
      const text = roomMutated(PRIVATE_WAITING_STANDING_SNAPSHOT, (v) => {
        for (const m of membersOf(v)) delete asRecord(m).userId;
      });

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded?.room?.members.every((m) => !('userId' in m))).toBe(true);
    });

    it('should accept a finite resetAt when the finished game is about to return to the room', () => {
      // Arrange
      const resetAt = PRIVATE_PLAYING_SEATED_SNAPSHOT.serverTime + 15_000;
      const text = roomMutated(PRIVATE_PLAYING_SEATED_SNAPSHOT, (v) => (roomOf(v).resetAt = resetAt));

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded?.room?.resetAt).toBe(resetAt);
    });

    it('should accept eight members when the room is at its limit', () => {
      // Arrange
      const text = roomMutated(PRIVATE_WAITING_STANDING_SNAPSHOT, (v) => {
        const members = membersOf(v);
        while (members.length < 8) members.push({ name: `Guest ${members.length}`, seat: null, isHost: false });
      });

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded?.room?.members).toHaveLength(8);
    });
  });

  describe('standing seat rules', () => {
    it.each<[string, () => string]>([
      ['seat is -1 without a room', () => roomMutated(PRIVATE_WAITING_STANDING_SNAPSHOT, (v) => delete v.room)],
      [
        'seat is -1 on a public snapshot',
        () => roomMutated(PUBLIC_PLAYING_SNAPSHOT, (v) => (v.seat = STANDING_SEAT)),
      ],
      [
        'seat is -1 with a non-null view',
        () =>
          roomMutated(PRIVATE_PLAYING_SEATED_SNAPSHOT, (v) => {
            v.seat = STANDING_SEAT;
          }),
      ],
      [
        'seat is -1 with a non-null view claiming seat -1',
        () =>
          roomMutated(PRIVATE_PLAYING_SEATED_SNAPSHOT, (v) => {
            v.seat = STANDING_SEAT;
            asRecord(v.view).seat = STANDING_SEAT;
          }),
      ],
      ['seat is -2 with a room', () => roomMutated(PRIVATE_WAITING_STANDING_SNAPSHOT, (v) => (v.seat = -2))],
      ['seat is 4 with a room', () => roomMutated(PRIVATE_WAITING_STANDING_SNAPSHOT, (v) => (v.seat = 4))],
    ])('should return null when %s', (_case, build) => {
      // Arrange
      const text = build();

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded).toBeNull();
    });
  });

  describe('malformed RoomInfo', () => {
    it.each<[string, (v: Json) => void]>([
      ['room is null', (v) => (v.room = null)],
      ['room is an array', (v) => (v.room = [])],
      ['room is a string', (v) => (v.room = 'K7M2QX')],
      ['the code is missing', (v) => delete roomOf(v).code],
      ['the code is lowercase', (v) => (roomOf(v).code = 'k7m2qx')],
      ['the code is five characters', (v) => (roomOf(v).code = 'K7M2Q')],
      ['the code is seven characters', (v) => (roomOf(v).code = 'K7M2QXA')],
      ['the code uses a letter outside the alphabet', (v) => (roomOf(v).code = 'K7M2QO')],
      ['the code uses a digit outside the alphabet', (v) => (roomOf(v).code = 'K7M2Q1')],
      ['the code is dashed', (v) => (roomOf(v).code = 'K7M-2QX')],
      ['the code is a number', (v) => (roomOf(v).code = 123456)],
      ['members is missing', (v) => delete roomOf(v).members],
      ['members is empty', (v) => (roomOf(v).members = [])],
      ['members is an object', (v) => (roomOf(v).members = {})],
      [
        'there are nine members',
        (v) => {
          const members = membersOf(v);
          while (members.length < 9) members.push({ name: `Guest ${members.length}`, seat: null, isHost: false });
        },
      ],
      ['a member seat is 4', (v) => (asRecord(membersOf(v)[1]).seat = 4)],
      ['a member seat is -1', (v) => (asRecord(membersOf(v)[2]).seat = -1)],
      ['a member seat is fractional', (v) => (asRecord(membersOf(v)[1]).seat = 1.5)],
      ['a member seat is a string', (v) => (asRecord(membersOf(v)[1]).seat = '2')],
      ['a member seat is missing', (v) => delete asRecord(membersOf(v)[1]).seat],
      ['a member name is a number', (v) => (asRecord(membersOf(v)[0]).name = 7)],
      ['a member name is too long', (v) => (asRecord(membersOf(v)[0]).name = 'x'.repeat(129))],
      ['a member isHost is a string', (v) => (asRecord(membersOf(v)[0]).isHost = 'yes')],
      ['a member is null', (v) => (membersOf(v)[1] = null)],
      ['you is missing', (v) => delete roomOf(v).you],
      ['you equals the member count', (v) => (roomOf(v).you = membersOf(v).length)],
      ['you is negative', (v) => (roomOf(v).you = -1)],
      ['you is fractional', (v) => (roomOf(v).you = 0.5)],
      ['you is a string', (v) => (roomOf(v).you = '0')],
      ['scores is missing', (v) => delete roomOf(v).scores],
      ['scores has one entry', (v) => (roomOf(v).scores = [3])],
      ['scores has three entries', (v) => (roomOf(v).scores = [3, 5, 0])],
      ['a score is a string', (v) => (roomOf(v).scores = [3, '5'])],
      ['a score is null', (v) => (roomOf(v).scores = [3, null])],
      ['scores is an object', (v) => (roomOf(v).scores = { 0: 3, 1: 5 })],
      ['resetAt is missing', (v) => delete roomOf(v).resetAt],
      ['resetAt is a string', (v) => (roomOf(v).resetAt = '1790000015000')],
      ['resetAt is a boolean', (v) => (roomOf(v).resetAt = true)],
      ['resetAt is an object', (v) => (roomOf(v).resetAt = {})],
    ])('should return null when %s', (_case, edit) => {
      // Arrange
      const text = roomMutated(PRIVATE_PLAYING_STANDING_SNAPSHOT, edit);

      // Act
      const decoded = decodeSnapshot(text);

      // Assert
      expect(decoded).toBeNull();
    });
  });
});

describe('decodeError', () => {
  it.each(ERROR_CODES)('should accept the server error code %s as a string', (code) => {
    // Arrange
    const text = JSON.stringify({ code });

    // Act
    const decoded = decodeError(text);

    // Assert
    expect(decoded).toEqual({ code });
  });

  it.each(ERROR_CODES)('should accept the server error code %s as bytes', (code) => {
    // Arrange
    const data = bytes(JSON.stringify({ code }));

    // Act
    const decoded = decodeError(data);

    // Assert
    expect(decoded).toEqual({ code });
  });

  it.each<[string, Uint8Array | string]>([
    ['the code is unknown', JSON.stringify({ code: 'server_on_fire' })],
    ['the code is missing', JSON.stringify({})],
    ['the code is a number', JSON.stringify({ code: 3 })],
    ['the payload is an array', JSON.stringify(['not_your_turn'])],
    ['the payload is not JSON', 'not_your_turn'],
    ['the bytes are garbage', new Uint8Array([0xff, 0x00, 0xfe])],
  ])('should return null when %s', (_case, data) => {
    // Arrange
    const input = data;

    // Act
    const decoded = decodeError(input);

    // Assert
    expect(decoded).toBeNull();
  });
});

/** PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS as JSON with seat 0's `userId` replaced (undefined: key removed). */
function withSeat0UserId(userId: unknown): string {
  const value = JSON.parse(JSON.stringify(PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS)) as Json;
  const players = value.players as Json[];
  const seat0 = players[0] as Json;
  if (userId === undefined) delete seat0.userId;
  else seat0.userId = userId;
  return JSON.stringify(value);
}

describe('decodeSnapshot player userId', () => {
  it('should preserve the human userIds when decoding the shared friends fixture', () => {
    // Arrange
    const text = JSON.stringify(PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS);

    // Act
    const decoded = decodeSnapshot(text);

    // Assert
    expect(decoded).toEqual(PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS);
  });

  it('should leave the userId key off bot seats', () => {
    // Arrange
    const text = JSON.stringify(PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS);

    // Act
    const decoded = decodeSnapshot(text);

    // Assert
    expect([1, 3].map((seat) => 'userId' in (decoded?.players[seat] ?? {}))).toEqual([false, false]);
  });

  it('should pass a 128-character userId through unchanged', () => {
    // Arrange
    const userId = 'u'.repeat(128);

    // Act
    const decoded = decodeSnapshot(withSeat0UserId(userId));

    // Assert
    expect(decoded?.players[0]?.userId).toBe(userId);
  });

  it.each<[string, unknown]>([
    ['a number', 42],
    ['null', null],
    ['an object', { id: 'u1' }],
    ['empty', ''],
    ['longer than 128 characters', 'u'.repeat(129)],
  ])('should drop the userId but keep the seat when it is %s', (_case, userId) => {
    // Arrange
    const text = withSeat0UserId(userId);

    // Act
    const decoded = decodeSnapshot(text);

    // Assert
    expect(decoded?.players[0]).toEqual({ name: 'Hamza', isBot: false, away: false, connected: true });
  });

  it('should decode a seat without a userId when the server leaves it out', () => {
    // Arrange
    const text = withSeat0UserId(undefined);

    // Act
    const decoded = decodeSnapshot(text);

    // Assert
    expect(decoded?.players[0]).toEqual({ name: 'Hamza', isBot: false, away: false, connected: true });
  });
});
