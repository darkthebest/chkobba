import {
  DEFAULT_PRESENCE_VISIBILITY,
  SEARCH_MAX_RESULTS,
  isSearchableQuery,
  normalizeQuery,
  type DirectoryPlayer,
  type NameClaim,
  type PresenceVisibility,
} from '@chkobba/protocol';
import { isStale } from './claimRules';
import { isNameClaim } from './claimStore';
import { labelOf } from './presencePrefs';

/**
 * Pure page assembly for `search_players` (ADR-0004 sections 4, 10, 11 and 14).
 * No `nkruntime`, no storage and no clock: the RPC gathers the index rows, the
 * `usersGetId` live names, the presence lookup and the block verdicts, and this
 * module turns one page of facts into one page of players. Every rule here can
 * therefore be replayed in a unit test without a fake runtime.
 *
 * Two consequences of the storage route shape the whole module:
 *
 * - **Offset cursors duplicate and skip rows.** `storageIndexList` cursors
 *   encode an integer offset, not a keyset position, so an insert or delete
 *   during a traversal can move a row into two pages or out of the traversal
 *   entirely. Nothing here assumes a stable total or a globally unique row; a
 *   page is deduped against itself and against the ids earlier pages returned.
 * - **Exact-first cannot be a sort.** A cursor page cannot be ordered globally,
 *   so an exact match that the index would place on page 3 can never be moved
 *   to the front by sorting this page. The caller reads the exact claim key
 *   directly and hands it in; it is emitted first here and deduped out of the
 *   scanned rows wherever it would otherwise appear.
 */

/** One index row: the claim key it lives under, the raw storage value and the holder's live name. */
export interface SearchRow {
  /** The claim storage key (`n<sha256hex>`), used to drop offset-cursor duplicates. */
  readonly claimKey: string;
  /** The raw `NameClaim` storage value; validated with `isNameClaim`, never cast. */
  readonly value: unknown;
  /** The holder's live display name, or null when the account no longer exists. */
  readonly liveName: string | null;
}

/** Everything `assemblePage` needs; every fact is supplied by the RPC, so this module stays pure. */
export interface AssemblePageInput {
  /** The folded query from `normalizeSearch`; rows must share this prefix. */
  readonly query: string;
  /** The caller's userId, excluded from results (ADR-0004 section 11). */
  readonly callerId: string;
  /**
   * The direct `storageRead` of `nameClaimKey(query)`, or null when no claim
   * exists. Emitted first on the first page; never a page sort.
   */
  readonly exactRow: SearchRow | null;
  /** This page's index rows, in index order, filtered by the folded prefix. */
  readonly rows: readonly SearchRow[];
  /** Rows per page (`SEARCH_PAGE_SIZE`); passed in so tests can exercise small pages. */
  readonly pageSize: number;
  /** Global cap for the query across pages (`SEARCH_MAX_RESULTS`). */
  readonly maxResults: number;
  /** userIds returned on earlier pages, to dedupe offset-cursor repeats and count the cap. */
  readonly already: readonly string[];
  /** The block verdict for one candidate, both directions already folded in. */
  readonly canSee: (userId: string) => boolean;
  /**
   * The candidate's presence choice. Returning `undefined` means the lookup had
   * no entry and reads as Everyone — the documented default — not as hidden.
   */
  readonly presenceOf: (userId: string) => PresenceVisibility | undefined;
}

/** One assembled page. */
export interface SearchPage {
  /** At most `pageSize` players, and never more than the remaining global cap. */
  readonly players: readonly DirectoryPlayer[];
  /** The userIds returned on this page; append them to the running `already` list for the next page. */
  readonly fixed: readonly string[];
  /** More matches existed than the remaining global cap allowed; the caller returns `nextCursor: null`. */
  readonly capped: boolean;
}

/**
 * Whether a request's optional cursor is well formed. `undefined` means the
 * first page (the field is absent); anything present must be a non-empty string
 * because the value is opaque and only ever handed back to Nakama. A number, an
 * object, `null` or an empty string is a bad request (`directory_bad_query`)
 * rather than a cursor that reaches the storage call.
 */
export function isValidCursor(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.length > 0);
}

/**
 * A decoded search cursor: where in the index to resume, how many rows of that
 * batch were already consumed, and the userIds returned on earlier pages.
 *
 * Why a composed cursor at all: `storageIndexList` advances by whole offset
 * batches. If the 20th visible player falls in the middle of a 100-row batch,
 * returning Nakama's *next* cursor would silently skip the unconsumed rows. So
 * the cursor keeps the cursor that opened the partially consumed batch plus the
 * number of rows read from it, and the next call re-fetches that batch and skips
 * those rows (ADR-0004 section 4 accepts that an offset shift can still skip or
 * repeat a row; `already` dedupes the repeats).
 *
 * `already` is carried because offset cursors repeat rows and because the
 * `SEARCH_MAX_RESULTS` cap is global to a query, not per page: the next page
 * needs both to dedupe and to count.
 */
export interface SearchCursor {
  /** Cursor that opened the partially consumed batch; null means "from the start of the index". */
  readonly storageCursor: string | null;
  /** Rows of that batch already read; 0 when the batch was exhausted and the next cursor is carried alone. */
  readonly skip: number;
  /** userIds returned on earlier pages, for dedupe and the global result cap. */
  readonly already: readonly string[];
}

/** A batch is at most 100 rows, so no well-formed cursor skips more than that. */
export const SEARCH_CURSOR_MAX_SKIP = 100;
/** Nakama user ids are 36-character UUIDs; leave room, but cap the field a client may send. */
const MAX_CURSOR_USER_ID_LENGTH = 128;

/**
 * The documented wire format (clients treat it as opaque): a JSON string
 * `{"c": string|null, "s": number, "a": string[]}`.
 * - `c` is the storage cursor (null = start of the index);
 * - `s` is rows already consumed from the batch opened by `c`;
 * - `a` is the userIds already returned.
 */
export function encodeSearchCursor(cursor: SearchCursor): string {
  return JSON.stringify({ c: cursor.storageCursor, s: cursor.skip, a: cursor.already });
}

/**
 * Parses and validates a client-supplied cursor. Returns null for anything that
 * is not exactly the shape `encodeSearchCursor` writes, and the RPC answers that
 * with `directory_bad_query`: the cursor is opaque, so a value that does not
 * decode is a bad request, never an empty page.
 *
 * Every field is bounded because the cursor is client-controlled: `s` may not
 * exceed one batch, `a` may not exceed the global result cap, and each carried
 * id is length-capped. Without those bounds a client could inflate the dedupe
 * cost of every later request.
 */
export function decodeSearchCursor(value: string): SearchCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (_error) {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (!('c' in parsed) || !('s' in parsed) || !('a' in parsed)) return null;

  const rawCursor: unknown = parsed.c;
  if (rawCursor !== null && (typeof rawCursor !== 'string' || rawCursor.length === 0)) return null;

  const rawSkip: unknown = parsed.s;
  if (typeof rawSkip !== 'number' || !isFinite(rawSkip) || rawSkip < 0) return null;
  if (Math.floor(rawSkip) !== rawSkip || rawSkip > SEARCH_CURSOR_MAX_SKIP) return null;

  const rawAlready: unknown = parsed.a;
  if (!Array.isArray(rawAlready) || rawAlready.length > SEARCH_MAX_RESULTS) return null;
  const already: string[] = [];
  for (let index = 0; index < rawAlready.length; index += 1) {
    const id: unknown = rawAlready[index];
    if (typeof id !== 'string' || id.length === 0 || id.length > MAX_CURSOR_USER_ID_LENGTH) return null;
    already.push(id);
  }

  return { storageCursor: rawCursor, skip: rawSkip, already };
}

/**
 * The folded search key for a raw client query, or null when the query cannot
 * be searched. The raw input is capped and folded by `normalizeQuery`; the
 * folded form must then pass `isSearchableQuery` (2 to 16 folded characters).
 * A non-string, an empty query or a one-character query is null, which the RPC
 * answers with `directory_bad_query` — never an empty result page.
 */
export function normalizeSearch(q: unknown): string | null {
  if (typeof q !== 'string') return null;
  const normalized = normalizeQuery(q);
  return isSearchableQuery(normalized) ? normalized : null;
}

/** Linear membership test; arrays rather than `Set` because the module bundles to ES5 for goja. */
function contains(ids: readonly string[], id: string): boolean {
  for (let index = 0; index < ids.length; index += 1) {
    if (ids[index] === id) return true;
  }
  return false;
}

/** A non-negative integer input; a bad value from the server is clamped rather than trusted. */
function clampCount(value: number): number {
  if (!isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** A validated claim → the wire row, with presence read as Everyone when the lookup has no entry. */
function toPlayer(claim: NameClaim, presenceOf: AssemblePageInput['presenceOf']): DirectoryPlayer {
  const visibility = presenceOf(claim.userId) ?? DEFAULT_PRESENCE_VISIBILITY;
  return { userId: claim.userId, name: claim.name, presence: labelOf(visibility) };
}

/**
 * Builds one page of search results from the exact row and the index rows.
 *
 * The order below is deliberate: the exact match is considered first, then the
 * rows in index order, and the first row that survives the drop rules is the
 * first player. That is the only way "exact first" holds across cursors.
 *
 * Drop order for one row, cheapest and safest first:
 * 1. **Malformed value** — `isNameClaim` rejects it; a broken record is not a player.
 * 2. **Not this prefix** — a defensive check on the folded value. The index is
 *    trusted to filter, but an offset cursor or a corrupted index must never
 *    make a name the caller did not search for visible.
 * 3. **Stale claim** — the owner's live name folds to a different key, or the
 *    account is gone. Dropping it is what leaves the key reclaimable: showing a
 *    stale row would resurrect a name its owner gave up, and the next claimant
 *    must be able to take the key without an unrelated cleanup.
 * 4. **Self** — a caller never finds itself (ADR-0004 section 11).
 * 5. **Duplicate claim key / userId** — offset cursors commonly duplicate rows,
 *    so a claim key seen on this page and a userId returned by an earlier page
 *    are both skipped. Dedupe runs before the block check because the block
 *    check is the expensive per-candidate call and a duplicate cannot add a
 *    player anyway.
 * 6. **Blocked either direction** — `canSee` folds both directions into one
 *    verdict; a hidden candidate is an ordinary miss, not an error.
 *
 * Capacity: the remaining global cap is `maxResults - already.length`, and a
 * page returns at most `min(pageSize, remainingCap)` rows. When that capacity is
 * exhausted and another viable row exists, `capped` is true and the caller stops
 * with `nextCursor: null`. When only the page size is exhausted (the global cap
 * still has room), the extra row is simply next-page material, so `capped` stays
 * false.
 */
export function assemblePage(input: AssemblePageInput): SearchPage {
  const pageSize = clampCount(input.pageSize);
  const maxResults = clampCount(input.maxResults);
  const alreadyCount = input.already.length;
  const remainingCap = maxResults > alreadyCount ? maxResults - alreadyCount : 0;
  const limit = pageSize < remainingCap ? pageSize : remainingCap;

  const players: DirectoryPlayer[] = [];
  const fixed: string[] = [];
  const seenClaimKeys: string[] = [];
  const seenUserIds: string[] = [];

  // Earlier pages' ids are what makes an offset duplicate a duplicate. Only the
  // userId is carried forward, because that is what `already` holds; a repeated
  // claim key within this page is caught by `seenClaimKeys`.
  for (let index = 0; index < input.already.length; index += 1) {
    const id = input.already[index];
    if (id !== undefined) seenUserIds.push(id);
  }

  let capped = false;

  /** The claim when the row may be shown, or null when a drop rule rejects it. */
  function admit(row: SearchRow): NameClaim | null {
    if (!isNameClaim(row.value)) return null;
    const claim = row.value;
    if (claim.fold.indexOf(input.query) !== 0) return null;
    if (isStale(claim, row.liveName)) return null;
    if (claim.userId === input.callerId) return null;
    if (contains(seenClaimKeys, row.claimKey)) return null;
    if (contains(seenUserIds, claim.userId)) return null;
    if (!input.canSee(claim.userId)) return null;
    return claim;
  }

  /** Considers one row; returns true when no further row can change the page or `capped`. */
  function take(row: SearchRow): boolean {
    const claim = admit(row);
    if (claim === null) return false;

    if (players.length < limit) {
      players.push(toPlayer(claim, input.presenceOf));
      fixed.push(claim.userId);
      seenClaimKeys.push(row.claimKey);
      seenUserIds.push(claim.userId);
      // A page smaller than the remaining cap is ordinary pagination: the next
      // viable row is next-page material, not proof that the cap was reached.
      return players.length >= limit && limit < remainingCap;
    }

    // The page and the remaining global cap are full, and this row is one more
    // match than may be returned. It means `capped` only when the limit that was
    // filled was the global cap (not just one page of several).
    if (limit === remainingCap) capped = true;
    return true;
  }

  if (input.exactRow !== null && take(input.exactRow)) {
    return { players, fixed, capped };
  }

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    if (row === undefined) continue;
    if (take(row)) break;
  }

  return { players, fixed, capped };
}
