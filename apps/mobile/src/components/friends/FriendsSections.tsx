import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { FriendsController } from '@/friends/useFriendsController';
import { useT } from '@/i18n';
import type { Availability } from '@/online/presence';
import { useSkin } from '@/skins';

import { FriendButton } from './FriendButton';
import { FriendRow, type FriendRowAction, type FriendSection, type FriendTarget } from './FriendRow';

export type FriendsSectionsSource = Pick<
  FriendsController,
  'loading' | 'loadError' | 'reload' | 'incoming' | 'outgoing' | 'friends' | 'recent' | 'blocked' | 'pending' | 'error'
>;

export interface FriendsSectionsProps {
  controller: FriendsSectionsSource;
  /** Row buttons; see `useFriendActions` for the name gate and confirmations. */
  onAction: (action: FriendRowAction, target: FriendTarget) => void;
}

/**
 * The friends lists: Requests, Sent, Friends (online first, with availability),
 * Recent players and Blocked, each with a header and an empty state. While the
 * first load runs it shows a spinner; a failed load with nothing to show offers
 * Try again.
 */
export function FriendsSections({ controller, onAction }: FriendsSectionsProps) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  const { incoming, outgoing, friends, recent, blocked, pending, error } = controller;
  const empty = incoming.length + outgoing.length + friends.length + recent.length + blocked.length === 0;

  if (controller.loading && empty) {
    return (
      <View style={styles.status} testID="friends-loading">
        <ActivityIndicator color={t.colors.accent} size="large" accessibilityLabel={tr('friends.title')} />
      </View>
    );
  }
  if (controller.loadError !== null && empty) {
    return (
      <View style={styles.status} testID="friends-load-error">
        <Text style={[styles.statusText, { color: t.colors.text, fontFamily: t.fonts.body }]} accessibilityRole="alert">
          {tr('friends.errors.network')}
        </Text>
        <FriendButton label={tr('common.tryAgain')} onPress={controller.reload} tone="primary" testID="friends-retry" />
      </View>
    );
  }

  const renderRow = (section: FriendSection, entry: FriendTarget, availability?: Availability) => (
    <FriendRow
      key={entry.userId}
      section={section}
      target={{ userId: entry.userId, displayName: entry.displayName }}
      availability={availability}
      busy={pending.has(entry.userId)}
      error={error}
      onAction={onAction}
    />
  );

  return (
    <View style={styles.root} testID="friends-sections">
      <Section id="incoming" title={tr('friends.sections.incoming')} count={incoming.length} emptyText={tr('friends.empty.incoming')}>
        {incoming.map((entry) => renderRow('incoming', entry))}
      </Section>
      <Section id="outgoing" title={tr('friends.sections.outgoing')} count={outgoing.length} emptyText={tr('friends.empty.outgoing')}>
        {outgoing.map((entry) => renderRow('outgoing', entry))}
      </Section>
      <Section id="friends" title={tr('friends.sections.friends')} count={friends.length} emptyText={tr('friends.empty.friends')}>
        {friends.map((entry) => renderRow('friends', entry, entry.availability))}
      </Section>
      <Section id="recent" title={tr('friends.sections.recent')} count={recent.length} emptyText={tr('friends.empty.recent')}>
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
      </Section>
      <Section id="blocked" title={tr('friends.sections.blocked')} count={blocked.length} emptyText={tr('friends.empty.blocked')}>
        {blocked.map((entry) => renderRow('blocked', entry))}
      </Section>
    </View>
  );
}

interface SectionProps {
  id: FriendSection;
  title: string;
  count: number;
  emptyText: string;
  children: ReactNode;
}

function Section({ id, title, count, emptyText, children }: SectionProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  return (
    <Panel variant="sheet" style={styles.section}>
      <View style={styles.head}>
        <Text
          style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]}
          accessibilityRole="header"
          testID={`friends-section-${id}`}
        >
          {title}
        </Text>
        {count > 0 ? (
          <Text style={[styles.count, { color: t.colors.panelMuted, fontFamily: t.fonts.numeric }]} testID={`friends-count-${id}`}>
            {count}
          </Text>
        ) : null}
      </View>
      {count === 0 ? (
        <Text style={[styles.empty, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]} testID={`friends-empty-${id}`}>
          {emptyText}
        </Text>
      ) : (
        <View style={styles.rows}>{children}</View>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  status: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 32 },
  statusText: { fontSize: 15, textAlign: 'center' },
  section: { gap: 8, alignItems: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  title: { fontSize: 20, flexShrink: 1 },
  count: { fontSize: 15 },
  empty: { fontSize: 14 },
  rows: { gap: 2 },
});
