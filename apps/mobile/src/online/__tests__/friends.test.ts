import { Session, type Friend, type User } from '@heroiclabs/nakama-js';

import {
  FRIEND_ERROR_CODES,
  FRIEND_STATE,
  INVITE_RPC_ERROR_CODES,
  type FriendErrorCode,
  type FriendState,
  type InviteRpcErrorCode,
} from '@chkobba/protocol';
import { FIXTURE_FRIEND_CODE, FIXTURE_USER_ID_HAMZA, FIXTURE_USER_ID_SAMI } from '@chkobba/protocol/testing';

import {
  FRIEND_MAX_PAGES,
  FRIEND_PAGE_SIZE,
  NakamaFriendsBackend,
  displayNameOf,
  friendCodeFromInput,
  friendErrorFrom,
  friendErrorFromBody,
  inviteErrorFrom,
  inviteResultFromPayload,
  toFriendEntry,
  toFriendsSnapshot,
  type FriendEntry,
  type FriendsClient,
} from '../friends';
import type { SessionSource } from '../profile';

const NOW_SEC = 1_800_000_000;
/** The caller (the session's user). */
const SELF_ID = FIXTURE_USER_ID_HAMZA;
/** The caller's own friend code (their username). */
const SELF_CODE = 'SELFCD23';
const OTHER_ID = FIXTURE_USER_ID_SAMI;
const ROOM_CODE = 'ABCD23';

type FriendsPage = Awaited<ReturnType<FriendsClient['listFriends']>>;
type UsersResult = Awaited<ReturnType<FriendsClient['getUsers']>>;
type RpcResult = Awaited<ReturnType<FriendsClient['rpc']>>;
type StorageResult = Awaited<ReturnType<FriendsClient['readStorageObjects']>>;

function base64Json(value: object): string {
  return btoa(JSON.stringify(value));
}

/** A real nakama-js Session whose JWT carries `uid` and `usn`. */
function makeSession(userId: string = SELF_ID, username: string = SELF_CODE): Session {
  const token = `h.${base64Json({ uid: userId, usn: username, exp: NOW_SEC + 3600 })}.s`;
  const refresh = `h.${base64Json({ uid: userId, exp: NOW_SEC + 86_400 })}.s`;
  return new Session(token, refresh, false);
}

/** A nakama-js rejection: the raw fetch Response with the server's `{ code, message }` JSON body. */
function responseError(status: number, code: number, message: string) {
  return { status, statusText: `HTTP ${status}`, json: async () => ({ code, message }) };
}

/** HTTP status and gRPC code the before-AddFriends hook uses for each error (pinned live contract). */
function friendErrorStatus(reason: FriendErrorCode): { status: number; code: number } {
  return reason === 'friend_bad_request' ? { status: 400, code: 3 } : { status: 429, code: 8 };
}

/** HTTP status (grpc-gateway mapping) and gRPC code `invite_to_table` uses for each error. */
const INVITE_ERROR_STATUS: Record<InviteRpcErrorCode, { status: number; code: number }> = {
  invite_bad_request: { status: 400, code: 3 },
  invite_not_friend: { status: 400, code: 9 },
  invite_not_member: { status: 403, code: 7 },
  invite_room_not_found: { status: 404, code: 5 },
  invite_rate_limited: { status: 429, code: 8 },
};

function user(id: string, username: string, displayName?: string): User {
  return displayName === undefined ? { id, username } : { id, username, display_name: displayName };
}

/** An edge as Nakama sends it: proto3 leaves out state 0 (FRIEND). */
function edge(u: User, state: FriendState): Friend {
  return state === FRIEND_STATE.FRIEND ? { user: u } : { user: u, state };
}

/** Pages chained with `page-N` cursors; the last page has no cursor. */
function pages(...lists: Friend[][]): FriendsPage[] {
  return lists.map((friends, i) => (i < lists.length - 1 ? { friends, cursor: `page-${i + 1}` } : { friends }));
}

interface ClientState {
  /** Pages per requested state; a state without pages returns `{}`. */
  edges: Partial<Record<FriendState, FriendsPage[]>>;
  users: User[];
}

function fakeClient(initial: Partial<ClientState> = {}) {
  const state: ClientState = { edges: {}, users: [], ...initial };
  const client = {
    state,
    listFriends: jest.fn(
      async (_session: Session, friendState?: number, _limit?: number, cursor?: string): Promise<FriendsPage> => {
        const list = state.edges[friendState as FriendState] ?? [];
        const index = cursor === undefined ? 0 : Number(cursor.slice('page-'.length));
        return list[index] ?? {};
      },
    ),
    getUsers: jest.fn(
      async (_session: Session, ids?: string[], usernames?: string[]): Promise<UsersResult> => ({
        users: state.users.filter(
          (u) => (ids ?? []).includes(u.id ?? '') || (usernames ?? []).includes(u.username ?? ''),
        ),
      }),
    ),
    addFriends: jest.fn(async (_session: Session, _ids?: string[]): Promise<boolean> => true),
    deleteFriends: jest.fn(async (_session: Session, _ids?: string[]): Promise<boolean> => true),
    blockFriends: jest.fn(async (_session: Session, _ids?: string[]): Promise<boolean> => true),
    readStorageObjects: jest.fn(async (): Promise<StorageResult> => ({}) as StorageResult),
    rpc: jest.fn(async (_session: Session, _id: string, _input: object): Promise<RpcResult> => ({
      id: 'invite_to_table',
      payload: { sent: true },
    })),
  };
  return client satisfies FriendsClient;
}

function fakeAuth(session: Session = makeSession()) {
  const auth = { signIn: jest.fn(async () => ({ session })) };
  return auth satisfies SessionSource;
}

function failingAuth() {
  const auth = { signIn: jest.fn(async (): Promise<{ session: Session }> => Promise.reject(new TypeError('offline'))) };
  return auth satisfies SessionSource;
}

function createBackend(
  client: ReturnType<typeof fakeClient> = fakeClient(),
  auth: SessionSource & { signIn: jest.Mock } = fakeAuth(),
) {
  const backend = new NakamaFriendsBackend({ client, auth });
  return { backend, client, auth };
}

function entry(userId: string, state: FriendState, displayName = userId): FriendEntry {
  return { userId, displayName, code: null, state, updatedAt: 0 };
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('displayNameOf', () => {
  it.each([
    { scenario: 'a display name is set', displayName: 'Hamza', username: SELF_CODE, expected: 'Hamza' },
    { scenario: 'the display name has padding', displayName: '  Hamza ', username: SELF_CODE, expected: 'Hamza' },
    { scenario: 'the display name is blank', displayName: '   ', username: SELF_CODE, expected: SELF_CODE },
    { scenario: 'the display name is missing', displayName: undefined, username: SELF_CODE, expected: SELF_CODE },
    { scenario: 'both are missing', displayName: undefined, username: undefined, expected: 'Player' },
    { scenario: 'both are blank', displayName: '', username: ' ', expected: 'Player' },
    { scenario: 'both are non-strings', displayName: 42, username: null, expected: 'Player' },
  ])('should return $expected when $scenario', ({ displayName, username, expected }) => {
    // Act
    const name = displayNameOf(displayName, username);

    // Assert
    expect(name).toBe(expected);
  });
});

describe('toFriendEntry', () => {
  it('should read a missing state as FRIEND when Nakama leaves out proto3 zero', () => {
    // Arrange
    const friend: Friend = { user: user(OTHER_ID, FIXTURE_FRIEND_CODE, 'Sami') };

    // Act
    const result = toFriendEntry(friend);

    // Assert
    expect(result).toEqual({
      userId: OTHER_ID,
      displayName: 'Sami',
      code: FIXTURE_FRIEND_CODE,
      state: FRIEND_STATE.FRIEND,
      updatedAt: 0,
    });
  });

  it.each([FRIEND_STATE.REQUEST_SENT, FRIEND_STATE.REQUEST_RECEIVED, FRIEND_STATE.BLOCKED])(
    'should keep state %i when it is a known edge state',
    (state) => {
      // Arrange
      const friend: Friend = { user: user(OTHER_ID, FIXTURE_FRIEND_CODE), state };

      // Act
      const result = toFriendEntry(friend);

      // Assert
      expect(result?.state).toBe(state);
    },
  );

  it('should return null when the state is unknown', () => {
    // Arrange
    const friend: Friend = { user: user(OTHER_ID, FIXTURE_FRIEND_CODE), state: 7 };

    // Act
    const result = toFriendEntry(friend);

    // Assert
    expect(result).toBeNull();
  });

  it.each<[string, Friend]>([
    ['there is no user', {}],
    ['the user has no id', { user: { username: FIXTURE_FRIEND_CODE } }],
    ['the user id is empty', { user: { id: '', username: FIXTURE_FRIEND_CODE } }],
  ])('should return null when %s', (_case, friend) => {
    // Act
    const result = toFriendEntry(friend);

    // Assert
    expect(result).toBeNull();
  });

  it('should set code to null when the username is not a friend code', () => {
    // Arrange
    const friend: Friend = { user: user(OTHER_ID, 'legacy-guest-name') };

    // Act
    const result = toFriendEntry(friend);

    // Assert
    expect(result?.code).toBeNull();
  });

  it('should fall back to the username when the user has no display name', () => {
    // Arrange
    const friend: Friend = { user: user(OTHER_ID, FIXTURE_FRIEND_CODE) };

    // Act
    const result = toFriendEntry(friend);

    // Assert
    expect(result?.displayName).toBe(FIXTURE_FRIEND_CODE);
  });

  it('should read update_time as epoch ms when a later nakama-js passes it through', () => {
    // Arrange
    const friend = { user: user(OTHER_ID, FIXTURE_FRIEND_CODE), update_time: '2026-10-30T12:00:00Z' } as Friend;

    // Act
    const result = toFriendEntry(friend);

    // Assert
    expect(result?.updatedAt).toBe(Date.parse('2026-10-30T12:00:00Z'));
  });
});

describe('toFriendsSnapshot', () => {
  it('should split entries by state', () => {
    // Arrange
    const entries = [
      entry('a', FRIEND_STATE.FRIEND),
      entry('b', FRIEND_STATE.REQUEST_SENT),
      entry('c', FRIEND_STATE.REQUEST_RECEIVED),
      entry('d', FRIEND_STATE.BLOCKED),
    ];

    // Act
    const snapshot = toFriendsSnapshot(entries);

    // Assert
    expect(snapshot).toEqual({
      friends: [entries[0]],
      outgoing: [entries[1]],
      incoming: [entries[2]],
      blocked: [entries[3]],
    });
  });

  it('should keep the first entry when a user id appears twice', () => {
    // Arrange
    const entries = [entry('a', FRIEND_STATE.FRIEND, 'First'), entry('a', FRIEND_STATE.BLOCKED, 'Second')];

    // Act
    const snapshot = toFriendsSnapshot(entries);

    // Assert
    expect(snapshot).toEqual({ friends: [entries[0]], outgoing: [], incoming: [], blocked: [] });
  });
});

describe('NakamaFriendsBackend.list', () => {
  it('should put each edge in the list for its state', async () => {
    // Arrange
    const client = fakeClient({
      edges: {
        [FRIEND_STATE.FRIEND]: pages([edge(user('f1', 'FFFFFFFF', 'Friend'), FRIEND_STATE.FRIEND)]),
        [FRIEND_STATE.REQUEST_SENT]: pages([edge(user('o1', 'OOOOOOOO'), FRIEND_STATE.REQUEST_SENT)]),
        [FRIEND_STATE.REQUEST_RECEIVED]: pages([edge(user('i1', 'AAAAAAAA'), FRIEND_STATE.REQUEST_RECEIVED)]),
        [FRIEND_STATE.BLOCKED]: pages([edge(user('b1', 'BBBBBBBB'), FRIEND_STATE.BLOCKED)]),
      },
    });
    const { backend } = createBackend(client);

    // Act
    const snapshot = await backend.list();

    // Assert
    expect({
      friends: snapshot.friends.map((e) => e.userId),
      outgoing: snapshot.outgoing.map((e) => e.userId),
      incoming: snapshot.incoming.map((e) => e.userId),
      blocked: snapshot.blocked.map((e) => e.userId),
    }).toEqual({ friends: ['f1'], outgoing: ['o1'], incoming: ['i1'], blocked: ['b1'] });
  });

  it('should treat an edge without a state as a friend when listing state 0', async () => {
    // Arrange
    const client = fakeClient({ edges: { [FRIEND_STATE.FRIEND]: pages([{ user: user('f1', 'FFFFFFFF') }]) } });
    const { backend } = createBackend(client);

    // Act
    const snapshot = await backend.list();

    // Assert
    expect(snapshot.friends.map((e) => e.userId)).toEqual(['f1']);
  });

  it('should follow cursors and collect every page when the list spans several pages', async () => {
    // Arrange
    const client = fakeClient({
      edges: {
        [FRIEND_STATE.FRIEND]: pages(
          [edge(user('f1', 'FFFFFFFF'), FRIEND_STATE.FRIEND)],
          [edge(user('f2', 'GGGGGGGG'), FRIEND_STATE.FRIEND)],
          [edge(user('f3', 'HHHHHHHH'), FRIEND_STATE.FRIEND)],
        ),
      },
    });
    const { backend } = createBackend(client);

    // Act
    const snapshot = await backend.list();

    // Assert
    expect(snapshot.friends.map((e) => e.userId)).toEqual(['f1', 'f2', 'f3']);
  });

  it('should pass the state, page size and previous cursor when fetching the next page', async () => {
    // Arrange
    const client = fakeClient({
      edges: {
        [FRIEND_STATE.FRIEND]: pages(
          [edge(user('f1', 'FFFFFFFF'), FRIEND_STATE.FRIEND)],
          [edge(user('f2', 'GGGGGGGG'), FRIEND_STATE.FRIEND)],
        ),
      },
    });
    const { backend } = createBackend(client);

    // Act
    await backend.list();

    // Assert
    expect(client.listFriends).toHaveBeenCalledWith(expect.any(Session), FRIEND_STATE.FRIEND, FRIEND_PAGE_SIZE, 'page-1');
  });

  it('should treat an empty-string cursor as the last page', async () => {
    // Arrange
    const client = fakeClient({
      edges: { [FRIEND_STATE.FRIEND]: [{ friends: [edge(user('f1', 'FFFFFFFF'), FRIEND_STATE.FRIEND)], cursor: '' }] },
    });
    const { backend } = createBackend(client);

    // Act
    await backend.list();

    // Assert
    const friendCalls = client.listFriends.mock.calls.filter(([, state]) => state === FRIEND_STATE.FRIEND);
    expect(friendCalls).toHaveLength(1);
  });

  it('should stop after FRIEND_MAX_PAGES when the cursor never ends', async () => {
    // Arrange
    const client = fakeClient();
    client.listFriends.mockImplementation(async (_session, state) =>
      state === FRIEND_STATE.FRIEND ? { friends: [], cursor: 'forever' } : {},
    );
    const { backend } = createBackend(client);

    // Act
    await backend.list();

    // Assert
    const friendCalls = client.listFriends.mock.calls.filter(([, state]) => state === FRIEND_STATE.FRIEND);
    expect(friendCalls).toHaveLength(FRIEND_MAX_PAGES);
  });

  it('should drop edges in another state when the server ignores the state filter', async () => {
    // Arrange
    const client = fakeClient({
      edges: {
        [FRIEND_STATE.FRIEND]: pages([
          edge(user('f1', 'FFFFFFFF'), FRIEND_STATE.FRIEND),
          edge(user('b1', 'BBBBBBBB'), FRIEND_STATE.BLOCKED),
        ]),
      },
    });
    const { backend } = createBackend(client);

    // Act
    const snapshot = await backend.list();

    // Assert
    expect(snapshot).toEqual({
      friends: [expect.objectContaining({ userId: 'f1' })],
      outgoing: [],
      incoming: [],
      blocked: [],
    });
  });

  it('should list a user once when the same user comes back on two pages', async () => {
    // Arrange
    const client = fakeClient({
      edges: {
        [FRIEND_STATE.FRIEND]: pages(
          [edge(user('f1', 'FFFFFFFF'), FRIEND_STATE.FRIEND)],
          [edge(user('f1', 'FFFFFFFF'), FRIEND_STATE.FRIEND)],
        ),
      },
    });
    const { backend } = createBackend(client);

    // Act
    const snapshot = await backend.list();

    // Assert
    expect(snapshot.friends).toHaveLength(1);
  });

  it('should drop edges with an unknown state or no user id', async () => {
    // Arrange
    const client = fakeClient({
      edges: { [FRIEND_STATE.FRIEND]: pages([{ user: { username: 'NOIDNOID' } }, { user: user('x', 'XXXXXXXX'), state: 9 }]) },
    });
    const { backend } = createBackend(client);

    // Act
    const snapshot = await backend.list();

    // Assert
    expect(snapshot.friends).toEqual([]);
  });

  it('should reject when listFriends fails', async () => {
    // Arrange
    const client = fakeClient();
    client.listFriends.mockRejectedValue(new TypeError('Network request failed'));
    const { backend } = createBackend(client);

    // Act
    const result = backend.list();

    // Assert
    await expect(result).rejects.toThrow('Network request failed');
  });
});

describe('friendCodeFromInput', () => {
  it.each([
    { scenario: 'an exact code', input: FIXTURE_FRIEND_CODE, expected: FIXTURE_FRIEND_CODE },
    { scenario: 'a lowercase code', input: 'k7m2qxab', expected: FIXTURE_FRIEND_CODE },
    { scenario: 'a dashed lowercase code', input: 'k7m2-qxab', expected: FIXTURE_FRIEND_CODE },
    { scenario: 'a pasted code with spaces and a newline', input: ' K7M2 QXAB\n', expected: FIXTURE_FRIEND_CODE },
    { scenario: 'a code that is too short', input: 'K7M2QXA', expected: null },
    { scenario: 'a code with a forbidden symbol', input: 'K7M2QXA0', expected: null },
    { scenario: 'an empty input', input: '', expected: null },
    { scenario: 'an input longer than 32 characters', input: `${'-'.repeat(30)}K7M2QXAB`, expected: null },
  ])('should return $expected for $scenario', ({ input, expected }) => {
    // Act
    const code = friendCodeFromInput(input);

    // Assert
    expect(code).toBe(expected);
  });
});

describe('NakamaFriendsBackend.lookupCode', () => {
  it('should return bad_code without a request when the code is malformed', async () => {
    // Arrange
    const { backend } = createBackend();

    // Act
    const result = await backend.lookupCode('NOPE');

    // Assert
    expect(result).toEqual({ ok: false, reason: 'bad_code' });
  });

  it('should not sign in or call getUsers when the code is malformed', async () => {
    // Arrange
    const { backend, client, auth } = createBackend();

    // Act
    await backend.lookupCode('NOPE');

    // Assert
    expect([auth.signIn.mock.calls.length, client.getUsers.mock.calls.length]).toEqual([0, 0]);
  });

  it('should look the user up by the normalized username when the input is lowercase and dashed', async () => {
    // Arrange
    const client = fakeClient({ users: [user(OTHER_ID, FIXTURE_FRIEND_CODE, 'Sami')] });
    const { backend } = createBackend(client);

    // Act
    await backend.lookupCode('k7m2-qxab');

    // Assert
    expect(client.getUsers).toHaveBeenCalledWith(expect.any(Session), undefined, [FIXTURE_FRIEND_CODE]);
  });

  it('should return the user when the code matches a username', async () => {
    // Arrange
    const client = fakeClient({ users: [user(OTHER_ID, FIXTURE_FRIEND_CODE, 'Sami')] });
    const { backend } = createBackend(client);

    // Act
    const result = await backend.lookupCode('k7m2-qxab');

    // Assert
    expect(result).toEqual({ ok: true, userId: OTHER_ID, displayName: 'Sami', self: false });
  });

  it('should fall back to the username as the name when the user has no display name', async () => {
    // Arrange
    const client = fakeClient({ users: [user(OTHER_ID, FIXTURE_FRIEND_CODE)] });
    const { backend } = createBackend(client);

    // Act
    const result = await backend.lookupCode(FIXTURE_FRIEND_CODE);

    // Assert
    expect(result).toMatchObject({ ok: true, displayName: FIXTURE_FRIEND_CODE });
  });

  it('should return not_found when no user has that username', async () => {
    // Arrange
    const { backend } = createBackend(fakeClient({ users: [] }));

    // Act
    const result = await backend.lookupCode(FIXTURE_FRIEND_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('should return not_found when getUsers returns a user whose username is not exactly the code', async () => {
    // Arrange
    const client = fakeClient();
    client.getUsers.mockResolvedValue({ users: [user(OTHER_ID, FIXTURE_FRIEND_CODE.toLowerCase())] });
    const { backend } = createBackend(client);

    // Act
    const result = await backend.lookupCode(FIXTURE_FRIEND_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('should return not_found when getUsers has no users key', async () => {
    // Arrange
    const client = fakeClient();
    client.getUsers.mockResolvedValue({});
    const { backend } = createBackend(client);

    // Act
    const result = await backend.lookupCode(FIXTURE_FRIEND_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('should flag self when the found user id is the caller', async () => {
    // Arrange
    const client = fakeClient({ users: [user(SELF_ID, FIXTURE_FRIEND_CODE, 'Hamza')] });
    const { backend } = createBackend(client, fakeAuth(makeSession(SELF_ID, 'other-name')));

    // Act
    const result = await backend.lookupCode(FIXTURE_FRIEND_CODE);

    // Assert
    expect(result).toMatchObject({ ok: true, self: true });
  });

  it('should flag self when the code is the caller username', async () => {
    // Arrange
    const client = fakeClient({ users: [user(OTHER_ID, SELF_CODE)] });
    const { backend } = createBackend(client, fakeAuth(makeSession(SELF_ID, SELF_CODE.toLowerCase())));

    // Act
    const result = await backend.lookupCode(SELF_CODE);

    // Assert
    expect(result).toMatchObject({ ok: true, self: true });
  });

  it('should return network when getUsers rejects', async () => {
    // Arrange
    const client = fakeClient();
    client.getUsers.mockRejectedValue(new TypeError('Network request failed'));
    const { backend } = createBackend(client);

    // Act
    const result = await backend.lookupCode(FIXTURE_FRIEND_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it('should return network when signing in fails', async () => {
    // Arrange
    const { backend } = createBackend(fakeClient(), failingAuth());

    // Act
    const result = await backend.lookupCode(FIXTURE_FRIEND_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });
});

describe('friendErrorFromBody', () => {
  it.each(FRIEND_ERROR_CODES)('should return %s when the hook rejects with that message', (reason) => {
    // Arrange
    const { status, code } = friendErrorStatus(reason);

    // Act
    const result = friendErrorFromBody(status, { code, message: reason });

    // Assert
    expect(result).toBe(reason);
  });

  it.each([
    { scenario: "Nakama's no valid target 400", status: 400, body: { code: 3, message: 'No valid ID or username was provided.' }, expected: 'not_found' },
    { scenario: 'a 404', status: 404, body: { code: 5, message: 'User not found.' }, expected: 'not_found' },
    { scenario: 'another 400', status: 400, body: { code: 3, message: 'Something else.' }, expected: 'network' },
    { scenario: 'a 401', status: 401, body: { code: 16, message: 'Auth token invalid' }, expected: 'network' },
    { scenario: 'a 500', status: 500, body: { code: 13, message: 'Internal error' }, expected: 'network' },
    { scenario: 'a 503 with no body', status: 503, body: null, expected: 'network' },
    { scenario: 'a body whose message is not a string', status: 400, body: { message: 3 }, expected: 'network' },
  ])('should return $expected for $scenario', ({ status, body, expected }) => {
    // Act
    const result = friendErrorFromBody(status, body);

    // Assert
    expect(result).toBe(expected);
  });
});

describe('friendErrorFrom', () => {
  it('should return network when the rejection is not a Response', async () => {
    // Act
    const result = await friendErrorFrom(new TypeError('Network request failed'));

    // Assert
    expect(result).toBe('network');
  });

  it('should return network when the Response body cannot be read', async () => {
    // Arrange
    const error = { status: 400, json: async () => Promise.reject(new SyntaxError('Unexpected token')) };

    // Act
    const result = await friendErrorFrom(error);

    // Assert
    expect(result).toBe('network');
  });

  it('should return not_found when the unreadable Response is a 404', async () => {
    // Arrange
    const error = { status: 404, json: async () => Promise.reject(new SyntaxError('Unexpected token')) };

    // Act
    const result = await friendErrorFrom(error);

    // Assert
    expect(result).toBe('not_found');
  });
});

describe('NakamaFriendsBackend.add', () => {
  it('should return ok when AddFriends succeeds', async () => {
    // Arrange
    const { backend } = createBackend();

    // Act
    const result = await backend.add(OTHER_ID);

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should send the user id to AddFriends when adding by id', async () => {
    // Arrange
    const { backend, client } = createBackend();

    // Act
    await backend.add(OTHER_ID);

    // Assert
    expect(client.addFriends).toHaveBeenCalledWith(expect.any(Session), [OTHER_ID]);
  });

  it.each(FRIEND_ERROR_CODES)('should return %s when the hook rejects with that error', async (reason) => {
    // Arrange
    const { status, code } = friendErrorStatus(reason);
    const client = fakeClient();
    client.addFriends.mockRejectedValue(responseError(status, code, reason));
    const { backend } = createBackend(client);

    // Act
    const result = await backend.add(OTHER_ID);

    // Assert
    expect(result).toEqual({ ok: false, reason });
  });

  it.each([
    { scenario: "Nakama's no valid target 400", error: responseError(400, 3, 'No valid ID or username was provided.'), expected: 'not_found' },
    { scenario: 'a 401', error: responseError(401, 16, 'Auth token invalid'), expected: 'network' },
    { scenario: 'a 500', error: responseError(500, 13, 'Internal error'), expected: 'network' },
    { scenario: 'a 502', error: responseError(502, 14, 'Bad gateway'), expected: 'network' },
    { scenario: 'a non-Response rejection', error: new TypeError('Network request failed'), expected: 'network' },
  ])('should return $expected when AddFriends rejects with $scenario', async ({ error, expected }) => {
    // Arrange
    const client = fakeClient();
    client.addFriends.mockRejectedValue(error);
    const { backend } = createBackend(client);

    // Act
    const result = await backend.add(OTHER_ID);

    // Assert
    expect(result).toEqual({ ok: false, reason: expected });
  });

  it('should return not_found without a request when the id is the caller', async () => {
    // Arrange
    const { backend, client } = createBackend();

    // Act
    const result = await backend.add(SELF_ID);

    // Assert
    expect({ result, calls: client.addFriends.mock.calls.length }).toEqual({
      result: { ok: false, reason: 'not_found' },
      calls: 0,
    });
  });

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['longer than 128 characters', 'x'.repeat(129)],
  ])('should return not_found without signing in when the id is %s', async (_case, id) => {
    // Arrange
    const { backend, auth } = createBackend();

    // Act
    const result = await backend.add(id);

    // Assert
    expect({ result, signIns: auth.signIn.mock.calls.length }).toEqual({
      result: { ok: false, reason: 'not_found' },
      signIns: 0,
    });
  });

  it('should return network when signing in fails', async () => {
    // Arrange
    const { backend } = createBackend(fakeClient(), failingAuth());

    // Act
    const result = await backend.add(OTHER_ID);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });
});

describe('NakamaFriendsBackend.remove', () => {
  it('should send the user id to DeleteFriends and return ok', async () => {
    // Arrange
    const { backend, client } = createBackend();

    // Act
    const result = await backend.remove(OTHER_ID);

    // Assert
    expect({ result, args: client.deleteFriends.mock.calls[0]?.[1] }).toEqual({ result: { ok: true }, args: [OTHER_ID] });
  });

  it('should return not_found without a request when the id is the caller', async () => {
    // Arrange
    const { backend, client } = createBackend();

    // Act
    const result = await backend.remove(SELF_ID);

    // Assert
    expect({ result, calls: client.deleteFriends.mock.calls.length }).toEqual({
      result: { ok: false, reason: 'not_found' },
      calls: 0,
    });
  });

  it('should return network when DeleteFriends rejects with a 500', async () => {
    // Arrange
    const client = fakeClient();
    client.deleteFriends.mockRejectedValue(responseError(500, 13, 'Internal error'));
    const { backend } = createBackend(client);

    // Act
    const result = await backend.remove(OTHER_ID);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });
});

describe('NakamaFriendsBackend.block', () => {
  it('should send the user id to BlockFriends and return ok', async () => {
    // Arrange
    const { backend, client } = createBackend();

    // Act
    const result = await backend.block(OTHER_ID);

    // Assert
    expect({ result, args: client.blockFriends.mock.calls[0]?.[1] }).toEqual({ result: { ok: true }, args: [OTHER_ID] });
  });

  it('should return not_found without a request when the id is the caller', async () => {
    // Arrange
    const { backend, client } = createBackend();

    // Act
    const result = await backend.block(SELF_ID);

    // Assert
    expect({ result, calls: client.blockFriends.mock.calls.length }).toEqual({
      result: { ok: false, reason: 'not_found' },
      calls: 0,
    });
  });

  it('should return not_found when BlockFriends rejects with no valid target', async () => {
    // Arrange
    const client = fakeClient();
    client.blockFriends.mockRejectedValue(responseError(400, 3, 'No valid ID or username was provided.'));
    const { backend } = createBackend(client);

    // Act
    const result = await backend.block(OTHER_ID);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });
});

describe('inviteResultFromPayload', () => {
  it.each<[string, unknown, unknown]>([
    ['sent is true', { sent: true }, { ok: true, sent: true }],
    ['sent is false', { sent: false }, { ok: true, sent: false }],
    ['sent is a string', { sent: 'yes' }, { ok: false, reason: 'network' }],
    ['sent is missing', {}, { ok: false, reason: 'network' }],
    ['the payload is undefined', undefined, { ok: false, reason: 'network' }],
    ['the payload is null', null, { ok: false, reason: 'network' }],
  ])('should map the payload when %s', (_case, payload, expected) => {
    // Act
    const result = inviteResultFromPayload(payload);

    // Assert
    expect(result).toEqual(expected);
  });
});

describe('inviteErrorFrom', () => {
  it('should return network when the rejection is not a Response', async () => {
    // Act
    const result = await inviteErrorFrom(new TypeError('Network request failed'));

    // Assert
    expect(result).toBe('network');
  });

  it('should return network when the message is not an invite error', async () => {
    // Act
    const result = await inviteErrorFrom(responseError(400, 3, 'friend_bad_request'));

    // Assert
    expect(result).toBe('network');
  });
});

describe('NakamaFriendsBackend.invite', () => {
  it('should return sent true when the RPC sends the invite', async () => {
    // Arrange
    const { backend } = createBackend();

    // Act
    const result = await backend.invite(OTHER_ID, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: true, sent: true });
  });

  it('should return sent false when an invite is already pending', async () => {
    // Arrange
    const client = fakeClient();
    client.rpc.mockResolvedValue({ id: 'invite_to_table', payload: { sent: false } });
    const { backend } = createBackend(client);

    // Act
    const result = await backend.invite(OTHER_ID, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: true, sent: false });
  });

  it('should call invite_to_table with the user id and the normalized room code', async () => {
    // Arrange
    const { backend, client } = createBackend();

    // Act
    await backend.invite(OTHER_ID, 'abcd-23');

    // Assert
    expect(client.rpc).toHaveBeenCalledWith(expect.any(Session), 'invite_to_table', { userId: OTHER_ID, code: ROOM_CODE });
  });

  it('should return network when the success payload is malformed', async () => {
    // Arrange
    const client = fakeClient();
    client.rpc.mockResolvedValue({ id: 'invite_to_table' });
    const { backend } = createBackend(client);

    // Act
    const result = await backend.invite(OTHER_ID, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it.each(INVITE_RPC_ERROR_CODES)('should return %s when the RPC rejects with that error', async (reason) => {
    // Arrange
    const { status, code } = INVITE_ERROR_STATUS[reason];
    const client = fakeClient();
    client.rpc.mockRejectedValue(responseError(status, code, reason));
    const { backend } = createBackend(client);

    // Act
    const result = await backend.invite(OTHER_ID, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason });
  });

  it.each([
    { scenario: 'an unknown message', error: responseError(500, 13, 'Internal error') },
    { scenario: 'a 401', error: responseError(401, 16, 'Auth token invalid') },
    { scenario: 'a non-Response rejection', error: new TypeError('Network request failed') },
  ])('should return network when the RPC rejects with $scenario', async ({ error }) => {
    // Arrange
    const client = fakeClient();
    client.rpc.mockRejectedValue(error);
    const { backend } = createBackend(client);

    // Act
    const result = await backend.invite(OTHER_ID, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });

  it.each([
    { scenario: 'the user id is empty', userId: '', roomCode: ROOM_CODE },
    { scenario: 'the user id is too long', userId: 'x'.repeat(129), roomCode: ROOM_CODE },
    { scenario: 'the room code is too short', userId: OTHER_ID, roomCode: 'ABC' },
    { scenario: 'the room code has a forbidden symbol', userId: OTHER_ID, roomCode: 'ABCD20' },
  ])('should return invite_bad_request without a request when $scenario', async ({ userId, roomCode }) => {
    // Arrange
    const { backend, client, auth } = createBackend();

    // Act
    const result = await backend.invite(userId, roomCode);

    // Assert
    expect({ result, rpcs: client.rpc.mock.calls.length, signIns: auth.signIn.mock.calls.length }).toEqual({
      result: { ok: false, reason: 'invite_bad_request' },
      rpcs: 0,
      signIns: 0,
    });
  });

  it('should return network when signing in fails', async () => {
    // Arrange
    const { backend } = createBackend(fakeClient(), failingAuth());

    // Act
    const result = await backend.invite(OTHER_ID, ROOM_CODE);

    // Assert
    expect(result).toEqual({ ok: false, reason: 'network' });
  });
});
