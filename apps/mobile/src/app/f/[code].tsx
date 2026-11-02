import { FRIEND_STATE, formatFriendCode, isFriendCode, normalizeFriendCode } from '@chkobba/protocol';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FriendButton, useFriendActions, type FriendRowAction, type FriendTarget } from '@/components/friends';
import { actionLabel, nameInitial, stateLabel } from '@/components/friends/FriendRow';
import { useFriendsController, type FriendsController } from '@/friends/useFriendsController';
import { DirectionView, useT } from '@/i18n';
import { friendErrorMessage } from '@/online/messages';
import { useSkin } from '@/skins';

type LinkParams = { code?: string | string[] };

const single = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');

/**
 * `/f/CODE`: a friend's share link. Looks the code up and previews the player
 * with Add friend (name-gated), or the current edge (Friends, Request sent,
 * Accept, Unblock), "This is your code" or "No player with this code". A
 * malformed code shows "not found" without asking the server. Viewing needs no
 * name; the controller connects the social socket on mount.
 */
export default function FriendLinkScreen() {
  const params = useLocalSearchParams<LinkParams>();
  const code = normalizeFriendCode(single(params.code));
  const valid = isFriendCode(code);
  const controller = useFriendsController();
  const actions = useFriendActions({ controller });
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Background, Panel } = skin.components;
  const tr = useT();
  const { lookupCode } = controller;

  useEffect(() => {
    if (valid) lookupCode(code);
  }, [valid, code, lookupCode]);

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll} testID="friend-link-screen">
          <Panel variant="sheet" style={styles.card}>
            <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]} accessibilityRole="header">
              {tr('friends.link.title')}
            </Text>
            {valid ? (
              // Codes are Latin letters and digits: they must never mirror under an RTL language.
              <DirectionView dir="ltr">
                <Text
                  style={[styles.code, { color: t.colors.panelMuted, fontFamily: t.fonts.numeric }]}
                  accessibilityLabel={code.split('').join(' ')}
                  testID="friend-link-code"
                >
                  {formatFriendCode(code)}
                </Text>
              </DirectionView>
            ) : null}

            <View accessibilityLiveRegion="polite">
              {valid ? (
                <Preview controller={controller} onRetry={() => lookupCode(code)} onAdd={actions.addFromLookup} onAction={actions.perform} />
              ) : (
                <Notice text={tr('friends.add.notFound')} warn testID="friend-link-not-found" />
              )}
            </View>

            <View style={styles.nav}>
              <FriendButton label={tr('friends.link.openFriends')} onPress={() => router.push('/friends')} grow testID="friend-link-open-friends" />
              <FriendButton label={tr('common.backToLobby')} onPress={() => router.replace('/')} grow testID="friend-link-home" />
            </View>
          </Panel>
        </ScrollView>
        {/* The name sheet is an absolute overlay: outside the scroll, over everything. */}
        {actions.sheet}
      </SafeAreaView>
    </Background>
  );
}

interface PreviewProps {
  controller: FriendsController;
  onRetry: () => void;
  onAdd: () => void;
  onAction: (action: FriendRowAction, target: FriendTarget) => void;
}

function Preview({ controller, onRetry, onAdd, onAction }: PreviewProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Avatar } = skin.components;
  const tr = useT();
  const { lookup } = controller;

  switch (lookup.status) {
    // `idle` only lasts until the mount effect starts the lookup.
    case 'idle':
    case 'checking':
      return (
        <View style={styles.checking} testID="friend-link-checking">
          <ActivityIndicator color={t.colors.accent} />
          <Text style={[styles.notice, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>{tr('friends.add.looking')}</Text>
        </View>
      );
    case 'self':
      return <Notice text={tr('friends.add.self')} testID="friend-link-self" />;
    case 'not_found':
    case 'bad_code':
      return <Notice text={tr('friends.add.notFound')} warn testID="friend-link-not-found" />;
    case 'error':
      return (
        <View style={styles.errorBox}>
          <Notice text={tr('friends.errors.network')} warn alert testID="friend-link-error" />
          <FriendButton label={tr('common.tryAgain')} onPress={onRetry} tone="primary" testID="friend-link-retry" />
        </View>
      );
    case 'found': {
      const target: FriendTarget = { userId: lookup.userId ?? '', displayName: lookup.displayName ?? '' };
      const busy = controller.pending.has(target.userId);
      const failure = controller.error !== null && controller.error.userId === target.userId ? controller.error.reason : null;
      return (
        <View style={styles.found} testID="friend-link-found">
          <View style={styles.identity}>
            <Avatar initial={nameInitial(target.displayName)} side="us" isTurn={false} isDealer={false} size="sm" />
            <Text
              style={[styles.name, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
              numberOfLines={1}
              testID="friend-link-name"
            >
              {target.displayName}
            </Text>
          </View>
          <FoundAction state={lookup.state ?? null} target={target} busy={busy} onAdd={onAdd} onAction={onAction} />
          {failure !== null ? <Notice text={friendErrorMessage(failure, tr)} warn alert testID="friend-link-action-error" /> : null}
        </View>
      );
    }
  }
}

interface FoundActionProps {
  state: FriendsController['lookup']['state'];
  target: FriendTarget;
  busy: boolean;
  onAdd: () => void;
  onAction: (action: FriendRowAction, target: FriendTarget) => void;
}

/** Add friend with no edge; Accept or Unblock when they apply; otherwise the edge's label. */
function FoundAction({ state, target, busy, onAdd, onAction }: FoundActionProps) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  const name = target.displayName;
  if (state === null || state === undefined) {
    return (
      <FriendButton
        label={tr('friends.add.submit')}
        accessibilityLabel={tr('friends.actionFor', { action: tr('friends.add.submit'), name })}
        onPress={onAdd}
        tone="primary"
        disabled={busy}
        testID="friend-link-add"
      />
    );
  }
  const action: FriendRowAction | null =
    state === FRIEND_STATE.REQUEST_RECEIVED ? 'accept' : state === FRIEND_STATE.BLOCKED ? 'unblock' : null;
  if (action !== null) {
    return (
      <FriendButton
        label={actionLabel(action, tr)}
        accessibilityLabel={tr('friends.actionFor', { action: actionLabel(action, tr), name })}
        onPress={() => onAction(action, target)}
        tone={action === 'accept' ? 'primary' : 'plain'}
        disabled={busy}
        testID={`friend-link-${action}`}
      />
    );
  }
  return (
    <Text style={[styles.stateLabel, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }]} testID="friend-link-state">
      {stateLabel(state, tr)}
    </Text>
  );
}

interface NoticeProps {
  text: string;
  warn?: boolean;
  /** Announce immediately (a failure), not just politely. */
  alert?: boolean;
  testID: string;
}

function Notice({ text, warn = false, alert = false, testID }: NoticeProps) {
  const t = useSkin().skin.tokens;
  return (
    <Text
      style={[
        styles.notice,
        warn
          ? [styles.warn, { backgroundColor: t.colors.warnBg, color: t.colors.warnText, borderRadius: t.radii.button }]
          : { color: t.colors.panelText },
        { fontFamily: warn ? t.fonts.bodyBold : t.fonts.body },
      ]}
      accessibilityRole={alert ? 'alert' : undefined}
      testID={testID}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16, width: '100%', maxWidth: 480, alignSelf: 'center' },
  card: { gap: 14, alignItems: 'stretch' },
  title: { fontSize: 26, textAlign: 'center' },
  code: { fontSize: 22, letterSpacing: 4, textAlign: 'center' },
  notice: { fontSize: 15, textAlign: 'center' },
  warn: { paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden' },
  checking: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  errorBox: { gap: 10, alignItems: 'center' },
  found: { gap: 10, alignItems: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, maxWidth: '100%' },
  name: { fontSize: 20, flexShrink: 1 },
  stateLabel: { fontSize: 15 },
  nav: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
