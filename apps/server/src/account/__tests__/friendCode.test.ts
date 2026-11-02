/**
 * Friend-code generation and screening (pure, no nkruntime). Bytes are given
 * as fixed vectors; `bytesOf` turns a readable code back into the byte indices
 * that produce it, so the expectations stay legible.
 */
import { describe, expect, it, vi } from 'vitest';
import { FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH } from '@chkobba/protocol';
import { generateFriendCode, isFriendCodeClean } from '../friendCode';

/** The alphabet index of each character: the smallest byte vector that yields `code`. */
function bytesOf(code: string): number[] {
  return code.split('').map((ch) => FRIEND_CODE_ALPHABET.indexOf(ch));
}

/** A `nextByte` over a fixed vector that throws when exhausted. */
function sourceOf(bytes: readonly number[]): () => number {
  let index = 0;
  return () => {
    const byte = bytes[index];
    if (byte === undefined) throw new Error('byte vector exhausted');
    index += 1;
    return byte;
  };
}

const alwaysClean = (): boolean => true;

describe('generateFriendCode', () => {
  it.each([
    { scenario: 'all zero bytes', bytes: [0, 0, 0, 0, 0, 0, 0, 0], expected: 'AAAAAAAA' },
    { scenario: 'bytes 0 to 7', bytes: [0, 1, 2, 3, 4, 5, 6, 7], expected: 'ABCDEFGH' },
    { scenario: 'the last alphabet symbols', bytes: [24, 25, 26, 27, 28, 29, 30, 31], expected: '23456789' },
    { scenario: 'high bytes masked to their low 5 bits', bytes: [32, 37, 255, 128, 63, 200, 96, 160], expected: 'AF9A9JAA' },
  ])('should build $expected from $scenario', ({ bytes, expected }) => {
    // Arrange
    const nextByte = sourceOf(bytes);

    // Act
    const code = generateFriendCode(nextByte, alwaysClean, 1);

    // Assert
    expect(code).toBe(expected);
  });

  it('should consume exactly FRIEND_CODE_LENGTH bytes when the first code is clean', () => {
    // Arrange
    const nextByte = vi.fn(sourceOf(bytesOf('ABCDEFGH').concat(bytesOf('JKLMNPQR'))));

    // Act
    generateFriendCode(nextByte, alwaysClean, 2);

    // Assert
    expect(nextByte).toHaveBeenCalledTimes(FRIEND_CODE_LENGTH);
  });

  it('should skip a code that spells a blocked word and return the next try', () => {
    // Arrange
    const nextByte = sourceOf(bytesOf('FUCKAAAA').concat(bytesOf('JKLMNPQR')));

    // Act
    const code = generateFriendCode(nextByte, isFriendCodeClean, 2);

    // Assert
    expect(code).toBe('JKLMNPQR');
  });

  it('should return the first clean code when several tries are dirty', () => {
    // Arrange
    const nextByte = sourceOf(bytesOf('FUCKAAAA').concat(bytesOf('B4ST4RDA'), bytesOf('M3RD3BCD'), bytesOf('XYZ23456')));

    // Act
    const code = generateFriendCode(nextByte, isFriendCodeClean, 4);

    // Assert
    expect(code).toBe('XYZ23456');
  });

  it('should return null when every one of maxTries codes is rejected', () => {
    // Arrange
    const nextByte = sourceOf(bytesOf('FUCKAAAA').concat(bytesOf('5LUTAAAA'), bytesOf('ADMN5LUT')));

    // Act
    const code = generateFriendCode(nextByte, isFriendCodeClean, 3);

    // Assert
    expect(code).toBeNull();
  });

  it('should ask isClean once per try with each built code in order', () => {
    // Arrange
    const isClean = vi.fn((): boolean => false);
    const nextByte = sourceOf(bytesOf('AAAAAAAA').concat(bytesOf('BBBBBBBB')));

    // Act
    generateFriendCode(nextByte, isClean, 2);

    // Assert
    expect(isClean.mock.calls).toEqual([['AAAAAAAA'], ['BBBBBBBB']]);
  });

  it('should return null without reading a byte when maxTries is 0', () => {
    // Arrange
    const nextByte = vi.fn(() => 0);

    // Act
    const code = generateFriendCode(nextByte, alwaysClean, 0);

    // Assert
    expect({ code, reads: nextByte.mock.calls.length }).toEqual({ code: null, reads: 0 });
  });
});

describe('isFriendCodeClean', () => {
  it.each([
    { code: 'ABCDEFGH' },
    { code: 'JKLMNPQR' },
    { code: '23456789' },
    { code: 'XYZ23456' },
    { code: 'AAAAAAAA' },
  ])('should accept $code', ({ code }) => {
    // Arrange (code from the table)

    // Act
    const clean = isFriendCodeClean(code);

    // Assert
    expect(clean).toBe(true);
  });

  it.each([
    { scenario: 'an English substring word', code: 'FUCKAAAA' },
    { scenario: 'a blocked word in the middle', code: 'ABFUCKCD' },
    { scenario: 'a French word', code: 'MERDEABC' },
    { scenario: 'a Derja Latin word', code: 'ZAMELXYZ' },
    { scenario: 'a word-mode entry matched as a substring', code: 'XXSLUTXX' },
    { scenario: 'a reserved word', code: 'CHKOBBAX' },
    { scenario: 'a lowercase blocked word', code: 'fuckaaaa' },
    { scenario: 'a mixed-case blocked word', code: 'aBcFuCkD' },
    { scenario: 'leet 4 for a', code: 'B4ST4RDA' },
    { scenario: 'leet 3 for e', code: 'M3RD3BCD' },
    { scenario: 'leet 5 for s', code: '5LUTAAAA' },
    { scenario: 'leet 4 and 5 together', code: '5AL4UDXX' },
  ])('should reject $code ($scenario)', ({ code }) => {
    // Arrange (code from the table)

    // Act
    const clean = isFriendCodeClean(code);

    // Assert
    expect(clean).toBe(false);
  });
});
