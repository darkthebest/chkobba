import type { Card } from '@chkobba/rules';
import type { ComponentType, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type SkinId = 'cafe' | 'minimal' | 'sahara' | 'sidi' | 'neon';
export type CardSize = 'md' | 'lg';
export type TeamSide = 'us' | 'them';

export interface SkinTokens {
  colors: {
    /** Text drawn directly on the Background. */
    text: string;
    textMuted: string;
    accent: string;
    onAccent: string;
    us: string;
    them: string;
    /** Glow around capturable table cards and the selected hand card. */
    highlight: string;
    /** Number badge colours, one per capture option (cycled). */
    badges: string[];
    badgeText: string;
    /** Emote speech bubbles. */
    bubbleBg: string;
    bubbleText: string;
    bubbleBorder: string;
    /** Dashed frame around the face-up table cards; 'transparent' when the TableSurface draws its own mat. */
    matBorder: string;
    matBg: string;
    cardFace: string;
    cardBorder: string;
    suitRed: string;
    suitBlack: string;
    panelText: string;
    panelMuted: string;
    optionBg: string;
    optionBorder: string;
    optionText: string;
    chipBg: string;
    plateBg: string;
    plateText: string;
    plateActiveBg: string;
    plateActiveText: string;
    tagBg: string;
    tagText: string;
    segmentBg: string;
    segmentBorder: string;
    segmentText: string;
    segmentActiveBg: string;
    segmentActiveBorder: string;
    segmentActiveText: string;
    overlay: string;
    /** Connection trouble: away/offline seat badges and the reconnecting banner. */
    warnBg: string;
    warnText: string;
    /**
     * Friends list availability dot for "online". The other states reuse
     * existing tokens: offline is textMuted/panelMuted. Readable on both the
     * Background and a Panel.
     */
    onlineDot: string;
  };
  fonts: {
    display: string;
    body: string;
    bodyBold: string;
    bodyItalic: string;
    /** Big numbers: scores, summary points. */
    numeric: string;
    cardRank: string;
    /** Arabic-script bold: replaces display and bold fonts when the language uses Arabic script. */
    arabic: string;
    /** Arabic-script regular: replaces the body fonts when the language uses Arabic script. */
    arabicBody: string;
  };
  radii: { card: number; button: number; option: number };
  cardSizes: Record<CardSize, { width: number; height: number }> & {
    back: { width: number; height: number };
    /** How much hidden-hand backs overlap (px). */
    backOverlap: number;
  };
  hand: { angle: number; overlap: number; lift: number };
  /** Circle winning points on the round summary (Café) instead of only colouring them. */
  circleWins: boolean;
  /** Wrap the home-screen form in the TableSurface. */
  homeOnSurface: boolean;
}

export interface CardFaceProps {
  card: Card;
  size: CardSize;
}

export interface AvatarProps {
  initial: string;
  side: TeamSide;
  isTurn: boolean;
  isDealer: boolean;
  size: 'sm' | 'md';
  /**
   * Online turn clock: the remaining share of the turn, 1 → 0. Drawn as a
   * draining ring or glow; undefined (offline, or not on the clock) draws none.
   */
  progress?: number;
}

export interface ScoreBoardProps {
  scores: { us: number; them: number };
  chkobbas: { us: number; them: number };
  piles: { us: number; them: number };
  round: number;
  target: number;
  stock: number;
  dealerName: string;
}

export interface PanelProps {
  variant: 'log' | 'sheet';
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export interface CelebrationProps {
  byName: string;
  side: TeamSide;
}

export interface Skin {
  id: SkinId;
  /** English name; the UI shows the translated `skins.<id>` string. */
  name: string;
  description: string;
  /** Future shop item; everything is unlocked offline. */
  premium: boolean;
  /** Background loop for this table (a `require`d audio asset); none means silence. */
  ambience?: number;
  tokens: SkinTokens;
  components: {
    Background: ComponentType<{ children: ReactNode }>;
    TableSurface: ComponentType<{ children: ReactNode; style?: StyleProp<ViewStyle> }>;
    CardFace: ComponentType<CardFaceProps>;
    CardBack: ComponentType<{ width: number; height: number }>;
    Avatar: ComponentType<AvatarProps>;
    ScoreBoard: ComponentType<ScoreBoardProps>;
    Panel: ComponentType<PanelProps>;
    Celebration: ComponentType<CelebrationProps>;
    Wordmark: ComponentType;
  };
}
