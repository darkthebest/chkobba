import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { useSkin } from '@/skins';

interface OnlineErrorSheetProps {
  message: string;
  onExit: () => void;
}

/** A fatal online error (the table cannot be joined or rejoined): the reason and a way back to the lobby. */
export function OnlineErrorSheet({ message, onExit }: OnlineErrorSheetProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  return (
    <View style={[styles.scrim, { backgroundColor: t.colors.overlay }]} testID="online-error">
      <Panel variant="sheet" style={styles.sheet}>
        <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]}>{tr('online.connectionProblem')}</Text>
        <Text
          style={[styles.message, { color: t.colors.panelText, fontFamily: t.fonts.body }]}
          accessibilityRole="alert"
          testID="online-error-message"
        >
          {message}
        </Text>
        <Pressable
          onPress={onExit}
          accessibilityRole="button"
          testID="online-error-back"
          style={[styles.button, { backgroundColor: t.colors.accent, borderRadius: t.radii.button }]}
        >
          <Text style={[styles.buttonText, { color: t.colors.onAccent, fontFamily: t.fonts.bodyBold }]}>{tr('common.backToLobby')}</Text>
        </Pressable>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 30 },
  sheet: { width: '100%', maxWidth: 400, gap: 12 },
  title: { fontSize: 22, textAlign: 'center' },
  message: { fontSize: 15, textAlign: 'center' },
  button: { paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 15 },
});
