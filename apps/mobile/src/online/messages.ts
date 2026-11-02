import { ERROR_CODES, ROOM_RPC_ERROR_CODES } from '@chkobba/protocol';
import type { FriendErrorCode, InviteRpcErrorCode } from '@chkobba/protocol';
import type { TFunction } from 'i18next';

import type { ConnectionState } from '@/game/GameClient';

import type { DirectoryError } from './directory';

/**
 * Online error codes with player-facing text; see `errors` in the catalogs.
 * Every wire `ErrorCode`, every private-table RPC error (also a join rejection
 * reason), plus client-side codes. `tr` keys are typed, so a new code without
 * catalog text fails typecheck.
 */
const KNOWN_ERRORS = [...ERROR_CODES, ...ROOM_RPC_ERROR_CODES, 'join_failed', 'match_ended', 'offline'] as const;
type KnownError = (typeof KNOWN_ERRORS)[number];

function isKnownError(code: string): code is KnownError {
  return (KNOWN_ERRORS as readonly string[]).includes(code);
}

export function onlineErrorMessage(code: string, tr: TFunction): string {
  return isKnownError(code) ? tr(`errors.${code}`) : tr('errors.unknown');
}

/** Text for an error thrown by a client action: known online codes get friendly text. */
export function actionErrorMessage(error: unknown, tr: TFunction): string {
  if (error instanceof Error && isKnownError(error.message)) return onlineErrorMessage(error.message, tr);
  return String(error);
}

/** Friend action failures: a before-AddFriends hook code, an unknown friend code, or a failed request. */
export type FriendErrorReason = FriendErrorCode | 'not_found' | 'network';

export function friendErrorMessage(reason: FriendErrorReason, tr: TFunction): string {
  return tr(`friends.errors.${reason}`);
}

/** Table invite failures: an `invite_to_table` RPC error code, or a failed request. */
export type InviteErrorReason = InviteRpcErrorCode | 'network';

export function inviteErrorMessage(reason: InviteErrorReason, tr: TFunction): string {
  return tr(`invite.errors.${reason}`);
}

/** Directory failures: a `directory_*` RPC error code, a presence `bad_request`, or a failed request. */
export function directoryErrorMessage(reason: DirectoryError, tr: TFunction): string {
  return tr(`directory.errors.${reason}`);
}

export function connectionLabel(connection: ConnectionState, tr: TFunction): string {
  switch (connection) {
    case 'connecting':
      return tr('online.connecting');
    case 'online':
      return tr('online.connected');
    case 'reconnecting':
      return tr('online.connectionLost');
  }
}
