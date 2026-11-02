/**
 * `set_presence_visibility` (ADR-0004 section 14): both protocol states round-trip,
 * anything else is `presence_bad_request` (3) with the input never echoed, the
 * record is owner-readable but server-written (read 1 / write 0), and a storage
 * fault is an error rather than a silently discarded choice.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_COLLECTION,
  PROFILE_PREFS_KEY,
  PRESENCE_VISIBILITY,
  type PresenceVisibility,
  type SetPresenceVisibilityResponse,
} from '@chkobba/protocol';
import { readPresenceVisibility } from '../presencePrefs';
import { rpcSetPresenceVisibility } from '../setPresenceVisibility';
import {
  createContext,
  createFakeLogger,
  createFakeNk,
  createUnauthenticatedContext,
} from '../../__tests__/fakes';

const NOW = 1_700_000_000_000;
const USER = 'user-1';

let nk: ReturnType<typeof createFakeNk>;
let logger: ReturnType<typeof createFakeLogger>;
let ctx: nkruntime.Context;

function setVisibility(payload: unknown): SetPresenceVisibilityResponse {
  return JSON.parse(rpcSetPresenceVisibility(ctx, logger, nk, JSON.stringify(payload))) as SetPresenceVisibilityResponse;
}

/** What `fn` threw, or undefined when it returned. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  logger = createFakeLogger();
  nk = createFakeNk();
  nk.fake.useMemoryStorage();
  ctx = createContext(USER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('set_presence_visibility authentication', () => {
  it('should throw UNAUTHENTICATED (16) when there is no authenticated user', () => {
    // Arrange
    const payload = JSON.stringify({ visibility: 'nobody' });

    // Act
    const error = thrownBy(() => rpcSetPresenceVisibility(createUnauthenticatedContext(), logger, nk, payload));

    // Assert
    expect(error).toEqual(expect.objectContaining({ code: 16 }));
  });
});

describe('set_presence_visibility validation', () => {
  it.each([
    { scenario: 'the payload is not JSON', payload: '{not json' },
    { scenario: 'the payload is JSON null', payload: 'null' },
    { scenario: 'the payload is an array', payload: '[]' },
    { scenario: 'visibility is missing', payload: JSON.stringify({}) },
    { scenario: 'visibility is not a string', payload: JSON.stringify({ visibility: 42 }) },
    { scenario: 'visibility is an unknown string', payload: JSON.stringify({ visibility: 'friends' }) },
    { scenario: 'visibility is the wrong case', payload: JSON.stringify({ visibility: 'Nobody' }) },
  ])('should reject the request with presence_bad_request (3) when $scenario', ({ payload }) => {
    // Arrange (the malformed request)

    // Act
    const error = thrownBy(() => rpcSetPresenceVisibility(ctx, logger, nk, payload));

    // Assert
    expect(error).toEqual({ message: 'presence_bad_request', code: 3 });
  });
});

describe('set_presence_visibility round trip', () => {
  it.each([...PRESENCE_VISIBILITY])('should save and echo the %s choice', (visibility: PresenceVisibility) => {
    // Arrange (a valid choice)

    // Act
    const response = setVisibility({ visibility });

    // Assert
    expect({ response, stored: readPresenceVisibility(nk, USER) }).toEqual({
      response: { visibility, updatedAt: NOW },
      stored: visibility,
    });
  });

  it('should write the prefs record owner-readable and server-write-only (read 1 / write 0)', () => {
    // Arrange (the caller's first choice)

    // Act
    setVisibility({ visibility: 'nobody' });

    // Assert
    expect(nk.fake.storedObject(PROFILE_COLLECTION, PROFILE_PREFS_KEY, USER)).toEqual(
      expect.objectContaining({
        collection: PROFILE_COLLECTION,
        key: PROFILE_PREFS_KEY,
        userId: USER,
        permissionRead: 1,
        permissionWrite: 0,
        value: { visibility: 'nobody', updatedAt: NOW },
      }),
    );
  });

  it('should replace a previous choice rather than appending', () => {
    // Arrange
    setVisibility({ visibility: 'everyone' });

    // Act
    setVisibility({ visibility: 'nobody' });

    // Assert
    expect(readPresenceVisibility(nk, USER)).toBe('nobody');
  });
});

describe('set_presence_visibility storage faults', () => {
  it('should answer directory_storage_error (13) when the write fails', () => {
    // Arrange
    nk.fake.failStorageWrites();

    // Act
    const error = thrownBy(() => setVisibility({ visibility: 'nobody' }));

    // Assert
    expect(error).toEqual({ message: 'directory_storage_error', code: 13 });
  });
});
