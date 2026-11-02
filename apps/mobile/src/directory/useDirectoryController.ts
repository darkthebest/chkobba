import { normalizeQuery, SEARCH_MIN_CHARS, type DirectoryPlayer } from '@chkobba/protocol';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { FriendsController } from '@/friends/useFriendsController';
import type { DirectoryBackend, DirectoryError } from '@/online/directory';
import type { FriendActionResult } from '@/online/friends';
import type { Availability } from '@/online/presence';
import { getDirectoryBackend, getSocialSocket } from '@/online/services';
import { useSocial, useSocialRelations } from '@/online/socialContext';
import { TEMPORARY_FOLLOW_LIMIT, type SocialSocket } from '@/online/socialSocket';

/**
 * State and actions for the `/players` screen, shared by the phone and desktop
 * layouts (no layout code, strings or i18n here, same rule as
 * `useTableController`).
 *
 * Search is debounced and sequence-guarded: every logical query change bumps a
 * counter and only the response tagged with the current counter is applied, so
 * a slow earlier answer can never overwrite a newer one. Paging is a second
 * request under the same counter, guarded so it cannot overlap itself or a new
 * query. The state is a small discriminated union, not a pile of booleans.
 *
 * While results are on screen their ids are followed on the social socket (a
 * bounded prefix) so availability can arrive; leaving the screen clears the
 * temporary follows. The relation and Add action come from the friends
 * controller the screen already owns, so there is exactly one set of optimistic
 * edges and one rollback path.
 */

/** Debounce after the last keystroke before a first-page search is issued. */
export const SEARCH_DEBOUNCE_MS = 300;

/** The edge chip's value: mutual friend, outgoing request pending, or neither. */
export type DirectoryRelation = 'friends' | 'requested' | 'none';

/** The friends fields this controller reads; never a second controller instance. */
export type DirectoryFriendsSource = Pick<FriendsController, 'friends' | 'outgoing' | 'pending' | 'add'>;

/** The social-socket call used for the temporary-follow lifecycle. */
export type DirectoryFollowSource = Pick<SocialSocket, 'setTemporaryFollows'>;

/** Progress of an in-flight next-page request, nested in the `results` state. */
export type DirectoryPaging =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly reason: DirectoryError };

/**
 * What the screen renders:
 * - `idle`: the query is empty, so the screen shows recent players.
 * - `hint`: the folded query is shorter than `SEARCH_MIN_CHARS`.
 * - `loading`: the first page is being debounced or fetched (skeleton).
 * - `empty`: a search ran and matched nobody.
 * - `error`: the search was refused; the screen localizes the reason.
 * - `results`: rows, the next cursor, the cap flag and the paging progress.
 */
export type DirectorySearchState =
  | { readonly status: 'idle' }
  | { readonly status: 'hint' }
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'error'; readonly reason: DirectoryError }
  | {
      readonly status: 'results';
      readonly players: readonly DirectoryPlayer[];
      readonly nextCursor: string | null;
      readonly capped: boolean;
      readonly paging: DirectoryPaging;
    };

export interface DirectoryControllerOptions {
  /** Defaults to the shared singleton. */
  readonly backend?: DirectoryBackend;
  /**
   * The friends controller the screen already created. Omission degrades to no
   * relation chip and an inert Add; it never creates a second controller.
   */
  readonly friends?: DirectoryFriendsSource;
  /** Defaults to the app's social socket singleton. */
  readonly follows?: DirectoryFollowSource;
}

export interface DirectoryController {
  /** The raw query, exactly as typed. */
  readonly query: string;
  setQuery(query: string): void;
  readonly state: DirectorySearchState;
  /** Appends the next page when there is one; guarded against overlap and new queries. */
  loadMore(): void;
  /** Re-runs the current query immediately (the error state's retry). */
  retry(): void;
  relationOf(userId: string): DirectoryRelation;
  /** True while a friend action for this user is in flight. */
  pendingOf(userId: string): boolean;
  /** Delegates to the friends controller, keeping its optimistic edge and rollback. */
  addFriend(userId: string): Promise<FriendActionResult>;
  /**
   * The social state's availability for this user, or undefined when no
   * presence arrived (not followed, beyond the follow cap, or the server sent
   * none). Pair it with `player.presence`: a `hidden` player must not be
   * rendered as offline, and that decision stays in the row component.
   */
  availabilityOf(userId: string): Availability | undefined;
}

interface FollowRequest {
  /** Empty for "clear"; distinct from an empty results list only by intent. */
  readonly key: string;
  readonly ids: readonly string[];
}

const IDLE_STATE: DirectorySearchState = { status: 'idle' };
const HINT_STATE: DirectorySearchState = { status: 'hint' };
const LOADING_STATE: DirectorySearchState = { status: 'loading' };
const IDLE_PAGING: DirectoryPaging = { status: 'idle' };
const EMPTY_FOLLOW_IDS: readonly string[] = [];
/** User ids are UUIDs, so NUL can never occur inside one. */
const FOLLOW_KEY_SEPARATOR = '\u0000';

/** A stable, order-insensitive key for a set of ids; a refresh that changes nothing keeps its key. */
function idSetKey(ids: Iterable<string>): string {
  const sorted = Array.from(ids);
  sorted.sort();
  return sorted.join(FOLLOW_KEY_SEPARATOR);
}

/** Dedupes in order and stops at the follow cap; a silent follow of every result would be worse. */
function boundedFollowIds(players: readonly DirectoryPlayer[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const player of players) {
    if (seen.has(player.userId)) continue;
    seen.add(player.userId);
    ids.push(player.userId);
    if (ids.length === TEMPORARY_FOLLOW_LIMIT) break;
  }
  return ids;
}

export function useDirectoryController(options: DirectoryControllerOptions = {}): DirectoryController {
  const social = useSocial();
  // The blocked set the social layer publishes (Task 8.3), read below to re-query stale results.
  const relations = useSocialRelations();
  // The context value changes with every social update; the mount effect reads it through a ref.
  const socialRef = useRef(social);
  useLayoutEffect(() => {
    socialRef.current = social;
  });

  const [backend] = useState<DirectoryBackend>(() => options.backend ?? getDirectoryBackend());
  const [follows] = useState<DirectoryFollowSource>(() => options.follows ?? getSocialSocket());

  const friendRows = options.friends?.friends;
  const outgoingRows = options.friends?.outgoing;
  const pendingIds = options.friends?.pending;
  const addEdge = options.friends?.add;

  const [query, setQueryState] = useState('');
  const [state, setState] = useState<DirectorySearchState>(IDLE_STATE);

  const mounted = useRef(true);
  /** Bumped by every logical query change; only the matching response is applied. */
  const seq = useRef(0);
  /** The folded query whose results are on screen; paging reuses it. */
  const activeQuery = useRef('');
  /** Synchronous in-flight flag for `loadMore` (state updates are async). */
  const paging = useRef(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Mirror of `state` for synchronous guards. */
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  });

  useEffect(() => {
    mounted.current = true;
    // The directory is an online surface: connect so availability can arrive even
    // when the screen has no friends controller to trigger this.
    void socialRef.current.ensureConnected();
    return () => {
      mounted.current = false;
      seq.current += 1;
      if (debounce.current !== null) {
        clearTimeout(debounce.current);
        debounce.current = null;
      }
    };
  }, []);

  const cancelDebounce = useCallback(() => {
    if (debounce.current !== null) {
      clearTimeout(debounce.current);
      debounce.current = null;
    }
  }, []);

  /** Fetches the first page; applies only when it is still the newest request. */
  const searchFirst = useCallback(
    (normalized: string, request: number) => {
      backend.search(normalized).then(
        (page) => {
          if (!mounted.current || request !== seq.current) return;
          activeQuery.current = normalized;
          paging.current = false;
          if (!page.ok) {
            setState({ status: 'error', reason: page.reason });
            return;
          }
          if (page.players.length === 0) {
            setState({ status: 'empty' });
            return;
          }
          setState({
            status: 'results',
            players: page.players,
            nextCursor: page.nextCursor,
            capped: page.capped,
            paging: IDLE_PAGING,
          });
        },
        () => {
          if (!mounted.current || request !== seq.current) return;
          paging.current = false;
          setState({ status: 'error', reason: 'network' });
        },
      );
    },
    [backend],
  );

  /** Starts a logical query: invalidates every request in flight, then gates, debounces or fetches. */
  const runQuery = useCallback(
    (raw: string, immediate: boolean) => {
      const request = ++seq.current;
      cancelDebounce();
      paging.current = false;
      const normalized = normalizeQuery(raw);
      if (normalized === '') {
        setState(IDLE_STATE);
        return;
      }
      if (normalized.length < SEARCH_MIN_CHARS) {
        setState(HINT_STATE);
        return;
      }
      setState(LOADING_STATE);
      if (immediate) {
        searchFirst(normalized, request);
        return;
      }
      debounce.current = setTimeout(() => {
        debounce.current = null;
        searchFirst(normalized, request);
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancelDebounce, searchFirst],
  );

  const setQuery = useCallback(
    (raw: string) => {
      setQueryState(raw);
      runQuery(raw, false);
    },
    [runQuery],
  );

  const retry = useCallback(() => runQuery(query, true), [query, runQuery]);

  const loadMore = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== 'results') return;
    if (current.nextCursor === null) return;
    if (paging.current) return;
    const cursor = current.nextCursor;
    const normalized = activeQuery.current;
    const request = seq.current;
    paging.current = true;
    setState((previous) =>
      previous.status === 'results' ? { ...previous, paging: { status: 'loading' } } : previous,
    );
    backend.search(normalized, cursor).then(
      (page) => {
        if (!mounted.current || request !== seq.current) return;
        paging.current = false;
        if (!page.ok) {
          setState((previous) =>
            previous.status === 'results'
              ? { ...previous, paging: { status: 'error', reason: page.reason } }
              : previous,
          );
          return;
        }
        setState((previous) => {
          if (previous.status !== 'results') return previous;
          // Later pages follow storage order: drop only ids already shown, never re-sort.
          const known = new Set(previous.players.map((player) => player.userId));
          const added = page.players.filter((player) => !known.has(player.userId));
          return {
            status: 'results',
            players: added.length === 0 ? previous.players : [...previous.players, ...added],
            nextCursor: page.nextCursor,
            capped: previous.capped || page.capped,
            paging: IDLE_PAGING,
          };
        });
      },
      () => {
        if (!mounted.current || request !== seq.current) return;
        paging.current = false;
        setState((previous) =>
          previous.status === 'results'
            ? { ...previous, paging: { status: 'error', reason: 'network' } }
            : previous,
        );
      },
    );
  }, [backend]);

  // --- Blocked players -----------------------------------------------------

  /**
   * A block performed on a profile (Task 8.8) publishes a new blocked set
   * through the social layer; this controller never sees the block call itself.
   * When the set changes while a search is on screen, re-run that query — the
   * server hides blocked players in both directions, so a fresh search is what
   * removes the row (there is no client-side filter to drift from the server).
   * The first published set only sets the baseline: results fetched before it
   * arrived were already filtered by the same server rule, so they cost no
   * second query. A query change alone never triggers this effect.
   */
  const blockedKey = useMemo(() => idSetKey(relations.blocked), [relations.blocked]);
  const seenBlockedKey = useRef<string | null>(null);
  useEffect(() => {
    if (relations.loadedAt === 0) return;
    if (seenBlockedKey.current === blockedKey) return;
    const first = seenBlockedKey.current === null;
    seenBlockedKey.current = blockedKey;
    if (first) return;
    const current = stateRef.current;
    // `loading` too: an answer issued before the block could still land with the blocked row.
    if (current.status !== 'results' && current.status !== 'loading') return;
    runQuery(query, true);
  }, [blockedKey, query, relations.loadedAt, runQuery]);

  // --- Relations, pending and availability ---------------------------------

  const friendUserIds = useMemo(
    () => new Set((friendRows ?? []).map((entry) => entry.userId)),
    [friendRows],
  );
  const outgoingUserIds = useMemo(
    () => new Set((outgoingRows ?? []).map((entry) => entry.userId)),
    [outgoingRows],
  );

  const relationOf = useCallback(
    (userId: string): DirectoryRelation => {
      if (friendUserIds.has(userId)) return 'friends';
      if (outgoingUserIds.has(userId)) return 'requested';
      return 'none';
    },
    [friendUserIds, outgoingUserIds],
  );

  const pendingOf = useCallback(
    (userId: string): boolean => pendingIds?.has(userId) ?? false,
    [pendingIds],
  );

  const addFriend = useCallback(
    (userId: string): Promise<FriendActionResult> =>
      addEdge === undefined ? Promise.resolve({ ok: false, reason: 'network' }) : addEdge(userId),
    [addEdge],
  );

  const availability = social.state.availability;
  const availabilityOf = useCallback(
    (userId: string): Availability | undefined => availability[userId],
    [availability],
  );

  // --- Temporary follows ---------------------------------------------------

  const resultPlayers = state.status === 'results' ? state.players : null;
  const followRequest = useMemo((): FollowRequest | null => {
    if (resultPlayers !== null) {
      const ids = boundedFollowIds(resultPlayers);
      return { key: ids.join(FOLLOW_KEY_SEPARATOR), ids };
    }
    // A first page is loading: keep the previous follows rather than clearing
    // and re-following on every keystroke (the socket diffs, so one pass is cheap).
    if (state.status === 'loading') return null;
    return { key: '', ids: EMPTY_FOLLOW_IDS };
  }, [resultPlayers, state.status]);

  /**
   * Last list handed to the socket; an identical list is a no-op by construction.
   * Starts at the empty key so mounting with no results issues no call at all.
   */
  const appliedFollowKey = useRef<string | null>('');
  useEffect(() => {
    if (followRequest === null) return;
    if (appliedFollowKey.current === followRequest.key) return;
    appliedFollowKey.current = followRequest.key;
    void follows.setTemporaryFollows(followRequest.ids).catch(() => undefined);
  }, [follows, followRequest]);

  // Leaving the directory stops following strangers.
  useEffect(
    () => () => {
      appliedFollowKey.current = null;
      void follows.setTemporaryFollows(EMPTY_FOLLOW_IDS).catch(() => undefined);
    },
    [follows],
  );

  return {
    query,
    setQuery,
    state,
    loadMore,
    retry,
    relationOf,
    pendingOf,
    addFriend,
    availabilityOf,
  };
}
