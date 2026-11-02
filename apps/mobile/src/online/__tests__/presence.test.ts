import { PRESENCE_ACTIVITIES, type PresenceActivity } from '@chkobba/protocol';

import { decodeAvailability, encodeStatus, type Availability } from '../presence';

describe('encodeStatus', () => {
  it.each(PRESENCE_ACTIVITIES)('should encode %s as exactly {"v":1,"a":"..."}', (activity) => {
    // Act
    const status = encodeStatus(activity);

    // Assert
    expect(status).toBe(`{"v":1,"a":"${activity}"}`);
  });
});

describe('decodeAvailability', () => {
  it.each<[PresenceActivity, Availability]>([
    ['lobby', 'online'],
    ['room', 'room'],
    ['playing', 'playing'],
  ])('should read %s as %s when the status was encoded by encodeStatus', (activity, expected) => {
    // Arrange
    const presence = { status: encodeStatus(activity) };

    // Act
    const availability = decodeAvailability(presence);

    // Assert
    expect(availability).toBe(expected);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('should return offline when the presence is %s', (_case, presence) => {
    // Act
    const availability = decodeAvailability(presence);

    // Assert
    expect(availability).toBe('offline');
  });

  it.each<[string, { status?: string }]>([
    ['the status is missing', {}],
    ['the status is empty', { status: '' }],
    ['the status is not JSON', { status: 'playing' }],
    ['the status is JSON null', { status: 'null' }],
    ['the status is a JSON string', { status: '"room"' }],
    ['the activity key is missing', { status: '{"v":1}' }],
    ['the activity is unknown', { status: '{"v":1,"a":"away"}' }],
    ['the activity is not a string', { status: '{"v":1,"a":2}' }],
    ['the activity has the wrong case', { status: '{"v":1,"a":"ROOM"}' }],
  ])('should return online when %s', (_case, presence) => {
    // Act
    const availability = decodeAvailability(presence);

    // Assert
    expect(availability).toBe('online');
  });

  it('should ignore extra fields when the status carries a known activity', () => {
    // Arrange
    const presence = { status: '{"v":2,"a":"playing","code":"ABCD23"}' };

    // Act
    const availability = decodeAvailability(presence);

    // Assert
    expect(availability).toBe('playing');
  });
});
