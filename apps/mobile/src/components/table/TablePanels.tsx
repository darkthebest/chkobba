import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { TableController } from '@/game/useTableController';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { MyEmote } from '../emotes/EmoteBar';
import { InviteBadge } from '../friends/InviteBadge';
import { TurnClock } from '../Seat';
import { SoundButton } from '../SoundControls';

/** Score in the active skin's style, from the viewer's team perspective. */
export function TableScoreBoard({ c }: { c: TableController }) {
  const { ScoreBoard } = useSkin().skin.components;
  const { view, myTeam, theirTeam } = c;
  return (
    <ScoreBoard
      scores={{ us: view.scores[myTeam], them: view.scores[theirTeam] }}
      chkobbas={{ us: view.chkobbas[myTeam], them: view.chkobbas[theirTeam] }}
      piles={{ us: view.pileCounts[myTeam], them: view.pileCounts[theirTeam] }}
      round={view.round}
      target={view.rules.targetScore}
      stock={view.stockCount}
      dealerName={c.players[view.dealer]?.name ?? ''}
    />
  );
}

/** The last few readable events; the newest line is emphasised. */
export function ActionLog({ c, lines: count, style }: { c: TableController; lines: number; style?: StyleProp<ViewStyle> }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const lines = c.logLines(count);
  return (
    <Panel variant="log" style={[styles.log, style]}>
      {lines.map((line, i) => {
        const latest = i === lines.length - 1;
        return (
          <Text
            key={`${c.log.length}-${i}`}
            numberOfLines={1}
            style={{
              color: latest ? t.colors.panelText : t.colors.panelMuted,
              fontFamily: latest ? t.fonts.bodyBold : t.fonts.bodyItalic,
              fontSize: latest ? 13 : 11,
              lineHeight: latest ? 18 : 16,
            }}
          >
            {line}
          </Text>
        );
      })}
    </Panel>
  );
}

/** "You" row: avatar, and either the your-turn pill or who we are waiting for. Desktop shows our bubble by the quick row instead. */
export function TurnStatus({ c, showMyEmote = true }: { c: TableController; showMyEmote?: boolean }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Avatar } = skin.components;
  const tr = useT();
  return (
    <View style={styles.meRow}>
      <View>
        <TurnClock
          secondsLeft={c.turnTimer?.seat === c.mySeat ? c.turnTimer.secondsLeft : undefined}
          owner={tr('seat.yourTime')}
          testID="my-clock"
        >
          <Avatar
            initial={tr('common.youInitial')}
            side="us"
            isTurn={c.myTurn}
            isDealer={c.view.dealer === c.mySeat}
            size="sm"
            progress={c.progressOf(c.mySeat)}
          />
        </TurnClock>
        {showMyEmote ? <MyEmote seat={c.mySeat} /> : null}
      </View>
      <Text style={[styles.me, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>
        {tr('common.you')}
      </Text>
      {c.iAmCutting ? (
        <View style={[styles.pill, { backgroundColor: t.colors.accent }]} testID="status">
          <Text style={[styles.pillText, { color: t.colors.onAccent, fontFamily: t.fonts.bodyBold }]}>
            {tr('status.yourCut')}
          </Text>
        </View>
      ) : c.cutting ? (
        <Text style={[styles.waiting, { color: t.colors.textMuted, fontFamily: t.fonts.bodyItalic }]} testID="status">
          {tr('status.cutting', { name: c.players[c.cutting.seat]?.name ?? '' })}
        </Text>
      ) : c.myTurn ? (
        <View style={[styles.pill, { backgroundColor: t.colors.accent }]} testID="status">
          <Text style={[styles.pillText, { color: t.colors.onAccent, fontFamily: t.fonts.bodyBold }]}>
            {c.hints && c.selectedMoves.length > 0 ? tr('status.pickCapture') : tr('status.yourTurn')}
          </Text>
        </View>
      ) : (
        <Text style={[styles.waiting, { color: t.colors.textMuted, fontFamily: t.fonts.bodyItalic }]} testID="status">
          {c.waitingFor ? tr('status.waitingFor', { name: c.waitingFor }) : ''}
        </Text>
      )}
      <View>
        <SoundButton />
        {/* Live table invites wait here during a hand; the banner shows them after the game. */}
        <InviteBadge style={styles.inviteBadge} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  log: { minHeight: 52, justifyContent: 'center' },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  me: { fontSize: 14 },
  pill: { marginStart: 'auto', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { fontSize: 12 },
  waiting: { marginStart: 'auto', fontSize: 12 },
  inviteBadge: { position: 'absolute', top: -4, end: -4 },
});
