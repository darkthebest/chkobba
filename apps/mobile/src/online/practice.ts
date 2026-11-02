import {
  PRACTICE_MAX_CHKOBBA_PER_GAME,
  type PracticeStats,
  type ReportPracticeGameRequest,
} from '@chkobba/protocol';
import type { PlayerView } from '@chkobba/rules';
import type { Client, Session } from '@heroiclabs/nakama-js';

/**
 * Practice reporting over nakama-js: one finished offline bot game, reported
 * after the fact to `report_practice_game` so the player's practice block
 * reflects it. Practice is display-only (ADR-0005): a lost report costs
 * nothing, so nothing here is queued, retried or thrown.
 *
 * The session gate is `GuestAuth.resume` (injected as `resume`), never
 * `signIn`: a device that has only ever played offline must not get an account
 * created just to post a stat, and a device that is offline right now stays
 * account-less. A missing session (`null`) and a failed lookup (a rejected
 * promise) both mean "drop the report silently". Every other failure — a
 * network error, `practice_rate_limited`, `practice_storage_error`, a malformed
 * envelope — also resolves to `null`; the outcome is never surfaced in the UI.
 */

/** One finished game, already reduced to what the RPC records. */
export interface PracticeResult {
  readonly won: boolean;
  /** The winning team's sweep count; clamped before it goes on the wire. */
  readonly chkobbas: number;
}

/** The nakama-js calls a reporter makes, so tests can pass a small fake. */
export type PracticeClient = Pick<Client, 'rpc'>;

/** The only two dependencies, so a test can drive the reporter without nakama-js or a device. */
export interface PracticeReporterDeps {
  readonly client: PracticeClient;
  /**
   * The stored session, or null when this device has never signed in.
   * `GuestAuth.resume`, never `signIn`, because the latter creates an account.
   */
  readonly resume: () => Promise<{ readonly session: Session } | null>;
}

/** Reports one finished offline game; null means the report was dropped. Never rejects. */
export type PracticeReporter = (result: PracticeResult) => Promise<PracticeStats | null>;

/**
 * One seat's result in a finished offline game, or null while the game has no
 * winner. Mirrors the server's `competitiveResultFor`: partners sit opposite,
 * so seats 0/2 form team 0 and seats 1/3 team 1, and `chkobbas` is the team's
 * sweep count for the whole game, not the seat's.
 */
export function practiceResultFor(
  view: Pick<PlayerView, 'seat' | 'winner' | 'chkobbas'>,
): PracticeResult | null {
  if (view.winner === null) return null;
  const team = view.seat % 2 === 0 ? 0 : 1;
  return { won: view.winner === team, chkobbas: view.chkobbas[team] };
}

/**
 * A reportable sweep count: floored, clamped to `[0, PRACTICE_MAX_CHKOBBA_PER_GAME]`,
 * with a non-finite value reading as zero. The server clamps too; this only
 * keeps a bad local value from putting a nonsensical number on the wire.
 */
export function clampPracticeChkobbas(chkobbas: number): number {
  if (!Number.isFinite(chkobbas)) return 0;
  const floored = Math.floor(chkobbas);
  if (floored <= 0) return 0;
  return floored < PRACTICE_MAX_CHKOBBA_PER_GAME ? floored : PRACTICE_MAX_CHKOBBA_PER_GAME;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * `report_practice_game` success payload → the practice block, or null when
 * `practice` is missing or a counter is not a finite non-negative number.
 * Never a cast: an unrecognisable answer is simply dropped.
 */
export function practiceStatsFromPayload(payload: unknown): PracticeStats | null {
  if (typeof payload !== 'object' || payload === null || !('practice' in payload)) return null;
  const { practice } = payload;
  if (typeof practice !== 'object' || practice === null) return null;
  const games = 'games' in practice ? practice.games : undefined;
  const wins = 'wins' in practice ? practice.wins : undefined;
  const chkobbas = 'chkobbas' in practice ? practice.chkobbas : undefined;
  const updatedAt = 'updatedAt' in practice ? practice.updatedAt : undefined;
  if (!isCount(games) || !isCount(wins) || !isCount(chkobbas) || !isCount(updatedAt)) return null;
  return { games, wins, chkobbas, updatedAt };
}

/**
 * Builds the reporter. It resumes the stored session first (which never creates
 * an account) and only then calls the RPC; anything that goes wrong on either
 * step resolves to null. The response is parsed defensively and returned, but
 * nothing is cached or persisted on the device.
 */
export function createPracticeReporter(deps: PracticeReporterDeps): PracticeReporter {
  return async (result) => {
    let session: Session;
    try {
      const resumed = await deps.resume();
      if (resumed === null) return null;
      session = resumed.session;
    } catch {
      return null;
    }
    const request: ReportPracticeGameRequest = {
      win: result.won,
      chkobbas: clampPracticeChkobbas(result.chkobbas),
    };
    try {
      const response = await deps.client.rpc(session, 'report_practice_game', request);
      return practiceStatsFromPayload(response.payload);
    } catch {
      return null;
    }
  };
}
