import { StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import { useSkin } from '@/skins';

/** Default Tunisian rules (`DEFAULT_RULES`), kept to one page: `help.rule1` … `help.rule5`. */
const RULE_KEYS = ['help.rule1', 'help.rule2', 'help.rule3', 'help.rule4', 'help.rule5'] as const;

/** One point each, per round. A tie scores nothing. */
const SCORING_KEYS = ['karta', 'dineri', 'bermila', 'haya', 'chkobba'] as const;

/** How to play: the rules and the round scoring, brief enough for one sheet. */
export function HowToPlay() {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const text = { color: t.colors.panelText, fontFamily: t.fonts.body };
  const heading = [styles.heading, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyBold }];

  return (
    <View style={styles.root} testID="how-to-play">
      <View style={styles.section}>
        <Text style={heading}>{tr('help.theGame')}</Text>
        {RULE_KEYS.map((key) => (
          <View style={styles.bulletRow} key={key}>
            <Text style={[styles.bullet, text]}>•</Text>
            <Text style={[styles.line, text]}>{tr(key)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={heading}>{tr('help.scoring')}</Text>
        {SCORING_KEYS.map((key) => (
          <View style={styles.scoreRow} key={key}>
            <Text style={[styles.line, styles.scoreName, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}>
              {tr(`scoring.${key}`)}
            </Text>
            <Text style={[styles.line, styles.scoreHow, text]}>{tr(`help.how.${key}`)}</Text>
          </View>
        ))}
        <Text style={[styles.note, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
          {tr('help.tie')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  section: { gap: 5 },
  heading: { fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  bulletRow: { flexDirection: 'row', gap: 8 },
  bullet: { fontSize: 14, lineHeight: 19 },
  line: { fontSize: 14, lineHeight: 19, flexShrink: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreName: { width: 70 },
  scoreHow: { flex: 1 },
  note: { fontSize: 12, fontStyle: 'italic' },
});
