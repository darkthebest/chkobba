import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ShareState } from '@/game/useRoomController';
import { DirectionView, useT } from '@/i18n';
import { useSkin } from '@/skins';

export interface RoomCodeProps {
  code: string;
  /** The share link for the fallback; null when no web base URL is configured. */
  link: string | null;
  shareState: ShareState;
  onShare: () => void;
  onCopy: () => void;
}

/**
 * The room code in large type with Share and Copy. When neither works on this
 * device, the code (and link) appear as selectable text the player can copy by hand.
 */
export function RoomCode({ code, link, shareState, onShare, onCopy }: RoomCodeProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>{tr('room.codeLabel')}</Text>
      {/* Codes are Latin letters and digits: they must never mirror under an RTL language. */}
      <DirectionView dir="ltr">
        <Text
          style={[styles.code, { color: t.colors.panelText, fontFamily: t.fonts.numeric }]}
          // Spelled out, so screen readers don't try to pronounce the code as a word.
          accessibilityLabel={code.split('').join(' ')}
          testID="room-code"
        >
          {code}
        </Text>
      </DirectionView>

      <View style={styles.actions}>
        <CodeButton label={tr('room.share')} onPress={onShare} primary testID="room-share" />
        <CodeButton label={tr('room.copy')} onPress={onCopy} testID="room-copy" />
      </View>

      <View accessibilityLiveRegion="polite">
        {shareState === 'copied' ? (
          <Text style={[styles.note, { color: t.colors.accent, fontFamily: t.fonts.bodyBold }]} testID="room-copied">
            {tr('room.copied')}
          </Text>
        ) : null}
        {shareState === 'unavailable' ? (
          <View style={[styles.fallback, { borderColor: t.colors.segmentBorder, borderRadius: t.radii.button }]} testID="room-code-fallback">
            <Text style={[styles.note, { color: t.colors.panelText, fontFamily: t.fonts.body }]}>{tr('room.linkUnavailable')}</Text>
            <DirectionView dir="ltr" style={styles.fallbackValues}>
              <Text selectable style={[styles.fallbackCode, { color: t.colors.panelText, fontFamily: t.fonts.numeric }]}>
                {code}
              </Text>
              {link !== null ? (
                <Text selectable style={[styles.fallbackLink, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
                  {link}
                </Text>
              ) : null}
            </DirectionView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

interface CodeButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  testID: string;
}

function CodeButton({ label, onPress, primary = false, testID }: CodeButtonProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
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
  root: { gap: 8, alignItems: 'stretch' },
  label: { fontSize: 14, textAlign: 'center' },
  code: { fontSize: 40, letterSpacing: 6, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flexGrow: 1, flexBasis: 0, minHeight: 44, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  buttonText: { fontSize: 15 },
  note: { fontSize: 14, textAlign: 'center' },
  fallback: { gap: 6, padding: 10, borderWidth: 1 },
  fallbackValues: { alignItems: 'center', gap: 2 },
  fallbackCode: { fontSize: 22, letterSpacing: 4 },
  fallbackLink: { fontSize: 13 },
});
