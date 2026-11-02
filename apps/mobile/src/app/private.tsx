import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NameGate, SearchFailed } from '@/components/lobby/NameGate';
import { OnlineErrorSheet } from '@/components/OnlineErrorSheet';
import { useT } from '@/i18n';
import { onlineErrorMessage } from '@/online/messages';
import type { PrivateTableBackend } from '@/online/NakamaGameClient';
import { isCreatePrivateTableError } from '@/online/roomErrors';
import { getOnlineBackend, getProfileBackend } from '@/online/services';
import { useSkin } from '@/skins';

const exitToLobby = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * `/private`: picks a name on the first visit, creates a private table, then
 * replaces itself with `/t/CODE` (with the match id, so that screen skips the
 * code lookup). A network failure offers Try again; rate limiting is final.
 */
export default function PrivateScreen() {
  const [backend] = useState(() => getOnlineBackend());
  const [profile] = useState(() => getProfileBackend());
  const { Background } = useSkin().skin.components;

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        <NameGate profile={profile} onCancel={exitToLobby} loadingFallback={<Loading />}>
          <CreatePrivateTable backend={backend} />
        </NameGate>
      </SafeAreaView>
    </Background>
  );
}

type Create = { status: 'creating' } | { status: 'unreachable' } | { status: 'rateLimited' };

function CreatePrivateTable({ backend }: { backend: PrivateTableBackend }) {
  const [create, setCreate] = useState<Create>({ status: 'creating' });
  const [attempt, setAttempt] = useState(0);
  const tr = useT();

  useEffect(() => {
    let cancelled = false;
    backend.createPrivateTable().then(
      ({ matchId, code }) => {
        if (!cancelled) router.replace({ pathname: '/t/[code]', params: { code, matchId } });
      },
      (error: unknown) => {
        if (cancelled) return;
        const rateLimited = isCreatePrivateTableError(error) && error.reason === 'rate_limited';
        setCreate({ status: rateLimited ? 'rateLimited' : 'unreachable' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [backend, attempt]);

  if (create.status === 'rateLimited') {
    return <OnlineErrorSheet message={onlineErrorMessage('room_rate_limited', tr)} onExit={exitToLobby} />;
  }
  if (create.status === 'unreachable') {
    return (
      <SearchFailed
        onRetry={() => {
          setCreate({ status: 'creating' });
          setAttempt((n) => n + 1);
        }}
        onExit={exitToLobby}
      />
    );
  }
  return <Loading />;
}

function Loading() {
  const t = useSkin().skin.tokens;
  return (
    <View style={styles.center}>
      <ActivityIndicator color={t.colors.accent} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
