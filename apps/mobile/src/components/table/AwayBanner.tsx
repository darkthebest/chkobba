import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { useSkin } from '@/skins';

interface AwayBannerProps {
  away: boolean;
  onBack: () => void;
}

/** Online only: a strip above the table while the server has us away and a bot plays our turns. */
export function AwayBanner({ away, onBack }: AwayBannerProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  if (!away) return null;
  return (
    <View style={[styles.banner, { backgroundColor: t.colors.warnBg, borderRadius: t.radii.option }]} testID="away-banner">
      {/* The role sits on the text, not the strip, so the button stays separately focusable for screen readers. */}
      <Text
        style={[styles.text, { color: t.colors.warnText, fontFamily: t.fonts.bodyBold }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        {tr('online.away')}
      </Text>
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={tr('online.imBack')}
        hitSlop={8}
        testID="away-back"
        style={({ pressed }) => [
          styles.button,
          { borderColor: t.colors.warnText, borderRadius: t.radii.button, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.text, { color: t.colors.warnText, fontFamily: t.fonts.bodyBold }]}>{tr('online.imBack')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  text: { fontSize: 13 },
  button: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 4 },
});
