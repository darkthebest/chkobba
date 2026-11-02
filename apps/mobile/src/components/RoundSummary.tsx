import type { PlayerView, Team, TeamRoundScore } from '@chkobba/rules';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MATCH_WIN_COINS } from '@/decks';
import { useT, type TFunction } from '@/i18n';
import { useSkin } from '@/skins';

import { InviteBanner } from './friends/InviteBanner';

interface RoundSummaryProps {
  view: PlayerView;
  myTeam: Team;
  onNextRound: () => void;
  /** Online: the server starts the next round by itself, so there is no button, only a countdown. */
  autoNextRound?: { secondsLeft: number | null } | null;
  onNewGame: () => void;
  /** Label of the game-over primary button; defaults to "Play again" (a private table goes back to its room). */
  newGameLabel?: string;
  onExit: () => void;
}

type ScoreKey = keyof TeamRoundScore['points'];
type Row = { key: ScoreKey; detail: (t: TeamRoundScore, tr: TFunction) => string };

const ROWS: Row[] = [
  { key: 'karta', detail: (t, tr) => tr('summary.cards', { count: t.cards }) },
  { key: 'dineri', detail: (t) => `${t.dineri} ♦` },
  { key: 'bermila', detail: (t) => `${t.sevens}×7 · ${t.sixes}×6` },
  { key: 'haya', detail: (t) => (t.hasHaya ? '7♦' : '—') },
  { key: 'chkobba', detail: (t, tr) => tr('summary.sweeps', { count: t.chkobbas }) },
];

export function RoundSummary({ view, myTeam, onNextRound, autoNextRound, onNewGame, newGameLabel, onExit }: RoundSummaryProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  const result = view.lastRound;
  if (!result) return null;

  const theirTeam = (1 - myTeam) as Team;
  const us = result.teams[myTeam];
  const them = result.teams[theirTeam];
  const gameOver = view.phase === 'gameOver';
  const won = view.winner === myTeam;

  const title = gameOver ? (won ? tr('summary.youWin') : tr('summary.youLose')) : tr('summary.roundDone', { round: result.round });

  const points = (n: number, side: 'us' | 'them', big = false) => {
    const color = n > 0 ? t.colors[side] : t.colors.panelMuted;
    return (
      <Text
        style={[
          styles.pt,
          { color, fontFamily: t.fonts.numeric, fontSize: big ? 28 : 24 },
          n > 0 && t.circleWins && !big && [styles.circled, { borderColor: color }],
        ]}
      >
        {big ? n : n > 0 ? `+${n}` : '·'}
      </Text>
    );
  };

  return (
    <View style={[styles.scrim, { backgroundColor: t.colors.overlay }]} testID="round-summary">
      <Panel variant="sheet" style={styles.sheet}>
        <Text style={[styles.title, { color: gameOver ? t.colors[won ? 'us' : 'them'] : t.colors.panelText, fontFamily: t.fonts.display }]}>
          {title}
        </Text>

        <View style={styles.row}>
          <View style={styles.labelCell} />
          <Text style={[styles.head, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }]}>{tr('score.us')}</Text>
          <Text style={[styles.head, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }]}>{tr('score.them')}</Text>
        </View>
        {ROWS.map((row) => (
          <View style={[styles.row, styles.ruled]} key={row.key}>
            <View style={styles.labelCell}>
              <Text style={[styles.label, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}>{tr(`scoring.${row.key}`)}</Text>
            </View>
            {[us, them].map((team, i) => (
              <View style={styles.cell} key={i}>
                {points(team.points[row.key], i === 0 ? 'us' : 'them')}
                <Text style={[styles.detail, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyItalic }]}>{row.detail(team, tr)}</Text>
              </View>
            ))}
          </View>
        ))}
        <View style={[styles.row, styles.total, { borderTopColor: t.colors.panelText }]}>
          <Text style={[styles.labelCell, styles.label, { color: t.colors.panelText, fontFamily: t.fonts.display }]}>{tr('summary.round')}</Text>
          <View style={styles.cell}>{points(us.total, 'us', true)}</View>
          <View style={styles.cell}>{points(them.total, 'them', true)}</View>
        </View>
        <View style={styles.row}>
          <Text style={[styles.labelCell, styles.label, { color: t.colors.panelText, fontFamily: t.fonts.display }]}>
            {tr('summary.game')} <Text style={[styles.detail, { color: t.colors.panelMuted }]}>/ {view.rules.targetScore}</Text>
          </Text>
          <View style={styles.cell}>{points(view.scores[myTeam], 'us', true)}</View>
          <View style={styles.cell}>{points(view.scores[theirTeam], 'them', true)}</View>
        </View>

        {gameOver && won ? (
          <Text
            style={[styles.reward, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }]}
            testID="match-win-coins"
          >
            {tr('vault.matchWin', { coins: MATCH_WIN_COINS })}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {gameOver ? (
            <>
              <Button label={newGameLabel ?? tr('summary.playAgain')} onPress={onNewGame} primary />
              <Button label={tr('summary.home')} onPress={onExit} />
            </>
          ) : autoNextRound ? (
            <Text
              style={[styles.autoNext, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
              accessibilityRole="timer"
              accessibilityLiveRegion="polite"
              testID="next-round-countdown"
            >
              {autoNextRound.secondsLeft === null ? tr('summary.nextStarting') : tr('summary.nextIn', { seconds: autoNextRound.secondsLeft })}
            </Text>
          ) : (
            <Button label={tr('summary.nextRound')} onPress={onNextRound} primary />
          )}
        </View>
      </Panel>
      {/* Between games, a waiting table invite may show (never during a hand). */}
      {gameOver ? <InviteBanner style={styles.invite} /> : null}
    </View>
  );
}

function Button({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.button,
        { borderRadius: t.radii.button, borderColor: primary ? t.colors.accent : t.colors.panelMuted },
        primary && { backgroundColor: t.colors.accent },
      ]}
    >
      <Text style={[styles.buttonText, { fontFamily: t.fonts.bodyBold, color: primary ? t.colors.onAccent : t.colors.panelText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 14, zIndex: 20 },
  sheet: { width: '100%', maxWidth: 400 },
  invite: { width: '100%', maxWidth: 400, marginTop: 10 },
  title: { fontSize: 26, textAlign: 'center', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.35)' },
  total: { borderTopWidth: 2, marginTop: 2, paddingTop: 8 },
  labelCell: { flex: 1.3 },
  label: { fontSize: 15 },
  head: { flex: 1, textAlign: 'center', fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
  cell: { flex: 1, alignItems: 'center' },
  pt: { minWidth: 36, textAlign: 'center' },
  circled: { borderWidth: 2.5, borderRadius: 999, paddingHorizontal: 4, transform: [{ rotate: '-4deg' }] },
  detail: { fontSize: 11 },
  reward: { fontSize: 12, textAlign: 'center', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  button: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 2 },
  buttonText: { fontSize: 15 },
  autoNext: { flex: 1, textAlign: 'center', fontSize: 15, paddingVertical: 12 },
});
