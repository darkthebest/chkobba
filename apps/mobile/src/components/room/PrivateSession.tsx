import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { GameClient, GameSnapshot } from '@/game/GameClient';
import { useGame } from '@/game/useGame';
import { useRoomController, type RoomController } from '@/game/useRoomController';
import { useT, type TFunction } from '@/i18n';
import { onlineErrorMessage } from '@/online/messages';
import { clearRoomSession, publishRoomSession } from '@/online/roomSession';
import { useSocialActivity } from '@/online/useSocialActivity';
import { useSkin } from '@/skins';

import { GameTable } from '../GameTable';
import { OnlineErrorSheet } from '../OnlineErrorSheet';
import { PrivateRoom } from './PrivateRoom';

export interface PrivateSessionProps {
  client: GameClient;
  /** Leaves the table for good (the caller stops the client and navigates away). */
  onLeave: () => void;
}

/**
 * A whole private-table session: the waiting room, the game table while we
 * play, and back to the room when the server resets the table after a game.
 * Only the table mounts `GameTable` (and so its keyboard shortcuts).
 */
export function PrivateSession({ client, onLeave }: PrivateSessionProps) {
  const snapshot = useGame(client);
  const room = useRoomController(client);
  const tr = useT();
  // The game whose final summary we left early with "Back to the room"; the server's reset bumps `gameKey`.
  const [leftGameKey, setLeftGameKey] = useState<number | null>(null);
  const gameKey = snapshot.online?.gameKey ?? 0;
  const atTable = room !== null && showsTable(snapshot, room) && leftGameKey !== gameKey;
  // Friends see "in a room" while we wait and "playing" at the table; invites wait while a hand is played.
  useSocialActivity(atTable ? 'playing' : 'room', atTable && snapshot.online?.phase === 'playing');
  // A reload can rejoin a live game without ever mounting the waiting room, so the
  // table publishes too; an identical value already there is a no-op.
  const matchId = client.matchId;
  const roomCode = room?.code ?? null;
  useEffect(() => {
    if (!atTable || roomCode === null || matchId === undefined || matchId === '') return;
    publishRoomSession({ code: roomCode, matchId });
  }, [atTable, roomCode, matchId]);
  // The session ends with this screen, including a back gesture that unmounts it.
  useEffect(() => clearRoomSession, []);
  const leave = () => {
    clearRoomSession();
    onLeave();
  };

  if (atTable) {
    return (
      <GameTable
        // Fresh staging and summaries per game, and for a standing member who takes over a seat mid-game.
        key={`${gameKey}:${room.mySeat}`}
        client={client}
        onNewGame={() => setLeftGameKey(gameKey)}
        newGameLabel={backToRoomLabel(room, tr)}
        onExit={leave}
      />
    );
  }

  const fatal = snapshot.online?.lastError?.fatal ? snapshot.online.lastError : null;
  return (
    <>
      {room === null ? <Loading /> : <PrivateRoom room={room} matchId={client.matchId} onLeave={leave} />}
      {fatal ? <OnlineErrorSheet message={onlineErrorMessage(fatal.code, tr)} onExit={leave} /> : null}
    </>
  );
}

/** Seated in a game we have a view of (playing, between rounds, or its final summary). */
function showsTable(snapshot: GameSnapshot, room: RoomController): boolean {
  return room.phase !== 'waiting' && room.mySeat !== null && snapshot.online?.started === true;
}

/** The final summary leads back to the room, never to a new quick match. */
function backToRoomLabel(room: RoomController, tr: TFunction): string {
  return room.resetCountdown === null ? tr('room.backToRoom') :tr('room.backToRoomIn', { seconds: room.resetCountdown });
}

function Loading() {
  const t = useSkin().skin.tokens;
  return (
    <View style={styles.center} testID="private-session-loading">
      <ActivityIndicator color={t.colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
