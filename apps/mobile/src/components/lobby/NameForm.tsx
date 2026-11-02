import {
  checkDisplayNameFormat,
  DISPLAY_NAME_MAX_LENGTH,
  type NameErrorCode,
  normalizeDisplayName,
} from '@chkobba/protocol';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useLanguage, useT } from '@/i18n';
import { useSkin } from '@/skins';

export type NameFormMode = 'continue' | 'save';
export type NameFormError = NameErrorCode | 'network';

export interface NameFormProps {
  /** Prefills the field (the current or suggested name). */
  initialName: string;
  /** `continue`: the first-visit gate. `save`: the Settings rename, disabled until the name changes. */
  mode: NameFormMode;
  /** Called with the normalized name once it passes the format check. */
  onSubmit: (name: string) => void | Promise<void>;
  /** Shows a secondary Cancel button. */
  onCancel?: () => void;
  /** The server's answer to the last submit (or `network` when the request failed). */
  serverError?: NameFormError | null;
  /** Epoch ms when renaming is allowed again; ignored once it is in the past. */
  renameAvailableAt?: number | null;
  /** A submit is in flight: the field and buttons are locked. */
  busy?: boolean;
  /** The last submit succeeded. */
  saved?: boolean;
  /** Clock, injectable for tests. */
  now?: () => number;
  /** Shows the "Choose your name" heading (the /finding gate; the Settings sheet has its own). */
  title?: boolean;
  testID?: string;
}

/** Re-render this often while a cooldown runs, so the minutes count down and the line clears. */
const COOLDOWN_TICK_MS = 15_000;
const MS_PER_MINUTE = 60_000;

/**
 * Display-name field, presentational only: the parent saves the name and passes
 * back `busy`, `serverError`, `saved` and `renameAvailableAt`. Renders no Panel,
 * so it fits both inside the /finding sheet and the Settings `LobbySheet`.
 */
export function NameForm({
  initialName,
  mode,
  onSubmit,
  onCancel,
  serverError = null,
  renameAvailableAt = null,
  busy = false,
  saved = false,
  now = Date.now,
  title = false,
  testID = 'name-form',
}: NameFormProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const { dir } = useLanguage();
  const [value, setValue] = useState(initialName);
  const [focused, setFocused] = useState(false);
  // Format errors wait until the player leaves the field or submits ("punish late"),
  // then follow every keystroke so they clear as soon as the name is valid.
  const [touched, setTouched] = useState(false);
  // Server feedback (error or "saved") belongs to the name that was sent; editing hides it.
  const [submitted, setSubmitted] = useState<string | null>(null);

  const minutesLeft = useCooldownMinutes(renameAvailableAt, now);
  const check = checkDisplayNameFormat(value);
  const normalized = normalizeDisplayName(value);
  const feedbackCurrent = submitted === null || submitted === normalized;
  const formatError = touched && !check.ok ? check.code : null;
  const error: NameFormError | null = formatError ?? (feedbackCurrent ? serverError : null);
  const showSaved = saved && feedbackCurrent && error === null;
  const unchanged = mode === 'save' && normalized === normalizeDisplayName(initialName);
  const disabled = busy || minutesLeft !== null || unchanged;

  const submit = () => {
    if (disabled) return;
    setTouched(true);
    if (!check.ok) return;
    setSubmitted(check.name);
    void onSubmit(check.name);
  };

  const submitLabel = mode === 'save' ? tr('name.save') : tr('name.continue');

  return (
    <View style={styles.root} testID={testID}>
      {title ? (
        <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]} accessibilityRole="header">
          {tr('name.title')}
        </Text>
      ) : null}

      <TextInput
        value={value}
        onChangeText={setValue}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          if (value.length > 0) setTouched(true);
        }}
        onSubmitEditing={submit}
        maxLength={DISPLAY_NAME_MAX_LENGTH}
        editable={!busy}
        placeholder={tr('name.placeholder')}
        placeholderTextColor={t.colors.panelMuted}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="nickname"
        textContentType="nickname"
        returnKeyType="done"
        accessibilityLabel={tr('settings.name')}
        accessibilityHint={tr('name.hint')}
        accessibilityState={{ disabled: busy }}
        aria-invalid={error !== null}
        testID={`${testID}-input`}
        {...autoDirectionProps}
        style={[
          styles.input,
          {
            borderRadius: t.radii.button,
            backgroundColor: t.colors.segmentBg,
            borderColor: focused ? t.colors.accent : t.colors.segmentBorder,
            color: t.colors.segmentText,
            fontFamily: t.fonts.body,
          },
          // The typed text picks its own direction (first strong character), so a Latin
          // name stays left-aligned under the RTL root. Only the empty field (the
          // placeholder) follows the UI language.
          value.length === 0 && { textAlign: dir === 'rtl' ? 'right' : 'left' },
        ]}
      />

      <Text style={[styles.line, { color: t.colors.panelMuted, fontFamily: t.fonts.bodyItalic }]} testID={`${testID}-hint`}>
        {tr('name.hint')}
      </Text>

      <View accessibilityLiveRegion="polite" testID={`${testID}-feedback`}>
        {error !== null ? (
          <Text
            style={[styles.error, { borderRadius: t.radii.button, backgroundColor: t.colors.warnBg, color: t.colors.warnText, fontFamily: t.fonts.bodyBold }]}
            accessibilityRole="alert"
            testID={`${testID}-error`}
          >
            {tr(`name.errors.${error}`)}
          </Text>
        ) : null}
        {showSaved ? (
          <Text style={[styles.line, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]} testID={`${testID}-saved`}>
            {tr('name.saved')}
          </Text>
        ) : null}
        {minutesLeft !== null ? (
          <Text style={[styles.line, { color: t.colors.panelText, fontFamily: t.fonts.body }]} testID={`${testID}-cooldown`}>
            {tr('name.cooldown', { minutes: minutesLeft })}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {onCancel ? (
          <FormButton label={tr('common.cancel')} onPress={onCancel} disabled={busy} testID={`${testID}-cancel`} />
        ) : null}
        <FormButton label={submitLabel} onPress={submit} primary disabled={disabled} busy={busy} testID={`${testID}-submit`} />
      </View>
    </View>
  );
}

/**
 * On web, react-native-web renders the input with `dir="auto"` by default; it is
 * passed explicitly so the browser keeps inferring the direction from the text.
 * Native needs nothing: iOS natural alignment and Android's first-strong text
 * direction already align Arabic right and Latin left.
 */
const autoDirectionProps: object = Platform.OS === 'web' ? { dir: 'auto' } : {};

/**
 * Whole minutes until `availableAt`, or null when it is unset or already past.
 * Cached values can be stale, so it compares with the clock on every render and
 * re-renders periodically while the cooldown runs.
 */
function useCooldownMinutes(availableAt: number | null, now: () => number): number | null {
  const [, setTick] = useState(0);
  const remaining = availableAt === null ? 0 : availableAt - now();
  const running = remaining > 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((n) => n + 1), COOLDOWN_TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  return running ? Math.ceil(remaining / MS_PER_MINUTE) : null;
}

interface FormButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}

function FormButton({ label, onPress, primary = false, disabled = false, busy = false, testID }: FormButtonProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const textColor = primary ? t.colors.onAccent : t.colors.panelText;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      testID={testID}
      style={[
        styles.button,
        { borderRadius: t.radii.button, borderColor: primary ? t.colors.accent : t.colors.panelMuted },
        primary && { backgroundColor: t.colors.accent },
        disabled && styles.buttonDisabled,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={textColor} style={styles.spinner} /> : null}
      <Text style={[styles.buttonText, { fontFamily: t.fonts.bodyBold, color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: 10, alignItems: 'stretch' },
  title: { fontSize: 26, textAlign: 'center' },
  input: { borderWidth: 2, paddingVertical: 10, paddingHorizontal: 12, fontSize: 18 },
  line: { fontSize: 14, textAlign: 'center' },
  error: { fontSize: 14, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { flexGrow: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderWidth: 2 },
  buttonDisabled: { opacity: 0.5 },
  spinner: { marginEnd: 8 },
  buttonText: { fontSize: 15 },
});
