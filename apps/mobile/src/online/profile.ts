import type { Client, Session } from '@heroiclabs/nakama-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  checkDisplayNameFormat,
  DEFAULT_PRESENCE_VISIBILITY,
  DIRECTORY_OWN_COLLECTION,
  isFriendCode,
  NAME_ERROR_CODES,
  normalizeFriendCode,
  OWN_CLAIM_KEY_PREFIX,
  PRESENCE_VISIBILITY,
  PROFILE_COLLECTION,
  PROFILE_NAME_KEY,
  PROFILE_PREFS_KEY,
  RENAME_COOLDOWN_MS,
  type NameErrorCode,
  type NameRecord,
  type OwnClaim,
  type PresenceVisibility,
} from '@chkobba/protocol';

import { isStaleSessionError, type GuestAuth, type KeyValueStore } from './nakama';

/**
 * The signed-in player's profile: display name, whether a name was ever
 * picked, the rename cooldown, whether the account is listed and its presence
 * setting. Reads the account and the server-owned `profile/name`,
 * `player_directory_own/own/<userId>` and `profile/prefs` records; renames go
 * through `updateAccount`, which the server's before-hook validates. A local
 * copy (`chkobba.online.profile`) lets Settings show the name without going to
 * the network.
 */

/** What the lobby needs to know about the signed-in player. */
export interface Profile {
  readonly displayName: string;
  /** False until the player confirmed a name once (NameRecord exists). */
  readonly namePicked: boolean;
  /**
   * Epoch ms when the next rename is allowed; null if allowed now. Derived
   * from the server-written `changedAt`, so it is on the server clock: a
   * skewed device clock shifts the countdown, but the server still enforces
   * the cooldown.
   */
  readonly renameAvailableAt: number | null;
  /**
   * The friend code (the account username, normalized); null for a legacy
   * account whose username is not a code (e.g. `Guest-XXXX`).
   */
  readonly friendCode: string | null;
  /**
   * True when the player holds a live name claim and is therefore listed. A
   * missing or malformed own-claim record reads as false, so a broken read can
   * only under-report listing, never invent it.
   */
  readonly listed: boolean;
  /**
   * The player's own presence setting; Everyone until the server says
   * otherwise, which is also what an absent or malformed prefs record means.
   */
  readonly presenceVisibility: PresenceVisibility;
}

export type SetNameResult =
  | { readonly ok: true; readonly profile: Profile }
  | { readonly ok: false; readonly reason: NameErrorCode | 'network' };

/** Port for profile UI, next to OnlineBackend (NakamaGameClient.ts). */
export interface ProfileBackend {
  getProfile(): Promise<Profile>;
  setDisplayName(name: string): Promise<SetNameResult>;
}

/** The nakama-js calls this module makes, so tests can pass a small fake. */
export type ProfileClient = Pick<Client, 'getAccount' | 'readStorageObjects' | 'updateAccount'>;

/** Anything that hands out a valid session (GuestAuth in production). */
export type SessionSource = Pick<GuestAuth, 'signIn'>;

/** A session source that can also drop a session whose account is gone (GuestAuth in production). */
export type RenewableSessionSource = Pick<GuestAuth, 'signIn' | 'invalidate'>;

export interface ProfileBackendOptions {
  readonly client: ProfileClient;
  readonly auth: RenewableSessionSource;
  readonly store?: KeyValueStore;
  /** Local clock in ms. */
  readonly now?: () => number;
}

const PROFILE_CACHE_KEY = 'chkobba.online.profile';
/** Last resort when the account has neither a display name nor a username. */
const FALLBACK_NAME = 'Player';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNameErrorCode(value: unknown): value is NameErrorCode {
  return typeof value === 'string' && NAME_ERROR_CODES.some((code) => code === value);
}

/** A `NameRecord` from a storage value (nakama-js parses it; a raw JSON string is accepted too), or null. */
export function parseNameRecord(value: unknown): NameRecord | null {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data !== 'object' || data === null || !('pickedAt' in data)) return null;
  const { pickedAt } = data;
  const changedAt = 'changedAt' in data ? data.changedAt : null;
  if (!isFiniteNumber(pickedAt)) return null;
  if (changedAt !== null && changedAt !== undefined && !isFiniteNumber(changedAt)) return null;
  return { pickedAt, changedAt: isFiniteNumber(changedAt) ? changedAt : null };
}

/** An `OwnClaim` from a storage value (parsed or raw JSON string), or null. */
export function parseOwnClaim(value: unknown): OwnClaim | null {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  if (!('claimKey' in data) || !('fold' in data) || !('name' in data) || !('claimedAt' in data)) return null;
  const { claimKey, fold, name, claimedAt } = data;
  if (typeof claimKey !== 'string' || typeof fold !== 'string' || typeof name !== 'string') return null;
  if (!isFiniteNumber(claimedAt)) return null;
  return { claimKey, fold, name, claimedAt };
}

function isPresenceVisibility(value: unknown): value is PresenceVisibility {
  return typeof value === 'string' && PRESENCE_VISIBILITY.some((choice) => choice === value);
}

/**
 * The visibility in a `profile/prefs` value (parsed or raw JSON string), or
 * Everyone. The record is server-written only, so a malformed one is a server
 * bug; the default must not fail a profile read, and Everyone is exactly what
 * an account that never saved a preference publishes.
 */
export function presenceVisibilityOf(value: unknown): PresenceVisibility {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return DEFAULT_PRESENCE_VISIBILITY;
    }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return DEFAULT_PRESENCE_VISIBILITY;
  if (!('visibility' in data) || !('updatedAt' in data)) return DEFAULT_PRESENCE_VISIBILITY;
  const { visibility, updatedAt } = data;
  return isPresenceVisibility(visibility) && isFiniteNumber(updatedAt) ? visibility : DEFAULT_PRESENCE_VISIBILITY;
}

/** The normalized friend code in `username`, or null if it is not one (legacy `Guest-XXXX`, missing). */
export function friendCodeOf(username: unknown): string | null {
  if (typeof username !== 'string') return null;
  const code = normalizeFriendCode(username);
  return isFriendCode(code) ? code : null;
}

function parseProfile(text: string | null): Profile | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    if (!('displayName' in value) || !('namePicked' in value) || !('renameAvailableAt' in value)) return null;
    const { displayName, namePicked, renameAvailableAt } = value;
    if (typeof displayName !== 'string' || displayName.trim() === '' || typeof namePicked !== 'boolean') return null;
    if (renameAvailableAt !== null && !isFiniteNumber(renameAvailableAt)) return null;
    // Entries cached before friend codes have no `friendCode`: read them as null.
    const friendCode = 'friendCode' in value ? friendCodeOf(value.friendCode) : null;
    // Entries cached before the directory have neither field: unlisted and Everyone.
    const listed = 'listed' in value && value.listed === true;
    const presenceVisibility =
      'presenceVisibility' in value
        ? presenceVisibilityOf(value.presenceVisibility)
        : DEFAULT_PRESENCE_VISIBILITY;
    return { displayName, namePicked, renameAvailableAt, friendCode, listed, presenceVisibility };
  } catch {
    return null;
  }
}

/**
 * The last profile read or written, without touching the network; null if
 * none or malformed. `renameAvailableAt` may be in the past by now: compare
 * it with the clock before showing a cooldown.
 */
export async function loadCachedProfile(store: KeyValueStore = AsyncStorage): Promise<Profile | null> {
  try {
    return parseProfile(await store.getItem(PROFILE_CACHE_KEY));
  } catch {
    return null;
  }
}

/** Receives every fresh `Profile` the backend obtains. */
export type ProfileListener = (profile: Profile) => void;

/**
 * Listeners told when the backend obtains a fresh profile. Module-level, so a
 * screen can react to a name claimed elsewhere (for example through the
 * friends Add gate) without polling or remounting. No React here: this module
 * must stay usable outside a component.
 */
const profileListeners = new Set<ProfileListener>();

/**
 * Subscribes to fresh profiles; returns an unsubscribe function. This is an
 * additional signal next to `loadCachedProfile`, not a replacement: a listener
 * may still read the cache once at mount and then follow this channel.
 */
export function subscribeProfile(listener: ProfileListener): () => void {
  profileListeners.add(listener);
  return () => {
    profileListeners.delete(listener);
  };
}

/** Tells every listener; one throwing listener never stops the others or the caller. */
function notifyProfile(profile: Profile): void {
  for (const listener of profileListeners) {
    try {
      listener(profile);
    } catch {
      // Ignored: the profile was obtained, so a listener bug is not a read failure.
    }
  }
}

/** Display name, else username, else `Player` (Decision 6: legacy accounts may have no display name). */
function displayNameOf(displayName: string | undefined, username: string | undefined): string {
  const name = displayName?.trim();
  if (name) return name;
  const user = username?.trim();
  return user ? user : FALLBACK_NAME;
}

function renameAvailableAt(record: NameRecord | null, now: number): number | null {
  if (record === null || record.changedAt === null) return null;
  const at = record.changedAt + RENAME_COOLDOWN_MS;
  return at > now ? at : null;
}

/**
 * Maps a failed `updateAccount` to a reason. nakama-js rejects with the fetch
 * `Response`; the server's hook error is its JSON body, `{ code, message }`,
 * with a `NameErrorCode` as the message (HTTP 400, or 429 for
 * `name_rate_limited`). Anything else is reported as `network`.
 */
export async function nameErrorFrom(error: unknown): Promise<NameErrorCode | 'network'> {
  if (typeof error !== 'object' || error === null || !('json' in error)) return 'network';
  const { json } = error;
  if (typeof json !== 'function') return 'network';
  try {
    const body: unknown = await json.call(error);
    if (typeof body !== 'object' || body === null || !('message' in body)) return 'network';
    return isNameErrorCode(body.message) ? body.message : 'network';
  } catch {
    return 'network';
  }
}

/** ProfileBackend over nakama-js and a session source (GuestAuth). */
export class NakamaProfileBackend implements ProfileBackend {
  private readonly client: ProfileClient;
  private readonly auth: RenewableSessionSource;
  private readonly store: KeyValueStore;
  private readonly now: () => number;

  constructor(options: ProfileBackendOptions) {
    this.client = options.client;
    this.auth = options.auth;
    this.store = options.store ?? AsyncStorage;
    this.now = options.now ?? Date.now;
  }

  /**
   * Reads the account and the name record; rejects on a network or server
   * failure. A session whose account is gone (401, or 404 from `getAccount`)
   * is dropped and the read runs once more on a new sign-in.
   */
  getProfile(): Promise<Profile> {
    return this.withSession((session) => this.readProfile(session));
  }

  /**
   * Runs `call` with a signed-in session. When it fails because the account
   * behind the session is gone, drops that session and runs `call` once more
   * with a new one; the second failure is final, so this never loops.
   */
  private async withSession<T>(call: (session: Session) => Promise<T>): Promise<T> {
    const { session } = await this.auth.signIn();
    try {
      return await call(session);
    } catch (error) {
      if (!isStaleSessionError(error)) throw error;
      await this.auth.invalidate(session);
    }
    const { session: fresh } = await this.auth.signIn();
    return call(fresh);
  }

  private async readProfile(session: Session): Promise<Profile> {
    const userId = session.user_id;
    if (!userId) throw new Error('getProfile: session has no user id');
    const [account, storage] = await Promise.all([
      this.client.getAccount(session),
      this.client.readStorageObjects(session, {
        object_ids: [
          { collection: PROFILE_COLLECTION, key: PROFILE_NAME_KEY, user_id: userId },
          { collection: DIRECTORY_OWN_COLLECTION, key: OWN_CLAIM_KEY_PREFIX + userId, user_id: userId },
          { collection: PROFILE_COLLECTION, key: PROFILE_PREFS_KEY, user_id: userId },
        ],
      }),
    ]);
    const object = storage.objects.find(
      (o) => o.collection === PROFILE_COLLECTION && o.key === PROFILE_NAME_KEY && o.user_id === userId,
    );
    const record = object ? parseNameRecord(object.value) : null;
    const ownObject = storage.objects.find(
      (o) => o.collection === DIRECTORY_OWN_COLLECTION && o.key === OWN_CLAIM_KEY_PREFIX + userId && o.user_id === userId,
    );
    const prefsObject = storage.objects.find(
      (o) => o.collection === PROFILE_COLLECTION && o.key === PROFILE_PREFS_KEY && o.user_id === userId,
    );
    const profile: Profile = {
      displayName: displayNameOf(account.user?.display_name, account.user?.username),
      namePicked: record !== null,
      renameAvailableAt: renameAvailableAt(record, this.now()),
      friendCode: friendCodeOf(account.user?.username),
      listed: parseOwnClaim(ownObject?.value) !== null,
      presenceVisibility: prefsObject ? presenceVisibilityOf(prefsObject.value) : DEFAULT_PRESENCE_VISIBILITY,
    };
    await this.cache(profile);
    notifyProfile(profile);
    return profile;
  }

  /**
   * Format-checks locally (no request on failure), then asks the server. The
   * server normalizes and validates again; the local check is only for quick
   * feedback.
   */
  async setDisplayName(name: string): Promise<SetNameResult> {
    const check = checkDisplayNameFormat(name);
    if (!check.ok) return { ok: false, reason: check.code };
    const previous = await loadCachedProfile(this.store);
    try {
      await this.withSession((session) => this.client.updateAccount(session, { display_name: check.name }));
    } catch (error) {
      const reason = await nameErrorFrom(error);
      // Refresh the cached cooldown so the UI can show when renaming opens again.
      if (reason === 'name_rate_limited') await this.getProfile().catch(() => undefined);
      return { ok: false, reason };
    }
    try {
      return { ok: true, profile: await this.getProfile() };
    } catch {
      // Saved, but the re-read failed: report what we know. A rename after a
      // first pick starts the cooldown (local clock, approximate).
      const profile: Profile = {
        displayName: check.name,
        namePicked: true,
        renameAvailableAt: previous?.namePicked ? this.now() + RENAME_COOLDOWN_MS : null,
        friendCode: previous?.friendCode ?? null,
        // The rename may have changed the listing, but the re-read failed: report
        // the last known values rather than guessing either way.
        listed: previous?.listed ?? false,
        presenceVisibility: previous?.presenceVisibility ?? DEFAULT_PRESENCE_VISIBILITY,
      };
      await this.cache(profile);
      notifyProfile(profile);
      return { ok: true, profile };
    }
  }

  /** Best effort: a storage failure must not fail the call that produced the profile. */
  private async cache(profile: Profile): Promise<void> {
    try {
      await this.store.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } catch {
      // Ignored: the next successful read writes it again.
    }
  }
}
