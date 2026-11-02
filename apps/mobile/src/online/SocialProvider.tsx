import {
  DEFAULT_PRESENCE_VISIBILITY,
  type PresenceVisibility,
} from '@chkobba/protocol';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import type { DirectoryBackend, SetPresenceVisibilityResult } from './directory';
import type { FriendsBackend } from './friends';
import { loadCachedProfile, type ProfileBackend } from './profile';
import { getDirectoryBackend, getFriendsBackend, getProfileBackend, getSocialSocket } from './services';
import {
  EMPTY_SOCIAL_RELATIONS,
  SocialContext,
  SocialRelationsContext,
  type SocialContextValue,
  type SocialRelations,
} from './socialContext';
import type { SocialSocket } from './socialSocket';

export interface SocialProviderProps {
  readonly children: ReactNode;
  /** Defaults to the app singleton (services.ts); tests pass their own. */
  readonly socket?: SocialSocket;
  /** Defaults to the app singleton (services.ts); tests pass their own. */
  readonly friends?: FriendsBackend;
  /** Defaults to the app singleton (services.ts); tests pass their own. */
  readonly directory?: DirectoryBackend;
  /** Defaults to the app singleton (services.ts); tests pass their own. */
  readonly profile?: ProfileBackend;
}

/**
 * Owns the app-level social socket for the app's lifetime (ADR-0003).
 *
 * On mount it reads the locally cached profile and applies its presence choice
 * before the socket may connect (`loadCachedProfile`): a player who chose
 * Nobody must never appear online, not even briefly at launch. Then it calls
 * `start()`, which connects only when a stored session exists
 * (`GuestAuth.resume`): opening the app for offline play never creates an
 * account. Only `ensureConnected()` (first Friends or online use) may sign in
 * or create the guest. `stop()` on unmount.
 *
 * `setPresenceVisibility` writes the choice through `set_presence_visibility`,
 * then applies it to the socket, which reconnects with the status on or off.
 * Invites and friend state survive that reconnect because the socket keeps
 * them, not each connection.
 */
export function SocialProvider({
  children,
  socket: socketProp,
  friends: friendsProp,
  directory: directoryProp,
  profile: profileProp,
}: SocialProviderProps) {
  const [socket] = useState<SocialSocket>(() => socketProp ?? getSocialSocket());
  const [friends] = useState<FriendsBackend>(() => friendsProp ?? getFriendsBackend());
  const [presenceVisibility, setPresenceVisibilityState] = useState<PresenceVisibility>(DEFAULT_PRESENCE_VISIBILITY);
  const [relations, setRelations] = useState<SocialRelations>(EMPTY_SOCIAL_RELATIONS);
  const [handInProgress, setHandInProgress] = useState(false);
  const directoryRef = useRef<DirectoryBackend | null>(directoryProp ?? null);
  /** Latest relation read; a slower earlier answer must not overwrite a newer one. */
  const relationLoad = useRef(0);
  const profileRef = useRef<ProfileBackend | null>(profileProp ?? null);
  /** Set once the player saves a choice, so a late cache read cannot overwrite it. */
  const chosen = useRef(false);
  /** One cache read shared by the start path and any early `ensureConnected`. */
  const readiness = useRef<Promise<void> | null>(null);

  const ready = useCallback((): Promise<void> => {
    readiness.current ??= loadCachedProfile().then((cached) => {
      if (cached === null || chosen.current) return;
      setPresenceVisibilityState(cached.presenceVisibility);
      void socket.setVisibility(cached.presenceVisibility);
    });
    return readiness.current;
  }, [socket]);

  const subscribe = useCallback((listener: () => void) => socket.subscribe(listener), [socket]);
  const getState = useCallback(() => socket.getState(), [socket]);
  const state = useSyncExternalStore(subscribe, getState, getState);

  useEffect(() => {
    let active = true;
    void ready().then(() => {
      if (active) void socket.start();
    });
    return () => {
      active = false;
      socket.stop();
    };
  }, [ready, socket]);

  const setPresenceVisibility = useCallback(
    async (visibility: PresenceVisibility): Promise<SetPresenceVisibilityResult> => {
      const directory = directoryRef.current ?? (directoryRef.current = getDirectoryBackend());
      const result = await directory.setPresenceVisibility(visibility);
      if (!result.ok) return result;
      chosen.current = true;
      if (result.visibility === 'nobody') {
        // Apply the socket first: the UI must never say Nobody while the socket can appear online.
        await socket.setVisibility('nobody');
        setPresenceVisibilityState('nobody');
      } else {
        setPresenceVisibilityState('everyone');
        await socket.setVisibility('everyone');
      }
      // Best effort: keep the local copy in step, so a relaunch starts from the saved choice.
      const profile = profileRef.current ?? (profileRef.current = getProfileBackend());
      void profile.getProfile().catch(() => undefined);
      return result;
    },
    [socket],
  );

  /**
   * Reads the caller's relation sets and recent-table times through the
   * friends backend the provider already owns. Kept out of `SocialState` (the
   * socket publishes only connection, presence and invitations) and off the
   * profile component (which must never call Nakama itself). Never rejects: a
   * failure keeps the last known relation and the next refresh retries.
   */
  const loadRelations = useCallback((): Promise<void> => {
    const seq = ++relationLoad.current;
    return Promise.all([friends.list(), friends.recentPlayers()]).then(
      ([snapshot, recent]) => {
        if (seq !== relationLoad.current) return;
        setRelations({
          friends: new Set(snapshot.friends.map((entry) => entry.userId)),
          outgoing: new Set(snapshot.outgoing.map((entry) => entry.userId)),
          blocked: new Set(snapshot.blocked.map((entry) => entry.userId)),
          metAt: new Map(recent.map((player) => [player.userId, player.lastPlayedAt])),
          loadedAt: Date.now(),
        });
      },
      () => undefined,
    );
  }, [friends]);

  const connected = state.connected;
  useEffect(() => {
    // Only with a session: `FriendsBackend.list` signs in, and an offline launch
    // must never create (or resume) an account just to read relations.
    if (connected) void loadRelations();
  }, [connected, loadRelations]);

  // A request or acceptance arriving live changes the sets; the socket refreshes
  // its own list, and this keeps the profile's one source in step with it.
  useEffect(() => {
    if (!connected) return;
    return socket.onEvent((event) => {
      if (event.type === 'friend_request' || event.type === 'friend_accept') void loadRelations();
    });
  }, [connected, loadRelations, socket]);

  const value = useMemo<SocialContextValue>(
    () => ({
      state,
      friends,
      ensureConnected: async () => {
        await ready();
        return socket.ensureConnected();
      },
      refreshFriends: async () => {
        await socket.refreshFriends();
        // A friend action just changed an edge; reload the profile's source with it.
        if (socket.getState().connected) await loadRelations();
      },
      dismissInvite: (id) => socket.dismissInvite(id),
      setActivity: (activity) => socket.setActivity(activity),
      presenceVisibility,
      setPresenceVisibility,
      handInProgress,
      setHandInProgress,
      onEvent: (listener) => socket.onEvent(listener),
    }),
    [state, friends, socket, ready, presenceVisibility, setPresenceVisibility, handInProgress, loadRelations],
  );

  return (
    <SocialContext.Provider value={value}>
      <SocialRelationsContext.Provider value={relations}>{children}</SocialRelationsContext.Provider>
    </SocialContext.Provider>
  );
}
