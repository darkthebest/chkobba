import { StyleSheet, View } from 'react-native';

import { useSkin } from '@/skins';

/** Five placeholder rows, enough to fill a phone viewport without a scroll jump. */
const ROWS = [0, 1, 2, 3, 4];

/**
 * Placeholder rows shown while the first directory page is debounced or
 * fetched.
 *
 * It is deliberately static: no shimmer, no timer and no animation, so it
 * cannot be mistaken for content or keep a test's clock busy. It mirrors
 * `PlayerRow`'s silhouette (avatar, two lines, chip) so the list does not jump
 * when the real rows land.
 *
 * Hidden from assistive tech on purpose: a skeleton has nothing to read, and
 * the polite live region around the screen body announces the next state when
 * it arrives.
 */
export function PlayerListSkeleton() {
  const t = useSkin().skin.tokens;
  const fill = { backgroundColor: t.colors.segmentBg };

  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="directory-skeleton"
    >
      {ROWS.map((row) => (
        <View key={row} style={styles.row}>
          <View style={[styles.avatar, fill]} />
          <View style={styles.lines}>
            <View style={[styles.name, fill]} />
            <View style={[styles.meta, fill]} />
          </View>
          <View style={[styles.chip, fill]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  lines: { flexGrow: 1, flexShrink: 1, gap: 6 },
  name: { width: '45%', height: 14, borderRadius: 7 },
  meta: { width: '30%', height: 10, borderRadius: 5 },
  chip: { width: 64, height: 32, borderRadius: 16 },
});
