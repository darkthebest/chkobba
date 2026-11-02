/**
 * Player stats wire types and the server-owned stat records, shared by the
 * server and the client.
 *
 * Provenance split: competitive stats are server-observed at game finish (the
 * authoritative match counts them, so they are trustworthy), while practice
 * stats are reported by the device after an offline bot game and are
 * display-only. The two blocks are shown side by side and are never summed.
 *
 * Both records are server-owned: write permission 0, so no client can write a
 * stat directly (practice goes through the `report_practice_game` RPC).
 *
 * Plain consts and types only: the server bundles this into its ES5 goja
 * module.
 */

/** Nakama storage collection holding every stats record. */
export const STATS_COLLECTION = 'player_stats';

/** Key `competitive`. Owned by the player; read 0, write 0 (server-owned). */
export const COMPETITIVE_STATS_KEY = 'competitive';

/** Key `practice`. Owned by the player; read 0, write 0 (server-owned). */
export const PRACTICE_STATS_KEY = 'practice';

/** One block. Competitive carries streaks; practice does not (display-only). */
export interface CompetitiveStats {
  /** Finished 2v2 games this player was present for. */
  readonly games: number;
  /** Games their team won. */
  readonly wins: number;
  /** Team chkobba sweeps across counted games. */
  readonly chkobbas: number;
  /** Consecutive wins ending with the last counted game. */
  readonly currentStreak: number;
  /** Longest win streak ever recorded. */
  readonly bestStreak: number;
  /** Epoch ms the record last changed. */
  readonly updatedAt: number;
}

/** Device-reported offline game totals. Display-only, never compared or summed with competitive. */
export interface PracticeStats {
  readonly games: number;
  readonly wins: number;
  readonly chkobbas: number;
  /** Epoch ms the record last changed. */
  readonly updatedAt: number;
}

/** What a profile renders. Absent records read as all-zero blocks. */
export interface PlayerStats {
  readonly competitive: CompetitiveStats;
  readonly practice: PracticeStats;
}

/** RPC: report_practice_game   request ReportPracticeGameRequest   response ReportPracticeGameResponse */
export interface ReportPracticeGameRequest {
  /** One finished offline bot game. */
  readonly win: boolean;
  /** Team chkobbas won in that game; clamped server-side to PRACTICE_MAX_CHKOBBA_PER_GAME. */
  readonly chkobbas: number;
}
export interface ReportPracticeGameResponse {
  /** The record after the report was folded in. */
  readonly practice: PracticeStats;
}

/**
 * Most chkobbas one practice game can plausibly award; anything above is
 * clamped rather than rejected, so a buggy client never inflates the record.
 */
export const PRACTICE_MAX_CHKOBBA_PER_GAME = 21;
/** Practice reports one caller may send per fixed window. */
export const PRACTICE_REPORT_LIMIT = 60;
/** Fixed window length for PRACTICE_REPORT_LIMIT (1 h). */
export const PRACTICE_WINDOW_MS = 3600000;

/** `report_practice_game` error `message` values (thrown as { message, code } with numeric gRPC codes). */
export const PRACTICE_RPC_ERROR_CODES = [
  'practice_bad_request', // malformed payload (INVALID_ARGUMENT 3)
  'practice_rate_limited', // over PRACTICE_REPORT_LIMIT (RESOURCE_EXHAUSTED 8)
] as const;
export type PracticeRpcErrorCode = (typeof PRACTICE_RPC_ERROR_CODES)[number];
