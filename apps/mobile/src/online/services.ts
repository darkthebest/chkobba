import type { Client } from '@heroiclabs/nakama-js';

import { createDirectoryBackend, type DirectoryBackend } from './directory';
import { createFriendsBackend, type FriendsBackend } from './friends';
import type { OnlineServicesBackend } from './NakamaGameClient';
import { createNakamaBackend, createNakamaClient, GuestAuth, nakamaConfig, type NakamaConfig } from './nakama';
import { createPracticeReporter, type PracticeReporter } from './practice';
import { NakamaProfileBackend, type ProfileBackend } from './profile';
import { createSocialSocket, type SocialSocket } from './socialSocket';

/**
 * The app's shared online services: one nakama-js `Client`, one `GuestAuth`,
 * one online backend (`OnlineServicesBackend`: quick match and private-table
 * RPCs), one `ProfileBackend`, one `FriendsBackend`, one `DirectoryBackend`,
 * one practice reporter and one `SocialSocket` (the app-level social socket,
 * ADR-0003), so the device-id migration and the session (and its refresh) are
 * handled once per app run and every screen signs in to the same session.
 * Each is created on first use.
 *
 * Not for the active game client: that is `activeClient.ts`, which hands one
 * running `NakamaGameClient` from the finding screen to the game screen.
 */

let config: NakamaConfig | null = null;
let client: Client | null = null;
let auth: GuestAuth | null = null;
let backend: OnlineServicesBackend | null = null;
let profile: ProfileBackend | null = null;
let friends: FriendsBackend | null = null;
let directory: DirectoryBackend | null = null;
let practice: PracticeReporter | null = null;
let social: SocialSocket | null = null;

function getConfig(): NakamaConfig {
  config ??= nakamaConfig();
  return config;
}

export function getNakamaClient(): Client {
  client ??= createNakamaClient(getConfig());
  return client;
}

export function getGuestAuth(): GuestAuth {
  auth ??= new GuestAuth({ client: getNakamaClient() });
  return auth;
}

/** The backend NakamaGameClient and the online screens use (quick match and private-table RPCs). */
export function getOnlineBackend(): OnlineServicesBackend {
  backend ??= createNakamaBackend({ config: getConfig(), client: getNakamaClient(), auth: getGuestAuth() });
  return backend;
}

/** The backend for the player's profile (Settings). */
export function getProfileBackend(): ProfileBackend {
  profile ??= new NakamaProfileBackend({ client: getNakamaClient(), auth: getGuestAuth() });
  return profile;
}

/** The backend for friends, friend codes, recent players and table invites. */
export function getFriendsBackend(): FriendsBackend {
  friends ??= createFriendsBackend({ client: getNakamaClient(), auth: getGuestAuth() });
  return friends;
}

/** The backend for the players directory: search and public profiles. */
export function getDirectoryBackend(): DirectoryBackend {
  directory ??= createDirectoryBackend({ client: getNakamaClient(), auth: getGuestAuth() });
  return directory;
}

/**
 * The reporter for finished offline bot games. It only ever resumes a stored
 * session (`GuestAuth.resume`), so a device that has never played online stays
 * account-less and its report is dropped silently.
 */
export function getPracticeReporter(): PracticeReporter {
  practice ??= createPracticeReporter({
    client: getNakamaClient(),
    resume: () => getGuestAuth().resume(),
  });
  return practice;
}

/**
 * The app-level social socket (presence, friend list, notifications). Building
 * it makes no request; `SocialProvider` calls `start()`, which only resumes a
 * stored session and never creates an account.
 */
export function getSocialSocket(): SocialSocket {
  social ??= createSocialSocket({
    client: getNakamaClient(),
    config: getConfig(),
    auth: getGuestAuth(),
    friends: getFriendsBackend(),
  });
  return social;
}

/** Drops every cached service, so the next getter builds a fresh one. */
export function resetOnlineServicesForTests(): void {
  config = null;
  client = null;
  auth = null;
  backend = null;
  profile = null;
  social?.stop();
  social = null;
  friends = null;
  directory = null;
  practice = null;
}
