import { findMember, isPresent, roomOf, type TableState } from '../table';

/**
 * Match signals (Friends v1, plan technical decision 7). `nk.matchSignal` is
 * server-only (clients cannot send signals), so the only caller is
 * `invite_to_table`, which asks a table whether the inviter is in its room.
 *
 * Every answer is a plain string: `'yes'` or `'no'`. Unknown or malformed
 * signals answer `'no'`, so a caller can never mistake garbage for consent.
 */

/** "Is this user a present member of your private room?" */
export interface MemberQuery {
  readonly type: 'is_member';
  readonly userId: string;
}

export type SignalAnswer = 'yes' | 'no';

export const SIGNAL_YES: SignalAnswer = 'yes';
export const SIGNAL_NO: SignalAnswer = 'no';

/** Signals are tiny; anything larger is rejected before JSON parsing. */
export const MAX_SIGNAL_BYTES = 1024;
/** Nakama user ids are 36-character UUIDs; leave room, but cap the field. */
const MAX_USER_ID_LENGTH = 128;

/** The query in `data`, or null for bad JSON, a wrong `type` or a bad `userId`. */
export function parseMemberQuery(data: string): MemberQuery | null {
  if (typeof data !== 'string' || data.length === 0 || data.length > MAX_SIGNAL_BYTES) return null;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch (_error) {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  if (!('type' in value) || value.type !== 'is_member' || !('userId' in value)) return null;
  const userId: unknown = value.userId;
  if (typeof userId !== 'string' || userId.length === 0 || userId.length > MAX_USER_ID_LENGTH) return null;
  return { type: 'is_member', userId };
}

/**
 * `'yes'` only when the table is a private room and `userId` is one of its
 * present members (seated or standing). Public tables, non-members, seated
 * members disconnected mid-game and malformed data all answer `'no'`.
 */
export function answerSignal(state: TableState, data: string): SignalAnswer {
  const query = parseMemberQuery(data);
  if (query === null) return SIGNAL_NO;
  const room = roomOf(state);
  if (room === null) return SIGNAL_NO;
  const found = findMember(room, query.userId);
  return found !== null && isPresent(found.member) ? SIGNAL_YES : SIGNAL_NO;
}
