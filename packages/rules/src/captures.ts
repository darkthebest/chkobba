import { cardValue, type Card } from './cards';
import type { RulesConfig } from './config';

/**
 * Every set of table cards the played card could capture. Each option is either
 * a single same-rank card or a combination of two or more cards whose values sum
 * to the played card's value. With rankPriority (the Tunisian rule), a same-rank
 * card on the table rules out all sum combinations.
 *
 * Options are returned in table order, which keeps results deterministic.
 */
export function captureOptions(
  played: Card,
  table: readonly Card[],
  rules: Pick<RulesConfig, 'faceValues' | 'rankPriority'>,
): Card[][] {
  const sameRank: Card[][] = [];
  for (const c of table) if (c.rank === played.rank) sameRank.push([c]);
  if (sameRank.length > 0 && rules.rankPriority) return sameRank;

  const target = cardValue(played, rules);
  const sums: Card[][] = [];
  const values = table.map((c) => cardValue(c, rules));
  const picked: Card[] = [];

  const search = (start: number, remaining: number): void => {
    for (let i = start; i < table.length; i++) {
      const v = values[i] as number;
      if (v > remaining) continue;
      picked.push(table[i] as Card);
      if (v === remaining) {
        if (picked.length >= 2) sums.push(picked.slice());
      } else {
        search(i + 1, remaining - v);
      }
      picked.pop();
    }
  };
  search(0, target);

  return sameRank.concat(sums);
}

export function canCapture(
  played: Card,
  table: readonly Card[],
  rules: Pick<RulesConfig, 'faceValues' | 'rankPriority'>,
): boolean {
  return captureOptions(played, table, rules).length > 0;
}
