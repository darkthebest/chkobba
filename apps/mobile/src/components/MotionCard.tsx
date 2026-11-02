import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

import { useNativeDriver } from '@/skins/shared/usePulse';

/** Where a seat sits relative to the viewer. */
export type Position = 'bottom' | 'right' | 'top' | 'left';
export type EnterFrom = Position | 'deck' | 'center';

export const ENTER_MS = 320;
export const SWEEP_MS = 400;
export const DEAL_STAGGER_MS = 90;

const OFFSETS: Record<EnterFrom, { x: number; y: number; scale: number }> = {
  bottom: { x: 0, y: 240, scale: 0.9 },
  top: { x: 0, y: -200, scale: 0.9 },
  left: { x: -170, y: 0, scale: 0.9 },
  right: { x: 170, y: 0, scale: 0.9 },
  deck: { x: 0, y: -260, scale: 0.8 },
  center: { x: 0, y: 0, scale: 0.3 },
};

interface MotionCardProps {
  children: ReactNode;
  /** Where the card comes from when it mounts. */
  enterFrom: EnterFrom;
  delay?: number;
  /** When set, the card flies off toward this seat (it stays in the layout so nothing reflows mid-flight). */
  sweepTo?: Position | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * Card entrance and capture sweep built on React Native's Animated, which
 * behaves the same on iOS, Android and web. Unmounting is left to the caller
 * (useStagedTable removes swept cards once the sweep has finished).
 */
export function MotionCard({ children, enterFrom, delay = 0, sweepTo = null, style }: MotionCardProps) {
  const [enter] = useState(() => new Animated.Value(0));
  const [sweep] = useState(() => new Animated.Value(0));
  // The entrance is decided once, at mount.
  const [from] = useState(() => ({ ...OFFSETS[enterFrom], delay }));

  useEffect(() => {
    const anim = Animated.timing(enter, {
      toValue: 1,
      duration: ENTER_MS,
      delay: from.delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    });
    anim.start();
    return () => anim.stop();
  }, [enter, from]);

  useEffect(() => {
    if (!sweepTo) return;
    const anim = Animated.timing(sweep, { toValue: 1, duration: SWEEP_MS, easing: Easing.in(Easing.cubic), useNativeDriver });
    anim.start();
    return () => anim.stop();
  }, [sweep, sweepTo]);

  const to = OFFSETS[sweepTo ?? 'center'];
  const lerp = (value: Animated.Value, a: number, b: number) => value.interpolate({ inputRange: [0, 1], outputRange: [a, b] });

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: Animated.multiply(lerp(enter, 0, 1), lerp(sweep, 1, 0)),
          transform: [
            { translateX: Animated.add(lerp(enter, from.x, 0), lerp(sweep, 0, sweepTo ? to.x : 0)) },
            { translateY: Animated.add(lerp(enter, from.y, 0), lerp(sweep, 0, sweepTo ? to.y : 0)) },
            { scale: Animated.multiply(lerp(enter, from.scale, 1), lerp(sweep, 1, 0.45)) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
