import { StyleSheet, Text, View } from 'react-native';

import type { TableController } from '@/game/useTableController';

import { CaptureOptions } from '../CaptureOptions';
import { EmoteBar } from '../emotes/EmoteBar';
import { HandFan } from '../HandFan';
import { AwayBanner } from './AwayBanner';
import { PlayerSheet } from './PlayerSheet';
import { ReconnectingBanner } from './ReconnectingBanner';
import { TableArea } from './TableArea';
import { ActionLog, TableScoreBoard, TurnStatus } from './TablePanels';

/** Portrait stack for phones: score, table, log, then your hand under the thumb. */
export function PhoneLayout({ c }: { c: TableController }) {
  return (
    <View style={styles.root} testID="phone-layout">
      <ReconnectingBanner connection={c.connection} />
      <AwayBanner away={c.away} onBack={c.imBack} />
      <TableScoreBoard c={c} />
      <TableArea c={c} />
      <ActionLog c={c} lines={3} />
      {c.error ? <Text style={styles.error}>{c.error}</Text> : null}
      <View testID="bottom">
        {/* Options float above the hand (over the log) so choosing never squeezes the layout. */}
        {c.hints && c.selectedMoves.length > 0 ? (
          <View style={styles.options}>
            <CaptureOptions moves={c.selectedMoves} table={c.view.table} rules={c.view.rules} onPlay={c.play} />
          </View>
        ) : null}
        <EmoteBar />
        <TurnStatus c={c} />
        <HandFan cards={c.view.hand} selectedId={c.selectedId} enabled={c.myTurn} onPress={c.pressHandCard} shake={c.shake} />
      </View>
      <PlayerSheet c={c} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: 10, paddingTop: 6, gap: 6 },
  error: { color: '#e4572e', textAlign: 'center' },
  options: { position: 'absolute', left: 0, right: 0, bottom: '100%', marginBottom: 6, zIndex: 5 },
});
