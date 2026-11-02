import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

import { useNativeDriver } from '@/skins/shared/usePulse';

const SHAKE_MS = 320;

/** Shakes its child sideways each time `trigger` changes to a new non-zero value (a move that cannot be played). */
export function Shake({ trigger, children }: { trigger: number; children: ReactNode }) {
  const [x] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (trigger === 0) return;
    x.setValue(0);
    const anim = Animated.timing(x, { toValue: 1, duration: SHAKE_MS, easing: Easing.linear, useNativeDriver });
    anim.start();
    return () => anim.stop();
  }, [trigger, x]);

  const translateX = x.interpolate({ inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1], outputRange: [0, -7, 6, -4, 2, 0] });
  return <Animated.View style={{ transform: [{ translateX }] }}>{children}</Animated.View>;
}
