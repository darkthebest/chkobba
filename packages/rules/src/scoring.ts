import { DINERI_SUIT, HAYA_ID, type Card } from './cards';
import type { RulesConfig } from './config';
import type { RoundResult, Team, TeamRoundScore } from './types';

const TOTAL_DINERI = 10;

/** Index of the strictly larger value, or null on a tie (beji: nobody scores). */
function leader(a: number, b: number): Team | null {
  if (a > b) return 0;
  if (b > a) return 1;
  return null;
}

function count(pile: readonly Card[], pred: (c: Card) => boolean): number {
  let n = 0;
  for (const c of pile) if (pred(c)) n++;
  return n;
}

/**
 * Scores one round from the two teams' capture piles:
 * karta (most cards), dineri (most diamonds), bermila (most sevens, sixes break
 * the tie), 7aya (the seven of diamonds), plus one point per chkobba.
 */
export function scoreRound(
  round: number,
  piles: readonly [readonly Card[], readonly Card[]],
  chkobbas: readonly [number, number],
): RoundResult {
  const raw = piles.map((pile) => ({
    cards: pile.length,
    dineri: count(pile, (c) => c.suit === DINERI_SUIT),
    sevens: count(pile, (c) => c.rank === '7'),
    sixes: count(pile, (c) => c.rank === '6'),
    hasHaya: count(pile, (c) => c.id === HAYA_ID) > 0,
  }));
  const [r0, r1] = raw as [(typeof raw)[0], (typeof raw)[0]];

  const karta = leader(r0.cards, r1.cards);
  const dineri = leader(r0.dineri, r1.dineri);
  const bermila = leader(r0.sevens, r1.sevens) ?? leader(r0.sixes, r1.sixes);
  const haya: Team | null = r0.hasHaya ? 0 : r1.hasHaya ? 1 : null;

  const teamScore = (team: Team): TeamRoundScore => {
    const r = team === 0 ? r0 : r1;
    const points = {
      karta: karta === team ? 1 : 0,
      dineri: dineri === team ? 1 : 0,
      bermila: bermila === team ? 1 : 0,
      haya: haya === team ? 1 : 0,
      chkobba: chkobbas[team],
    };
    const total = points.karta + points.dineri + points.bermila + points.haya + points.chkobba;
    return { ...r, chkobbas: chkobbas[team], points, total };
  };

  const allDineri: Team | null =
    r0.dineri === TOTAL_DINERI ? 0 : r1.dineri === TOTAL_DINERI ? 1 : null;

  return { round, teams: [teamScore(0), teamScore(1)], allDineri };
}

/**
 * Decides the game winner after a round's points are added, or null to keep
 * playing. Both sides past the target: the higher total wins; a level score
 * plays another round.
 */
export function decideWinner(
  scores: readonly [number, number],
  result: RoundResult,
  rules: Pick<RulesConfig, 'targetScore' | 'winByTwo' | 'instantWinAllDineri'>,
): Team | null {
  if (rules.instantWinAllDineri && result.allDineri !== null) return result.allDineri;

  const [a, b] = scores;
  if (a < rules.targetScore && b < rules.targetScore) return null;
  const top = leader(a, b);
  if (top === null) return null;
  if (rules.winByTwo && Math.abs(a - b) < 2) return null;
  return top;
}
