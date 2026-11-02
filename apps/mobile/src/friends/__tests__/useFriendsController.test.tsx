/**
 * useFriendsController: the friends screen's state over a fake FriendsBackend
 * and ProfileBackend, with the social context provided directly. Backend calls
 * resolve on demand (deferred) where a test needs the in-flight state.
 */
import { FRIEND_STATE, type FriendState } from '@chkobba/protocol';
import { FIXTURE_FRIEND_CODE } from '@chkobba/protocol/testing';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type {
  CodeLookupResult,
  FriendActionResult,
  FriendEntry,
  FriendsBackend,
  FriendsSnapshot,
  RecentPlayerEntry,
} from '@/online/friends';
import type { Availability } from '@/online/presence';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';
import type { SocialEvent } from '@/online/socialSocket';

import {
  applyOverrides,
  mergeRecent,
  sortFriends,
  useFriendsController,
  type FriendsController,
} from '../useFriendsController';

// The real module builds a nakama-js client; every test injects its backends instead.
jest.mock('@/online/services', () => ({
  getFriendsBackend: () => {
    throw new Error('getFriendsBackend must not be used in these tests');
  },
  getProfileBackend: () => {
    throw new Error('getProfileBackend must not be used in these tests');
  },
}));

const OWN_CODE = 'HJKM6789';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function entry(userId: string, displayName: string, state: FriendState): FriendEntry {
  return { userId, displayName, code: null, state, updatedAt: 0 };
}

function recentPlayer(userId: string, displayName: string, state: FriendState | null = null): RecentPlayerEntry {
  return { userId, displayName, lastPlayedAt: 1000, state };
}

function snapshotOf(entries: readonly FriendEntry[]): FriendsSnapshot {
  return {
    friends: entries.filter((e) => e.state === FRIEND_STATE.FRIEND),
    incoming: entries.filter((e) => e.state === FRIEND_STATE.REQUEST_RECEIVED),
    outgoing: entries.filter((e) => e.state === FRIEND_STATE.REQUEST_SENT),
    blocked: entries.filter((e) => e.state === FRIEND_STATE.BLOCKED),
  };
}

const NADIA_INCOMING = entry('u-nadia', 'Nadia', FRIEND_STATE.REQUEST_RECEIVED);
const OMAR_OUTGOING = entry('u-omar', 'Omar', FRIEND_STATE.REQUEST_SENT);
const SAMI_FRIEND = entry('u-sami', 'Sami', FRIEND_STATE.FRIEND);
const LINA_BLOCKED = entry('u-lina', 'Lina', FRIEND_STATE.BLOCKED);
const KARIM_RECENT = recentPlayer('u-karim', 'Karim');

const OK: FriendActionResult = { ok: true };

function makeBackend(
  options: { entries?: readonly FriendEntry[]; recent?: readonly RecentPlayerEntry[] } = {},
) {
  const state = {
    snapshot: snapshotOf(options.entries ?? [NADIA_INCOMING, OMAR_OUTGOING, SAMI_FRIEND, LINA_BLOCKED]),
    recent: options.recent ?? [KARIM_RECENT, recentPlayer('u-sami', 'Sami', FRIEND_STATE.FRIEND)],
  };
  const backend = {
    list: jest.fn((): Promise<FriendsSnapshot> => Promise.resolve(state.snapshot)),
    recentPlayers: jest.fn((): Promise<readonly RecentPlayerEntry[]> => Promise.resolve(state.recent)),
    lookupCode: jest.fn(
      (_code: string): Promise<CodeLookupResult> =>
        Promise.resolve({ ok: true, userId: 'u-karim', displayName: 'Karim', self: false }),
    ),
    add: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve(OK)),
    remove: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve(OK)),
    block: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve(OK)),
    invite: jest.fn(() => Promise.resolve({ ok: true as const, sent: true })),
  } satisfies FriendsBackend;
  return { backend, state };
}


function makeSocial(overrides: Partial<SocialContextValue> = {}) {
  const listeners = new Set<(event: SocialEvent) => void>();
  const value: SocialContextValue = {
    state: EMPTY_SOCIAL_STATE,
    friends: null,
    ensureConnected: jest.fn(() => Promise.resolve(true)),
    refreshFriends: jest.fn(() => Promise.resolve()),
    dismissInvite: jest.fn(() => Promise.resolve()),
    setActivity: jest.fn(),
    presenceVisibility: 'everyone',
    setPresenceVisibility: jest.fn(() => Promise.resolve({ ok: false, reason: 'network' })),
    handInProgress: false,
    setHandInProgress: jest.fn(),
    onEvent: jest.fn((listener: (event: SocialEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    ...overrides,
  };
  const emit = (event: SocialEvent) => listeners.forEach((listener) => listener(event));
  return { value, emit };
}

/** Lets backend promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function setup(
  options: {
    backend?: FriendsBackend;
    social?: SocialContextValue;
  } = {},
) {
  const backend = options.backend ?? makeBackend().backend;
  const socialRef = { current: options.social ?? makeSocial().value };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SocialContext.Provider value={socialRef.current}>{children}</SocialContext.Provider>
  );
  const hook = await renderHook(() => useFriendsController({ friends: backend }), { wrapper });
  await settle();
  const current = (): FriendsController => hook.result.current;
  return { ...hook, current, socialRef };
}

const ids = (list: readonly { userId: string }[]) => list.map((e) => e.userId);

describe('useFriendsController', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sortFriends', () => {
    it('should order friends online, in a room, playing, then offline', () => {
      // Arrange
      const friends = [
        entry('a', 'Anis', FRIEND_STATE.FRIEND),
        entry('b', 'Bilel', FRIEND_STATE.FRIEND),
        entry('c', 'Chiraz', FRIEND_STATE.FRIEND),
        entry('d', 'Dora', FRIEND_STATE.FRIEND),
      ];
      const availability: Record<string, Availability> = { a: 'offline', b: 'playing', c: 'room', d: 'online' };

      // Act
      const sorted = sortFriends(friends, availability);

      // Assert
      expect(ids(sorted)).toEqual(['d', 'c', 'b', 'a']);
    });

    it('should break availability ties by name', () => {
      // Arrange
      const friends = [
        entry('z', 'Zied', FRIEND_STATE.FRIEND),
        entry('a', 'Amel', FRIEND_STATE.FRIEND),
        entry('m', 'Mehdi', FRIEND_STATE.FRIEND),
      ];

      // Act
      const sorted = sortFriends(friends, { z: 'online', a: 'online', m: 'online' });

      // Assert
      expect(sorted.map((f) => f.displayName)).toEqual(['Amel', 'Mehdi', 'Zied']);
    });

    it('should treat friends without a presence as offline', () => {
      // Arrange
      const friends = [entry('a', 'Amel', FRIEND_STATE.FRIEND)];

      // Act
      const sorted = sortFriends(friends, {});

      // Assert
      expect(sorted[0]?.availability).toBe('offline');
    });
  });

  describe('applyOverrides', () => {
    it('should return the snapshot unchanged when there are no overrides', () => {
      // Arrange
      const snapshot = snapshotOf([SAMI_FRIEND]);

      // Act
      const result = applyOverrides(snapshot, new Map());

      // Assert
      expect(result).toBe(snapshot);
    });

    it('should move a user to the section of their override state', () => {
      // Arrange
      const snapshot = snapshotOf([NADIA_INCOMING]);
      const overrides = new Map([
        ['u-nadia', { state: FRIEND_STATE.FRIEND, displayName: 'Nadia', code: null, settledAtLoad: null }],
      ]);

      // Act
      const result = applyOverrides(snapshot, overrides);

      // Assert
      expect({ friends: ids(result.friends), incoming: ids(result.incoming) }).toEqual({
        friends: ['u-nadia'],
        incoming: [],
      });
    });

    it('should drop a user whose override has no edge', () => {
      // Arrange
      const snapshot = snapshotOf([SAMI_FRIEND]);
      const overrides = new Map([['u-sami', { state: null, displayName: 'Sami', code: null, settledAtLoad: null }]]);

      // Act
      const result = applyOverrides(snapshot, overrides);

      // Assert
      expect(result.friends).toEqual([]);
    });
  });

  describe('mergeRecent', () => {
    it('should drop recent players who are blocked', () => {
      // Arrange
      const merged = snapshotOf([entry('u-karim', 'Karim', FRIEND_STATE.BLOCKED)]);

      // Act
      const result = mergeRecent([KARIM_RECENT], merged);

      // Assert
      expect(result).toEqual([]);
    });

    it('should give each recent player their current edge', () => {
      // Arrange
      const merged = snapshotOf([entry('u-karim', 'Karim', FRIEND_STATE.REQUEST_SENT)]);

      // Act
      const result = mergeRecent([KARIM_RECENT], merged);

      // Assert
      expect(result[0]?.state).toBe(FRIEND_STATE.REQUEST_SENT);
    });

    it('should clear the edge of a recent player who is no longer in any list', () => {
      // Arrange
      const player = recentPlayer('u-sami', 'Sami', FRIEND_STATE.FRIEND);

      // Act
      const result = mergeRecent([player], snapshotOf([]));

      // Assert
      expect(result[0]?.state).toBeNull();
    });
  });

  describe('loading', () => {
    it('should connect the social socket on mount', async () => {
      // Arrange
      const social = makeSocial();

      // Act
      await setup({ social: social.value });

      // Assert
      expect(social.value.ensureConnected).toHaveBeenCalledTimes(1);
    });

    it('should split the loaded list into its sections', async () => {
      // Arrange
      // (default backend)

      // Act
      const { current } = await setup();

      // Assert
      expect({
        incoming: ids(current().incoming),
        outgoing: ids(current().outgoing),
        friends: ids(current().friends),
        blocked: ids(current().blocked),
        recent: ids(current().recent),
      }).toEqual({
        incoming: ['u-nadia'],
        outgoing: ['u-omar'],
        friends: ['u-sami'],
        blocked: ['u-lina'],
        recent: ['u-karim', 'u-sami'],
      });
    });

    it('should stop loading once the lists arrive', async () => {
      // Arrange
      // (default backend)

      // Act
      const { current } = await setup();

      // Assert
      expect(current().loading).toBe(false);
    });

    it('should report a network load error when the list fails', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.list.mockRejectedValue(new Error('offline'));

      // Act
      const { current } = await setup({ backend });

      // Assert
      expect(current().loadError).toBe('network');
    });

    it('should sort friends by the live availability from the social state', async () => {
      // Arrange
      const { backend } = makeBackend({
        entries: [entry('a', 'Anis', FRIEND_STATE.FRIEND), entry('b', 'Bilel', FRIEND_STATE.FRIEND)],
      });
      const social = makeSocial({ state: { ...EMPTY_SOCIAL_STATE, availability: { b: 'online' } } });

      // Act
      const { current } = await setup({ backend, social: social.value });

      // Assert
      expect(ids(current().friends)).toEqual(['b', 'a']);
    });
  });

  describe('optimistic actions', () => {
    it('should move an accepted request into friends before the server answers', async () => {
      // Arrange
      const { backend } = makeBackend();
      const answer = deferred<FriendActionResult>();
      backend.add.mockReturnValueOnce(answer.promise);
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        void current().accept('u-nadia');
      });

      // Assert
      expect(ids(current().friends)).toContain('u-nadia');
    });

    it('should mark the user pending while the action is in flight', async () => {
      // Arrange
      const { backend } = makeBackend();
      const answer = deferred<FriendActionResult>();
      backend.remove.mockReturnValueOnce(answer.promise);
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        void current().cancel('u-omar');
      });

      // Assert
      expect(current().pending.has('u-omar')).toBe(true);
    });

    it('should clear pending once the action answers', async () => {
      // Arrange
      const { current } = await setup();

      // Act
      await act(async () => {
        await current().cancel('u-omar');
      });

      // Assert
      expect(current().pending.size).toBe(0);
    });

    it('should call the backend only once when the same user is tapped twice in flight', async () => {
      // Arrange
      const { backend } = makeBackend();
      const answer = deferred<FriendActionResult>();
      backend.add.mockReturnValueOnce(answer.promise);
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        void current().accept('u-nadia');
        void current().accept('u-nadia');
      });

      // Assert
      expect(backend.add).toHaveBeenCalledTimes(1);
    });

    it('should refresh the social friend list after a successful action', async () => {
      // Arrange
      const social = makeSocial();
      const { current } = await setup({ social: social.value });

      // Act
      await act(async () => {
        await current().accept('u-nadia');
      });

      // Assert
      expect(social.value.refreshFriends).toHaveBeenCalledTimes(1);
    });

    it('should accept instead of sending a request when adding someone who asked first', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.add.mockReturnValueOnce(new Promise(() => undefined));
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        void current().add('u-nadia');
      });

      // Assert
      expect(ids(current().friends)).toContain('u-nadia');
    });

    it('should show a recent player as request sent right after Add', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.add.mockReturnValueOnce(new Promise(() => undefined));
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        void current().add('u-karim');
      });

      // Assert
      expect(current().recent.find((p) => p.userId === 'u-karim')?.state).toBe(FRIEND_STATE.REQUEST_SENT);
    });

    it('should follow the server list once a load started after the success lands', async () => {
      // Arrange
      const { backend } = makeBackend();
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        await current().accept('u-nadia');
      });
      await settle();

      // Assert (this fake server never stored the accept, so the reloaded list wins)
      expect(ids(current().friends)).toEqual(['u-sami']);
    });
  });

  describe('block', () => {
    it.each([
      ['a friend', 'u-sami', 'friends'],
      ['an incoming request', 'u-nadia', 'incoming'],
      ['an outgoing request', 'u-omar', 'outgoing'],
    ] as const)('should remove %s from their section immediately', async (_label, userId, section) => {
      // Arrange
      const { backend } = makeBackend();
      backend.block.mockReturnValueOnce(new Promise(() => undefined));
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        void current().block(userId);
      });

      // Assert
      expect(ids(current()[section])).not.toContain(userId);
    });

    it('should remove a blocked recent player from recent immediately', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.block.mockReturnValueOnce(new Promise(() => undefined));
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        void current().block('u-karim');
      });

      // Assert
      expect(ids(current().recent)).not.toContain('u-karim');
    });

    it('should add the player to blocked immediately with their name', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.block.mockReturnValueOnce(new Promise(() => undefined));
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        void current().block('u-karim');
      });

      // Assert
      expect(current().blocked.find((e) => e.userId === 'u-karim')?.displayName).toBe('Karim');
    });
  });

  describe('rollback on error', () => {
    type Action = 'accept' | 'decline' | 'cancel' | 'add' | 'remove' | 'block' | 'unblock';
    type Section = 'incoming' | 'outgoing' | 'friends' | 'blocked' | 'recent';
    type Call = 'add' | 'remove' | 'block';
    const cases: readonly { action: Action; userId: string; section: Section; call: Call }[] = [
      { action: 'accept', userId: 'u-nadia', section: 'incoming', call: 'add' },
      { action: 'decline', userId: 'u-nadia', section: 'incoming', call: 'remove' },
      { action: 'cancel', userId: 'u-omar', section: 'outgoing', call: 'remove' },
      { action: 'add', userId: 'u-karim', section: 'recent', call: 'add' },
      { action: 'remove', userId: 'u-sami', section: 'friends', call: 'remove' },
      { action: 'block', userId: 'u-sami', section: 'friends', call: 'block' },
      { action: 'unblock', userId: 'u-lina', section: 'blocked', call: 'remove' },
    ];

    it.each(cases)('should put the user back in $section when $action fails', async ({ action, userId, section, call }) => {
      // Arrange
      const { backend } = makeBackend();
      backend[call].mockResolvedValueOnce({ ok: false, reason: 'friend_limit' });
      const { current } = await setup({ backend });
      const before = ids(current()[section]);

      // Act
      await act(async () => {
        await current()[action](userId);
      });

      // Assert
      expect(ids(current()[section])).toEqual(before);
    });

    it.each(cases)('should report the userId and reason when $action fails', async ({ action, userId, call }) => {
      // Arrange
      const { backend } = makeBackend();
      backend[call].mockResolvedValueOnce({ ok: false, reason: 'friend_outgoing_limit' });
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        await current()[action](userId);
      });

      // Assert
      expect(current().error).toEqual({ userId, reason: 'friend_outgoing_limit' });
    });

    it('should report a network error when the backend call throws', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.add.mockRejectedValueOnce(new Error('socket closed'));
      const { current } = await setup({ backend });

      // Act
      await act(async () => {
        await current().add('u-karim');
      });

      // Assert
      expect(current().error).toEqual({ userId: 'u-karim', reason: 'network' });
    });

    it('should clear the error of a user when a new action for them starts', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.add.mockResolvedValueOnce({ ok: false, reason: 'friend_limit' });
      const { current } = await setup({ backend });
      await act(async () => {
        await current().add('u-karim');
      });

      // Act
      await act(async () => {
        await current().add('u-karim');
      });

      // Assert
      expect(current().error).toBeNull();
    });

    it('should clear the error on clearError', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.add.mockResolvedValueOnce({ ok: false, reason: 'friend_limit' });
      const { current } = await setup({ backend });
      await act(async () => {
        await current().add('u-karim');
      });

      // Act
      await act(async () => current().clearError());

      // Assert
      expect(current().error).toBeNull();
    });
  });

  describe('social events', () => {
    it.each(['friend_request', 'friend_accept'] as const)('should reload the lists on a %s event', async (type) => {
      // Arrange
      const { backend } = makeBackend();
      const social = makeSocial();
      await setup({ backend, social: social.value });
      backend.list.mockClear();

      // Act
      await act(async () => social.emit({ type, userId: 'u-x', displayName: 'X' }));
      await settle();

      // Assert
      expect(backend.list).toHaveBeenCalledTimes(1);
    });

    it('should not reload the lists on a table invite', async () => {
      // Arrange
      const { backend } = makeBackend();
      const social = makeSocial();
      await setup({ backend, social: social.value });
      backend.list.mockClear();

      // Act
      await act(async () =>
        social.emit({
          type: 'table_invite',
          invite: { id: 'i1', fromUserId: 'u-x', fromName: 'X', code: 'K7M2QX', sentAt: 0 },
        } as unknown as SocialEvent),
      );
      await settle();

      // Assert
      expect(backend.list).not.toHaveBeenCalled();
    });

    it('should show the new request after a friend_request event', async () => {
      // Arrange
      const { backend, state } = makeBackend({ entries: [] });
      const social = makeSocial();
      const { current } = await setup({ backend, social: social.value });
      state.snapshot = snapshotOf([NADIA_INCOMING]);

      // Act
      await act(async () => social.emit({ type: 'friend_request', userId: 'u-nadia', displayName: 'Nadia' }));
      await settle();

      // Assert
      expect(ids(current().incoming)).toEqual(['u-nadia']);
    });

    it('should reload the lists when the incoming request count changes', async () => {
      // Arrange
      const { backend } = makeBackend();
      const social = makeSocial();
      const hook = await setup({ backend, social: social.value });
      backend.list.mockClear();
      hook.socialRef.current = { ...social.value, state: { ...EMPTY_SOCIAL_STATE, incomingRequests: 2 } };

      // Act
      await hook.rerender({});
      await settle();

      // Assert
      expect(backend.list).toHaveBeenCalledTimes(1);
    });
  });

  describe('stale responses', () => {
    it('should ignore an older list that answers after a newer one', async () => {
      // Arrange
      const { backend } = makeBackend();
      const first = deferred<FriendsSnapshot>();
      const second = deferred<FriendsSnapshot>();
      backend.list.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      const social = makeSocial();
      const { current } = await setup({ backend, social: social.value });
      await act(async () => social.emit({ type: 'friend_request', userId: 'u-x', displayName: 'X' }));

      // Act
      await act(async () => second.resolve(snapshotOf([NADIA_INCOMING])));
      await settle();
      await act(async () => first.resolve(snapshotOf([])));
      await settle();

      // Assert
      expect(ids(current().incoming)).toEqual(['u-nadia']);
    });

    it('should ignore an older lookup that answers after a newer one', async () => {
      // Arrange
      const { backend } = makeBackend();
      const first = deferred<CodeLookupResult>();
      backend.lookupCode
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce({ ok: true, userId: 'u-karim', displayName: 'Karim', self: false });
      const { current } = await setup({ backend });
      await act(async () => current().lookupCode('AAAA2222'));
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));
      await settle();

      // Act
      await act(async () => first.resolve({ ok: false, reason: 'not_found' }));
      await settle();

      // Assert
      expect(current().lookup.status).toBe('found');
    });

    it('should drop a lookup answer that arrives after clearLookup', async () => {
      // Arrange
      const { backend } = makeBackend();
      const answer = deferred<CodeLookupResult>();
      backend.lookupCode.mockReturnValueOnce(answer.promise);
      const { current } = await setup({ backend });
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));
      await act(async () => current().clearLookup());

      // Act
      await act(async () => answer.resolve({ ok: true, userId: 'u-karim', displayName: 'Karim', self: false }));
      await settle();

      // Assert
      expect(current().lookup.status).toBe('idle');
    });
  });

  describe('lookup', () => {
    it('should start idle', async () => {
      // Arrange
      // (default backend)

      // Act
      const { current } = await setup();

      // Assert
      expect(current().lookup).toEqual({ status: 'idle' });
    });

    it('should be checking while the lookup is in flight', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.lookupCode.mockReturnValueOnce(new Promise(() => undefined));
      const { current } = await setup({ backend });

      // Act
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));

      // Assert
      expect(current().lookup.status).toBe('checking');
    });

    it('should show a found player with no edge', async () => {
      // Arrange
      const { current } = await setup();

      // Act
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));
      await settle();

      // Assert
      expect(current().lookup).toEqual({ status: 'found', userId: 'u-karim', displayName: 'Karim', state: null });
    });

    it('should show the current edge when the found player is already a friend', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.lookupCode.mockResolvedValueOnce({ ok: true, userId: 'u-sami', displayName: 'Sami', self: false });
      const { current } = await setup({ backend });

      // Act
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));
      await settle();

      // Assert
      expect(current().lookup.state).toBe(FRIEND_STATE.FRIEND);
    });

    it('should report self for the player own code', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.lookupCode.mockResolvedValueOnce({ ok: true, userId: 'u-me', displayName: 'Hamza', self: true });
      const { current } = await setup({ backend });

      // Act
      await act(async () => current().lookupCode(OWN_CODE));
      await settle();

      // Assert
      expect(current().lookup.status).toBe('self');
    });

    it.each([
      ['not_found', 'not_found'],
      ['bad_code', 'bad_code'],
      ['network', 'error'],
    ] as const)('should map a %s lookup failure to the %s status', async (reason, status) => {
      // Arrange
      const { backend } = makeBackend();
      backend.lookupCode.mockResolvedValueOnce({ ok: false, reason });
      const { current } = await setup({ backend });

      // Act
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));
      await settle();

      // Assert
      expect(current().lookup.status).toBe(status);
    });

    it('should show an error when the lookup rejects', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.lookupCode.mockRejectedValueOnce(new Error('offline'));
      const { current } = await setup({ backend });

      // Act
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));
      await settle();

      // Assert
      expect(current().lookup.status).toBe('error');
    });

    it('should send a request to the found player on addFromLookup', async () => {
      // Arrange
      const { backend } = makeBackend();
      const { current } = await setup({ backend });
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));
      await settle();

      // Act
      await act(async () => {
        await current().addFromLookup();
      });

      // Assert
      expect(backend.add).toHaveBeenCalledWith('u-karim');
    });

    it('should show the found player as request sent right after addFromLookup', async () => {
      // Arrange
      const { backend } = makeBackend();
      backend.add.mockReturnValueOnce(new Promise(() => undefined));
      const { current } = await setup({ backend });
      await act(async () => current().lookupCode(FIXTURE_FRIEND_CODE));
      await settle();

      // Act
      await act(async () => {
        void current().addFromLookup();
      });

      // Assert
      expect(current().lookup.state).toBe(FRIEND_STATE.REQUEST_SENT);
    });

    it('should answer not_found from addFromLookup when nobody was found', async () => {
      // Arrange
      const { current } = await setup();
      let result: FriendActionResult | undefined;

      // Act
      await act(async () => {
        result = await current().addFromLookup();
      });

      // Assert
      expect(result).toEqual({ ok: false, reason: 'not_found' });
    });
  });
});
