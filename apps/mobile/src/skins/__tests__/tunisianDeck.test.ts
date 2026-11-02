import { RANKS, SUITS, makeCard } from '@chkobba/rules';

import { TUNISIAN_BACK, TUNISIAN_DECK } from '@/skins/cafe/tunisianDeck';

const ALL_IDS = SUITS.flatMap((suit) => RANKS.map((rank) => makeCard(rank, suit).id));

describe('the Tunisian deck', () => {
  it('should have artwork for every card in the 40-card deck', () => {
    // Assert
    expect(Object.keys(TUNISIAN_DECK).sort()).toEqual([...ALL_IDS].sort());
  });

  it.each(ALL_IDS)('should prefix every SVG id in %s with the card id', (id) => {
    // Arrange
    const xml = TUNISIAN_DECK[id];

    // Act
    const ids = [...xml.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const refs = [...xml.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);

    // Assert
    for (const ref of [...ids, ...refs]) expect(ref.startsWith(`tn${id}-`)).toBe(true);
  });

  it('should draw courts as figures, not pips', () => {
    // Assert: the court artwork is far larger than any pip card.
    const largestPip = Math.max(...ALL_IDS.filter((id) => !/^[QJK]/.test(id)).map((id) => TUNISIAN_DECK[id].length));
    for (const id of ALL_IDS.filter((id) => /^[QJK]/.test(id))) {
      expect(TUNISIAN_DECK[id].length).toBeGreaterThan(largestPip * 5);
    }
  });

  it('should prefix the back ids too', () => {
    // Assert
    expect(TUNISIAN_BACK).toContain('url(#tnback-');
    expect(TUNISIAN_BACK).not.toMatch(/\bid="(?!tnback-)/);
  });
});
