/**
 * Private-table (room) wire types, RPC payloads and storage records, shared by
 * the server and the client. Plain consts and pure, dependency-free helpers
 * only: the server bundles this into its ES5 goja module, so no `u`-flag regex
 * and no post-ES2017 built-ins.
 */

/** 32 symbols: A-Z without I and O, digits 2-9 (no 0 or 1). 32^6 ≈ 1.07e9 codes. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
/** Web route for share links: `${base}/t/${code}`. */
export const ROOM_LINK_PATH = '/t/';
/** How long the final scores stay before a private table returns to its room. */
export const ROOM_RESET_MS = 15000;
/** Humans present in a private table (4 seated + standing). */
export const ROOM_MAX_MEMBERS = 8;
/**
 * One human present in a private table. User ids are on the wire (they are
 * public anyway via getUsers; ADR-0003); session ids never are.
 */
export interface RoomMember {
  readonly name: string;
  /**
   * The member's Nakama user id, for social actions such as "Add friend" on a
   * standing member. Members are always humans. Optional: older servers omit
   * it and older decoders drop it.
   */
  readonly userId?: string;
  /** Seat index 0-3, or null while standing. */
  readonly seat: number | null;
  readonly isHost: boolean;
}
/** Private-table information, present in a Snapshot only for private tables. */
export interface RoomInfo {
  readonly code: string;
  /** In join order (earliest first). */
  readonly members: readonly RoomMember[];
  /** The recipient's own entry: index into `members`. */
  readonly you: number;
  /** Team scores of the game in progress, for standing members (they get no `view`); null while waiting. */
  readonly scores: readonly [number, number] | null;
  /** Epoch ms when a finished private table returns to the waiting room; null otherwise. */
  readonly resetAt: number | null;
}
/** SIT payload: take an empty seat (waiting) or take over a bot seat (in game, while standing). */
export interface SitIntent {
  readonly seat: number;
}
// RPC: create_private_table   request {}            response CreatePrivateTableResponse
// RPC: join_by_code           request JoinByCodeRequest  response JoinByCodeResponse
export interface CreatePrivateTableResponse {
  readonly matchId: string;
  readonly code: string;
}
export interface JoinByCodeRequest {
  readonly code: string;
}
/**
 * `join_by_code` result. The client then joins the match over its socket with
 * `{ [ROOM_JOIN_CODE_KEY]: code }` as join metadata.
 */
export interface JoinByCodeResponse {
  readonly matchId: string;
}
/**
 * Join metadata key: a private table admits a newcomer only when
 * `metadata[ROOM_JOIN_CODE_KEY]` equals its code. Clients always send it when
 * joining a private table (they get the code from the route or the create RPC).
 */
export const ROOM_JOIN_CODE_KEY = 'code';
/** RPC error `message` values (thrown as { message, code } with numeric gRPC codes). */
export const ROOM_RPC_ERROR_CODES = [
  'room_bad_code', // format check failed (INVALID_ARGUMENT 3); counts as a failed lookup
  'room_not_found', // unknown code, or the match is gone (NOT_FOUND 5)
  'room_rate_limited', // too many failed lookups / creates (RESOURCE_EXHAUSTED 8)
] as const;
export type RoomRpcErrorCode = (typeof ROOM_RPC_ERROR_CODES)[number];
/** System-owned mapping record: collection `private_table`, key = code. Read/write 0/0. */
export const ROOM_COLLECTION = 'private_table';
export interface RoomCodeRecord {
  readonly matchId: string;
  readonly createdAt: number;
}
/** Per-user, server-owned rate-limit record: collection `private_table`, key `limits`. Read/write 0/0. */
export const ROOM_LIMITS_KEY = 'limits';
export interface RoomLimitsRecord {
  /** Fixed-window start (epoch ms) and failed join_by_code lookups in it. */
  readonly lookupWindowStart: number;
  readonly lookupFailures: number;
  /** Fixed-window start and private tables created in it. */
  readonly createWindowStart: number;
  readonly creates: number;
}

/**
 * Canonical form of a typed or pasted code: uppercase, with whitespace and
 * dashes removed (players may type `abc-123` or `ABC 123`). Does not validate;
 * pass the result to `isRoomCode`.
 */
export function normalizeRoomCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]+/g, '');
}

/** True when `code` is exactly `ROOM_CODE_LENGTH` characters from `ROOM_CODE_ALPHABET` (already normalized). */
export function isRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (let i = 0; i < code.length; i++) {
    if (ROOM_CODE_ALPHABET.indexOf(code.charAt(i)) < 0) return false;
  }
  return true;
}
