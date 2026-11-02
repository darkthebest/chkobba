/**
 * before-AddFriends hook end to end over the fake friend graph: auth, request
 * validation, friend-code resolution, limit boundaries and the rewritten
 * request Nakama receives.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRIEND_LIMITS, FRIEND_STATE } from '@chkobba/protocol';
import { createContext, createFakeLogger, createFakeNk, createUnauthenticatedContext } from '../../__tests__/fakes';
import { beforeAddFriends } from '../friendHooks';

const ME = 'me';
const MY_CODE = 'MEME2345';
const FRIEND_CODE = 'ABCD2345';
const UNKNOWN_CODE = 'ZZZZ9999';

const INVALID_ARGUMENT = 3;
const RESOURCE_EXHAUSTED = 8;
const UNAUTHENTICATED = 16;

/** Runs `fn` and returns what it threw (undefined when it returned). */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('beforeAddFriends', () => {
  let ctx: nkruntime.Context;
  let logger: ReturnType<typeof createFakeLogger>;
  let nk: ReturnType<typeof createFakeNk>;

  beforeEach(() => {
    ctx = createContext(ME);
    logger = createFakeLogger();
    nk = createFakeNk();
    nk.fake.seedAccount(ME, { username: MY_CODE, displayName: 'Me' });
    nk.fake.seedAccount('friend-by-code', { username: FRIEND_CODE, displayName: 'By Code' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const run = (data: nkruntime.AddFriendsRequest) => beforeAddFriends(ctx, logger, nk, data);

  describe('authentication and validation', () => {
    it('should throw code 16 when the caller is not authenticated', () => {
      // Arrange
      ctx = createUnauthenticatedContext();

      // Act
      const error = thrownBy(() => run({ ids: ['other'] }));

      // Assert
      expect(error).toMatchObject({ code: UNAUTHENTICATED });
    });

    it('should throw friend_bad_request with code 3 when ids and usernames total 11', () => {
      // Arrange
      const data = { ids: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], usernames: ['b1', 'b2', 'b3', 'b4', 'b5'] };

      // Act
      const error = thrownBy(() => run(data));

      // Assert
      expect(error).toEqual({ message: 'friend_bad_request', code: INVALID_ARGUMENT });
    });

    it('should accept exactly 10 targets', () => {
      // Arrange
      const ids = Array.from({ length: FRIEND_LIMITS.MAX_TARGETS_PER_REQUEST }, (_, i) => `t${i}`);

      // Act
      const result = run({ ids });

      // Assert
      expect(result).toEqual({ ids, usernames: [] });
    });

    it('should count duplicates and the caller toward the 10-target cap', () => {
      // Arrange
      const ids = Array.from({ length: FRIEND_LIMITS.MAX_TARGETS_PER_REQUEST + 1 }, () => ME);

      // Act
      const error = thrownBy(() => run({ ids }));

      // Assert
      expect(error).toEqual({ message: 'friend_bad_request', code: INVALID_ARGUMENT });
    });

    it.each([
      { label: 'a non-string id', data: { ids: [42] } },
      { label: 'a null id', data: { ids: [null] } },
      { label: 'ids that are not an array', data: { ids: 'other' } },
      { label: 'a non-string username', data: { usernames: [{ code: FRIEND_CODE }] } },
      { label: 'usernames that are not an array', data: { usernames: FRIEND_CODE } },
    ])('should throw friend_bad_request with code 3 when the request has $label', ({ data }) => {
      // Arrange
      const request = data as unknown as nkruntime.AddFriendsRequest;

      // Act
      const error = thrownBy(() => run(request));

      // Assert
      expect(error).toEqual({ message: 'friend_bad_request', code: INVALID_ARGUMENT });
    });

    it('should not read the friend graph when the request is malformed', () => {
      // Arrange
      const request = { ids: [42] } as unknown as nkruntime.AddFriendsRequest;

      // Act
      thrownBy(() => run(request));

      // Assert
      expect(nk.friendsList).not.toHaveBeenCalled();
    });
  });

  describe('friend-code resolution', () => {
    it.each([
      { label: 'uppercase', input: FRIEND_CODE },
      { label: 'lowercase', input: 'abcd2345' },
      { label: 'dashed lowercase', input: 'abcd-2345' },
      { label: 'spaced with a trailing newline', input: 'ABCD 2345\n' },
    ])('should resolve a $label friend code to its user id', ({ input }) => {
      // Arrange
      const data = { usernames: [input] };

      // Act
      const result = run(data);

      // Assert
      expect(result).toEqual({ ids: ['friend-by-code'], usernames: [] });
    });

    it('should resolve every code with one usersGetUsername call on the normalized, deduped codes', () => {
      // Arrange
      const data = { usernames: ['abcd-2345', FRIEND_CODE, UNKNOWN_CODE.toLowerCase(), 'Guest-ABCD'] };

      // Act
      run(data);

      // Assert
      expect(nk.usersGetUsername.mock.calls).toEqual([[[FRIEND_CODE, UNKNOWN_CODE]]]);
    });

    it('should drop a guest-style username and an unknown code', () => {
      // Arrange
      const data = { ids: ['other'], usernames: ['Guest-ABCD', UNKNOWN_CODE] };

      // Act
      const result = run(data);

      // Assert
      expect(result).toEqual({ ids: ['other'], usernames: [] });
    });

    it('should not call usersGetUsername when no username is a well-formed code', () => {
      // Arrange
      const data = { ids: ['other'], usernames: ['Guest-ABCD', 'short'] };

      // Act
      run(data);

      // Assert
      expect(nk.usersGetUsername).not.toHaveBeenCalled();
    });

    it('should dedupe a target given both by id and by code', () => {
      // Arrange
      const data = { ids: ['friend-by-code'], usernames: [FRIEND_CODE] };

      // Act
      const result = run(data);

      // Assert
      expect(result).toEqual({ ids: ['friend-by-code'], usernames: [] });
    });
  });

  describe('self and nothing valid', () => {
    it('should drop the caller own id', () => {
      // Arrange
      const data = { ids: [ME, 'other'] };

      // Act
      const result = run(data);

      // Assert
      expect(result).toEqual({ ids: ['other'], usernames: [] });
    });

    it('should drop the caller own friend code', () => {
      // Arrange
      const data = { ids: ['other'], usernames: [MY_CODE.toLowerCase()] };

      // Act
      const result = run(data);

      // Assert
      expect(result).toEqual({ ids: ['other'], usernames: [] });
    });

    it.each([
      { label: 'only the caller id', data: { ids: [ME] } },
      { label: 'only the caller code', data: { usernames: [MY_CODE] } },
      { label: 'only unknown codes', data: { usernames: [UNKNOWN_CODE] } },
      { label: 'only malformed usernames', data: { usernames: ['Guest-ABCD'] } },
      { label: 'no targets at all', data: {} },
    ])('should return the request unchanged when it holds $label', ({ data }) => {
      // Arrange
      const request: nkruntime.AddFriendsRequest = data;

      // Act
      const result = run(request);

      // Assert
      expect(result).toBe(request);
    });
  });

  describe('returned request', () => {
    it('should list requests, then accepts, then noops, with usernames emptied', () => {
      // Arrange
      nk.fake.seedFriends(ME, ['old-friend'], FRIEND_STATE.FRIEND);
      nk.fake.seedFriends(ME, ['asker'], FRIEND_STATE.REQUEST_RECEIVED);
      const data = { ids: ['old-friend', 'asker', 'new'] };

      // Act
      const result = run(data);

      // Assert
      expect(result).toEqual({ ids: ['new', 'asker', 'old-friend'], usernames: [] });
    });

    it('should read the caller edges once per state 0 to 3 with a page of 1000', () => {
      // Arrange
      const data = { ids: ['new'] };

      // Act
      run(data);

      // Assert
      expect(nk.friendsList.mock.calls).toEqual([
        [ME, 1000, 0],
        [ME, 1000, 1],
        [ME, 1000, 2],
        [ME, 1000, 3],
      ]);
    });

    it('should read the accepted user friend count with friendsList state 0', () => {
      // Arrange
      nk.fake.seedFriends(ME, ['asker'], FRIEND_STATE.REQUEST_RECEIVED);

      // Act
      run({ ids: ['asker'] });

      // Assert
      expect(nk.friendsList).toHaveBeenCalledWith('asker', 1000, 0);
    });

    it('should propagate a friendsList failure rather than letting the request through', () => {
      // Arrange
      const failure = new Error('friendsList failed');
      nk.fake.failFriendsList(failure);

      // Act
      const error = thrownBy(() => run({ ids: ['new'] }));

      // Assert
      expect(error).toBe(failure);
    });
  });

  describe('outgoing pending limit', () => {
    it('should allow one new request when the caller has 49 pending', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_OUTGOING_PENDING - 1, FRIEND_STATE.REQUEST_SENT, 'pending-');

      // Act
      const result = run({ ids: ['new'] });

      // Assert
      expect(result).toEqual({ ids: ['new'], usernames: [] });
    });

    it('should throw friend_outgoing_limit with code 8 when the caller has 50 pending', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_OUTGOING_PENDING, FRIEND_STATE.REQUEST_SENT, 'pending-');

      // Act
      const error = thrownBy(() => run({ ids: ['new'] }));

      // Assert
      expect(error).toEqual({ message: 'friend_outgoing_limit', code: RESOURCE_EXHAUSTED });
    });

    it('should apply the outgoing limit to targets resolved from friend codes', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_OUTGOING_PENDING, FRIEND_STATE.REQUEST_SENT, 'pending-');

      // Act
      const error = thrownBy(() => run({ usernames: ['abcd-2345'] }));

      // Assert
      expect(error).toEqual({ message: 'friend_outgoing_limit', code: RESOURCE_EXHAUSTED });
    });

    it('should not count an accept toward the outgoing limit when the caller has 50 pending', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_OUTGOING_PENDING, FRIEND_STATE.REQUEST_SENT, 'pending-');
      nk.fake.seedFriends(ME, ['asker'], FRIEND_STATE.REQUEST_RECEIVED);

      // Act
      const result = run({ ids: ['asker'] });

      // Assert
      expect(result).toEqual({ ids: ['asker'], usernames: [] });
    });

    it('should log the rejection with the caller and the limit code', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_OUTGOING_PENDING, FRIEND_STATE.REQUEST_SENT, 'pending-');

      // Act
      thrownBy(() => run({ ids: ['new'] }));

      // Assert
      expect(logger.info).toHaveBeenCalledWith(expect.any(String), ME, 'friend_outgoing_limit');
    });
  });

  describe('friend limits', () => {
    it('should allow one accept when the caller has 199 friends', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_FRIENDS - 1);
      nk.fake.seedFriends(ME, ['asker'], FRIEND_STATE.REQUEST_RECEIVED);

      // Act
      const result = run({ ids: ['asker'] });

      // Assert
      expect(result).toEqual({ ids: ['asker'], usernames: [] });
    });

    it('should throw friend_limit with code 8 when the caller has 200 friends and accepts one more', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_FRIENDS);
      nk.fake.seedFriends(ME, ['asker'], FRIEND_STATE.REQUEST_RECEIVED);

      // Act
      const error = thrownBy(() => run({ ids: ['asker'] }));

      // Assert
      expect(error).toEqual({ message: 'friend_limit', code: RESOURCE_EXHAUSTED });
    });

    it('should throw friend_their_limit with code 8 when the accepted user has 200 friends', () => {
      // Arrange
      nk.fake.seedFriends(ME, ['asker'], FRIEND_STATE.REQUEST_RECEIVED);
      nk.fake.seedManyFriends('asker', FRIEND_LIMITS.MAX_FRIENDS, FRIEND_STATE.FRIEND, 'theirs-');

      // Act
      const error = thrownBy(() => run({ ids: ['asker'] }));

      // Assert
      expect(error).toEqual({ message: 'friend_their_limit', code: RESOURCE_EXHAUSTED });
    });

    it('should allow an accept when the accepted user has 199 friends', () => {
      // Arrange
      nk.fake.seedFriends(ME, ['asker'], FRIEND_STATE.REQUEST_RECEIVED);
      nk.fake.seedManyFriends('asker', FRIEND_LIMITS.MAX_FRIENDS - 1, FRIEND_STATE.FRIEND, 'theirs-');

      // Act
      const result = run({ ids: ['asker'] });

      // Assert
      expect(result).toEqual({ ids: ['asker'], usernames: [] });
    });

    it('should not count a new request toward the friend limit when the caller has 200 friends', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_FRIENDS);

      // Act
      const result = run({ ids: ['new'] });

      // Assert
      expect(result).toEqual({ ids: ['new'], usernames: [] });
    });
  });

  describe('noops', () => {
    it('should pass a blocked target through as a noop when the caller is at every limit', () => {
      // Arrange
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_FRIENDS);
      nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_OUTGOING_PENDING, FRIEND_STATE.REQUEST_SENT, 'pending-');
      nk.fake.setFriendEdge(ME, 'blocked', FRIEND_STATE.BLOCKED);

      // Act
      const result = run({ ids: ['blocked'] });

      // Assert
      expect(result).toEqual({ ids: ['blocked'], usernames: [] });
    });

    it('should pass existing friends and pending requests through when the caller is at every limit', () => {
      // Arrange
      const friends = nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_FRIENDS);
      const pending = nk.fake.seedManyFriends(ME, FRIEND_LIMITS.MAX_OUTGOING_PENDING, FRIEND_STATE.REQUEST_SENT, 'pending-');
      const data = { ids: [friends[0]!, pending[0]!] };

      // Act
      const result = run(data);

      // Assert
      expect(result).toEqual({ ids: [friends[0], pending[0]], usernames: [] });
    });

    it('should not read the friend count of a blocked target', () => {
      // Arrange
      nk.fake.setFriendEdge(ME, 'blocked', FRIEND_STATE.BLOCKED);

      // Act
      run({ ids: ['blocked'] });

      // Assert
      expect(nk.friendsList).not.toHaveBeenCalledWith('blocked', expect.anything(), expect.anything());
    });
  });
});
