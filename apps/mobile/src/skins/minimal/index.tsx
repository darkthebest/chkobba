import type { ReactNode } from 'react';
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { isRedSuit } from '@/game/format';
import { useT } from '@/i18n';
import { useScriptFont } from '@/skins/scriptFont';
import { SuitIcon } from '@/skins/shared/SuitIcon';
import { useEntrance, usePulse } from '@/skins/shared/usePulse';
import type {
  AvatarProps,
  CardFaceProps,
  CelebrationProps,
  PanelProps,
  ScoreBoardProps,
  Skin,
} from '@/skins/types';
import { CAFE_AMBIENCE } from '@/skins/cafe/ambience';

const m = {
  bg: '#0A0C10',
  s1: '#12161C',
  s2: '#1A2028',
  s3: '#222A34',
  line: '#262D38',
  tx: '#F4F6FA',
  mu: '#8A94A6',
  mu2: '#5E6878',
  lime: '#B6F23C',
  coral: '#FF6B5B',
  sky: '#5CC8FF',
  amber: '#FFB02E',
  card: '#F7F7F4',
  red: '#E5333F',
  black: '#0B0D10',
};

const FACE_NAMES: Record<string, string> = { Q: 'Moujira', J: 'Kawel', K: 'Ray' };

function MinimalBackground({ children }: { children: ReactNode }) {
  return <View style={styles.bg}>{children}</View>;
}

function MinimalTableSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.region, style]}>{children}</View>;
}

const FACE = {
  md: { rank: 26, suit: 17, big: 40, inset: 5 },
  lg: { rank: 46, suit: 30, big: 66, inset: 9 },
};

/** Oversized index for instant reading; a faint big suit keeps the dineri cue. */
function MinimalCardFace({ card, size }: CardFaceProps) {
  const f = FACE[size];
  const color = isRedSuit(card.suit) ? m.red : m.black;
  return (
    <View style={[StyleSheet.absoluteFill, styles.clip]} pointerEvents="none">
      <View style={[styles.big, { right: -f.big * 0.12, bottom: -f.big * 0.12 }]}>
        <SuitIcon suit={card.suit} size={f.big} color={color} />
      </View>
      <View style={{ position: 'absolute', left: f.inset, top: f.inset - 2 }}>
        <Text style={[styles.rank, { color, fontSize: f.rank, lineHeight: f.rank * 1.02 }]}>{card.rank}</Text>
        <SuitIcon suit={card.suit} size={f.suit} color={color} />
      </View>
      {size === 'lg' && FACE_NAMES[card.rank] ? (
        <Text style={[styles.faceName, { color }]}>{FACE_NAMES[card.rank]}</Text>
      ) : null}
    </View>
  );
}

function MinimalCardBack({ width, height }: { width: number; height: number }) {
  return (
    <View style={[styles.back, { width, height }]}>
      <View style={styles.backInner} />
    </View>
  );
}

/** Below this share of the turn left, the ring turns amber. */
const LOW_TIME = 0.25;

function MinimalAvatar({ initial, side, isTurn, isDealer, size, progress }: AvatarProps) {
  const d = size === 'md' ? 48 : 40;
  const color = side === 'us' ? m.lime : m.coral;
  const timed = progress !== undefined;
  // A turn clock replaces the pulse: the ring itself drains.
  const pulse = usePulse(isTurn && !timed, 1600);
  const r = d / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const share = Math.min(1, Math.max(0, progress ?? 1));
  return (
    <View style={{ width: d, height: d }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: isTurn && !timed ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.5] }) : 1 }]}>
        <Svg width={d} height={d}>
          <Circle cx={d / 2} cy={d / 2} r={r} stroke={isTurn && !timed ? color : m.line} strokeWidth={3} fill="none" />
          {timed ? (
            <Circle
              cx={d / 2}
              cy={d / 2}
              r={r}
              stroke={share < LOW_TIME ? m.amber : color}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - share)}
              transform={`rotate(-90 ${d / 2} ${d / 2})`}
            />
          ) : null}
        </Svg>
      </Animated.View>
      <View style={[styles.face, { margin: 6, borderRadius: d }]}>
        <Text style={[styles.initial, { color: isTurn ? m.tx : m.mu }]}>{initial}</Text>
      </View>
      {isDealer ? (
        <View style={styles.dealer}>
          <Text style={styles.dealerText}>D</Text>
        </View>
      ) : null}
    </View>
  );
}

function MinimalScoreBoard({ scores, chkobbas, piles, round, target, stock, dealerName }: ScoreBoardProps) {
  const tr = useT();
  const body = useScriptFont('Cairo_500Medium');
  const bodyBold = useScriptFont('Cairo_700Bold');
  const chip = (label: string, side: 'us' | 'them') => {
    const color = side === 'us' ? m.lime : m.coral;
    return (
      <View style={styles.sc} testID={`score-${side}`}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.scLabel, bodyBold]}>{label}</Text>
        <Text style={styles.scNum}>{scores[side]}</Text>
        <View style={styles.scStats}>
          <Text style={[styles.scStat, body]}>{tr('summary.cards', { count: piles[side] })}</Text>
          <Text style={[styles.scStat, body]}>★ {tr('summary.sweeps', { count: chkobbas[side] })}</Text>
        </View>
        <View style={styles.track}>
          <View style={{ height: 3, width: `${Math.min(100, (scores[side] / target) * 100)}%`, backgroundColor: color }} />
        </View>
      </View>
    );
  };
  const meta = (k: string, v: string | number) => (
    <Text style={[styles.meta, body]} key={k}>
      {k} <Text style={styles.metaStrong}>{v}</Text>
    </Text>
  );
  return (
    <View>
      <View style={styles.scores}>
        {chip(tr('score.us'), 'us')}
        {chip(tr('score.them'), 'them')}
      </View>
      <View style={styles.metaRow}>
        {meta(tr('score.round'), round)}
        {meta(tr('score.to'), target)}
        {meta(tr('score.stockLabel'), stock)}
        {meta(tr('score.dealerLabel'), dealerName)}
      </View>
    </View>
  );
}

function MinimalPanel({ variant, children, style }: PanelProps) {
  return <View style={[variant === 'log' ? styles.logPanel : styles.sheet, style]}>{children}</View>;
}

function MinimalCelebration({ byName, side }: CelebrationProps) {
  const tr = useT();
  const bodyBold = useScriptFont('Cairo_700Bold');
  const enter = useEntrance(500);
  const color = side === 'us' ? m.lime : m.coral;
  return (
    <View style={styles.celebration} pointerEvents="none" testID="celebration">
      <Animated.Text
        style={[
          styles.slam,
          { textShadowColor: color, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }] },
        ]}
      >
        CHK<Text style={{ color }}>OBBA</Text>
      </Animated.Text>
      <Animated.View style={[styles.slamBar, { backgroundColor: color, transform: [{ scaleX: enter }] }]} />
      <Text style={[styles.slamBy, bodyBold]}>
        {tr('celebration.swept', { name: byName, team: side === 'us' ? tr('score.us') : tr('score.them') })}
      </Text>
      <Text style={styles.slamAr}>شكبّة</Text>
    </View>
  );
}

function MinimalWordmark() {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={styles.word}>
        chkobba<Text style={{ color: m.lime }}>.</Text>
      </Text>
      <Text style={styles.wordAr}>شكبّة</Text>
    </View>
  );
}

export const minimalSkin: Skin = {
  id: 'minimal',
  name: 'Modern Minimal',
  description: 'Dark, flat and high-contrast with oversized card indices.',
  premium: false,
  ambience: CAFE_AMBIENCE,
  tokens: {
    colors: {
      text: m.tx,
      textMuted: m.mu,
      accent: m.lime,
      onAccent: m.bg,
      us: m.lime,
      them: m.coral,
      highlight: m.lime,
      badges: [m.lime, m.sky, m.amber, m.coral],
      matBorder: m.lime,
      matBg: 'rgba(0,0,0,0.12)',
      badgeText: m.bg,
      bubbleBg: m.tx,
      bubbleText: m.bg,
      bubbleBorder: m.tx,
      cardFace: m.card,
      cardBorder: '#E2E2DC',
      suitRed: m.red,
      suitBlack: m.black,
      panelText: m.tx,
      panelMuted: m.mu2,
      optionBg: m.s2,
      optionBorder: m.line,
      optionText: m.tx,
      chipBg: m.s3,
      plateBg: 'transparent',
      plateText: m.mu2,
      plateActiveBg: 'transparent',
      plateActiveText: m.tx,
      tagBg: m.coral,
      tagText: m.bg,
      segmentBg: m.s1,
      segmentBorder: m.line,
      segmentText: m.tx,
      segmentActiveBg: '#18200C',
      segmentActiveBorder: m.lime,
      segmentActiveText: m.lime,
      overlay: 'rgba(0,0,0,0.6)',
      warnBg: m.amber,
      warnText: m.bg,
      onlineDot: m.lime,
    },
    fonts: {
      display: 'Inter_900Black',
      body: 'Inter_500Medium',
      bodyBold: 'Inter_700Bold',
      bodyItalic: 'Inter_500Medium',
      numeric: 'SpaceGrotesk_700Bold',
      cardRank: 'SpaceGrotesk_700Bold',
      arabic: 'Cairo_700Bold',
      arabicBody: 'Cairo_500Medium',
    },
    radii: { card: 10, button: 16, option: 16 },
    cardSizes: {
      md: { width: 50, height: 72 },
      lg: { width: 84, height: 120 },
      back: { width: 13, height: 19 },
      backOverlap: -3,
    },
    hand: { angle: 8, overlap: 14, lift: 22 },
    circleWins: false,
    homeOnSurface: false,
  },
  components: {
    Background: MinimalBackground,
    TableSurface: MinimalTableSurface,
    CardFace: MinimalCardFace,
    CardBack: MinimalCardBack,
    Avatar: MinimalAvatar,
    ScoreBoard: MinimalScoreBoard,
    Panel: MinimalPanel,
    Celebration: MinimalCelebration,
    Wordmark: MinimalWordmark,
  },
};

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: m.bg },
  region: { backgroundColor: m.s1, borderWidth: 1, borderColor: m.line, borderRadius: 24, padding: 6 },
  clip: { overflow: 'hidden', borderRadius: 10 },
  big: { position: 'absolute', opacity: 0.12 },
  rank: { fontFamily: 'SpaceGrotesk_700Bold', letterSpacing: -1 },
  faceName: {
    position: 'absolute',
    left: 9,
    bottom: 7,
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.55,
  },
  back: { borderRadius: 3, borderWidth: 1.5, borderColor: '#3A4452', backgroundColor: m.s2 },
  backInner: { flex: 1, margin: 2.5, borderWidth: 1, borderColor: '#3A4452', borderRadius: 1 },
  face: { ...StyleSheet.absoluteFill, backgroundColor: m.s3, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: 'Inter_900Black', fontSize: 16 },
  dealer: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: m.tx,
    borderWidth: 2,
    borderColor: m.s1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerText: { fontFamily: 'Inter_900Black', fontSize: 9, color: m.bg },
  scores: { flexDirection: 'row', gap: 8 },
  sc: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: m.s1,
    borderWidth: 1,
    borderColor: m.line,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
    overflow: 'hidden',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  scLabel: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2, color: m.mu, textTransform: 'uppercase' },
  scNum: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 30, color: m.tx },
  scStats: { marginLeft: 'auto', alignItems: 'flex-end' },
  scStat: { fontFamily: 'Inter_500Medium', fontSize: 11, color: m.mu },
  scStatStrong: { fontFamily: 'SpaceGrotesk_700Bold', fontSize: 13, color: m.tx },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: m.s3 },
  metaRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  meta: {
    fontFamily: 'Inter_700Bold',
    textTransform: 'uppercase',
    fontSize: 10,
    letterSpacing: 1,
    color: m.mu,
    backgroundColor: m.s1,
    borderWidth: 1,
    borderColor: m.line,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  metaStrong: { color: m.tx },
  logPanel: { paddingHorizontal: 8, paddingVertical: 4 },
  sheet: {
    backgroundColor: m.s1,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2f3945',
    padding: 18,
  },
  celebration: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 10, backgroundColor: 'rgba(10,12,16,0.9)' },
  slam: {
    fontFamily: 'Inter_900Black',
    fontSize: 50,
    letterSpacing: -2,
    color: '#fff',
    textShadowRadius: 24,
    textShadowOffset: { width: 0, height: 0 },
  },
  slamBar: { height: 5, width: 150, borderRadius: 3, marginTop: 8 },
  slamBy: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#d6dce6', marginTop: 10 },
  slamAr: { fontFamily: 'Cairo_700Bold', fontSize: 20, color: m.mu, marginTop: 2 },
  word: { fontFamily: 'Inter_900Black', fontSize: 56, letterSpacing: -3, color: m.tx },
  wordAr: { fontFamily: 'Cairo_700Bold', fontSize: 22, color: m.mu, marginTop: 2 },
});
