import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FriendRow } from '@/components/friends/FriendRow';
import { useFriendsController } from '@/friends/useFriendsController';
import { useT } from '@/i18n';
import { useLayout } from '@/layout';
import { useSkin } from '@/skins';

const exitToFriends = () => (router.canGoBack() ? router.back() : router.replace('/friends'));

/**
 * `/blocked`: every player you blocked, with Unblock on each row.
 *
 * The friends screen keeps its inline Blocked section as a summary; this screen
 * is the place to manage them once that list grows. Both read the same friends
 * snapshot and the same controller, so an Unblock here updates the inline
 * section, the directory's relation chips and recent players without a reload:
 * the controller owns the one snapshot and applies the edge change optimistically.
 *
 * The controller connects the social socket on mount, exactly as `/friends`
 * does, so a deep link works on its own.
 */
export default function BlockedScreen() {
  const controller = useFriendsController();
  const { desktop } = useLayout();
  const { skin } = useSkin();
  const { Background, Panel } = skin.components;
  const t = skin.tokens;
  const tr = useT();
  const { blocked, pending, error } = controller;

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        <ScrollView
          contentContainerStyle={[styles.scroll, desktop && styles.scrollDesktop]}
          testID="blocked-screen"
        >
          <View style={styles.header}>
            <Pressable
              onPress={exitToFriends}
              accessibilityRole="button"
              accessibilityLabel={tr('common.back')}
              testID="blocked-back"
              style={({ pressed }) => [
                styles.back,
                { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.backText, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>{tr('common.back')}</Text>
            </Pressable>
            <Text style={[styles.title, { color: t.colors.text, fontFamily: t.fonts.display }]} accessibilityRole="header">
              {tr('friends.blocked.title')}
            </Text>
          </View>

          <Panel variant="sheet" style={styles.section}>
            {blocked.length === 0 ? (
              <Text style={[styles.empty, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]} testID="blocked-empty">
                {tr('friends.blocked.empty')}
              </Text>
            ) : (
              // The rows are the same component the friends lists use, so Block
              // and Unblock read and behave identically on both surfaces.
              <View style={styles.rows}>
                {blocked.map((entry) => (
                  <FriendRow
                    key={entry.userId}
                    section="blocked"
                    target={{ userId: entry.userId, displayName: entry.displayName }}
                    busy={pending.has(entry.userId)}
                    error={error}
                    onAction={(action, target) => {
                      if (action === 'unblock') void controller.unblock(target.userId);
                    }}
                  />
                ))}
              </View>
            )}
          </Panel>
        </ScrollView>
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  scrollDesktop: { maxWidth: 720, padding: 32, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // 44 pt minimum touch target.
  back: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  backText: { fontSize: 15 },
  title: { fontSize: 32, flexShrink: 1 },
  section: { gap: 8, alignItems: 'stretch' },
  rows: { gap: 2 },
  empty: { fontSize: 14 },
});
