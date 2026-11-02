import { Session, type Friend, type User } from '@heroiclabs/nakama-js';

import {
  FRIEND_STATE,
  RECENT_PLAYERS_KEY,
  RECENT_TABLES_MAX,
  SOCIAL_COLLECTION,
  type FriendState,
  type RecentPlayersRecord,
} from '@chkobba/protocol';
import { FIXTURE_USER_ID_HAMZA } from '@chkobba/protocol/testing';

import { NakamaFriendsBackend, type FriendEntry, type FriendsClient, type FriendsSnapshot } from '../friends';
import type { SessionSource } from '../profile';
import {
  GET_USERS_BATCH,
  blockedIdsOf,
  buildRecentPlayerEntries,
  flattenRecentPlayers,
  friendStatesOf,
  loadRecentPlayers,
  parseRecentPlayersRecord,
  type FlatRecentPlayer,
} from '../recentPlayers';

const NOW_SEC = 1_800_000_000;
const SELF_ID = FIXTURE_USER_ID_HAMZA;
const T1 = 1_700_000_000_000;
const T2 = T1 + 60_000;
const T3 = T2 + 60_000;

type FriendsPage = Awaited<ReturnType<FriendsClient['listFriends']>>;
type UsersResult = Awaited<ReturnType<FriendsClient['getUsers']>>;
type StorageResult = Awaited<ReturnType<FriendsClient['readStorageObjects']>>;
type ReadRequest = Parameters<FriendsClient['readStorageObjects']>[1];

const EMPTY_SNAPSHOT: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };

function base64Json(value: object): string {
  return btoa(JSON.stringify(value));
}

/** A real nakama-js Session whose JWT carries `uid` (empty string: no user id). */
function makeSession(userId: string = SELF_ID): Session {
  const token = `h.${base64Json({ uid: userId, usn: 'SELFCD23', exp: NOW_SEC + 3600 })}.s`;
  const refresh = `h.${base64Json({ uid: userId, exp: NOW_SEC + 86_400 })}.s`;
  return new Session(token, refresh, false);
}

function entry(userId: string, state: FriendState): FriendEntry {
  return { userId, displayName: userId, code: null, state, updatedAt: 0 };
}

function snapshotOf(entries: FriendEntry[]): FriendsSnapshot {
  return {
    friends: entries.filter((e) => e.state === FRIEND_STATE.FRIEND),
    outgoing: entries.filter((e) => e.state === FRIEND_STATE.REQUEST_SENT),
    incoming: entries.filter((e) => e.state === FRIEND_STATE.REQUEST_RECEIVED),
    blocked: entries.filter((e) => e.state === FRIEND_STATE.BLOCKED),
  };
}

function flat(userId: string, lastPlayedAt: number, name = `old-${userId}`): FlatRecentPlayer {
  return { userId, name, lastPlayedAt };
}

/** The storage object nakama-js returns (value already parsed to an object). */
function recordObject(value: unknown) {
  return { collection: SOCIAL_COLLECTION, key: RECENT_PLAYERS_KEY, user_id: SELF_ID, value: value as object };
}

interface ClientState {
  /** `readStorageObjects` response; `{}` mimics "no record" (no `objects` key). */
  storage: StorageResult;
  users: User[];
  edges: Partial<Record<FriendState, Friend[]>>;
}

function fakeClient(initial: Partial<ClientState> = {}) {
  const state: ClientState = { storage: {} as StorageResult, users: [], edges: {}, ...initial };
  const client = {
    state,
    readStorageObjects: jest.fn(async (_session: Session, _request: ReadRequest): Promise<StorageResult> => state.storage),
    getUsers: jest.fn(
      async (_session: Session, ids?: string[]): Promise<UsersResult> => ({
        users: state.users.filter((u) => (ids ?? []).includes(u.id ?? '')),
      }),
    ),
    listFriends: jest.fn(
      async (_session: Session, friendState?: number): Promise<FriendsPage> => ({
        friends: state.edges[friendState as FriendState] ?? [],
      }),
    ),
    addFriends: jest.fn(async (): Promise<boolean> => true),
    deleteFriends: jest.fn(async (): Promise<boolean> => true),
    blockFriends: jest.fn(async (_session: Session, ids?: string[]): Promise<boolean> => {
      for (const id of ids ?? []) {
        state.edges[FRIEND_STATE.BLOCKED] = [...(state.edges[FRIEND_STATE.BLOCKED] ?? []), { user: { id }, state: 3 }];
      }
      return true;
    }),
    rpc: jest.fn(async () => ({ id: 'invite_to_table', payload: { sent: true } })),
  };
  return client satisfies FriendsClient;
}

function storedRecord(record: unknown): StorageResult {
  return { objects: [recordObject(record)] } as StorageResult;
}

function fakeAuth(session: Session = makeSession()) {
  const auth = { signIn: jest.fn(async () => ({ session })) };
  return auth satisfies SessionSource;
}

afterEach(() => {
  jest.clearAllMocks();
});

describe('parseRecentPlayersRecord', () => {
  const record: RecentPlayersRecord = {
    tables: [{ endedAt: T2, players: [{ userId: 'u1', name: 'Sami' }] }],
  };

  it('should parse the record when the value is an object', () => {
    // Act
    const parsed = parseRecentPlayersRecord(record);

    // Assert
    expect(parsed).toEqual(record);
  });

  it('should parse the record when the value is a JSON string', () => {
    // Act
    const parsed = parseRecentPlayersRecord(JSON.stringify(record));

    // Assert
    expect(parsed).toEqual(record);
  });

  it.each<[string, unknown]>([
    ['the string is not JSON', '{tables'],
    ['the value is null', null],
    ['the value is a number', 42],
    ['tables is missing', {}],
    ['tables is not an array', { tables: 'u1' }],
  ])('should return an empty record when %s', (_case, value) => {
    // Act
    const parsed = parseRecentPlayersRecord(value);

    // Assert
    expect(parsed).toEqual({ tables: [] });
  });

  it('should skip malformed tables and players but keep the valid ones', () => {
    // Arrange
    const value = {
      tables: [
        { endedAt: 'yesterday', players: [{ userId: 'u1', name: 'A' }] },
        { endedAt: T1 },
        { endedAt: T2, players: [{ userId: '' }, { name: 'no id' }, { userId: 'x'.repeat(129) }, 7, { userId: 'u2' }] },
      ],
    };

    // Act
    const parsed = parseRecentPlayersRecord(value);

    // Assert
    expect(parsed).toEqual({ tables: [{ endedAt: T2, players: [{ userId: 'u2', name: '' }] }] });
  });

  it('should keep at most RECENT_TABLES_MAX tables when the record is longer', () => {
    // Arrange
    const tables = Array.from({ length: RECENT_TABLES_MAX + 5 }, (_, i) => ({
      endedAt: T1 + i,
      players: [{ userId: `u${i}`, name: '' }],
    }));

    // Act
    const parsed = parseRecentPlayersRecord({ tables });

    // Assert
    expect(parsed.tables).toHaveLength(RECENT_TABLES_MAX);
  });
});

describe('flattenRecentPlayers', () => {
  it('should keep one entry per user with the newest game when a user played several tables', () => {
    // Arrange
    const record: RecentPlayersRecord = {
      tables: [
        { endedAt: T1, players: [{ userId: 'u1', name: 'Old name' }] },
        { endedAt: T3, players: [{ userId: 'u1', name: 'New name' }] },
        { endedAt: T2, players: [{ userId: 'u1', name: 'Mid name' }] },
      ],
    };

    // Act
    const players = flattenRecentPlayers(record);

    // Assert
    expect(players).toEqual([{ userId: 'u1', name: 'New name', lastPlayedAt: T3 }]);
  });

  it('should sort users newest first', () => {
    // Arrange
    const record: RecentPlayersRecord = {
      tables: [
        { endedAt: T1, players: [{ userId: 'u1', name: '' }] },
        { endedAt: T3, players: [{ userId: 'u3', name: '' }] },
        { endedAt: T2, players: [{ userId: 'u2', name: '' }] },
      ],
    };

    // Act
    const players = flattenRecentPlayers(record);

    // Assert
    expect(players.map((p) => p.userId)).toEqual(['u3', 'u2', 'u1']);
  });

  it('should drop excluded user ids', () => {
    // Arrange
    const record: RecentPlayersRecord = {
      tables: [{ endedAt: T1, players: [{ userId: 'u1', name: '' }, { userId: 'u2', name: '' }] }],
    };

    // Act
    const players = flattenRecentPlayers(record, new Set(['u1']));

    // Assert
    expect(players.map((p) => p.userId)).toEqual(['u2']);
  });
});

describe('blockedIdsOf and friendStatesOf', () => {
  it('should return only the blocked user ids', () => {
    // Arrange
    const snapshot = snapshotOf([entry('f', FRIEND_STATE.FRIEND), entry('b', FRIEND_STATE.BLOCKED)]);

    // Act
    const blocked = blockedIdsOf(snapshot);

    // Assert
    expect([...blocked]).toEqual(['b']);
  });

  it('should map every user id to its edge state', () => {
    // Arrange
    const snapshot = snapshotOf([
      entry('f', FRIEND_STATE.FRIEND),
      entry('o', FRIEND_STATE.REQUEST_SENT),
      entry('i', FRIEND_STATE.REQUEST_RECEIVED),
      entry('b', FRIEND_STATE.BLOCKED),
    ]);

    // Act
    const states = friendStatesOf(snapshot);

    // Assert
    expect(Object.fromEntries(states)).toEqual({ f: 0, o: 1, i: 2, b: 3 });
  });
});

describe('buildRecentPlayerEntries', () => {
  it('should refresh names from getUsers with the display name, username, stored name, Player chain', () => {
    // Arrange
    const players = [flat('a', T3, 'Stored A'), flat('b', T2, 'Stored B'), flat('c', T1, 'Stored C'), flat('d', T1, ' ')];
    const users: User[] = [
      { id: 'a', display_name: 'Fresh A', username: 'AAAAAAAA' },
      { id: 'b', display_name: '  ', username: 'BBBBBBBB' },
      { id: 'c' },
      { id: 'd' },
    ];

    // Act
    const entries = buildRecentPlayerEntries(players, users, EMPTY_SNAPSHOT);

    // Assert
    expect(entries.map((e) => e.displayName)).toEqual(['Fresh A', 'BBBBBBBB', 'Stored C', 'Player']);
  });

  it('should attach the friend state or null when there is no edge', () => {
    // Arrange
    const players = [flat('f', T3), flat('o', T2), flat('i', T2), flat('n', T1)];
    const users: User[] = ['f', 'o', 'i', 'n'].map((id) => ({ id }));
    const snapshot = snapshotOf([
      entry('f', FRIEND_STATE.FRIEND),
      entry('o', FRIEND_STATE.REQUEST_SENT),
      entry('i', FRIEND_STATE.REQUEST_RECEIVED),
    ]);

    // Act
    const entries = buildRecentPlayerEntries(players, users, snapshot);

    // Assert
    expect(entries.map((e) => [e.userId, e.state])).toEqual([
      ['f', 0],
      ['o', 1],
      ['i', 2],
      ['n', null],
    ]);
  });

  it('should drop a blocked user even when the players were not pre-filtered', () => {
    // Arrange
    const players = [flat('b', T2), flat('ok', T1)];
    const users: User[] = [{ id: 'b' }, { id: 'ok' }];
    const snapshot = snapshotOf([entry('b', FRIEND_STATE.BLOCKED)]);

    // Act
    const entries = buildRecentPlayerEntries(players, users, snapshot);

    // Assert
    expect(entries.map((e) => e.userId)).toEqual(['ok']);
  });

  it('should drop a user that getUsers no longer returns', () => {
    // Arrange
    const players = [flat('deleted', T2), flat('ok', T1)];
    const users: User[] = [{ id: 'ok' }];

    // Act
    const entries = buildRecentPlayerEntries(players, users, EMPTY_SNAPSHOT);

    // Assert
    expect(entries.map((e) => e.userId)).toEqual(['ok']);
  });
});

describe('loadRecentPlayers', () => {
  it('should return an empty list when the response has no objects key', async () => {
    // Arrange
    const client = fakeClient({ storage: {} as StorageResult });

    // Act
    const entries = await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(entries).toEqual([]);
  });

  it('should not call getUsers when there is nobody to show', async () => {
    // Arrange
    const client = fakeClient({ storage: {} as StorageResult });

    // Act
    await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(client.getUsers).not.toHaveBeenCalled();
  });

  it('should read the caller social/recent_players record', async () => {
    // Arrange
    const client = fakeClient();

    // Act
    await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(client.readStorageObjects).toHaveBeenCalledWith(expect.any(Session), {
      object_ids: [{ collection: SOCIAL_COLLECTION, key: RECENT_PLAYERS_KEY, user_id: SELF_ID }],
    });
  });

  it('should return an empty list when the stored record is malformed', async () => {
    // Arrange
    const client = fakeClient({ storage: storedRecord({ tables: 'nope' }), users: [{ id: 'u1' }] });

    // Act
    const entries = await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(entries).toEqual([]);
  });

  it('should return an empty list when the only object is another key', async () => {
    // Arrange
    const storage = {
      objects: [{ collection: SOCIAL_COLLECTION, key: 'invite_limits', user_id: SELF_ID, value: { tables: [] } }],
    } as StorageResult;
    const client = fakeClient({ storage, users: [{ id: 'u1' }] });

    // Act
    const entries = await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(entries).toEqual([]);
  });

  it.each<[string, (record: RecentPlayersRecord) => unknown]>([
    ['an object (nakama-js)', (record) => record],
    ['a JSON string (raw REST)', (record) => JSON.stringify(record)],
  ])('should list the players when the stored value is %s', async (_case, encode) => {
    // Arrange
    const record: RecentPlayersRecord = { tables: [{ endedAt: T1, players: [{ userId: 'u1', name: 'Sami' }] }] };
    const client = fakeClient({ storage: storedRecord(encode(record)), users: [{ id: 'u1', display_name: 'Sami' }] });

    // Act
    const entries = await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(entries).toEqual([{ userId: 'u1', displayName: 'Sami', lastPlayedAt: T1, state: null }]);
  });

  it('should exclude the caller when the record lists them', async () => {
    // Arrange
    const record = { tables: [{ endedAt: T1, players: [{ userId: SELF_ID, name: 'Me' }, { userId: 'u1', name: 'A' }] }] };
    const client = fakeClient({ storage: storedRecord(record), users: [{ id: SELF_ID }, { id: 'u1' }] });

    // Act
    const entries = await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(entries.map((e) => e.userId)).toEqual(['u1']);
  });

  it('should not ask getUsers for blocked users', async () => {
    // Arrange
    const record = { tables: [{ endedAt: T1, players: [{ userId: 'b', name: 'B' }, { userId: 'u1', name: 'A' }] }] };
    const client = fakeClient({ storage: storedRecord(record), users: [{ id: 'b' }, { id: 'u1' }] });
    const snapshot = snapshotOf([entry('b', FRIEND_STATE.BLOCKED)]);

    // Act
    await loadRecentPlayers(client, makeSession(), snapshot);

    // Assert
    expect(client.getUsers).toHaveBeenCalledWith(expect.any(Session), ['u1']);
  });

  /** The largest record the parser keeps: RECENT_TABLES_MAX tables of 8 distinct players (160 users). */
  function bigRecord(): RecentPlayersRecord {
    return {
      tables: Array.from({ length: RECENT_TABLES_MAX }, (_, t) => ({
        endedAt: T1 + RECENT_TABLES_MAX - t,
        players: Array.from({ length: 8 }, (_, p) => ({ userId: `u${t * 8 + p}`, name: '' })),
      })),
    };
  }

  it('should fetch users in batches of GET_USERS_BATCH ids when there are more players than one batch', async () => {
    // Arrange
    const record = bigRecord();
    const ids = record.tables.flatMap((t) => t.players.map((p) => p.userId));
    const client = fakeClient({ storage: storedRecord(record), users: ids.map((id) => ({ id })) });

    // Act
    await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(client.getUsers.mock.calls.map(([, batch]) => batch?.length)).toEqual([
      GET_USERS_BATCH,
      ids.length - GET_USERS_BATCH,
    ]);
  });

  it('should return every player across batches', async () => {
    // Arrange
    const record = bigRecord();
    const ids = record.tables.flatMap((t) => t.players.map((p) => p.userId));
    const client = fakeClient({ storage: storedRecord(record), users: ids.map((id) => ({ id })) });

    // Act
    const entries = await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(entries).toHaveLength(ids.length);
  });

  it('should drop players that getUsers does not return', async () => {
    // Arrange
    const record = { tables: [{ endedAt: T1, players: [{ userId: 'gone', name: 'Gone' }, { userId: 'u1', name: 'A' }] }] };
    const client = fakeClient({ storage: storedRecord(record), users: [{ id: 'u1' }] });

    // Act
    const entries = await loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    expect(entries.map((e) => e.userId)).toEqual(['u1']);
  });

  it('should reject when the session has no user id', async () => {
    // Arrange
    const client = fakeClient();

    // Act
    const result = loadRecentPlayers(client, makeSession(''), EMPTY_SNAPSHOT);

    // Assert
    await expect(result).rejects.toThrow('session has no user id');
  });

  it('should reject when reading storage fails', async () => {
    // Arrange
    const client = fakeClient();
    client.readStorageObjects.mockRejectedValue(new TypeError('Network request failed'));

    // Act
    const result = loadRecentPlayers(client, makeSession(), EMPTY_SNAPSHOT);

    // Assert
    await expect(result).rejects.toThrow('Network request failed');
  });
});

describe('NakamaFriendsBackend.recentPlayers', () => {
  const record: RecentPlayersRecord = {
    tables: [
      { endedAt: T2, players: [{ userId: 'u1', name: 'Sami' }, { userId: 'u2', name: 'Leila' }] },
      { endedAt: T1, players: [{ userId: 'u1', name: 'Sami old' }] },
    ],
  };

  function setup() {
    const client = fakeClient({
      storage: storedRecord(record),
      users: [
        { id: 'u1', display_name: 'Sami B.' },
        { id: 'u2', display_name: 'Leila' },
      ],
      edges: { [FRIEND_STATE.FRIEND]: [{ user: { id: 'u2', username: 'LEILA234', display_name: 'Leila' } }] },
    });
    const backend = new NakamaFriendsBackend({ client, auth: fakeAuth() });
    return { backend, client };
  }

  it('should list players with refreshed names and their friend state', async () => {
    // Arrange
    const { backend } = setup();

    // Act
    const entries = await backend.recentPlayers();

    // Assert
    expect(entries).toEqual([
      { userId: 'u1', displayName: 'Sami B.', lastPlayedAt: T2, state: null },
      { userId: 'u2', displayName: 'Leila', lastPlayedAt: T2, state: FRIEND_STATE.FRIEND },
    ]);
  });

  it('should drop a player right after the caller blocks them', async () => {
    // Arrange
    const { backend } = setup();
    await backend.recentPlayers();
    await backend.block('u1');

    // Act
    const entries = await backend.recentPlayers();

    // Assert
    expect(entries.map((e) => e.userId)).toEqual(['u2']);
  });

  it('should reload the friend list on every call', async () => {
    // Arrange
    const { backend, client } = setup();
    await backend.recentPlayers();
    const callsAfterFirst = client.listFriends.mock.calls.length;

    // Act
    await backend.recentPlayers();

    // Assert
    expect(client.listFriends.mock.calls.length).toBe(callsAfterFirst * 2);
  });
});
