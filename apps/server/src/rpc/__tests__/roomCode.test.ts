import { describe, it, expect } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, isRoomCode, type RoomLimitsRecord } from '@chkobba/protocol';
import { byteSource, generateRoomCode } from '../roomCode';
import {
  CREATE_LIMIT,
  EMPTY_LIMITS,
  LIMIT_WINDOW_MS,
  LOOKUP_FAILURE_LIMIT,
  checkCreate,
  checkLookup,
  parseLimits,
  recordCreate,
  recordLookupFailure,
} from '../roomLimits';

function bufferOf(bytes: readonly number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

function sourceOf(bytes: readonly number[]): () => number {
  return byteSource(bufferOf(bytes));
}

const T0 = 1_000_000_000;

describe('generateRoomCode', () => {
  it.each([
    { name: 'all zeros', bytes: [0, 0, 0, 0, 0, 0], expected: 'AAAAAA' },
    { name: 'bytes 0..5', bytes: [0, 1, 2, 3, 4, 5], expected: 'ABCDEF' },
    { name: 'bytes >= 32 masked to the low 5 bits', bytes: [32, 33, 34, 35, 36, 37], expected: 'ABCDEF' },
    { name: 'byte 255 as the last symbol', bytes: [255, 255, 255, 255, 255, 255], expected: '999999' },
    { name: 'byte 31 as the last symbol', bytes: [31, 63, 95, 127, 159, 191], expected: '999999' },
  ])('should map $name to $expected', ({ bytes, expected }) => {
    // Arrange
    const next = sourceOf(bytes);

    // Act
    const code = generateRoomCode(next);

    // Assert
    expect(code).toBe(expected);
  });

  it('should produce a valid room code for every byte value', () => {
    for (let b = 0; b < 256; b++) {
      // Arrange
      const next = sourceOf([b, b, b, b, b, b]);

      // Act
      const code = generateRoomCode(next);

      // Assert
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isRoomCode(code)).toBe(true);
      expect(code.charAt(0)).toBe(ROOM_CODE_ALPHABET.charAt(b % 32));
    }
  });

  it('should consume exactly ROOM_CODE_LENGTH bytes', () => {
    // Arrange
    let calls = 0;
    const next = (): number => {
      calls += 1;
      return 0;
    };

    // Act
    generateRoomCode(next);

    // Assert
    expect(calls).toBe(ROOM_CODE_LENGTH);
  });

  it('should throw when the byte source runs out', () => {
    // Arrange
    const next = sourceOf([1, 2, 3]);

    // Act / Assert
    expect(() => generateRoomCode(next)).toThrow('exhausted');
  });
});

describe('byteSource', () => {
  it('should return bytes in order and then throw', () => {
    // Arrange
    const next = sourceOf([7, 200]);

    // Act / Assert
    expect(next()).toBe(7);
    expect(next()).toBe(200);
    expect(() => next()).toThrow('exhausted');
  });

  it('should throw immediately for an empty buffer', () => {
    // Arrange
    const next = byteSource(new ArrayBuffer(0));

    // Act / Assert
    expect(() => next()).toThrow('exhausted');
  });
});

/** Applies `count` steps starting from `record` at time `now`. */
function repeat(step: (r: RoomLimitsRecord | null, now: number) => RoomLimitsRecord, count: number, now: number): RoomLimitsRecord | null {
  let record: RoomLimitsRecord | null = null;
  for (let i = 0; i < count; i++) record = step(record, now);
  return record;
}

describe('lookup limit', () => {
  it('should allow a lookup with no record', () => {
    // Act / Assert
    expect(checkLookup(null, T0)).toBe(true);
  });

  it('should start a window at the first failure', () => {
    // Act
    const record = recordLookupFailure(null, T0);

    // Assert
    expect(record).toEqual({ ...EMPTY_LIMITS, lookupWindowStart: T0, lookupFailures: 1 });
  });

  it('should allow the 10th lookup after 9 failures', () => {
    // Arrange
    const record = repeat(recordLookupFailure, LOOKUP_FAILURE_LIMIT - 1, T0);

    // Act / Assert
    expect(checkLookup(record, T0 + 1)).toBe(true);
  });

  it('should refuse the 11th lookup after 10 failures in the window', () => {
    // Arrange
    const record = repeat(recordLookupFailure, LOOKUP_FAILURE_LIMIT, T0);

    // Act / Assert
    expect(checkLookup(record, T0 + 1)).toBe(false);
    expect(checkLookup(record, T0 + LIMIT_WINDOW_MS - 1)).toBe(false);
  });

  it('should reset exactly at the window end', () => {
    // Arrange
    const record = repeat(recordLookupFailure, LOOKUP_FAILURE_LIMIT, T0);
    const end = T0 + LIMIT_WINDOW_MS;

    // Act
    const allowed = checkLookup(record, end);
    const next = recordLookupFailure(record, end);

    // Assert
    expect(allowed).toBe(true);
    expect(next.lookupWindowStart).toBe(end);
    expect(next.lookupFailures).toBe(1);
  });

  it('should keep the window start while counting failures in the window', () => {
    // Arrange
    const first = recordLookupFailure(null, T0);

    // Act
    const second = recordLookupFailure(first, T0 + 5000);

    // Assert
    expect(second.lookupWindowStart).toBe(T0);
    expect(second.lookupFailures).toBe(2);
  });

  it('should not affect creates', () => {
    // Arrange
    const record = repeat(recordLookupFailure, LOOKUP_FAILURE_LIMIT, T0);

    // Act / Assert
    expect(checkCreate(record, T0 + 1)).toBe(true);
    expect(record?.creates).toBe(0);
    expect(record?.createWindowStart).toBe(0);
  });
});

describe('create limit', () => {
  it('should allow a create with no record', () => {
    // Act / Assert
    expect(checkCreate(null, T0)).toBe(true);
  });

  it('should allow the 5th create after 4', () => {
    // Arrange
    const record = repeat(recordCreate, CREATE_LIMIT - 1, T0);

    // Act / Assert
    expect(checkCreate(record, T0 + 1)).toBe(true);
  });

  it('should refuse the 6th create after 5 in the window', () => {
    // Arrange
    const record = repeat(recordCreate, CREATE_LIMIT, T0);

    // Act / Assert
    expect(checkCreate(record, T0 + LIMIT_WINDOW_MS - 1)).toBe(false);
  });

  it('should reset exactly at the window end', () => {
    // Arrange
    const record = repeat(recordCreate, CREATE_LIMIT, T0);
    const end = T0 + LIMIT_WINDOW_MS;

    // Act
    const allowed = checkCreate(record, end);
    const next = recordCreate(record, end);

    // Assert
    expect(allowed).toBe(true);
    expect(next).toEqual({ ...EMPTY_LIMITS, createWindowStart: end, creates: 1 });
  });

  it('should not affect lookups', () => {
    // Arrange
    const lookups = repeat(recordLookupFailure, 3, T0);

    // Act
    const record = recordCreate(lookups, T0 + 10);

    // Assert
    expect(record.lookupWindowStart).toBe(T0);
    expect(record.lookupFailures).toBe(3);
    expect(checkLookup(record, T0 + 20)).toBe(true);
  });
});

describe('parseLimits', () => {
  const valid: RoomLimitsRecord = { lookupWindowStart: T0, lookupFailures: 3, createWindowStart: 0, creates: 0 };

  it('should accept a valid record', () => {
    // Act / Assert
    expect(parseLimits(valid)).toEqual(valid);
  });

  it('should drop extra fields', () => {
    // Act / Assert
    expect(parseLimits({ ...valid, extra: 'x' })).toEqual(valid);
  });

  it.each([
    { name: 'null', value: null },
    { name: 'a string', value: 'limits' },
    { name: 'a number', value: 5 },
    { name: 'an array', value: [] },
    { name: 'an empty object', value: {} },
    { name: 'a missing field', value: { lookupWindowStart: 0, lookupFailures: 0, createWindowStart: 0 } },
    { name: 'a string field', value: { ...valid, creates: '1' } },
    { name: 'a null field', value: { ...valid, lookupFailures: null } },
    { name: 'a negative count', value: { ...valid, lookupFailures: -1 } },
    { name: 'a negative window start', value: { ...valid, createWindowStart: -5 } },
    { name: 'NaN', value: { ...valid, creates: Number.NaN } },
    { name: 'Infinity', value: { ...valid, lookupWindowStart: Number.POSITIVE_INFINITY } },
  ])('should reject $name', ({ value }) => {
    // Act / Assert
    expect(parseLimits(value)).toBeNull();
  });
});
