import type { PresenceVisibilityLabel } from '@chkobba/protocol';
import { StyleSheet, Text, View } from 'react-native';

import { availabilityColor } from '@/components/friends/FriendRow';
import { useT } from '@/i18n';
import type { Availability as PresenceAvailability } from '@/online/presence';
import { useSkin } from '@/skins';

/**
 * Availability for a directory row and a player profile.
 *
 * Three outcomes, not two: a visible player with a live activity shows it; a
 * visible player with no activity is genuinely offline; a player who publishes
 * nothing (`presence: 'hidden'`) gets a neutral state with no dot at all.
 * Hidden must never render the offline wording or dot, because it means
 * "publishes nothing", not "away".
 *
 * Presentation only: the caller decides what presence it trusts. The dot is
 * decorative and the label is the screen-reader text, so the state is never
 * conveyed by colour alone.
 *
 * ```tsx
 * <Availability presence={player.presence} availability={friends[player.userId]} />
 * ```
 */
export interface AvailabilityProps {
  /** What the directory or profile says this player publishes. */
  presence: PresenceVisibilityLabel;
  /**
   * The live activity from presence; only meaningful when `presence` is
   * visible. Absent means the player is visible but offline.
   */
  availability?: PresenceAvailability;
}

export function Availability({ presence, availability }: AvailabilityProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const shown: PresenceAvailability | null = presence === 'hidden' ? null : availability ?? 'offline';

  return (
    <View style={styles.root}>
      {shown !== null ? (
        <View
          style={[styles.dot, { backgroundColor: availabilityColor(shown, t.colors) }]}
          // The label carries the state; the dot is only a visual cue.
          accessible={false}
        />
      ) : null}
      <Text style={[styles.label, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
        {shown === null ? tr('directory.availability.hidden') : tr(`friends.availability.${shown}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 13 },
});
