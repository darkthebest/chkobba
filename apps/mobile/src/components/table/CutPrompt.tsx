import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { TableController } from '@/game/useTableController';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { Card } from '../Card';

/** Shown to the cutter: keep the cut card (and get 2 more) or throw it face up on the table. */
export function CutPrompt({ c }: { c: TableController }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  const card = c.cutting?.card;
  if (!c.iAmCutting || !card) return null;

  const button = (label: string, keep: boolean, primary: boolean) => (
    <Pressable
      testID={keep ? 'cut-keep' : 'cut-throw'}
      accessibilityRole="button"
      onPress={() => c.cut(keep)}
      style={[
        styles.button,
        { borderRadius: t.radii.button, borderColor: primary ? t.colors.accent : t.colors.panelMuted },
        primary && { backgroundColor: t.colors.accent },
      ]}
    >
      <Text style={[styles.buttonText, { fontFamily: t.fonts.bodyBold, color: primary ? t.colors.onAccent : t.colors.panelText }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={[styles.overlay, { backgroundColor: t.colors.overlay }]} testID="cut-prompt">
      <Panel variant="sheet" style={styles.sheet}>
        <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]}>
          {tr('cut.title')}
        </Text>
        <View style={styles.card}>
          <Card card={card} size="lg" />
        </View>
        <Text style={[styles.hint, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
          {tr('cut.hint')}
        </Text>
        <View style={styles.actions}>
          {button(tr('cut.keep'), true, true)}
          {button(tr('cut.throw'), false, false)}
        </View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 12, zIndex: 8 },
  sheet: { width: '100%', maxWidth: 320, alignItems: 'center' },
  title: { fontSize: 22, textAlign: 'center' },
  card: { marginVertical: 12 },
  hint: { fontSize: 12, textAlign: 'center', marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  button: { flex: 1, paddingVertical: 11, alignItems: 'center', borderWidth: 2 },
  buttonText: { fontSize: 15 },
});
