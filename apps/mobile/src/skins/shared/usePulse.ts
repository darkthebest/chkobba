import { useEffect, useState } from 'react';
import { Animated, Easing, Platform } from 'react-native';

const useNativeDriver = Platform.OS !== 'web';

/** A 0→1→0 looping value while `active`, for glows and "thinking" dots. */
export function usePulse(active: boolean, durationMs = 1400): Animated.Value {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return;
    }
    const half = durationMs / 2;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver }),
        Animated.timing(value, { toValue: 0, duration: half, easing: Easing.inOut(Easing.quad), useNativeDriver }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, durationMs, value]);
  return value;
}

const OVERSHOOT = Easing.out(Easing.back(1.6));

/** Plays once from 0 to 1 on mount (entrance animations). Pass a stable `easing`. */
export function useEntrance(durationMs: number, easing = OVERSHOOT): Animated.Value {
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(value, { toValue: 1, duration: durationMs, easing, useNativeDriver });
    anim.start();
    return () => anim.stop();
  }, [durationMs, easing, value]);
  return value;
}

export { useNativeDriver };
