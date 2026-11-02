import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { useSkin } from '@/skins';

import { DeckPattern } from './DeckPattern';
import type { DeckTheme } from './themes';

/** A deck skin's back: the deck's palette and pattern with a Chkobba seven emblem. */
export function DeckCardBack({ deck, width, height }: { deck: DeckTheme; width: number; height: number }) {
  const { skin } = useSkin();
  const radius = Math.max(3, width * 0.14);
  const inset = Math.max(2, width * 0.09);
  const emblem = Math.max(10, width * 0.4);

  return (
    <View style={[styles.back, { width, height, borderRadius: radius, borderColor: deck.accent }]}>
      <LinearGradient
        colors={[deck.a, deck.b]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <DeckPattern id={`deck-${deck.id}-back`} pattern={deck.pattern} color={deck.accent} opacity={0.42} />
      <View
        style={[
          styles.inner,
          {
            top: inset,
            right: inset,
            bottom: inset,
            left: inset,
            borderRadius: Math.max(2, radius - 2),
            borderColor: deck.accent,
          },
        ]}
      />
      <View
        style={[
          styles.emblem,
          {
            width: emblem,
            height: emblem,
            borderColor: deck.accent,
            borderRadius: Math.max(2, emblem * 0.12),
          },
        ]}
      >
        <Text
          style={[
            styles.emblemText,
            {
              color: deck.accent,
              fontSize: emblem * 0.52,
              lineHeight: emblem * 0.58,
              fontFamily: skin.tokens.fonts.cardRank,
            },
          ]}
        >
          7
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { overflow: 'hidden', borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  inner: { position: 'absolute', borderWidth: 1, opacity: 0.55 },
  emblem: {
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  emblemText: { transform: [{ rotate: '-45deg' }] },
});
