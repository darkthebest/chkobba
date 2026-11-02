import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoomSeat as RoomSeatState } from '@/game/useRoomController';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';
import type { TeamSide } from '@/skins/types';

import { LobbyIcon } from '../lobby/LobbyIcons';

export interface RoomSeatProps {
  seat: RoomSeatState;
  /** `us` for the viewer's team (team 0 for a standing viewer), as at the table. */
  side: TeamSide;
  /** The viewer already has a seat, so an empty seat offers "Move here" instead of "Sit here". */
  viewerSeated: boolean;
  onSit: () => void;
  onTakeOver: () => void;
  /**
   * Opens the player sheet (Add friend, Block) for the human sitting here.
   * Pass it only for another human with a user id; it goes on the avatar and
   * name, so it never collides with the seat's Sit / Take over buttons.
   */
  onOpenPlayer?: () => void;
}

/** One seat of the waiting room: who sits there, their team, and what the viewer can do with it. */
export function RoomSeat({ seat, side, viewerSeated, onSit, onTakeOver, onOpenPlayer }: RoomSeatProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Avatar } = skin.components;
  const tr = useT();
  const teamColor = side === 'us' ? t.colors.us : t.colors.them;
  const teamLabel = tr('room.team', { n: seat.team + 1 });
  const empty = seat.kind === 'empty' || seat.name === null;

  const name = empty ? tr('room.emptySeat') : seat.kind === 'me' ? tr('room.you', { name: seat.name }) : seat.name;

  const occupant = (
    <>
      <View>
        {empty ? (
          <View style={[styles.emptyAvatar, { borderColor: teamColor }]} />
        ) : (
          <Avatar initial={(seat.name ?? '').charAt(0)} side={side} isTurn={false} isDealer={false} size="md" />
        )}
        {seat.isHost ? (
          <View
            style={[styles.crown, { backgroundColor: t.colors.plateActiveBg }]}
            accessible
            accessibilityLabel={tr('room.host')}
            testID="room-host-crown"
          >
            <LobbyIcon name="crown" size={14} color={t.colors.plateActiveText} />
          </View>
        ) : null}
      </View>

      <View style={[styles.plate, { backgroundColor: t.colors.plateBg, borderTopColor: teamColor }]}>
        <Text
          style={[styles.name, { color: t.colors.plateText, fontFamily: empty ? t.fonts.bodyItalic : t.fonts.bodyBold }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <View style={styles.meta}>
          <View style={[styles.teamDot, { backgroundColor: teamColor }]} />
          <Text style={[styles.metaText, { color: t.colors.plateText, fontFamily: t.fonts.body }]}>{teamLabel}</Text>
          {seat.kind === 'bot' ? (
            <View style={[styles.botTag, { backgroundColor: t.colors.tagBg }]} accessible accessibilityLabel={tr('room.bot')}>
              <LobbyIcon name="bot" size={11} color={t.colors.tagText} />
              <Text style={[styles.botText, { color: t.colors.tagText, fontFamily: t.fonts.bodyBold }]}>{tr('room.bot')}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <View style={styles.root} testID={`room-seat-${seat.seat}`}>
      {onOpenPlayer && seat.name !== null ? (
        <Pressable
          onPress={onOpenPlayer}
          accessibilityRole="button"
          accessibilityLabel={tr('friends.sheet.open', { name: seat.name })}
          testID={`room-seat-${seat.seat}-player`}
          style={styles.occupant}
        >
          {occupant}
        </Pressable>
      ) : (
        occupant
      )}

      {seat.canSit ? (
        <SeatAction
          label={tr(viewerSeated ? 'room.switch' : 'room.sit')}
          hint={teamLabel}
          onPress={onSit}
          testID={`room-sit-${seat.seat}`}
        />
      ) : null}
      {seat.canTakeOver ? (
        <SeatAction
          label={tr('room.takeOver')}
          hint={seat.name ?? teamLabel}
          onPress={onTakeOver}
          testID={`room-takeover-${seat.seat}`}
        />
      ) : null}
    </View>
  );
}

interface SeatActionProps {
  label: string;
  /** Which seat the action is for, read after the label by screen readers. */
  hint: string;
  onPress: () => void;
  testID: string;
}

function SeatAction({ label, hint, onPress, testID }: SeatActionProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      testID={testID}
      style={[styles.action, { backgroundColor: t.colors.accent, borderRadius: t.radii.button }]}
    >
      <Text style={[styles.actionText, { color: t.colors.onAccent, fontFamily: t.fonts.bodyBold }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const MIN_TAP = 44;

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 6, width: 124 },
  occupant: { alignSelf: 'stretch', alignItems: 'center', gap: 6, minHeight: MIN_TAP },
  emptyAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed' },
  crown: {
    position: 'absolute',
    top: -8,
    end: -8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plate: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 6, borderTopWidth: 3, paddingHorizontal: 6, paddingVertical: 3, gap: 2 },
  name: { fontSize: 13, maxWidth: '100%' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', justifyContent: 'center' },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  metaText: { fontSize: 10, letterSpacing: 0.3 },
  botTag: { flexDirection: 'row', alignItems: 'center', gap: 2, borderRadius: 4, paddingHorizontal: 4 },
  botText: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  action: { alignSelf: 'stretch', minHeight: MIN_TAP, minWidth: MIN_TAP, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 14 },
});
