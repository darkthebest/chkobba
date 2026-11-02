import type { BotLevel } from '@chkobba/rules';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InviteBanner } from '@/components/friends/InviteBanner';
import { HowToPlay } from '@/components/lobby/HowToPlay';
import { JoinCodeSheet } from '@/components/lobby/JoinCodeSheet';
import { LobbyIcon } from '@/components/lobby/LobbyIcons';
import { LobbySheet } from '@/components/lobby/LobbySheet';
import { LobbyTile } from '@/components/lobby/LobbyTile';
import { NameForm, type NameFormError } from '@/components/lobby/NameForm';
import { PrivacySettings } from '@/components/lobby/PrivacySettings';
import { Segmented } from '@/components/Segmented';
import { SoundControls } from '@/components/SoundControls';
import { setEmotePrefs, useEmotePrefs } from '@/emotes/prefs';
import { LANGUAGE_CODES, LANGUAGES, useLanguage, useT, type LanguageCode } from '@/i18n';
import { useLayout } from '@/layout';
import { loadCachedProfile } from '@/online/profile';
import { getProfileBackend } from '@/online/services';
import { useSocial } from '@/online/socialContext';
import { SKINS, useSkin, type SkinId } from '@/skins';

type Mode = '4' | '2';
type Target = '21' | '11';
type Sheet = 'bots' | 'settings' | 'help' | 'joinCode' | null;

/**
 * The lobby. Playing against bots works offline; Quick match finds an online
 * table; Private table creates one to share by code, and "Join with code"
 * opens one. Friends opens the friends screen, with the incoming request
 * count on its tile. Ranking is shown now (marked "Soon") so the navigation is
 * in place when it arrives.
 */
export default function LobbyScreen() {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [mode, setMode] = useState<Mode>('4');
  const [target, setTarget] = useState<Target>('21');
  const [level, setLevel] = useState<BotLevel>('normal');
  const { skin, setSkin } = useSkin();
  const t = skin.tokens;
  const { Background, TableSurface, Avatar } = skin.components;
  const { desktop } = useLayout();
  const tr = useT();
  const { language, setLanguage } = useLanguage();
  // The saved display name, read from the local profile cache whenever the lobby comes back into view
  // (a name picked on the "Finding players" screen) and set directly by the Settings form.
  const [profileName, setProfileName] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadCachedProfile().then((cached) => {
        if (active && cached) setProfileName(cached.displayName);
      });
      return () => {
        active = false;
      };
    }, []),
  );
  const shownName = profileName ?? tr('lobby.guest');

  const social = useSocial();
  const { setActivity } = social;
  const { connected, incomingRequests } = social.state;
  // Back on the home screen the player is in the lobby (a no-op while disconnected).
  useFocusEffect(
    useCallback(() => {
      setActivity('lobby');
    }, [setActivity]),
  );

  const group = (label: string, control: ReactNode) => (
    <View>
      <View style={styles.groupHead}>
        <Text style={[styles.groupLabel, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }]}>{label}</Text>
      </View>
      {control}
    </View>
  );

  const header = (
    <View style={styles.header}>
      <Text style={[styles.brand, { color: t.colors.text, fontFamily: t.fonts.display }]}>
        Chkobba <Text style={{ color: t.colors.accent, fontFamily: t.fonts.arabic }}>شكبّة</Text>
      </Text>
      <View style={styles.headerRight}>
        <Pressable
          onPress={() => setSheet('help')}
          accessibilityRole="button"
          accessibilityLabel={tr('help.title')}
          testID="open-help"
          style={[styles.iconButton, { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg }]}
        >
          <LobbyIcon name="help" color={t.colors.text} size={20} />
        </Pressable>
        <Pressable
          onPress={() => setSheet('settings')}
          accessibilityRole="button"
          accessibilityLabel={tr('settings.title')}
          testID="open-settings"
          style={[styles.iconButton, { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg }]}
        >
          <LobbyIcon name="gear" color={t.colors.text} size={20} />
        </Pressable>
        <View style={[styles.profile, { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg }]}>
          <View>
            <Text style={[styles.profileName, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]} testID="profile-name">
              {shownName}
            </Text>
            <Text style={[styles.profileSub, { color: t.colors.textMuted, fontFamily: t.fonts.body }]} testID="profile-status">
              {connected ? tr('friends.availability.online') : tr('lobby.offline')}
            </Text>
          </View>
          <Avatar initial={shownName.charAt(0).toUpperCase()} side="us" isTurn={false} isDealer={false} size="sm" />
        </View>
      </View>
    </View>
  );

  const tiles = (
    <View style={styles.tiles}>
      <Text style={[styles.kicker, { color: t.colors.accent, fontFamily: t.fonts.bodyBold }]}>{tr('lobby.kicker')}</Text>
      <Text style={[styles.title, { color: t.colors.text, fontFamily: t.fonts.display }]}>{tr('lobby.title')}</Text>

      <LobbyTile
        primary
        icon="cards"
        title={tr('lobby.bots.title')}
        subtitle={tr('lobby.bots.subtitle')}
        onPress={() => setSheet('bots')}
        testID="tile-bots"
      />
      <LobbyTile
        primary
        icon="bolt"
        title={tr('lobby.quick.title')}
        subtitle={tr('lobby.quick.subtitle')}
        onPress={() => router.push('/finding')}
        testID="tile-quick"
      />
      <LobbyTile
        icon="plus"
        title={tr('lobby.private')}
        subtitle={tr('lobby.privateSubtitle')}
        onPress={() => router.push('/private')}
        testID="tile-private"
      />
      <LobbyTile
        icon="palette"
        title={tr('skins.title')}
        subtitle={tr('skins.subtitle')}
        onPress={() => router.push('/skins')}
        testID="tile-skins"
      />
      <Pressable
        onPress={() => setSheet('joinCode')}
        accessibilityRole="button"
        accessibilityLabel={tr('lobby.joinCode.entry')}
        testID="join-code-entry"
        hitSlop={8}
        style={({ pressed }) => [styles.joinEntry, pressed && styles.joinEntryPressed]}
      >
        <Text style={[styles.joinEntryText, { color: t.colors.accent, fontFamily: t.fonts.bodyBold }]}>
          {tr('lobby.joinCode.entry')}
        </Text>
      </Pressable>
      <View style={styles.row}>
        <LobbyTile
          icon="friends"
          title={tr('lobby.friends')}
          badge={incomingRequests}
          badgeLabel={tr('lobby.friendRequests', { count: incomingRequests })}
          onPress={() => router.push('/friends')}
          testID="tile-friends"
          style={styles.rowTile}
        />
        <LobbyTile
          icon="friends"
          title={tr('lobby.players')}
          subtitle={tr('lobby.playersSubtitle')}
          onPress={() => router.push('/players')}
          testID="tile-players"
          style={styles.rowTile}
        />
      </View>
    </View>
  );

  const openTables = (
    <View
      style={[styles.openTables, { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg }]}
      testID="open-tables"
    >
      <Text style={[styles.panelTitle, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>
        {tr('lobby.openTables')}
      </Text>
      <View style={styles.emptyState}>
        <LobbyIcon name="friends" color={t.colors.textMuted} size={36} />
        <Text style={[styles.emptyText, { color: t.colors.textMuted, fontFamily: t.fonts.body }]}>
          {tr('lobby.openTablesSoon')}
        </Text>
      </View>
    </View>
  );

  const body = (
    <View style={[styles.body, desktop && styles.bodyDesktop]}>
      {header}
      <InviteBanner />
      {desktop ? (
        <View style={styles.columns}>
          <View style={styles.leftColumn}>{tiles}</View>
          <View style={styles.rightColumn}>{openTables}</View>
        </View>
      ) : (
        <>
          {tiles}
          {openTables}
        </>
      )}
    </View>
  );

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={[styles.scroll, desktop && styles.scrollDesktop]}>
          {t.homeOnSurface ? <TableSurface style={styles.surface}>{body}</TableSurface> : body}
        </ScrollView>

        {sheet === 'bots' ? (
          <LobbySheet title={tr('lobby.bots.title')} onClose={() => setSheet(null)} testID="bots-sheet">
            {group(
              tr('bots.table'),
              <Segmented
                value={mode}
                onChange={setMode}
                testID="mode"
                options={[
                  { value: '4', label: tr('bots.twoVsTwo'), hint: tr('bots.twoVsTwoHint') },
                  { value: '2', label: tr('bots.oneVsOne'), hint: tr('bots.oneVsOneHint') },
                ]}
              />,
            )}
            {group(
              tr('bots.playTo'),
              <Segmented
                value={target}
                onChange={setTarget}
                testID="target"
                options={[
                  { value: '21', label: tr('bots.points', { count: 21 }), hint: tr('bots.classic') },
                  { value: '11', label: tr('bots.points', { count: 11 }), hint: tr('bots.quickGame') },
                ]}
              />,
            )}
            {group(
              tr('bots.level'),
              <Segmented<BotLevel>
                value={level}
                onChange={setLevel}
                testID="level"
                options={[
                  { value: 'easy', label: tr('bots.easy') },
                  { value: 'normal', label: tr('bots.normal') },
                  { value: 'hard', label: tr('bots.hard') },
                ]}
              />,
            )}
            <Pressable
              style={[styles.start, { backgroundColor: t.colors.accent, borderRadius: t.radii.button }]}
              accessibilityRole="button"
              testID="start"
              onPress={() => {
                setSheet(null);
                router.push({ pathname: '/game', params: { players: mode, target, level } });
              }}
            >
              <Text style={[styles.startText, { color: t.colors.onAccent, fontFamily: t.fonts.display }]}>
                {tr('bots.start')}
              </Text>
            </Pressable>
          </LobbySheet>
        ) : null}

        {sheet === 'joinCode' ? (
          <JoinCodeSheet
            onClose={() => setSheet(null)}
            onJoin={(code) => {
              setSheet(null);
              router.push({ pathname: '/t/[code]', params: { code } });
            }}
          />
        ) : null}

        {sheet === 'help' ? (
          <LobbySheet title={tr('help.title')} onClose={() => setSheet(null)} testID="help-sheet">
            <HowToPlay />
          </LobbySheet>
        ) : null}

        {sheet === 'settings' ? (
          <LobbySheet title={tr('settings.title')} onClose={() => setSheet(null)} testID="settings-sheet">
            {group(tr('settings.name'), <NameSettings onSaved={setProfileName} />)}
            {group(
              tr('settings.language'),
              <Segmented<LanguageCode>
                value={language}
                onChange={setLanguage}
                testID="language"
                options={LANGUAGE_CODES.map((code) => ({ value: code, label: LANGUAGES[code].nativeName }))}
              />,
            )}
            {group(
              tr('settings.tableStyle'),
              <Segmented<SkinId>
                value={skin.id}
                onChange={setSkin}
                testID="skin"
                options={SKINS.map((s) => ({ value: s.id, label: tr(`skins.${s.id}`) }))}
              />,
            )}
            {group(tr('settings.sound'), <SoundControls />)}
            {group(tr('privacy.rowLabel'), <PrivacySettings />)}
            {group(tr('settings.emotes'), <EmoteSettings />)}
          </LobbySheet>
        ) : null}
      </SafeAreaView>
    </Background>
  );
}

/** Show or hide the other players' emotes (ours always show). */
function EmoteSettings() {
  const tr = useT();
  const { mutedAll } = useEmotePrefs();
  return (
    <Segmented
      value={mutedAll ? 'off' : 'on'}
      onChange={(v) => setEmotePrefs({ mutedAll: v === 'off' })}
      testID="emotes"
      options={[
        { value: 'on', label: tr('settings.on') },
        { value: 'off', label: tr('settings.off') },
      ]}
    />
  );
}

/**
 * The Settings rename field. Mounts with the sheet and reads only the local
 * profile cache, so opening Settings never goes to the network; only Save does
 * (signing in first when there is no session or cache yet).
 */
function NameSettings({ onSaved }: { onSaved: (displayName: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [renameAvailableAt, setRenameAvailableAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [serverError, setServerError] = useState<NameFormError | null>(null);
  // The sheet can close while a read or a save is in flight.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void loadCachedProfile().then((cached) => {
      if (!mounted.current) return;
      if (cached) {
        setName(cached.displayName);
        setRenameAvailableAt(cached.renameAvailableAt);
      }
      setLoaded(true);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  const save = async (next: string) => {
    setBusy(true);
    setSaved(false);
    setServerError(null);
    const result = await getProfileBackend()
      .setDisplayName(next)
      .catch(() => ({ ok: false, reason: 'network' }) as const);
    // The header learns the new name even when the sheet closed during the save.
    if (result.ok) onSaved(result.profile.displayName);
    if (!mounted.current) return;
    if (result.ok) {
      setName(result.profile.displayName);
      setRenameAvailableAt(result.profile.renameAvailableAt);
      setSaved(true);
    } else {
      setServerError(result.reason);
      if (result.reason === 'name_rate_limited') {
        // The backend refreshed the cache with the server's cooldown.
        const cached = await loadCachedProfile();
        if (mounted.current && cached) setRenameAvailableAt(cached.renameAvailableAt);
      }
    }
    if (mounted.current) setBusy(false);
  };

  // NameForm keeps its own field state from `initialName`, so it mounts once the cache is read.
  if (!loaded) return null;
  return (
    <NameForm
      mode="save"
      initialName={name}
      renameAvailableAt={renameAvailableAt}
      onSubmit={save}
      busy={busy}
      saved={saved}
      serverError={serverError}
      testID="settings-name"
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, padding: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  scrollDesktop: { maxWidth: 1240, padding: 24 },
  surface: { flexGrow: 1 },
  body: { flexGrow: 1, padding: 12, gap: 18 },
  bodyDesktop: { padding: 32, gap: 28 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  brand: { fontSize: 22 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingStart: 14,
    paddingEnd: 4,
    paddingVertical: 3,
  },
  profileName: { fontSize: 13, textAlign: 'end' },
  profileSub: { fontSize: 10, textAlign: 'end' },
  columns: { flexDirection: 'row', gap: 32, flexGrow: 1 },
  leftColumn: { flex: 1.1 },
  rightColumn: { flex: 1 },
  tiles: { gap: 12 },
  kicker: { fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  title: { fontSize: 40, lineHeight: 46, marginBottom: 6 },
  joinEntry: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  joinEntryPressed: { opacity: 0.6 },
  joinEntryText: { fontSize: 15, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  rowTile: { flex: 1, minWidth: 0, flexDirection: 'column', alignItems: 'flex-start' },
  openTables: { flexGrow: 1, minHeight: 220, borderWidth: 1.5, borderRadius: 16, padding: 18 },
  panelTitle: { fontSize: 15 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 24 },
  emptyText: { fontSize: 13, textAlign: 'center', maxWidth: 280 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  groupLabel: { fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  start: { paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  startText: { fontSize: 20 },
});
