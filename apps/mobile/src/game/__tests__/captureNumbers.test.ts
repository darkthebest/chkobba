import type { PlayMove } from '@chkobba/rules';

import { badgesByCard, numberMoves } from '../captureNumbers';

const move = (cardId: string, capture: string[]) => ({ seat: 0, cardId, capture }) as unknown as PlayMove;

describe('capture numbering', () => {
  it('numbers captures in order and leaves placing unnumbered', () => {
    const numbered = numberMoves([move('JS', ['AH', '3S', '5C']), move('JS', ['5C', '4S']), move('2H', [])]);
    expect(numbered.map((m) => m.n)).toEqual([1, 2, null]);
  });

  it('stamps every option number on the cards it takes', () => {
    const badges = badgesByCard(numberMoves([move('JS', ['AH', '3S', '5C']), move('JS', ['5C', '4S'])]));
    expect(badges.get('AH' as never)).toEqual([1]);
    expect(badges.get('5C' as never)).toEqual([1, 2]);
    expect(badges.get('4S' as never)).toEqual([2]);
  });
});
