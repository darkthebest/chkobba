import { SEARCH_MAX_QUERY_INPUT } from '@chkobba/protocol';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PlayerListSkeleton } from '@/components/directory/PlayerListSkeleton';
import { PlayerRow } from '@/components/directory/PlayerRow';
import { UnlistedCallout } from '@/components/directory/UnlistedCallout';
import { FriendButton } from '@/components/friends/FriendButton';
import { FriendRow } from '@/components/friends/FriendRow';
import { useFriendActions, type FriendActions } from '@/components/friends/useFriendActions';
import { PlayerProfile } from '@/components/profile/PlayerProfile';
import { Segmented, type SegmentOption } from '@/components/Segmented';
import {
  useDirectoryController,
  type DirectoryController,
  type DirectorySearchState,
} from '@/directory/useDirectoryController';
import { useFriendsController, type FriendsController } from '@/friends/useFriendsController';
import { useLanguage, useT } from '@/i18n';
import { useLayout } from '@/layout';
import type { DirectoryError } from '@/online/directory';
import { directoryErrorMessage } from '@/online/messages';
import { useSkin } from '@/skins';

/** A row's Add/Accept/Block action; the screen's single gated handler. */
type FriendAction = FriendActions['perform'];

/** The `results` arm of the controller state, named for the sub-components. */
type ResultsState = Extract<DirectorySearchState, { readonly status: 'results' }>;

type DirectoryTab = 'players' | 'ranking';

type PlayersParams = { tab?: string | string[] };

/**
 * The URL is the source of truth for the tab. Any value that is not exactly
 * `ranking` (missing, unknown, repeated) falls back to Players, so a hand-typed
 * or stale deep link never throws or opens an empty screen.
 */
const directoryTab = (raw: string | string[] | undefined): DirectoryTab =>
  (Array.isArray(raw) ? raw[0] : raw) === 'ranking' ? 'ranking' : 'players';

const exitToLobby = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * `/players`: find players by name, then add them.
 *
 * One `useFriendsController` serves both the recent list and the directory's
 * relation chips (a second controller would give two optimistic edges and two
 * rollback paths). One `useFriendActions` at the root owns the name gate, so
 * every Add — from a search row or a recent row — goes through the same sheet
 * and the sheet is mounted once.
 *
 * The search field is a plain controlled input over `directory.setQuery`: the
 * controller owns the 2-character gate and the 300 ms debounce, so the screen
 * must not add a second timer or check. Each controller state has exactly one
 * render, and the body is a polite live region so a state change or new rows
 * are announced without stealing focus.
 *
 * The Players / Ranking switch lives in the URL (`?tab=`), so a deep link opens
 * the right tab. Ranking is a "Soon" placeholder: its body replaces the search
 * stack, but the controllers stay mounted at the root, so the query survives
 * switching back and forth.
 *
 * Phones stack everything in one column. From 900 px the tabs and the search
 * field move into a left column and the body into a wider right one; the header
 * and the unlisted callout stay above both. The body element is built once and
 * rendered in either branch, so crossing the breakpoint never remounts the
 * controllers and the body keeps its single polite live region.
 */
export default function PlayersScreen() {
  const friends = useFriendsController();
  const directory = useDirectoryController({ friends });
  const actions = useFriendActions({ controller: friends });
  const params = useLocalSearchParams<PlayersParams>();
  const tab = directoryTab(params.tab);
  const { desktop } = useLayout();
  const { Background } = useSkin().skin.components;
  // Which player the desktop panel shows. Selection lives here, next to the one
  // directory/friends state, so the panel is a view of this screen and never a
  // second list or a second fetch of the same results.
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Desktop fills the right panel; phone pushes the route, which is the only
  // way a phone sees a profile (there is no profile body duplicated here).
  const openProfile = (userId: string) => {
    if (desktop) setSelectedUserId(userId);
    else router.push({ pathname: '/p/[userId]', params: { userId } });
  };

  // Each element is built once and rendered in either branch. React elements are
  // descriptions, so both layouts share one directory body, one live region and
  // one search field rather than forking the render tree.
  // Ranking replaces the search and the results; both controllers stay mounted
  // above, so the query survives switching back and forth.
  const search = tab === 'players' ? <SearchField directory={directory} /> : null;
  const body =
    tab === 'players' ? (
      <DirectoryBody directory={directory} friends={friends} onAction={actions.perform} onOpen={openProfile} />
    ) : (
      <RankingPlaceholder />
    );

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        <ScrollView
          contentContainerStyle={[styles.scroll, desktop && styles.scrollDesktop]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          testID="players-screen"
        >
          <ScreenHeader />
          {/* Above the tabs and both columns at every width. */}
          <UnlistedCallout />
          {desktop ? (
            <View style={styles.columns}>
              <View style={styles.leftColumn}>
                <DirectoryTabs value={tab} />
                {search}
              </View>
              <View style={styles.rightColumn}>{body}</View>
              {/*
               * Phase 8: the profile panel is the third child of `styles.columns`.
               * It is the shared `PlayerProfile`, fed the row selected above, so
               * the desktop never forks the phone route's body. Later tasks pass
               * relation state down from the controllers this screen already owns.
               */}
              {selectedUserId !== null ? (
                <View style={styles.profileColumn} testID="directory-profile-panel">
                  <PlayerProfile userId={selectedUserId} />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.stack}>
              <DirectoryTabs value={tab} />
              {search}
              {body}
            </View>
          )}
        </ScrollView>
        {/* The name gate and confirmations: absolute overlays, outside the scroll, over everything. */}
        {actions.sheet}
      </SafeAreaView>
    </Background>
  );
}

/**
 * The Players / Ranking switch. The selected value comes from the route; a tap
 * writes it back with `setParams`, which updates the URL without adding a
 * history entry and never remounts the controllers.
 */
function DirectoryTabs({ value }: { readonly value: DirectoryTab }) {
  const tr = useT();
  const options: readonly SegmentOption<DirectoryTab>[] = [
    { value: 'players', label: tr('directory.tabs.players') },
    { value: 'ranking', label: tr('directory.tabs.ranking'), hint: tr('directory.tabs.rankingSoon') },
  ];
  return (
    <Segmented<DirectoryTab>
      value={value}
      onChange={(next) => router.setParams({ tab: next })}
      options={options}
      testID="directory-tabs"
    />
  );
}

/** The Ranking tab is a "Soon" placeholder: a short labelled panel, not an empty list. */
function RankingPlaceholder() {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  return (
    <View testID="directory-ranking">
      <Panel variant="sheet" style={styles.panel}>
        <Text
          style={[styles.panelTitle, { color: t.colors.panelText, fontFamily: t.fonts.display }]}
          accessibilityRole="header"
        >
          {tr('directory.tabs.ranking')}
        </Text>
        <Text
          style={[styles.statusText, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}
          testID="directory-ranking-placeholder"
        >
          {tr('directory.rankingPlaceholder')}
        </Text>
      </Panel>
    </View>
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
        testID="players-back"
        style={({ pressed }) => [
          styles.back,
          { borderColor: t.colors.segmentBorder, backgroundColor: t.colors.segmentBg },
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.backText, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>{tr('common.back')}</Text>
      </Pressable>
      <Text style={[styles.title, { color: t.colors.text, fontFamily: t.fonts.display }]} accessibilityRole="header">
        {tr('directory.title')}
      </Text>
    </View>
  );
}

/**
 * The one search field. It is deliberately dumb: value in, `setQuery` out.
 * The controller gates short queries (showing the hint state) and debounces
 * them, so the field never holds a timer or repeats that check. The keyboard
 * still shows a search key as a hint, but submit does not run a second search:
 * results already follow the typed value. No global key handler is added, so
 * typing here can never reach the table's web shortcuts.
 */
function SearchField({ directory }: { directory: DirectoryController }) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  // The app's one direction source (LanguageProvider). Only the alignment
  // mirrors: a Latin query stays left-to-right text, right-anchored under RTL.
  const { dir } = useLanguage();
  const [focused, setFocused] = useState(false);

  return (
    <TextInput
      value={directory.query}
      onChangeText={directory.setQuery}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      maxLength={SEARCH_MAX_QUERY_INPUT}
      placeholder={tr('directory.searchPlaceholder')}
      placeholderTextColor={t.colors.panelMuted}
      accessibilityLabel={tr('directory.searchPlaceholder')}
      accessibilityHint={tr('directory.minChars')}
      textContentType="name"
      autoComplete="off"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      returnKeyType="search"
      testID="directory-search"
      style={[
        styles.input,
        {
          borderRadius: t.radii.button,
          backgroundColor: t.colors.segmentBg,
          borderColor: focused ? t.colors.accent : t.colors.segmentBorder,
          color: t.colors.segmentText,
          fontFamily: t.fonts.body,
          // TextInput has no separate placeholder alignment: this also anchors
          // the placeholder, so the field reads correctly on both sides.
          textAlign: dir === 'rtl' ? 'right' : 'left',
        },
      ]}
    />
  );
}

interface DirectoryBodyProps {
  readonly directory: DirectoryController;
  readonly friends: FriendsController;
  readonly onAction: FriendAction;
  /** Opens a result's profile: the desktop panel here, the route on a phone. */
  readonly onOpen: (userId: string) => void;
}

/** One render per controller state; the live region carries the change. */
function DirectoryBody({ directory, friends, onAction, onOpen }: DirectoryBodyProps) {
  const tr = useT();
  const state = directory.state;

  let content: ReactNode = null;
  switch (state.status) {
    case 'idle':
      content = <RecentPlayers friends={friends} onAction={onAction} />;
      break;
    case 'hint':
      content = <StatusMessage text={tr('directory.minChars')} testID="directory-hint" />;
      break;
    case 'loading':
      // A skeleton, not an empty list and not a spinner over stale rows.
      content = <PlayerListSkeleton />;
      break;
    case 'empty':
      content = <NoResults directory={directory} />;
      break;
    case 'error':
      content = <SearchError directory={directory} reason={state.reason} />;
      break;
    case 'results':
      content = <Results directory={directory} state={state} onAction={onAction} onOpen={onOpen} />;
      break;
  }

  return (
    <View accessibilityLiveRegion="polite" testID="directory-state">
      {content}
    </View>
  );
}

/**
 * The empty-query state: recent players from the one friends controller. The
 * controller's own first load can be in flight or have failed, so it is
 * rendered honestly too rather than showing the "no recent players" copy while
 * the list is unknown.
 */
function RecentPlayers({ friends, onAction }: { readonly friends: FriendsController; readonly onAction: FriendAction }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  const { recent, loading, loadError, reload, pending, error } = friends;
  const empty = recent.length === 0;

  return (
    <View testID="directory-recent">
      <Panel variant="sheet" style={styles.panel}>
        <Text style={[styles.panelTitle, { color: t.colors.panelText, fontFamily: t.fonts.display }]} accessibilityRole="header">
          {tr('directory.recentPlayers')}
        </Text>
        {empty && loading ? <PlayerListSkeleton /> : null}
        {empty && !loading && loadError !== null ? (
          <View style={styles.status}>
            <Text
              style={[styles.statusText, { color: t.colors.panelText, fontFamily: t.fonts.body }]}
              accessibilityRole="alert"
              testID="directory-recent-error"
            >
              {tr('friends.errors.network')}
            </Text>
            <FriendButton label={tr('common.tryAgain')} onPress={reload} tone="primary" testID="directory-recent-retry" />
          </View>
        ) : null}
        {empty && !loading && loadError === null ? (
          <Text
            style={[styles.emptyText, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}
            testID="directory-recent-empty"
          >
            {tr('friends.empty.recent')}
          </Text>
        ) : null}
        {recent.map((player) => (
          <FriendRow
            key={player.userId}
            section="recent"
            target={{ userId: player.userId, displayName: player.displayName }}
            state={player.state}
            busy={pending.has(player.userId)}
            error={error}
            onAction={onAction}
          />
        ))}
      </Panel>
    </View>
  );
}

function NoResults({ directory }: { readonly directory: DirectoryController }) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  return (
    <View style={styles.status} testID="directory-empty">
      <Text style={[styles.statusTitle, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>{tr('directory.noResults')}</Text>
      <Text style={[styles.statusText, { color: t.colors.textMuted, fontFamily: t.fonts.body }]}>{tr('directory.noResultsHint')}</Text>
      {/* Clearing the query returns to the idle/recent state; it is not a re-search. */}
      <FriendButton
        label={tr('directory.showRecent')}
        onPress={() => directory.setQuery('')}
        tone="plain"
        testID="directory-show-recent"
      />
    </View>
  );
}

function SearchError({ directory, reason }: { readonly directory: DirectoryController; readonly reason: DirectoryError }) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  return (
    <View style={styles.status} testID="directory-error">
      <Text
        style={[styles.statusText, { color: t.colors.text, fontFamily: t.fonts.body }]}
        accessibilityRole="alert"
        testID="directory-error-text"
      >
        {directoryErrorMessage(reason, tr)}
      </Text>
      <FriendButton label={tr('common.tryAgain')} onPress={directory.retry} tone="primary" testID="directory-retry" />
    </View>
  );
}

interface ResultsProps {
  readonly directory: DirectoryController;
  readonly state: ResultsState;
  readonly onAction: FriendAction;
  readonly onOpen: (userId: string) => void;
}

function Results({ directory, state, onAction, onOpen }: ResultsProps) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  return (
    <View style={styles.results} testID="directory-results">
      {/*
        Rows on screen, not matches: a cursor may still have more to load. It
        sits inside the body's polite live region, so a new page announces a
        concise count before the rows.
      */}
      <Text
        style={[styles.resultsCount, { color: t.colors.textMuted, fontFamily: t.fonts.body }]}
        testID="directory-results-count"
      >
        {tr('directory.resultsCount', { count: state.players.length })}
      </Text>
      <View style={styles.rows}>
        {state.players.map((player) => (
          // A sibling control, not a pressable wrapper: the row already owns an
          // Add button, and nesting buttons would make one announcement or tap
          // reach both. The label comes from the existing `profile.title` key.
          <View key={player.userId} style={styles.resultRow}>
            <View style={styles.resultMain}>
              <PlayerRow
                player={player}
                relation={directory.relationOf(player.userId)}
                pending={directory.pendingOf(player.userId)}
                availability={directory.availabilityOf(player.userId)}
                // Add is name-gated: this is the root action handler, never the controller's direct add.
                onAdd={() => onAction('add', { userId: player.userId, displayName: player.name })}
              />
            </View>
            <FriendButton
              label={tr('profile.title')}
              accessibilityLabel={tr('friends.actionFor', { action: tr('profile.title'), name: player.name })}
              onPress={() => onOpen(player.userId)}
              tone="plain"
              testID={`directory-open-${player.userId}`}
            />
          </View>
        ))}
      </View>
      {state.capped ? (
        <Text style={[styles.capped, { color: t.colors.textMuted, fontFamily: t.fonts.body }]} testID="directory-capped">
          {tr('directory.moreResults')}
        </Text>
      ) : null}
      <Paging directory={directory} state={state} />
    </View>
  );
}

/**
 * The next page. A paging failure must not erase what is already on screen, so
 * it renders under the rows and its retry calls `loadMore()` again. `capped`
 * and a non-null cursor are disjoint (the server hands out no cursor once the
 * cap stopped the query), so the cap copy and this control never compete.
 */
function Paging({ directory, state }: { readonly directory: DirectoryController; readonly state: ResultsState }) {
  const t = useSkin().skin.tokens;
  const tr = useT();

  if (state.paging.status === 'error') {
    return (
      <View style={styles.paging} testID="directory-paging-error">
        <Text
          style={[styles.statusText, { color: t.colors.text, fontFamily: t.fonts.body }]}
          accessibilityRole="alert"
        >
          {directoryErrorMessage(state.paging.reason, tr)}
        </Text>
        <FriendButton label={tr('common.tryAgain')} onPress={directory.loadMore} tone="plain" testID="directory-paging-retry" />
      </View>
    );
  }

  if (state.nextCursor === null) return null;
  return (
    <View style={styles.paging}>
      <FriendButton
        label={tr('directory.loadMore')}
        onPress={directory.loadMore}
        tone="plain"
        disabled={state.paging.status === 'loading'}
        testID="directory-load-more"
      />
    </View>
  );
}

function StatusMessage({ text, testID }: { readonly text: string; readonly testID: string }) {
  const t = useSkin().skin.tokens;
  return (
    <Text style={[styles.statusText, { color: t.colors.textMuted, fontFamily: t.fonts.body }]} testID={testID}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // The phone column; the desktop variant widens the same outer scroll.
  scroll: { flexGrow: 1, padding: 16, gap: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  scrollDesktop: { maxWidth: 1240, padding: 32, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // 44 pt minimum touch target.
  back: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.6 },
  backText: { fontSize: 15 },
  title: { fontSize: 32, flexShrink: 1 },
  stack: { gap: 16 },
  // Same ratios as `friends.tsx`: the list of results gets the wider side.
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  leftColumn: { flex: 1, gap: 16 },
  rightColumn: { flex: 1.4 },
  // The Phase 8 profile panel: a third column that appears only once a row is selected.
  profileColumn: { flex: 1 },
  input: { borderWidth: 2, paddingVertical: 12, paddingHorizontal: 16, fontSize: 17 },
  panel: { gap: 8, alignItems: 'stretch' },
  panelTitle: { fontSize: 20, flexShrink: 1 },
  results: { gap: 12 },
  resultsCount: { fontSize: 13 },
  rows: { gap: 2 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resultMain: { flexGrow: 1, flexShrink: 1 },
  status: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 24 },
  statusTitle: { fontSize: 18, textAlign: 'center' },
  statusText: { fontSize: 15, textAlign: 'center' },
  emptyText: { fontSize: 14 },
  capped: { fontSize: 13 },
  paging: { alignItems: 'center', gap: 8, paddingVertical: 8 },
});
