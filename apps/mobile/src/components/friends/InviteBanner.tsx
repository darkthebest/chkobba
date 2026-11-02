import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useT } from '@/i18n';
import { useSocial } from '@/online/socialContext';
import type { TableInvite } from '@/online/socialSocket';
import { useSkin } from '@/skins';

/** The invite to show: the newest one still in the list (dismissed ones are already gone), or null. */
export function newestInvite(invites: readonly TableInvite[]): TableInvite | null {
  let newest: TableInvite | null = null;
  for (const invite of invites) {
    if (newest === null || invite.sentAt > newest.sentAt) newest = invite;
  }
  return newest;
}

/** Invites that can still be joined (not past their time to live). */
export function liveInviteCount(invites: readonly TableInvite[]): number {
  return invites.filter((invite) => !invite.expired).length;
}

export interface InviteBannerProps {
  style?: StyleProp<ViewStyle>;
}

/**
 * The newest table invite, on lobby screens and the final game summary:
 * "Karim invites you to a table" with Join and Dismiss, or "This table has
 * closed" with only Dismiss once it expired. Hidden while a hand is played,
 * so it never covers one; the table's badge counts invites meanwhile.
 * Join opens `/t/<code>`, whose screen reports a table that closed since.
 */
export function InviteBanner({ style }: InviteBannerProps) {
  const { state, handInProgress, dismissInvite } = useSocial();
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const invite = newestInvite(state.invites);
  if (invite === null || handInProgress) return null;

  const join = () => {
    // Joining uses the invite up; a dead table shows its own error on the room screen.
    void dismissInvite(invite.id);
    router.push({ pathname: '/t/[code]', params: { code: invite.code } });
  };
  const message = invite.expired ? tr('invite.closed') : tr('invite.banner', { name: invite.fromName });

  return (
    <View
      style={[styles.banner, { borderColor: t.colors.accent, backgroundColor: t.colors.segmentBg, borderRadius: t.radii.button }, style]}
      accessibilityLiveRegion="polite"
      testID="invite-banner"
    >
      <Text
        style={[styles.message, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}
        testID={invite.expired ? 'invite-closed' : 'invite-message'}
      >
        {message}
      </Text>
      <View style={styles.actions}>
        {invite.expired ? null : (
          <Pressable
            onPress={join}
            accessibilityRole="button"
            accessibilityLabel={tr('friends.actionFor', { action: tr('invite.join'), name: message })}
            testID="invite-join"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: t.colors.accent, borderColor: t.colors.accent, borderRadius: t.radii.button },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.buttonText, { color: t.colors.onAccent, fontFamily: t.fonts.bodyBold }]}>{tr('invite.join')}</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => void dismissInvite(invite.id)}
          accessibilityRole="button"
          accessibilityLabel={tr('friends.actionFor', { action: tr('invite.dismiss'), name: message })}
          testID="invite-dismiss"
          style={({ pressed }) => [
            styles.button,
            { borderColor: t.colors.segmentBorder, borderRadius: t.radii.button },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.buttonText, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>{tr('invite.dismiss')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  message: { flexGrow: 1, flexShrink: 1, flexBasis: 180, fontSize: 15 },
  actions: { flexDirection: 'row', gap: 8, marginStart: 'auto' },
  // 44 pt minimum touch target.
  button: { minHeight: 44, minWidth: 72, paddingHorizontal: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 14 },
  pressed: { opacity: 0.6 },
});
