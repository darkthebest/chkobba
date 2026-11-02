import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import type { ProfileBackend, SetNameResult } from '@/online/profile';
import { useSkin } from '@/skins';

import { NameForm, type NameFormError } from './NameForm';

/** The first-visit name step that runs before an online flow. */
type Gate =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'name'; initialName: string; busy: boolean; error: NameFormError | null }
  | { status: 'ready' };

export interface NameGateProps {
  /** Loads the player's profile and saves the picked name. */
  profile: ProfileBackend;
  /** Leave the flow (Cancel on the name form, Back on the load error). */
  onCancel: () => void;
  /** Shown while the profile loads. */
  loadingFallback: ReactNode;
  /** Rendered once a name was picked (now or on an earlier visit). */
  children: ReactNode;
}

/**
 * Loads the profile and asks for a name on the first visit ("Choose your name").
 * Later visits (name already picked) render `children` straight away. Per
 * ADR-0001, Continue always calls `setDisplayName`, even with an unchanged
 * name: the server writes the NameRecord on that call. Leaving during the
 * load or the submit renders nothing further.
 */
export function NameGate({ profile, onCancel, loadingFallback, children }: NameGateProps) {
  const [gate, setGate] = useState<Gate>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    profile.getProfile().then(
      (loaded) => {
        if (cancelled) return;
        setGate(
          loaded.namePicked
            ? { status: 'ready' }
            : { status: 'name', initialName: loaded.displayName, busy: false, error: null },
        );
      },
      () => {
        if (!cancelled) setGate({ status: 'failed' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [profile, attempt]);

  // Always sent, even unchanged: the server writes the NameRecord on this call.
  const submitName = async (name: string) => {
    setGate((g) => (g.status === 'name' ? { ...g, busy: true, error: null } : g));
    let result: SetNameResult;
    try {
      result = await profile.setDisplayName(name);
    } catch {
      result = { ok: false, reason: 'network' };
    }
    if (!mounted.current) return;
    if (result.ok) {
      setGate({ status: 'ready' });
      return;
    }
    const { reason } = result;
    setGate((g) => (g.status === 'name' ? { ...g, busy: false, error: reason } : g));
  };

  if (gate.status === 'ready') return <>{children}</>;
  if (gate.status === 'failed') {
    return (
      <SearchFailed
        onRetry={() => {
          setGate({ status: 'loading' });
          setAttempt((n) => n + 1);
        }}
        onExit={onCancel}
      />
    );
  }
  if (gate.status === 'name') {
    return (
      <ChooseName
        initialName={gate.initialName}
        busy={gate.busy}
        error={gate.error}
        onSubmit={submitName}
        onCancel={onCancel}
      />
    );
  }
  return <>{loadingFallback}</>;
}

function ChooseName({
  initialName,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  initialName: string;
  busy: boolean;
  error: NameFormError | null;
  onSubmit: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { Panel } = useSkin().skin.components;
  return (
    <View style={styles.root}>
      <Panel variant="sheet" style={styles.sheet}>
        <NameForm
          mode="continue"
          title
          initialName={initialName}
          onSubmit={onSubmit}
          onCancel={onCancel}
          serverError={error}
          busy={busy}
          testID="finding-name"
        />
      </Panel>
    </View>
  );
}

/** The "no table / unreachable" panel with Try again and Back, shared by the gate and quick match. */
export function SearchFailed({ onRetry, onExit }: { onRetry: () => void; onExit: () => void }) {
  const { skin } = useSkin();
  const tr = useT();
  const t = skin.tokens;
  const { Panel } = skin.components;
  return (
    <View style={styles.root}>
      <Panel variant="sheet" style={styles.sheet}>
        <Text style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]}>{tr('finding.noTable')}</Text>
        <Text
          style={[styles.line, { color: t.colors.panelText, fontFamily: t.fonts.body }]}
          accessibilityRole="alert"
          testID="finding-error"
        >
          {tr('finding.unreachable')}
        </Text>
        <View style={styles.actions}>
          <ActionButton label={tr('common.tryAgain')} onPress={onRetry} primary testID="finding-retry" />
          <ActionButton label={tr('common.back')} onPress={onExit} testID="finding-back" />
        </View>
      </Panel>
    </View>
  );
}

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  primary?: boolean;
  testID?: string;
}

export function ActionButton({ label, onPress, primary, testID }: ActionButtonProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={testID}
      style={[
        styles.button,
        { borderRadius: t.radii.button, borderColor: primary ? t.colors.accent : t.colors.panelMuted },
        primary && { backgroundColor: t.colors.accent },
      ]}
    >
      <Text style={[styles.buttonText, { fontFamily: t.fonts.bodyBold, color: primary ? t.colors.onAccent : t.colors.panelText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 420, gap: 12, alignItems: 'stretch' },
  title: { fontSize: 26, textAlign: 'center' },
  line: { fontSize: 14, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flexGrow: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 2 },
  buttonText: { fontSize: 15 },
});
