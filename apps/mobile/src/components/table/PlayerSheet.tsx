import { FRIEND_STATE, type FriendState } from '@chkobba/protocol';
import type { Seat } from '@chkobba/rules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { useEmotesContext } from '@/emotes/useEmotes';
import type { TableController } from '@/game/useTableController';
import { useT } from '@/i18n';
import type { FriendActionResult, FriendsBackend, FriendsSnapshot } from '@/online/friends';
import { friendErrorMessage } from '@/online/messages';
import { getFriendsBackend } from '@/online/services';
import { useSocial } from '@/online/socialContext';
import { useSkin } from '@/skins';

import { FriendButton } from '../friends/FriendButton';
import { useFriendActions, type FriendActionsOptions } from '../friends/useFriendActions';
import { LobbySheet } from '../lobby/LobbySheet';

/** Our edge with the player: a Nakama friend state, null for none, or still loading / failed. */
type Edge = FriendState | null | 'loading' | 'error';

/** The player's state in our friend list, or null when there is no edge. */
export function edgeOf(snapshot: FriendsSnapshot, userId: string): FriendState | null {
  const lists = [snapshot.friends, snapshot.outgoing, snapshot.incoming, snapshot.blocked];
  for (const list of lists) {
    const entry = list.find((e) => e.userId === userId);
    if (entry) return entry.state;
  }
  return null;
}

/**
 * Who the player sheet is about: another human's user id and name. `seat` is
 * set only at a game table, where the sheet also offers that seat's emote mute;
 * without it (the private waiting room) Block just blocks.
 */
export interface PlayerSheetViewTarget {
  readonly userId: string;
  readonly name: string;
  readonly seat?: Seat;
}

/**
 * The player sheet at an online table: another human's name, our friend state
 * with them (Add friend, Request sent, Friends, Accept), Block or Unblock, and
 * their emote mute. Open state lives in the controller (`c.playerSheet`).
 */
export function PlayerSheet({ c }: { c: TableController }) {
  return <PlayerSheetView target={c.playerSheet} onClose={c.closePlayerSheet} />;
}

/** The player sheet driven by props, for screens that keep the open state themselves (the private room). */
export function PlayerSheetView({ target, onClose }: { target: PlayerSheetViewTarget | null; onClose: () => void }) {
  if (!target) return null;
  // A Modal, like the table's sound sheet, so it sits above the table on every platform.
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      {/* Keyed by user, so a new occupant never sees the previous player's state. */}
      <PlayerSheetBody key={target.userId} target={target} onClose={onClose} />
    </Modal>
  );
}

function PlayerSheetBody({ target, onClose }: { target: PlayerSheetViewTarget; onClose: () => void }) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  const social = useSocial();
  // Emote mute needs a seat at a game table; elsewhere (the room) there is none.
  const tableEmotes = useEmotesContext();
  const emotes = target.seat === undefined ? null : tableEmotes;
  const [backend] = useState<FriendsBackend>(() => social.friends ?? getFriendsBackend());
  const [edge, setEdge] = useState<Edge>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedNow, setBlockedNow] = useState(false);
  const { seat, userId, name } = target;

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

  // Resolves into state only (the first render already shows loading), so it can run from an effect.
  const load = useCallback(() => {
    socialRef.current
      .ensureConnected()
      .catch(() => false)
      .then(() => backend.list())
      .then(
        (snapshot) => {
          if (mounted.current) setEdge(edgeOf(snapshot, userId));
        },
        () => {
          if (mounted.current) setEdge('error');
        },
      );
  }, [backend, userId]);

  useEffect(load, [load]);
  const retry = () => {
    setEdge('loading');
    load();
  };

  /** Runs one friend call, then applies `next` on success or shows the error. */
  const act = useCallback(
    async (call: () => Promise<FriendActionResult>, next: FriendState | null): Promise<FriendActionResult> => {
      setBusy(true);
      setError(null);
      let result: FriendActionResult;
      try {
        result = await call();
      } catch {
        result = { ok: false, reason: 'network' };
      }
      if (!mounted.current) return result;
      setBusy(false);
      if (result.ok) {
        setEdge(next);
        void socialRef.current.refreshFriends();
      } else {
        setError(friendErrorMessage(result.reason, tr));
      }
      return result;
    },
    [tr],
  );

  // Blocking also hides their emotes here, through the table's per-seat mute.
  const muteSeat = useCallback(() => {
    if (seat !== undefined && emotes?.enabled && !emotes.muted.has(seat)) emotes.toggleMute(seat);
    setBlockedNow(true);
  }, [emotes, seat]);

  const source = useMemo<FriendActionsOptions['controller']>(() => {
    const unused = () => Promise.resolve<FriendActionResult>({ ok: false, reason: 'not_found' });
    return {
      add: (id) => act(() => backend.add(id), FRIEND_STATE.REQUEST_SENT),
      accept: (id) => act(() => backend.add(id), FRIEND_STATE.FRIEND),
      block: async (id) => {
        const result = await act(() => backend.block(id), FRIEND_STATE.BLOCKED);
        if (result.ok && mounted.current) muteSeat();
        return result;
      },
      unblock: (id) => act(() => backend.remove(id), null),
      // The sheet never offers these (they live on the Friends screen).
      decline: unused,
      cancel: unused,
      remove: unused,
      addFromLookup: unused,
    };
  }, [act, backend, muteSeat]);
  const actions = useFriendActions({ controller: source });
  const friend = { userId, displayName: name };

  const status = (label: string, testID: string) => (
    <Text
      style={[styles.status, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold, borderColor: t.colors.panelMuted, borderRadius: t.radii.button }]}
      testID={testID}
    >
      {label}
    </Text>
  );

  const friendAction = () => {
    switch (edge) {
      case 'loading':
        return (
          <View style={styles.loading} accessible accessibilityLabel={tr('friends.sheet.loading')} testID="player-sheet-loading">
            <ActivityIndicator color={t.colors.accent} />
          </View>
        );
      case 'error':
        return (
          <>
            <Text style={[styles.body, { color: t.colors.panelText, fontFamily: t.fonts.body }]} accessibilityRole="alert" testID="player-sheet-load-error">
              {tr('friends.errors.network')}
            </Text>
            <FriendButton label={tr('common.tryAgain')} onPress={retry} testID="player-sheet-retry" />
          </>
        );
      case FRIEND_STATE.FRIEND:
        return status(tr('friends.sheet.friends'), 'player-sheet-friends');
      case FRIEND_STATE.REQUEST_SENT:
        return status(tr('friends.sheet.requestSent'), 'player-sheet-sent');
      case FRIEND_STATE.REQUEST_RECEIVED:
        return (
          <FriendButton
            label={tr('friends.sheet.accept')}
            onPress={() => actions.perform('accept', friend)}
            tone="primary"
            disabled={busy}
            testID="player-sheet-accept"
          />
        );
      case FRIEND_STATE.BLOCKED:
        // No friend action while blocked: Unblock first.
        return null;
      case null:
        return (
          <FriendButton
            label={tr('friends.sheet.add')}
            onPress={() => actions.perform('add', friend)}
            tone="primary"
            disabled={busy}
            testID="player-sheet-add"
          />
        );
    }
  };

  const blocked = edge === FRIEND_STATE.BLOCKED;
  const known = edge !== 'loading' && edge !== 'error';
  const muted = seat !== undefined && emotes?.muted.has(seat) === true;

  return (
    <>
      <LobbySheet title={tr('friends.sheet.title', { name })} onClose={onClose} testID="player-sheet">
        {friendAction()}
        {error !== null ? (
          <Text style={[styles.body, { color: t.colors.panelText, fontFamily: t.fonts.body }]} accessibilityRole="alert" testID="player-sheet-error">
            {error}
          </Text>
        ) : null}
        {known ? (
          blocked ? (
            <FriendButton
              label={tr('friends.sheet.unblock')}
              onPress={() => actions.perform('unblock', friend)}
              disabled={busy}
              testID="player-sheet-unblock"
            />
          ) : (
            <FriendButton
              label={tr('friends.sheet.block')}
              onPress={() => actions.perform('block', friend)}
              tone="danger"
              disabled={busy}
              testID="player-sheet-block"
            />
          )
        ) : null}
        {blockedNow && muted ? (
          <Text
            style={[styles.hint, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}
            accessibilityLiveRegion="polite"
            testID="player-sheet-muted"
          >
            {tr('friends.sheet.muted')}
          </Text>
        ) : null}
        {/* The seat tap opens this sheet instead of the emote menu, so mute lives here too. */}
        {emotes?.enabled && seat !== undefined ? (
          <FriendButton
            label={muted ? tr('emotes.unmute') : tr('emotes.mute')}
            onPress={() => emotes.toggleMute(seat)}
            testID="player-sheet-mute"
          />
        ) : null}
      </LobbySheet>
      {/* Block confirmation and the name gate, over the sheet. */}
      {actions.sheet}
    </>
  );
}

const styles = StyleSheet.create({
  loading: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  // Same height as the buttons, so the sheet does not jump when the state loads.
  status: { minHeight: 44, borderWidth: 2, textAlign: 'center', textAlignVertical: 'center', paddingVertical: 10, paddingHorizontal: 14, fontSize: 15 },
  body: { fontSize: 15, lineHeight: 22 },
  hint: { fontSize: 13, textAlign: 'center' },
});
