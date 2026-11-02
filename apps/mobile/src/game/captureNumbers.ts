import type { CardId, PlayMove } from '@chkobba/rules';

export interface NumberedMove {
  readonly move: PlayMove;
  /** 1-based option number for captures; null for placing the card. */
  readonly n: number | null;
}

/** Numbers capture options in order; the same numbers are shown on the options and the table cards. */
export function numberMoves(moves: readonly PlayMove[]): NumberedMove[] {
  let n = 0;
  return moves.map((move) => ({ move, n: move.capture.length > 0 ? ++n : null }));
}

/** Option numbers each table card belongs to. */
export function badgesByCard(numbered: readonly NumberedMove[]): Map<CardId, number[]> {
  const out = new Map<CardId, number[]>();
  for (const { move, n } of numbered) {
    if (n === null) continue;
    for (const id of move.capture) out.set(id, [...(out.get(id) ?? []), n]);
  }
  return out;
}
