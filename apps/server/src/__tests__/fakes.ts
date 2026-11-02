/**
 * Fake Nakama boundary for adapter tests (match handler and RPCs). Only the
 * members the module touches are implemented; each fake is a `vi.fn()` so
 * tests can inspect calls, and is cast to the (huge) nkruntime interface.
 * Never imported by `main.ts`, so it never reaches the goja bundle.
 */
import { vi } from 'vitest';

/** Fixed table seed returned by the fake `nk.uuidv4`, so every shuffle replays. */
export const FAKE_SEED = 'adapter-test-seed';

/**
 * UTF-8 encode/decode without TextEncoder/TextDecoder: the server tsconfig
 * targets plain ES2017 (no DOM or Node types), matching the goja runtime.
 */
function utf8Encode(text: string): ArrayBuffer {
  const binary = unescape(encodeURIComponent(text));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function utf8Decode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return decodeURIComponent(escape(binary));
}

export function createFakeLogger() {
  const fns = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return fns as typeof fns & nkruntime.Logger;
}

/** The account fields the fakes track; everything else in `nkruntime.User` gets a fixed default. */
export interface FakeAccount {
  username: string;
  displayName: string;
}

function fakeUser(userId: string, account: FakeAccount): nkruntime.User {
  return {
    userId,
    username: account.username,
    displayName: account.displayName,
    avatarUrl: '',
    langTag: 'en',
    location: '',
    timezone: '',
    appleId: '',
    facebookId: '',
    facebookInstantGameId: '',
    googleId: '',
    gamecenterId: '',
    steamId: '',
    online: false,
    edgeCount: 0,
    createTime: 0,
    updateTime: 0,
    metadata: {},
  };
}

function storageKey(collection: string, key: string, userId: string | undefined): string {
  return `${collection}/${key}/${userId ?? ''}`;
}

/** Message of the error the memory store throws when a versioned write fails its check. */
export const STORAGE_WRITE_REJECTED = 'Storage write rejected - version check failed.';
/** Message of the error the memory store throws when a delete fails its version check. */
export const STORAGE_DELETE_REJECTED = 'Storage delete rejected.';

/** Nakama friend edge states, as seen from the list owner's side. */
export const FRIEND_STATE = {
  FRIEND: 0,
  INVITE_SENT: 1,
  INVITE_RECEIVED: 2,
  BLOCKED: 3,
} as const;

/** Message of the error the fake `nk.matchSignal` throws by default (no handler set). */
export const MATCH_SIGNAL_NOT_FOUND = 'match not found';

/** One recorded `nk.notificationSend` call. */
export interface SentNotification {
  userId: string;
  subject: string;
  content: { [key: string]: unknown };
  code: number;
  senderId: string | null | undefined;
  persistent: boolean | undefined;
}

/** A directed edge in the fake friend graph (owner -> other). */
interface FriendEdge {
  state: number;
  updateTime: number;
  /** Insertion order, so listing is stable: by state, then oldest edge first. */
  position: number;
}

const FRIENDS_CURSOR_PREFIX = 'friends:';

/** One `nk.matchCreate` call: the id it returned and the arguments it got. */
export interface CreatedMatch {
  matchId: string;
  module: string;
  params: { [key: string]: unknown } | undefined;
}

/** Prefix of the opaque offset cursor the fake `storageIndexList` returns. */
const INDEX_CURSOR_PREFIX = 'index:';

/** One registered storage index: the collection it covers and its indexed value fields. */
interface FakeStorageIndex {
  collection: string;
  fields: string[];
}

/** A parsed `+value.<field>:<pattern>` index query: either a prefix match or an exact match. */
interface ParsedIndexQuery {
  field: string;
  /** The prefix when the pattern ends with `*`, else null (an exact match). */
  prefix: string | null;
  /** The pattern untouched, used for the exact match case. */
  exact: string;
}

/**
 * Parses the subset of the Nakama index query language the directory uses:
 * `+value.<field>:<pattern>`, with a trailing `*` meaning prefix match. A field
 * that was not registered is an error, like Nakama's own index lookup.
 */
function parseIndexQuery(query: string, fields: readonly string[]): ParsedIndexQuery {
  const match = /^\+value\.([A-Za-z0-9_]+):(.*)$/.exec(query);
  if (match === null) throw new Error(`unsupported index query: ${query}`);
  const field = match[1] ?? '';
  if (fields.indexOf(field) === -1) throw new Error(`field ${field} is not indexed`);
  const pattern = match[2] ?? '';
  if (pattern.length > 0 && pattern.charAt(pattern.length - 1) === '*') {
    return { field, prefix: pattern.slice(0, -1), exact: pattern };
  }
  return { field, prefix: null, exact: pattern };
}

/** The offset a fake index cursor encodes; absent, null and '' all mean the start. */
function parseIndexCursor(cursor: string | undefined): number {
  if (cursor === undefined || cursor === '') return 0;
  const parsed =
    cursor.indexOf(INDEX_CURSOR_PREFIX) === 0 ? Number(cursor.slice(INDEX_CURSOR_PREFIX.length)) : NaN;
  if (!(parsed >= 0) || Math.floor(parsed) !== parsed) throw new Error('invalid cursor');
  return parsed;
}

/**
 * Fake `nk`. Accounts live in an in-memory map (empty by default, so
 * `usersGetId` returns no users and the adapter falls back to the username;
 * `usersGetUsername` matches seeded accounts by exact, case-sensitive username).
 * Storage keeps the old `vi.fn` defaults (read returns [], write records
 * nothing, delete does nothing) unless a test calls `nk.fake.useMemoryStorage()`,
 * which backs all three with an in-memory store keyed by collection/key/userId
 * that honours `version` like Nakama does.
 * `matchGet` returns null unless a test registers the match with `nk.fake.addMatch`.
 * `nk.fake.failStorageReads` / `failStorageWrites` make storage throw (either mode).
 * `storageIndexList` is the memory fake of the query the directory uses: register an
 * index with `nk.fake.registerStorageIndex(name, collection, fields)`, then list a
 * `+value.<field>:<prefix>*` query with an offset cursor (`nk.fake.seedStorageAt`
 * inserts a row before a cursor position); `failStorageIndexList` makes it throw.
 * `friendsList` reads each user's own graph; `failFriendsListFor` and
 * `setFriendsListResult` override one user's call without touching the others.
 *
 * Friends: an in-memory directed graph, empty by default. `friendsAdd`/`friendsDelete`/
 * `friendsBlock` follow Nakama: A adds B -> A 1 (invite sent), B 2 (invite received); B adds A
 * -> both 0; adding someone who blocked you is a no-op; delete removes both edges except the
 * other side's block; block sets yours to 3 and removes theirs (unless they blocked you too).
 * `friendsList` orders by state, then oldest edge first, and pages with an opaque cursor that
 * is omitted on the last page. Friend users come from seeded accounts (stub: username = id).
 * `notificationSend` records into `nk.fake.notifications`. `matchSignal` throws
 * `MATCH_SIGNAL_NOT_FOUND` until a test sets `nk.fake.setMatchSignalHandler`.
 */
export function createFakeNk(seed: string = FAKE_SEED) {
  const accounts = new Map<string, FakeAccount>();
  const stored = new Map<string, nkruntime.StorageObject>();
  /** Storage keys in index insertion order; a re-write keeps its place, like a Nakama index entry. */
  const storageOrder: string[] = [];
  let memoryStorageEnabled = false;
  const storageIndexes = new Map<string, FakeStorageIndex>();
  let storageIndexListError: Error | null = null;
  const matches = new Map<string, nkruntime.Match>();
  const deadMatches = new Set<string>();
  const matchGetErrors = new Map<string, Error>();
  const randomBytesQueue: number[][] = [];
  let usersGetIdError: Error | null = null;
  let usersGetUsernameError: Error | null = null;
  let storageReadError: Error | null = null;
  let storageWriteError: Error | null = null;
  let friendsListError: Error | null = null;
  const friendsListUserErrors = new Map<string, Error>();
  const friendsListOverrides = new Map<string, unknown>();
  const friendEdges = new Map<string, Map<string, FriendEdge>>();
  let friendClock = 0;
  const notifications: SentNotification[] = [];
  let matchSignalHandler: ((matchId: string, data: string) => string) | null = null;
  let storageVersion = 0;
  let randomCounter = 0;
  let sequentialMatchIds: { prefix: string; next: number } | null = null;

  function friendEdge(userId: string, otherId: string): FriendEdge | undefined {
    return friendEdges.get(userId)?.get(otherId);
  }

  function setFriendEdge(userId: string, otherId: string, state: number): void {
    let edges = friendEdges.get(userId);
    if (edges === undefined) {
      edges = new Map();
      friendEdges.set(userId, edges);
    }
    friendClock += 1;
    const existing = edges.get(otherId);
    edges.set(otherId, { state, updateTime: friendClock, position: existing?.position ?? friendClock });
  }

  function deleteFriendEdge(userId: string, otherId: string): void {
    friendEdges.get(userId)?.delete(otherId);
  }

  function seedFriendPairs(userId: string, otherIds: string[], state: number): void {
    const reverse: { [state: number]: number | undefined } = { 0: 0, 1: 2, 2: 1 };
    for (const otherId of otherIds) {
      setFriendEdge(userId, otherId, state);
      const back = reverse[state];
      if (back === undefined) deleteFriendEdge(otherId, userId);
      else setFriendEdge(otherId, userId, back);
    }
  }

  /** The user behind a friend edge: the seeded account, or a stub whose username is the id. */
  function friendUser(userId: string): nkruntime.User {
    return fakeUser(userId, accounts.get(userId) ?? { username: userId, displayName: '' });
  }

  /** Target ids from `ids` plus seeded accounts matching `usernames`, de-duplicated, minus the caller. */
  function friendTargets(userId: string, ids: string[], usernames: string[]): string[] {
    const targets: string[] = [];
    const push = (id: string): void => {
      if (id !== userId && targets.indexOf(id) === -1) targets.push(id);
    };
    for (const id of ids) push(id);
    for (const username of usernames) {
      accounts.forEach((account, id) => {
        if (account.username === username) push(id);
      });
    }
    return targets;
  }

  /**
   * Stores one object and keeps `storageOrder` in step: a new key appends (its
   * first index position), a re-write keeps its place, so the offset cursor
   * shifts only when a genuinely new row is inserted earlier.
   */
  function putStored(collection: string, key: string, userId: string, value: unknown): string {
    storageVersion += 1;
    const version = `v${storageVersion}`;
    const storedKey = storageKey(collection, key, userId);
    if (!stored.has(storedKey)) storageOrder.push(storedKey);
    stored.set(storedKey, {
      collection,
      key,
      userId,
      version,
      permissionRead: 1,
      permissionWrite: 0,
      createTime: 0,
      updateTime: 0,
      value: value as { [key: string]: unknown },
    });
    return version;
  }

  const fns = {
    binaryToString: vi.fn((data: ArrayBuffer): string => utf8Decode(data)),
    uuidv4: vi.fn((): string => seed),
    matchList: vi.fn((): nkruntime.Match[] => []),
    matchCreate: vi.fn((_module: string, _params?: { [key: string]: unknown }): string => {
      if (sequentialMatchIds === null) return 'created-match';
      const matchId = `${sequentialMatchIds.prefix}${sequentialMatchIds.next}`;
      sequentialMatchIds.next += 1;
      return matchId;
    }),
    matchGet: vi.fn((id: string): nkruntime.Match | null => {
      const error = matchGetErrors.get(id);
      if (error !== undefined) throw error;
      if (deadMatches.has(id)) return null;
      return matches.get(id) ?? null;
    }),
    secureRandomBytes: vi.fn((count: number): ArrayBuffer => {
      const queued = randomBytesQueue.shift();
      const bytes = new Uint8Array(count);
      for (let i = 0; i < count; i++) {
        if (queued !== undefined) {
          bytes[i] = (queued[i] ?? 0) & 0xff;
        } else {
          bytes[i] = randomCounter & 0xff;
          randomCounter += 1;
        }
      }
      return bytes.buffer;
    }),
    storageRead: vi.fn((_keys: nkruntime.StorageReadRequest[]): nkruntime.StorageObject[] => {
      if (storageReadError !== null) throw storageReadError;
      return [];
    }),
    storageWrite: vi.fn((_writes: nkruntime.StorageWriteRequest[]): nkruntime.StorageWriteAck[] => {
      if (storageWriteError !== null) throw storageWriteError;
      return [];
    }),
    /**
     * The memory fake of `nk.storageIndexList`, modelled on what the 1.1 live
     * probes measured: records of the registered collection that carry the indexed
     * value field, filtered by a `+value.<field>:<prefix>*` query, returned in
     * insertion order and paged by an **offset** cursor (`index:<n>`). Because
     * the cursor is an offset, inserting a matching row before it shifts the
     * window: a row can repeat or drop out, exactly as in Nakama 3.40.
     */
    storageIndexList: vi.fn(
      (
        indexName: string,
        query: string,
        limit: number,
        _order?: string[],
        _callerId?: string | void,
        cursor?: string,
      ): nkruntime.StorageIndexResult => {
        if (storageIndexListError !== null) throw storageIndexListError;
        if (!memoryStorageEnabled) throw new Error('storageIndexList requires useMemoryStorage');
        const index = storageIndexes.get(indexName);
        if (index === undefined) throw new Error(`storage index not found: ${indexName}`);
        if (!(limit >= 1)) throw new Error('expects limit to be positive');
        const filter = parseIndexQuery(query, index.fields);

        const matched: nkruntime.StorageObject[] = [];
        for (const storedKey of storageOrder) {
          const object = stored.get(storedKey);
          if (object === undefined || object.collection !== index.collection) continue;
          const value: unknown = object.value;
          if (typeof value !== 'object' || value === null) continue;
          const fieldValue: unknown = (value as { [field: string]: unknown })[filter.field];
          if (typeof fieldValue !== 'string') continue;
          if (filter.prefix !== null) {
            if (fieldValue.indexOf(filter.prefix) !== 0) continue;
          } else if (fieldValue !== filter.exact) {
            continue;
          }
          matched.push(object);
        }

        const offset = parseIndexCursor(cursor);
        const page = matched.slice(offset, offset + limit);
        const next = offset + page.length;
        return { objects: page, cursor: next < matched.length ? `${INDEX_CURSOR_PREFIX}${next}` : null };
      },
    ),
    friendsList: vi.fn((userId: string, limit?: number, state?: number, cursor?: string): nkruntime.FriendList => {
      // Per-user errors/overrides win over the global error, so one user's list can
      // fail (or lie) while the caller's own list still reads normally.
      const userError = friendsListUserErrors.get(userId);
      if (userError !== undefined) throw userError;
      if (friendsListError !== null) throw friendsListError;
      const override = friendsListOverrides.get(userId);
      if (override !== undefined) return override as nkruntime.FriendList;
      const pageSize = limit === undefined ? 100 : limit;
      if (pageSize < 1 || pageSize > 1000) throw new Error('expects limit to be 1-1000');
      if (state !== undefined && state !== null && (state < 0 || state > 3)) {
        throw new Error('expects state to be 0-3');
      }
      let offset = 0;
      if (cursor !== undefined && cursor !== '') {
        const parsed = cursor.indexOf(FRIENDS_CURSOR_PREFIX) === 0 ? Number(cursor.slice(FRIENDS_CURSOR_PREFIX.length)) : NaN;
        if (!(parsed >= 0) || Math.floor(parsed) !== parsed) throw new Error('invalid cursor');
        offset = parsed;
      }
      const all: Array<{ otherId: string; edge: FriendEdge }> = [];
      friendEdges.get(userId)?.forEach((edge, otherId) => {
        if (state === undefined || state === null || edge.state === state) all.push({ otherId, edge });
      });
      all.sort((a, b) => a.edge.state - b.edge.state || a.edge.position - b.edge.position);
      const page = all.slice(offset, offset + pageSize);
      const friends: nkruntime.Friend[] = page.map(({ otherId, edge }) => ({
        user: friendUser(otherId),
        state: edge.state,
        updateTime: edge.updateTime,
        metadata: {},
      }));
      const next = offset + page.length;
      return next < all.length ? { friends, cursor: `${FRIENDS_CURSOR_PREFIX}${next}` } : { friends };
    }),
    friendsAdd: vi.fn(
      (
        userId: string,
        _username: string,
        ids: string[],
        usernames: string[],
        _metadata?: { [key: string]: unknown },
      ): nkruntime.FriendList => {
        for (const otherId of friendTargets(userId, ids, usernames)) {
          const mine = friendEdge(userId, otherId);
          const theirs = friendEdge(otherId, userId);
          if (theirs?.state === FRIEND_STATE.BLOCKED) continue;
          if (mine === undefined) {
            setFriendEdge(userId, otherId, FRIEND_STATE.INVITE_SENT);
            setFriendEdge(otherId, userId, FRIEND_STATE.INVITE_RECEIVED);
          } else if (mine.state === FRIEND_STATE.INVITE_RECEIVED) {
            setFriendEdge(userId, otherId, FRIEND_STATE.FRIEND);
            setFriendEdge(otherId, userId, FRIEND_STATE.FRIEND);
          }
          // Already friends, invite already sent, or blocked by the caller: no change.
        }
        return { friends: [] };
      },
    ),
    friendsDelete: vi.fn((userId: string, _username: string, ids: string[], usernames: string[]): nkruntime.FriendList => {
      for (const otherId of friendTargets(userId, ids, usernames)) {
        deleteFriendEdge(userId, otherId);
        if (friendEdge(otherId, userId)?.state !== FRIEND_STATE.BLOCKED) deleteFriendEdge(otherId, userId);
      }
      return { friends: [] };
    }),
    friendsBlock: vi.fn((userId: string, _username: string, ids: string[], usernames: string[]): nkruntime.FriendList => {
      for (const otherId of friendTargets(userId, ids, usernames)) {
        setFriendEdge(userId, otherId, FRIEND_STATE.BLOCKED);
        if (friendEdge(otherId, userId)?.state !== FRIEND_STATE.BLOCKED) deleteFriendEdge(otherId, userId);
      }
      return { friends: [] };
    }),
    notificationSend: vi.fn(
      (
        userId: string,
        subject: string,
        content: { [key: string]: unknown },
        code: number,
        senderId?: string | null,
        persistent?: boolean,
      ): void => {
        notifications.push({ userId, subject, content, code, senderId, persistent });
      },
    ),
    matchSignal: vi.fn((matchId: string, data: string): string => {
      if (matchSignalHandler === null) throw new Error(MATCH_SIGNAL_NOT_FOUND);
      return matchSignalHandler(matchId, data);
    }),
    storageDelete: vi.fn((_keys: nkruntime.StorageDeleteRequest[]): void => undefined),
    usersGetId: vi.fn((userIds: string[], _facebookIds?: string[]): nkruntime.User[] => {
      if (usersGetIdError !== null) throw usersGetIdError;
      const users: nkruntime.User[] = [];
      for (const userId of userIds) {
        const account = accounts.get(userId);
        if (account) users.push(fakeUser(userId, account));
      }
      return users;
    }),
    usersGetUsername: vi.fn((usernames: string[]): nkruntime.User[] => {
      if (usersGetUsernameError !== null) throw usersGetUsernameError;
      const users: nkruntime.User[] = [];
      for (const username of usernames) {
        accounts.forEach((account, userId) => {
          if (account.username === username) users.push(fakeUser(userId, account));
        });
      }
      return users;
    }),
    accountGetId: vi.fn((userId: string): nkruntime.Account => {
      const account = accounts.get(userId);
      if (!account) throw new Error(`account not found: ${userId}`);
      return {
        user: fakeUser(userId, account),
        wallet: {},
        email: '',
        devices: [],
        customId: '',
        verifyTime: 0,
        disableTime: 0,
      };
    }),
    accountUpdateId: vi.fn(
      (
        userId: string,
        username?: string | null,
        displayName?: string | null,
        _timezone?: string | null,
        _location?: string | null,
        _language?: string | null,
        _avatar?: string | null,
        _metadata?: { [key: string]: unknown } | null,
      ): void => {
        const current = accounts.get(userId) ?? { username: userId, displayName: '' };
        accounts.set(userId, {
          username: username ?? current.username,
          displayName: displayName ?? current.displayName,
        });
      },
    ),
  };

  /** Test-only controls; not part of `nkruntime.Nakama`. */
  const fake = {
    accounts,
    /** Adds or replaces an account (a rename is just another seed). */
    seedAccount(userId: string, account: FakeAccount): void {
      accounts.set(userId, { ...account });
    },
    /** Makes `usersGetId` throw `error` (pass null to restore it). */
    failUsersGetId(error: Error | null = new Error('usersGetId failed')): void {
      usersGetIdError = error;
    },
    /** Makes `usersGetUsername` throw `error` (pass null to restore it). */
    failUsersGetUsername(error: Error | null = new Error('usersGetUsername failed')): void {
      usersGetUsernameError = error;
    },
    /**
     * Backs storageRead/storageWrite/storageDelete with an in-memory store keyed by
     * collection/key/userId. Like Nakama, a batch is all-or-nothing and `version` is honoured:
     * - write `'*'`: only if absent; another version: only if it equals the stored one
     *   (else throws `STORAGE_WRITE_REJECTED`); each write stores a fresh version string;
     * - delete with a version: only if present with that version (else throws
     *   `STORAGE_DELETE_REJECTED`); without one, deleting an absent key is a no-op.
     */
    useMemoryStorage(): void {
      memoryStorageEnabled = true;
      fns.storageRead.mockImplementation((keys) => {
        if (storageReadError !== null) throw storageReadError;
        const found: nkruntime.StorageObject[] = [];
        for (const k of keys) {
          const object = stored.get(storageKey(k.collection, k.key, k.userId));
          if (object) found.push(object);
        }
        return found;
      });
      fns.storageWrite.mockImplementation((writes) => {
        if (storageWriteError !== null) throw storageWriteError;
        for (const w of writes) {
          if (w.version === undefined || w.version === '') continue;
          const existing = stored.get(storageKey(w.collection, w.key, w.userId));
          const accepted = w.version === '*' ? existing === undefined : existing !== undefined && existing.version === w.version;
          if (!accepted) throw new Error(STORAGE_WRITE_REJECTED);
        }
        return writes.map((w) => {
          storageVersion += 1;
          const storedKey = storageKey(w.collection, w.key, w.userId);
          if (!stored.has(storedKey)) storageOrder.push(storedKey);
          const object: nkruntime.StorageObject = {
            collection: w.collection,
            key: w.key,
            userId: w.userId ?? '',
            version: `v${storageVersion}`,
            permissionRead: w.permissionRead ?? 1,
            permissionWrite: w.permissionWrite ?? 1,
            createTime: 0,
            updateTime: 0,
            value: w.value,
          };
          stored.set(storedKey, object);
          return { collection: object.collection, key: object.key, userId: object.userId, version: object.version };
        });
      });
      fns.storageDelete.mockImplementation((keys) => {
        for (const k of keys) {
          if (k.version === undefined || k.version === '') continue;
          const existing = stored.get(storageKey(k.collection, k.key, k.userId));
          if (existing === undefined || existing.version !== k.version) throw new Error(STORAGE_DELETE_REJECTED);
        }
        for (const k of keys) {
          const storedKey = storageKey(k.collection, k.key, k.userId);
          stored.delete(storedKey);
          const position = storageOrder.indexOf(storedKey);
          if (position !== -1) storageOrder.splice(position, 1);
        }
      });
    },
    /**
     * Puts an object in the in-memory store (enable it with `useMemoryStorage`) and
     * returns its version, for tests that then write or delete with that version.
     */
    seedStorage(collection: string, key: string, userId: string, value: unknown): string {
      return putStored(collection, key, userId, value);
    },
    /**
     * Seeds an object at a specific index insertion position (`0` inserts before
     * every existing row), so a test can demonstrate that the offset cursor shifts
     * when a row is inserted ahead of it. Returns the version.
     */
    seedStorageAt(collection: string, key: string, userId: string, value: unknown, position: number): string {
      const version = putStored(collection, key, userId, value);
      const storedKey = storageKey(collection, key, userId);
      const current = storageOrder.indexOf(storedKey);
      if (current !== -1) storageOrder.splice(current, 1);
      const clamped = position < 0 ? 0 : position > storageOrder.length ? storageOrder.length : position;
      storageOrder.splice(clamped, 0, storedKey);
      return version;
    },
    /**
     * Registers an index over `collection`'s value `fields` (default `['fold']`),
     * the fake counterpart of `initializer.registerStorageIndex`.
     */
    registerStorageIndex(indexName: string, collection: string, fields: string[] = ['fold']): void {
      storageIndexes.set(indexName, { collection, fields: fields.slice() });
    },
    /** Makes every `storageIndexList` throw `error` (pass null to restore it). */
    failStorageIndexList(error: Error | null = new Error('storageIndexList failed')): void {
      storageIndexListError = error;
    },
    /** The stored value, or undefined. */
    storedValue(collection: string, key: string, userId: string): unknown {
      return stored.get(storageKey(collection, key, userId))?.value;
    },
    /** The whole stored object (with its version), or undefined. */
    storedObject(collection: string, key: string, userId: string): nkruntime.StorageObject | undefined {
      return stored.get(storageKey(collection, key, userId));
    },
    /**
     * Every `nk.matchCreate` call so far, in order, with the id it returned (also when a
     * test overrode it with `mockReturnValue`). Feed `params` to `matchInit`.
     */
    get createdMatches(): CreatedMatch[] {
      return fns.matchCreate.mock.calls.map(([module, params], i) => {
        const result = fns.matchCreate.mock.results[i];
        return { matchId: result?.type === 'return' ? (result.value as string) : '', module, params };
      });
    },
    /** Makes `matchCreate` return `<prefix>1`, `<prefix>2`, ... instead of the fixed 'created-match'. */
    useSequentialMatchIds(prefix: string = 'match-'): void {
      sequentialMatchIds = { prefix, next: 1 };
    },
    /** Registers a live match so `matchGet(matchId)` returns it (revives it if it was killed). */
    addMatch(matchId: string, label: string, size: number = 0): nkruntime.Match {
      const match: nkruntime.Match = { matchId, authoritative: true, size, label };
      matches.set(matchId, match);
      deadMatches.delete(matchId);
      return match;
    },
    /** Marks a match as ended: `matchGet(matchId)` returns null. */
    killMatch(matchId: string): void {
      deadMatches.add(matchId);
    },
    /** Makes `matchGet(matchId)` throw `error` (Nakama may throw for an ended match); pass null to restore. */
    failMatchGet(matchId: string, error: Error | null = new Error(`match not found: ${matchId}`)): void {
      if (error === null) matchGetErrors.delete(matchId);
      else matchGetErrors.set(matchId, error);
    },
    /**
     * Queues the bytes of the next `secureRandomBytes` call (one array per call, padded with 0
     * or truncated to the requested count). With an empty queue, calls return a running
     * counter pattern 0, 1, 2, ... (mod 256), continuing across calls.
     */
    pushRandomBytes(...calls: number[][]): void {
      for (const bytes of calls) randomBytesQueue.push(bytes.slice());
    },
    /**
     * Makes every `storageRead` throw `error` (pass null to restore). Works with the default
     * fakes and with `useMemoryStorage`, whichever order they are called in.
     */
    failStorageReads(error: Error | null = new Error('storageRead failed')): void {
      storageReadError = error;
    },
    /** Makes every `storageWrite` throw `error` (pass null to restore); nothing is stored. */
    failStorageWrites(error: Error | null = new Error('storageWrite failed')): void {
      storageWriteError = error;
    },
    /**
     * Sets ONE directed edge in the friend graph (`userId`'s view of `otherId`), with no
     * reciprocal edge. Use `seedFriends` for a consistent pair. State: see `FRIEND_STATE`.
     */
    setFriendEdge(userId: string, otherId: string, state: number): void {
      setFriendEdge(userId, otherId, state);
    },
    /**
     * Seeds consistent edges from `userId` to each of `otherIds`, as if the Nakama calls had run:
     * FRIEND both sides 0; INVITE_SENT -> 1 / 2; INVITE_RECEIVED -> 2 / 1; BLOCKED -> 3 and the
     * other side's edge removed.
     */
    seedFriends(userId: string, otherIds: string[], state: number = FRIEND_STATE.FRIEND): void {
      seedFriendPairs(userId, otherIds, state);
    },
    /**
     * Seeds `count` friends of `userId` with ids `<prefix>1` ... `<prefix><count>` (and seeded
     * accounts `<prefix><n>`), for limit and paging tests. Returns the ids in list order.
     */
    seedManyFriends(userId: string, count: number, state: number = FRIEND_STATE.FRIEND, prefix: string = 'friend-'): string[] {
      const ids: string[] = [];
      for (let n = 1; n <= count; n++) {
        const id = `${prefix}${n}`;
        if (!accounts.has(id)) accounts.set(id, { username: id, displayName: `Friend ${n}` });
        ids.push(id);
      }
      seedFriendPairs(userId, ids, state);
      return ids;
    },
    /** The state of `userId`'s edge to `otherId`, or undefined when there is none. */
    friendState(userId: string, otherId: string): number | undefined {
      return friendEdge(userId, otherId)?.state;
    },
    /** Makes `friendsList` throw `error` for every user (pass null to restore it). */
    failFriendsList(error: Error | null = new Error('friendsList failed')): void {
      friendsListError = error;
    },
    /**
     * Makes `friendsList` throw `error` for `userId` only, leaving every other
     * user's list readable (the block reverse check must fail closed while the
     * caller's own list still answers). Pass null to restore it.
     */
    failFriendsListFor(userId: string, error: Error | null = new Error(`friendsList failed for ${userId}`)): void {
      if (error === null) friendsListUserErrors.delete(userId);
      else friendsListUserErrors.set(userId, error);
    },
    /**
     * Makes `friendsList` return `result` verbatim for `userId` only, for shapes
     * the memory graph cannot produce (a malformed page, a page with no `friends`
     * array). Pass null to restore the real list. The value is cast, not checked.
     */
    setFriendsListResult(userId: string, result: unknown): void {
      friendsListOverrides.set(userId, result);
    },
    /** Restores `userId`'s real in-memory friend list after `setFriendsListResult`. */
    clearFriendsListResult(userId: string): void {
      friendsListOverrides.delete(userId);
    },
    /** Every `nk.notificationSend` call so far, in order. */
    notifications,
    /**
     * Answers `nk.matchSignal(matchId, data)` with `handler` (e.g. route to the real
     * `matchSignal` of a test-held match state). Pass null to restore the default, which
     * throws `MATCH_SIGNAL_NOT_FOUND` like a signal to an ended match.
     */
    setMatchSignalHandler(handler: ((matchId: string, data: string) => string) | null): void {
      matchSignalHandler = handler;
    },
  };

  return { ...fns, fake } as typeof fns & { fake: typeof fake } & nkruntime.Nakama;
}

export function createFakeDispatcher() {
  const fns = {
    broadcastMessage: vi.fn(),
    broadcastMessageDeferred: vi.fn(),
    matchKick: vi.fn(),
    matchLabelUpdate: vi.fn(),
  };
  return fns as typeof fns & nkruntime.MatchDispatcher;
}

export function createContext(userId?: string): nkruntime.Context {
  return { userId, matchId: 'match-1', env: {} } as unknown as nkruntime.Context;
}

/** A context with no `userId` key at all, like an RPC called with only the http key. */
export function createUnauthenticatedContext(): nkruntime.Context {
  return { matchId: 'match-1', env: {} } as unknown as nkruntime.Context;
}

/** userId `u<n>`, sessionId `s<n>` (or the given session), username `Player <n>`. */
export function createPresence(n: number, sessionId: string = `s${n}`): nkruntime.Presence {
  return { userId: `u${n}`, sessionId, username: `Player ${n}`, node: 'test-node' };
}

/** A client message; `body` is sent as raw text (use '' for an empty body). */
export function rawMessage(sender: nkruntime.Presence, opCode: number, body: string): nkruntime.MatchMessage {
  return { sender, opCode, data: utf8Encode(body), reliable: true, persistence: false, status: '', receiveTimeMs: 0 };
}

/** A client message carrying `payload` as JSON. */
export function jsonMessage(sender: nkruntime.Presence, opCode: number, payload: unknown): nkruntime.MatchMessage {
  return rawMessage(sender, opCode, JSON.stringify(payload));
}

/** A listed match with the given label (string, so malformed labels can be tested). */
export function listedMatch(matchId: string, label: string): nkruntime.Match {
  return { matchId, authoritative: true, size: 0, label };
}
