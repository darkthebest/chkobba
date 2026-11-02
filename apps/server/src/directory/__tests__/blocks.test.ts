/**
 * Block visibility (ADR-0004 section 11): the caller's own state-3 list is read
 * once and tolerates truncation; the reverse "does the candidate block me"
 * check fails closed on a throw, a malformed page or a truncated page; and one
 * predicate decides both directions so search and profile cannot disagree.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRIEND_STATE } from '@chkobba/protocol';
import {
  isCandidateVisible,
  isHiddenByBlock,
  doesCandidateBlockCaller,
  listContains,
  readBlockedSet,
  type BlockView,
} from '../blocks';
import { createFakeNk } from '../../__tests__/fakes';

const CALLER = 'user-caller';
const CANDIDATE = 'user-candidate';
const BLOCKED = FRIEND_STATE.BLOCKED;
const FRIEND = FRIEND_STATE.FRIEND;

let nk: ReturnType<typeof createFakeNk>;

/** An empty block view; a test fills `blocked` with `readBlockedSet` when it matters. */
function emptyView(): BlockView {
  return { blocked: [], blockedBy: [] };
}

beforeEach(() => {
  nk = createFakeNk();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readBlockedSet', () => {
  it('should return the caller\'s own state-3 ids and no friends', () => {
    // Arrange
    nk.fake.setFriendEdge(CALLER, 'u-a', BLOCKED);
    nk.fake.setFriendEdge(CALLER, 'u-b', BLOCKED);
    nk.fake.setFriendEdge(CALLER, 'u-friend', FRIEND);

    // Act
    const blocked = readBlockedSet(nk, CALLER);

    // Assert
    expect(blocked).toEqual(['u-a', 'u-b']);
  });

  it('should tolerate a truncated own list instead of throwing', () => {
    // Arrange: more blocks than one page (the fake caps at 1000).
    nk.fake.seedManyFriends(CALLER, 1001, BLOCKED);

    // Act
    const blocked = readBlockedSet(nk, CALLER);

    // Assert
    expect(blocked.length).toBe(1000);
  });

  it('should read a malformed page as no blocks', () => {
    // Arrange
    nk.fake.setFriendsListResult(CALLER, { friends: 'not-an-array' });

    // Act
    const blocked = readBlockedSet(nk, CALLER);

    // Assert
    expect(blocked).toEqual([]);
  });
});

describe('doesCandidateBlockCaller', () => {
  it('should answer true when the candidate blocked the caller', () => {
    // Arrange
    nk.fake.setFriendEdge(CANDIDATE, CALLER, BLOCKED);

    // Act
    const blocks = doesCandidateBlockCaller(nk, CANDIDATE, CALLER);

    // Assert
    expect(blocks).toBe(true);
  });

  it('should answer false for a clean candidate', () => {
    // Arrange (no edges)

    // Act
    const blocks = doesCandidateBlockCaller(nk, CANDIDATE, CALLER);

    // Assert
    expect(blocks).toBe(false);
  });

  it('should fail closed when the candidate\'s list call throws', () => {
    // Arrange
    nk.fake.failFriendsListFor(CANDIDATE);

    // Act
    const blocks = doesCandidateBlockCaller(nk, CANDIDATE, CALLER);

    // Assert
    expect(blocks).toBe(true);
  });

  it('should fail closed on a malformed page', () => {
    // Arrange
    nk.fake.setFriendsListResult(CANDIDATE, { friends: null });

    // Act
    const blocks = doesCandidateBlockCaller(nk, CANDIDATE, CALLER);

    // Assert
    expect(blocks).toBe(true);
  });

  it('should fail closed when the candidate\'s list is truncated', () => {
    // Arrange: the caller may sit on the unread remainder of the 1000-row page.
    nk.fake.seedManyFriends(CANDIDATE, 1001, BLOCKED);

    // Act
    const blocks = doesCandidateBlockCaller(nk, CANDIDATE, CALLER);

    // Assert
    expect(blocks).toBe(true);
  });
});

describe('isCandidateVisible', () => {
  it('should hide a candidate the caller blocked', () => {
    // Arrange: the caller's own blocks arrive in the view, as `readBlockedSet` returns them.
    nk.fake.setFriendEdge(CALLER, CANDIDATE, BLOCKED);

    // Act
    const visible = isCandidateVisible(
      nk,
      { blocked: readBlockedSet(nk, CALLER), blockedBy: [] },
      CALLER,
      CANDIDATE,
    );

    // Assert
    expect(visible).toBe(false);
  });

  it('should hide a candidate who blocked the caller', () => {
    // Arrange
    nk.fake.setFriendEdge(CANDIDATE, CALLER, BLOCKED);

    // Act
    const visible = isCandidateVisible(nk, emptyView(), CALLER, CANDIDATE);

    // Assert
    expect(visible).toBe(false);
  });

  it('should agree in both directions for a blocked pair', () => {
    // Arrange: one block removes the reverse edge, so the second answer must come from the candidate's own list.
    nk.fake.setFriendEdge(CALLER, CANDIDATE, BLOCKED);

    // Act
    const callerSeesCandidate = isCandidateVisible(nk, { blocked: readBlockedSet(nk, CALLER), blockedBy: [] }, CALLER, CANDIDATE);
    const candidateSeesCaller = isCandidateVisible(nk, { blocked: readBlockedSet(nk, CANDIDATE), blockedBy: [] }, CANDIDATE, CALLER);

    // Assert
    expect({ callerSeesCandidate, candidateSeesCaller }).toEqual({ callerSeesCandidate: false, candidateSeesCaller: false });
  });

  it('should agree in both directions for a clean pair', () => {
    // Arrange (no edges)

    // Act
    const callerSeesCandidate = isCandidateVisible(nk, emptyView(), CALLER, CANDIDATE);
    const candidateSeesCaller = isCandidateVisible(nk, emptyView(), CANDIDATE, CALLER);

    // Assert
    expect({ callerSeesCandidate, candidateSeesCaller }).toEqual({ callerSeesCandidate: true, candidateSeesCaller: true });
  });
});

describe('the pure block predicates', () => {
  it('should hide a candidate recorded as blocking the caller', () => {
    // Arrange
    const view: BlockView = { blocked: [], blockedBy: [CANDIDATE] };

    // Act
    const hidden = isHiddenByBlock(view, CANDIDATE);

    // Assert
    expect(hidden).toBe(true);
  });

  it('should find an id in a list', () => {
    // Arrange
    const ids = ['u-a', 'u-b'];

    // Act
    const found = listContains(ids, 'u-b');
    const missing = listContains(ids, 'u-c');

    // Assert
    expect({ found, missing }).toEqual({ found: true, missing: false });
  });
});
