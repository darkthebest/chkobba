export type DeckRarity = 'common' | 'rare' | 'epic' | 'mythic';

export type DeckPattern =
  | 'stripes'
  | 'dots'
  | 'geo'
  | 'waves'
  | 'bricks'
  | 'stars'
  | 'diamond'
  | 'zellige'
  | 'arch'
  | 'dunes'
  | 'rings'
  | 'rays'
  | 'circuit'
  | 'runes'
  | 'eclipse';

export interface DeckTheme {
  readonly id: string;
  readonly name: string;
  readonly rarity: DeckRarity;
  readonly flavor: string;
  readonly pattern: DeckPattern;
  readonly a: string;
  readonly b: string;
  readonly accent: string;
}

function mixHex(hex: string, base: string, amount: number): string {
  const parse = (value: string) => {
    const n = Number.parseInt(value.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const from = parse(hex);
  const to = parse(base);
  return `#${from
    .map((channel, index) => Math.round(channel * amount + to[index] * (1 - amount)))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

export function faceColors(deck: DeckTheme): { top: string; bottom: string } {
  return {
    top: mixHex(deck.accent, '#fffdf7', 0.12),
    bottom: mixHex(deck.accent, '#f0e6d2', 0.2),
  };
}

export const RARITY_ORDER: readonly DeckRarity[] = ['common', 'rare', 'epic', 'mythic'];

export const DECKS: readonly DeckTheme[] = [
  {
    id: 'souk-paper',
    name: 'Souk Paper',
    rarity: 'common',
    flavor: 'Plain paper, honest deals.',
    pattern: 'stripes',
    a: '#efe6d2',
    b: '#cbb894',
    accent: '#8a6a3b',
  },
  {
    id: 'mint-tea',
    name: 'Mint Tea',
    rarity: 'common',
    flavor: 'Sweet, strong, and always poured twice.',
    pattern: 'dots',
    a: '#d9f2e6',
    b: '#8ecdb2',
    accent: '#2f7d5c',
  },
  {
    id: 'olive-grove',
    name: 'Olive Grove',
    rarity: 'common',
    flavor: 'Harvest dust and afternoon shade.',
    pattern: 'geo',
    a: '#e6ead0',
    b: '#a3ad73',
    accent: '#55632f',
  },
  {
    id: 'harbour-blue',
    name: 'Harbour Blue',
    rarity: 'common',
    flavor: 'Salt air and painted boats.',
    pattern: 'waves',
    a: '#cfe4f2',
    b: '#7fa9c4',
    accent: '#24566b',
  },
  {
    id: 'clay-court',
    name: 'Clay Court',
    rarity: 'common',
    flavor: 'Cracked tiles, warm evenings.',
    pattern: 'bricks',
    a: '#f0dccb',
    b: '#c08e6a',
    accent: '#7c4a2c',
  },
  {
    id: 'jasmine-night',
    name: 'Jasmine Night',
    rarity: 'rare',
    flavor: 'White blossoms under a blue hour.',
    pattern: 'stars',
    a: '#1b2540',
    b: '#3b4a7a',
    accent: '#e8e6d9',
  },
  {
    id: 'carthage-gold',
    name: 'Carthage Gold',
    rarity: 'rare',
    flavor: 'Old stone, older gold.',
    pattern: 'diamond',
    a: '#2a2118',
    b: '#5a4426',
    accent: '#e3b04b',
  },
  {
    id: 'andalusian-tile',
    name: 'Andalusian Tile',
    rarity: 'rare',
    flavor: 'Every wall a mosaic.',
    pattern: 'zellige',
    a: '#123c3c',
    b: '#1f6b63',
    accent: '#e6c79c',
  },
  {
    id: 'desert-rose',
    name: 'Desert Rose',
    rarity: 'rare',
    flavor: 'Petals that bloom in sand.',
    pattern: 'arch',
    a: '#3a1d2b',
    b: '#7d3a54',
    accent: '#f0b7c6',
  },
  {
    id: 'majorelle',
    name: 'Majorelle',
    rarity: 'rare',
    flavor: 'A courtyard the colour of cobalt.',
    pattern: 'geo',
    a: '#141b4d',
    b: '#2a3fa0',
    accent: '#f2c94c',
  },
  {
    id: 'sidi-bou-said',
    name: 'Sidi Bou Said',
    rarity: 'epic',
    flavor: 'Blue doors, white walls, sea light.',
    pattern: 'arch',
    a: '#0f2d4a',
    b: '#1f5f8b',
    accent: '#f6f1e7',
  },
  {
    id: 'sahara-dunes',
    name: 'Sahara Dunes',
    rarity: 'epic',
    flavor: 'Wind writes new roads every hour.',
    pattern: 'dunes',
    a: '#3b2412',
    b: '#8a5a2b',
    accent: '#ffd27a',
  },
  {
    id: 'cedar-palace',
    name: 'Cedar Palace',
    rarity: 'epic',
    flavor: 'Green shade behind carved doors.',
    pattern: 'zellige',
    a: '#1d2a1f',
    b: '#3e6042',
    accent: '#d9b26f',
  },
  {
    id: 'coral-reef',
    name: 'Coral Reef',
    rarity: 'epic',
    flavor: 'A garden that moves with the tide.',
    pattern: 'waves',
    a: '#0d3b4a',
    b: '#137a8a',
    accent: '#ff8f6b',
  },
  {
    id: 'copper-souk',
    name: 'Copper Souk',
    rarity: 'epic',
    flavor: 'Hammered metal and loud bargains.',
    pattern: 'rings',
    a: '#2b1a12',
    b: '#6e3d24',
    accent: '#ffb27a',
  },
  {
    id: 'golden-chkobba',
    name: 'Golden Chkobba',
    rarity: 'mythic',
    flavor: 'The seven of dineri, gilded.',
    pattern: 'rays',
    a: '#1a1405',
    b: '#4a3708',
    accent: '#ffd75e',
  },
  {
    id: 'tunisian-royal',
    name: 'Tunisian Royal',
    rarity: 'mythic',
    flavor: 'A crown kept in a cedar chest.',
    pattern: 'zellige',
    a: '#210b2e',
    b: '#4a1660',
    accent: '#ffcf5c',
  },
  {
    id: 'neon-medina',
    name: 'Neon Medina',
    rarity: 'mythic',
    flavor: 'The old town, rewired.',
    pattern: 'circuit',
    a: '#07121f',
    b: '#0b3d5c',
    accent: '#4df0ff',
  },
  {
    id: 'carthage-relic',
    name: 'Carthage Relic',
    rarity: 'mythic',
    flavor: 'Dug up, dusted off, still dealing.',
    pattern: 'runes',
    a: '#12100c',
    b: '#3a3428',
    accent: '#c8a24a',
  },
  {
    id: 'eclipse',
    name: 'Eclipse',
    rarity: 'mythic',
    flavor: 'When the sun folds shut.',
    pattern: 'eclipse',
    a: '#05060a',
    b: '#141a2e',
    accent: '#b9a6ff',
  },
];

export function getDeck(id: string | null | undefined): DeckTheme | null {
  return DECKS.find((deck) => deck.id === id) ?? null;
}
