import type { Card, CardId, Seat } from '@chkobba/rules';
import { useEffect, useState } from 'react';

import type { LogEntry } from './GameClient';

/** How long a capture stays on the table (played card landed, taken cards lit) before it is swept away. */
export const CAPTURE_LAND_MS = 650;
/** How long the sweep animation takes before swept cards are removed. Keep in sync with MotionCard. */
export const CAPTURE_SWEEP_MS = 400;
export const CAPTURE_STAGE_MS = CAPTURE_LAND_MS + CAPTURE_SWEEP_MS;

interface Stage {
  seq: number;
  phase: 'landing' | 'sweeping';
  /** Table as shown during the stage: everything before the move plus the played card. */
  cards: readonly Card[];
  /** Every card leaving the table: the played card and what it takes, plus leftovers collected at round end. */
  taking: readonly CardId[];
  seat: Seat;
}

export interface StagedTable {
  /** Cards to render on the table right now. */
  cards: readonly Card[];
  /** Cards about to be swept off the table, and toward which seat. */
  taking: readonly CardId[];
  takingSeat: Seat | null;
  /** True while a capture is being shown; summaries and celebrations wait for it. */
  staging: boolean;
  /** True during the second phase, when the taken cards fly off. */
  sweeping: boolean;
}

/**
 * Turns instant state changes into a readable capture: the engine removes
 * captured cards immediately, so for CAPTURE_STAGE_MS we keep showing the
 * pre-capture table plus the played card, then let them leave together.
 */
export function useStagedTable(table: readonly Card[], log: readonly LogEntry[]): StagedTable {
  const lastSeq = log[log.length - 1]?.seq ?? 0;
  const [tracked, setTracked] = useState({ seq: lastSeq, table });
  const [stage, setStage] = useState<Stage | null>(null);

  // Derive the stage during render (not in an effect) so the captured cards never
  // disappear for a frame before the stage kicks in.
  if (tracked.seq !== lastSeq) {
    const fresh = log.filter((entry) => entry.seq > tracked.seq);
    let play: LogEntry | undefined;
    let collectedBy: Seat | null = null;
    for (const entry of fresh) {
      if (entry.event.type === 'cardPlayed') play = entry;
      // Round-end leftovers go to the last capturing team; fly them toward that team's first seat.
      if (entry.event.type === 'tableCollected') collectedBy = entry.event.team;
    }
    if (play && play.event.type === 'cardPlayed' && (play.event.captured.length > 0 || collectedBy !== null)) {
      const { card, seat, captured } = play.event;
      const before = tracked.table.filter((c) => c.id !== card.id);
      const remaining = new Set(table.map((c) => c.id));
      const leaving = [...before, card].filter((c) => !remaining.has(c.id)).map((c) => c.id);
      setStage({
        seq: play.seq,
        phase: 'landing',
        cards: [...before, card],
        taking: leaving,
        seat: captured.length > 0 ? seat : (collectedBy as Seat),
      });
    }
    setTracked({ seq: lastSeq, table });
  }

  useEffect(() => {
    if (!stage) return;
    const id =
      stage.phase === 'landing'
        ? setTimeout(() => setStage({ ...stage, phase: 'sweeping' }), CAPTURE_LAND_MS)
        : setTimeout(() => setStage(null), CAPTURE_SWEEP_MS);
    return () => clearTimeout(id);
  }, [stage]);

  return stage
    ? { cards: stage.cards, taking: stage.taking, takingSeat: stage.seat, staging: true, sweeping: stage.phase === 'sweeping' }
    : { cards: table, taking: [], takingSeat: null, staging: false, sweeping: false };
}
