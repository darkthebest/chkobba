import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FriendButton } from '@/components/friends/FriendButton';
import { LobbySheet } from '@/components/lobby/LobbySheet';
import { NameForm, type NameFormError } from '@/components/lobby/NameForm';
import { useT } from '@/i18n';
import { loadCachedProfile, subscribeProfile, type Profile } from '@/online/profile';
import { getProfileBackend } from '@/online/services';
import { useSkin } from '@/skins';

/**
 * Device-local "I dismissed the unlisted callout" flag. The directory shows the
 * callout again on a fresh install or another device; that is deliberate, since
 * the callout asks for a name and a dismissal is not a name.
 */
export const UNLISTED_DISMISSED_KEY = 'chkobba.directory.unlistedDismissed';

/**
 * The directory's "you are not listed" card: a player with no claimed name is
 * not searchable, so the card explains that and offers "Choose a name".
 *
 * Self-contained and read-only at mount: it reads the local profile cache once
 * (`loadCachedProfile`, no network) plus the dismissal flag, and renders
 * nothing until both reads settle. It also renders nothing when the cache is
 * absent (an offline-only device with no account yet) or says the player is
 * already listed — the card exists to fix the unlisted state, and the cache is
 * the only offline source for it.
 *
 * "Choose a name" opens the Settings name form on the profile backend; a failed
 * save shows the server's reason exactly as Settings does, and a successful one
 * closes the sheet, hides the card and re-reads the cache. The card is a
 * labelled group but is not itself an accessibility element, so Dismiss and
 * Choose a name stay individually reachable; it deliberately has no live
 * region, because the directory body already announces its own state changes.
 */
export interface UnlistedCalloutProps {
  /** `false` for the Friends screen's persistent card: no Dismiss, so it stays until a name is chosen. */
  dismissible?: boolean;
  /** `friends` swaps in the Friends screen's copy and test ids. */
  variant?: 'directory' | 'friends';
}

export function UnlistedCallout({ dismissible = true, variant = 'directory' }: UnlistedCalloutProps = {}) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const tr = useT();
  const prefix = variant === 'friends' ? 'friends.unlisted' : 'directory.unlisted';
  const testID = variant === 'friends' ? 'friends-unlisted' : 'directory-unlisted';
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // A save succeeded this session: hide even if a degraded cache re-read still
  // reports unlisted, because the player just chose a name.
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<NameFormError | null>(null);
  const [renameAvailableAt, setRenameAvailableAt] = useState<number | null>(null);
  // The sheet can close while a save is in flight.
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void Promise.all([
      loadCachedProfile(),
      // Best effort: an unreadable flag is "not dismissed", so the card shows.
      AsyncStorage.getItem(UNLISTED_DISMISSED_KEY).catch(() => null),
    ]).then(async ([cached, flag]) => {
      if (!mounted.current) return;
      setDismissed(flag === '1');
      if (cached !== null) {
        setProfile(cached);
        setRenameAvailableAt(cached.renameAvailableAt);
        setLoaded(true);
        return;
      }
      // Nothing cached yet (a fresh device, or a session that has not read the
      // account): read it once. Without this the card would never show for the
      // player it exists for, since a client that never calls `getProfile` never
      // populates the cache. A failure is "unknown", not "listed", so it shows
      // nothing and the directory screen's own callout still covers that state.
      const loadedProfile = await getProfileBackend()
        .getProfile()
        .catch(() => null);
      if (!mounted.current) return;
      if (loadedProfile !== null) {
        setProfile(loadedProfile);
        setRenameAvailableAt(loadedProfile.renameAvailableAt);
      }
      setLoaded(true);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  // A name claimed elsewhere (for example through the friends Add gate, which
  // saves through the profile backend) lists the player without remounting
  // this screen. Treat it like a successful save: hide and stay hidden.
  useEffect(
    () =>
      subscribeProfile((next) => {
        if (next.listed) setSaved(true);
      }),
    [],
  );

  if (!loaded || saved || dismissed || profile === null || profile.listed) return null;


  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(UNLISTED_DISMISSED_KEY, '1').catch(() => {
      // Ignored: the dismissal still holds for this session.
    });
  };

  const openSheet = () => {
    // A stale error from a previous attempt must not appear before this submit.
    setServerError(null);
    setOpen(true);
  };

  const save = async (name: string) => {
    setBusy(true);
    setServerError(null);
    const result = await getProfileBackend()
      .setDisplayName(name)
      .catch(() => ({ ok: false, reason: 'network' }) as const);
    if (result.ok) {
      // Follow the cache after a successful save rather than assume: the backend
      // re-read the account and the claim.
      const cached = await loadCachedProfile();
      if (!mounted.current) return;
      if (cached) setProfile(cached);
      setRenameAvailableAt(result.profile.renameAvailableAt);
      setBusy(false);
      setOpen(false);
      setSaved(true);
      return;
    }
    if (!mounted.current) return;
    setServerError(result.reason);
    if (result.reason === 'name_rate_limited') {
      // The backend refreshed the cache with the server's cooldown.
      const cached = await loadCachedProfile();
      if (mounted.current && cached) setRenameAvailableAt(cached.renameAvailableAt);
    }
    if (mounted.current) setBusy(false);
  };

  return (
    <>
      <View
        // A labelled group, not one accessible element: the two controls inside
        // must stay independently reachable by assistive tech.
        role="group"
        accessibilityLabel={tr(`${prefix}.title`)}
        style={[
          styles.card,
          {
            borderColor: t.colors.accent,
            backgroundColor: t.colors.segmentBg,
            borderRadius: t.radii.button,
          },
        ]}
        testID={testID}
      >
        <Text style={[styles.title, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>
          {tr(`${prefix}.title`)}
        </Text>
        <Text style={[styles.body, { color: t.colors.text, fontFamily: t.fonts.body }]}>
          {tr(`${prefix}.body`)}
        </Text>
        <View style={styles.actions}>
          <FriendButton
            label={tr(variant === 'friends' ? 'friends.unlisted.action' : 'directory.unlisted.chooseName')}
            onPress={openSheet}
            tone="primary"
            testID={`${testID}-choose-name`}
          />
          {dismissible ? (
            <Pressable
              onPress={dismiss}
              accessibilityRole="button"
              accessibilityLabel={tr('directory.unlisted.dismiss')}
              hitSlop={8}
              testID={`${testID}-dismiss`}
              style={({ pressed }) => [
                styles.dismiss,
                { borderColor: t.colors.segmentBorder, borderRadius: t.radii.button },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.dismissText, { color: t.colors.text, fontFamily: t.fonts.bodyBold }]}>
                {tr('directory.unlisted.dismiss')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {open ? (
        // A Modal like the table's sheets, so the form sits above the screen's
        // ScrollView on every platform.
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <LobbySheet
            title={tr(`${prefix}.title`)}
            onClose={() => setOpen(false)}
            testID={`${testID}-sheet`}
          >
            <NameForm
              mode="save"
              initialName={profile.displayName}
              renameAvailableAt={renameAvailableAt}
              onSubmit={save}
              onCancel={() => setOpen(false)}
              busy={busy}
              serverError={serverError}
              testID={`${testID}-name`}
            />
          </LobbySheet>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 14, gap: 6 },
  title: { fontSize: 16 },
  body: { fontSize: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 4 },
  // 44 pt minimum touch target.
  dismiss: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  dismissText: { fontSize: 14 },
  pressed: { opacity: 0.6 },
});
