import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT, type TFunction } from '@/i18n';
import { displayNameOf } from '@/online/friends';
import { useSocial } from '@/online/socialContext';
import type { SocialEvent } from '@/online/socialSocket';
import { useSkin } from '@/skins';

/** How long a toast stays up. */
export const TOAST_MS = 3000;

export function toastMessage(event: SocialEvent, tr: TFunction): string {
  switch (event.type) {
    case 'friend_request':
      return tr('friends.toast.request', { name: displayNameOf(event.displayName, undefined) });
    case 'friend_accept':
      return tr('friends.toast.accepted', { name: displayNameOf(event.displayName, undefined) });
    case 'table_invite':
      return tr('invite.toast', { name: event.invite.fromName });
  }
}

interface Toast {
  readonly id: number;
  readonly message: string;
}

/**
 * Brief notices for live friend requests, accepts and table invites, mounted
 * once at the root. Nothing shows while a hand is played (the table's badge
 * counts invites then, and requests wait on the Friends tile). A new event
 * replaces the current toast. Never takes a tap.
 */
export function SocialToasts() {
  const social = useSocial();
  const { onEvent, handInProgress } = social;
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const [toast, setToast] = useState<Toast | null>(null);
  // The listener reads the latest values without resubscribing on every change.
  const latest = useRef({ handInProgress, tr });
  useEffect(() => {
    latest.current = { handInProgress, tr };
  }, [handInProgress, tr]);

  useEffect(() => {
    let nextId = 0;
    return onEvent((event) => {
      if (latest.current.handInProgress) return;
      nextId += 1;
      setToast({ id: nextId, message: toastMessage(event, latest.current.tr) });
    });
  }, [onEvent]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast((current) => (current?.id === toast.id ? null : current)), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // A hand that starts while a toast is up hides it.
  const shown = handInProgress ? null : toast;

  return (
    <SafeAreaView edges={['top']} pointerEvents="box-none" style={styles.layer}>
      <View accessibilityLiveRegion="polite" pointerEvents="none" style={styles.slot}>
        {shown ? (
          <View
            key={shown.id}
            accessible
            accessibilityRole="text"
            testID="social-toast"
            style={[styles.toast, { backgroundColor: t.colors.bubbleBg, borderColor: t.colors.bubbleBorder }]}
          >
            <Text style={[styles.text, { color: t.colors.bubbleText, fontFamily: t.fonts.bodyBold }]}>{shown.message}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, start: 0, end: 0, alignItems: 'center', zIndex: 50 },
  slot: { width: '100%', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  toast: { maxWidth: 420, borderWidth: 1.5, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 16 },
  text: { fontSize: 14, textAlign: 'center' },
});
