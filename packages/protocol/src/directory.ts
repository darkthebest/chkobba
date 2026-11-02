/**
 * Players directory wire types, storage record shapes and RPC payloads, shared
 * by the server and the client.
 *
 * The display name is the account's unique public handle: claiming it is what
 * makes a player findable by search. Claims are atomic through a `CREATE_ONLY`
 * write on a deterministic key, so two accounts can never hold the same folded
 * name (the loser re-reads and reports `name_taken`).
 *
 * The folded form lives only in a `value` field, never in the storage key,
 * because Nakama storage keys are not a search surface: the directory is queried
 * through a storage index registered over the claim collection's `fold` value
 * field (see ADR-0004 and the live-probe notes).
 *
 * Presence labels are about what a player publishes, never about whether they
 * are online: `hidden` means "publishes nothing", not "offline".
 *
 * Plain consts and types only: the server bundles this into its ES5 goja module,
 * so no `u`-flag regex and no post-ES2017 built-ins.
 */

import type { PlayerStats } from './stats';
import { sha256Hex } from './sha256';

/** Version of the name-folding algorithm; bump when folding changes so claims can be re-derived. */
export const NAME_FOLD_VERSION = 1;

/** Shortest folded query that runs a search; shorter queries are rejected client-side. */
export const SEARCH_MIN_CHARS = 2;
/** Longest folded query that runs a search. */
export const SEARCH_MAX_CHARS = 16;
/** Rows returned per page. */
export const SEARCH_PAGE_SIZE = 20;
/** Hard cap on matches returned for one query, across all pages. */
export const SEARCH_MAX_RESULTS = 60;
/** Raw characters accepted from the client before folding (the folded form is bounded by SEARCH_MAX_CHARS). */
export const SEARCH_MAX_QUERY_INPUT = 64;
/** Bounded-scan contingency only: pages of `storageList` the fallback would walk. */
export const SEARCH_SCAN_MAX_PAGES = 6;

/**
 * Claims (keys `n<sha256hex>`) and the limits record live here; the storage
 * index is built over this collection's `fold` value field.
 */
export const DIRECTORY_COLLECTION = 'player_directory';
/**
 * Own records (keys `own/<userId>`) live in a separate collection so the
 * whole-collection index never indexes their `fold` field.
 */
export const DIRECTORY_OWN_COLLECTION = 'player_directory_own';
/** Name of the storage index registered in InitModule. */
export const DIRECTORY_INDEX_NAME = 'player_names';
/** Deliberate cap for the index; overflow behaviour is untested on Nakama 3.40 (ADR-0004 risk). */
export const SEARCH_INDEX_MAX_ENTRIES = 100000;
/** The per-caller rate-limit record key inside DIRECTORY_COLLECTION. */
export const DIRECTORY_LIMITS_KEY = 'limits';

/** Claim keys are `n` + lowercase SHA-256 hex of the folded name: 65 ASCII characters. */
export const NAME_CLAIM_KEY_PREFIX = 'n';
/** Prefix of the own record key; the rest is the owner's userId. */
export const OWN_CLAIM_KEY_PREFIX = 'own/';

/** `'n' + sha256Hex(folded)`; never the folded name itself. */
export function nameClaimKey(folded: string): string {
  return NAME_CLAIM_KEY_PREFIX + sha256Hex(folded);
}

// Name folding: the uniqueness and search key. One explicit character map over
// UTF-16 code units, so scripts outside the display-name allow-list are left
// unchanged by construction (no `normalize`, no `u`-flag regex, no case methods).

/** Code-unit boundaries the fold map handles explicitly. */
const SPACE = 0x20;
const ASCII_DIGIT_START = 0x30;
const ASCII_UPPER_A = 0x41;
const ASCII_UPPER_Z = 0x5a;
const ASCII_CASE_OFFSET = 0x20;
const LATIN1_FOLD_START = 0xc0;
const ARABIC_INDIC_DIGIT_START = 0x0660;
const ARABIC_INDIC_DIGIT_END = 0x0669;

/**
 * Latin-1 accented letters → their base letter, indexed by code unit − U+00C0.
 * `null` marks × (U+00D7) and ÷ (U+00F7), which are not folded. Æ/æ expand to
 * `ae`, Þ/þ to `th`, and ß to `ss`.
 */
const LATIN1_FOLD: readonly (string | null)[] = [
  'a', 'a', 'a', 'a', 'a', 'a', 'ae', 'c', 'e', 'e', 'e', 'e', 'i', 'i', 'i', 'i',
  'd', 'n', 'o', 'o', 'o', 'o', 'o', null, 'o', 'u', 'u', 'u', 'u', 'y', 'th', 'ss',
  'a', 'a', 'a', 'a', 'a', 'a', 'ae', 'c', 'e', 'e', 'e', 'e', 'i', 'i', 'i', 'i',
  'd', 'n', 'o', 'o', 'o', 'o', 'o', null, 'o', 'u', 'u', 'u', 'u', 'y', 'th', 'y',
];

/** Folds one Latin-1 accented letter, or returns `null` when the code unit is not folded. */
function foldLatin1(code: number): string | null {
  const index = code - LATIN1_FOLD_START;
  if (index < 0 || index >= LATIN1_FOLD.length) return null;
  return LATIN1_FOLD[index] ?? null;
}

/** Arabic letter variants → one base letter; every other code unit is returned unchanged. */
function foldArabicLetter(code: number): number {
  switch (code) {
    case 0x0622: // آ alef with madda
    case 0x0623: // أ alef with hamza above
    case 0x0625: // إ alef with hamza below
    case 0x0671: // ٱ alef wasla
      return 0x0627; // ا
    case 0x0626: // ئ yaa with hamza above
    case 0x0649: // ى alef maqsura
      return 0x064a; // ي
    case 0x0629: // ة taa marbuta
      return 0x0647; // ه
    case 0x0624: // ؤ waw with hamza above
      return 0x0648; // و
    default:
      return code;
  }
}

/** Folds one UTF-16 code unit; surrogate halves and non-allow-listed characters pass through. */
function foldChar(code: number): string {
  if (code >= ASCII_UPPER_A && code <= ASCII_UPPER_Z) {
    return String.fromCharCode(code + ASCII_CASE_OFFSET);
  }
  const latin1 = foldLatin1(code);
  if (latin1 !== null) return latin1;
  if (code >= ARABIC_INDIC_DIGIT_START && code <= ARABIC_INDIC_DIGIT_END) {
    return String.fromCharCode(ASCII_DIGIT_START + (code - ARABIC_INDIC_DIGIT_START));
  }
  return String.fromCharCode(foldArabicLetter(code));
}

/**
 * Folded form used for uniqueness and search: two names that fold equal are the same name.
 * Lowercase; Latin-1 accented letters mapped to their base letter; Arabic letter variants
 * mapped to one base; Arabic-Indic digits mapped to ASCII; runs of spaces collapsed to one;
 * trimmed. Idempotent. Scripts outside the allow-list are left unchanged by construction.
 */
export function foldName(name: string): string {
  const folded: string[] = [];
  let spacePending = false;
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code === SPACE) {
      // Skip leading spaces; a run collapses to the one emitted before the next character.
      if (folded.length > 0) spacePending = true;
      continue;
    }
    if (spacePending) {
      folded.push(' ');
      spacePending = false;
    }
    folded.push(foldChar(code));
  }
  return folded.join('');
}

/**
 * The search key for a raw query: caps the raw input at SEARCH_MAX_QUERY_INPUT UTF-16 units
 * BEFORE folding, then folds (which also trims and collapses spaces).
 */
export function normalizeQuery(raw: string): string {
  const capped = raw.length > SEARCH_MAX_QUERY_INPUT ? raw.slice(0, SEARCH_MAX_QUERY_INPUT) : raw;
  return foldName(capped);
}

/** True when a normalized query is long enough and short enough to search. */
export function isSearchableQuery(normalized: string): boolean {
  return normalized.length >= SEARCH_MIN_CHARS && normalized.length <= SEARCH_MAX_CHARS;
}

/** Key `n<sha256hex>`; owned by the system user; read 0 / write 0 (RPC only). */
export interface NameClaim {
  /** The account that holds this name. */
  readonly userId: string;
  /** The name as written when it was claimed; the display form. */
  readonly name: string;
  /** The folded form this claim was taken under. Kept for re-derivation and display-name refresh. */
  readonly fold: string;
  /** Epoch ms when the claim was written. */
  readonly claimedAt: number;
}

/** Key `own/<userId>` in DIRECTORY_OWN_COLLECTION; owner read 1 / write 0. */
export interface OwnClaim {
  /** The claim key (`n<sha256hex>`) this account holds. */
  readonly claimKey: string;
  /** The folded form of the claim, duplicated here so the owner can resolve their handle without the claim record. */
  readonly fold: string;
  /** The name as written when claimed. */
  readonly name: string;
  /** Epoch ms when the claim was written. */
  readonly claimedAt: number;
}

/** Per-caller directory limits record (`DIRECTORY_LIMITS_KEY`), read 0 / write 0. */
export interface DirectoryLimitsRecord {
  /** Epoch ms when the current search window started. */
  readonly searchWindowStart: number;
  /** Searches made in the current search window. */
  readonly searches: number;
  /** Epoch ms when the current profile-view window started. */
  readonly profileWindowStart: number;
  /** Profile views made in the current profile-view window. */
  readonly profiles: number;
}

/** Whether a player publishes presence to anyone. Default `everyone`. */
export const PRESENCE_VISIBILITY = ['everyone', 'nobody'] as const;
export type PresenceVisibility = (typeof PRESENCE_VISIBILITY)[number];
/** Visibility applied to an account that has never written the prefs record. */
export const DEFAULT_PRESENCE_VISIBILITY: PresenceVisibility = 'everyone';
/** What other players learn: `hidden` means "publishes nothing", not "offline". */
export type PresenceVisibilityLabel = 'visible' | 'hidden';

/** Key `prefs`, collection `profile`; owner read 1 / write 0 (only the RPC writes it). */
export const PROFILE_PREFS_KEY = 'prefs';
/** Presence preferences written by the `set_presence_visibility` RPC. */
export interface PresencePrefsRecord {
  /** Current visibility choice. */
  readonly visibility: PresenceVisibility;
  /** Epoch ms of the last change. */
  readonly updatedAt: number;
}

/** One row of a directory search or a profile header. */
export interface DirectoryPlayer {
  /** The account's userId. */
  readonly userId: string;
  /** Display name as written when claimed (the unique public handle). */
  readonly name: string;
  /** Whether this player publishes presence; never an online/offline signal. */
  readonly presence: PresenceVisibilityLabel;
}

// RPC: search_players   request SearchPlayersRequest   response SearchPlayersResponse
export interface SearchPlayersRequest {
  /** Raw query text, at most SEARCH_MAX_QUERY_INPUT characters before folding. */
  readonly q: string;
  /** Opaque storage cursor from the previous page; absent for the first page. */
  readonly cursor?: string;
}
export interface SearchPlayersResponse {
  /** This page of matches, at most SEARCH_PAGE_SIZE rows. */
  readonly players: readonly DirectoryPlayer[];
  /** Opaque cursor for the next page; null on the last page or when capped. */
  readonly nextCursor: string | null;
  /** More matches exist than the cap returned. */
  readonly capped: boolean;
}

// RPC: get_player_profile   request GetPlayerProfileRequest   response PlayerProfileResponse
export interface GetPlayerProfileRequest {
  /** The account whose profile to read. */
  readonly userId: string;
}
export interface PlayerProfileResponse {
  /** The account's userId. */
  readonly userId: string;
  /** Display name as written when claimed (the unique public handle). */
  readonly name: string;
  /** Whether this player publishes presence; never an online/offline signal. */
  readonly presence: PresenceVisibilityLabel;
  /** Competitive and practice blocks; a missing record reads as all zeros. */
  readonly stats: PlayerStats;
}

// RPC: set_presence_visibility   request SetPresenceVisibilityRequest   response SetPresenceVisibilityResponse
export interface SetPresenceVisibilityRequest {
  /** The new visibility choice. */
  readonly visibility: PresenceVisibility;
}
export interface SetPresenceVisibilityResponse {
  /** The visibility now in effect. */
  readonly visibility: PresenceVisibility;
  /** Epoch ms of the change, echoed from the stored prefs record. */
  readonly updatedAt: number;
}

/** Directory RPC error `message` values (thrown as { message, code } with numeric gRPC codes). */
export const DIRECTORY_RPC_ERROR_CODES = [
  'directory_bad_query', // INVALID_ARGUMENT 3
  'directory_rate_limited', // RESOURCE_EXHAUSTED 8
  'directory_not_found', // NOT_FOUND 5 (unknown id AND a block in either direction)
  'presence_bad_request', // INVALID_ARGUMENT 3
] as const;
export type DirectoryRpcErrorCode = (typeof DIRECTORY_RPC_ERROR_CODES)[number];
