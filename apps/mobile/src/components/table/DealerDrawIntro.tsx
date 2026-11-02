import { cardValue } from '@chkobba/rules';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TableController } from '@/game/useTableController';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { Card } from '../Card';

/** Game start: everyone's drawn card, the lowest one highlighted as the first dealer. Tap to skip. */
export function DealerDrawIntro({ c }: { c: TableController }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  if (!c.intro) return null;

  const { draws, dealer } = c.intro;
  const final = draws[draws.length - 1] ?? [];
  const name = (seat: number) => (seat === c.mySeat ? tr('common.you') : (c.players[seat]?.name ?? ''));

  return (
    <Pressable
      style={[styles.overlay, { backgroundColor: t.colors.overlay }]}
      onPress={c.dismissIntro}
      accessibilityRole="button"
      accessibilityLabel={tr('common.continue')}
      testID="dealer-draw"
    >
      <Panel variant="sheet" style={styles.sheet}>
        <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]}>
          {tr('dealerDraw.title')}
        </Text>
        <Text style={[styles.hint, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
          {tr('dealerDraw.hint')}
          {draws.length > 1 ? ` ${tr('dealerDraw.tiesAgain')}` : ''}
        </Text>
        <View style={styles.row}>
          {final.map((d) => (
            <View key={d.seat} style={styles.draw}>
              <Card card={d.card} size="md" highlighted={d.seat === dealer} dimmed={d.seat !== dealer} />
              <Text style={[styles.name, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}>{name(d.seat)}</Text>
              <Text style={[styles.value, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
                {cardValue(d.card, c.view.rules)}
              </Text>
            </View>
          ))}
        </View>
        <Text style={[styles.result, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}>
          {dealer === c.mySeat ? tr('dealerDraw.youDeal') : tr('dealerDraw.theyDeal', { name: name(dealer) })}
        </Text>
        <Text style={[styles.tap, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyItalic }]}>{tr('common.tapToContinue')}</Text>
      </Panel>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 30 },
  sheet: { width: '100%', maxWidth: 420, alignItems: 'center' },
  title: { fontSize: 24, textAlign: 'center' },
  hint: { fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 14 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' },
  draw: { alignItems: 'center', gap: 4 },
  name: { fontSize: 13 },
  value: { fontSize: 11 },
  result: { fontSize: 16, marginTop: 14 },
  tap: { fontSize: 11, marginTop: 4 },
});
