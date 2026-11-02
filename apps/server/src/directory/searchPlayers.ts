import {
  DEFAULT_PRESENCE_VISIBILITY,
  DIRECTORY_INDEX_NAME,
  SEARCH_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
  nameClaimKey,
  type DirectoryPlayer,
  type SearchPlayersResponse,
} from '@chkobba/protocol';
import { isCandidateVisible, readBlockedSet, type BlockView } from './blocks';
import { isNameClaim, readClaim, type StoredClaim } from './claimStore';
import { checkSearch, readLimits, recordSearch, writeLimits } from './limits';
import { labelOf, readPresenceVisibilities } from './presencePrefs';
import {
  assemblePage,
  decodeSearchCursor,
  encodeSearchCursor,
  isValidCursor,
  normalizeSearch,
  type SearchRow,
} from './search';

/**
 * `search_players` (ADR-0004 sections 4, 11, 12 and 13): one page of listed,
 * live, visible players whose folded name starts with the folded query, with an
 * exact match first. Registered in `main.ts` (goja needs a top-level named
 * function).
 *
 * Order, so a refusal reveals nothing and every attempt is counted:
 * 1. authentication; 2. payload and cursor shape (`directory_bad_query`, 3);
 * 3. query gating (`directory_bad_query`); 4. limits (`directory_rate_limited`,
 * 8); 5. record the attempt **before** the index is touched, so an enumeration
 * attempt counts even when it finds nothing; 6. the exact claim read; 7. the
 * index traversal; 8. presence labels.
 *
 * Two parts of the route shape the implementation:
 *
 * - **Exact-first is a direct read, not a sort.** An offset-cursor page cannot
 *   be ordered globally, so an exact match the index would place on page 3 can
 *   never be moved to the front by sorting a page. `storageRead` on the claim
 *   key derived from the folded query is the only way it leads page 1, and
 *   `assemblePage` dedupes it out of the index rows.
 * - **Offset cursors repeat and skip rows.** Nakama's `storageIndexList` cursor
 *   encodes an integer offset, not a keyset. A traversal may duplicate a row or
 *   move it out of the window. Rows are deduped by userId (via the cursor's
 *   `already`) and the residual position is carried explicitly (see
 *   `SearchCursor` in `search.ts`).
 *
 * Cost per search, so it stays bounded and reviewable: one limits read and one
 * limits write, at most one exact-claim read, at most `MAX_INDEX_FETCHES` (6)
 * index fetches of at most `INDEX_BATCH` (100) rows, at most one batched
 * `usersGetId` per fetched batch (ids capped at 100 per call), one
 * `friendsList` read for the caller's own blocks, one reverse `friendsList`
 * check per distinct candidate that survives the cheap drop rules, and one
 * batched `storageRead` for the presence labels of the returned page.
 */

/** gRPC status codes; nkruntime.Codes is an ambient const enum and cannot be read with isolatedModules. */
const INVALID_ARGUMENT = 3; // HTTP 400
const RESOURCE_EXHAUSTED = 8; // HTTP 429
const INTERNAL = 13; // HTTP 500
const UNAUTHENTICATED = 16; // HTTP 401

/** Rows per index fetch. Nakama's name lookup and this batch share the same 100-id ceiling. */
const INDEX_BATCH = 100;
/** Bound on index work per call; after this the caller gets the residual cursor instead. */
const MAX_INDEX_FETCHES = 6;

function badQuery(): nkruntime.Error {
  return { message: 'directory_bad_query', code: INVALID_ARGUMENT };
}

function rateLimited(): nkruntime.Error {
  return { message: 'directory_rate_limited', code: RESOURCE_EXHAUSTED };
}

/**
 * A storage failure that is not a business outcome. Deliberately outside
 * `DIRECTORY_RPC_ERROR_CODES`, like `name_storage_error`: a transient fault must
 * never read as an empty result page.
 */
function directoryStorageError(): nkruntime.Error {
  return { message: 'directory_storage_error', code: INTERNAL };
}

/** True for the `{ message, code }` errors this file throws; a storage throw is a GoError with no numeric code. */
function isNakamaError(error: unknown): error is nkruntime.Error {
  if (typeof error !== 'object' || error === null) return false;
  return typeof (error as { code?: unknown }).code === 'number';
}

/** The parsed request, or null for bad JSON, a non-object payload, a non-string `q`, or a malformed cursor. */
interface ParsedSearchRequest {
  readonly q: string;
  readonly cursor: string | undefined;
}

function parseRequest(payload: string): ParsedSearchRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (_error) {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('q' in value)) return null;
  const rawQuery: unknown = value.q;
  if (typeof rawQuery !== 'string') return null;

  // A JSON null cursor means the field is absent; `isValidCursor` (3.4) only
  // knows `undefined` for "first page", so normalize before asking it.
  let rawCursor: unknown = 'cursor' in value ? value.cursor : undefined;
  if (rawCursor === null) rawCursor = undefined;
  if (!isValidCursor(rawCursor)) return null;
  const cursor = typeof rawCursor === 'string' ? rawCursor : undefined;
  return { q: rawQuery, cursor };
}

/** One resolved live name per requested id; a user Nakama did not return maps to null (a stale claim). */
interface LiveNameLookup {
  readonly [userId: string]: string | null;
}

/**
 * Resolves a whole batch of ids in `usersGetId` calls of at most 100 ids each.
 * A missing user maps to null, which `isStale` treats as a stale claim; that is
 * what makes an orphan dropped from results. Never a lookup per row.
 */
function readLiveNames(nk: nkruntime.Nakama, userIds: readonly string[]): LiveNameLookup {
  const names: { [userId: string]: string | null } = Object.create(null);
  for (let start = 0; start < userIds.length; start += INDEX_BATCH) {
    const chunk = userIds.slice(start, start + INDEX_BATCH);
    if (chunk.length === 0) continue;
    const users = nk.usersGetId(chunk);
    for (let index = 0; index < users.length; index += 1) {
      const user = users[index];
      if (user === undefined || typeof user.userId !== 'string' || user.userId.length === 0) continue;
      names[user.userId] = typeof user.displayName === 'string' ? user.displayName : null;
    }
  }
  return names;
}

function liveNameOf(names: LiveNameLookup, userId: string): string | null {
  const name = names[userId];
  return typeof name === 'string' ? name : null;
}

/** A validated claim row from the index, before its live name is attached. */
interface RawIndexRow {
  readonly claimKey: string;
  readonly value: unknown;
  readonly userId: string | null;
}

export function rpcSearchPlayers(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const callerId = ctx.userId;
  if (!callerId) throw { message: 'search_players requires an authenticated user', code: UNAUTHENTICATED };

  const request = parseRequest(payload);
  if (request === null) throw badQuery();
  const query = normalizeSearch(request.q);
  if (query === null) throw badQuery();

  const decoded = request.cursor === undefined ? null : decodeSearchCursor(request.cursor);
  if (request.cursor !== undefined && decoded === null) throw badQuery();
  const isFirstPage = decoded === null;

  try {
    // Narrowed aliases so the hoisted helpers below see `string`, not the
    // optional context field / nullable query.
    const caller: string = callerId;
    const searchQuery: string = query;
    const now = Date.now();
    const limits = readLimits(nk, callerId);
    if (!checkSearch(limits, now)) throw rateLimited();
    // Counted before the query: an enumeration attempt must count even when it
    // finds nothing, otherwise a script could walk prefixes for free.
    writeLimits(nk, callerId, recordSearch(limits, now));

    // The exact match is read directly on the first page only. Later pages must
    // not re-emit it, and its userId travels in the cursor's `already` so the
    // index row is deduped; a dropped exact match's index row is dropped by the
    // same stale/self/block rules.
    const exactClaim: StoredClaim | null = isFirstPage ? readClaim(nk, nameClaimKey(query)) : null;
    const exactUserId = exactClaim === null ? null : exactClaim.record.userId;

    // One own-block list for the whole call. The reverse direction is read per
    // candidate inside `isCandidateVisible` and fails closed there.
    const blockView: BlockView = { blocked: readBlockedSet(nk, callerId), blockedBy: [] };
    const visibility: { [userId: string]: boolean } = Object.create(null);
    function canSee(userId: string): boolean {
      const cached = visibility[userId];
      if (cached !== undefined) return cached;
      const verdict = isCandidateVisible(nk, blockView, caller, userId);
      visibility[userId] = verdict;
      return verdict;
    }

    const players: DirectoryPlayer[] = [];
    // Ids returned earlier (this page included), for cross-page dedupe and the
    // global cap. Copied out of the cursor so the cursor value stays readonly.
    const already: string[] = [];
    if (decoded !== null) {
      for (let index = 0; index < decoded.already.length; index += 1) {
        const id = decoded.already[index];
        if (id !== undefined) already.push(id);
      }
    }

    const initialRemaining = SEARCH_MAX_RESULTS > already.length ? SEARCH_MAX_RESULTS - already.length : 0;
    const initialLimit = SEARCH_PAGE_SIZE < initialRemaining ? SEARCH_PAGE_SIZE : initialRemaining;
    let capped = false;

    /**
     * Whether enough has been assembled to end the traversal. The page is done
     * once it is full, unless the page is also the global cap: there `capped`
     * can only be learned by finding one more admissible row, so scanning
     * continues until that row or the index end.
     */
    function settled(): boolean {
      if (capped) return true;
      return players.length >= initialLimit && players.length < initialRemaining;
    }

    /**
     * Feeds one row (or just the exact row) through the pure assembler. The
     * presence lookup is deferred: it cannot change admissibility, only the
     * label, so the page is assembled with the default and relabelled in one
     * batched read afterwards.
     */
    function consume(rows: readonly SearchRow[], exact: SearchRow | null): void {
      const page = assemblePage({
        query: searchQuery,
        callerId: caller,
        exactRow: exact,
        rows,
        pageSize: SEARCH_PAGE_SIZE,
        maxResults: SEARCH_MAX_RESULTS,
        already,
        canSee,
        presenceOf: noPresence,
      });
      for (let index = 0; index < page.players.length; index += 1) {
        const player = page.players[index];
        if (player !== undefined) players.push(player);
      }
      for (let index = 0; index < page.fixed.length; index += 1) {
        const id = page.fixed[index];
        if (id !== undefined) already.push(id);
      }
      if (page.capped) capped = true;
    }

    let inputCursor: string | undefined = decoded === null || decoded.storageCursor === null ? undefined : decoded.storageCursor;
    const skipStart = decoded === null ? 0 : decoded.skip;

    // Residual position of the first row the next page must read. `null` cursor
    // means the index start, which is only possible when page 1 stopped inside
    // its first batch.
    let residualCursor: string | null = null;
    let residualSkip = 0;
    let haveResidual = false;
    let exhausted = false;
    let fetches = 0;

    while (fetches < MAX_INDEX_FETCHES && !settled()) {
      const fetchLimit = fetches === 0 && isFirstPage && exactUserId !== null ? INDEX_BATCH - 1 : INDEX_BATCH;
      const result = nk.storageIndexList(
        DIRECTORY_INDEX_NAME,
        '+value.fold:' + query + '*',
        fetchLimit,
        undefined,
        undefined,
        inputCursor,
      );
      fetches += 1;
      const firstFetch = fetches === 1;
      const objects: nkruntime.StorageObject[] = Array.isArray(result.objects) ? result.objects : [];
      const nextCursor = typeof result.cursor === 'string' && result.cursor.length > 0 ? result.cursor : null;

      // Collect the rows and the distinct ids to resolve names for. Rows keep
      // their index position so the residual skip is counted in the same units
      // the next call will see.
      const rawRows: RawIndexRow[] = [];
      const nameIds: string[] = [];
      const seenNameIds: { [userId: string]: boolean } = Object.create(null);
      for (let index = 0; index < objects.length; index += 1) {
        const object = objects[index];
        let claimKey = '';
        let value: unknown = null;
        let userId: string | null = null;
        if (object !== undefined) {
          if (typeof object.key === 'string') claimKey = object.key;
          value = object.value;
          if (isNameClaim(value)) userId = value.userId;
        }
        rawRows.push({ claimKey, value, userId });
        if (userId !== null && seenNameIds[userId] !== true) {
          seenNameIds[userId] = true;
          nameIds.push(userId);
        }
      }
      // The exact holder is resolved with the first batch: firstFetch reduced
      // the fetch limit by one so the combined id list stays at or under 100.
      if (firstFetch && isFirstPage && exactUserId !== null && seenNameIds[exactUserId] !== true) {
        seenNameIds[exactUserId] = true;
        nameIds.push(exactUserId);
      }
      const names = readLiveNames(nk, nameIds);

      const rows: SearchRow[] = [];
      for (let index = 0; index < rawRows.length; index += 1) {
        const raw = rawRows[index];
        if (raw === undefined) continue;
        rows.push({
          claimKey: raw.claimKey,
          value: raw.value,
          liveName: raw.userId === null ? null : liveNameOf(names, raw.userId),
        });
      }

      // Exact first: it heads page 1 and is deduped out of the index rows by
      // its userId in `already`.
      if (firstFetch && isFirstPage && exactClaim !== null) {
        const exactRow: SearchRow = {
          claimKey: nameClaimKey(query),
          value: exactClaim.record,
          liveName: liveNameOf(names, exactClaim.record.userId),
        };
        consume([], exactRow);
      }

      const start = firstFetch ? skipStart : 0;
      let consumed = start;
      let stopped = false;
      for (let index = start; index < rows.length; index += 1) {
        if (settled()) {
          stopped = true;
          break;
        }
        const row = rows[index];
        if (row === undefined) continue;
        consume([row], null);
        consumed = index + 1;
        if (settled()) {
          stopped = true;
          break;
        }
      }

      if (stopped) {
        if (consumed >= rows.length) {
          // The batch was finished, so carry its continuation cursor alone.
          if (nextCursor === null) {
            exhausted = true;
            haveResidual = false;
          } else {
            residualCursor = nextCursor;
            residualSkip = 0;
            haveResidual = true;
          }
        } else {
          // Mid-batch: keep the cursor that opened this batch and how many rows
          // were read, so the next page resumes instead of skipping the rest.
          residualCursor = inputCursor === undefined ? null : inputCursor;
          residualSkip = consumed;
          haveResidual = true;
        }
        break;
      }

      // Batch exhausted without settling.
      if (nextCursor === null) {
        exhausted = true;
        haveResidual = false;
        break;
      }
      inputCursor = nextCursor;
      residualCursor = nextCursor;
      residualSkip = 0;
      haveResidual = true;
    }

    // The global cap bounds the whole query. If the cap was reached and the
    // index end was not proven, more matches may exist: report `capped` and
    // never hand out a cursor past the cap.
    const atCap = already.length >= SEARCH_MAX_RESULTS;
    const finalCapped = capped || (atCap && !exhausted);
    let nextCursor: string | null = null;
    if (!finalCapped && !exhausted && haveResidual) {
      nextCursor = encodeSearchCursor({ storageCursor: residualCursor, skip: residualSkip, already });
    }

    // One batched presence read for the returned page. Deferring it until the
    // page is known keeps it one call per search and bounded by page size.
    const presenceIds: string[] = [];
    const seenPresence: { [userId: string]: boolean } = Object.create(null);
    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      if (player === undefined || seenPresence[player.userId] === true) continue;
      seenPresence[player.userId] = true;
      presenceIds.push(player.userId);
    }
    const presence = readPresenceVisibilities(nk, presenceIds);
    const resultPlayers: DirectoryPlayer[] = [];
    for (let index = 0; index < players.length; index += 1) {
      const player = players[index];
      if (player === undefined) continue;
      const visibilityChoice = presence[player.userId] ?? DEFAULT_PRESENCE_VISIBILITY;
      resultPlayers.push({ userId: player.userId, name: player.name, presence: labelOf(visibilityChoice) });
    }

    const response: SearchPlayersResponse = {
      players: resultPlayers,
      nextCursor,
      capped: finalCapped,
    };
    logger.debug(
      'search_players: user %s returned %d players (capped=%s, fetches=%d)',
      callerId,
      resultPlayers.length,
      finalCapped,
      fetches,
    );
    return JSON.stringify(response);
  } catch (error) {
    // Keep the business answers above; a raw storage throw is a fault, not an empty page.
    if (isNakamaError(error)) throw error;
    throw directoryStorageError();
  }
}

/** Placeholder presence lookup: labels are attached in one batched read after assembly. */
function noPresence(_userId: string): undefined {
  return undefined;
}
