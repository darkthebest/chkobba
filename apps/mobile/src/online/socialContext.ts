import { DEFAULT_PRESENCE_VISIBILITY, type PresenceActivity, type PresenceVisibility } from '@chkobba/protocol';
import { createContext, useContext } from 'react';

import type { SetPresenceVisibilityResult } from './directory';
import type { FriendsBackend } from './friends';
import type { SocialEvent, SocialState } from './socialSocket';

/**
 * The caller's relation to other players, as the app-level source every
 * profile surface can reach. Membership is by user id: the profile only needs
 * "is this player in the set", and keeping sets (not the full entries) stops a
 * second copy of the friend list from drifting from the controller's one.
 *
 * `outgoing` is the outgoing-pending edge only; an incoming request belongs to
 * `friends`, not to "Request sent". `metAt` is the newest shared-table time per
 * player from the caller's own recent-players record; an absent id means there
 * is no record, never "not met".
 */
export interface SocialRelations {
  readonly friends: ReadonlySet<string>;
  readonly outgoing: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
  readonly metAt: ReadonlyMap<string, number>;
  /**
   * When this snapshot was read (epoch ms). Renderers format `metAt` against
   * it rather than reading the clock during render.
   */
  readonly loadedAt: number;
}

export const EMPTY_SOCIAL_RELATIONS: SocialRelations = {
  friends: new Set<string>(),
  outgoing: new Set<string>(),
  blocked: new Set<string>(),
  metAt: new Map<string, number>(),
  loadedAt: 0,
};

export interface SocialContextValue {
  /** Connection, friend availability, incoming request count and table invites. */
  readonly state: SocialState;
  /** Friend actions; null when no provider is mounted. */
  readonly friends: FriendsBackend | null;
  /**
   * Connects for first Friends or online use, signing in or creating the guest
   * if needed. Resolves false when it couldn't (a retry may be scheduled).
   */
  ensureConnected(): Promise<boolean>;
  /** Reloads the friend list and re-follows; call after any friend action. Never rejects. */
  refreshFriends(): Promise<void>;
  /** Hides an invite and deletes its notification. Never rejects. */
  dismissInvite(id: string): Promise<void>;
  /** Sets the public status: `lobby`, `room` or `playing` (never a code). */
  setActivity(activity: PresenceActivity): void;
  /** The saved presence choice; Everyone until the stored profile says otherwise. */
  readonly presenceVisibility: PresenceVisibility;
  /**
   * Saves the choice on the server and applies it to the live socket: Nobody
   * reconnects appear-offline, Everyone reconnects visible, without a restart.
   * Resolves the write result; never rejects.
   */
  setPresenceVisibility(visibility: PresenceVisibility): Promise<SetPresenceVisibilityResult>;
  /** True while the player is in a hand; invite banners wait for it to clear. */
  readonly handInProgress: boolean;
  /** Set by the game screen. */
  setHandInProgress(inProgress: boolean): void;
  /** Toast events (friend request, accept, table invite). Returns an unsubscribe function. */
  onEvent(listener: (event: SocialEvent) => void): () => void;
}

export const EMPTY_SOCIAL_STATE: SocialState = { connected: false, availability: {}, incomingRequests: 0, invites: [] };

/**
 * Kept apart from SocialProvider so screens and tests can read social state
 * without loading the socket or the native pieces it needs. Without a provider
 * it is disconnected and empty, and every action is a no-op.
 */
export const SocialContext = createContext<SocialContextValue>({
  state: EMPTY_SOCIAL_STATE,
  friends: null,
  ensureConnected: () => Promise.resolve(false),
  refreshFriends: () => Promise.resolve(),
  dismissInvite: () => Promise.resolve(),
  setActivity: () => {},
  presenceVisibility: DEFAULT_PRESENCE_VISIBILITY,
  // No provider means no online path: nothing was saved, and the UI shows its error.
  setPresenceVisibility: () => Promise.resolve({ ok: false, reason: 'network' }),
  handInProgress: false,
  setHandInProgress: () => {},
  onEvent: () => () => {},
});

export function useSocial(): SocialContextValue {
  return useContext(SocialContext);
}

/**
 * Relation state, kept beside `SocialContext` rather than inside it: the
 * provider that owns both exposes it here, and a test that mounts only the
 * socket's context still reads an honest empty set instead of a missing field.
 * `SocialProvider` fills it from the same friends backend it already holds, so
 * the `/p/[userId]` route and the desktop panel read one source with no prop
 * drilled from either caller.
 */
export const SocialRelationsContext = createContext<SocialRelations>(EMPTY_SOCIAL_RELATIONS);

export function useSocialRelations(): SocialRelations {
  return useContext(SocialRelationsContext);
}
