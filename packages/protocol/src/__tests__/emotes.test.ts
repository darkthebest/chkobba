import { describe, it, expect } from 'vitest';
import { EMOTE_IDS, isEmoteId } from '../emotes';
import { OpCode } from '../index';

describe('isEmoteId', () => {
  it.each(EMOTE_IDS.map((id) => ({ id })))('should accept the listed id $id', ({ id }) => {
    // Act
    const result = isEmoteId(id);

    // Assert
    expect(result).toBe(true);
  });

  it.each([
    { scenario: 'an unknown id', value: 'kiss' },
    { scenario: 'a differently cased id', value: 'Yalla' },
    { scenario: 'an empty string', value: '' },
    { scenario: 'a number', value: 4 },
    { scenario: 'null', value: null },
    { scenario: 'an object', value: { id: 'yalla' } },
  ])('should reject $scenario', ({ value }) => {
    // Act
    const result = isEmoteId(value);

    // Assert
    expect(result).toBe(false);
  });
});

describe('emote opcodes', () => {
  it('should keep client intents below 100 and server messages at 100 or above', () => {
    // Assert
    expect(OpCode.EMOTE).toBeLessThan(100);
    expect(OpCode.EMOTE_SHOWN).toBeGreaterThanOrEqual(100);
  });

  it('should not reuse an existing opcode', () => {
    // Arrange
    const values = Object.values(OpCode);

    // Assert
    expect(new Set(values).size).toBe(values.length);
  });
});
