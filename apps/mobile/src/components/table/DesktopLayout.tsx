import { StyleSheet, Text, View } from 'react-native';

import type { TableController } from '@/game/useTableController';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { CaptureOptions } from '../CaptureOptions';
import { EmoteBar, MyEmote } from '../emotes/EmoteBar';
import { HandFan } from '../HandFan';
import { AwayBanner } from './AwayBanner';
import { PlayerSheet } from './PlayerSheet';
import { ReconnectingBanner } from './ReconnectingBanner';
import { TableArea } from './TableArea';
import { ActionLog, TableScoreBoard, TurnStatus } from './TablePanels';

interface DesktopLayoutProps {
  c: TableController;
  width: number;
  height: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const SIDE_PANEL_WIDTH = 380;

/**
 * Landscape layout for desktop browsers: a large table with your hand beneath
 * it, and a side panel for the score, turn, capture choices and a longer log.
 */
export function DesktopLayout({ c, width, height }: DesktopLayoutProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  // Cards grow with whichever is tighter: the window height or the table's width beside the side panel.
  const tableWidth = Math.min(width, 1500) - SIDE_PANEL_WIDTH - 48;
  const tableScale = clamp(Math.min(height / 480, tableWidth / 440), 1.2, 2.2);
  const handScale = clamp(Math.min(height / 680, tableWidth / 380), 1.1, 1.6);

  return (
    <View style={styles.root} testID="desktop-layout">
      <View style={styles.main}>
        <ReconnectingBanner connection={c.connection} />
        <AwayBanner away={c.away} onBack={c.imBack} />
        <TableArea c={c} cardScale={tableScale} />
        {/* Hand centred; the quick row sits in the start corner (bottom left, bottom right in RTL). */}
        <View style={styles.handRow} testID="hand-row">
          <View style={styles.handSide}>
            <View>
              <MyEmote seat={c.mySeat} />
              <EmoteBar style={styles.emoteBar} />
            </View>
          </View>
          <HandFan
            cards={c.view.hand}
            selectedId={c.selectedId}
            enabled={c.myTurn}
            onPress={c.pressHandCard}
            onHover={c.hover}
            scale={handScale}
            shake={c.shake}
          />
          <View style={styles.handSide} />
        </View>
      </View>

      <View style={styles.side}>
        <TableScoreBoard c={c} />
        <TurnStatus c={c} showMyEmote={false} />
        {c.hints && c.selectedMoves.length > 0 ? (
          <CaptureOptions moves={c.selectedMoves} table={c.view.table} rules={c.view.rules} onPlay={c.play} />
        ) : (
          <Text style={[styles.hint, { color: t.colors.textMuted, fontFamily: t.fonts.body }]}>
            {c.hints
              ? c.myTurn
                ? tr('desktop.turnHint')
                : tr('desktop.keyboardHint')
              : c.myTurn
                ? tr('desktop.pickTurnHint')
                : tr('desktop.pickKeyboardHint')}
          </Text>
        )}
        {c.error ? <Text style={styles.error}>{c.error}</Text> : null}
        <ActionLog c={c} lines={8} style={styles.log} />
      </View>
      <PlayerSheet c={c} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', gap: 16, padding: 16, width: '100%', maxWidth: 1500, alignSelf: 'center' },
  main: { flex: 1, gap: 8 },
  handRow: { flexDirection: 'row', alignItems: 'flex-end' },
  handSide: { flex: 1, alignItems: 'flex-start', paddingBottom: 8 },
  emoteBar: { justifyContent: 'flex-start', flexWrap: 'wrap' },
  side: { width: SIDE_PANEL_WIDTH, gap: 12 },
  hint: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
  error: { color: '#e4572e' },
  log: { minHeight: 150, justifyContent: 'flex-end' },
});
