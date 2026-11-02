import { describe, it, expect } from 'vitest';
import { RENAME_COOLDOWN_MS, type NameRecord } from '@chkobba/protocol';
import { NAME_FORMAT_VECTORS } from '@chkobba/protocol/testing';
import { checkName, checkRenameCooldown, defaultDisplayName } from '../index';

const PICKED_AT = 1_000_000;
const CHANGED_AT = 5_000_000;

describe('checkName', () => {
  describe('shared format vectors', () => {
    const failures = NAME_FORMAT_VECTORS.filter((v) => v.expected !== 'ok');
    const passes = NAME_FORMAT_VECTORS.filter((v) => v.expected === 'ok');

    it.each(failures)('should reject $input with $expected when the format check fails', ({ input, expected }) => {
      // Arrange (vector)

      // Act
      const result = checkName(input);

      // Assert
      expect(result).toEqual({ ok: false, code: expected });
    });

    // No format-ok vector is profane, so each one must come back normalized.
    it.each(passes)('should accept $input as $normalized when the format is valid', ({ input, normalized }) => {
      // Arrange (vector)

      // Act
      const result = checkName(input);

      // Assert
      expect(result).toEqual({ ok: true, name: normalized });
    });
  });

  it.each(['Fuck', 'Sh1t', 'ChkobbaAdmin', 'قحبة', '  nique   ta mere '])(
    'should reject %s with name_not_allowed when the name is profane or reserved',
    (input) => {
      // Arrange (input)

      // Act
      const result = checkName(input);

      // Assert
      expect(result).toEqual({ ok: false, code: 'name_not_allowed' });
    }
  );

  it('should report the format error rather than name_not_allowed when a profane name also has bad characters', () => {
    // Arrange
    const input = 'fuck_you';

    // Act
    const result = checkName(input);

    // Assert
    expect(result).toEqual({ ok: false, code: 'name_bad_chars' });
  });
});

describe('checkRenameCooldown', () => {
  const record: NameRecord = { pickedAt: PICKED_AT, changedAt: CHANGED_AT };

  it('should allow the change when there is no stored record', () => {
    // Arrange
    const now = PICKED_AT;

    // Act
    const result = checkRenameCooldown(null, now);

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should allow the first rename straight after the first pick when changedAt is null', () => {
    // Arrange
    const firstPickOnly: NameRecord = { pickedAt: PICKED_AT, changedAt: null };

    // Act
    const result = checkRenameCooldown(firstPickOnly, PICKED_AT + 1);

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should refuse with retryAt = changedAt + cooldown when 1 ms is left on the cooldown', () => {
    // Arrange
    const now = CHANGED_AT + RENAME_COOLDOWN_MS - 1;

    // Act
    const result = checkRenameCooldown(record, now);

    // Assert
    expect(result).toEqual({ ok: false, code: 'name_rate_limited', retryAt: CHANGED_AT + RENAME_COOLDOWN_MS });
  });

  it('should refuse when the rename happens at the same instant as the last change', () => {
    // Arrange
    const now = CHANGED_AT;

    // Act
    const result = checkRenameCooldown(record, now);

    // Assert
    expect(result).toEqual({ ok: false, code: 'name_rate_limited', retryAt: CHANGED_AT + RENAME_COOLDOWN_MS });
  });

  it('should allow the rename exactly at the cooldown boundary', () => {
    // Arrange
    const now = CHANGED_AT + RENAME_COOLDOWN_MS;

    // Act
    const result = checkRenameCooldown(record, now);

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should allow the rename after the cooldown has elapsed', () => {
    // Arrange
    const now = CHANGED_AT + RENAME_COOLDOWN_MS + 1;

    // Act
    const result = checkRenameCooldown(record, now);

    // Assert
    expect(result).toEqual({ ok: true });
  });
});

describe('defaultDisplayName', () => {
  it.each([
    { random: 0, expected: 'Player0000' },
    { random: 0.99999, expected: 'Player9999' },
    { random: 0.5, expected: 'Player5000' },
    { random: 0.0042, expected: 'Player0042' },
    { random: 0.042, expected: 'Player0420' },
    { random: 1, expected: 'Player9999' },
    { random: 1.5, expected: 'Player9999' },
    { random: -0.1, expected: 'Player0000' },
    { random: Number.NaN, expected: 'Player0000' },
  ])('should return $expected when random returns $random', ({ random, expected }) => {
    // Arrange
    const rng = () => random;

    // Act
    const name = defaultDisplayName(rng);

    // Assert
    expect(name).toBe(expected);
  });

  it.each([0, 0.99999, 0.5, 0.0042, 1, -0.1, Number.NaN])(
    'should match Player plus 4 digits when random returns %s',
    (random) => {
      // Arrange
      const rng = () => random;

      // Act
      const name = defaultDisplayName(rng);

      // Assert
      expect(name).toMatch(/^Player\d{4}$/);
    }
  );

  it.each([0, 0.99999, 0.5, 0.0042, 1, -0.1, Number.NaN])(
    'should produce a name that passes checkName when random returns %s',
    (random) => {
      // Arrange
      const name = defaultDisplayName(() => random);

      // Act
      const result = checkName(name);

      // Assert
      expect(result).toEqual({ ok: true, name });
    }
  );

  it('should call random exactly once', () => {
    // Arrange
    let calls = 0;
    const rng = () => {
      calls += 1;
      return 0.3;
    };

    // Act
    defaultDisplayName(rng);

    // Assert
    expect(calls).toBe(1);
  });
});
