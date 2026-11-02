import { StyleSheet, Text, View } from 'react-native';

import type { ConnectionState } from '@/game/GameClient';
import { useT } from '@/i18n';
import { useSkin } from '@/skins';

/** Online only: a strip above the table while the link to the server is down. Renders nothing otherwise. */
export function ReconnectingBanner({ connection }: { connection: ConnectionState | undefined }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  if (connection === undefined || connection === 'online') return null;
  return (
    <View
      style={[styles.banner, { backgroundColor: t.colors.warnBg, borderRadius: t.radii.option }]}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="reconnecting-banner"
    >
      <Text style={[styles.text, { color: t.colors.warnText, fontFamily: t.fonts.bodyBold }]}>
        {connection === 'reconnecting' ? tr('online.reconnecting') : tr('online.connecting')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  text: { fontSize: 13 },
});
