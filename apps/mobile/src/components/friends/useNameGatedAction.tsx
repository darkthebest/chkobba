import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { NameGate } from '@/components/lobby/NameGate';
import type { ProfileBackend } from '@/online/profile';
import { useSkin } from '@/skins';

export interface NameGatedAction {
  /** Runs `action` now when the player already picked a name, else after the name sheet's Continue. */
  run(action: () => void): void;
  /** The name sheet while one is needed, else null. Render it at the screen root, over everything. */
  readonly sheet: ReactNode;
}

/**
 * Sending a friend request and accepting one show the player's name to someone
 * else, so they go through the shared `NameGate` on first use (ADR-0001:
 * Continue always calls `setDisplayName`). Once a name is known to be picked,
 * later actions run straight away. Cancel drops the pending action.
 */
export function useNameGatedAction(profile: ProfileBackend): NameGatedAction {
  const t = useSkin().skin.tokens;
  const picked = useRef(false);
  const mounted = useRef(true);
  // Wrapped in an object: a bare function in state would be called as an updater.
  const [pending, setPending] = useState<{ readonly action: () => void } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    (action: () => void) => {
      if (picked.current) {
        action();
        return;
      }
      profile.getProfile().then(
        (loaded) => {
          if (!mounted.current) return;
          if (loaded.namePicked) {
            picked.current = true;
            action();
          } else {
            setPending({ action });
          }
        },
        // The gate retries the load itself and offers Back.
        () => {
          if (mounted.current) setPending({ action });
        },
      );
    },
    [profile],
  );

  // Read through a ref so the action runs once, outside a state updater (updaters may run twice).
  const pendingRef = useRef(pending);
  useLayoutEffect(() => {
    pendingRef.current = pending;
  });

  const complete = useCallback(() => {
    picked.current = true;
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (current !== null) current.action();
  }, []);

  const cancel = useCallback(() => setPending(null), []);

  const sheet =
    pending === null ? null : (
      <View
        style={[styles.overlay, { backgroundColor: t.colors.overlay }]}
        accessibilityViewIsModal
        aria-modal
        testID="friends-name-gate"
      >
        <NameGate
          profile={profile}
          onCancel={cancel}
          loadingFallback={
            <View style={styles.loading}>
              <ActivityIndicator color={t.colors.accent} size="large" />
            </View>
          }
        >
          <RunOnMount onRun={complete} />
        </NameGate>
      </View>
    );

  return { run, sheet };
}

/** Calls `onRun` once when the gate opens (the name was saved). Renders nothing. */
function RunOnMount({ onRun }: { onRun: () => void }) {
  const done = useRef(false);
  const onRunRef = useRef(onRun);
  useLayoutEffect(() => {
    onRunRef.current = onRun;
  });
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    onRunRef.current();
  }, []);
  return null;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, zIndex: 20 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
