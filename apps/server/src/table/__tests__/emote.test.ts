import { describe, it, expect } from 'vitest';
import { EMOTE_COOLDOWN_MS } from '@chkobba/protocol';
import { emote } from '../index';
import { T0, presence, presenceAt, tableWithHumans } from './helpers';

describe('emote', () => {
  it('should show the emote at the sender seat', () => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const result = emote(state, presenceAt(state, 1), { id: 'yalla' }, undefined, T0);

    // Assert
    expect(result).toEqual({ ok: true, shown: { seat: 1, id: 'yalla' } });
  });

  it('should work while the table is still waiting for players', () => {
    // Arrange
    const state = tableWithHumans(1);

    // Act
    const result = emote(state, presenceAt(state, 0), { id: 'thumbs' }, undefined, T0);

    // Assert
    expect(result).toEqual({ ok: true, shown: { seat: 0, id: 'thumbs' } });
  });

  it.each([
    { scenario: 'a stranger', from: presence(9) },
    { scenario: 'an old session of a seated user', from: presence(1, 'stale-session') },
  ])('should reject $scenario as not seated', ({ from }) => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const result = emote(state, from, { id: 'yalla' }, undefined, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'not_seated' });
  });

  it.each([
    { scenario: 'an unknown id', payload: { id: 'kiss' } },
    { scenario: 'a missing id', payload: {} },
    { scenario: 'a bare string', payload: 'yalla' },
    { scenario: 'an array', payload: ['yalla'] },
    { scenario: 'null', payload: null },
  ])('should reject $scenario as a bad payload', ({ payload }) => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const result = emote(state, presenceAt(state, 0), payload, undefined, T0);

    // Assert
    expect(result).toEqual({ ok: false, error: 'bad_payload' });
  });

  it('should drop an emote sent during the cooldown without an error', () => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const result = emote(state, presenceAt(state, 0), { id: 'laugh' }, T0, T0 + EMOTE_COOLDOWN_MS - 1);

    // Assert
    expect(result).toEqual({ ok: true, shown: null });
  });

  it('should show an emote again once the cooldown has passed', () => {
    // Arrange
    const state = tableWithHumans(2);

    // Act
    const result = emote(state, presenceAt(state, 0), { id: 'laugh' }, T0, T0 + EMOTE_COOLDOWN_MS);

    // Assert
    expect(result).toEqual({ ok: true, shown: { seat: 0, id: 'laugh' } });
  });
});
