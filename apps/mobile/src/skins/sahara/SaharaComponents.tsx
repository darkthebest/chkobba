import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

import { useT } from '@/i18n';
import { useScriptFont } from '@/skins/scriptFont';
import { useEntrance, useNativeDriver, usePulse } from '@/skins/shared/usePulse';
import type { AvatarProps, CelebrationProps, PanelProps, ScoreBoardProps } from '@/skins/types';

import { sahara } from './palette';

/** Fixed star field: [x %, y %, radius, opacity]. Kept to the upper sky so it never sits under the hand. */
const STARS: [number, number, number, number][] = [
  [12, 8, 1.2, 1], [32, 18, 1, 0.9], [74, 6, 1.4, 1], [88, 22, 1, 0.6], [52, 12, 1, 0.55],
  [6, 30, 1.2, 0.55], [94, 40, 1, 0.45], [22, 44, 1, 0.4], [64, 28, 0.9, 0.5], [42, 4, 0.8, 0.7],
  [82, 52, 0.9, 0.35], [8, 58, 0.8, 0.3], [58, 36, 0.8, 0.4], [28, 26, 0.7, 0.5],
];

export function SaharaBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.fill}>
      <LinearGradient colors={[sahara.night, sahara.night2, sahara.dusk]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <RadialGradient id="sahara-horizon" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={sahara.horizon} stopOpacity={1} />
            <Stop offset="1" stopColor={sahara.horizon} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx="50%" cy="104%" rx="75%" ry="32%" fill="url(#sahara-horizon)" />
        {STARS.map(([x, y, r, o], i) => (
          <Circle key={i} cx={`${x}%`} cy={`${y}%`} r={r} fill="#fff" opacity={o} />
        ))}
      </Svg>
      {children}
    </View>
  );
}

/** A woven round mat laid on the sand, lit by a lantern glow `glow` wide; drawn behind the table cards. */
function Mat({ size, glow }: { size: number; glow: number }) {
  const c = glow / 2;
  const r = size / 2;
  const band = Math.max(6, size / 32);
  const rings = Math.floor((r - band) / band);
  return (
    <Svg width={glow} height={glow} viewBox={`0 0 ${glow} ${glow}`}>
      <Defs>
        {/* User-space gradients: percentage units drift on web. */}
        <RadialGradient id="sahara-lantern" cx={c} cy={c} r={c} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFAA50" stopOpacity={0.2} />
          <Stop offset="1" stopColor="#FFAA50" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="sahara-shade" cx={c} cy={c} r={r - band} gradientUnits="userSpaceOnUse">
          <Stop offset="0.7" stopColor="#000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000" stopOpacity={0.4} />
        </RadialGradient>
      </Defs>
      <Circle cx={c} cy={c} r={c} fill="url(#sahara-lantern)" />
      <Circle cx={c} cy={c} r={r} fill="none" stroke={sahara.gold} strokeOpacity={0.4} strokeWidth={2} />
      <Circle cx={c} cy={c} r={r - 1} fill={sahara.matEdge} />
      {Array.from({ length: rings }, (_, i) => (
        <Circle key={i} cx={c} cy={c} r={r - band - i * band} fill={i % 2 === 0 ? sahara.mat1 : sahara.mat2} />
      ))}
      <Circle cx={c} cy={c} r={r - band} fill="url(#sahara-shade)" />
      <Circle cx={c} cy={c} r={r * 0.42} fill="#FFB45C" fillOpacity={0.1} />
      <Circle cx={c} cy={c} r={r - band * 2.4} fill="none" stroke={sahara.gold} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="5 5" />
    </Svg>
  );
}

export function SaharaTableSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };
  // The mat fills the shorter side; cards still wrap in the full rectangle above it.
  const size = box ? Math.min(box.width * 0.98, box.height * 0.96, 480) : 0;
  // The glow stays inside the region so its edge is never clipped.
  const glow = box ? Math.max(size, Math.min(size * 1.5, box.width, box.height)) : 0;
  return (
    <View style={[styles.region, style]} onLayout={onLayout}>
      {box && size > 0 ? (
        <View style={[styles.matWrap, { left: (box.width - glow) / 2, top: (box.height - glow) / 2 }]} pointerEvents="none">
          <Mat size={size} glow={glow} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Below this share of the turn left, the lantern ring burns ember red. */
const LOW_TIME = 0.25;

/** A small flame over the active seat, flickering. */
function Flame({ active }: { active: boolean }) {
  const flick = usePulse(active, 1200);
  return (
    <Animated.View
      style={[
        styles.flame,
        {
          transform: [
            { scale: flick.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) },
            { rotate: flick.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-6deg'] }) },
          ],
        },
      ]}
      pointerEvents="none"
    >
      <Svg width={14} height={18} viewBox="0 0 14 18">
        <Path d="M7 0C9 5 14 7 14 12a7 6 0 0 1-14 0C0 8 4 7 4 3c2 2 2 3 3 4C8 5 8 3 7 0z" fill="#FF8A3C" />
        <Path d="M7 7c1 3 4 4 4 7a4 3.5 0 0 1-8 0c0-2 2-3 2-5 1 1 1 1 2 2 0-1 0-2 0-4z" fill={sahara.gold} />
      </Svg>
    </Animated.View>
  );
}

/** Lantern medallion: a lit glass bead in the team colour; its golden ring burns down as the turn clock. */
export function SaharaAvatar({ initial, side, isTurn, isDealer, size, progress }: AvatarProps) {
  const d = size === 'md' ? 48 : 40;
  const color = side === 'us' ? sahara.us : sahara.them;
  const box = d + 14;
  const r = d / 2 + 4;
  const circumference = 2 * Math.PI * r;
  const share = Math.min(1, Math.max(0, progress ?? 1));
  const showRing = isTurn || progress !== undefined;
  const gradId = `sahara-bead-${side}`;
  return (
    <View style={{ width: d, height: d }}>
      {isTurn ? <View style={[styles.halo, { width: d, height: d, borderRadius: d / 2, shadowColor: color }]} /> : null}
      <View style={[styles.ring, { width: box, height: box, left: -7, top: -7 }]} pointerEvents="none">
        <Svg width={box} height={box}>
          {showRing ? (
            <>
              <Circle cx={box / 2} cy={box / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={4} fill="none" />
              <Circle
                cx={box / 2}
                cy={box / 2}
                r={r}
                stroke={share < LOW_TIME ? sahara.ember : sahara.gold}
                strokeWidth={4}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${circumference} ${circumference}`}
                strokeDashoffset={circumference * (1 - share)}
                transform={`rotate(-90 ${box / 2} ${box / 2})`}
              />
            </>
          ) : null}
        </Svg>
      </View>
      <View style={[styles.bead, { width: d, height: d, borderRadius: d / 2, opacity: isTurn ? 1 : 0.82 }]}>
        <Svg width={d} height={d} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={gradId} cx="40%" cy="35%" r="65%">
              <Stop offset="0" stopColor="#fff" stopOpacity={0.55} />
              <Stop offset="0.45" stopColor={color} stopOpacity={1} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.55} />
            </RadialGradient>
          </Defs>
          <Circle cx={d / 2} cy={d / 2} r={d / 2} fill={color} />
          <Circle cx={d / 2} cy={d / 2} r={d / 2} fill={`url(#${gradId})`} />
        </Svg>
        <Text style={[styles.initial, { fontSize: d * 0.42 }]}>{initial}</Text>
      </View>
      {isTurn ? <Flame active={isTurn} /> : null}
      {isDealer ? (
        <View style={styles.dealer}>
          <Text style={styles.dealerText}>D</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A small drawn palm for the oasis at the end of the caravan track. */
function Oasis({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16">
      <Path d="M8 7c0 3-1 6-2 8h2c1-2 1-5 1-8z" fill={sahara.sand} />
      <Path d="M8 7C6 4 3 4 1 6c3-1 5 0 7 1zM8 7c2-3 5-3 7-1-3-1-5 0-7 1zM8 7C7 4 5 2 3 2c3 1 4 3 5 5zM8 7c1-3 3-5 5-5-3 1-4 3-5 5z" fill={color} />
      <Ellipse cx={8} cy={15.2} rx={5} ry={0.8} fill={sahara.us} opacity={0.5} />
    </Svg>
  );
}

/** One team's caravan walking a dotted track to the oasis; one step per point. */
function Caravan({ label, score, target, color, testID }: { label: string; score: number; target: number; color: string; testID: string }) {
  const bodyBold = useScriptFont('Cairo_700Bold');
  const at = Math.min(score, target);
  return (
    <View style={styles.track} testID={testID}>
      <Text style={[styles.trackName, { color }, bodyBold]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.path}>
        <View style={styles.pathLine} />
        {Array.from({ length: target }, (_, k) => {
          const step = k + 1;
          if (step === target) {
            return at === target ? <View key={step} style={[styles.here, { backgroundColor: color, shadowColor: color }]} /> : <Oasis key={step} color={sahara.star2} />;
          }
          if (step === at) return <View key={step} style={[styles.here, { backgroundColor: color, shadowColor: color }]} />;
          return <View key={step} style={[styles.step, step < at && { backgroundColor: color }]} />;
        })}
      </View>
      <Text style={styles.trackNum}>{score}</Text>
    </View>
  );
}

export function SaharaScoreBoard({ scores, chkobbas, round, target, stock, dealerName }: ScoreBoardProps) {
  const tr = useT();
  const body = useScriptFont('Cairo_500Medium');
  const meta = (k: string, v: string | number) => (
    <Text style={[styles.meta, body]} key={k}>
      {k} <Text style={styles.metaStrong}>{v}</Text>
    </Text>
  );
  return (
    <View style={styles.board}>
      <Caravan label={tr('score.us')} score={scores.us} target={target} color={sahara.us} testID="score-us" />
      <Caravan label={tr('score.them')} score={scores.them} target={target} color={sahara.them} testID="score-them" />
      <View style={styles.metaRow}>
        {meta(tr('score.round'), round)}
        {meta(tr('score.stockLabel'), stock)}
        {meta('★', `${chkobbas.us} · ${chkobbas.them}`)}
        {meta(tr('score.dealerLabel'), dealerName)}
      </View>
    </View>
  );
}

function Crescent({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M26 3A17 17 0 1 0 37 30 14 14 0 1 1 26 3z" fill={color} />
    </Svg>
  );
}

export function SaharaPanel({ variant, children, style }: PanelProps) {
  if (variant === 'log') return <View style={[styles.logPanel, style]}>{children}</View>;
  return (
    <View style={[styles.sheet, style]}>
      <LinearGradient colors={[sahara.panel1, sahara.panel2]} style={StyleSheet.absoluteFill} />
      <View style={styles.sheetMoon} pointerEvents="none">
        <Crescent size={34} color={sahara.gold} />
      </View>
      {children}
    </View>
  );
}

const WORD = 'CHKOBBA'.split('');

/** A shooting star crosses the sky, CHKOBBA lights letter by letter, then شكبّة glows in gold. */
export function SaharaCelebration({ byName, side }: CelebrationProps) {
  const tr = useT();
  const bodyBold = useScriptFont('Cairo_700Bold');
  const { width } = useWindowDimensions();
  const scrim = useEntrance(400, Easing.out(Easing.quad));
  const [shoot] = useState(() => new Animated.Value(0));
  const [letters] = useState(() => WORD.map(() => new Animated.Value(0)));
  const [script] = useState(() => new Animated.Value(0));
  const color = side === 'us' ? sahara.us : sahara.them;

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(shoot, { toValue: 1, duration: 1100, delay: 100, easing: Easing.in(Easing.quad), useNativeDriver }),
      Animated.stagger(
        80,
        letters.map((v) => Animated.timing(v, { toValue: 1, duration: 450, delay: 500, easing: Easing.out(Easing.back(1.4)), useNativeDriver })),
      ),
      Animated.timing(script, { toValue: 1, duration: 900, delay: 1300, easing: Easing.out(Easing.quad), useNativeDriver }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [shoot, letters, script]);

  return (
    <View style={styles.celebration} pointerEvents="none" testID="celebration">
      <Animated.View style={[StyleSheet.absoluteFill, styles.skyScrim, { opacity: scrim }]} />
      <Animated.View
        style={[
          styles.meteor,
          {
            transform: [
              { translateX: shoot.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.6, width * 1.1] }) },
              { translateY: shoot.interpolate({ inputRange: [0, 1], outputRange: [0, 140] }) },
              { rotate: '18deg' },
            ],
            opacity: shoot.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] }),
          },
        ]}
      >
        <LinearGradient colors={['transparent', '#fff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={styles.word}>
        {WORD.map((l, i) => (
          <Animated.Text
            key={i}
            style={[
              styles.letter,
              {
                textShadowColor: color,
                opacity: letters[i],
                transform: [{ translateY: letters[i]!.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
              },
            ]}
          >
            {l}
          </Animated.Text>
        ))}
      </View>
      <Animated.Text
        style={[styles.script, { opacity: script, transform: [{ scale: script.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}
      >
        شكبّة
      </Animated.Text>
      <Animated.Text style={[styles.sweptBy, bodyBold, { opacity: script }]}>
        {tr('celebration.swept', { name: byName, team: side === 'us' ? tr('score.us') : tr('score.them') })}
      </Animated.Text>
    </View>
  );
}

export function SaharaWordmark() {
  const tr = useT();
  const body = useScriptFont('Cairo_500Medium');
  return (
    <View style={styles.wordmark}>
      <View style={styles.wmMoon} pointerEvents="none">
        <Crescent size={40} color="#F4E1A6" />
      </View>
      <Text style={styles.wmEn}>CHKOBBA</Text>
      <Text style={styles.wmAr}>شكبّة</Text>
      <Text style={[styles.wmTag, body]}>{tr('brand.tagline')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: sahara.night },
  region: { padding: 6 },
  matWrap: { position: 'absolute' },
  ring: { position: 'absolute' },
  halo: {
    position: 'absolute',
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    backgroundColor: 'rgba(255,180,92,0.18)',
  },
  bead: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#1A1638',
  },
  initial: { fontFamily: 'Marcellus_400Regular', color: '#fff', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  flame: { position: 'absolute', top: -20, left: '50%', marginLeft: -7 },
  dealer: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: sahara.gold,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerText: { fontFamily: 'Inter_900Black', fontSize: 10, color: sahara.onGold },
  board: { gap: 4 },
  track: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trackName: { width: 48, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  path: { flex: 1, height: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pathLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 7.5,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(243,234,216,0.25)',
  },
  step: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(243,234,216,0.3)' },
  here: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.4)',
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  trackNum: { width: 30, textAlign: 'right', fontFamily: 'Marcellus_400Regular', fontSize: 24, lineHeight: 28, color: '#fff' },
  metaRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 14, rowGap: 2 },
  meta: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: sahara.muted },
  metaStrong: { color: sahara.gold },
  logPanel: {
    backgroundColor: 'rgba(10,12,34,0.55)',
    borderWidth: 1,
    borderColor: sahara.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sheet: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(244,201,93,0.4)',
    overflow: 'hidden',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
  },
  sheetMoon: { position: 'absolute', right: 16, top: 12, opacity: 0.85, transform: [{ rotate: '-20deg' }] },
  celebration: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 10 },
  skyScrim: { backgroundColor: 'rgba(5,7,24,0.75)' },
  meteor: {
    position: 'absolute',
    left: 0,
    top: '18%',
    width: 160,
    height: 2,
    borderRadius: 1,
    overflow: 'hidden',
    shadowColor: '#fff',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  word: { flexDirection: 'row', gap: 6 },
  letter: { fontFamily: 'Marcellus_400Regular', fontSize: 44, color: '#fff', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },
  script: {
    fontFamily: 'ReemKufi_700Bold',
    fontSize: 40,
    lineHeight: 60,
    color: sahara.gold,
    textShadowColor: 'rgba(244,201,93,0.6)',
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  sweptBy: { fontFamily: 'Inter_700Bold', fontSize: 13, color: sahara.ink, marginTop: 4, textAlign: 'center', paddingHorizontal: 16 },
  wordmark: { alignSelf: 'center', alignItems: 'center', paddingTop: 8 },
  wmMoon: { position: 'absolute', right: -34, top: -16, transform: [{ rotate: '-24deg' }] },
  wmEn: {
    fontFamily: 'Marcellus_400Regular',
    fontSize: 46,
    letterSpacing: 6,
    color: '#fff',
    textShadowColor: 'rgba(244,201,93,0.45)',
    textShadowRadius: 24,
    textShadowOffset: { width: 0, height: 0 },
  },
  wmAr: { fontFamily: 'ReemKufi_700Bold', fontSize: 30, lineHeight: 46, color: sahara.gold, marginTop: -4 },
  wmTag: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: sahara.muted, marginTop: 4 },
});
