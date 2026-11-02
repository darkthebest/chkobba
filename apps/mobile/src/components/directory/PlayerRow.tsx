import type { DirectoryPlayer } from '@chkobba/protocol';
import { StyleSheet, Text, View } from 'react-native';

import { FriendButton } from '@/components/friends/FriendButton';
import { nameInitial } from '@/components/friends/FriendRow';
import type { DirectoryRelation } from '@/directory/useDirectoryController';
import { useT } from '@/i18n';
import type { Availability as PresenceAvailability } from '@/online/presence';
import { useSkin } from '@/skins';

import { Availability } from './Availability';

/**
 * One directory search result: avatar, name, availability and the relation chip.
 *
 * The chip has three states, and only "none" is actionable: Add is a button,
 * while Friends and Request sent are plain labels — a chip that looks
 * pressable and does nothing is worse than text. `pending` disables Add (and
 * `FriendButton` exposes that state to assistive tech) while the optimistic
 * edge moves the chip to Requested through the live region.
 *
 * Presentation only: it does not fetch, does not own a controller and does not
 * create a name gate. `onAdd` is expected to be the screen's add handler wired
 * through the same `useNameGatedAction` / `useFriendActions` the friends screen
 * uses, with its sheet rendered once at the screen root — a gate per row would
 * mount one overlay per row and fill the row instead of the screen.
 *
 * `presence` and `availability` are passed separately to `Availability`, so the
 * decision that a hidden player is neither online nor offline stays in that one
 * component. The identity block is a single accessibility element whose spoken
 * name is the full name even when the visual text is limited to one line.
 *
 * ```tsx
 * <PlayerRow
 *   player={player}
 *   relation={directory.relationOf(player.userId)}
 *   pending={directory.pendingOf(player.userId)}
 *   availability={directory.availabilityOf(player.userId)}
 *   onAdd={() => actions.perform('add', { userId: player.userId, displayName: player.name })}
 * />
 * ```
 */
export interface PlayerRowProps {
  /** The search result: userId, display name and the presence visibility label. */
  player: DirectoryPlayer;
  /** The current edge: mutual friend, outgoing request, or none (Add applies). */
  relation: DirectoryRelation;
  /** An action for this player is in flight: Add is disabled. */
  pending: boolean;
  /**
   * The live activity for this player, when one arrived. Only meaningful for a
   * visible player; `Hidden` is decided by `Availability`, not here.
   */
  availability?: PresenceAvailability;
  /**
   * Adds this player. Must be name-gated by the caller (publishing a name to
   * someone else is what the gate exists for); the row calls it as-is.
   */
  onAdd: () => void;
}

export function PlayerRow({ player, relation, pending, availability, onAdd }: PlayerRowProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Avatar } = skin.components;
  const tr = useT();
  const { userId, name } = player;
  const addLabel = tr('directory.chip.add');
  const chipLabel =
    relation === 'friends'
      ? tr('directory.chip.friends')
      : relation === 'requested'
        ? tr('directory.chip.requested')
        : null;

  return (
    <View style={styles.root} testID={`directory-row-${userId}`}>
      <View style={styles.main}>
        {/*
          The passive half is one stop for a screen reader: the avatar is
          decorative, and the name keeps its full spoken label regardless of the
          one-line visual clamp.
        */}
        <View style={styles.identity} accessible accessibilityRole="text">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Avatar initial={nameInitial(name)} side="us" isTurn={false} isDealer={false} size="sm" />
          </View>
          <View style={styles.text}>
            <Text
              style={[styles.name, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
              numberOfLines={1}
              accessibilityLabel={name}
              testID={`directory-name-${userId}`}
            >
              {name}
            </Text>
            <Availability presence={player.presence} availability={availability} />
          </View>
        </View>

        <View style={styles.actions}>
          {relation === 'none' ? (
            <FriendButton
              label={addLabel}
              accessibilityLabel={tr('friends.actionFor', { action: addLabel, name })}
              tone="primary"
              disabled={pending}
              onPress={onAdd}
              testID={`directory-add-${userId}`}
            />
          ) : null}
          {/*
            Persistent live region: when the optimistic edge flips the chip from
            absent to Requested, the new label is announced. Friends and Request
            sent are text, never a button.
          */}
          <View accessibilityLiveRegion="polite">
            {chipLabel !== null ? (
              <Text
                style={[styles.chip, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }]}
                accessibilityLabel={tr('friends.actionFor', { action: chipLabel, name })}
                testID={`directory-chip-${userId}`}
              >
                {chipLabel}
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingVertical: 6 },
  // Wraps the chip under the name when the row is too narrow (phones, long names);
  // no fixed width, so the same row fills a desktop column.
  main: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 10, flexGrow: 1, flexShrink: 1, minWidth: 160 },
  text: { flexShrink: 1, gap: 2 },
  name: { fontSize: 16 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginStart: 'auto' },
  chip: { fontSize: 14, paddingHorizontal: 4 },
});
