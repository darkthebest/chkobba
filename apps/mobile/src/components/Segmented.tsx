import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSkin } from '@/skins';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  testID,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegmentOption<T>[];
  testID?: string;
}) {
  const { skin } = useSkin();
  const c = skin.tokens.colors;
  const f = skin.tokens.fonts;
  return (
    <View style={styles.row} testID={testID}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            testID={testID ? `${testID}-${o.value}` : undefined}
            style={[
              styles.segment,
              {
                borderRadius: skin.tokens.radii.button,
                backgroundColor: on ? c.segmentActiveBg : c.segmentBg,
                borderColor: on ? c.segmentActiveBorder : c.segmentBorder,
              },
            ]}
          >
            <Text style={[styles.label, { color: on ? c.segmentActiveText : c.segmentText, fontFamily: f.bodyBold }]}>{o.label}</Text>
            {o.hint ? (
              <Text style={[styles.hint, { color: on ? c.segmentActiveText : c.segmentText, fontFamily: f.bodyItalic }]}>{o.hint}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1.5 },
  label: { fontSize: 15 },
  hint: { fontSize: 11, opacity: 0.75, marginTop: 1 },
});
