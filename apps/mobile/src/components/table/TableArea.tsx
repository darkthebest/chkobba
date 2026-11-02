import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useEmotesContext } from '@/emotes/useEmotes';
import type { TableController } from '@/game/useTableController';
import { DirectionView, useT } from '@/i18n';
import { useSkin } from '@/skins';

import { Card } from '../Card';
import { EmoteLayer } from '../emotes/EmoteLayer';
import { DEAL_STAGGER_MS, MotionCard, type Position } from '../MotionCard';
import { Seat } from '../Seat';
import { Shake } from '../Shake';
import { CutPrompt } from './CutPrompt';

interface TableAreaProps {
  c: TableController;
  /** Card scale on the table (1 on phones, larger on desktop). */
  cardScale?: number;
  style?: StyleProp<ViewStyle>;
}

/** The felt: the other seats around the mat of face-up cards, plus the chkobba celebration. */
export function TableArea({ c, cardScale = 1, style }: TableAreaProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { TableSurface, Celebration } = skin.components;
  const tr = useT();
  const { view, staged } = c;
  const taking = new Set(staged.taking);
  const choosing = c.selectedMoves.length > 0;
  const emotes = useEmotesContext();

  const seatAt = (position: Position) => {
    const seat = [0, 1, 2, 3].slice(0, view.playerCount).find((s) => c.positionOf(s) === position);
    if (seat === undefined || seat === c.mySeat) return null;
    return (
      <Seat
        player={c.players[seat]!}
        cardCount={view.handCounts[seat] ?? 0}
        isTurn={view.phase === 'playing' && view.turn === seat}
        isPartner={seat % 2 === c.myTeam}
        isDealer={view.dealer === seat}
        vertical={position === 'left' || position === 'right'}
        progress={c.progressOf(seat)}
        secondsLeft={c.turnTimer?.seat === seat ? c.turnTimer.secondsLeft : undefined}
        onPress={emotes?.enabled ? () => emotes.setMenuSeat(emotes.menuSeat === seat ? null : seat) : undefined}
        onOpenPlayer={c.canOpenPlayerSheet(seat) ? () => c.openPlayerSheet(seat) : undefined}
        emotesMuted={emotes?.muted.has(seat)}
      />
    );
  };

  return (
    <TableSurface style={[styles.surface, style]}>
      {/* Seats and card motion use physical left/right, so the table never mirrors in right-to-left languages. */}
      <DirectionView dir="ltr" style={styles.spatial}>
        <View style={styles.topRow}>{seatAt('top')}</View>
        <View style={styles.middleRow}>
          {view.playerCount === 4 ? <View style={styles.side}>{seatAt('left')}</View> : null}
          <View style={[styles.mat, { borderColor: t.colors.matBorder, backgroundColor: t.colors.matBg, gap: 12 * cardScale, columnGap: 6 * cardScale }]} testID="table">
            {/* With a card selected, a press on the mat outside the cards places it. This sits behind the
                cards rather than around them, so a press on a card never bubbles up to it (it does on web). */}
            <Pressable
              onPress={choosing ? c.pressMat : undefined}
              disabled={!choosing}
              accessibilityRole={choosing ? 'button' : undefined}
              accessibilityLabel={choosing ? tr('table.placeHere') : undefined}
              style={StyleSheet.absoluteFill}
              testID="table-mat"
            />
            {staged.cards.length === 0 ? (
              <Text
                style={[styles.empty, { color: t.colors.textMuted, fontFamily: t.fonts.bodyItalic }]}
                pointerEvents="none"
              >
                {tr('table.empty')}
              </Text>
            ) : null}
            {staged.cards.map((card, i) => {
              const cardBadges = c.badges.get(card.id);
              const leaving = taking.has(card.id);
              const picked = c.picked.includes(card.id);
              const isLatest = c.latestPlay?.id === card.id;
              return (
                <MotionCard
                  key={card.id}
                  enterFrom={isLatest && c.latestPlay ? c.positionOf(c.latestPlay.seat) : 'center'}
                  delay={isLatest ? 0 : i * DEAL_STAGGER_MS}
                  sweepTo={leaving && staged.sweeping && staged.takingSeat !== null ? c.positionOf(staged.takingSeat) : null}
                >
                  <Shake trigger={c.shake?.id === card.id ? c.shake.seq : 0}>
                    <Card
                      card={card}
                      size="md"
                      scale={cardScale}
                      highlighted={cardBadges !== undefined || picked || leaving}
                      dimmed={c.badges.size > 0 && cardBadges === undefined}
                      badges={cardBadges}
                      lastPlayed={c.lastPlaced?.id === card.id}
                      tag={c.lastPlaced?.id === card.id ? c.lastPlaced.by : undefined}
                      // Every card takes the press while choosing, so a tap on a card never falls through to the mat.
                      onPress={choosing ? () => c.pressTableCard(card) : undefined}
                    />
                  </Shake>
                </MotionCard>
              );
            })}
          </View>
          {view.playerCount === 4 ? <View style={styles.side}>{seatAt('right')}</View> : null}
        </View>
        <EmoteLayer c={c} />
      </DirectionView>
      <CutPrompt c={c} />
      {c.celebration ? (
        <Celebration key={c.celebration.seq} byName={c.celebration.byName} side={c.celebration.side} />
      ) : null}
    </TableSurface>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1 },
  spatial: { flex: 1 },
  topRow: { alignItems: 'center', minHeight: 56 },
  middleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  side: { width: 62, alignItems: 'center' },
  mat: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'center',
    justifyContent: 'center',
    padding: 8,
    margin: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  empty: { textAlign: 'center', fontSize: 13 },
});
