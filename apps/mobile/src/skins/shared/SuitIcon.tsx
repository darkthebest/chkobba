import type { Suit } from '@chkobba/rules';
import Svg, { Circle, Path } from 'react-native-svg';

/** Suit glyphs on a 100×100 grid, shared by all skins. */
export function SuitIcon({ suit, size, color }: { suit: Suit; size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {suit === 'H' ? (
        <Path
          fill={color}
          d="M50 90C20 64 6 48 6 31 6 17 17 8 30 8c9 0 16 5 20 13 4-8 11-13 20-13 13 0 24 9 24 23 0 17-14 33-44 59z"
        />
      ) : null}
      {suit === 'D' ? <Path fill={color} d="M50 3 89 50 50 97 11 50z" /> : null}
      {suit === 'S' ? (
        <Path
          fill={color}
          d="M50 4C50 4 91 35 91 58c0 14-11 22-22 22-8 0-14-4-17-9 1 11 5 18 13 23H35c8-5 12-12 13-23-3 5-9 9-17 9-11 0-22-8-22-22C9 35 50 4 50 4z"
        />
      ) : null}
      {suit === 'C' ? (
        <>
          <Circle fill={color} cx="50" cy="28" r="22" />
          <Circle fill={color} cx="26" cy="60" r="22" />
          <Circle fill={color} cx="74" cy="60" r="22" />
          <Path fill={color} d="M43 55h14l6 40H37z" />
        </>
      ) : null}
    </Svg>
  );
}
