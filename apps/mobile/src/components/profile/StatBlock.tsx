import { StyleSheet, Text, View } from 'react-native';

import { useLanguage, useT, type TextDirection } from '@/i18n';
import { isolate } from '@/i18n/i18n';
import { useSkin } from '@/skins';

/**
 * One stat block on the player profile: a heading and its labelled counters.
 *
 * The profile always renders two of these — **Competitive** (server-observed)
 * and **Practice** (device-reported) — and they are never summed, merged or
 * compared (ADR-0005). This is the one component both use, so the two blocks
 * cannot drift: the practice block only differs by its `deviceReported` marker
 * and by which rows its caller passes.
 *
 * Zeros are real data for a new player, so every row always renders: there is
 * no empty block, no dash and no "unknown" state.
 *
 * ```tsx
 * <StatBlock kind="practice" label={tr('profile.stats.practice')} rows={rows} deviceReported />
 * ```
 */

/** The five labels a block may show. Practice carries no streak rows (ADR-0005). */
export type StatRowId = 'chkobbas' | 'games' | 'wins' | 'currentStreak' | 'bestStreak';

/** One counter: the label key's own suffix and its value. Zero is rendered like any other count. */
export interface StatRow {
  readonly id: StatRowId;
  readonly value: number;
}

/** Which block this is. Also the middle of every row's testID. */
export type StatBlockKind = 'competitive' | 'practice';

export interface StatBlockProps {
  /** Identifies the block; row testIDs read `profile-stat-<kind>-<row>`. */
  readonly kind: StatBlockKind;
  /** The block heading, already translated by the caller. */
  readonly label: string;
  /** Rows in display order. Pass every row the block has, including zeros. */
  readonly rows: readonly StatRow[];
  /**
   * Practice only: shows the "Device-reported" marker. It is part of the
   * decision (ADR-0005 §2 and §6), not decoration — the practice block's counts
   * are asserted by the player's device, not observed by the match server.
   */
  readonly deviceReported?: boolean;
}

/** The label key for each row, so the row id is also the key suffix. */
const ROW_LABELS = {
  chkobbas: 'profile.stats.chkobbas',
  games: 'profile.stats.games',
  wins: 'profile.stats.wins',
  currentStreak: 'profile.stats.currentStreak',
  bestStreak: 'profile.stats.bestStreak',
} as const;

/**
 * A count as the text to render. In a right-to-left language the digits are
 * wrapped in the same Unicode isolate `i18n.ts` uses for every interpolated
 * value, so a bare figure keeps its own direction inside the mirrored row.
 * Left-to-right languages render plain digits, which keeps tests readable.
 */
function statValue(value: number, dir: TextDirection): string {
  const text = String(value);
  return dir === 'rtl' ? isolate(text) : text;
}

export function StatBlock({ kind, label, rows, deviceReported }: StatBlockProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { dir } = useLanguage();
  const tr = useT();

  return (
    <View
      style={[styles.block, { borderColor: t.colors.segmentBorder, borderRadius: t.radii.option }]}
      testID={`profile-stat-block-${kind}`}
    >
      {/*
       * A real heading, so assistive tech announces "Competitive" (or
       * "Practice") before the figures instead of a run of bare numbers.
       */}
      <View style={styles.heading}>
        <Text
          style={[styles.label, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
          accessibilityRole="header"
          testID={`profile-stat-label-${kind}`}
        >
          {label}
        </Text>
        {deviceReported === true ? (
          <View
            style={[styles.marker, { backgroundColor: t.colors.tagBg }]}
            testID="profile-stat-device-reported"
          >
            <Text style={[styles.markerText, { color: t.colors.tagText, fontFamily: t.fonts.body }]}>
              {tr('profile.stats.deviceReported')}
            </Text>
          </View>
        ) : null}
      </View>
      {rows.map((row) => (
        // One stop per row: the label and its figure are read together, and the
        // two are separate Text nodes so no string is ever hand-concatenated.
        <View
          key={row.id}
          style={styles.row}
          accessible
          testID={`profile-stat-${kind}-${row.id}`}
        >
          <Text style={[styles.rowLabel, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
            {tr(ROW_LABELS[row.id])}
          </Text>
          <Text style={[styles.rowValue, { color: t.colors.panelText, fontFamily: t.fonts.numeric }]}>
            {statValue(row.value, dir)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { flexGrow: 1, flexShrink: 1, flexBasis: 150, gap: 6, padding: 10, borderWidth: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  label: { fontSize: 15 },
  marker: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  markerText: { fontSize: 11 },
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  rowLabel: { fontSize: 13, flexShrink: 1 },
  rowValue: { fontSize: 18 },
});
