/**
 * Pure claim-lifecycle rules (ADR-0004 section 10): staleness, the release
 * guard and the before-hook reclaim verdict. No storage, no clock, no mocks —
 * every case is one input and one returned value.
 */
import { describe, expect, it } from 'vitest';
import { foldName, type NameClaim } from '@chkobba/protocol';
import { isStale, judgeClaim, shouldRelease } from '../claimRules';

const NOW = 1_700_000_000_000;
const OWN_USER = 'me';

function claim(overrides: Partial<NameClaim> = {}): NameClaim {
  return { userId: 'holder', name: 'Hedi', fold: foldName('Hedi'), claimedAt: NOW, ...overrides };
}

describe('isStale', () => {
  it('should not be stale when the live spelling folds to the claim fold', () => {
    // Arrange
    const held = claim();

    // Act
    const stale = isStale(held, 'HÉDI');

    // Assert
    expect(stale).toBe(false);
  });

  it('should be stale when the live name folds to a different key', () => {
    // Arrange
    const held = claim();

    // Act
    const stale = isStale(held, 'Sami');

    // Assert
    expect(stale).toBe(true);
  });

  it('should be stale when the owner account is gone (null live name)', () => {
    // Arrange
    const held = claim();

    // Act
    const stale = isStale(held, null);

    // Assert
    expect(stale).toBe(true);
  });
});

describe('shouldRelease', () => {
  it('should not release the claim on a casing-only rename', () => {
    // Arrange
    const oldFold = foldName('Hedi');
    const newFold = foldName('HEDI');

    // Act
    const release = shouldRelease(oldFold, newFold);

    // Assert
    expect(release).toBe(false);
  });

  it('should not release the claim on an accent-only rename', () => {
    // Arrange
    const oldFold = foldName('Hedi');
    const newFold = foldName('Hédi');

    // Act
    const release = shouldRelease(oldFold, newFold);

    // Assert
    expect(release).toBe(false);
  });

  it('should release the claim when the fold genuinely changes', () => {
    // Arrange
    const oldFold = foldName('Hedi');
    const newFold = foldName('Sami');

    // Act
    const release = shouldRelease(oldFold, newFold);

    // Assert
    expect(release).toBe(true);
  });
});

describe('judgeClaim', () => {
  it.each([
    { scenario: 'null', value: null },
    { scenario: 'undefined', value: undefined },
  ])('should judge an absent record ($scenario) as free', ({ value }) => {
    // Arrange (absent record)

    // Act
    const verdict = judgeClaim(value, OWN_USER, null);

    // Assert
    expect(verdict).toBe('free');
  });

  it('should judge the caller own record as free even when the live name drifted', () => {
    // Arrange
    const held = claim({ userId: OWN_USER });

    // Act
    const verdict = judgeClaim(held, OWN_USER, 'Sami');

    // Assert
    expect(verdict).toBe('free');
  });

  it('should judge a live foreign claim as taken across casing and accents', () => {
    // Arrange
    const held = claim({ userId: 'other' });

    // Act
    const verdict = judgeClaim(held, OWN_USER, 'HÉDI');

    // Assert
    expect(verdict).toBe('taken');
  });

  it('should judge a foreign claim whose owner renamed to a different fold as reclaim', () => {
    // Arrange
    const held = claim({ userId: 'other' });

    // Act
    const verdict = judgeClaim(held, OWN_USER, 'Sami');

    // Assert
    expect(verdict).toBe('reclaim');
  });

  it('should judge a foreign claim whose owner account is gone as reclaim', () => {
    // Arrange
    const held = claim({ userId: 'other' });

    // Act
    const verdict = judgeClaim(held, OWN_USER, null);

    // Assert
    expect(verdict).toBe('reclaim');
  });

  it.each([
    { scenario: 'a string', value: 'Hedi' },
    { scenario: 'a number', value: 42 },
    { scenario: 'an array', value: [] },
    { scenario: 'an empty object', value: {} },
    { scenario: 'a missing fold', value: { userId: 'other', name: 'Hedi', claimedAt: NOW } },
    { scenario: 'a non-string userId', value: { userId: 1, name: 'Hedi', fold: 'hedi', claimedAt: NOW } },
    { scenario: 'a non-string name', value: { userId: 'other', name: null, fold: 'hedi', claimedAt: NOW } },
    { scenario: 'a non-string fold', value: { userId: 'other', name: 'Hedi', fold: 1, claimedAt: NOW } },
    { scenario: 'a string claimedAt', value: { userId: 'other', name: 'Hedi', fold: 'hedi', claimedAt: 'now' } },
    { scenario: 'an infinite claimedAt', value: { userId: 'other', name: 'Hedi', fold: 'hedi', claimedAt: Infinity } },
    { scenario: 'a NaN claimedAt', value: { userId: 'other', name: 'Hedi', fold: 'hedi', claimedAt: NaN } },
  ])('should judge a malformed record ($scenario) as reclaim, never taken', ({ value }) => {
    // Arrange (malformed storage value)

    // Act
    const verdict = judgeClaim(value, OWN_USER, 'Hedi');

    // Assert
    expect(verdict).toBe('reclaim');
  });
});
