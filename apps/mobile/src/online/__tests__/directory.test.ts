import { Session, type RpcResponse } from '@heroiclabs/nakama-js';

import { DIRECTORY_RPC_ERROR_CODES } from '@chkobba/protocol';

import {
  createDirectoryBackend,
  directoryErrorFrom,
  searchResultFromPayload,
  type DirectoryClient,
} from '../directory';
import type { SessionSource } from '../profile';

const USER_ID = 'user-1';
const OTHER_ID = 'user-2';
const CURSOR = 'cursor-2';
const NOW_MS = 1_800_000_000_000;
const MAX_USER_ID_CHARS = 128;

/** A real nakama-js Session whose JWT carries `uid`. */
function makeSession(userId: string = USER_ID): Session {
  const claims = btoa(JSON.stringify({ uid: userId, exp: NOW_MS / 1000 + 3600 }));
  return new Session(`h.${claims}.s`, `h.${claims}.s`, false);
}

/** A nakama-js rejection: the fetch Response with the server's JSON body. */
function responseError(status: number, body: unknown) {
  return { status, statusText: `HTTP ${status}`, json: async () => body };
}

function fakeClient() {
  const rpc = jest.fn(async (_session: Session, _id: string, _input: object): Promise<RpcResponse> => ({ payload: {} }));
  return { rpc } satisfies DirectoryClient;
}

function createHarness() {
  const session = makeSession();
  const auth = { signIn: jest.fn(async () => ({ session })) };
  const client = fakeClient();
  const backend = createDirectoryBackend({
    client,
    auth: auth satisfies SessionSource,
  });
  return { backend, client, auth, session };
}

const AMIRA = { userId: OTHER_ID, name: 'Amira', presence: 'visible' as const };

afterEach(() => {
  jest.clearAllMocks();
});

describe('directoryErrorFrom', () => {
  it.each(DIRECTORY_RPC_ERROR_CODES)('should map a %s message to that code', async (reason) => {
    // Arrange
    const error = responseError(400, { code: 3, message: reason });

    // Act
    const result = await directoryErrorFrom(error);

    // Assert
    expect(result).toBe(reason);
  });

  it('should read the code from a message even on a server status', async () => {
    // Arrange
    const error = responseError(500, { code: 13, message: 'directory_rate_limited' });

    // Act
    const result = await directoryErrorFrom(error);

    // Assert
    expect(result).toBe('directory_rate_limited');
  });

  it.each([
    { scenario: 'a bare 404', error: responseError(404, { code: 5 }), expected: 'directory_not_found' },
    { scenario: 'a 401', error: responseError(401, { code: 16, message: 'Auth token invalid' }), expected: 'network' },
    { scenario: 'a 500', error: responseError(500, { code: 13, message: 'Internal error' }), expected: 'network' },
    { scenario: 'a 503', error: responseError(503, { code: 14, message: 'Service unavailable' }), expected: 'network' },
    {
      scenario: 'a directory_storage_error message',
      error: responseError(500, { code: 13, message: 'directory_storage_error' }),
      expected: 'network',
    },
    {
      scenario: 'an unreadable body',
      error: { status: 502, json: async () => Promise.reject(new SyntaxError('bad')) },
      expected: 'network',
    },
    { scenario: 'a non-Response rejection', error: new TypeError('Failed to fetch'), expected: 'network' },
    { scenario: 'an object with a status but no body reader', error: { status: 404 }, expected: 'network' },
    { scenario: 'null', error: null, expected: 'network' },
    { scenario: 'a string', error: 'boom', expected: 'network' },
  ])('should map $scenario to $expected', async ({ error, expected }) => {
    // Act
    const result = await directoryErrorFrom(error);

    // Assert
    expect(result).toBe(expected);
  });
});

describe('searchResultFromPayload', () => {
  it('should map a full page', () => {
    // Arrange
    const payload = { players: [AMIRA], nextCursor: CURSOR, capped: true };

    // Act
    const page = searchResultFromPayload(payload);

    // Assert
    expect(page).toEqual({ ok: true, players: [AMIRA], nextCursor: CURSOR, capped: true });
  });

  it('should drop malformed rows from an otherwise valid page', () => {
    // Arrange
    const payload = {
      players: [
        AMIRA,
        { name: 'No id', presence: 'visible' },
        { userId: 'u3', name: '', presence: 'visible' },
        { userId: 'u4', name: 'Hidden', presence: 'offline' },
        'not a row',
        null,
        { userId: 'u5', name: 'Sami', presence: 'hidden' },
      ],
      nextCursor: null,
      capped: false,
    };

    // Act
    const page = searchResultFromPayload(payload);

    // Assert
    expect(page).toEqual({
      ok: true,
      players: [AMIRA, { userId: 'u5', name: 'Sami', presence: 'hidden' }],
      nextCursor: null,
      capped: false,
    });
  });

  it.each([
    { scenario: 'a null payload', payload: null },
    { scenario: 'a missing players array', payload: { nextCursor: null, capped: false } },
    { scenario: 'a non-array players field', payload: { players: 'x', nextCursor: null, capped: false } },
    { scenario: 'a numeric nextCursor', payload: { players: [], nextCursor: 5, capped: false } },
    { scenario: 'a non-boolean capped', payload: { players: [], nextCursor: null, capped: 'no' } },
  ])('should refuse $scenario as network', ({ payload }) => {
    // Act
    const page = searchResultFromPayload(payload);

    // Assert
    expect(page).toEqual({ ok: false, reason: 'network' });
  });
});

describe('NakamaDirectoryBackend.search', () => {
  it('should map a successful page without restating the wire shape', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValue({ payload: { players: [AMIRA], nextCursor: CURSOR, capped: false } });

    // Act
    const page = await t.backend.search('  Amira ');

    // Assert
    expect(page).toEqual({ ok: true, players: [AMIRA], nextCursor: CURSOR, capped: false });
  });

  it('should send the normalized query to search_players', async () => {
    // Arrange
    const t = createHarness();

    // Act
    await t.backend.search('  Amira ');

    // Assert
    expect(t.client.rpc).toHaveBeenCalledWith(t.session, 'search_players', { q: 'amira' });
  });

  it('should pass nextCursor back verbatim on the following call', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValueOnce({ payload: { players: [AMIRA], nextCursor: CURSOR, capped: false } });
    const first = await t.backend.search('amira');
    t.client.rpc.mockResolvedValueOnce({ payload: { players: [], nextCursor: null, capped: false } });

    // Act
    await t.backend.search('amira', first.ok ? first.nextCursor : null);

    // Assert
    expect(t.client.rpc).toHaveBeenLastCalledWith(t.session, 'search_players', { q: 'amira', cursor: CURSOR });
  });

  it.each([
    { scenario: 'undefined', cursor: undefined },
    { scenario: 'null', cursor: null },
    { scenario: 'an empty string', cursor: '' },
  ])('should send no cursor when the cursor is $scenario', async ({ cursor }) => {
    // Arrange
    const t = createHarness();

    // Act
    await t.backend.search('amira', cursor);

    // Assert
    expect(t.client.rpc).toHaveBeenCalledWith(t.session, 'search_players', { q: 'amira' });
  });

  it.each([
    { scenario: 'a one-character query', query: 'a' },
    { scenario: 'a blank query', query: '   ' },
    { scenario: 'a folded query over the limit', query: 'a'.repeat(17) },
  ])('should return directory_bad_query without a request for $scenario', async ({ query }) => {
    // Arrange
    const t = createHarness();

    // Act
    const page = await t.backend.search(query);

    // Assert
    expect({ page, requests: t.client.rpc.mock.calls.length, signIns: t.auth.signIn.mock.calls.length }).toEqual({
      page: { ok: false, reason: 'directory_bad_query' },
      requests: 0,
      signIns: 0,
    });
  });

  it('should return network when the sign-in fails', async () => {
    // Arrange
    const t = createHarness();
    t.auth.signIn.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    // Act
    const page = await t.backend.search('amira');

    // Assert
    expect(page).toEqual({ ok: false, reason: 'network' });
  });

  it('should return network when the success payload is malformed', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValue({ payload: { players: [] } });

    // Act
    const page = await t.backend.search('amira');

    // Assert
    expect(page).toEqual({ ok: false, reason: 'network' });
  });

  it.each(DIRECTORY_RPC_ERROR_CODES)('should return %s when the RPC rejects with that message', async (reason) => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockRejectedValue(responseError(400, { code: 3, message: reason }));

    // Act
    const page = await t.backend.search('amira');

    // Assert
    expect(page).toEqual({ ok: false, reason });
  });

  it('should fall back to directory_not_found on a bare 404', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockRejectedValue(responseError(404, { code: 5 }));

    // Act
    const page = await t.backend.search('amira');

    // Assert
    expect(page).toEqual({ ok: false, reason: 'directory_not_found' });
  });
});

describe('NakamaDirectoryBackend.profile', () => {
  const STATS = {
    competitive: { games: 10, wins: 6, chkobbas: 3, currentStreak: 2, bestStreak: 5, updatedAt: 111 },
    practice: { games: 40, wins: 7, chkobbas: 1, updatedAt: 222 },
  };

  it('should map a profile with both stat blocks kept separate', async () => {
    // Arrange
    const t = createHarness();
    const payload = { userId: OTHER_ID, name: 'Amira', presence: 'visible', stats: STATS };
    t.client.rpc.mockResolvedValue({ payload });

    // Act
    const profile = await t.backend.profile(OTHER_ID);

    // Assert
    expect(profile).toEqual({ ok: true, ...payload });
  });

  it('should never sum the competitive and practice blocks', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValue({
      payload: { userId: OTHER_ID, name: 'Amira', presence: 'visible', stats: STATS },
    });

    // Act
    const profile = await t.backend.profile(OTHER_ID);

    // Assert
    expect(profile.ok && [profile.stats.competitive.games, profile.stats.practice.games]).toEqual([10, 40]);
  });

  it('should request get_player_profile with the user id', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValue({
      payload: { userId: OTHER_ID, name: 'Amira', presence: 'visible', stats: STATS },
    });

    // Act
    await t.backend.profile(OTHER_ID);

    // Assert
    expect(t.client.rpc).toHaveBeenCalledWith(t.session, 'get_player_profile', { userId: OTHER_ID });
  });

  it.each([
    { scenario: 'a missing stats block', payload: { userId: OTHER_ID, name: 'Amira', presence: 'visible' } },
    {
      scenario: 'a malformed competitive block',
      payload: {
        userId: OTHER_ID,
        name: 'Amira',
        presence: 'visible',
        stats: { competitive: { games: 1 }, practice: STATS.practice },
      },
    },
    {
      scenario: 'a non-count practice value',
      payload: {
        userId: OTHER_ID,
        name: 'Amira',
        presence: 'visible',
        stats: { competitive: STATS.competitive, practice: { ...STATS.practice, wins: -1 } },
      },
    },
    { scenario: 'a bad presence label', payload: { userId: OTHER_ID, name: 'Amira', presence: 'offline', stats: STATS } },
  ])('should refuse $scenario as network', async ({ payload }) => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValue({ payload });

    // Act
    const profile = await t.backend.profile(OTHER_ID);

    // Assert
    expect(profile).toEqual({ ok: false, reason: 'network' });
  });

  it.each([
    { scenario: 'a blank user id', userId: '   ' },
    { scenario: 'a user id over the limit', userId: 'x'.repeat(MAX_USER_ID_CHARS + 1) },
  ])('should return directory_bad_query without a request for $scenario', async ({ userId }) => {
    // Arrange
    const t = createHarness();

    // Act
    const profile = await t.backend.profile(userId);

    // Assert
    expect({ profile, requests: t.client.rpc.mock.calls.length, signIns: t.auth.signIn.mock.calls.length }).toEqual({
      profile: { ok: false, reason: 'directory_bad_query' },
      requests: 0,
      signIns: 0,
    });
  });

  it('should return network when the sign-in fails', async () => {
    // Arrange
    const t = createHarness();
    t.auth.signIn.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    // Act
    const profile = await t.backend.profile(OTHER_ID);

    // Assert
    expect(profile).toEqual({ ok: false, reason: 'network' });
  });

  it('should return the mapped reason when the RPC rejects', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockRejectedValue(responseError(404, { code: 5, message: 'directory_not_found' }));

    // Act
    const profile = await t.backend.profile(OTHER_ID);

    // Assert
    expect(profile).toEqual({ ok: false, reason: 'directory_not_found' });
  });
});

describe('NakamaDirectoryBackend.setPresenceVisibility', () => {
  it('should map the saved choice', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValue({ payload: { visibility: 'nobody', updatedAt: NOW_MS } });

    // Act
    const result = await t.backend.setPresenceVisibility('nobody');

    // Assert
    expect(result).toEqual({ ok: true, visibility: 'nobody', updatedAt: NOW_MS });
  });

  it('should send the choice to set_presence_visibility', async () => {
    // Arrange
    const t = createHarness();

    // Act
    await t.backend.setPresenceVisibility('everyone');

    // Assert
    expect(t.client.rpc).toHaveBeenCalledWith(t.session, 'set_presence_visibility', { visibility: 'everyone' });
  });

  it.each(DIRECTORY_RPC_ERROR_CODES)('should return %s when the RPC rejects with that message', async (reason) => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockRejectedValue(responseError(400, { code: 3, message: reason }));

    // Act
    const result = await t.backend.setPresenceVisibility('nobody');

    // Assert
    expect(result).toEqual({ ok: false, reason });
  });

  it('should return network when the sign-in fails', async () => {
    // Arrange
    const t = createHarness();
    t.auth.signIn.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    // Act
    const result = await t.backend.setPresenceVisibility('nobody');

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it.each([
    { scenario: 'an unknown visibility', payload: { visibility: 'sometimes', updatedAt: NOW_MS } },
    { scenario: 'a missing updatedAt', payload: { visibility: 'nobody' } },
    { scenario: 'a string updatedAt', payload: { visibility: 'nobody', updatedAt: 'now' } },
    { scenario: 'a null payload', payload: null },
  ])('should refuse $scenario from the response as network', async ({ payload }) => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValue({ payload: payload as object });

    // Act
    const result = await t.backend.setPresenceVisibility('nobody');

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });
});
