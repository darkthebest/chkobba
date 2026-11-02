import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import type { CardFaceProps } from '@/skins/types';

import { TUNISIAN_DECK } from './tunisianDeck';

/** The Tunisian café deck: French-pattern courts and plain pips, as printed under the RT monopoly. */
export function CafeCardFace({ card }: CardFaceProps) {
  return (
    <View style={styles.face} pointerEvents="none">
      <SvgXml xml={TUNISIAN_DECK[card.id]} width="100%" height="100%" />
    </View>
  );
}

const styles = StyleSheet.create({
  // The artwork is a full white card; clip it inside the frame's rounded border (radii.card 7, minus the 1px border).
  face: { ...StyleSheet.absoluteFill, borderRadius: 6, overflow: 'hidden' },
});
