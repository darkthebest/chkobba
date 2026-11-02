import {
  FRIEND_STATE,
  INVITE_LIMITS_KEY,
  NOTIFICATION_CODES,
  SOCIAL_COLLECTION,
  isRoomCode,
  normalizeRoomCode,
  type InviteLimitsRecord,
  type InviteRpcErrorCode,
  type InviteToTableRequest,
  type InviteToTableResponse,
  type TableInviteContent,
} from '@chkobba/protocol';
import { readCode } from '../rpc/roomStore';
import { isLivePrivateMatch } from '../rpc/privateTable';
import { checkWindow, isDuplicate, parseInviteLimits, recordSend } from './inviteLimits';
import type { MemberQuery } from './matchSignal';

/**
 * `invite_to_table` (Friends v1, plan Phase 7). A member of a live private
 * room invites one mutual friend by user id. Registered in `main.ts` (goja
 * needs a top-level named function).
 *
 * Order, so a rejected call reveals as little as possible and a repeat never
 * counts toward the window:
 * 1. authentication; 2. payload shape (`invite_bad_request`, 3);
 * 3. mutual friend (`invite_not_friend`, 9);
 * 4. live code → live private match (`invite_room_not_found`, 5);
 * 5. the caller must be present in that room (`invite_not_member`, 7);
 * 6. dedupe → `{ sent: false }` without reading or writing the window;
 * 7. window (`invite_rate_limited`, 8); 8. one persistent notification;
 * 9. record the send (best effort, never fails the call).
 *
 * Room codes are never logged.
 */

/** gRPC status codes; nkruntime.Codes is an ambient const enum and cannot be read with isolatedModules. */
const INVALID_ARGUMENT = 3; // HTTP 400
const NOT_FOUND = 5; // HTTP 404
const PERMISSION_DENIED = 7; // HTTP 403
const RESOURCE_EXHAUSTED = 8; // HTTP 429
const FAILED_PRECONDITION = 9; // HTTP 400
const UNAUTHENTICATED = 16; // HTTP 401

/** Nakama user ids are 36-character UUIDs; leave room, but cap the field. */
const MAX_USER_ID_LENGTH = 128;
/** No normalized room code is longer; anything beyond this is junk and is not normalized. */
const MAX_CODE_INPUT = 32;
/** One page of friend edges; well above MAX_FRIENDS (200). */
const FRIEND_LIST_LIMIT = 1000;
/** Server-only records: no client read, no client write. */
const NO_CLIENT_READ = 0;
const NO_CLIENT_WRITE = 0;
const PLAYER_FALLBACK_NAME = 'Player';

function inviteError(message: InviteRpcErrorCode): nkruntime.Error {
  let code = RESOURCE_EXHAUSTED;
  if (message === 'invite_bad_request') code = INVALID_ARGUMENT;
  else if (message === 'invite_not_friend') code = FAILED_PRECONDITION;
  else if (message === 'invite_not_member') code = PERMISSION_DENIED;
  else if (message === 'invite_room_not_found') code = NOT_FOUND;
  return { message, code };
}

export function rpcInviteToTable(
  ctx: nkruntime.Context,
  logger: nkruntime.Logger,
  nk: nkruntime.Nakama,
  payload: string,
): string {
  const userId = ctx.userId;
  if (!userId) throw { message: 'invite_to_table requires an authenticated user', code: UNAUTHENTICATED };

  const request = parseInviteRequest(payload);
  if (request === null) throw inviteError('invite_bad_request');
  const targetUserId = request.userId;
  const code = request.code;

  if (!isFriend(nk, userId, targetUserId)) throw inviteError('invite_not_friend');

  const stored = readCode(nk, code);
  if (stored === null || !isLivePrivateMatch(nk, stored.record.matchId)) throw inviteError('invite_room_not_found');
  const matchId = stored.record.matchId;

  if (!isMember(nk, logger, matchId, userId)) throw inviteError('invite_not_member');

  const now = Date.now();
  const limits = readInviteLimits(nk, userId);
  if (isDuplicate(limits, targetUserId, code, now)) {
    const duplicate: InviteToTableResponse = { sent: false };
    return JSON.stringify(duplicate);
  }
  if (!checkWindow(limits, now).ok) throw inviteError('invite_rate_limited');

  const content: TableInviteContent = { v: 1, code, fromName: senderName(ctx, logger, nk, userId) };
  nk.notificationSend(targetUserId, 'table_invite', content, NOTIFICATION_CODES.TABLE_INVITE, userId, true);

  try {
    writeInviteLimits(nk, userId, recordSend(limits, targetUserId, code, now));
  } catch (error) {
    // The notification already went out; a missed record only loosens the limits.
    logger.warn('invite_to_table: limits not recorded for %s: %s', userId, String(error));
  }

  return JSON.stringify({ sent: true } satisfies InviteToTableResponse);
}

/** The parsed request, or null for bad JSON or a malformed id or code. */
function parseInviteRequest(payload: string): InviteToTableRequest | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch (_error) {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('userId' in value) || !('code' in value)) return null;
  const rawUserId: unknown = value.userId;
  const rawCode: unknown = value.code;
  if (typeof rawUserId !== 'string' || rawUserId.length === 0 || rawUserId.length > MAX_USER_ID_LENGTH) return null;
  if (typeof rawCode !== 'string' || rawCode.length > MAX_CODE_INPUT) return null;
  const code = normalizeRoomCode(rawCode);
  return isRoomCode(code) ? { userId: rawUserId, code } : null;
}

/** True when `targetUserId` is an accepted (mutual) friend of `userId`. */
function isFriend(nk: nkruntime.Nakama, userId: string, targetUserId: string): boolean {
  const friends = nk.friendsList(userId, FRIEND_LIST_LIMIT, FRIEND_STATE.FRIEND).friends ?? [];
  for (let i = 0; i < friends.length; i++) {
    const friend = friends[i];
    if (friend === undefined || friend.user === undefined) continue;
    if (friend.user.userId === targetUserId && friend.state === FRIEND_STATE.FRIEND) return true;
  }
  return false;
}

/**
 * Whether `userId` is a present member of the table. A vanished match makes
 * `matchSignal` throw; that reads as "not a live room", not "not a member".
 */
function isMember(nk: nkruntime.Nakama, logger: nkruntime.Logger, matchId: string, userId: string): boolean {
  const query: MemberQuery = { type: 'is_member', userId };
  let answer: string;
  try {
    answer = nk.matchSignal(matchId, JSON.stringify(query));
  } catch (error) {
    logger.warn('invite_to_table: match signal failed: %s', String(error));
    throw inviteError('invite_room_not_found');
  }
  return answer === 'yes';
}

/** The caller's display name at send time: `display_name`, else username, else 'Player'. */
function senderName(ctx: nkruntime.Context, logger: nkruntime.Logger, nk: nkruntime.Nakama, userId: string): string {
  try {
    const user = nk.usersGetId([userId])[0];
    if (user !== undefined && typeof user.displayName === 'string' && user.displayName.trim().length > 0) {
      return user.displayName.trim();
    }
  } catch (error) {
    logger.warn('invite_to_table: display name lookup failed for %s: %s', userId, String(error));
  }
  const username = ctx.username !== undefined ? ctx.username.trim() : '';
  return username.length > 0 ? username : PLAYER_FALLBACK_NAME;
}

/** The caller's `social/invite_limits` record; absent or malformed reads as empty. Throws on a storage failure. */
function readInviteLimits(nk: nkruntime.Nakama, ownerUserId: string): InviteLimitsRecord {
  const objects = nk.storageRead([{ collection: SOCIAL_COLLECTION, key: INVITE_LIMITS_KEY, userId: ownerUserId }]);
  const object = objects.length > 0 ? objects[0] : undefined;
  return parseInviteLimits(object === undefined ? null : object.value);
}

/** Server-only record, last write wins. Throws on a storage failure; the caller logs and carries on. */
function writeInviteLimits(nk: nkruntime.Nakama, ownerUserId: string, record: InviteLimitsRecord): void {
  nk.storageWrite([
    {
      collection: SOCIAL_COLLECTION,
      key: INVITE_LIMITS_KEY,
      userId: ownerUserId,
      value: record,
      permissionRead: NO_CLIENT_READ,
      permissionWrite: NO_CLIENT_WRITE,
    },
  ]);
}
