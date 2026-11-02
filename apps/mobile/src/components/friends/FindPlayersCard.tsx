import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LobbyIcon } from '@/components/lobby/LobbyIcons';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

/**
 * The Friends screen's way into the players directory, now that a friend code
 * is no longer shown or asked for. It is a secondary entry: the lobby's Players
 * tile is the primary one, and both open the same `/players` screen.
 *
 * A single Pressable rather than a card with a nested button, so the whole
 * surface is one accessible element and one touch target.
 */
export function FindPlayersCard() {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();

  return (
    <Pressable
      onPress={() => router.push('/players')}
      accessibilityRole="button"
      accessibilityLabel={tr('friends.findPlayers')}
      testID="friends-find-players"
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: t.colors.segmentBorder,
          backgroundColor: t.colors.segmentBg,
          borderRadius: t.radii.button,
        },
        pressed && styles.pressed,
      ]}
    >
      <LobbyIcon name="friends" color={t.colors.accent} size={26} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>
          {tr('friends.findPlayers')}
        </Text>
        <Text style={[styles.hint, { color: t.colors.textMuted, fontFamily: t.fonts.body }]}>
          {tr('friends.findPlayersHint')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 14,
    // 44 pt minimum touch target.
    minHeight: 44,
  },
  pressed: { opacity: 0.6 },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16 },
  hint: { fontSize: 13 },
});
