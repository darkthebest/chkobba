import type { Seat } from '@chkobba/rules';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useEmotesContext } from '@/emotes/useEmotes';
import type { TableController } from '@/game/useTableController';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import type { Position } from '../MotionCard';
import { EmoteBubble, type BubbleTail } from './EmoteBubble';

/** Where a seat's bubble and menu sit, pointing back at its avatar (physical left/right, like the seats). */
const PLACES: Record<Exclude<Position, 'bottom'>, { box: ViewStyle; tail: BubbleTail }> = {
  top: { box: { top: 58, left: 0, right: 0, alignItems: 'center' }, tail: 'top' },
  left: { box: { left: 66, top: 56, bottom: 0, justifyContent: 'center', marginTop: -70 }, tail: 'left' },
  right: { box: { right: 66, top: 56, bottom: 0, justifyContent: 'center', alignItems: 'flex-end', marginTop: -70 }, tail: 'right' },
};

/** The other seats' emote bubbles, and the per-seat mute menu, drawn over the table. */
export function EmoteLayer({ c }: { c: TableController }) {
  const emotes = useEmotesContext();
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  if (!emotes?.enabled) return null;

  const placeOf = (seat: Seat) => {
    const position = c.positionOf(seat);
    return position === 'bottom' ? null : PLACES[position];
  };
  const menuPlace = emotes.menuSeat === null ? null : placeOf(emotes.menuSeat);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {[...emotes.bubbles].map(([seat, bubble]) => {
        const place = seat === c.mySeat ? null : placeOf(seat);
        if (!place) return null;
        return (
          <View key={seat} style={[styles.box, place.box]} pointerEvents="none">
            <EmoteBubble key={bubble.key} id={bubble.id} tail={place.tail} style={styles.inFlow} testID={`emote-${seat}`} />
          </View>
        );
      })}
      {emotes.menuSeat !== null && menuPlace ? (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => emotes.setMenuSeat(null)} accessibilityLabel={tr('common.close')} />
          <View style={[styles.box, menuPlace.box]} pointerEvents="box-none">
            <Pressable
              onPress={() => emotes.toggleMute(emotes.menuSeat!)}
              accessibilityRole="button"
              testID="emote-mute"
              style={[styles.menu, { backgroundColor: t.colors.segmentBg, borderColor: t.colors.segmentBorder, borderRadius: t.radii.button }]}
            >
              <Text style={[styles.menuText, { color: t.colors.segmentText, fontFamily: t.fonts.bodyBold }]}>
                {emotes.muted.has(emotes.menuSeat) ? `🔊 ${tr('emotes.unmute')}` : `🔇 ${tr('emotes.mute')}`}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', zIndex: 30 },
  inFlow: { position: 'relative' },
  menu: { borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 8 },
  menuText: { fontSize: 13 },
});
