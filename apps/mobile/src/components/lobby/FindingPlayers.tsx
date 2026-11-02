import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GameSnapshot } from '@/game/GameClient';
import { useCountdown } from '@/game/useCountdown';
import { useGame } from '@/game/useGame';
import { useT } from '@/i18n';
import { holdClient, isHeld } from '@/online/activeClient';
import { connectionLabel, onlineErrorMessage } from '@/online/messages';
import { NakamaGameClient, type OnlineBackend } from '@/online/NakamaGameClient';
import type { ProfileBackend } from '@/online/profile';
import { useSkin } from '@/skins';

import { OnlineErrorSheet } from '../OnlineErrorSheet';
import { ActionButton, NameGate, SearchFailed } from './NameGate';

type Search = { status: 'searching' } | { status: 'joined'; client: NakamaGameClient } | { status: 'failed' };

interface QuickMatchProps {
  backend: OnlineBackend;
  /** The game began: the client is held (online/activeClient) for the game screen to take over. */
  onStarted: (matchId: string) => void;
  /** Back to the lobby (Cancel, or after an error). */
  onExit: () => void;
}

interface FindingPlayersProps extends QuickMatchProps {
  /** Loads the player's profile; quick match waits until a name was picked once. */
  profile: ProfileBackend;
}

/**
 * The /finding flow: loads the profile, asks for a name on the first visit
 * ("Choose your name"), then runs quick match. Later visits (name already
 * picked) go straight to the search. Leaving during the profile load or the
 * name submit starts no search.
 */
export function FindingPlayers({ backend, profile, onStarted, onExit }: FindingPlayersProps) {
  return (
    <NameGate
      profile={profile}
      onCancel={onExit}
      loadingFallback={<FindingPlayersView snapshot={null} onCancel={onExit} />}
    >
      <QuickMatch backend={backend} onStarted={onStarted} onExit={onExit} />
    </NameGate>
  );
}

/**
 * Quick match: asks the server for a table, joins it, and waits until the
 * game starts (humans or backfill bots fill the seats). Owns the client until
 * it is handed to the game screen; leaving early stops it.
 */
function QuickMatch({ backend, onStarted, onExit }: QuickMatchProps) {
  const [search, setSearch] = useState<Search>({ status: 'searching' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let client: NakamaGameClient | null = null;
    backend.quickMatch().then(
      (matchId) => {
        if (cancelled) return;
        client = new NakamaGameClient({ matchId, backend });
        client.start();
        setSearch({ status: 'joined', client });
      },
      () => {
        if (!cancelled) setSearch({ status: 'failed' });
      },
    );
    return () => {
      cancelled = true;
      if (client !== null && !isHeld(client)) client.stop();
    };
  }, [backend, attempt]);

  if (search.status === 'joined') {
    return <WaitingForTable client={search.client} onStarted={onStarted} onExit={onExit} />;
  }
  if (search.status === 'failed') {
    return (
      <SearchFailed
        onRetry={() => {
          setSearch({ status: 'searching' });
          setAttempt((n) => n + 1);
        }}
        onExit={onExit}
      />
    );
  }
  return <FindingPlayersView snapshot={null} onCancel={onExit} />;
}

function WaitingForTable({ client, onStarted, onExit }: { client: NakamaGameClient } & Omit<QuickMatchProps, 'backend'>) {
  const snapshot = useGame(client);
  const tr = useT();
  const started = snapshot.online?.started === true;
  const handedOff = useRef(false);

  useEffect(() => {
    if (!started || handedOff.current) return;
    handedOff.current = true;
    holdClient(client);
    onStarted(client.matchId);
  }, [started, client, onStarted]);

  const fatal = snapshot.online?.lastError?.fatal ? snapshot.online.lastError : null;
  const cancel = () => {
    client.stop();
    onExit();
  };
  return (
    <>
      <FindingPlayersView snapshot={snapshot} onCancel={cancel} />
      {fatal ? <OnlineErrorSheet message={onlineErrorMessage(fatal.code, tr)} onExit={cancel} /> : null}
    </>
  );
}

/**
 * The waiting room, from a client snapshot (null while still looking for a table).
 * Only shows what the server reported: no seat count before the first snapshot,
 * no bot countdown until the server runs one.
 */
export function FindingPlayersView({ snapshot, onCancel }: { snapshot: GameSnapshot | null; onCancel: () => void }) {
  const { skin } = useSkin();
  const tr = useT();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const online = snapshot?.online;
  const backfill = useCountdown(online?.backfillAt ?? null);
  const seatsKnown = snapshot !== null && snapshot.players.length > 0 && online !== undefined;
  const status = snapshot?.connection ? connectionLabel(snapshot.connection, tr) : tr('finding.looking');

  return (
    <View style={styles.root} testID="finding-players">
      <Panel variant="sheet" style={styles.sheet}>
        <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]} accessibilityRole="header">
          {tr('finding.title')}
        </Text>

        {seatsKnown ? (
          <View
            style={styles.seats}
            accessible
            accessibilityLabel={tr('finding.seatsFilled', { filled: online.seatsFilled, total: online.seatCount })}
            testID="finding-seats"
          >
            <View style={styles.dots}>
              {Array.from({ length: online.seatCount }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    { borderColor: t.colors.accent },
                    i < online.seatsFilled && { backgroundColor: t.colors.accent },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.count, { color: t.colors.panelText, fontFamily: t.fonts.numeric }]}>
              {online.seatsFilled}/{online.seatCount}
            </Text>
          </View>
        ) : null}

        {backfill !== null && backfill.secondsLeft !== null ? (
          <Text
            style={[styles.line, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
            accessibilityRole="timer"
            testID="finding-backfill"
          >
            {backfill.secondsLeft > 0 ? tr('finding.botsIn', { seconds: backfill.secondsLeft }) : tr('finding.botsJoining')}
          </Text>
        ) : null}

        <Text
          style={[styles.line, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyItalic }]}
          accessibilityLiveRegion="polite"
          testID="finding-status"
        >
          {status}
        </Text>

        <ActionButton label={tr('common.cancel')} onPress={onCancel} testID="finding-cancel" />
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 420, gap: 12, alignItems: 'stretch' },
  title: { fontSize: 26, textAlign: 'center' },
  seats: { alignItems: 'center', gap: 6 },
  dots: { flexDirection: 'row', gap: 10 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  count: { fontSize: 28 },
  line: { fontSize: 14, textAlign: 'center' },
});
