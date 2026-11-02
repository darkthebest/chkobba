import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { EMOJI_IDS, emoteName, emoteText, PHRASE_IDS, type EmoteId } from '@/emotes/catalog';
import { useEmotesContext } from '@/emotes/useEmotes';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

/** Picker order, which is also the keyboard order (1–9 send the first nine). */
export const PICKER_ORDER: readonly EmoteId[] = [...EMOJI_IDS, ...PHRASE_IDS];

/** Every emote, as a sheet over the bottom of the table. */
export function EmotePicker() {
  const emotes = useEmotesContext();
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  if (!emotes?.enabled || !emotes.pickerOpen) return null;

  const keys = Platform.OS === 'web';
  const tile = (id: EmoteId, wide: boolean) => {
    const n = PICKER_ORDER.indexOf(id) + 1;
    return (
      <Pressable
        key={id}
        onPress={() => emotes.send(id)}
        disabled={emotes.cooling}
        accessibilityRole="button"
        accessibilityLabel={tr('emotes.send', { emote: emoteName(id, tr) })}
        testID={`emote-pick-${id}`}
        style={[
          wide ? styles.phraseTile : styles.emojiTile,
          { backgroundColor: t.colors.segmentBg, borderColor: t.colors.segmentBorder, borderRadius: t.radii.option },
          emotes.cooling && styles.cooling,
        ]}
      >
        <Text
          style={wide ? [styles.phrase, { color: t.colors.segmentText, fontFamily: t.fonts.bodyBold }] : styles.emoji}
          numberOfLines={1}
        >
          {emoteText(id, tr)}
        </Text>
        {keys && n <= 9 ? <Text style={[styles.key, { color: t.colors.panelMuted }]}>{n}</Text> : null}
      </Pressable>
    );
  };

  return (
    <View style={StyleSheet.absoluteFill} testID="emote-picker">
      <Pressable style={StyleSheet.absoluteFill} onPress={() => emotes.setPickerOpen(false)} accessibilityLabel={tr('common.close')} />
      <Panel variant="sheet" style={styles.sheet}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]}>{tr('emotes.title')}</Text>
          <Text style={[styles.hint, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]} numberOfLines={1}>
            {keys ? tr('emotes.keyboardHint') : tr('emotes.hint')}
          </Text>
          <Pressable
            onPress={() => emotes.setPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={tr('common.close')}
            hitSlop={10}
            testID="emote-picker-close"
          >
            <Text style={[styles.close, { color: t.colors.panelMuted }]}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.grid}>{EMOJI_IDS.map((id) => tile(id, false))}</View>
        <View style={styles.grid}>{PHRASE_IDS.map((id) => tile(id, true))}</View>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 10, right: 10, bottom: 10, maxWidth: 460, alignSelf: 'center', gap: 8, zIndex: 40 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 18 },
  hint: { flex: 1, fontSize: 11 },
  close: { fontSize: 18, paddingHorizontal: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emojiTile: { width: '15%', flexGrow: 1, height: 46, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  phraseTile: { width: '31%', flexGrow: 1, height: 42, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  cooling: { opacity: 0.4 },
  emoji: { fontSize: 24, lineHeight: 30 },
  phrase: { fontSize: 13 },
  key: { position: 'absolute', top: 2, right: 5, fontSize: 9 },
});
