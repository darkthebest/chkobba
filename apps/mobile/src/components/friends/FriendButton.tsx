import { Pressable, StyleSheet, Text } from 'react-native';

import { useSkin } from '@/skins';

export type FriendButtonTone = 'primary' | 'plain' | 'danger';

export interface FriendButtonProps {
  label: string;
  onPress: () => void;
  tone?: FriendButtonTone;
  disabled?: boolean;
  /** Fill the row's width share (code card, sheets) instead of hugging the label (list rows). */
  grow?: boolean;
  /** Spoken label when the visible one needs context, e.g. "Accept Sami". */
  accessibilityLabel?: string;
  testID: string;
}

/** The one button style on the friends screen, drawn from the active skin's tokens. */
export function FriendButton({
  label,
  onPress,
  tone = 'plain',
  disabled = false,
  grow = false,
  accessibilityLabel,
  testID,
}: FriendButtonProps) {
  const t = useSkin().skin.tokens;
  const colors = toneColors(tone, t.colors);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[
        styles.button,
        grow && styles.grow,
        { borderRadius: t.radii.button, borderColor: colors.border, backgroundColor: colors.background },
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.text, { fontFamily: t.fonts.bodyBold, color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

interface ToneColors {
  border: string;
  background: string;
  text: string;
}

function toneColors(
  tone: FriendButtonTone,
  c: { accent: string; onAccent: string; panelMuted: string; panelText: string; warnBg: string; warnText: string },
): ToneColors {
  switch (tone) {
    case 'primary':
      return { border: c.accent, background: c.accent, text: c.onAccent };
    case 'danger':
      return { border: c.warnBg, background: c.warnBg, text: c.warnText };
    case 'plain':
      return { border: c.panelMuted, background: 'transparent', text: c.panelText };
  }
}

const styles = StyleSheet.create({
  // 44 pt minimum touch target (WCAG 2.5.5 / platform guidelines).
  button: { minHeight: 44, paddingVertical: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  grow: { flexGrow: 1, flexBasis: 0 },
  disabled: { opacity: 0.5 },
  text: { fontSize: 15 },
});
