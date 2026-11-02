import { describe, it, expect } from 'vitest';
import {
  FRIEND_CODE_ALPHABET,
  FRIEND_CODE_LENGTH,
  NOTIFICATION_CODES,
  formatFriendCode,
  friendCodeFromBytes,
  isFriendCode,
  normalizeFriendCode,
} from '../friends';
import { ROOM_CODE_ALPHABET } from '../room';
import {
  FIXTURE_FRIEND_CODE,
  FIXTURE_USER_ID_HAMZA,
  FIXTURE_USER_ID_SAMI,
  PUBLIC_PLAYING_SNAPSHOT,
  PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS,
} from '../testing';

describe('friend code constants', () => {
  it('should reuse the room-code alphabet', () => {
    // Act
    const same = FRIEND_CODE_ALPHABET === ROOM_CODE_ALPHABET;

    // Assert
    expect(same).toBe(true);
  });

  it('should use 8-character codes', () => {
    // Assert
    expect(FRIEND_CODE_LENGTH).toBe(8);
  });

  it('should give the table invite notification a positive code so it never clashes with Nakama codes', () => {
    // Assert
    expect(NOTIFICATION_CODES.TABLE_INVITE).toBeGreaterThan(0);
  });
});

describe('normalizeFriendCode', () => {
  it.each([
    { scenario: 'an already canonical code', input: 'ABCD2345', expected: 'ABCD2345' },
    { scenario: 'a lowercase code', input: 'abcd2345', expected: 'ABCD2345' },
    { scenario: 'a mixed-case code', input: 'aBcD2345', expected: 'ABCD2345' },
    { scenario: 'the dashed display form', input: 'abcd-2345', expected: 'ABCD2345' },
    { scenario: 'a code split by a space', input: 'ABCD 2345', expected: 'ABCD2345' },
    { scenario: 'a code with leading and trailing spaces', input: '  ABCD2345  ', expected: 'ABCD2345' },
    { scenario: 'a code with several dashes and spaces', input: 'A-B C - D2--345', expected: 'ABCD2345' },
    { scenario: 'a code split by a tab', input: 'ABCD\t2345', expected: 'ABCD2345' },
    { scenario: 'a pasted code with a trailing newline', input: 'abcd-2345\r\n', expected: 'ABCD2345' },
    { scenario: 'a code split by a non-breaking space', input: 'ABCD\u00a02345', expected: 'ABCD2345' },
    { scenario: 'an empty string', input: '', expected: '' },
    { scenario: 'only separators', input: ' - - ', expected: '' },
    { scenario: 'a code with other punctuation', input: 'ABCD.2345', expected: 'ABCD.2345' },
  ])('should return $expected for $scenario', ({ input, expected }) => {
    // Act
    const result = normalizeFriendCode(input);

    // Assert
    expect(result).toBe(expected);
  });
});

describe('isFriendCode', () => {
  it.each([
    { scenario: 'a canonical code', code: 'ABCD2345' },
    { scenario: 'the fixture code', code: FIXTURE_FRIEND_CODE },
    { scenario: 'all letters', code: 'ABCDEFGH' },
    { scenario: 'all digits', code: '23456789' },
    { scenario: 'the first and last alphabet symbols', code: 'AAAA9999' },
  ])('should accept $scenario ($code)', ({ code }) => {
    // Act
    const result = isFriendCode(code);

    // Assert
    expect(result).toBe(true);
  });

  it.each([
    { scenario: 'the excluded digit 0', code: 'ABCD0345' },
    { scenario: 'the excluded letter O', code: 'ABCDO345' },
    { scenario: 'the excluded digit 1', code: 'ABCD1345' },
    { scenario: 'the excluded letter I', code: 'ABCDI345' },
    { scenario: 'a lowercase code (not normalized)', code: 'abcd2345' },
    { scenario: 'the dashed display form (not normalized)', code: 'ABCD-2345' },
    { scenario: 'a code with a space (not normalized)', code: 'ABCD 2345' },
    { scenario: 'a code one character short', code: 'ABCD234' },
    { scenario: 'a code one character long', code: 'ABCD23456' },
    { scenario: 'a room-code length', code: 'K7M2QX' },
    { scenario: 'an empty string', code: '' },
  ])('should reject $scenario ($code)', ({ code }) => {
    // Act
    const result = isFriendCode(code);

    // Assert
    expect(result).toBe(false);
  });

  it.each([
    { scenario: 'lowercase', input: 'abcd2345' },
    { scenario: 'dashed', input: 'abcd-2345' },
    { scenario: 'spaced', input: 'ABCD 2345' },
  ])('should accept a $scenario code after normalization', ({ input }) => {
    // Act
    const result = isFriendCode(normalizeFriendCode(input));

    // Assert
    expect(result).toBe(true);
  });
});

describe('formatFriendCode', () => {
  it('should split a valid code into the XXXX-XXXX display form', () => {
    // Act
    const result = formatFriendCode('ABCD2345');

    // Assert
    expect(result).toBe('ABCD-2345');
  });

  it('should round-trip through normalizeFriendCode', () => {
    // Arrange
    const displayed = formatFriendCode(FIXTURE_FRIEND_CODE);

    // Act
    const result = normalizeFriendCode(displayed);

    // Assert
    expect(result).toBe(FIXTURE_FRIEND_CODE);
  });

  it.each([
    { scenario: 'a lowercase code', input: 'abcd2345' },
    { scenario: 'an already dashed code', input: 'ABCD-2345' },
    { scenario: 'a code with an excluded symbol', input: 'ABCD0345' },
    { scenario: 'a short code', input: 'ABCD234' },
    { scenario: 'an empty string', input: '' },
  ])('should return $scenario unchanged by design', ({ input }) => {
    // Act
    const result = formatFriendCode(input);

    // Assert
    expect(result).toBe(input);
  });
});

describe('friendCodeFromBytes', () => {
  it.each([
    { scenario: 'byte 0', byte: 0, expected: 'A' },
    { scenario: 'byte 31', byte: 31, expected: '9' },
    { scenario: 'byte 32 (wraps to the first symbol)', byte: 32, expected: 'A' },
    { scenario: 'byte 255 (wraps to the last symbol)', byte: 255, expected: '9' },
  ])('should map $scenario to $expected', ({ byte, expected }) => {
    // Arrange
    const bytes = new Array<number>(FRIEND_CODE_LENGTH).fill(byte);

    // Act
    const code = friendCodeFromBytes(bytes);

    // Assert
    expect(code).toBe(expected.repeat(FRIEND_CODE_LENGTH));
  });

  it('should pick one symbol per byte in order', () => {
    // Arrange
    const bytes = [0, 1, 2, 3, 24, 25, 30, 31];

    // Act
    const code = friendCodeFromBytes(bytes);

    // Assert
    expect(code).toBe('ABCD2389');
  });

  it('should ignore bytes beyond the code length', () => {
    // Arrange
    const bytes = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 31, 31, 31, 31]);

    // Act
    const code = friendCodeFromBytes(bytes);

    // Assert
    expect(code).toBe('AAAAAAAA');
  });

  it('should always produce a valid friend code', () => {
    // Arrange
    const bytes = new Uint8Array([7, 63, 128, 200, 13, 99, 250, 42]);

    // Act
    const code = friendCodeFromBytes(bytes);

    // Assert
    expect(isFriendCode(code)).toBe(true);
  });

  it('should reach every alphabet symbol exactly 8 times over bytes 0-255 (no modulo bias)', () => {
    // Arrange
    const counts = new Map<string, number>();

    // Act
    for (let byte = 0; byte <= 255; byte++) {
      const symbol = friendCodeFromBytes(new Array<number>(FRIEND_CODE_LENGTH).fill(byte)).charAt(0);
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }

    // Assert
    const expected = new Map(FRIEND_CODE_ALPHABET.split('').map((symbol) => [symbol, 8]));
    expect(counts).toEqual(expected);
  });

  it.each([0, 1, 7])('should throw a RangeError when given %i bytes', (length) => {
    // Arrange
    const bytes = new Array<number>(length).fill(0);

    // Act
    const act = () => friendCodeFromBytes(bytes);

    // Assert
    expect(act).toThrow(RangeError);
  });
});

describe('PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS fixture', () => {
  it('should carry a userId on human seats and none on bot seats', () => {
    // Act
    const userIds = PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS.players.map((player) => player?.userId);

    // Assert
    expect(userIds).toEqual([FIXTURE_USER_ID_HAMZA, undefined, FIXTURE_USER_ID_SAMI, undefined]);
  });

  it('should leave the bot entries without a userId key at all', () => {
    // Act
    const botsWithKey = PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS.players.filter(
      (player) => player !== null && player.isBot && 'userId' in player
    );

    // Assert
    expect(botsWithKey).toEqual([]);
  });

  it('should otherwise match the public playing snapshot', () => {
    // Act
    const withoutIds = { ...PUBLIC_PLAYING_SNAPSHOT_WITH_USER_IDS, players: PUBLIC_PLAYING_SNAPSHOT.players };

    // Assert
    expect(withoutIds).toEqual(PUBLIC_PLAYING_SNAPSHOT);
  });

  it('should not add userId to the original public snapshot', () => {
    // Act
    const withIds = PUBLIC_PLAYING_SNAPSHOT.players.filter((player) => player !== null && 'userId' in player);

    // Assert
    expect(withIds).toEqual([]);
  });
});
