import { BOT_LEVELS, type BotLevel } from '@chkobba/rules';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GameTable } from '@/components/GameTable';
import { FindingPlayersView } from '@/components/lobby/FindingPlayers';
import { OnlineErrorSheet } from '@/components/OnlineErrorSheet';
import { LocalGameClient } from '@/game/LocalGameClient';
import { useGame } from '@/game/useGame';
import { useT } from '@/i18n';
import { peekClient, releaseClient } from '@/online/activeClient';
import { onlineErrorMessage } from '@/online/messages';
import { NakamaGameClient } from '@/online/NakamaGameClient';
import { practiceResultFor } from '@/online/practice';
import { getOnlineBackend, getPracticeReporter } from '@/online/services';
import { useSocialActivity } from '@/online/useSocialActivity';
import { useSkin } from '@/skins';

const randomSeed = () => Math.random().toString(36).slice(2, 10);

type GameParams = { players?: string; target?: string; seed?: string; level?: string; online?: string; matchId?: string };

const exitToLobby = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** `/game` plays offline against bots; `/game?online=1&matchId=…` plays at a Nakama table. */
export default function GameScreen() {
  const params = useLocalSearchParams<GameParams>();
  const { Background } = useSkin().skin.components;
  const tr = useT();
  const online = params.online === '1';
  const matchId = params.matchId ?? '';

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        {!online ? (
          <LocalGame params={params} />
        ) : matchId === '' ? (
          <OnlineErrorSheet message={onlineErrorMessage('match_ended', tr)} onExit={exitToLobby} />
        ) : (
          <OnlineGame matchId={matchId} />
        )}
      </SafeAreaView>
    </Background>
  );
}

function LocalGame({ params }: { params: GameParams }) {
  const botLevel: BotLevel = BOT_LEVELS.find((l) => l === params.level) ?? 'normal';
  const playerCount = params.players === '2' ? 2 : 4;
  const targetScore = Number(params.target) || 21;
  // A ?seed= param replays the exact same deals, which makes bug reports reproducible.
  const [seed, setSeed] = useState(() => params.seed ?? randomSeed());

  const client = useMemo(
    () => new LocalGameClient({ seed, playerCount, botLevel, rules: { targetScore } }),
    [seed, playerCount, botLevel, targetScore],
  );
  // Offline games are never shown to friends (no activity), but a hand in progress still holds invite banners and toasts back.
  const view = useGame(client).view;
  useSocialActivity(null, view.phase === 'cutting' || view.phase === 'playing');

  useEffect(() => {
    client.start();
    return () => client.stop();
  }, [client]);

  // Practice stats are display-only, so the report is fire-and-forget: the summary never waits on it and its outcome is never shown.
  // The seed identifies the game, so a re-render (or the summary's staged animation) can't send a second report, and "New game" (a new seed) can.
  const reportPractice = useMemo(() => getPracticeReporter(), []);
  const reportedSeed = useRef<string | null>(null);
  useEffect(() => {
    if (view.phase !== 'gameOver') return;
    if (reportedSeed.current === seed) return;
    reportedSeed.current = seed;
    const result = practiceResultFor(view);
    if (result === null) return;
    void reportPractice(result);
  }, [view, seed, reportPractice]);

  return <GameTable key={seed} client={client} onNewGame={() => setSeed(randomSeed())} onExit={exitToLobby} />;
}

/**
 * Takes over the client the "Finding players" screen started for this table,
 * or joins the table with a new one (deep link, reload). Stops it on unmount.
 */
function OnlineGame({ matchId }: { matchId: string }) {
  const [client] = useState(() => peekClient(matchId) ?? new NakamaGameClient({ matchId, backend: getOnlineBackend() }));
  const snapshot = useGame(client);
  const tr = useT();
  const started = snapshot.online?.started === true;
  // Only online games are shown to friends; an offline game against bots never sets activity.
  // Before the table starts ("Finding players") the activity stays as it was (the lobby).
  useSocialActivity(started ? 'playing' : null, started && snapshot.online?.phase === 'playing');

  useEffect(() => {
    releaseClient(client);
    client.start();
    return () => client.stop();
  }, [client]);

  if (!started) {
    const fatal = snapshot.online?.lastError?.fatal ? snapshot.online.lastError : null;
    return (
      <>
        <FindingPlayersView snapshot={snapshot} onCancel={exitToLobby} />
        {fatal ? <OnlineErrorSheet message={onlineErrorMessage(fatal.code, tr)} onExit={exitToLobby} /> : null}
      </>
    );
  }
  return <GameTable client={client} onNewGame={() => router.replace('/finding')} onExit={exitToLobby} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
