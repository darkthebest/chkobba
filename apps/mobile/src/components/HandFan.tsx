import type { Card as CardModel, CardId } from '@chkobba/rules';
import { StyleSheet, View } from 'react-native';

import { DirectionView } from '@/i18n';
import { useSkin } from '@/skins';

import { Card } from './Card';
import { DEAL_STAGGER_MS, MotionCard } from './MotionCard';
import { Shake } from './Shake';

interface HandFanProps {
  cards: readonly CardModel[];
  selectedId: CardId | null;
  enabled: boolean;
  onPress: (card: CardModel) => void;
  /** Hovered card id, or null when the pointer leaves (desktop). */
  onHover?: (id: CardId | null) => void;
  scale?: number;
  /** The card to shake after a move that cannot be played. */
  shake?: { id: CardId; seq: number } | null;
}

/** The player's hand as a slight fan in the thumb zone; the selected card lifts out. */
export function HandFan({ cards, selectedId, enabled, onPress, onHover, scale = 1, shake }: HandFanProps) {
  const { skin } = useSkin();
  const { hand, cardSizes } = skin.tokens;
  const lgHeight = cardSizes.lg.height;
  const mid = (cards.length - 1) / 2;

  return (
    // Cards keep their left-to-right order in every language, like the cards on the table.
    <DirectionView dir="ltr" style={[styles.fan, { height: (cardSizes.lg.height + hand.lift) * scale + 8 }]} testID="hand">
      {cards.map((card, i) => {
        const offset = i - mid;
        const selected = card.id === selectedId;
        return (
          // Outer view animates the deal; the inner view holds the fan pose, so the two transforms never fight.
          <MotionCard
            key={card.id}
            enterFrom="deck"
            delay={i * DEAL_STAGGER_MS}
            style={{ marginLeft: i === 0 ? 0 : -hand.overlap * scale, zIndex: selected ? 2 : 1 }}
          >
            <Shake trigger={shake?.id === card.id ? shake.seq : 0}>
              <View
                style={{
                  transform: selected
                    ? [{ scale: 1.04 }]
                    : [{ translateY: Math.abs(offset) * 4 * scale }, { rotate: `${offset * hand.angle}deg` }],
                }}
              >
                {/* A selected card lifts by growing its press area upwards, not by moving it: the area still
                    covers where the card was, so a quick second tap never lands beside it. */}
                <Card
                  card={card}
                  size="lg"
                  scale={scale}
                  highlighted={selected}
                  dimmed={!enabled}
                  onPress={() => onPress(card)}
                  onHoverChange={onHover ? (on) => onHover(on ? card.id : null) : undefined}
                  style={selected ? { height: (lgHeight + hand.lift) * scale } : undefined}
                />
              </View>
            </Shake>
          </MotionCard>
        );
      })}
    </DirectionView>
  );
}

const styles = StyleSheet.create({
  fan: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 4 },
});
