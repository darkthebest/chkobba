import { cardValue, type Card, type PlayMove, type RulesConfig } from '@chkobba/rules';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { numberMoves } from '@/game/captureNumbers';
import { isRedSuit } from '@/game/format';
import { DirectionView, useT } from '@/i18n';
import { useSkin } from '@/skins';
import { SuitIcon } from '@/skins/shared/SuitIcon';

interface CaptureOptionsProps {
  moves: readonly PlayMove[];
  table: readonly Card[];
  rules: RulesConfig;
  onPlay: (move: PlayMove) => void;
}

/** Numbered choices for the selected card; the same numbers are stamped on the table cards. */
export function CaptureOptions({ moves, table, rules, onPlay }: CaptureOptionsProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const byId = new Map(table.map((c) => [c.id, c]));

  return (
    <View style={styles.list}>
      {numberMoves(moves).map(({ move, n: num }) => {
        const captured = move.capture.map((id) => byId.get(id)).filter((c): c is Card => c !== undefined);
        const isPlace = num === null;
        const n = num ?? 0;
        const sum = captured.reduce((s, c) => s + cardValue(c, rules), 0);
        return (
          <Pressable
            key={move.capture.join('+') || 'place'}
            onPress={() => onPlay(move)}
            accessibilityRole="button"
            accessibilityLabel={isPlace ? tr('capture.place') : tr('capture.takeCards', { cards: captured.map((c) => c.id).join(' + ') })}
            testID={isPlace ? 'option-place' : `option-${n}`}
            style={[styles.row, { backgroundColor: t.colors.optionBg, borderColor: t.colors.optionBorder, borderRadius: t.radii.option }]}
          >
            <View
              style={[
                styles.num,
                { backgroundColor: isPlace ? t.colors.chipBg : t.colors.badges[(n - 1) % t.colors.badges.length] },
              ]}
            >
              <Text style={[styles.numText, { color: isPlace ? t.colors.optionText : t.colors.badgeText, fontFamily: t.fonts.bodyBold }]}>
                {isPlace ? '+' : n}
              </Text>
            </View>
            {isPlace ? (
              <>
                <Text style={[styles.label, { color: t.colors.optionText, fontFamily: t.fonts.bodyBold }]}>{tr('capture.place')}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.label, { color: t.colors.optionText, fontFamily: t.fonts.body }]}>{tr('capture.take')}</Text>
                {/* Card chips read left to right in every language, like the cards themselves. */}
                <DirectionView dir="ltr" style={styles.chips}>
                  {captured.map((c, i) => (
                    <View key={c.id} style={styles.chipWrap}>
                      {i > 0 ? <Text style={[styles.plus, { color: t.colors.optionText }]}>+</Text> : null}
                      <View style={[styles.chip, { backgroundColor: t.colors.chipBg }]}>
                        <Text
                          style={[
                            styles.chipRank,
                            { fontFamily: t.fonts.cardRank, color: isRedSuit(c.suit) ? t.colors.suitRed : chipInk(t.colors.chipBg, t.colors.suitBlack) },
                          ]}
                        >
                          {c.rank}
                        </Text>
                        <SuitIcon
                          suit={c.suit}
                          size={11}
                          color={isRedSuit(c.suit) ? t.colors.suitRed : chipInk(t.colors.chipBg, t.colors.suitBlack)}
                        />
                      </View>
                    </View>
                  ))}
                </DirectionView>
                <Text style={[styles.sum, { color: t.colors.optionText, fontFamily: t.fonts.body }]}>= {sum}</Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Black suits vanish on dark chips; fall back to white there. */
function chipInk(chipBg: string, suitBlack: string): string {
  const hex = chipBg.replace('#', '');
  if (hex.length !== 6) return suitBlack;
  const lum = parseInt(hex.slice(0, 2), 16) * 0.299 + parseInt(hex.slice(2, 4), 16) * 0.587 + parseInt(hex.slice(4, 6), 16) * 0.114;
  return lum < 110 ? '#FFFFFF' : suitBlack;
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    paddingVertical: 6,
    paddingStart: 6,
    paddingEnd: 12,
    borderWidth: 1.5,
  },
  num: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  numText: { fontSize: 13 },
  label: { fontSize: 13 },
  chips: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 3, flexShrink: 1 },
  chipWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  plus: { fontSize: 13 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  chipRank: { fontSize: 14 },
  sum: { marginStart: 'auto', fontSize: 12, opacity: 0.85 },
});
