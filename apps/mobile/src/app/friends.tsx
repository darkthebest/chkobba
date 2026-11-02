import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UnlistedCallout } from '@/components/directory/UnlistedCallout';
import { FindPlayersCard, FriendsSections, FriendButton, InviteBanner, useFriendActions } from '@/components/friends';
import { useFriendsController } from '@/friends/useFriendsController';
import { useT } from '@/i18n';
import { useLayout } from '@/layout';
import { useSkin } from '@/skins';

const exitToLobby = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * `/friends`: the ways into the directory and the friends lists (requests,
 * sent, friends, recent players, blocked). The controller connects the social
 * socket on mount. Phones stack everything in one scroll; desktop puts the
 * entry cards on the left and the lists on the right.
 *
 * The friend code card and the add-by-code form retired in v1 (ADR-0004): a
 * display name is the handle now, so "Find players" opens `/players`, which is
 * also where the lobby's Players tile goes. The legacy `/f/<code>` route still
 * resolves for links from shipped builds.
 */
export default function FriendsScreen() {
  const controller = useFriendsController();
  const actions = useFriendActions({ controller });
  const { desktop } = useLayout();
  const { Background } = useSkin().skin.components;
  const tr = useT();

  const findPlayers = (
    <View style={styles.entries}>
      <FindPlayersCard />
      {/* Persistent, no Dismiss: until a name is picked, nobody can find the player. */}
      <UnlistedCallout variant="friends" dismissible={false} />
      {/* The inline Blocked section stays as a summary; this is the surface that manages them. */}
      <FriendButton
        label={tr('friends.blocked.open')}
        onPress={() => router.push('/blocked')}
        grow
        testID="friends-blocked-open"
      />
    </View>
  );
  const sections = <FriendsSections controller={controller} onAction={actions.perform} />;

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={[styles.scroll, desktop && styles.scrollDesktop]} testID="friends-screen">
          <ScreenHeader />
          <InviteBanner />
          {desktop ? (
            <View style={styles.columns}>
              <View style={styles.leftColumn}>{findPlayers}</View>
              <View style={styles.rightColumn}>{sections}</View>
            </View>
          ) : (
            <View style={styles.stack}>
              {findPlayers}
              {sections}
            </View>
          )}
        </ScrollView>
        {/* Confirmations and the name sheet are absolute overlays: outside the scroll, over everything. */}
        {actions.sheet}
      </SafeAreaView>
    </Background>
  );
}

function ScreenHeader() {
  const t = useSkin().skin.tokens;
  const tr = useT();
  return (
    <View style={styles.header}>
      <Pressable
        onPress={exitToLobby}
        accessibilityRole="button"
        accessibilityLabel={tr('common.backToLobby')}
        testID="friends-back"
        style={({ pressed }) => [
          styles.back,
          { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.backText, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>{tr('common.back')}</Text>
      </Pressable>
      <Text style={[styles.title, { color: t.colors.text, fontFamily: t.fonts.display }]} accessibilityRole="header">
        {tr('friends.title')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  scrollDesktop: { maxWidth: 1240, padding: 32, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // 44 pt minimum touch target.
  back: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  backText: { fontSize: 15 },
  title: { fontSize: 32, flexShrink: 1 },
  stack: { gap: 16 },
  entries: { gap: 16 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  leftColumn: { flex: 1, gap: 16 },
  rightColumn: { flex: 1.4 },
});
