import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerProfile } from '@/components/profile/PlayerProfile';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

/** A repeated query/dynamic param arrives as an array; anything that is not one string is unusable. */
const single = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');

/** A deep link has no history: fall back to the directory, where profiles are opened from. */
const exitProfile = () => (router.canGoBack() ? router.back() : router.replace('/players'));

/**
 * `/p/[userId]`: one player's profile on a phone, and a desktop deep link.
 *
 * The route owns only the screen chrome — background, safe area, scroll and the
 * back affordance. The body is the shared `PlayerProfile`, the same component
 * the desktop `/players` panel renders, so the two surfaces cannot drift. There
 * is deliberately no second profile body here.
 *
 * Dynamic params are not typed by expo-router, so the id is read as the
 * possibly-array value it really is and normalised before use. An empty id
 * renders the component's not-found state without asking the server.
 */
export default function PlayerProfileScreen() {
  const params = useLocalSearchParams();
  const userId = single(params.userId);
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Background } = skin.components;
  const tr = useT();

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll} testID="profile-screen">
          <View style={styles.header}>
            <Pressable
              onPress={exitProfile}
              accessibilityRole="button"
              accessibilityLabel={tr('common.back')}
              testID="profile-back"
              style={({ pressed }) => [
                styles.back,
                { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.backText, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>
                {tr('common.back')}
              </Text>
            </Pressable>
          </View>
          <PlayerProfile userId={userId} />
        </ScrollView>
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // 44 pt minimum touch target.
  back: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
  backText: { fontSize: 15 },
});
