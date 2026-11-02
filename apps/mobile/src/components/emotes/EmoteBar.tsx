import type { Seat } from '@chkobba/rules';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { emoteName, emoteText, isPhrase } from '@/emotes/catalog';
import { useEmotesContext } from '@/emotes/useEmotes';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { EmoteBubble } from './EmoteBubble';

/** The quick row: the four most recently sent emotes, then "+" for the full picker. Dimmed during the cooldown. */
export function EmoteBar({ style }: { style?: StyleProp<ViewStyle> }) {
  const emotes = useEmotesContext();
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  if (!emotes?.enabled) return null;

  const button = { backgroundColor: t.colors.segmentBg, borderColor: t.colors.segmentBorder, borderRadius: t.radii.button };
  return (
    <View style={[styles.row, style]} testID="emote-bar">
      {emotes.quick.map((id) => (
        <Pressable
          key={id}
          onPress={() => emotes.send(id)}
          disabled={emotes.cooling}
          accessibilityRole="button"
          accessibilityLabel={tr('emotes.send', { emote: emoteName(id, tr) })}
          accessibilityState={{ disabled: emotes.cooling }}
          testID={`emote-quick-${id}`}
          style={[styles.button, button, emotes.cooling && styles.cooling]}
        >
          <Text
            style={isPhrase(id) ? [styles.phrase, { color: t.colors.segmentText, fontFamily: t.fonts.bodyBold }] : styles.emoji}
            numberOfLines={1}
          >
            {emoteText(id, tr)}
          </Text>
        </Pressable>
      ))}
      <Pressable
        onPress={() => emotes.setPickerOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={tr('emotes.more')}
        testID="emote-more"
        style={[styles.button, button]}
      >
        <Text style={[styles.plus, { color: t.colors.segmentText }]}>＋</Text>
      </Pressable>
    </View>
  );
}

/** Our own bubble: above our avatar in the phone "You" row, above the quick row on desktop. */
export function MyEmote({ seat, style }: { seat: Seat; style?: StyleProp<ViewStyle> }) {
  const emotes = useEmotesContext();
  const bubble = emotes?.bubbles.get(seat);
  if (!bubble) return null;
  return <EmoteBubble key={bubble.key} id={bubble.id} tail="bottom" style={[styles.mine, style]} testID={`emote-${seat}`} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  button: { height: 34, minWidth: 34, paddingHorizontal: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  cooling: { opacity: 0.4 },
  emoji: { fontSize: 17, lineHeight: 22 },
  phrase: { fontSize: 12 },
  plus: { fontSize: 16, lineHeight: 20 },
  mine: { bottom: '100%', start: -4, marginBottom: 8 },
});
