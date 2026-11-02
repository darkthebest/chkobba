import { FRIEND_STATE, type FriendState } from '@chkobba/protocol';
import { StyleSheet, Text, View } from 'react-native';

import type { FriendActionFailure } from '@/friends/useFriendsController';
import { useT, type TFunction } from '@/i18n';
import { friendErrorMessage } from '@/online/messages';
import type { Availability } from '@/online/presence';
import { useSkin } from '@/skins';
import type { SkinTokens } from '@/skins/types';

import { FriendButton } from './FriendButton';

/** Which list a row sits in; it decides the row's actions. */
export type FriendSection = 'incoming' | 'outgoing' | 'friends' | 'recent' | 'blocked';

export type FriendRowAction = 'accept' | 'decline' | 'cancel' | 'add' | 'remove' | 'block' | 'unblock';

/** The player a row (or a lookup preview) is about. */
export interface FriendTarget {
  readonly userId: string;
  readonly displayName: string;
}

export interface FriendRowProps {
  section: FriendSection;
  target: FriendTarget;
  /** Friends section only: shown as a coloured dot plus its label. */
  availability?: Availability;
  /** Recent section only: the current edge with this player (null = none). */
  state?: FriendState | null;
  /** An action for this player is in flight: every button is disabled. */
  busy: boolean;
  /** The last failed action, shown only when it is about this player. */
  error: FriendActionFailure | null;
  onAction: (action: FriendRowAction, target: FriendTarget) => void;
}

interface RowButton {
  readonly action: FriendRowAction;
  readonly tone: 'primary' | 'plain' | 'danger';
}

const ACCEPT: RowButton = { action: 'accept', tone: 'primary' };
const ADD: RowButton = { action: 'add', tone: 'primary' };
const DECLINE: RowButton = { action: 'decline', tone: 'plain' };
const CANCEL: RowButton = { action: 'cancel', tone: 'plain' };
const REMOVE: RowButton = { action: 'remove', tone: 'plain' };
const BLOCK: RowButton = { action: 'block', tone: 'danger' };
const UNBLOCK: RowButton = { action: 'unblock', tone: 'plain' };

/** Buttons per section; recent rows depend on the current edge. */
function rowButtons(section: FriendSection, state: FriendState | null): readonly RowButton[] {
  switch (section) {
    case 'incoming':
      return [ACCEPT, DECLINE, BLOCK];
    case 'outgoing':
      return [CANCEL];
    case 'friends':
      return [REMOVE, BLOCK];
    case 'blocked':
      return [UNBLOCK];
    case 'recent':
      // Adding someone who asked first accepts them; existing edges show a label instead.
      if (state === FRIEND_STATE.REQUEST_RECEIVED) return [ACCEPT, BLOCK];
      if (state === null) return [ADD, BLOCK];
      return [BLOCK];
  }
}

/** The read-only edge label for a recent player or a lookup result ("Friends", "Request sent"). */
export function stateLabel(state: FriendState | null | undefined, tr: TFunction): string | null {
  if (state === FRIEND_STATE.FRIEND) return tr('friends.actions.friends');
  if (state === FRIEND_STATE.REQUEST_SENT) return tr('friends.actions.requestSent');
  return null;
}

export function actionLabel(action: FriendRowAction, tr: TFunction): string {
  return tr(`friends.actions.${action}`);
}

/** Availability dot colour: online has its own token, in a room or a game the accent, offline muted. */
export function availabilityColor(availability: Availability, colors: SkinTokens['colors']): string {
  switch (availability) {
    case 'online':
      return colors.onlineDot;
    case 'room':
    case 'playing':
      return colors.accent;
    case 'offline':
      return colors.panelMuted;
  }
}

/** First letter of a name for the avatar, safe for characters outside the BMP. */
export function nameInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first === undefined ? '?' : first.toUpperCase();
}

/** One player in a friends list: avatar, name, availability (friends), the section's actions and its error. */
export function FriendRow({ section, target, availability, state = null, busy, error, onAction }: FriendRowProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Avatar } = skin.components;
  const tr = useT();
  const { userId, displayName } = target;
  const label = section === 'recent' ? stateLabel(state, tr) : null;
  const rowError = error !== null && error.userId === userId ? friendErrorMessage(error.reason, tr) : null;
  // A friend can also be a recent player; a separate prefix keeps test ids unique on the screen.
  const id = section === 'recent' ? 'recent' : 'friend';

  return (
    <View style={styles.root} testID={`${id}-row-${userId}`}>
      <View style={styles.main}>
        <View style={styles.identity}>
          <Avatar initial={nameInitial(displayName)} side="us" isTurn={false} isDealer={false} size="sm" />
          <View style={styles.text}>
            <Text
              style={[styles.name, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
              numberOfLines={1}
              testID={`${id}-name-${userId}`}
            >
              {displayName}
            </Text>
            {availability !== undefined ? (
              <View style={styles.availability} testID={`${id}-availability-${userId}`}>
                <View style={[styles.dot, { backgroundColor: availabilityColor(availability, t.colors) }]} />
                <Text style={[styles.availabilityText, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
                  {tr(`friends.availability.${availability}`)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.actions}>
          {label !== null ? (
            <Text
              style={[styles.stateLabel, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }]}
              testID={`${id}-state-${userId}`}
            >
              {label}
            </Text>
          ) : null}
          {rowButtons(section, state).map(({ action, tone }) => (
            <FriendButton
              key={action}
              label={actionLabel(action, tr)}
              accessibilityLabel={tr('friends.actionFor', { action: actionLabel(action, tr), name: displayName })}
              tone={tone}
              disabled={busy}
              onPress={() => onAction(action, target)}
              testID={`${id}-${action}-${userId}`}
            />
          ))}
        </View>
      </View>

      <View accessibilityLiveRegion="polite">
        {rowError !== null ? (
          <Text
            style={[styles.error, { color: t.colors.warnText, backgroundColor: t.colors.warnBg, borderRadius: t.radii.button, fontFamily: t.fonts.body }]}
            accessibilityRole="alert"
            testID={`${id}-error-${userId}`}
          >
            {rowError}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6, paddingVertical: 6 },
  // Wraps the actions under the name when the row is too narrow (phones, long names).
  main: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexGrow: 1, flexShrink: 1, minWidth: 160 },
  text: { flexShrink: 1, gap: 2 },
  name: { fontSize: 16 },
  availability: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  availabilityText: { fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginStart: 'auto' },
  stateLabel: { fontSize: 14, paddingHorizontal: 4 },
  error: { fontSize: 13, paddingVertical: 6, paddingHorizontal: 10, overflow: 'hidden' },
});
