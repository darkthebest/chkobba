import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';

import type { DeckPattern as DeckPatternId } from './themes';

interface Motif {
  size: number;
  node: (color: string) => ReactNode;
}

const MOTIFS: Record<DeckPatternId, Motif> = {
  stripes: {
    size: 12,
    node: (color) => <Rect x={0} y={0} width={3} height={12} fill={color} />,
  },
  dots: {
    size: 14,
    node: (color) => <Circle cx={4} cy={4} r={1.7} fill={color} />,
  },
  geo: {
    size: 20,
    node: (color) => (
      <>
        <Path d="M10 2 18 17H2Z" fill="none" stroke={color} strokeWidth={1} />
        <Circle cx={10} cy={10} r={2} fill={color} />
      </>
    ),
  },
  waves: {
    size: 24,
    node: (color) => <Path d="M0 10 Q6 2 12 10 T24 10" fill="none" stroke={color} strokeWidth={1.6} />,
  },
  bricks: {
    size: 20,
    node: (color) => (
      <>
        <Line x1={0} y1={0} x2={20} y2={0} stroke={color} strokeWidth={1} />
        <Line x1={0} y1={10} x2={20} y2={10} stroke={color} strokeWidth={1} />
        <Line x1={10} y1={0} x2={10} y2={10} stroke={color} strokeWidth={1} />
        <Line x1={0} y1={10} x2={0} y2={20} stroke={color} strokeWidth={1} />
        <Line x1={20} y1={10} x2={20} y2={20} stroke={color} strokeWidth={1} />
      </>
    ),
  },
  stars: {
    size: 18,
    node: (color) => <Path d="M9 2 11 7 16 9 11 11 9 16 7 11 2 9 7 7Z" fill={color} />,
  },
  diamond: {
    size: 16,
    node: (color) => <Path d="M8 1 15 8 8 15 1 8Z" fill="none" stroke={color} strokeWidth={1.2} />,
  },
  zellige: {
    size: 20,
    node: (color) => (
      <>
        <Path d="M10 1 19 10 10 19 1 10Z" fill="none" stroke={color} strokeWidth={1.1} />
        <Path d="M10 5 15 10 10 15 5 10Z" fill={color} opacity={0.7} />
      </>
    ),
  },
  arch: {
    size: 20,
    node: (color) => <Path d="M2 20V10a8 8 0 0 1 16 0v10" fill="none" stroke={color} strokeWidth={1.3} />,
  },
  dunes: {
    size: 24,
    node: (color) => (
      <>
        <Path d="M0 16 Q8 6 16 16 T32 16" fill="none" stroke={color} strokeWidth={1.2} />
        <Path d="M0 21 Q8 11 16 21 T32 21" fill="none" stroke={color} strokeWidth={0.8} opacity={0.6} />
      </>
    ),
  },
  rings: {
    size: 18,
    node: (color) => (
      <>
        <Circle cx={9} cy={9} r={6.5} fill="none" stroke={color} strokeWidth={1.2} />
        <Circle cx={9} cy={9} r={3} fill="none" stroke={color} strokeWidth={1} />
      </>
    ),
  },
  rays: {
    size: 22,
    node: (color) => (
      <>
        <Line x1={11} y1={22} x2={11} y2={2} stroke={color} strokeWidth={1} />
        <Line x1={11} y1={22} x2={1} y2={4} stroke={color} strokeWidth={0.8} />
        <Line x1={11} y1={22} x2={21} y2={4} stroke={color} strokeWidth={0.8} />
      </>
    ),
  },
  circuit: {
    size: 20,
    node: (color) => (
      <>
        <Path d="M2 4h8v6h8" fill="none" stroke={color} strokeWidth={1.2} />
        <Circle cx={2} cy={4} r={1.5} fill={color} />
        <Circle cx={18} cy={10} r={1.5} fill={color} />
      </>
    ),
  },
  runes: {
    size: 16,
    node: (color) => (
      <>
        <Line x1={4} y1={2} x2={4} y2={13} stroke={color} strokeWidth={1.4} />
        <Line x1={10} y1={4} x2={10} y2={15} stroke={color} strokeWidth={1.4} />
      </>
    ),
  },
  eclipse: {
    size: 22,
    node: (color) => (
      <>
        <Circle cx={11} cy={11} r={7} fill="none" stroke={color} strokeWidth={1.2} />
        <Circle cx={14} cy={9} r={5} fill={color} opacity={0.8} />
      </>
    ),
  },
};

export function DeckPattern({
  id,
  pattern,
  color,
  opacity = 0.3,
}: {
  id: string;
  pattern: DeckPatternId;
  color: string;
  opacity?: number;
}) {
  const motif = MOTIFS[pattern];
  return (
    <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" opacity={opacity} pointerEvents="none">
      <Defs>
        <Pattern id={id} width={motif.size} height={motif.size} patternUnits="userSpaceOnUse">
          {motif.node(color)}
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}
