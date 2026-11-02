import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, SvgXml } from 'react-native-svg';

import { useT } from '@/i18n';
import { useScriptFont } from '@/skins/scriptFont';
import { useEntrance, usePulse } from '@/skins/shared/usePulse';
import type { AvatarProps, CelebrationProps, PanelProps, ScoreBoardProps } from '@/skins/types';

import { cafe } from './palette';
import { TUNISIAN_BACK } from './tunisianDeck';

const PLANKS = ['18%', '36%', '54%', '74%', '90%'] as const;

export function CafeBackground({ children }: { children: ReactNode }) {
  return (
    <View style={styles.fill}>
      <LinearGradient colors={[cafe.wood1, cafe.wood2, cafe.wood3]} locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
      {PLANKS.map((left) => (
        <View key={left} style={[styles.plank, { left }]} pointerEvents="none" />
      ))}
      {children}
    </View>
  );
}

export function CafeTableSurface({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.baize, style]}>
      <LinearGradient
        colors={[cafe.baize1, cafe.baize2, cafe.baize3]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.baizeInset} pointerEvents="none" />
      {children}
    </View>
  );
}

/** The RT monopoly back: a red star lattice with "RT" in every cell. */
export function CafeCardBack({ width, height }: { width: number; height: number }) {
  return (
    <View style={[styles.back, { width, height }]}>
      <SvgXml xml={TUNISIAN_BACK} width="100%" height="100%" />
    </View>
  );
}

/** Below this share of the turn left, the clock turns red. */
const LOW_TIME = 0.25;

/** The online turn clock: a brass glow arc around the medal that drains anticlockwise. */
function CafeTurnArc({ diameter, progress }: { diameter: number; progress: number }) {
  const box = diameter + 12;
  const r = diameter / 2 + 3;
  const circumference = 2 * Math.PI * r;
  const share = Math.min(1, Math.max(0, progress));
  const color = share < LOW_TIME ? cafe.red : cafe.gold;
  const arc = {
    cx: box / 2,
    cy: box / 2,
    r,
    stroke: color,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeDasharray: `${circumference} ${circumference}`,
    strokeDashoffset: circumference * (1 - share),
    transform: `rotate(-90 ${box / 2} ${box / 2})`,
  };
  return (
    <View style={[styles.arc, { left: -6, top: -6 }]} pointerEvents="none">
      <Svg width={box} height={box}>
        <Circle {...arc} strokeWidth={7} strokeOpacity={0.35} />
        <Circle {...arc} strokeWidth={2.5} />
      </Svg>
    </View>
  );
}

export function CafeAvatar({ initial, side, isTurn, isDealer, size, progress }: AvatarProps) {
  const d = size === 'md' ? 44 : 38;
  const pulse = usePulse(isTurn);
  // On the clock the halo shrinks with the time left, so the glow itself drains.
  const haloScale = progress === undefined ? 1 : 0.7 + 0.3 * Math.min(1, Math.max(0, progress));
  return (
    <View style={{ width: d, height: d }}>
      {isTurn ? (
        <Animated.View
          style={[
            styles.glow,
            { width: d + 16, height: d + 16, borderRadius: (d + 16) / 2, left: -8, top: -8 },
            { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }), transform: [{ scale: haloScale }] },
          ]}
        />
      ) : null}
      {progress !== undefined ? <CafeTurnArc diameter={d} progress={progress} /> : null}
      <LinearGradient
        colors={[cafe.brass1, cafe.brass3]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.medal, { width: d, height: d, borderRadius: d / 2 }]}
      >
        <View style={[styles.medalIn, { backgroundColor: side === 'us' ? cafe.teal : cafe.burgundy }]}>
          <Text style={[styles.medalText, { fontSize: d * 0.45 }]}>{initial}</Text>
        </View>
      </LinearGradient>
      {isDealer ? (
        <View style={styles.dealer}>
          <Text style={styles.dealerText}>D</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Groups of five tally strokes, like the scorekeeper's (racham) notebook. */
function Tally({ n, color }: { n: number; color: string }) {
  const lines: [number, number, number, number][] = [];
  let x = 4;
  const stroke = (k: number) => lines.push([x + k * 5, 3 + (k % 2), x + k * 5 + 0.7, 21 - ((k + 1) % 2)]);
  for (let g = 0; g < Math.floor(n / 5); g++) {
    for (let k = 0; k < 4; k++) stroke(k);
    lines.push([x - 3, 18, x + 20, 5]);
    x += 27;
  }
  for (let k = 0; k < n % 5; k++) stroke(k);
  const width = Math.max(x + (n % 5) * 5 + 4, 12);
  return (
    <Svg width={width} height={26} viewBox={`0 0 ${width} 26`}>
      {lines.map(([x1, y1, x2, y2], i) => (
        <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      ))}
    </Svg>
  );
}

function RulesAndHoles({ step, start, count, holes, margin }: { step: number; start: number; count: number; holes: number; margin: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.rule, { top: start + i * step }]} pointerEvents="none" />
      ))}
      <View style={[styles.margin, { left: margin }]} pointerEvents="none" />
      <View style={styles.holes} pointerEvents="none">
        {Array.from({ length: holes }, (_, i) => (
          <View key={i} style={styles.hole} />
        ))}
      </View>
    </>
  );
}

export function CafeScoreBoard({ scores, chkobbas, piles, round, target, stock, dealerName }: ScoreBoardProps) {
  const tr = useT();
  const body = useScriptFont('Amiri_400Regular');
  const bodyBold = useScriptFont('Amiri_700Bold');
  const column = (label: string, side: 'us' | 'them') => {
    const color = side === 'us' ? cafe.ink : cafe.burgundy;
    return (
      <View style={styles.col} testID={`score-${side}`}>
        <View style={styles.colHead}>
          <Text style={[styles.colLabel, bodyBold, { color }]}>{label}</Text>
          <Text style={[styles.colNum, { color }]}>{scores[side]}</Text>
        </View>
        <View style={styles.tally}>
          <Tally n={scores[side]} color={color} />
        </View>
        {/* Separate Text nodes keep a right-to-left word from flipping the number beside it. */}
        <View style={styles.colSub}>
          <View style={styles.stat}>
            <Text style={styles.subText}>▮ {piles[side]}</Text>
            <Text style={[styles.subText, body]}>{tr('scoring.karta')}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.subText}>★ {chkobbas[side]}</Text>
            <Text style={[styles.subText, body]}>{tr('scoring.chkobba')}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.racham}>
      <RulesAndHoles step={22} start={18} count={5} holes={3} margin={30} />
      <View style={styles.cols}>
        {column(tr('score.us'), 'us')}
        {column(tr('score.them'), 'them')}
      </View>
      <LinearGradient colors={[cafe.brass2, cafe.brass3]} style={styles.foot}>
        <Text style={[styles.footText, bodyBold]}>{tr('score.roundTo', { round, target })}</Text>
        <Text style={[styles.footText, bodyBold]}>{tr('score.dealer', { name: dealerName })}</Text>
        <Text style={[styles.footText, bodyBold]}>{tr('score.stock', { n: stock })}</Text>
      </LinearGradient>
    </View>
  );
}

export function CafePanel({ variant, children, style }: PanelProps) {
  if (variant === 'log') {
    return (
      <View style={[styles.logPanel, style]}>
        <View style={styles.logBar} />
        {children}
      </View>
    );
  }
  return (
    <View style={[styles.sheet, style]}>
      <RulesAndHoles step={40} start={30} count={14} holes={5} margin={36} />
      {children}
    </View>
  );
}

const CONFETTI_COLORS = [cafe.brass1, cafe.red, cafe.cream, '#2A9D8F'];

function ConfettiPiece({ index }: { index: number }) {
  const fall = useEntrance(2200 + (index % 5) * 300, Easing.linear);
  return (
    <Animated.View
      style={[
        styles.confetti,
        {
          left: `${(index * 37) % 100}%`,
          backgroundColor: CONFETTI_COLORS[index % 4],
          transform: [
            { translateY: fall.interpolate({ inputRange: [0, 1], outputRange: [-20 - (index % 7) * 30, 520] }) },
            { rotate: fall.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${360 + index * 40}deg`] }) },
          ],
        },
      ]}
    />
  );
}

/** Rubber-stamp banner; confetti only when our team swept. */
export function CafeCelebration({ byName, side }: CelebrationProps) {
  const tr = useT();
  const bodyBold = useScriptFont('Amiri_700Bold');
  const enter = useEntrance(600);
  const pieces = useMemo(() => Array.from({ length: 22 }, (_, i) => i), []);
  return (
    <View style={styles.celebration} pointerEvents="none" testID="celebration">
      {side === 'us' ? pieces.map((i) => <ConfettiPiece key={i} index={i} />) : null}
      <Animated.View
        style={[
          styles.stamp,
          side === 'them' && styles.stampMuted,
          {
            opacity: enter,
            transform: [
              { rotate: '-7deg' },
              { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [2.6, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.stampInner}>
          <Text style={styles.stampAr}>شكبّة!</Text>
          <Text style={styles.stampEn}>CHKOBBA!</Text>
          <Text style={[styles.stampBy, bodyBold]}>
            {tr('celebration.swept', { name: byName, team: side === 'us' ? tr('score.us') : tr('score.them') })}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

export function CafeWordmark() {
  const tr = useT();
  const body = useScriptFont('Amiri_400Regular');
  return (
    <View style={styles.wordmark}>
      <Text style={styles.wmAr}>شكبّة</Text>
      <Text style={styles.wmEn}>Chkobba</Text>
      <Text style={[styles.wmTag, body]}>{tr('brand.tagline')}</Text>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <View style={styles.dividerDot} />
        <View style={styles.dividerLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: cafe.wood3 },
  plank: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.22)' },
  baize: { borderRadius: 22, borderWidth: 3, borderColor: cafe.brass3, overflow: 'hidden', padding: 6 },
  baizeInset: { ...StyleSheet.absoluteFill, borderRadius: 19, borderWidth: 2, borderColor: '#0f2f1f' },
  back: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 214, 100, 0.45)',
    shadowColor: '#FFD664',
    shadowOpacity: 0.9,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  arc: { position: 'absolute' },
  medal: { padding: 3, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  medalIn: {
    flex: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.4)',
  },
  medalText: { fontFamily: 'PlayfairDisplay_900Black', color: cafe.brass1 },
  dealer: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: cafe.cream,
    borderWidth: 1.5,
    borderColor: cafe.brass3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealerText: { fontFamily: 'PlayfairDisplay_900Black', fontSize: 10, color: cafe.wood3 },
  racham: {
    backgroundColor: cafe.paper,
    borderRadius: 6,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderWidth: 1,
    borderColor: cafe.paperEdge,
    overflow: 'hidden',
    transform: [{ rotate: '-0.4deg' }],
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(35,54,107,0.16)' },
  margin: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(179,32,42,0.45)' },
  holes: { position: 'absolute', left: 8, top: 0, bottom: 0, justifyContent: 'space-around', paddingVertical: 10 },
  hole: { width: 9, height: 9, borderRadius: 5, backgroundColor: cafe.wood2 },
  cols: { flexDirection: 'row', paddingTop: 4, paddingBottom: 4, paddingLeft: 40, paddingRight: 10, gap: 10 },
  col: { flex: 1, minWidth: 0 },
  colHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  colLabel: { fontFamily: 'Caveat_700Bold', fontSize: 21 },
  colNum: { fontFamily: 'Caveat_700Bold', fontSize: 30, marginStart: 'auto', lineHeight: 32 },
  tally: { height: 26, overflow: 'hidden' },
  colSub: { flexDirection: 'row', gap: 10 },
  subText: { fontFamily: 'Lora_500Medium', fontSize: 11, color: '#5a4a33' },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingLeft: 40, paddingRight: 12 },
  footText: { fontFamily: 'Lora_700Bold', fontSize: 11, color: cafe.wood3 },
  logPanel: {
    backgroundColor: '#F5EBCF',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: cafe.paperEdge,
    paddingVertical: 6,
    paddingLeft: 14,
    paddingRight: 10,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  logBar: { position: 'absolute', left: -1, top: 6, bottom: 6, width: 4, borderRadius: 2, backgroundColor: cafe.burgundy },
  sheet: {
    backgroundColor: cafe.paper,
    borderRadius: 6,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderColor: cafe.paperEdge,
    overflow: 'hidden',
    paddingTop: 16,
    paddingBottom: 16,
    paddingLeft: 46,
    paddingRight: 16,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 18 },
  },
  celebration: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', zIndex: 10 },
  confetti: { position: 'absolute', top: 0, width: 7, height: 12, borderRadius: 2 },
  stamp: {
    backgroundColor: 'rgba(122,31,43,0.95)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: cafe.brass1,
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 12 },
  },
  stampMuted: { backgroundColor: 'rgba(62,36,18,0.95)' },
  stampInner: {
    borderWidth: 1,
    borderColor: cafe.brass1,
    borderRadius: 9,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
    alignItems: 'center',
  },
  stampAr: { fontFamily: 'Amiri_700Bold', fontSize: 44, color: cafe.brass1, lineHeight: 60 },
  stampEn: { fontFamily: 'PlayfairDisplay_900Black', fontSize: 26, letterSpacing: 3, color: cafe.cream },
  stampBy: { fontFamily: 'Lora_700Bold', fontSize: 12, color: cafe.brass1, marginTop: 4 },
  wordmark: { alignItems: 'center' },
  wmAr: {
    fontFamily: 'Amiri_700Bold',
    fontSize: 60,
    lineHeight: 84,
    color: cafe.brass1,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
  },
  wmEn: {
    fontFamily: 'PlayfairDisplay_900Black',
    fontSize: 44,
    color: cafe.cream,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 0,
  },
  wmTag: { fontFamily: 'Lora_400Regular_Italic', fontSize: 14, color: cafe.brass1, marginTop: 2 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 200, marginTop: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: cafe.brass2 },
  dividerDot: { width: 9, height: 9, backgroundColor: cafe.brass1, transform: [{ rotate: '45deg' }] },
});
