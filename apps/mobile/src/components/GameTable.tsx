import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDeck } from '@/decks';

import { useTableSounds } from '@/audio/useTableSounds';
import { useEmoteKeyboard } from '@/emotes/useEmoteKeyboard';
import { EmotesContext, useEmotes } from '@/emotes/useEmotes';
import type { GameClient } from '@/game/GameClient';
import { useTableController } from '@/game/useTableController';
import { useTableKeyboard } from '@/game/useTableKeyboard';
import { useLayout } from '@/layout';

import { EmotePicker, PICKER_ORDER } from './emotes/EmotePicker';
import { OnlineErrorSheet } from './OnlineErrorSheet';
import { RoundSummary } from './RoundSummary';
import { DealerDrawIntro } from './table/DealerDrawIntro';
import { DesktopLayout } from './table/DesktopLayout';
import { PhoneLayout } from './table/PhoneLayout';

interface GameTableProps {
  client: GameClient;
  onNewGame: () => void;
  /** Label of the final summary's primary button (default "Play again"). */
  newGameLabel?: string;
  onExit: () => void;
}

export function GameTable({ client, onNewGame, newGameLabel, onExit }: GameTableProps) {
  const c = useTableController(client);
  const { awardWin } = useDeck();
  const rewarded = useRef(false);

  useEffect(() => {
    if (rewarded.current) return;
    if (c.view.phase !== 'gameOver' || c.view.winner !== c.myTeam) return;
    rewarded.current = true;
    awardWin();
  }, [awardWin, c.myTeam, c.view.phase, c.view.winner]);
  const { desktop, width, height } = useLayout();
  useTableKeyboard(c);
  useTableSounds(c);
  const emotes = useEmotes(client, c.mySeat, c.players);
  // No emote keys while the player sheet is open.
  useEmoteKeyboard(emotes, PICKER_ORDER, undefined, c.playerSheetSeat !== null);

  return (
    <EmotesContext.Provider value={emotes}>
      <View style={styles.root}>
        {desktop ? <DesktopLayout c={c} width={width} height={height} /> : <PhoneLayout c={c} />}
        <EmotePicker />
        <DealerDrawIntro c={c} />
        {c.showSummary ? (
          <RoundSummary
            view={c.view}
            myTeam={c.myTeam}
            onNextRound={c.nextRound}
            autoNextRound={c.autoNextRound}
            onNewGame={onNewGame}
            newGameLabel={newGameLabel}
            onExit={onExit}
          />
        ) : null}
        {c.fatalError ? <OnlineErrorSheet message={c.fatalError} onExit={onExit} /> : null}
      </View>
    </EmotesContext.Provider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
