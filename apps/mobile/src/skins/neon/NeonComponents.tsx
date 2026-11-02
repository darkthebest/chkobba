import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, Line, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';

import { useT } from '@/i18n';
import { useScriptFont } from '@/skins/scriptFont';
import { useEntrance, useNativeDriver } from '@/skins/shared/usePulse';
import type { AvatarProps, CelebrationProps, PanelProps, ScoreBoardProps } from '@/skins/types';

import { neon } from './palette';

/** Opacity keyframes of a neon tube catching: on, stutter, on. */
const FLICKER = [1, 0.15, 1, 0.35, 1];

/** Plays the flicker sequence each time `on` turns true. */
function useFlicker(on: boolean, stepMs = 70): Animated.Value {
  const [value] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!on) {
      value.setValue(1);
      return;
    }
    value.setValue(0);
    const anim = Animated.sequence(
      FLICKER.map((toValue, i) => Animated.timing(value, { toValue, duration: i === 0 ? 30 : stepMs, easing: Easing.linear, useNativeDriver })),
    );
    anim.start();
    return () => anim.stop();
  }, [on, stepMs, value]);
  return value;
}

export function NeonBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.fill}>
      <LinearGradient colors={[neon.bg, neon.bg2]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

/** A synthwave floor: pink rows getting closer toward the horizon, cyan rails meeting at a vanishing point. */
function Grid({ width, height }: { width: number; height: number }) {
  const top = height * 0.38;
  const depth = height - top;
  const rows = Array.from({ length: 9 }, (_, i) => top + depth * Math.pow(i / 8, 1.8));
  const rails = Array.from({ length: 13 }, (_, i) => (i - 6) / 6);
  // Lines fade toward the horizon instead of a mask, so no band shows where the floor starts.
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgGradient id="neon-rail" x1="0" y1={top} x2="0" y2={height} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor={neon.cyan} stopOpacity={0} />
          <Stop offset="1" stopColor={neon.cyan} stopOpacity={0.35} />
        </SvgGradient>
      </Defs>
      {rows.map((y, i) => (
        <Line key={`r${i}`} x1={0} y1={y} x2={width} y2={y} stroke={neon.pink} strokeOpacity={0.45 * Math.pow(i / 8, 1.2)} strokeWidth={1} />
      ))}
      {rails.map((k, i) => (
        <Line key={`c${i}`} x1={width / 2 + k * width * 0.12} y1={top} x2={width / 2 + k * width * 1.2} y2={height} stroke="url(#neon-rail)" strokeWidth={1} />
      ))}
    </Svg>
  );
}

/** The table: a midnight slab outlined in cyan tube light, over a faint perspective grid. */
export function NeonTableSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };
  const arch = box ? Math.min(110, box.width / 2, box.height * 0.4) : 110;
  const shape = { borderTopLeftRadius: arch, borderTopRightRadius: arch, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 };
  return (
    <View style={[styles.slab, shape, style]} onLayout={onLayout}>
      <View style={[StyleSheet.absoluteFill, styles.clip, shape]} pointerEvents="none">
        <LinearGradient colors={[neon.slab1, neon.slab2]} locations={[0, 0.7]} style={StyleSheet.absoluteFill} />
        {box ? <Grid width={box.width} height={box.height} /> : null}
        <View style={[styles.inner, { ...shape, borderTopLeftRadius: arch - 8, borderTopRightRadius: arch - 8, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }]} />
      </View>
      {children}
    </View>
  );
}

/** Below this share of the turn left, the tube turns gold. */
const LOW_TIME = 0.25;

/**
 * A hanging sign plate. Idle it is an unlit outline; on turn it flickers on in the team colour,
 * and online the tube drains around the plate as the turn clock.
 */
export function NeonAvatar({ initial, side, isTurn, isDealer, size, progress }: AvatarProps) {
  const d = size === 'md' ? 48 : 40;
  const radius = 12;
  const color = side === 'us' ? neon.cyan : neon.pink;
  const flicker = useFlicker(isTurn);
  const timed = progress !== undefined;
  const share = Math.min(1, Math.max(0, progress ?? 1));
  const inset = 2;
  const w = d - inset * 2;
  const perimeter = 4 * w - 8 * radius + 2 * Math.PI * radius;
  return (
    <View style={{ width: d, height: d }}>
      <Animated.View
        style={[
          styles.plate,
          { borderRadius: radius, opacity: flicker },
          isTurn && { backgroundColor: side === 'us' ? 'rgba(45,226,230,0.14)' : 'rgba(255,61,139,0.14)', shadowColor: color, shadowOpacity: 0.7, shadowRadius: 12 },
        ]}
      >
        <Svg width={d} height={d} style={StyleSheet.absoluteFill}>
          <Rect x={inset} y={inset} width={w} height={w} rx={radius} fill="none" stroke={color} strokeOpacity={0.3} strokeWidth={2} />
          {isTurn || timed ? (
            <Rect
              x={inset}
              y={inset}
              width={w}
              height={w}
              rx={radius}
              fill="none"
              stroke={timed && share < LOW_TIME ? neon.gold : color}
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeDasharray={`${perimeter} ${perimeter}`}
              strokeDashoffset={perimeter * (1 - share)}
            />
          ) : null}
        </Svg>
        <Text
          style={[
            styles.initial,
            { fontSize: d * 0.42 },
            isTurn ? { color: '#fff', textShadowColor: color } : { color: neon.muted2, textShadowColor: 'transparent' },
          ]}
        >
          {initial}
        </Text>
      </Animated.View>
      {isDealer ? (
        <View style={styles.dealer}>
          <Text style={styles.dealerText}>D</Text>
        </View>
      ) : null}
    </View>
  );
}

/** One team's glowing scoreboard plate, with a tick track along its bottom edge. */
function ScorePlate({ label, score, target, piles, chkobbas, side }: { label: string; score: number; target: number; piles: number; chkobbas: number; side: 'us' | 'them' }) {
  const bodyBold = useScriptFont('Cairo_700Bold');
  const color = side === 'us' ? neon.cyan : neon.pink;
  return (
    <View style={[styles.plateScore, { borderColor: color, shadowColor: color }]} testID={`score-${side}`}>
      <Text style={[styles.bigNum, { textShadowColor: color }]}>{score}</Text>
      <View style={styles.plateInfo}>
        <Text style={[styles.plateLabel, { color }, bodyBold]} numberOfLines={1}>
          {label}
        </Text>
        <View style={styles.plateStats}>
          <Text style={styles.plateStat}>▮ {piles}</Text>
          <Text style={styles.plateStat}>★ {chkobbas}</Text>
        </View>
      </View>
      <View style={styles.ticks}>
        <View style={[styles.tickFill, { width: `${Math.min(100, (score / target) * 100)}%`, backgroundColor: color, shadowColor: color }]} />
      </View>
    </View>
  );
}

export function NeonScoreBoard({ scores, chkobbas, piles, round, target, stock, dealerName }: ScoreBoardProps) {
  const tr = useT();
  const body = useScriptFont('Cairo_500Medium');
  return (
    <View>
      <View style={styles.board}>
        <ScorePlate label={tr('score.us')} score={scores.us} target={target} piles={piles.us} chkobbas={chkobbas.us} side="us" />
        <View style={styles.round}>
          <Text style={[styles.roundLabel, body]} numberOfLines={1}>
            {tr('score.round')}
          </Text>
          <Text style={styles.roundNum}>{round}</Text>
          <Text style={[styles.roundLabel, body]} numberOfLines={1}>
            {tr('score.to')} {target}
          </Text>
        </View>
        <ScorePlate label={tr('score.them')} score={scores.them} target={target} piles={piles.them} chkobbas={chkobbas.them} side="them" />
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, body]}>
          {tr('score.stockLabel')} <Text style={styles.metaStrong}>{stock}</Text>
        </Text>
        <Text style={[styles.meta, body]}>
          {tr('score.dealerLabel')} <Text style={styles.metaStrong}>{dealerName}</Text>
        </Text>
      </View>
    </View>
  );
}

export function NeonPanel({ variant, children, style }: PanelProps) {
  return <View style={[variant === 'log' ? styles.logPanel : styles.sheet, style]}>{children}</View>;
}

const WORD = 'CHKOBBA'.split('');

/** One letter of the sign, lamping on after `delay`. */
function Lamp({ letter, delay, color, style }: { letter: string; delay: number; color: string; style?: StyleProp<TextStyle> }) {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      ...FLICKER.map((toValue) => Animated.timing(value, { toValue, duration: 80, easing: Easing.linear, useNativeDriver })),
    ]);
    anim.start();
    return () => anim.stop();
  }, [delay, value]);
  return <Animated.Text style={[styles.letter, style, { textShadowColor: color, opacity: value }]}>{letter}</Animated.Text>;
}

/** A light surge, then a hanging neon sign spells CHKOBBA letter by letter, then شكبّة in gold. */
export function NeonCelebration({ byName, side }: CelebrationProps) {
  const tr = useT();
  const bodyBold = useScriptFont('Cairo_700Bold');
  const color = side === 'us' ? neon.cyan : neon.pink;
  const sign = useEntrance(400);
  const [surge] = useState(() => new Animated.Value(0));
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    Animated.sequence([
      Animated.timing(surge, { toValue: 0.7, duration: 100, useNativeDriver }),
      Animated.timing(surge, { toValue: 0, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver }),
    ]).start();
  }, [surge]);
  return (
    <View style={styles.celebration} pointerEvents="none" testID="celebration">
      <View style={[StyleSheet.absoluteFill, styles.scrim]} />
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: surge }]} />
      <Animated.View style={{ alignItems: 'center', opacity: sign, transform: [{ scale: sign.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }}>
        <View style={styles.wires}>
          <View style={styles.wire} />
          <View style={styles.wire} />
        </View>
        <View style={[styles.sign, { borderColor: color, shadowColor: color }]}>
          <View style={styles.letters}>
            {WORD.map((l, i) => (
              <Lamp key={i} letter={l} delay={500 + i * 110} color={color} />
            ))}
          </View>
          <Lamp letter="شكبّة" delay={1500} color={neon.gold} style={styles.signAr} />
          <Text style={[styles.sweptBy, bodyBold]}>
            {tr('celebration.swept', { name: byName, team: side === 'us' ? tr('score.us') : tr('score.them') })}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

export function NeonWordmark() {
  const tr = useT();
  const body = useScriptFont('Cairo_500Medium');
  return (
    <View style={styles.wordmark}>
      <Text style={styles.wmEn}>
        CHK<Text style={styles.wmCyan}>OBBA</Text>
      </Text>
      <Text style={styles.wmAr}>شكبّة</Text>
      <Text style={[styles.wmTag, body]}>{tr('brand.tagline')}</Text>
    </View>
  );
}

const glow = (radius: number) => ({ shadowOpacity: 0.8, shadowRadius: radius, shadowOffset: { width: 0, height: 0 } });

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: neon.bg },
  slab: { borderWidth: 2, borderColor: neon.cyan, padding: 6, paddingTop: 10, shadowColor: neon.cyan, ...glow(14) },
  clip: { overflow: 'hidden' },
  inner: { ...StyleSheet.absoluteFill, margin: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,61,139,0.4)' },
  plate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: neon.slab2,
    shadowOffset: { width: 0, height: 0 },
  },
  initial: { fontFamily: 'ChakraPetch_700Bold', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 } },
  dealer: {
    position: 'absolute',
    left: -6,
    top: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: neon.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: neon.gold,
    ...glow(6),
  },
  dealerText: { fontFamily: 'ChakraPetch_700Bold', fontSize: 11, color: neon.deep },
  board: { flexDirection: 'row', gap: 6, alignItems: 'stretch' },
  plateScore: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 2,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 9,
    backgroundColor: 'rgba(14,11,31,0.7)',
    overflow: 'hidden',
    ...glow(10),
  },
  bigNum: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 32,
    lineHeight: 36,
    minWidth: 38,
    textAlign: 'center',
    color: '#fff',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  plateInfo: { flex: 1, minWidth: 0 },
  plateLabel: { fontFamily: 'ChakraPetch_700Bold', fontSize: 12, letterSpacing: 1.6, textTransform: 'uppercase' },
  plateStats: { flexDirection: 'row', gap: 10, marginTop: 2 },
  plateStat: { fontFamily: 'ChakraPetch_600SemiBold', fontSize: 12, color: neon.ink },
  ticks: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(255,255,255,0.08)' },
  tickFill: { height: 4, ...glow(6) },
  round: { width: 58, alignItems: 'center', justifyContent: 'center' },
  roundLabel: { fontFamily: 'ChakraPetch_600SemiBold', fontSize: 10, letterSpacing: 1, color: neon.muted, textTransform: 'uppercase' },
  roundNum: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 20,
    lineHeight: 24,
    color: neon.gold,
    textShadowColor: neon.gold,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  metaRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 6 },
  meta: { fontFamily: 'ChakraPetch_600SemiBold', fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: neon.muted2 },
  metaStrong: { color: neon.ink },
  logPanel: {
    backgroundColor: 'rgba(14,11,31,0.6)',
    borderWidth: 1,
    borderColor: neon.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sheet: {
    backgroundColor: 'rgba(20,16,43,0.97)',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: neon.gold,
    padding: 18,
    shadowColor: neon.gold,
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  celebration: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 10 },
  scrim: { backgroundColor: 'rgba(14,11,31,0.55)' },
  wires: { flexDirection: 'row', justifyContent: 'space-between', width: 200, height: 38 },
  wire: { width: 2, height: 38, backgroundColor: neon.muted2 },
  sign: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    borderRadius: 16,
    borderWidth: 3,
    backgroundColor: 'rgba(14,11,31,0.9)',
    alignItems: 'center',
    ...glow(22),
  },
  letters: { flexDirection: 'row', gap: 5 },
  letter: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 40,
    lineHeight: 46,
    color: '#fff',
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  signAr: { fontFamily: 'Cairo_700Bold', fontSize: 28, lineHeight: 44, color: neon.gold },
  sweptBy: { fontFamily: 'Inter_700Bold', fontSize: 13, color: neon.ink, marginTop: 4, textAlign: 'center' },
  wordmark: { alignItems: 'center' },
  wmEn: {
    fontFamily: 'ChakraPetch_700Bold',
    fontSize: 50,
    letterSpacing: 2.5,
    color: '#fff',
    textShadowColor: neon.pink,
    textShadowRadius: 22,
    textShadowOffset: { width: 0, height: 0 },
  },
  wmCyan: { color: '#E8FFFF', textShadowColor: neon.cyan },
  wmAr: {
    fontFamily: 'Cairo_700Bold',
    fontSize: 32,
    lineHeight: 48,
    color: neon.gold,
    textShadowColor: neon.gold,
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  wmTag: { fontFamily: 'ChakraPetch_600SemiBold', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: neon.muted, marginTop: 4 },
});
