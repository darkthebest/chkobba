import type { ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SeatInfo } from '@/game/GameClient';
import { useT } from '@/i18n';
import { DeckCardBack, useDeck } from '@/decks';
import { useSkin } from '@/skins';
import { usePulse } from '@/skins/shared/usePulse';

interface SeatProps {
  player: SeatInfo;
  cardCount: number;
  isTurn: boolean;
  isPartner: boolean;
  isDealer: boolean;
  vertical?: boolean;
  /** Online turn clock: remaining share of the turn (undefined when this seat is not on the clock). */
  progress?: number;
  /** Online turn clock: whole seconds left, for screen readers. */
  secondsLeft?: number | null;
  /** Tapping the avatar opens this seat's emote menu. */
  onPress?: () => void;
  /**
   * Online, another human: tapping the avatar opens their player sheet (friend state, Block, mute)
   * instead of the emote menu. Pass it only for such seats (`TableController.canOpenPlayerSheet`).
   */
  onOpenPlayer?: () => void;
  /** We hide this player's emotes. */
  emotesMuted?: boolean;
}

/** Online status worth flagging on a seat: the connection dropped, or the player stopped playing. */
export function seatStatus(player: SeatInfo): 'offline' | 'away' | null {
  if (player.isBot) return null;
  if (player.connected === false) return 'offline';
  return player.away === true ? 'away' : null;
}

interface TurnClockProps {
  /** Seconds left; when undefined the avatar is not on the clock and is rendered as is. */
  secondsLeft: number | null | undefined;
  /** Whose clock, for the spoken label ("Your time", or the player name). */
  owner: string;
  testID?: string;
  children: ReactNode;
}

/** Wraps an avatar on the online turn clock so screen readers can hear the time left. */
export function TurnClock({ secondsLeft, owner, testID, children }: TurnClockProps) {
  const tr = useT();
  // Always the same wrapper, so the avatar (and its animations) is not remounted when a turn starts.
  if (secondsLeft === undefined) return <View>{children}</View>;
  const label = secondsLeft === null ? tr('seat.turnTimer', { owner }) : tr('seat.secondsLeft', { owner, count: secondsLeft });
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={label} testID={testID}>
      {children}
    </View>
  );
}

/** Another player: avatar, name plate and face-down hand. */
export function Seat({
  player,
  cardCount,
  isTurn,
  isPartner,
  isDealer,
  vertical,
  progress,
  secondsLeft,
  onPress,
  onOpenPlayer,
  emotesMuted,
}: SeatProps) {
  const { skin } = useSkin();
  const { deck } = useDeck();
  const t = skin.tokens;
  const { Avatar, CardBack } = skin.components;
  const back = t.cardSizes.back;
  const pulse = usePulse(isTurn, 1000);
  const status = seatStatus(player);
  const tr = useT();

  const plate = (
    <View style={[styles.plate, { backgroundColor: isTurn ? t.colors.plateActiveBg : t.colors.plateBg }]}>
      <Text
        style={[styles.name, { fontFamily: t.fonts.bodyBold, color: isTurn ? t.colors.plateActiveText : t.colors.plateText }]}
        numberOfLines={1}
      >
        {player.name}
      </Text>
      <Text style={[styles.role, { fontFamily: t.fonts.body, color: isTurn ? t.colors.plateActiveText : t.colors.plateText }]}>
        {isPartner ? tr('seat.partner') : tr('seat.opponent')}
      </Text>
      {status ? (
        <View
          style={[styles.status, { backgroundColor: t.colors.warnBg }]}
          accessible
          accessibilityLabel={tr(status === 'offline' ? 'seat.isOffline' : 'seat.isAway', { name: player.name })}
          testID={`seat-${player.seat}-status`}
        >
          <Text style={[styles.statusText, { color: t.colors.warnText, fontFamily: t.fonts.bodyBold }]}>{tr(status === 'offline' ? 'seat.offline' : 'seat.away')}</Text>
        </View>
      ) : null}
    </View>
  );

  const backs = (
    <View style={vertical ? styles.backsV : styles.backsH}>
      {Array.from({ length: cardCount }, (_, i) => (
        <View
          key={i}
          style={i === 0 ? null : vertical ? { marginTop: -(back.height * 0.62) } : { marginStart: -t.cardSizes.backOverlap }}
        >
          {deck ? <DeckCardBack deck={deck} width={back.width} height={back.height} /> : <CardBack width={back.width} height={back.height} />}
        </View>
      ))}
    </View>
  );

  const thinking = isTurn ? (
    <Animated.Text
      style={[styles.thinking, { color: t.colors.accent, fontFamily: t.fonts.bodyItalic, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }) }]}
    >
      {tr('seat.thinking')}
    </Animated.Text>
  ) : null;

  const clock = (
    <TurnClock
      secondsLeft={progress === undefined ? undefined : (secondsLeft ?? null)}
      owner={player.name}
      testID={`seat-${player.seat}-clock`}
    >
      <Avatar
        initial={player.name.charAt(0)}
        side={isPartner ? 'us' : 'them'}
        isTurn={isTurn}
        isDealer={isDealer}
        size="md"
        progress={progress}
      />
    </TurnClock>
  );

  // Bots and offline seats have no user id, so they keep the emote menu.
  const press = onOpenPlayer ?? onPress;
  const avatar = press ? (
    <Pressable
      onPress={press}
      accessibilityRole="button"
      accessibilityLabel={
        onOpenPlayer ? tr('friends.sheet.open', { name: player.name }) : tr('emotes.seatMenu', { name: player.name })
      }
      hitSlop={6}
      testID={`seat-${player.seat}-avatar`}
    >
      {clock}
      {emotesMuted ? (
        <View style={styles.muted} accessible accessibilityLabel={tr('emotes.muted')} testID={`seat-${player.seat}-muted`}>
          <Text style={styles.mutedText}>🔇</Text>
        </View>
      ) : null}
    </Pressable>
  ) : (
    clock
  );

  return (
    <View style={vertical ? styles.seatV : styles.seatH} testID={`seat-${player.seat}`}>
      {avatar}
      {vertical ? (
        <>
          {plate}
          {backs}
          {thinking}
        </>
      ) : (
        <>
          <View style={styles.center}>
            {plate}
            {thinking}
          </View>
          {backs}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  seatH: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  seatV: { alignItems: 'center', gap: 4 },
  center: { alignItems: 'center', gap: 2 },
  plate: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center', maxWidth: 76 },
  name: { fontSize: 12 },
  role: { fontSize: 9, letterSpacing: 0.3 },
  backsH: { flexDirection: 'row' },
  backsV: { alignItems: 'center' },
  thinking: { fontSize: 10 },
  status: { marginTop: 2, borderRadius: 4, paddingHorizontal: 5 },
  muted: {
    position: 'absolute',
    left: -6,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedText: { fontSize: 10 },
  statusText: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
});
