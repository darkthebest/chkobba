import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useT } from '@/i18n';
import { useSocial } from '@/online/socialContext';
import { useSkin } from '@/skins';

import { liveInviteCount } from './InviteBanner';

/**
 * A quiet count of live table invites, pinned to the table's sound button.
 * During a hand the banner and toasts wait, so this is all the player sees;
 * it never takes a tap. Hidden when there are none.
 */
export function InviteBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { state } = useSocial();
  const { skin } = useSkin();
  const c = skin.tokens.colors;
  const tr = useT();
  const count = liveInviteCount(state.invites);
  if (count === 0) return null;
  return (
    <View
      pointerEvents="none"
      accessible
      accessibilityRole="text"
      accessibilityLabel={tr('invite.badge', { count })}
      testID="invite-badge"
      style={[styles.badge, { backgroundColor: c.accent, borderColor: c.segmentBg }, style]}
    >
      <Text style={[styles.text, { color: c.onAccent, fontFamily: skin.tokens.fonts.bodyBold }]}>
        {count > 9 ? '9+' : String(count)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: 10, lineHeight: 12 },
});
