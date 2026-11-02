/**
 * Pure friend-request rules behind the before-AddFriends hook: classifying
 * targets against the caller's edges, counting edges, and the limit checks
 * with their exact boundaries (no nkruntime).
 */
import { describe, expect, it } from 'vitest';
import { FRIEND_LIMITS, FRIEND_STATE, type FriendState } from '@chkobba/protocol';
import { checkFriendLimits, classifyTargets, countEdges, type FriendEdges, type FriendTargets } from '../friendRules';

const ME = 'me';

/** Edges `<prefix>1` ... `<prefix><count>`, all in `state`. */
function edgesOf(count: number, state: FriendState, prefix: string): { [userId: string]: FriendState } {
  const edges: { [userId: string]: FriendState } = {};
  for (let n = 1; n <= count; n++) edges[`${prefix}${n}`] = state;
  return edges;
}

function targetsOf(partial: Partial<FriendTargets>): FriendTargets {
  return { requests: [], accepts: [], noops: [], ...partial };
}

describe('classifyTargets', () => {
  it('should put a target with no edge in requests', () => {
    // Arrange
    const edges: FriendEdges = {};

    // Act
    const result = classifyTargets(ME, ['other'], edges);

    // Assert
    expect(result).toEqual({ requests: ['other'], accepts: [], noops: [] });
  });

  it('should put a target that asked the caller (state 2) in accepts', () => {
    // Arrange
    const edges: FriendEdges = { other: FRIEND_STATE.REQUEST_RECEIVED };

    // Act
    const result = classifyTargets(ME, ['other'], edges);

    // Assert
    expect(result).toEqual({ requests: [], accepts: ['other'], noops: [] });
  });

  it.each([
    { label: 'already a friend (state 0)', state: FRIEND_STATE.FRIEND },
    { label: 'already requested (state 1)', state: FRIEND_STATE.REQUEST_SENT },
    { label: 'blocked by the caller (state 3)', state: FRIEND_STATE.BLOCKED },
  ])('should put a target in noops when it is $label', ({ state }) => {
    // Arrange
    const edges: FriendEdges = { other: state };

    // Act
    const result = classifyTargets(ME, ['other'], edges);

    // Assert
    expect(result).toEqual({ requests: [], accepts: [], noops: ['other'] });
  });

  it('should drop the caller own id', () => {
    // Arrange
    const edges: FriendEdges = {};

    // Act
    const result = classifyTargets(ME, [ME, 'other'], edges);

    // Assert
    expect(result).toEqual({ requests: ['other'], accepts: [], noops: [] });
  });

  it('should keep only the first occurrence when a target is repeated', () => {
    // Arrange
    const edges: FriendEdges = { asker: FRIEND_STATE.REQUEST_RECEIVED };

    // Act
    const result = classifyTargets(ME, ['a', 'asker', 'a', 'b', 'asker'], edges);

    // Assert
    expect(result).toEqual({ requests: ['a', 'b'], accepts: ['asker'], noops: [] });
  });

  it('should keep input order within each bucket', () => {
    // Arrange
    const edges: FriendEdges = { f: FRIEND_STATE.FRIEND, r2: FRIEND_STATE.REQUEST_RECEIVED, r1: FRIEND_STATE.REQUEST_RECEIVED };

    // Act
    const result = classifyTargets(ME, ['z', 'r2', 'f', 'a', 'r1'], edges);

    // Assert
    expect(result).toEqual({ requests: ['z', 'a'], accepts: ['r2', 'r1'], noops: ['f'] });
  });

  it('should treat an inherited property name as a target with no edge', () => {
    // Arrange
    const edges: FriendEdges = {};

    // Act
    const result = classifyTargets(ME, ['toString', 'constructor'], edges);

    // Assert
    expect(result).toEqual({ requests: ['toString', 'constructor'], accepts: [], noops: [] });
  });

  it('should return empty buckets when only the caller is targeted', () => {
    // Arrange
    const edges: FriendEdges = {};

    // Act
    const result = classifyTargets(ME, [ME, ME], edges);

    // Assert
    expect(result).toEqual({ requests: [], accepts: [], noops: [] });
  });
});

describe('countEdges', () => {
  it('should count friends (state 0) and outgoing pending (state 1) only', () => {
    // Arrange
    const edges: FriendEdges = {
      ...edgesOf(3, FRIEND_STATE.FRIEND, 'f'),
      ...edgesOf(2, FRIEND_STATE.REQUEST_SENT, 's'),
      ...edgesOf(4, FRIEND_STATE.REQUEST_RECEIVED, 'r'),
      ...edgesOf(5, FRIEND_STATE.BLOCKED, 'b'),
    };

    // Act
    const counts = countEdges(edges);

    // Assert
    expect(counts).toEqual({ friends: 3, outgoingPending: 2 });
  });

  it('should return zero counts when there are no edges', () => {
    // Arrange
    const edges: FriendEdges = {};

    // Act
    const counts = countEdges(edges);

    // Assert
    expect(counts).toEqual({ friends: 0, outgoingPending: 0 });
  });
});

describe('checkFriendLimits', () => {
  const PENDING = FRIEND_LIMITS.MAX_OUTGOING_PENDING;
  const FRIENDS = FRIEND_LIMITS.MAX_FRIENDS;

  it('should allow one new request when the caller has 49 pending', () => {
    // Arrange
    const targets = targetsOf({ requests: ['new'] });

    // Act
    const result = checkFriendLimits(targets, { friends: 0, outgoingPending: PENDING - 1 }, {});

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should reject one new request with friend_outgoing_limit when the caller has 50 pending', () => {
    // Arrange
    const targets = targetsOf({ requests: ['new'] });

    // Act
    const result = checkFriendLimits(targets, { friends: 0, outgoingPending: PENDING }, {});

    // Assert
    expect(result).toEqual({ ok: false, code: 'friend_outgoing_limit' });
  });

  it('should reject two new requests with friend_outgoing_limit when the caller has 49 pending', () => {
    // Arrange
    const targets = targetsOf({ requests: ['new-1', 'new-2'] });

    // Act
    const result = checkFriendLimits(targets, { friends: 0, outgoingPending: PENDING - 1 }, {});

    // Assert
    expect(result).toEqual({ ok: false, code: 'friend_outgoing_limit' });
  });

  it('should allow one accept when the caller has 199 friends', () => {
    // Arrange
    const targets = targetsOf({ accepts: ['asker'] });

    // Act
    const result = checkFriendLimits(targets, { friends: FRIENDS - 1, outgoingPending: 0 }, { asker: 0 });

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should reject one accept with friend_limit when the caller has 200 friends', () => {
    // Arrange
    const targets = targetsOf({ accepts: ['asker'] });

    // Act
    const result = checkFriendLimits(targets, { friends: FRIENDS, outgoingPending: 0 }, { asker: 0 });

    // Assert
    expect(result).toEqual({ ok: false, code: 'friend_limit' });
  });

  it('should reject an accept with friend_their_limit when the other user has 200 friends', () => {
    // Arrange
    const targets = targetsOf({ accepts: ['asker'] });

    // Act
    const result = checkFriendLimits(targets, { friends: 0, outgoingPending: 0 }, { asker: FRIENDS });

    // Assert
    expect(result).toEqual({ ok: false, code: 'friend_their_limit' });
  });

  it('should allow an accept when the other user has 199 friends', () => {
    // Arrange
    const targets = targetsOf({ accepts: ['asker'] });

    // Act
    const result = checkFriendLimits(targets, { friends: 0, outgoingPending: 0 }, { asker: FRIENDS - 1 });

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should treat a missing friend count for the other user as zero', () => {
    // Arrange
    const targets = targetsOf({ accepts: ['asker'] });

    // Act
    const result = checkFriendLimits(targets, { friends: 0, outgoingPending: 0 }, {});

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should not count accepts toward the outgoing limit when the caller has 50 pending', () => {
    // Arrange
    const targets = targetsOf({ accepts: ['asker'] });

    // Act
    const result = checkFriendLimits(targets, { friends: 0, outgoingPending: PENDING }, { asker: 0 });

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should not count new requests toward the friend limit when the caller has 200 friends', () => {
    // Arrange
    const targets = targetsOf({ requests: ['new'] });

    // Act
    const result = checkFriendLimits(targets, { friends: FRIENDS, outgoingPending: 0 }, {});

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should never trigger a limit for noops when every count is over its limit', () => {
    // Arrange
    const targets = targetsOf({ noops: ['friend', 'pending', 'blocked'] });

    // Act
    const result = checkFriendLimits(targets, { friends: FRIENDS + 5, outgoingPending: PENDING + 5 }, {});

    // Assert
    expect(result).toEqual({ ok: true });
  });

  it('should report friend_outgoing_limit first when both the outgoing and friend limits fail', () => {
    // Arrange
    const targets = targetsOf({ requests: ['new'], accepts: ['asker'] });

    // Act
    const result = checkFriendLimits(targets, { friends: FRIENDS, outgoingPending: PENDING }, { asker: FRIENDS });

    // Assert
    expect(result).toEqual({ ok: false, code: 'friend_outgoing_limit' });
  });

  it('should report friend_limit before friend_their_limit when both fail', () => {
    // Arrange
    const targets = targetsOf({ accepts: ['asker'] });

    // Act
    const result = checkFriendLimits(targets, { friends: FRIENDS, outgoingPending: 0 }, { asker: FRIENDS });

    // Assert
    expect(result).toEqual({ ok: false, code: 'friend_limit' });
  });

  it('should reject with friend_their_limit when only the second accepted user is at the limit', () => {
    // Arrange
    const targets = targetsOf({ accepts: ['a', 'b'] });

    // Act
    const result = checkFriendLimits(targets, { friends: 0, outgoingPending: 0 }, { a: FRIENDS - 1, b: FRIENDS });

    // Assert
    expect(result).toEqual({ ok: false, code: 'friend_their_limit' });
  });
});
