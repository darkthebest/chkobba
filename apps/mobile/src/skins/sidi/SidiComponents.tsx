import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Path, Pattern, Polygon, Rect } from 'react-native-svg';

import { useT } from '@/i18n';
import { useScriptFont } from '@/skins/scriptFont';
import { useEntrance, useNativeDriver, usePulse } from '@/skins/shared/usePulse';
import type { AvatarProps, CelebrationProps, PanelProps, ScoreBoardProps } from '@/skins/types';

import { sidi } from './palette';

/** Zellige tiling: a square and a diamond interlaced, with a dot at each tile corner. */
function Zellige({ id, opacity }: { id: string; opacity: number }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" opacity={opacity} pointerEvents="none">
      <Defs>
        <Pattern id={id} width="48" height="48" patternUnits="userSpaceOnUse">
          <Path d="M8 8H40V40H8Z M24 1.4 46.6 24 24 46.6 1.4 24Z" fill="none" stroke={sidi.tile} strokeWidth={1.2} strokeLinejoin="round" />
          <Circle cx="24" cy="24" r="5" fill="none" stroke={sidi.tile} strokeWidth={1.2} />
          <Circle cx="0" cy="0" r="3" fill={sidi.tileDot} />
          <Circle cx="48" cy="0" r="3" fill={sidi.tileDot} />
          <Circle cx="0" cy="48" r="3" fill={sidi.tileDot} />
          <Circle cx="48" cy="48" r="3" fill={sidi.tileDot} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export function SidiBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.fill}>
      <Zellige id="sidi-zel-bg" opacity={0.9} />
      {children}
    </View>
  );
}

/** The table is an arch, like the village's blue doors and windows: white plaster, blue frame, faint tiles. */
export function SidiTableSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };
  // A full half-circle on phones; on a wide desktop table the arch is capped so it stays a door, not a dome.
  const arch = box ? Math.min(box.width / 2, box.height * 0.45, 180) : 150;
  const shape = { borderTopLeftRadius: arch, borderTopRightRadius: arch, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 };
  const inner = { ...shape, borderTopLeftRadius: arch - 5, borderTopRightRadius: arch - 5, borderBottomLeftRadius: 25, borderBottomRightRadius: 25 };
  return (
    <View style={[styles.archOuter, shape, style]} onLayout={onLayout}>
      <View style={[styles.archWall, inner]}>
        <LinearGradient colors={[sidi.white, '#F3F8FE']} style={StyleSheet.absoluteFill} />
        <Zellige id="sidi-zel-board" opacity={0.5} />
        <View style={styles.archContent}>{children}</View>
      </View>
    </View>
  );
}

/** Below this share of the turn left, the clock ring turns red. */
const LOW_TIME = 0.25;

const FACE = {
  us: [ '#5AA2F5', sidi.blue ],
  them: [ '#FFB366', '#E8803A' ],
} as const;

/** Dealer mark: a small deck with a diamond on top. */
function DealerIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Rect x="3" y="5" width="11" height="15" rx="2" fill={sidi.blue} />
      <Rect x="10" y="3" width="11" height="15" rx="2" fill={sidi.white} stroke={sidi.blue} strokeWidth={2} />
      <Path d="M15.5 7.5 18 11l-2.5 3.5L13 11z" fill={sidi.red} />
    </Svg>
  );
}

/** Round, team-ringed avatar; on turn it grows and sends out a halo, and online the ring drains as the clock. */
export function SidiAvatar({ initial, side, isTurn, isDealer, size, progress }: AvatarProps) {
  const d = size === 'md' ? 50 : 42;
  const ring = side === 'us' ? sidi.blue : sidi.orange;
  const halo = usePulse(isTurn, 1300);
  const timed = progress !== undefined;
  const box = d + 12;
  const r = d / 2 + 3;
  const circumference = 2 * Math.PI * r;
  const share = Math.min(1, Math.max(0, progress ?? 1));
  return (
    <View style={{ width: d, height: d, transform: [{ scale: isTurn ? 1.1 : 1 }] }}>
      {isTurn && !timed ? (
        <Animated.View
          style={[
            styles.halo,
            {
              width: d + 18,
              height: d + 18,
              borderRadius: (d + 18) / 2,
              left: -9,
              top: -9,
              borderColor: ring,
              opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
              transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.15] }) }],
            },
          ]}
          pointerEvents="none"
        />
      ) : null}
      {timed ? (
        <View style={[styles.clock, { left: -6, top: -6 }]} pointerEvents="none">
          <Svg width={box} height={box}>
            <Circle cx={box / 2} cy={box / 2} r={r} stroke={sidi.sky2} strokeWidth={4} fill="none" />
            <Circle
              cx={box / 2}
              cy={box / 2}
              r={r}
              stroke={share < LOW_TIME ? sidi.red : sidi.yellow}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - share)}
              transform={`rotate(-90 ${box / 2} ${box / 2})`}
            />
          </Svg>
        </View>
      ) : null}
      <View style={[styles.ring, { width: d, height: d, borderRadius: d / 2, borderColor: ring, opacity: isTurn ? 1 : 0.85 }]}>
        <LinearGradient colors={FACE[side]} style={[styles.face, { borderRadius: d }]}>
          <Text style={[styles.initial, { fontSize: d * 0.42 }]}>{initial}</Text>
        </LinearGradient>
      </View>
      {isDealer ? (
        <View style={styles.dealer}>
          <DealerIcon />
        </View>
      ) : null}
    </View>
  );
}

function TeamCard({ label, score, target, piles, chkobbas, side }: { label: string; score: number; target: number; piles: number; chkobbas: number; side: 'us' | 'them' }) {
  const bodyBold = useScriptFont('Cairo_700Bold');
  const colors = side === 'us' ? ([sidi.blueLight, sidi.blue] as const) : ([sidi.orangeLight, sidi.orange] as const);
  return (
    <LinearGradient colors={colors} style={styles.team} testID={`score-${side}`}>
      <Text style={[styles.teamLabel, bodyBold]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.teamScoreRow}>
        <Text style={styles.teamScore}>{score}</Text>
        <Text style={styles.teamTarget}>/{target}</Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${Math.min(100, (score / target) * 100)}%` }]} />
      </View>
      <View style={styles.chips}>
        <View style={styles.chip}>
          <Svg width={11} height={11} viewBox="0 0 14 14">
            <Rect x="2" y="1" width="8" height="11" rx="1.5" fill={sidi.white} />
            <Rect x="5" y="3" width="8" height="10" rx="1.5" fill={sidi.white} opacity={0.6} />
          </Svg>
          <Text style={styles.chipText}>{piles}</Text>
        </View>
        <View style={styles.chip}>
          <Text style={styles.chipText}>★ {chkobbas}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

export function SidiScoreBoard({ scores, chkobbas, piles, round, target, stock, dealerName }: ScoreBoardProps) {
  const tr = useT();
  const body = useScriptFont('Cairo_500Medium');
  return (
    <View style={styles.board}>
      <TeamCard label={tr('score.us')} score={scores.us} target={target} piles={piles.us} chkobbas={chkobbas.us} side="us" />
      <View style={styles.middle}>
        <View style={styles.roundBadge}>
          <Text style={styles.roundNum}>{round}</Text>
          <Text style={[styles.roundLabel, body]} numberOfLines={1}>
            {tr('score.round')}
          </Text>
        </View>
        <View style={styles.stock}>
          <View style={styles.stackIcon}>
            <View style={[styles.stackCard, { backgroundColor: sidi.blueDeep, transform: [{ translateX: 2 }, { translateY: -2 }] }]} />
            <View style={styles.stackCard} />
          </View>
          <Text style={styles.stockText}>{stock}</Text>
        </View>
        <Text style={[styles.dealerName, body]} numberOfLines={1}>
          {tr('score.dealer', { name: dealerName })}
        </Text>
      </View>
      <TeamCard label={tr('score.them')} score={scores.them} target={target} piles={piles.them} chkobbas={chkobbas.them} side="them" />
    </View>
  );
}

export function SidiPanel({ variant, children, style }: PanelProps) {
  return <View style={[variant === 'log' ? styles.logPanel : styles.sheet, style]}>{children}</View>;
}

/** A 24-point starburst on a 200×200 grid. */
const BURST = Array.from({ length: 24 }, (_, i) => {
  const a = (i * Math.PI) / 12;
  const r = i % 2 ? 64 : 96;
  return `${(100 + r * Math.sin(a)).toFixed(1)},${(100 - r * Math.cos(a)).toFixed(1)}`;
}).join(' ');

const PETAL_COLORS = [sidi.white, sidi.yellow, '#8DB8F0'];

/** A jasmine petal drifting down. */
function Petal({ index }: { index: number }) {
  const fall = useEntrance(2800 + (index % 4) * 500, Easing.linear);
  return (
    <Animated.View
      style={[
        styles.petal,
        {
          left: `${(index * 53) % 100}%`,
          backgroundColor: PETAL_COLORS[index % 3],
          transform: [
            { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-20 - (index % 6) * 40, 560] }) },
            { rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '420deg'] }) },
          ],
        },
      ]}
    />
  );
}

/** Spinning yellow starburst and a ribbon banner; jasmine petals fall when our team swept. */
export function SidiCelebration({ byName, side }: CelebrationProps) {
  const tr = useT();
  const bodyBold = useScriptFont('Cairo_700Bold');
  const pop = useEntrance(600);
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 14000, easing: Easing.linear, useNativeDriver }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const petals = useMemo(() => Array.from({ length: 18 }, (_, i) => i), []);
  const ribbon = side === 'us' ? ([sidi.blueLight, sidi.blueDeep] as const) : ([sidi.orangeLight, sidi.orangeDeep] as const);
  return (
    <View style={styles.celebration} pointerEvents="none" testID="celebration">
      <Animated.View
        style={[
          styles.burst,
          {
            opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [
              { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
              { rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) },
            ],
          },
        ]}
      >
        <Svg width={300} height={300} viewBox="0 0 200 200">
          <Polygon points={BURST} fill={sidi.yellow} stroke={sidi.white} strokeWidth={3} strokeLinejoin="round" />
        </Svg>
      </Animated.View>
      {side === 'us' ? petals.map((i) => <Petal key={i} index={i} />) : null}
      <Animated.View
        style={[
          styles.banner,
          {
            opacity: pop.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }),
            transform: [{ rotate: '-4deg' }, { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.1, 1] }) }],
          },
        ]}
      >
        <LinearGradient colors={ribbon} style={styles.ribbon}>
          <Text style={styles.ribbonText}>CHKOBBA!</Text>
        </LinearGradient>
        <Text style={styles.bannerAr}>شكبّة</Text>
        <View style={styles.plusOne}>
          <Text style={[styles.plusOneText, bodyBold]}>
            {tr('celebration.swept', { name: byName, team: side === 'us' ? tr('score.us') : tr('score.them') })}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const STUD_ROWS = [0, 1, 2, 3, 4, 5, 6];

/** A Sidi Bou Said door with jasmine: blue, arched, studded. */
function Door() {
  const jasmine = (x: number, y: number, s: number) => (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <Ellipse key={a} cx={0} cy={-9} rx={5} ry={8} fill={sidi.white} stroke={sidi.line} strokeWidth={1.5} transform={`rotate(${a})`} />
      ))}
      <Circle r={4} fill={sidi.yellow} />
    </G>
  );
  return (
    <Svg width={170} height={170} viewBox="0 0 250 250">
      <Path d="M40 250V105Q40 22 125 22T210 105V250z" fill={sidi.sky} stroke={sidi.line} strokeWidth={3} />
      <Path d="M56 250V108Q56 40 125 40T194 108V250z" fill={sidi.blue} />
      <Path d="M125 40V250" stroke={sidi.blueDeep} strokeWidth={3} />
      <Path d="M56 108Q56 40 125 40T194 108" fill="none" stroke={sidi.yellow} strokeWidth={5} />
      {STUD_ROWS.flatMap((row) =>
        (row % 2 ? [82, 102] : [72, 92]).flatMap((x) => [
          <Circle key={`${row}-${x}`} cx={x} cy={100 + row * 20} r={3.2} fill="#0D2F66" />,
          <Circle key={`${row}-${250 - x}`} cx={250 - x} cy={100 + row * 20} r={3.2} fill="#0D2F66" />,
        ]),
      )}
      <Circle cx={114} cy={160} r={6} fill="none" stroke={sidi.yellow} strokeWidth={3} />
      <Circle cx={136} cy={160} r={6} fill="none" stroke={sidi.yellow} strokeWidth={3} />
      <Path d="M30 250H220" stroke={sidi.line} strokeWidth={6} />
      {jasmine(196, 56, 1)}
      {jasmine(58, 34, 0.7)}
      {jasmine(214, 92, 0.6)}
    </Svg>
  );
}

export function SidiWordmark() {
  return (
    <View style={styles.wordmark}>
      <Door />
      <Text style={styles.wmEn}>Chkobba</Text>
      <Text style={styles.wmAr}>شكبّة</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: sidi.sky },
  archOuter: {
    padding: 2,
    backgroundColor: sidi.line,
    shadowColor: sidi.blue,
    shadowOpacity: 0.25,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 14 },
  },
  archWall: { flex: 1, borderWidth: 3, borderColor: sidi.blue, overflow: 'hidden', margin: 3, backgroundColor: sidi.white },
  archContent: { flex: 1, padding: 6, paddingTop: 12 },
  halo: { position: 'absolute', borderWidth: 3 },
  clock: { position: 'absolute' },
  ring: {
    borderWidth: 4,
    backgroundColor: sidi.white,
    padding: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
  },
  face: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initial: { fontFamily: 'Fredoka_700Bold', color: sidi.white },
  dealer: {
    position: 'absolute',
    right: -8,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: sidi.white,
    borderWidth: 2,
    borderColor: sidi.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  team: {
    flex: 1,
    minWidth: 0,
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 4 },
  },
  teamLabel: { fontFamily: 'Fredoka_600SemiBold', fontSize: 12, letterSpacing: 0.5, color: sidi.white, opacity: 0.95 },
  teamScoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 2, marginBottom: 4 },
  teamScore: { fontFamily: 'Fredoka_700Bold', fontSize: 34, lineHeight: 36, color: sidi.white },
  teamTarget: { fontFamily: 'Fredoka_500Medium', fontSize: 13, color: sidi.white, opacity: 0.85, marginStart: 2 },
  bar: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)', overflow: 'hidden' },
  barFill: { height: 7, borderRadius: 4, backgroundColor: sidi.white },
  chips: { flexDirection: 'row', gap: 6, marginTop: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 },
  chipText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 11, color: sidi.white },
  middle: { width: 66, alignItems: 'center', justifyContent: 'center', gap: 4 },
  roundBadge: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: sidi.white,
    borderWidth: 3,
    borderColor: sidi.blueDeep,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: sidi.line,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
  },
  roundNum: { fontFamily: 'Fredoka_700Bold', fontSize: 20, lineHeight: 22, color: sidi.blueDeep },
  roundLabel: { fontFamily: 'Fredoka_500Medium', fontSize: 10, color: sidi.muted },
  stock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: sidi.white,
    borderWidth: 2,
    borderColor: sidi.line,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  stackIcon: { width: 14, height: 16 },
  stackCard: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 3, backgroundColor: sidi.blue, borderWidth: 1, borderColor: sidi.white },
  stockText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 12, color: sidi.blueDeep },
  dealerName: { fontFamily: 'Fredoka_500Medium', fontSize: 10, color: sidi.muted, maxWidth: 66 },
  logPanel: {
    backgroundColor: sidi.white,
    borderWidth: 2,
    borderColor: sidi.line,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: sidi.line,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 2 },
  },
  sheet: {
    backgroundColor: sidi.white,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: sidi.blue,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 20 },
  },
  celebration: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 10 },
  burst: { position: 'absolute' },
  petal: { position: 'absolute', top: 0, width: 11, height: 16, borderRadius: 8, borderWidth: 1, borderColor: sidi.line },
  banner: { alignItems: 'center' },
  ribbon: {
    paddingHorizontal: 26,
    paddingTop: 6,
    paddingBottom: 8,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: sidi.white,
    shadowColor: '#0D2447',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  ribbonText: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 36,
    letterSpacing: 1.4,
    color: sidi.white,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
  },
  bannerAr: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 26,
    lineHeight: 40,
    color: sidi.blueDeep,
    marginTop: 4,
    textShadowColor: sidi.white,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  plusOne: {
    marginTop: 4,
    backgroundColor: sidi.yellow,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 3,
    shadowColor: sidi.yellowDeep,
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 3 },
  },
  plusOneText: { fontFamily: 'Fredoka_600SemiBold', fontSize: 14, color: sidi.ink },
  wordmark: { alignItems: 'center' },
  wmEn: {
    fontFamily: 'Fredoka_700Bold',
    fontSize: 44,
    lineHeight: 48,
    color: sidi.blue,
    marginTop: -6,
    textShadowColor: sidi.sky2,
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
  },
  wmAr: { fontFamily: 'Cairo_700Bold', fontSize: 24, lineHeight: 36, color: sidi.orange },
});
