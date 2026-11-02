import type { PresenceActivity } from '@chkobba/protocol';
import { useEffect, useRef } from 'react';

import { useSocial } from './socialContext';

/**
 * Publishes what an online screen is doing to the social layer: the public
 * activity (`room` or `playing`, never a code) and whether a hand is being
 * played, which holds invite banners and toasts back. A null activity leaves
 * the current one alone. On unmount the player is back in the lobby and no
 * longer in a hand. Both are no-ops while the social socket is disconnected.
 */
export function useSocialActivity(activity: PresenceActivity | null, handInProgress: boolean): void {
  const social = useSocial();
  // The provider recreates its setters with its state, so effects read them through a ref
  // and the unmount reset runs only once, on unmount.
  const latest = useRef(social);
  useEffect(() => {
    latest.current = social;
  }, [social]);

  useEffect(() => {
    if (activity !== null) latest.current.setActivity(activity);
  }, [activity]);

  useEffect(() => {
    latest.current.setHandInProgress(handInProgress);
  }, [handInProgress]);

  useEffect(
    () => () => {
      latest.current.setHandInProgress(false);
      latest.current.setActivity('lobby');
    },
    [],
  );
}
