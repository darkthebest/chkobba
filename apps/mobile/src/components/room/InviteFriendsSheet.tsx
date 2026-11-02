import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import type { FriendEntry, FriendsBackend, InviteResult } from '@/online/friends';
import { inviteErrorMessage } from '@/online/messages';
import type { Availability } from '@/online/presence';
import type { ProfileBackend } from '@/online/profile';
import { getFriendsBackend, getProfileBackend } from '@/online/services';
import { useSocial } from '@/online/socialContext';
import { useSkin } from '@/skins';

import { FriendButton } from '../friends/FriendButton';
import { availabilityColor, nameInitial } from '../friends/FriendRow';
import { useNameGatedAction } from '../friends/useNameGatedAction';
import { LobbySheet } from '../lobby/LobbySheet';

type InviteFailure = Extract<InviteResult, { ok: false }>['reason'];

export interface InviteFriendsSheetProps {
  /** The room the invites are for. */
  roomCode: string;
  onClose: () => void;
  /** Injected in tests; defaults to the social provider's backend, then the shared one. */
  friends?: FriendsBackend;
  /** Injected in tests; defaults to the shared profile backend (for the name gate). */
  profile?: ProfileBackend;
}

/** Sort order: reachable friends first, offline last. */
const AVAILABILITY_ORDER: Record<Availability, number> = { online: 0, room: 1, playing: 2, offline: 3 };

export interface InviteCandidate {
  readonly userId: string;
  readonly displayName: string;
  readonly availability: Availability;
}

/** Mutual friends with their availability: online first, then in a room, in a game, offline; by name within each. */
export function sortCandidates(
  friends: readonly FriendEntry[],
  availability: { readonly [userId: string]: Availability },
): InviteCandidate[] {
  return friends
    .map((f) => ({ userId: f.userId, displayName: f.displayName, availability: availability[f.userId] ?? 'offline' }))
    .sort(
      (a, b) =>
        AVAILABILITY_ORDER[a.availability] - AVAILABILITY_ORDER[b.availability] || a.displayName.localeCompare(b.displayName),
    );
}

type Load = 'loading' | 'error' | readonly FriendEntry[];

/**
 * "Invite friends" from the private waiting room: every mutual friend with
 * their availability, each with Invite. Offline friends are listed too (the
 * invite is a persistent notification) but de-emphasized. The first invite
 * goes through the name gate, since it shows our name to the friend.
 */
export function InviteFriendsSheet({ roomCode, onClose, friends, profile }: InviteFriendsSheetProps) {
  // A Modal, like the player sheet, so it sits above the room's scroll view on every platform.
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <InviteFriendsBody roomCode={roomCode} onClose={onClose} friends={friends} profile={profile} />
    </Modal>
  );
}

function InviteFriendsBody({ roomCode, onClose, friends, profile: profileOption }: InviteFriendsSheetProps) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  const social = useSocial();
  const [backend] = useState<FriendsBackend>(() => friends ?? social.friends ?? getFriendsBackend());
  const [profile] = useState<ProfileBackend>(() => profileOption ?? getProfileBackend());
  const gate = useNameGatedAction(profile);
  const [load, setLoad] = useState<Load>('loading');
  // Per room code, so a new room never shows the last room's "Invited".
  const [invited, setInvited] = useState<{ readonly code: string; readonly ids: ReadonlySet<string> }>({
    code: roomCode,
    ids: new Set(),
  });
  const invitedIds = invited.code === roomCode ? invited.ids : new Set<string>();
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<{ readonly [userId: string]: InviteFailure }>({});

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The context value changes on every social update; read it through a ref.
  const socialRef = useRef(social);
  useEffect(() => {
    socialRef.current = social;
  });

  const fetchFriends = useCallback(() => {
    socialRef.current
      .ensureConnected()
      .catch(() => false)
      .then(() => backend.list())
      .then(
        (snapshot) => {
          if (mounted.current) setLoad(snapshot.friends);
        },
        () => {
          if (mounted.current) setLoad('error');
        },
      );
  }, [backend]);

  useEffect(fetchFriends, [fetchFriends]);
  const retry = () => {
    setLoad('loading');
    fetchFriends();
  };

  const send = useCallback(
    async (userId: string) => {
      setBusy((prev) => new Set(prev).add(userId));
      setErrors((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
      let result: InviteResult;
      try {
        result = await backend.invite(userId, roomCode);
      } catch {
        result = { ok: false, reason: 'network' };
      }
      if (!mounted.current) return;
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
      if (result.ok) {
        // `sent: false` means already invited recently: the friend has it, so it reads the same.
        setInvited((prev) => {
          const ids = new Set(prev.code === roomCode ? prev.ids : []);
          ids.add(userId);
          return { code: roomCode, ids };
        });
      } else {
        const { reason } = result;
        setErrors((prev) => ({ ...prev, [userId]: reason }));
      }
    },
    [backend, roomCode],
  );

  const invite = (userId: string) => gate.run(() => void send(userId));

  const body = () => {
    if (load === 'loading') {
      return (
        <View style={styles.loading} accessible accessibilityLabel={tr('friends.sheet.loading')} testID="invite-loading">
          <ActivityIndicator color={t.colors.accent} />
        </View>
      );
    }
    if (load === 'error') {
      return (
        <View style={styles.column}>
          <Text style={[styles.message, { color: t.colors.panelText, fontFamily: t.fonts.body }]} accessibilityRole="alert" testID="invite-load-error">
            {inviteErrorMessage('network', tr)}
          </Text>
          <FriendButton label={tr('common.tryAgain')} onPress={retry} testID="invite-retry" />
        </View>
      );
    }
    if (load.length === 0) {
      return (
        <Text style={[styles.message, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]} testID="invite-empty">
          {tr('invite.empty')}
        </Text>
      );
    }
    return sortCandidates(load, social.state.availability).map((friend) => (
      <InviteRow
        key={friend.userId}
        friend={friend}
        invited={invitedIds.has(friend.userId)}
        busy={busy.has(friend.userId)}
        error={errors[friend.userId] ?? null}
        onInvite={() => invite(friend.userId)}
      />
    ));
  };

  return (
    <>
      <LobbySheet title={tr('invite.sheetTitle')} onClose={onClose} testID="invite-sheet">
        {body()}
      </LobbySheet>
      {gate.sheet}
    </>
  );
}

interface InviteRowProps {
  friend: InviteCandidate;
  invited: boolean;
  busy: boolean;
  error: InviteFailure | null;
  onInvite: () => void;
}

function InviteRow({ friend, invited, busy, error, onInvite }: InviteRowProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Avatar } = skin.components;
  const tr = useT();
  const { userId, displayName, availability } = friend;
  const offline = availability === 'offline';
  const action = tr('invite.invite');

  return (
    <View style={styles.row} testID={`invite-row-${userId}`}>
      <View style={styles.main}>
        <View style={styles.identity}>
          {/* Offline friends are de-emphasized by a faded avatar and a muted name; text keeps its contrast. */}
          <View style={offline && styles.offline}>
            <Avatar initial={nameInitial(displayName)} side="us" isTurn={false} isDealer={false} size="sm" />
          </View>
          <View style={styles.text}>
            <Text
              style={[styles.name, { color: offline ? t.colors.panelMuted : t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
              numberOfLines={1}
            >
              {displayName}
            </Text>
            <View style={styles.availability}>
              <View style={[styles.dot, { backgroundColor: availabilityColor(availability, t.colors) }]} />
              <Text style={[styles.availabilityText, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
                {tr(`friends.availability.${availability}`)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          {invited ? (
            <FriendButton
              label={tr('invite.invited')}
              accessibilityLabel={tr('friends.actionFor', { action: tr('invite.invited'), name: displayName })}
              disabled
              onPress={() => {}}
              testID={`invite-sent-${userId}`}
            />
          ) : (
            <FriendButton
              label={action}
              accessibilityLabel={tr('friends.actionFor', { action, name: displayName })}
              tone="primary"
              disabled={busy}
              onPress={onInvite}
              testID={`invite-send-${userId}`}
            />
          )}
        </View>
      </View>
      <View accessibilityLiveRegion="polite">
        {error !== null ? (
          <Text
            style={[styles.error, { color: t.colors.warnText, backgroundColor: t.colors.warnBg, borderRadius: t.radii.button, fontFamily: t.fonts.body }]}
            accessibilityRole="alert"
            testID={`invite-error-${userId}`}
          >
            {inviteErrorMessage(error, tr)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 80, alignItems: 'center', justifyContent: 'center' },
  column: { gap: 10, alignItems: 'stretch' },
  message: { fontSize: 15, textAlign: 'center' },
  row: { gap: 6, paddingVertical: 6 },
  // Wraps the button under the name when the row is too narrow (phones, long names).
  main: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexGrow: 1, flexShrink: 1, minWidth: 160 },
  offline: { opacity: 0.6 },
  text: { flexShrink: 1, gap: 2 },
  name: { fontSize: 16 },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  availabilityText: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginStart: 'auto' },
  error: { fontSize: 13, paddingVertical: 6, paddingHorizontal: 10, overflow: 'hidden' },
});
