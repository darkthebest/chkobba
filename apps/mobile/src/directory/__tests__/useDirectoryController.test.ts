/**
 * useDirectoryController: the `/players` search state over a fake
 * DirectoryBackend and fake follow source. Backend calls resolve on demand
 * (deferred) where a test needs the in-flight state; the 300 ms debounce runs
 * on fake timers.
 */
import { FRIEND_STATE, type DirectoryPlayer } from '@chkobba/protocol';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import type { DirectoryBackend, DirectoryPage } from '@/online/directory';
import type { FriendActionResult, FriendEntry } from '@/online/friends';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';
import { TEMPORARY_FOLLOW_LIMIT } from '@/online/socialSocket';

import {
  SEARCH_DEBOUNCE_MS,
  useDirectoryController,
  type DirectoryController,
  type DirectoryFollowSource,
  type DirectoryFriendsSource,
  type DirectoryRelation,
} from '../useDirectoryController';

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

function player(userId: string, name: string, presence: DirectoryPlayer['presence'] = 'visible'): DirectoryPlayer {
  return { userId, name, presence };
}

function page(players: DirectoryPlayer[], nextCursor: string | null = null, capped = false): DirectoryPage {
  return { ok: true, players, nextCursor, capped };
}

function friendEntry(userId: string, displayName: string, state: FriendEntry['state'] = FRIEND_STATE.FRIEND): FriendEntry {
  return { userId, displayName, code: null, state, updatedAt: 0 };
}

const NADIA = player('u-nadia', 'Nadia');
const OMAR = player('u-omar', 'Omar');
const SAMI = player('u-sami', 'Sami');

/** A DirectoryBackend whose search answers an empty last page by default. */
function makeBackend() {
  return {
    search: jest.fn((_query: string, _cursor?: string | null): Promise<DirectoryPage> => Promise.resolve(page([]))),
    profile: jest.fn(),
    setPresenceVisibility: jest.fn(),
  } satisfies DirectoryBackend;
}

function makeFriends(overrides: Partial<DirectoryFriendsSource> = {}): DirectoryFriendsSource {
  return {
    friends: [],
    outgoing: [],
    pending: new Set<string>(),
    add: jest.fn((): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    ...overrides,
  };
}

function makeSocial(): SocialContextValue {
  return {
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
    onEvent: jest.fn(() => () => undefined),
  };
}

function makeFollows() {
  return {
    setTemporaryFollows: jest.fn((_userIds: readonly string[]): Promise<void> => Promise.resolve()),
  } satisfies DirectoryFollowSource;
}

const socialWrapper = (social: SocialContextValue) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(SocialContext.Provider, { value: social }, children);
  };

/** Lets backend promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function setup(
  options: {
    backend?: ReturnType<typeof makeBackend>;
    friends?: DirectoryFriendsSource;
    follows?: ReturnType<typeof makeFollows>;
  } = {},
) {
  const backend = options.backend ?? makeBackend();
  const friends = options.friends ?? makeFriends();
  const follows = options.follows ?? makeFollows();
  const social = makeSocial();
  const wrapper = socialWrapper(social);
  const hook = await renderHook(() => useDirectoryController({ backend, friends, follows }), { wrapper });
  const current = (): DirectoryController => hook.result.current;
  return { ...hook, current, backend, friends, follows, social };
}

async function typeQuery(current: () => DirectoryController, text: string): Promise<void> {
  await act(async () => {
    current().setQuery(text);
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** Types a searchable query and lets its debounced request settle. */
async function search(current: () => DirectoryController, text: string): Promise<void> {
  await typeQuery(current, text);
  await advance(SEARCH_DEBOUNCE_MS);
  await settle();
}

describe('useDirectoryController', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('search gate and debounce', () => {
    it('should show the hint and make no request when the query has one character', async () => {
      // Arrange
      const { current, backend } = await setup();

      // Act
      await typeQuery(current, 'a');

      // Assert
      expect(current().state.status).toBe('hint');
      expect(backend.search).not.toHaveBeenCalled();
    });

    it('should load the skeleton state while the debounce is pending', async () => {
      // Arrange
      const { current } = await setup();

      // Act
      await typeQuery(current, 'na');

      // Assert
      expect(current().state.status).toBe('loading');
    });

    it('should search exactly once after the 300 ms debounce when the query has two characters', async () => {
      // Arrange
      const { current, backend } = await setup();

      // Act
      await typeQuery(current, 'na');
      await advance(SEARCH_DEBOUNCE_MS - 1);
      const beforeDeadline = backend.search.mock.calls.length;
      await advance(1);

      // Assert
      expect(beforeDeadline).toBe(0);
      expect(backend.search).toHaveBeenCalledTimes(1);
      expect(backend.search).toHaveBeenCalledWith('na');
    });

    it('should search only the last query when more is typed during the debounce window', async () => {
      // Arrange
      const { current, backend } = await setup();

      // Act
      await typeQuery(current, 'na');
      await advance(SEARCH_DEBOUNCE_MS - 100);
      await typeQuery(current, 'nadia');
      await advance(SEARCH_DEBOUNCE_MS);
      await settle();

      // Assert
      expect(backend.search).toHaveBeenCalledTimes(1);
      expect(backend.search).toHaveBeenCalledWith('nadia');
    });

    it('should search the folded query when the query has mixed case', async () => {
      // Arrange
      const { current, backend } = await setup();

      // Act
      await search(current, 'Nadia');

      // Assert
      expect(backend.search).toHaveBeenCalledWith('nadia');
    });
  });

  describe('first page', () => {
    it('should expose the results, cursor and cap flag when the search answers', async () => {
      // Arrange
      const { current, backend } = await setup();
      backend.search.mockResolvedValueOnce(page([NADIA, OMAR], 'cursor-1'));

      // Act
      await search(current, 'na');

      // Assert
      expect(current().state).toEqual({
        status: 'results',
        players: [NADIA, OMAR],
        nextCursor: 'cursor-1',
        capped: false,
        paging: { status: 'idle' },
      });
    });

    it('should settle on empty when the search matches nobody', async () => {
      // Arrange
      const { current, backend } = await setup();
      backend.search.mockResolvedValueOnce(page([]));

      // Act
      await search(current, 'zz');

      // Assert
      expect(current().state).toEqual({ status: 'empty' });
    });

    it('should report the server reason when the search is refused', async () => {
      // Arrange
      const { current, backend } = await setup();
      backend.search.mockResolvedValueOnce({ ok: false, reason: 'directory_rate_limited' });

      // Act
      await search(current, 'na');

      // Assert
      expect(current().state).toEqual({ status: 'error', reason: 'directory_rate_limited' });
    });

    it('should report a network error when the search rejects', async () => {
      // Arrange
      const { current, backend } = await setup();
      backend.search.mockRejectedValueOnce(new Error('offline'));

      // Act
      await search(current, 'na');

      // Assert
      expect(current().state).toEqual({ status: 'error', reason: 'network' });
    });

    it('should retry immediately, without the debounce, when retry is called', async () => {
      // Arrange
      const { current, backend } = await setup();
      backend.search
        .mockResolvedValueOnce({ ok: false, reason: 'directory_rate_limited' })
        .mockResolvedValueOnce(page([NADIA]));
      await search(current, 'na');

      // Act
      await act(async () => {
        current().retry();
      });
      await settle();

      // Assert
      expect(backend.search).toHaveBeenCalledTimes(2);
      expect(current().state.status).toBe('results');
    });
  });

  describe('paging', () => {
    async function withFirstPage(
      current: () => DirectoryController,
      backend: ReturnType<typeof makeBackend>,
      nextCursor: string | null,
    ): Promise<void> {
      backend.search.mockResolvedValueOnce(page([NADIA], nextCursor));
      await search(current, 'na');
    }

    it('should append the next page to the existing rows', async () => {
      // Arrange
      const { current, backend } = await setup();
      await withFirstPage(current, backend, 'cursor-1');
      backend.search.mockResolvedValueOnce(page([OMAR], null));

      // Act
      await act(async () => {
        current().loadMore();
      });
      await settle();

      // Assert
      expect(current().state).toMatchObject({
        status: 'results',
        players: [NADIA, OMAR],
        nextCursor: null,
        paging: { status: 'idle' },
      });
      expect(backend.search).toHaveBeenLastCalledWith('na', 'cursor-1');
    });

    it('should not request another page when the last page has no cursor', async () => {
      // Arrange
      const { current, backend } = await setup();
      await withFirstPage(current, backend, null);

      // Act
      await act(async () => {
        current().loadMore();
      });
      await settle();

      // Assert
      expect(backend.search).toHaveBeenCalledTimes(1);
    });

    it('should keep the existing rows when the next page is refused', async () => {
      // Arrange
      const { current, backend } = await setup();
      await withFirstPage(current, backend, 'cursor-1');
      backend.search.mockResolvedValueOnce({ ok: false, reason: 'network' });

      // Act
      await act(async () => {
        current().loadMore();
      });
      await settle();

      // Assert
      expect(current().state).toMatchObject({
        status: 'results',
        players: [NADIA],
        paging: { status: 'error', reason: 'network' },
      });
    });

    it('should keep the existing rows when the next page rejects', async () => {
      // Arrange
      const { current, backend } = await setup();
      await withFirstPage(current, backend, 'cursor-1');
      backend.search.mockRejectedValueOnce(new Error('offline'));

      // Act
      await act(async () => {
        current().loadMore();
      });
      await settle();

      // Assert
      expect(current().state).toMatchObject({
        status: 'results',
        players: [NADIA],
        paging: { status: 'error', reason: 'network' },
      });
    });

    it('should ignore a second loadMore while the next page is in flight', async () => {
      // Arrange
      const { current, backend } = await setup();
      await withFirstPage(current, backend, 'cursor-1');
      const answer = deferred<DirectoryPage>();
      backend.search.mockReturnValueOnce(answer.promise);

      // Act
      await act(async () => {
        current().loadMore();
        current().loadMore();
      });
      await settle();

      // Assert
      expect(backend.search).toHaveBeenCalledTimes(2);
    });

    it('should drop a next page that arrives after a new query started', async () => {
      // Arrange
      const { current, backend } = await setup();
      await withFirstPage(current, backend, 'cursor-1');
      const paged = deferred<DirectoryPage>();
      backend.search.mockReturnValueOnce(paged.promise);
      await act(async () => {
        current().loadMore();
      });
      backend.search.mockResolvedValueOnce(page([SAMI]));
      await search(current, 'sa');

      // Act
      await act(async () => paged.resolve(page([OMAR])));
      await settle();

      // Assert
      expect(current().state).toMatchObject({ status: 'results', players: [SAMI] });
    });
  });

  describe('stale responses', () => {
    it('should ignore an older search that resolves after a newer one', async () => {
      // Arrange
      const { current, backend } = await setup();
      const older = deferred<DirectoryPage>();
      const newer = deferred<DirectoryPage>();
      backend.search.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      await typeQuery(current, 'aa');
      await advance(SEARCH_DEBOUNCE_MS);
      await typeQuery(current, 'bb');
      await advance(SEARCH_DEBOUNCE_MS);

      // Act
      await act(async () => newer.resolve(page([player('u-new', 'Behia')])));
      await settle();
      await act(async () => older.resolve(page([player('u-old', 'Anis')])));
      await settle();

      // Assert
      expect(current().state).toMatchObject({ status: 'results', players: [{ userId: 'u-new' }] });
    });

    it('should ignore an older search that rejects after a newer one resolved', async () => {
      // Arrange
      const { current, backend } = await setup();
      const older = deferred<DirectoryPage>();
      const newer = deferred<DirectoryPage>();
      backend.search.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      await typeQuery(current, 'aa');
      await advance(SEARCH_DEBOUNCE_MS);
      await typeQuery(current, 'bb');
      await advance(SEARCH_DEBOUNCE_MS);

      // Act
      await act(async () => newer.resolve(page([player('u-new', 'Behia')])));
      await settle();
      await act(async () => older.reject(new Error('offline')));
      await settle();

      // Assert
      expect(current().state).toMatchObject({ status: 'results', players: [{ userId: 'u-new' }] });
    });

    it('should ignore a search that answers after its query was cleared', async () => {
      // Arrange
      const { current, backend } = await setup();
      const answer = deferred<DirectoryPage>();
      backend.search.mockReturnValueOnce(answer.promise);
      await typeQuery(current, 'na');
      await advance(SEARCH_DEBOUNCE_MS);

      // Act
      await typeQuery(current, '');
      await act(async () => answer.resolve(page([NADIA])));
      await settle();

      // Assert
      expect(current().state).toEqual({ status: 'idle' });
    });
  });

  describe('temporary follows', () => {
    it('should follow the ids on screen so availability can arrive', async () => {
      // Arrange
      const { current, backend, follows } = await setup();
      backend.search.mockResolvedValueOnce(page([NADIA, OMAR]));

      // Act
      await search(current, 'na');

      // Assert
      expect(follows.setTemporaryFollows).toHaveBeenLastCalledWith(['u-nadia', 'u-omar']);
    });

    it('should follow at most the bounded prefix of the results', async () => {
      // Arrange
      const { current, backend, follows } = await setup();
      const many = Array.from({ length: TEMPORARY_FOLLOW_LIMIT + 1 }, (_, index) =>
        player(`u-${index}`, `Player ${index}`),
      );
      backend.search.mockResolvedValueOnce(page(many));

      // Act
      await search(current, 'pl');

      // Assert
      expect(follows.setTemporaryFollows).toHaveBeenLastCalledWith(
        many.slice(0, TEMPORARY_FOLLOW_LIMIT).map((entry) => entry.userId),
      );
    });

    it('should stop following the results when the query becomes empty', async () => {
      // Arrange
      const { current, backend, follows } = await setup();
      backend.search.mockResolvedValueOnce(page([NADIA]));
      await search(current, 'na');

      // Act
      await typeQuery(current, '');
      await settle();

      // Assert
      expect(follows.setTemporaryFollows).toHaveBeenLastCalledWith([]);
    });

    it('should stop following when the search matches nobody', async () => {
      // Arrange
      const { current, backend, follows } = await setup();
      backend.search.mockResolvedValueOnce(page([NADIA])).mockResolvedValueOnce(page([]));
      await search(current, 'na');

      // Act
      await search(current, 'zz');

      // Assert
      expect(follows.setTemporaryFollows).toHaveBeenLastCalledWith([]);
    });

    it('should clear the temporary follows on unmount', async () => {
      // Arrange
      const { current, backend, follows, unmount } = await setup();
      backend.search.mockResolvedValueOnce(page([NADIA]));
      await search(current, 'na');

      // Act
      await unmount();

      // Assert
      expect(follows.setTemporaryFollows).toHaveBeenLastCalledWith([]);
    });
  });

  describe('relations and actions', () => {
    it('should report a mutual friend as friends', async () => {
      // Arrange
      const friends = makeFriends({
        friends: [{ ...friendEntry('u-sami', 'Sami'), availability: 'online' }],
      });
      const { current } = await setup({ friends });

      // Act
      const relation: DirectoryRelation = current().relationOf('u-sami');

      // Assert
      expect(relation).toBe('friends');
    });

    it('should report an outgoing request as requested and everyone else as none', async () => {
      // Arrange
      const friends = makeFriends({ outgoing: [friendEntry('u-omar', 'Omar', FRIEND_STATE.REQUEST_SENT)] });
      const { current } = await setup({ friends });

      // Act
      const outgoing = current().relationOf('u-omar');
      const stranger = current().relationOf('u-nadia');

      // Assert
      expect({ outgoing, stranger }).toEqual({ outgoing: 'requested', stranger: 'none' });
    });

    it('should expose a pending action and delegate add to the friends controller', async () => {
      // Arrange
      const add = jest.fn((): Promise<FriendActionResult> => Promise.resolve({ ok: true }));
      const friends = makeFriends({ pending: new Set(['u-nadia']), add });
      const { current } = await setup({ friends });

      // Act
      const pending = current().pendingOf('u-nadia');
      await act(async () => {
        await current().addFriend('u-nadia');
      });

      // Assert
      expect({ pending, addCalledWith: add.mock.calls }).toEqual({ pending: true, addCalledWith: [['u-nadia']] });
    });

    it('should answer a failed add, without throwing, when no friends controller was given', async () => {
      // Arrange
      const backend = makeBackend();
      const follows = makeFollows();
      const { result } = await renderHook(() => useDirectoryController({ backend, follows }), {
        wrapper: socialWrapper(makeSocial()),
      });

      // Act
      const answer = await result.current.addFriend('u-nadia');

      // Assert
      expect(answer).toEqual({ ok: false, reason: 'network' });
    });
  });
});
