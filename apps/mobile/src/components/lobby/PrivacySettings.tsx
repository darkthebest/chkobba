import type { PresenceVisibility } from '@chkobba/protocol';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n';
import type { DirectoryError } from '@/online/directory';
import { directoryErrorMessage } from '@/online/messages';
import { useSocial } from '@/online/socialContext';
import { useSkin } from '@/skins';

import { Segmented } from '../Segmented';

/**
 * "Who can see you" in lobby Settings. The choice is saved by
 * `set_presence_visibility` and the provider applies it to the social socket,
 * so Nobody takes effect without a restart. The radio shows the saved choice:
 * a failed save leaves it unchanged and shows why, the same inline way the
 * rename field reports a server error.
 */
export function PrivacySettings() {
  const tr = useT();
  const { skin } = useSkin();
  const t = skin.tokens;
  const { presenceVisibility, setPresenceVisibility } = useSocial();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DirectoryError | null>(null);
  // The Settings sheet can close while the save is in flight.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const choose = async (visibility: PresenceVisibility) => {
    // One save at a time keeps a slow answer from overwriting a newer choice.
    if (busy || visibility === presenceVisibility) return;
    setBusy(true);
    setError(null);
    const result = await setPresenceVisibility(visibility);
    if (!mounted.current) return;
    if (!result.ok) setError(result.reason);
    setBusy(false);
  };

  return (
    <View style={styles.controls}>
      <Segmented<PresenceVisibility>
        value={presenceVisibility}
        onChange={(visibility) => void choose(visibility)}
        testID="privacy"
        options={[
          { value: 'everyone', label: tr('privacy.everyone.label'), hint: tr('privacy.everyone.hint') },
          { value: 'nobody', label: tr('privacy.nobody.label'), hint: tr('privacy.nobody.hint') },
        ]}
      />
      <View accessibilityLiveRegion="polite">
        {error !== null ? (
          <Text
            style={[
              styles.error,
              { borderRadius: t.radii.button, backgroundColor: t.colors.warnBg, color: t.colors.warnText, fontFamily: t.fonts.bodyBold },
            ]}
            accessibilityRole="alert"
            testID="privacy-error"
          >
            {directoryErrorMessage(error, tr)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { gap: 10 },
  error: { fontSize: 13, textAlign: 'center', paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden' },
});
