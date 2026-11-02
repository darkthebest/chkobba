import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FindingPlayers } from '@/components/lobby/FindingPlayers';
import { getOnlineBackend, getProfileBackend } from '@/online/services';
import { useSkin } from '@/skins';

/** Quick match: find a table, wait for players or bots, then open it (`/game?online=1&matchId=…`). */
export default function FindingScreen() {
  const [backend] = useState(() => getOnlineBackend());
  const [profile] = useState(() => getProfileBackend());
  const { Background } = useSkin().skin.components;

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        <FindingPlayers
          backend={backend}
          profile={profile}
          onStarted={(matchId) => router.replace({ pathname: '/game', params: { online: '1', matchId } })}
          onExit={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </SafeAreaView>
    </Background>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
