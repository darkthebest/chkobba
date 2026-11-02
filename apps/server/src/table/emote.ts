import { EMOTE_COOLDOWN_MS, isEmoteId, type EmoteShown, type ErrorCode } from '@chkobba/protocol';
import { findHumanSeat } from './lifecycle';
import type { Presence, TableState } from './types';

/**
 * `shown` is what to broadcast, or null when the seat is still cooling down
 * (dropped silently: a well-behaved client never sends that fast).
 */
export type EmoteResult =
  | { readonly ok: true; readonly shown: EmoteShown | null }
  | { readonly ok: false; readonly error: ErrorCode };

/**
 * Validates an EMOTE message. Emotes never touch the table state, so the
 * caller keeps the per-seat send times (`lastAt`, epoch ms of this seat's
 * last shown emote) and records `now` when `shown` is non-null.
 */
export function emote(
  state: TableState,
  from: Presence,
  payload: unknown,
  lastAt: number | undefined,
  now: number,
): EmoteResult {
  const found = findHumanSeat(state, from.userId);
  if (!found || found.seat.sessionId !== from.sessionId) return { ok: false, error: 'not_seated' };
  const id = typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? (payload as { id?: unknown }).id : undefined;
  if (!isEmoteId(id)) return { ok: false, error: 'bad_payload' };
  if (lastAt !== undefined && now - lastAt < EMOTE_COOLDOWN_MS) return { ok: true, shown: null };
  return { ok: true, shown: { seat: found.index, id } };
}
