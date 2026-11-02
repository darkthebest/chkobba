import {
  PRESENCE_VISIBILITY,
  PROFILE_COLLECTION,
  PROFILE_PREFS_KEY,
  type PresencePrefsRecord,
  type PresenceVisibility,
  type SetPresenceVisibilityRequest,
  type SetPresenceVisibilityResponse,
} from '@chkobba/protocol';

/**
 * `set_presence_visibility` (ADR-0004 section 14): saves the caller's presence
 * choice and echoes the value now in effect. Registered in `main.ts` (goja needs
 * a top-level named function).
 *
 * The prefs record (`profile/prefs`) is owner read 1 / write 0: **no client path
 * writes this record**, so this RPC is the only writer. A client can therefore
 * read its own choice but can never publish a value the server did not save,
 * which is what makes Everyone/Nobody enforceable rather than cosmetic.
 *
 * Only the two protocol states are accepted. Anything else — bad JSON, a
 * non-object payload, a missing field or an unknown value — is
 * `presence_bad_request` (3) and the input is never echoed, so a malformed
 * request cannot reflect attacker-controlled text back through the error.
 */
const INVALID_ARGUMENT = 3; // HTTP 400
const INTERNAL = 13; // HTTP 500
const UNAUTHENTICATED = 16; // HTTP 401

/** Owner-readable, server-written: the record is the server's, not the client's. */
const PREFS_OWNER_READ = 1;
const PREFS_NO_CLIENT_WRITE = 0;

function presenceBadRequest(): nkruntime.Error {
  return { message: 'presence_bad_request', code: INVALID_ARGUMENT };
}

/**
 * A storage failure that is not a business outcome. Outside
 * `DIRECTORY_RPC_ERROR_CODES`, like `name_storage_error`: the choice was not
 * saved, and a client that does not know the message falls back to its generic
 * error rather than believing the new value is in effect.
 */
function directoryStorageError(): nkruntime.Error {
  return { message: 'directory_storage_error', code: INTERNAL };
}

/** Membership test over the protocol state list; a loop, not `includes`, so the ES5 bundle needs no polyfill. */
function isPresenceVisibility(value: unknown): value is PresenceVisibility {
  for (let index = 0; index < PRESENCE_VISIBILITY.length; index += 1) {
    if (PRESENCE_VISIBILITY[index] === value) return true;
  }
  return false;
}

/** The parsed request, or null for bad JSON, a non-object payload or an unknown visibility. */
function parseRequest(payload: string): SetPresenceVisibilityRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (_error) {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('visibility' in value)) return null;
  const visibility: unknown = value.visibility;
  if (!isPresenceVisibility(visibility)) return null;
  return { visibility };
}

export function rpcSetPresenceVisibility(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const callerId = ctx.userId;
  if (!callerId) throw { message: 'set_presence_visibility requires an authenticated user', code: UNAUTHENTICATED };

  const request = parseRequest(payload);
  if (request === null) throw presenceBadRequest();
  const visibility = request.visibility;

  const updatedAt = Date.now();
  const record: PresencePrefsRecord = { visibility, updatedAt };
  try {
    nk.storageWrite([
      {
        collection: PROFILE_COLLECTION,
        key: PROFILE_PREFS_KEY,
        userId: callerId,
        value: record,
        permissionRead: PREFS_OWNER_READ,
        permissionWrite: PREFS_NO_CLIENT_WRITE,
      },
    ]);
  } catch (_error) {
    // A fault is a fault, never a silently discarded choice.
    throw directoryStorageError();
  }

  const response: SetPresenceVisibilityResponse = { visibility, updatedAt };
  logger.debug('set_presence_visibility: user %s -> %s', callerId, visibility);
  return JSON.stringify(response);
}
