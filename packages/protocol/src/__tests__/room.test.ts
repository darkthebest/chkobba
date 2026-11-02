import { describe, it, expect } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode, normalizeRoomCode } from '../room';
import {
  FIXTURE_ROOM_CODE,
  PRIVATE_PLAYING_SEATED_SNAPSHOT,
  PRIVATE_PLAYING_STANDING_SNAPSHOT,
  PRIVATE_WAITING_SEATED_SNAPSHOT,
  PRIVATE_WAITING_STANDING_SNAPSHOT,
  PUBLIC_PLAYING_SNAPSHOT,
} from '../testing';

describe('room code constants', () => {
  it('should use a 32-symbol alphabet', () => {
    // Act
    const length = ROOM_CODE_ALPHABET.length;

    // Assert
    expect(length).toBe(32);
  });

  it('should not repeat a symbol in the alphabet', () => {
    // Arrange
    const symbols = ROOM_CODE_ALPHABET.split('');

    // Act
    const unique = new Set(symbols).size;

    // Assert
    expect(unique).toBe(32);
  });

  it.each(['0', 'O', '1', 'I'])('should leave the look-alike %s out of the alphabet', (symbol) => {
    // Act
    const index = ROOM_CODE_ALPHABET.indexOf(symbol);

    // Assert
    expect(index).toBe(-1);
  });

  it('should use 6-character codes', () => {
    // Assert
    expect(ROOM_CODE_LENGTH).toBe(6);
  });
});

describe('normalizeRoomCode', () => {
  it.each([
    { scenario: 'an already canonical code', input: 'K7M2QX', expected: 'K7M2QX' },
    { scenario: 'a lowercase code', input: 'k7m2qx', expected: 'K7M2QX' },
    { scenario: 'a mixed-case code', input: 'k7M2qX', expected: 'K7M2QX' },
    { scenario: 'a code split by a space', input: 'K7M 2QX', expected: 'K7M2QX' },
    { scenario: 'a code split by a dash', input: 'k7m-2qx', expected: 'K7M2QX' },
    { scenario: 'a code with leading and trailing spaces', input: '  K7M2QX  ', expected: 'K7M2QX' },
    { scenario: 'a code with tabs and newlines', input: '\tK7M\n2QX\n', expected: 'K7M2QX' },
    { scenario: 'a code with several dashes and spaces', input: 'K-7 M - 2Q--X', expected: 'K7M2QX' },
    { scenario: 'an empty string', input: '', expected: '' },
    { scenario: 'only separators', input: ' - - ', expected: '' },
    { scenario: 'a code with other punctuation', input: 'K7M.2QX', expected: 'K7M.2QX' },
  ])('should return $expected for $scenario', ({ input, expected }) => {
    // Act
    const result = normalizeRoomCode(input);

    // Assert
    expect(result).toBe(expected);
  });
});

describe('isRoomCode', () => {
  it.each([
    { scenario: 'a canonical code', code: 'K7M2QX' },
    { scenario: 'all letters', code: 'ABCDEF' },
    { scenario: 'all digits', code: '234567' },
    { scenario: 'the last alphabet symbols', code: 'YZ2789' },
  ])('should accept $scenario ($code)', ({ code }) => {
    // Act
    const result = isRoomCode(code);

    // Assert
    expect(result).toBe(true);
  });

  it.each([
    { scenario: 'a lowercase code (not normalized)', code: 'k7m2qx' },
    { scenario: 'a code with a space (not normalized)', code: 'K7M 2Q' },
    { scenario: 'a code with a dash (not normalized)', code: 'K7M-2Q' },
    { scenario: 'a 5-character code', code: 'K7M2Q' },
    { scenario: 'a 7-character code', code: 'K7M2QXA' },
    { scenario: 'an empty string', code: '' },
    { scenario: 'a code with the digit 0', code: 'K7M20X' },
    { scenario: 'a code with the letter O', code: 'K7M2OX' },
    { scenario: 'a code with the digit 1', code: 'K7M21X' },
    { scenario: 'a code with the letter I', code: 'K7M2IX' },
    { scenario: 'a code with punctuation', code: 'K7M.2Q' },
    { scenario: 'a code with a non-ASCII letter', code: 'K7M2QÉ' },
  ])('should reject $scenario ($code)', ({ code }) => {
    // Act
    const result = isRoomCode(code);

    // Assert
    expect(result).toBe(false);
  });

  it.each([
    { input: 'k7m-2qx' },
    { input: ' K7M 2QX ' },
    { input: 'k7m2qx' },
  ])('should accept $input once normalized', ({ input }) => {
    // Act
    const result = isRoomCode(normalizeRoomCode(input));

    // Assert
    expect(result).toBe(true);
  });

  it('should reject a code that is too long even after normalizing', () => {
    // Act
    const result = isRoomCode(normalizeRoomCode('k7m-2qx-a'));

    // Assert
    expect(result).toBe(false);
  });
});

describe('room snapshot fixtures', () => {
  it('should use a valid room code', () => {
    // Act
    const result = isRoomCode(FIXTURE_ROOM_CODE);

    // Assert
    expect(result).toBe(true);
  });

  it.each([
    { name: 'waiting seated', snapshot: PRIVATE_WAITING_SEATED_SNAPSHOT },
    { name: 'waiting standing', snapshot: PRIVATE_WAITING_STANDING_SNAPSHOT },
    { name: 'playing seated', snapshot: PRIVATE_PLAYING_SEATED_SNAPSHOT },
    { name: 'playing standing', snapshot: PRIVATE_PLAYING_STANDING_SNAPSHOT },
  ])('should point room.you at the recipient seat in the $name snapshot', ({ snapshot }) => {
    // Arrange
    const room = snapshot.room!;

    // Act
    const ownSeat = room.members[room.you]?.seat;

    // Assert
    expect(ownSeat).toBe(snapshot.seat === -1 ? null : snapshot.seat);
  });

  it.each([
    { name: 'waiting standing', snapshot: PRIVATE_WAITING_STANDING_SNAPSHOT },
    { name: 'playing standing', snapshot: PRIVATE_PLAYING_STANDING_SNAPSHOT },
  ])('should give no view to the standing member in the $name snapshot', ({ snapshot }) => {
    // Assert
    expect(snapshot.view).toBeNull();
  });

  it('should carry the team scores for a standing member mid-game', () => {
    // Assert
    expect(PRIVATE_PLAYING_STANDING_SNAPSHOT.room?.scores).toEqual([3, 5]);
  });

  it('should have no room field on a public table snapshot', () => {
    // Assert
    expect('room' in PUBLIC_PLAYING_SNAPSHOT).toBe(false);
  });
});
