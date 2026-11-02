import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { useSkin } from '@/skins';
import { SuitIcon } from '@/skins/shared/SuitIcon';
import type { CardFaceProps } from '@/skins/types';

import { DeckPattern } from './DeckPattern';
import { faceColors, type DeckTheme } from './themes';

const FACE_SIZES = {
  md: { pad: 4, inset: 3, radius: 4, rank: 14, suit: 7, center: 20 },
  lg: { pad: 6, inset: 4, radius: 6, rank: 22, suit: 11, center: 34 },
} as const;

const RED_INK = '#b3261e';
const BLACK_INK = '#1d232b';

/** A deck skin's printed face: tinted paper, accent pattern, and the card's rank/suit. */
export function DeckCardFace({ deck, card, size }: { deck: DeckTheme } & CardFaceProps) {
  const { skin } = useSkin();
  const dims = FACE_SIZES[size];
  const ink = card.suit === 'D' || card.suit === 'H' ? RED_INK : BLACK_INK;
  const face = faceColors(deck);
  const radius = Math.max(2, skin.tokens.radii.card - 1);
  const isHaya = card.id === '7D';

  return (
    <View style={[styles.face, { borderRadius: radius }]} pointerEvents="none">
      <LinearGradient
        colors={[face.top, face.bottom, '#e6d8bd']}
        locations={[0, 0.78, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <DeckPattern
        id={`deck-${deck.id}-face`}
        pattern={deck.pattern}
        color={deck.accent}
        opacity={size === 'lg' ? 0.16 : 0.12}
      />
      <View
        style={[
          styles.inner,
          {
            top: dims.inset,
            right: dims.inset,
            bottom: dims.inset,
            left: dims.inset,
            borderRadius: dims.radius,
            borderColor: deck.accent,
          },
        ]}
      />
      {isHaya ? (
        <View
          style={[
            styles.inner,
            {
              top: dims.inset - 1,
              right: dims.inset - 1,
              bottom: dims.inset - 1,
              left: dims.inset - 1,
              borderRadius: dims.radius + 1,
              borderColor: deck.accent,
              borderWidth: 1.5,
            },
          ]}
        />
      ) : null}

      <View style={[styles.corner, { top: dims.pad, left: dims.pad }]}>
        <Text
          style={{
            fontSize: dims.rank,
            lineHeight: dims.rank,
            color: ink,
            fontFamily: skin.tokens.fonts.cardRank,
          }}
        >
          {card.rank}
        </Text>
        <SuitIcon suit={card.suit} size={dims.suit} color={ink} />
      </View>

      <View style={styles.center}>
        <SuitIcon suit={card.suit} size={dims.center} color={ink} />
      </View>

      <View style={[styles.corner, styles.cornerBottom, { bottom: dims.pad, right: dims.pad }]}>
        <Text
          style={{
            fontSize: dims.rank,
            lineHeight: dims.rank,
            color: ink,
            fontFamily: skin.tokens.fonts.cardRank,
          }}
        >
          {card.rank}
        </Text>
        <SuitIcon suit={card.suit} size={dims.suit} color={ink} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  face: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  inner: { position: 'absolute', borderWidth: 1, opacity: 0.42 },
  corner: { position: 'absolute', alignItems: 'center' },
  cornerBottom: { transform: [{ rotate: '180deg' }] },
  center: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
