import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { useSkin } from '@/skins';

import { LobbyIcon } from './LobbyIcons';

interface LobbySheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
}

/** Modal panel over the lobby (bot setup, settings), styled by the active skin. */
export function LobbySheet({ title, onClose, children, testID }: LobbySheetProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  return (
    <View style={[styles.overlay, { backgroundColor: t.colors.overlay }]} testID={testID}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={tr('common.close')} />
      <Panel variant="sheet" style={styles.sheet}>
        <View style={styles.head}>
          <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]}>
            {title}
          </Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={tr('common.close')} testID="sheet-close" hitSlop={10}>
            <LobbyIcon name="close" color={t.colors.panelMuted} size={22} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 20 },
  sheet: { width: '100%', maxWidth: 460, maxHeight: '90%' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 22, flexShrink: 1 },
  body: { gap: 14, paddingBottom: 4 },
});
