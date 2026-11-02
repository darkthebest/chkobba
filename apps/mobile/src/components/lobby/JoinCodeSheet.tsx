import { isRoomCode, normalizeRoomCode, ROOM_CODE_LENGTH } from '@chkobba/protocol';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DirectionView, useT } from '@/i18n';
import { useSkin } from '@/skins';

import { LobbySheet } from './LobbySheet';

export interface JoinCodeSheetProps {
  /** Called with a normalized, valid room code. */
  onJoin: (code: string) => void;
  onClose: () => void;
  testID?: string;
}

/**
 * "Join with code": a private-table code field over the lobby. The field keeps
 * the canonical form as the player types (uppercase, no spaces or dashes) and
 * Join stays disabled until the code is well formed.
 */
export function JoinCodeSheet({ onJoin, onClose, testID = 'join-code-sheet' }: JoinCodeSheetProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const [code, setCode] = useState('');
  const [focused, setFocused] = useState(false);
  // Set by an attempt to submit an invalid code; any edit hides the message again.
  const [attempted, setAttempted] = useState(false);

  const valid = isRoomCode(code);
  // Full length but not a code (e.g. contains O, 0, 1 or I), or the player tried to join anyway.
  const showError = !valid && (attempted || code.length === ROOM_CODE_LENGTH);

  const change = (text: string) => {
    setCode(normalizeRoomCode(text).slice(0, ROOM_CODE_LENGTH));
    setAttempted(false);
  };

  const submit = () => {
    if (!valid) {
      setAttempted(true);
      return;
    }
    onJoin(code);
  };

  return (
    <LobbySheet title={tr('lobby.joinCode.title')} onClose={onClose} testID={testID}>
      {/* Codes are Latin letters and digits: they must never mirror under an RTL language. */}
      <DirectionView dir="ltr">
        <TextInput
          value={code}
          onChangeText={change}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={submit}
          // Room for a pasted `ABC-123` or `ABC 123`; `change` trims to the code length.
          maxLength={ROOM_CODE_LENGTH * 2}
          placeholder={tr('lobby.joinCode.placeholder')}
          placeholderTextColor={t.colors.panelMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          returnKeyType="go"
          accessibilityLabel={tr('lobby.joinCode.title')}
          aria-invalid={showError}
          testID="join-code-input"
          style={[
            styles.input,
            {
              borderRadius: t.radii.button,
              backgroundColor: t.colors.segmentBg,
              borderColor: focused ? t.colors.accent : t.colors.segmentBorder,
              color: t.colors.segmentText,
              fontFamily: t.fonts.bodyBold,
            },
          ]}
        />
      </DirectionView>

      <View accessibilityLiveRegion="polite">
        {showError ? (
          <Text
            style={[
              styles.error,
              { borderRadius: t.radii.button, backgroundColor: t.colors.warnBg, color: t.colors.warnText, fontFamily: t.fonts.bodyBold },
            ]}
            accessibilityRole="alert"
            testID="join-code-error"
          >
            {tr('lobby.joinCode.invalid')}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={submit}
        disabled={!valid}
        accessibilityRole="button"
        accessibilityLabel={tr('lobby.joinCode.join')}
        accessibilityState={{ disabled: !valid }}
        testID="join-code-submit"
        style={[
          styles.join,
          { backgroundColor: t.colors.accent, borderRadius: t.radii.button },
          !valid && styles.joinDisabled,
        ]}
      >
        <Text style={[styles.joinText, { color: t.colors.onAccent, fontFamily: t.fonts.display }]}>
          {tr('lobby.joinCode.join')}
        </Text>
      </Pressable>
    </LobbySheet>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 2, paddingVertical: 12, paddingHorizontal: 14, fontSize: 24, letterSpacing: 6, textAlign: 'center' },
  error: { fontSize: 14, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden' },
  join: { paddingVertical: 14, alignItems: 'center' },
  joinDisabled: { opacity: 0.5 },
  joinText: { fontSize: 20 },
});
