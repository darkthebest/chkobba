/**
 * Self-test of the friends, notification, matchSignal and failing-storage parts of the nk
 * fakes, so feature tests can trust them to behave like Nakama.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRIEND_STATE, MATCH_SIGNAL_NOT_FOUND, createFakeNk } from './fakes';

type FakeNk = ReturnType<typeof createFakeNk>;

function listStates(nk: FakeNk, userId: string): Array<[string, number | undefined]> {
  return (nk.friendsList(userId).friends ?? []).map((f) => [f.user!.userId, f.state]);
}

describe('fake nk friend graph', () => {
  let nk: FakeNk;

  beforeEach(() => {
    nk = createFakeNk();
    nk.fake.seedAccount('a', { username: 'alice', displayName: 'Alice' });
    nk.fake.seedAccount('b', { username: 'bob', displayName: 'Bob' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start with an empty friends list', () => {
    // Act
    const list = nk.friendsList('a');

    // Assert
    expect(list).toEqual({ friends: [] });
  });

  it('should mark invite sent and invite received when A adds B', () => {
    // Act
    nk.friendsAdd('a', 'alice', ['b'], [], {});

    // Assert
    expect([nk.fake.friendState('a', 'b'), nk.fake.friendState('b', 'a')]).toEqual([1, 2]);
  });

  it('should make both sides friends when B adds A back', () => {
    // Arrange
    nk.friendsAdd('a', 'alice', ['b'], [], {});

    // Act
    nk.friendsAdd('b', 'bob', [], ['alice'], {});

    // Assert
    expect([nk.fake.friendState('a', 'b'), nk.fake.friendState('b', 'a')]).toEqual([0, 0]);
  });

  it('should not change an invite when A adds B twice', () => {
    // Arrange
    nk.friendsAdd('a', 'alice', ['b'], [], {});

    // Act
    nk.friendsAdd('a', 'alice', ['b'], [], {});

    // Assert
    expect([nk.fake.friendState('a', 'b'), nk.fake.friendState('b', 'a')]).toEqual([1, 2]);
  });

  it('should ignore adding yourself', () => {
    // Act
    nk.friendsAdd('a', 'alice', ['a'], [], {});

    // Assert
    expect(nk.fake.friendState('a', 'a')).toBeUndefined();
  });

  it('should remove both edges when a friend is deleted', () => {
    // Arrange
    nk.fake.seedFriends('a', ['b']);

    // Act
    nk.friendsDelete('a', 'alice', ['b'], []);

    // Assert
    expect([nk.fake.friendState('a', 'b'), nk.fake.friendState('b', 'a')]).toEqual([undefined, undefined]);
  });

  it('should set the blocker edge to 3 and delete the other side when blocking', () => {
    // Arrange
    nk.fake.seedFriends('a', ['b']);

    // Act
    nk.friendsBlock('a', 'alice', ['b'], []);

    // Assert
    expect([nk.fake.friendState('a', 'b'), nk.fake.friendState('b', 'a')]).toEqual([3, undefined]);
  });

  it('should ignore an add from someone the target has blocked', () => {
    // Arrange
    nk.friendsBlock('a', 'alice', ['b'], []);

    // Act
    nk.friendsAdd('b', 'bob', ['a'], [], {});

    // Assert
    expect([nk.fake.friendState('a', 'b'), nk.fake.friendState('b', 'a')]).toEqual([3, undefined]);
  });

  it('should keep the other side block when the blocked user deletes the friendship', () => {
    // Arrange
    nk.friendsBlock('a', 'alice', ['b'], []);

    // Act
    nk.friendsDelete('b', 'bob', ['a'], []);

    // Assert
    expect(nk.fake.friendState('a', 'b')).toBe(3);
  });

  it('should list friends with the seeded user, state and an update time', () => {
    // Arrange
    nk.fake.seedFriends('a', ['b']);

    // Act
    const [friend] = nk.friendsList('a').friends ?? [];

    // Assert
    expect(friend).toMatchObject({ user: { userId: 'b', username: 'bob', displayName: 'Bob' }, state: 0, updateTime: expect.any(Number) });
  });

  it('should filter by state and order by state then age when listing', () => {
    // Arrange
    nk.fake.seedFriends('a', ['c'], FRIEND_STATE.INVITE_RECEIVED);
    nk.fake.seedFriends('a', ['d'], FRIEND_STATE.FRIEND);
    nk.fake.seedFriends('a', ['b'], FRIEND_STATE.FRIEND);

    // Act
    const all = listStates(nk, 'a');

    // Assert
    expect(all).toEqual([['d', 0], ['b', 0], ['c', 2]]);
  });

  it('should return only the requested state when a state filter is given', () => {
    // Arrange
    nk.fake.seedFriends('a', ['b'], FRIEND_STATE.FRIEND);
    nk.fake.seedFriends('a', ['c'], FRIEND_STATE.INVITE_SENT);

    // Act
    const list = nk.friendsList('a', 100, FRIEND_STATE.INVITE_SENT);

    // Assert
    expect((list.friends ?? []).map((f) => f.user!.userId)).toEqual(['c']);
  });

  it('should seed the reciprocal edges for many friends', () => {
    // Arrange
    const ids = nk.fake.seedManyFriends('a', 3, FRIEND_STATE.INVITE_SENT);

    // Act
    const reverse = ids.map((id) => nk.fake.friendState(id, 'a'));

    // Assert
    expect(reverse).toEqual([2, 2, 2]);
  });

  it('should page through every friend exactly once with the cursor', () => {
    // Arrange
    const ids = nk.fake.seedManyFriends('a', 250);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;

    // Act
    do {
      const page = nk.friendsList('a', 100, undefined, cursor);
      for (const f of page.friends ?? []) seen.push(f.user!.userId);
      cursor = page.cursor;
      pages += 1;
    } while (cursor !== undefined && pages < 10);

    // Assert
    expect({ seen, pages }).toEqual({ seen: ids, pages: 3 });
  });

  it('should omit the cursor when the page reaches the end exactly', () => {
    // Arrange
    nk.fake.seedManyFriends('a', 100);

    // Act
    const list = nk.friendsList('a', 100);

    // Assert
    expect(list.cursor).toBeUndefined();
  });

  it('should throw like Nakama when the limit is out of range', () => {
    // Act
    const call = () => nk.friendsList('a', 1001);

    // Assert
    expect(call).toThrow('expects limit to be 1-1000');
  });

  it('should throw the configured error when friendsList is made to fail', () => {
    // Arrange
    nk.fake.failFriendsList(new Error('db down'));

    // Act
    const call = () => nk.friendsList('a');

    // Assert
    expect(call).toThrow('db down');
  });
});

describe('fake nk notifications and match signals', () => {
  let nk: FakeNk;

  beforeEach(() => {
    nk = createFakeNk();
  });

  it('should record every notification sent', () => {
    // Act
    nk.notificationSend('b', 'invite', { code: 'ABC' }, 7, 'a', false);

    // Assert
    expect(nk.fake.notifications).toEqual([
      { userId: 'b', subject: 'invite', content: { code: 'ABC' }, code: 7, senderId: 'a', persistent: false },
    ]);
  });

  it('should throw match not found when no signal handler is set', () => {
    // Act
    const call = () => nk.matchSignal('m1', 'ping');

    // Assert
    expect(call).toThrow(MATCH_SIGNAL_NOT_FOUND);
  });

  it('should return the handler result when a signal handler is set', () => {
    // Arrange
    nk.fake.setMatchSignalHandler((matchId, data) => `${matchId}:${data}`);

    // Act
    const result = nk.matchSignal('m1', 'ping');

    // Assert
    expect(result).toBe('m1:ping');
  });
});

describe('fake nk failing storage', () => {
  let nk: FakeNk;
  const write: nkruntime.StorageWriteRequest = { collection: 'c', key: 'k', userId: 'u', value: { n: 1 } };

  beforeEach(() => {
    nk = createFakeNk();
  });

  it('should throw on writes when writes are made to fail with the default storage', () => {
    // Arrange
    nk.fake.failStorageWrites();

    // Act
    const call = () => nk.storageWrite([write]);

    // Assert
    expect(call).toThrow('storageWrite failed');
  });

  it('should store nothing when writes fail with the memory storage', () => {
    // Arrange
    nk.fake.useMemoryStorage();
    nk.fake.failStorageWrites();

    // Act
    expect(() => nk.storageWrite([write])).toThrow();

    // Assert
    expect(nk.fake.storedValue('c', 'k', 'u')).toBeUndefined();
  });

  it('should throw on reads when reads are made to fail with the memory storage', () => {
    // Arrange
    nk.fake.failStorageReads(new Error('read down'));
    nk.fake.useMemoryStorage();

    // Act
    const call = () => nk.storageRead([{ collection: 'c', key: 'k', userId: 'u' }]);

    // Assert
    expect(call).toThrow('read down');
  });

  it('should write again once the failure is cleared', () => {
    // Arrange
    nk.fake.useMemoryStorage();
    nk.fake.failStorageWrites();
    nk.fake.failStorageWrites(null);

    // Act
    nk.storageWrite([write]);

    // Assert
    expect(nk.fake.storedValue('c', 'k', 'u')).toEqual({ n: 1 });
  });
});
