import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { BUBBLE_MS, emoteText, isPhrase, type EmoteId } from '@/emotes/catalog';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';
import { useNativeDriver } from '@/skins/shared/usePulse';

/** Which side of the bubble points back at the sender. */
export type BubbleTail = 'top' | 'left' | 'right' | 'bottom';

const FADE_MS = 300;

function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => {
        if (alive) setReduce(on);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return reduce;
}

/**
 * A speech bubble with one emote, styled by the table design. It pops in
 * (fades in under reduce-motion) and fades out just before it is removed.
 * Position it from outside; `tail` points back at the sender.
 */
export function EmoteBubble({ id, tail, style, testID }: { id: EmoteId; tail: BubbleTail; style?: StyleProp<ViewStyle>; testID?: string }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const reduce = useReduceMotion();
  const [enter] = useState(() => new Animated.Value(0));
  const [leave] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const anim = Animated.parallel([
      Animated.timing(enter, { toValue: 1, duration: 280, easing: Easing.out(Easing.back(1.8)), useNativeDriver }),
      Animated.timing(leave, { toValue: 0, duration: FADE_MS, delay: BUBBLE_MS - FADE_MS, useNativeDriver }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [enter, leave]);

  const phrase = isPhrase(id);
  const colors = { backgroundColor: t.colors.bubbleBg, borderColor: t.colors.bubbleBorder };
  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={[
        styles.bubble,
        colors,
        style,
        {
          opacity: reduce ? Animated.multiply(enter.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), leave) : leave,
          transform: reduce ? [] : [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
        },
      ]}
    >
      <View style={[styles.tail, styles[tail], colors]} />
      {phrase ? (
        <Text style={[styles.phrase, { color: t.colors.bubbleText, fontFamily: t.fonts.display }]} numberOfLines={1}>
          {emoteText(id, tr)}
        </Text>
      ) : (
        <Text style={styles.emoji}>{emoteText(id, tr)}</Text>
      )}
    </Animated.View>
  );
}

const TAIL = 12;

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    zIndex: 30,
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  tail: { position: 'absolute', width: TAIL, height: TAIL, borderWidth: 2, transform: [{ rotate: '45deg' }] },
  // Each tail hides the two sides that would cross the bubble's own border.
  top: { top: -TAIL / 2 - 1, alignSelf: 'center', borderRightWidth: 0, borderBottomWidth: 0 },
  bottom: { bottom: -TAIL / 2 - 1, start: 14, borderLeftWidth: 0, borderTopWidth: 0 },
  left: { left: -TAIL / 2 - 1, top: '50%', marginTop: -TAIL / 2, borderRightWidth: 0, borderTopWidth: 0 },
  right: { right: -TAIL / 2 - 1, top: '50%', marginTop: -TAIL / 2, borderLeftWidth: 0, borderBottomWidth: 0 },
  phrase: { fontSize: 16, lineHeight: 24, paddingHorizontal: 2 },
  emoji: { fontSize: 28, lineHeight: 36 },
});
