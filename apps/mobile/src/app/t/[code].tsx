import { isRoomCode, normalizeRoomCode } from '@chkobba/protocol';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NameGate, SearchFailed } from '@/components/lobby/NameGate';
import { OnlineErrorSheet } from '@/components/OnlineErrorSheet';
import { PrivateSession } from '@/components/room/PrivateSession';
import { useT } from '@/i18n';
import { onlineErrorMessage } from '@/online/messages';
import { NakamaGameClient, type JoinByCodeResult, type OnlineServicesBackend } from '@/online/NakamaGameClient';
import { getOnlineBackend, getProfileBackend } from '@/online/services';
import { useSkin } from '@/skins';

type RoomParams = { code?: string | string[]; matchId?: string | string[] };
type JoinFailure = Exclude<JoinByCodeResult, { ok: true }>['reason'];

/** Same shape the backend accepts from the RPCs; anything else in the URL is ignored. */
const MATCH_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const ROOM_ERROR: Record<Exclude<JoinFailure, 'network'>, 'room_not_found' | 'room_rate_limited' | 'room_bad_code'> = {
  not_found: 'room_not_found',
  rate_limited: 'room_rate_limited',
  bad_code: 'room_bad_code',
};

const exitToLobby = () => (router.canGoBack() ? router.back() : router.replace('/'));

const single = (value: string | string[] | undefined): string => (typeof value === 'string' ? value : '');

/**
 * `/t/CODE` joins a private table by its code (share links, "Join with code",
 * a web reload). `/private` arrives here with `?matchId=…` and skips the code
 * lookup. A reload looks the code up again; the server gives the seat back by
 * user id. The client is stopped when the screen unmounts.
 */
export default function RoomScreen() {
  const params = useLocalSearchParams<RoomParams>();
  const { Background } = useSkin().skin.components;
  const tr = useT();
  const code = normalizeRoomCode(single(params.code));
  const rawMatchId = single(params.matchId);
  const matchId = MATCH_ID_PATTERN.test(rawMatchId) ? rawMatchId : null;

  return (
    <Background>
      <SafeAreaView style={styles.root}>
        {isRoomCode(code) ? (
          <JoinFlow code={code} matchId={matchId} />
        ) : (
          <OnlineErrorSheet message={onlineErrorMessage('room_bad_code', tr)} onExit={exitToLobby} />
        )}
      </SafeAreaView>
    </Background>
  );
}

function JoinFlow({ code, matchId }: { code: string; matchId: string | null }) {
  const [backend] = useState(() => getOnlineBackend());
  const [profile] = useState(() => getProfileBackend());
  return (
    <NameGate profile={profile} onCancel={exitToLobby} loadingFallback={<Loading />}>
      <JoinPrivateTable backend={backend} code={code} matchId={matchId} />
    </NameGate>
  );
}

type Join =
  | { status: 'joining' }
  | { status: 'joined'; client: NakamaGameClient }
  | { status: 'unreachable' }
  | { status: 'failed'; error: 'room_not_found' | 'room_rate_limited' | 'room_bad_code' };

function JoinPrivateTable({ backend, code, matchId }: { backend: OnlineServicesBackend; code: string; matchId: string | null }) {
  const [join, setJoin] = useState<Join>({ status: 'joining' });
  const [attempt, setAttempt] = useState(0);
  // Read once: clearing the URL param below must not rejoin.
  const [initialMatchId] = useState(matchId);
  const tr = useT();

  useEffect(() => {
    let cancelled = false;
    let client: NakamaGameClient | null = null;
    const connect = (id: string) => {
      client = new NakamaGameClient({ matchId: id, backend, privateCode: code });
      client.start();
      setJoin({ status: 'joined', client });
    };
    // The match id from /private is only good for the first try; a retry looks the code up.
    if (initialMatchId !== null && attempt === 0) {
      connect(initialMatchId);
      // A later reload (or a copied URL) then always goes through the code lookup.
      router.setParams({ matchId: undefined });
    } else {
      void backend.joinByCode(code).then((result) => {
        if (cancelled) return;
        if (result.ok) connect(result.matchId);
        else if (result.reason === 'network') setJoin({ status: 'unreachable' });
        else setJoin({ status: 'failed', error: ROOM_ERROR[result.reason] });
      });
    }
    return () => {
      cancelled = true;
      client?.stop();
    };
  }, [backend, code, initialMatchId, attempt]);

  if (join.status === 'joined') return <JoinedSession client={join.client} />;
  if (join.status === 'failed') return <OnlineErrorSheet message={onlineErrorMessage(join.error, tr)} onExit={exitToLobby} />;
  if (join.status === 'unreachable') {
    return (
      <SearchFailed
        onRetry={() => {
          setJoin({ status: 'joining' });
          setAttempt((n) => n + 1);
        }}
        onExit={exitToLobby}
      />
    );
  }
  return <Loading />;
}

function JoinedSession({ client }: { client: NakamaGameClient }) {
  const leave = () => {
    client.stop();
    exitToLobby();
  };
  return <PrivateSession client={client} onLeave={leave} />;
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
});
