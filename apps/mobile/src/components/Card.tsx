import type { Card as CardModel } from '@chkobba/rules';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { DeckCardFace, useDeck } from '@/decks';
import { DirectionView, useT } from '@/i18n';
import { useSkin } from '@/skins';
import type { CardSize } from '@/skins/types';

interface CardProps {
  card: CardModel;
  size: CardSize;
  highlighted?: boolean;
  dimmed?: boolean;
  /** Capture-option numbers this card belongs to. */
  badges?: readonly number[];
  /** Small label under the card, e.g. who placed it. */
  tag?: string;
  /** Dashed outline marking the most recently placed card. */
  lastPlayed?: boolean;
  /** Draws the card larger without changing the skin's card metrics (desktop). */
  scale?: number;
  onPress?: () => void;
  /** Pointer hover (web/desktop). */
  onHoverChange?: (hovered: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

/** Card frame shared by every skin; the skin's CardFace draws what is printed on it. */
export function Card({
  card,
  size,
  highlighted,
  dimmed,
  badges,
  tag,
  lastPlayed,
  scale = 1,
  onPress,
  onHoverChange,
  style,
}: CardProps) {
  const { skin } = useSkin();
  const { deck } = useDeck();
  const tr = useT();
  const t = skin.tokens;
  const { CardFace } = skin.components;
  const { width, height } = t.cardSizes[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress && !onHoverChange}
      onHoverIn={onHoverChange ? () => onHoverChange(true) : undefined}
      onHoverOut={onHoverChange ? () => onHoverChange(false) : undefined}
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={tr('card.label', { rank: card.rank, suit: tr(`suits.${card.suit}`) })}
      testID={`card-${card.id}`}
      style={[{ width: width * scale, height: height * scale }, style]}
    >
      {/* Card faces never mirror, whatever the language direction. */}
      <DirectionView
        dir="ltr"
        style={[
          styles.card,
          {
            width,
            height,
            transformOrigin: 'top left',
            transform: scale === 1 ? undefined : [{ scale }],
            borderRadius: t.radii.card,
            backgroundColor: t.colors.cardFace,
            borderColor: deck ? deck.accent : t.colors.cardBorder,
          },
          highlighted && {
            borderColor: t.colors.highlight,
            borderWidth: 2.5,
            shadowColor: t.colors.highlight,
            shadowOpacity: 0.8,
            shadowRadius: 10,
          },
          dimmed && styles.dimmed,
        ]}
      >
        {deck ? <DeckCardFace deck={deck} card={card} size={size} /> : <CardFace card={card} size={size} />}
        {lastPlayed ? (
          <View
            pointerEvents="none"
            style={[styles.last, { borderRadius: t.radii.card + 3, borderColor: t.colors.highlight }]}
          />
        ) : null}
        {(badges ?? []).map((n, i) => (
          <View
            key={n}
            testID={`badge-${card.id}-${n}`}
            style={[
              styles.badge,
              { right: -8 + i * 20, backgroundColor: t.colors.badges[(n - 1) % t.colors.badges.length] },
            ]}
          >
            <Text style={[styles.badgeText, { color: t.colors.badgeText, fontFamily: t.fonts.bodyBold }]}>{n}</Text>
          </View>
        ))}
        {tag ? (
          <View style={[styles.tag, { backgroundColor: t.colors.tagBg }]} pointerEvents="none">
            <Text style={[styles.tagText, { color: t.colors.tagText, fontFamily: t.fonts.bodyBold }]} numberOfLines={1}>
              {tag}
            </Text>
          </View>
        ) : null}
      </DirectionView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  dimmed: { opacity: 0.42 },
  last: { position: 'absolute', left: -4, right: -4, top: -4, bottom: -4, borderWidth: 1.5, borderStyle: 'dashed' },
  badge: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.35)',
    zIndex: 3,
  },
  badgeText: { fontSize: 11 },
  tag: {
    position: 'absolute',
    bottom: -9,
    alignSelf: 'center',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    zIndex: 3,
  },
  tagText: { fontSize: 9 },
});
