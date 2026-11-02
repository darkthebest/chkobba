import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { RoomController, RoomMemberView } from '@/game/useRoomController';
import { DirectionView, useT } from '@/i18n';
import { useLayout } from '@/layout';
import { clearRoomSession, publishRoomSession } from '@/online/roomSession';
import { useSkin } from '@/skins';
import type { TeamSide } from '@/skins/types';

import { LobbyIcon } from '../lobby/LobbyIcons';
import { PlayerSheetView, type PlayerSheetViewTarget } from '../table/PlayerSheet';
import { InviteFriendsSheet } from './InviteFriendsSheet';
import { RoomCode } from './RoomCode';
import { RoomSeat } from './RoomSeat';

export interface PrivateRoomProps {
  room: RoomController;
  /** The live match id, when the client knows it; published with the room code. */
  matchId?: string;
  onLeave: () => void;
}

/**
 * The private-table waiting room: the code to share, the four seats as at the
 * table, who is standing, and the host's Start. Pure presentation over the
 * room controller, for phone (stacked) and desktop (seats beside the controls).
 */
export function PrivateRoom({ room, matchId, onLeave }: PrivateRoomProps) {
  const { desktop } = useLayout();
  const { Panel } = useSkin().skin.components;
  // Publish the room for app-level surfaces. Unmounting here is not leaving the
  // room: while we play, `PrivateSession` swaps this view for the table, so the
  // session must outlive us. Only the explicit Leave clears it; the session's
  // unmount cleanup lives in `PrivateSession`. `matchId` may arrive late.
  useEffect(() => {
    if (matchId === undefined || matchId === '') return;
    publishRoomSession({ code: room.code, matchId });
  }, [room.code, matchId]);
  const leave = () => {
    clearRoomSession();
    onLeave();
  };
  // The player sheet (Add friend, Block) for another member; room UI, so its open state lives here.
  const [sheetFor, setSheetFor] = useState<PlayerSheetViewTarget | null>(null);
  const openPlayer = (member: RoomMemberView) => {
    const target = playerTarget(member);
    return target ? () => setSheetFor(target) : undefined;
  };
  // "Invite friends" is open to every member, not only the host.
  const [inviting, setInviting] = useState(false);
  const sheet = (
    <>
      <PlayerSheetView target={sheetFor} onClose={() => setSheetFor(null)} />
      {inviting ? <InviteFriendsSheet roomCode={room.code} onClose={() => setInviting(false)} /> : null}
    </>
  );
  const openInvite = () => setInviting(true);

  const code = <RoomCode code={room.code} link={room.link} shareState={room.shareState} onShare={room.share} onCopy={room.copy} />;

  if (desktop) {
    return (
      <View style={styles.desktop} testID="private-room">
        <View style={styles.desktopSeats}>
          <SeatDiamond room={room} openPlayer={openPlayer} />
        </View>
        <Panel variant="sheet" style={styles.side}>
          <ScrollView contentContainerStyle={styles.column}>
            <RoomTitle />
            {code}
            <RoomControls room={room} onLeave={leave} openPlayer={openPlayer} onInvite={openInvite} />
          </ScrollView>
        </Panel>
        {sheet}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.phone} testID="private-room">
      <Panel variant="sheet" style={styles.column}>
        <RoomTitle />
        {code}
      </Panel>
      <SeatDiamond room={room} openPlayer={openPlayer} />
      <Panel variant="sheet" style={styles.column}>
        <RoomControls room={room} onLeave={leave} openPlayer={openPlayer} onInvite={openInvite} />
      </Panel>
      {sheet}
    </ScrollView>
  );
}

/** Opens the player sheet for a member, or undefined when there is none to open. */
type OpenPlayer = (member: RoomMemberView) => (() => void) | undefined;

/** The sheet target for a member: only another human with a user id (never ourselves). */
function playerTarget(member: RoomMemberView): PlayerSheetViewTarget | null {
  if (member.isMe || member.userId === undefined || member.userId === '') return null;
  return { userId: member.userId, name: member.name };
}

function RoomTitle() {
  const t = useSkin().skin.tokens;
  const tr = useT();
  return (
    <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]} accessibilityRole="header">
      {tr('room.title')}
    </Text>
  );
}

/** Seat offsets from the viewer, as at the game table: turns go bottom → right → top → left. */
const BOTTOM = 0;
const RIGHT = 1;
const TOP = 2;
const LEFT = 3;
const SEAT_COUNT = 4;

/** The four seats laid out as at the table, with the viewer's seat (seat 0 when standing) at the bottom. */
function SeatDiamond({ room, openPlayer, style }: { room: RoomController; openPlayer: OpenPlayer; style?: StyleProp<ViewStyle> }) {
  const { TableSurface } = useSkin().skin.components;
  const viewer = room.mySeat ?? 0;
  const myTeam = viewer % 2;

  const seatAt = (offset: number) => {
    const seat = room.seats[(viewer + offset) % SEAT_COUNT];
    if (seat === undefined) return null;
    const side: TeamSide = seat.team === myTeam ? 'us' : 'them';
    // Only a seat held by another human member has a player sheet; bots and empty seats have none.
    const member = seat.kind === 'human' ? room.members.find((m) => m.seat === seat.seat) : undefined;
    return (
      <RoomSeat
        seat={seat}
        side={side}
        viewerSeated={room.mySeat !== null}
        onSit={() => room.sit(seat.seat)}
        onTakeOver={() => room.takeOver(seat.seat)}
        onOpenPlayer={member ? openPlayer(member) : undefined}
      />
    );
  };

  return (
    <TableSurface style={[styles.surface, style]}>
      {/* Seats are spatial (partners face each other): they never mirror in right-to-left languages. */}
      <DirectionView dir="ltr" style={styles.diamond}>
        <View style={styles.diamondRow}>{seatAt(TOP)}</View>
        <View style={[styles.diamondRow, styles.diamondMiddle]}>
          {seatAt(LEFT)}
          {seatAt(RIGHT)}
        </View>
        <View style={styles.diamondRow}>{seatAt(BOTTOM)}</View>
      </DirectionView>
    </TableSurface>
  );
}

/** Everything below the code: standing members, game status, Start, errors, Invite friends and Leave. */
function RoomControls({ room, onLeave, openPlayer, onInvite }: PrivateRoomProps & { openPlayer: OpenPlayer; onInvite: () => void }) {
  const tr = useT();
  return (
    <View style={styles.column}>
      <StandingList room={room} openPlayer={openPlayer} />
      {room.inGame && room.mySeat === null ? <GameInProgress room={room} /> : null}
      {room.resetCountdown !== null ? (
        <MutedLine testID="room-reset-countdown" role="timer">
          {tr('room.backToRoomIn', { seconds: room.resetCountdown })}
        </MutedLine>
      ) : null}
      <StartControls room={room} />
      <ActionError message={room.actionError} />
      <RoomButton label={tr('invite.button')} onPress={onInvite} testID="room-invite" />
      <RoomButton label={tr('room.leave')} onPress={onLeave} testID="room-leave" />
    </View>
  );
}

function StandingList({ room, openPlayer }: { room: RoomController; openPlayer: OpenPlayer }) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  if (room.standing.length === 0) return null;
  return (
    <View style={styles.standing} testID="room-standing">
      <Text style={[styles.sectionTitle, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }]} accessibilityRole="header">
        {tr('room.standing')}
      </Text>
      {room.standing.map((member, index) => {
        const open = openPlayer(member);
        const row = (
          <>
            <Text style={[styles.standingName, { color: t.colors.panelText, fontFamily: t.fonts.body }]} numberOfLines={1}>
              {member.isMe ? tr('room.you', { name: member.name }) : member.name}
            </Text>
            {member.isHost ? (
              <View accessible accessibilityLabel={tr('room.host')} testID="room-host-crown">
                <LobbyIcon name="crown" size={16} color={t.colors.accent} />
              </View>
            ) : null}
          </>
        );
        const key = `${index}-${member.name}`;
        return open ? (
          <Pressable
            key={key}
            onPress={open}
            accessibilityRole="button"
            accessibilityLabel={tr('friends.sheet.open', { name: member.name })}
            testID={`room-standing-${member.userId ?? index}`}
            style={[styles.standingRow, styles.standingPress]}
          >
            {row}
          </Pressable>
        ) : (
          <View key={key} style={styles.standingRow}>
            {row}
          </View>
        );
      })}
    </View>
  );
}

/** For standing members while a game runs: the team scores (team 1 in the `us` colour, as seen from seat 0). */
function GameInProgress({ room }: { room: RoomController }) {
  const t = useSkin().skin.tokens;
  const tr = useT();
  const teams: readonly [0, 1] = [0, 1];
  return (
    <View style={styles.game}>
      {room.scores !== null ? (
        <View style={styles.scores} testID="room-scores">
          {teams.map((team) => (
            <View key={team} style={styles.score} accessible>
              <Text style={[styles.scoreLabel, { color: team === 0 ? t.colors.us : t.colors.them, fontFamily: t.fonts.bodyBold }]}>
                {tr('room.team', { n: team + 1 })}
              </Text>
              <Text style={[styles.scoreValue, { color: t.colors.panelText, fontFamily: t.fonts.numeric }]}>{room.scores?.[team]}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <MutedLine testID="room-waiting-game">{tr('room.waitingForGameEnd')}</MutedLine>
    </View>
  );
}

/** Start for the host; a "waiting for the host" line for everyone else. Only while waiting. */
function StartControls({ room }: { room: RoomController }) {
  const tr = useT();
  if (room.phase !== 'waiting') return null;
  if (!room.amHost) return <MutedLine>{tr('room.startHintGuest')}</MutedLine>;
  return (
    <View style={styles.start}>
      <RoomButton label={tr('room.start')} onPress={room.start} disabled={!room.canStart} primary testID="room-start" />
      <MutedLine>{tr('room.startHintHost')}</MutedLine>
    </View>
  );
}

function ActionError({ message }: { message: string | null }) {
  const t = useSkin().skin.tokens;
  return (
    <View accessibilityLiveRegion="polite">
      {message !== null ? (
        <Text
          style={[
            styles.error,
            { borderRadius: t.radii.button, backgroundColor: t.colors.warnBg, color: t.colors.warnText, fontFamily: t.fonts.bodyBold },
          ]}
          testID="room-error"
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function MutedLine({ children, testID, role }: { children: string; testID?: string; role?: 'timer' }) {
  const t = useSkin().skin.tokens;
  return (
    <Text style={[styles.line, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyItalic }]} accessibilityRole={role} testID={testID}>
      {children}
    </Text>
  );
}

interface RoomButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  testID: string;
}

function RoomButton({ label, onPress, primary = false, disabled = false, testID }: RoomButtonProps) {
  const t = useSkin().skin.tokens;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[
        styles.button,
        { borderRadius: t.radii.button, borderColor: primary ? t.colors.accent : t.colors.panelMuted },
        primary && { backgroundColor: t.colors.accent },
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, { fontFamily: primary ? t.fonts.display : t.fonts.bodyBold, color: primary ? t.colors.onAccent : t.colors.panelText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  phone: { padding: 16, gap: 14, alignItems: 'stretch', width: '100%', maxWidth: 520, alignSelf: 'center' },
  desktop: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24 },
  desktopSeats: { flex: 1, maxWidth: 620, alignItems: 'stretch' },
  side: { width: 380, maxHeight: '100%' },
  column: { gap: 12, alignItems: 'stretch' },
  title: { fontSize: 26, textAlign: 'center' },
  surface: { paddingVertical: 20, paddingHorizontal: 12 },
  diamond: { gap: 12 },
  diamondRow: { flexDirection: 'row', justifyContent: 'center' },
  diamondMiddle: { justifyContent: 'space-between', gap: 16 },
  standing: { gap: 6 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
  standingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  standingName: { fontSize: 15, flexShrink: 1 },
  standingPress: { minHeight: 44 },
  game: { gap: 8 },
  scores: { flexDirection: 'row', justifyContent: 'center', gap: 32 },
  score: { alignItems: 'center' },
  scoreLabel: { fontSize: 13 },
  scoreValue: { fontSize: 28 },
  start: { gap: 6 },
  line: { fontSize: 14, textAlign: 'center' },
  error: { fontSize: 14, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden' },
  button: { minHeight: 44, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  buttonText: { fontSize: 16 },
  disabled: { opacity: 0.5 },
});
