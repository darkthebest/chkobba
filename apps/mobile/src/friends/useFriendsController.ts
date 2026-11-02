import { FRIEND_STATE, type FriendErrorCode, type FriendState } from '@chkobba/protocol';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type {
  FriendActionResult,
  FriendEntry,
  FriendsBackend,
  FriendsSnapshot,
  RecentPlayerEntry,
} from '@/online/friends';
import type { Availability } from '@/online/presence';

import { getFriendsBackend } from '@/online/services';
import { useSocial, useSocialRelations } from '@/online/socialContext';

/**
 * State and actions for the `/friends` screen, shared by the phone and desktop
 * layouts (no layout code here, same rule as `useTableController`).
 *
 * Server data (`list()`, `recentPlayers()`) is kept as loaded. Each friend
 * action adds an optimistic override for that user (their new edge state, or
 * none); the sections are the server data with the overrides applied. An error
 * drops the override (rollback); a success keeps it until a list loaded after
 * the success arrives, so a row never flickers back to its old section.
 *
 * Errors are reason codes, never text: components localize them.
 */

export type FriendActionError = FriendErrorCode | 'not_found' | 'network';

export interface FriendActionFailure {
  readonly userId: string;
  readonly reason: FriendActionError;
}

/** A friend with their live availability (offline when not followed or not seen). */
export interface FriendRow extends FriendEntry {
  readonly availability: Availability;
}

export type LookupStatus = 'idle' | 'checking' | 'found' | 'self' | 'not_found' | 'bad_code' | 'error';

export interface LookupView {
  readonly status: LookupStatus;
  /** Set for `found` and `self`. */
  readonly userId?: string;
  readonly displayName?: string;
  /**
   * For `found`: the current edge with that user (friend, request sent or
   * received, blocked), or null when there is none and Add applies.
   */
  readonly state?: FriendState | null;
}

export interface FriendsControllerOptions {
  /** Defaults to the social context's backend, then the shared singleton. */
  readonly friends?: FriendsBackend;
}

export interface FriendsController {
  readonly loading: boolean;
  readonly loadError: 'network' | null;
  reload(): void;

  readonly incoming: readonly FriendEntry[];
  readonly outgoing: readonly FriendEntry[];
  /** Online first, then in a room, then playing, then offline; ties by name. */
  readonly friends: readonly FriendRow[];
  /** Newest first; blocked players are never listed. */
  readonly recent: readonly RecentPlayerEntry[];
  readonly blocked: readonly FriendEntry[];

  /** User ids with an action in flight; their buttons should be disabled. */
  readonly pending: ReadonlySet<string>;
  /** The last failed action, until the next action for that user or `clearError()`. */
  readonly error: FriendActionFailure | null;
  clearError(): void;

  accept(userId: string): Promise<FriendActionResult>;
  decline(userId: string): Promise<FriendActionResult>;
  cancel(userId: string): Promise<FriendActionResult>;
  add(userId: string): Promise<FriendActionResult>;
  remove(userId: string): Promise<FriendActionResult>;
  block(userId: string): Promise<FriendActionResult>;
  unblock(userId: string): Promise<FriendActionResult>;

  readonly lookup: LookupView;
  lookupCode(code: string): void;
  clearLookup(): void;
  /** Adds the user found by the last lookup; `not_found` when there is none. */
  addFromLookup(): Promise<FriendActionResult>;
}

/** An optimistic edge for one user: `state: null` means no edge. */
interface Override {
  readonly state: FriendState | null;
  readonly displayName: string;
  readonly code: string | null;
  /** Load sequence at success; the override is dropped once a later load lands. Null while in flight. */
  readonly settledAtLoad: number | null;
}

type LookupResultState =
  | { readonly status: 'idle' | 'checking' | 'not_found' | 'bad_code' | 'error' }
  | { readonly status: 'found' | 'self'; readonly userId: string; readonly displayName: string };

const EMPTY_SNAPSHOT: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };
const NO_RECENT: readonly RecentPlayerEntry[] = [];
const IDLE_LOOKUP: LookupResultState = { status: 'idle' };
const AVAILABILITY_ORDER: { readonly [A in Availability]: number } = { online: 0, room: 1, playing: 2, offline: 3 };
/** User ids are UUIDs, so NUL can never occur inside one. */
const ID_KEY_SEPARATOR = '\u0000';

/**
 * A stable, order-insensitive key for a set of ids. The social layer rebuilds
 * its sets on every refresh; comparing keys (not identities) is what keeps an
 * unchanged refresh from triggering a reload.
 */
function idSetKey(ids: Iterable<string>): string {
  const sorted = Array.from(ids);
  sorted.sort();
  return sorted.join(ID_KEY_SEPARATOR);
}

function allEntries(snapshot: FriendsSnapshot): FriendEntry[] {
  return [...snapshot.friends, ...snapshot.incoming, ...snapshot.outgoing, ...snapshot.blocked];
}

/** The server snapshot with every optimistic override applied. */
export function applyOverrides(
  snapshot: FriendsSnapshot,
  overrides: ReadonlyMap<string, Override>,
): FriendsSnapshot {
  if (overrides.size === 0) return snapshot;
  const keep = (entry: FriendEntry) => !overrides.has(entry.userId);
  const merged: FriendEntry[] = allEntries(snapshot).filter(keep);
  overrides.forEach((override, userId) => {
    if (override.state === null) return;
    merged.push({ userId, displayName: override.displayName, code: override.code, state: override.state, updatedAt: 0 });
  });
  return {
    friends: merged.filter((e) => e.state === FRIEND_STATE.FRIEND),
    incoming: merged.filter((e) => e.state === FRIEND_STATE.REQUEST_RECEIVED),
    outgoing: merged.filter((e) => e.state === FRIEND_STATE.REQUEST_SENT),
    blocked: merged.filter((e) => e.state === FRIEND_STATE.BLOCKED),
  };
}

/** Friends with availability, online first, then room, playing, offline; ties by name (locale-aware). */
export function sortFriends(
  friends: readonly FriendEntry[],
  availability: { readonly [userId: string]: Availability },
): FriendRow[] {
  return friends
    .map((entry): FriendRow => ({ ...entry, availability: availability[entry.userId] ?? 'offline' }))
    .sort(
      (a, b) =>
        AVAILABILITY_ORDER[a.availability] - AVAILABILITY_ORDER[b.availability] ||
        a.displayName.localeCompare(b.displayName),
    );
}

/** Recent players with each one's current edge; blocked ones (on the server or just now) are dropped. */
export function mergeRecent(
  recent: readonly RecentPlayerEntry[],
  merged: FriendsSnapshot,
): RecentPlayerEntry[] {
  const states = new Map<string, FriendState>();
  for (const entry of allEntries(merged)) states.set(entry.userId, entry.state);
  const result: RecentPlayerEntry[] = [];
  for (const player of recent) {
    const state = states.get(player.userId) ?? null;
    if (state === FRIEND_STATE.BLOCKED) continue;
    result.push(state === player.state ? player : { ...player, state });
  }
  return result;
}

export function useFriendsController(options: FriendsControllerOptions = {}): FriendsController {
  const social = useSocial();
  // The relation sets the social layer publishes (Task 8.3), one source for every profile surface.
  const relations = useSocialRelations();
  // The context value (and its functions) changes on every social update; read it through a ref.
  const socialRef = useRef(social);
  useLayoutEffect(() => {
    socialRef.current = social;
  });

  const [backend] = useState<FriendsBackend>(() => options.friends ?? social.friends ?? getFriendsBackend());

  const [snapshot, setSnapshot] = useState<FriendsSnapshot>(EMPTY_SNAPSHOT);
  const [recentRaw, setRecentRaw] = useState<readonly RecentPlayerEntry[]>(NO_RECENT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<'network' | null>(null);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Override>>(() => new Map());
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<FriendActionFailure | null>(null);
  const [lookupResult, setLookupResult] = useState<LookupResultState>(IDLE_LOOKUP);
  const [lookupCodeValue, setLookupCodeValue] = useState<string | null>(null);

  const mounted = useRef(true);
  /** Last load started; responses apply only if newer than the last one applied. */
  const loadSeq = useRef(0);
  const appliedLoadSeq = useRef(0);
  /** True while the newest load is unanswered, so the blocked-set effect never stacks a second one. */
  const loadInFlight = useRef(false);
  const lookupSeq = useRef(0);
  /** Mirror of `pending` for synchronous double-tap checks. */
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Fetches the lists in the background; state changes only when they answer (no spinner). */
  const load = useCallback(() => {
    const seq = ++loadSeq.current;
    loadInFlight.current = true;
    Promise.all([backend.list(), backend.recentPlayers()]).then(
      ([list, recent]) => {
        if (!mounted.current || seq <= appliedLoadSeq.current) return;
        appliedLoadSeq.current = seq;
        setSnapshot(list);
        setRecentRaw(recent);
        setLoadError(null);
        if (seq === loadSeq.current) loadInFlight.current = false;
        // Overrides confirmed before this load started are now in the server data.
        setOverrides((current) => {
          let changed = false;
          const next = new Map(current);
          current.forEach((override, userId) => {
            if (override.settledAtLoad !== null && override.settledAtLoad < seq) {
              next.delete(userId);
              changed = true;
            }
          });
          return changed ? next : current;
        });
        if (seq === loadSeq.current) setLoading(false);
      },
      () => {
        if (!mounted.current || seq <= appliedLoadSeq.current) return;
        if (seq === loadSeq.current) {
          loadInFlight.current = false;
          setLoadError('network');
          setLoading(false);
        }
      },
    );
  }, [backend]);

  /** User retry: shows the spinner again and reloads the lists. */
  const reload = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  // Mount: connect the social socket (may create the guest; GuestAuth single-flights sign-in) and load.
  // `loading` starts true, so the first load needs no spinner toggle.
  useEffect(() => {
    void socialRef.current.ensureConnected();
    load();
  }, [load]);

  // Live friend notifications.
  // `onEvent` changes identity with every social update, so subscribe through the ref, once.
  useEffect(
    () =>
      socialRef.current.onEvent((event) => {
        if (event.type === 'friend_request' || event.type === 'friend_accept') load();
      }),
    [load],
  );

  // The incoming count changed on the socket (request, accept, or decline elsewhere).
  const incomingCount = social.state.incomingRequests;
  const seenIncoming = useRef(incomingCount);
  useEffect(() => {
    if (seenIncoming.current === incomingCount) return;
    seenIncoming.current = incomingCount;
    load();
  }, [incomingCount, load]);

  // The blocked set is the one relation change this controller cannot see from
  // its own snapshot: a block or unblock performed on a profile (Task 8.8) goes
  // through the social layer, not through `run`. When the published set no
  // longer matches the snapshot, reload once. Keys, not identities, so an
  // unchanged refresh (including the one `run` triggers itself) costs nothing.
  const publishedBlockedKey = useMemo(() => idSetKey(relations.blocked), [relations.blocked]);
  const snapshotBlockedKey = useMemo(
    () => idSetKey(snapshot.blocked.map((entry) => entry.userId)),
    [snapshot.blocked],
  );
  useEffect(() => {
    // Nothing published yet: the mount load is the source of truth.
    if (relations.loadedAt === 0) return;
    if (publishedBlockedKey === snapshotBlockedKey) return;
    // A load already started after the change (this controller's own action, or the mount load).
    if (loadInFlight.current) return;
    load();
  }, [load, publishedBlockedKey, relations.loadedAt, snapshotBlockedKey]);

  const merged = useMemo(() => applyOverrides(snapshot, overrides), [snapshot, overrides]);
  const availability = social.state.availability;
  const friends = useMemo(() => sortFriends(merged.friends, availability), [merged.friends, availability]);
  const recent = useMemo(() => mergeRecent(recentRaw, merged), [recentRaw, merged]);

  // Latest data for actions, so their identities stay stable.
  const dataRef = useRef({ merged, recentRaw, lookupResult, lookupCodeValue });
  useLayoutEffect(() => {
    dataRef.current = { merged, recentRaw, lookupResult, lookupCodeValue };
  });

  const identityOf = useCallback((userId: string): { displayName: string; code: string | null } => {
    const { merged: current, recentRaw: recentList, lookupResult: found, lookupCodeValue: code } = dataRef.current;
    const entry = allEntries(current).find((e) => e.userId === userId);
    if (entry) return { displayName: entry.displayName, code: entry.code };
    const player = recentList.find((p) => p.userId === userId);
    if (player) return { displayName: player.displayName, code: null };
    if (found.status === 'found' && found.userId === userId) return { displayName: found.displayName, code };
    return { displayName: '', code: null };
  }, []);

  const currentState = useCallback((userId: string): FriendState | null => {
    const entry = allEntries(dataRef.current.merged).find((e) => e.userId === userId);
    return entry ? entry.state : null;
  }, []);

  const setPendingFor = useCallback((userId: string, on: boolean) => {
    if (on) inFlight.current.add(userId);
    else inFlight.current.delete(userId);
    setPending(new Set(inFlight.current));
  }, []);

  /** Runs one edge call with an optimistic override for `userId`. */
  const run = useCallback(
    async (
      userId: string,
      nextState: FriendState | null,
      call: (id: string) => Promise<FriendActionResult>,
    ): Promise<FriendActionResult> => {
      if (inFlight.current.has(userId)) return { ok: false, reason: 'network' };
      const identity = identityOf(userId);
      setPendingFor(userId, true);
      setError((current) => (current?.userId === userId ? null : current));
      setOverrides((current) => {
        const next = new Map(current);
        next.set(userId, { state: nextState, ...identity, settledAtLoad: null });
        return next;
      });

      let result: FriendActionResult;
      try {
        result = await call(userId);
      } catch {
        result = { ok: false, reason: 'network' };
      }
      if (!mounted.current) return result;

      setPendingFor(userId, false);
      if (result.ok) {
        const settledAt = loadSeq.current;
        setOverrides((current) => {
          const override = current.get(userId);
          if (!override) return current;
          const next = new Map(current);
          next.set(userId, { ...override, settledAtLoad: settledAt });
          return next;
        });
        load();
        void socialRef.current.refreshFriends();
      } else {
        const reason = result.reason;
        setOverrides((current) => {
          if (!current.has(userId)) return current;
          const next = new Map(current);
          next.delete(userId);
          return next;
        });
        setError({ userId, reason });
      }
      return result;
    },
    [identityOf, load, setPendingFor],
  );

  const add = useCallback(
    (userId: string) => {
      // Adding someone who asked first accepts them.
      const accepting = currentState(userId) === FRIEND_STATE.REQUEST_RECEIVED;
      return run(userId, accepting ? FRIEND_STATE.FRIEND : FRIEND_STATE.REQUEST_SENT, (id) => backend.add(id));
    },
    [backend, currentState, run],
  );
  const accept = useCallback(
    (userId: string) => run(userId, FRIEND_STATE.FRIEND, (id) => backend.add(id)),
    [backend, run],
  );
  const removeEdge = useCallback(
    (userId: string) => run(userId, null, (id) => backend.remove(id)),
    [backend, run],
  );
  const block = useCallback(
    (userId: string) => run(userId, FRIEND_STATE.BLOCKED, (id) => backend.block(id)),
    [backend, run],
  );

  const clearError = useCallback(() => setError(null), []);

  const lookupCode = useCallback(
    (code: string) => {
      const seq = ++lookupSeq.current;
      setLookupResult({ status: 'checking' });
      setLookupCodeValue(null);
      backend.lookupCode(code).then(
        (result) => {
          if (!mounted.current || seq !== lookupSeq.current) return;
          if (result.ok) {
            setLookupResult({
              status: result.self ? 'self' : 'found',
              userId: result.userId,
              displayName: result.displayName,
            });
            setLookupCodeValue(code);
          } else {
            setLookupResult({ status: result.reason === 'network' ? 'error' : result.reason });
          }
        },
        () => {
          if (mounted.current && seq === lookupSeq.current) setLookupResult({ status: 'error' });
        },
      );
    },
    [backend],
  );

  const clearLookup = useCallback(() => {
    lookupSeq.current++;
    setLookupResult(IDLE_LOOKUP);
    setLookupCodeValue(null);
  }, []);

  const addFromLookup = useCallback((): Promise<FriendActionResult> => {
    const found = dataRef.current.lookupResult;
    if (found.status !== 'found') return Promise.resolve({ ok: false, reason: 'not_found' });
    return add(found.userId);
  }, [add]);

  const lookup = useMemo((): LookupView => {
    if (lookupResult.status === 'found') {
      const entry = allEntries(merged).find((e) => e.userId === lookupResult.userId);
      return {
        status: 'found',
        userId: lookupResult.userId,
        displayName: lookupResult.displayName,
        state: entry ? entry.state : null,
      };
    }
    if (lookupResult.status === 'self') {
      return { status: 'self', userId: lookupResult.userId, displayName: lookupResult.displayName };
    }
    return { status: lookupResult.status };
  }, [lookupResult, merged]);

  return {
    loading,
    loadError,
    reload,
    incoming: merged.incoming,
    outgoing: merged.outgoing,
    friends,
    recent,
    blocked: merged.blocked,
    pending,
    error,
    clearError,
    accept,
    decline: removeEdge,
    cancel: removeEdge,
    add,
    remove: removeEdge,
    block,
    unblock: removeEdge,
    lookup,
    lookupCode,
    clearLookup,
    addFromLookup,
  };
}
