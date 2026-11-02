import { useState, type ReactNode } from 'react';

import type { FriendsController } from '@/friends/useFriendsController';
import { useT } from '@/i18n';
import type { ProfileBackend } from '@/online/profile';
import { getProfileBackend } from '@/online/services';

import { ConfirmSheet } from './ConfirmSheet';
import type { FriendRowAction, FriendTarget } from './FriendRow';
import { useNameGatedAction } from './useNameGatedAction';

/** The controller actions the friends screen's buttons call. */
export type FriendActionsSource = Pick<
  FriendsController,
  'accept' | 'decline' | 'cancel' | 'add' | 'remove' | 'block' | 'unblock' | 'addFromLookup'
>;

export interface FriendActionsOptions {
  readonly controller: FriendActionsSource;
  /** Defaults to the shared singleton. */
  readonly profile?: ProfileBackend;
}

export interface FriendActions {
  /** Runs a row action: Add and Accept go through the name gate, Remove and Block ask first. */
  perform(action: FriendRowAction, target: FriendTarget): void;
  /** Add the player found by the add-by-code lookup (name-gated). */
  addFromLookup(): void;
  /** The confirmation or name sheet, if one is open. Render it at the screen root, over everything. */
  readonly sheet: ReactNode;
}

type Confirm = { readonly kind: 'remove' | 'block'; readonly target: FriendTarget };

/**
 * What each friends button does around the controller call:
 * - Add and Accept show the player's name to someone else, so they need a picked name (`NameGate`).
 * - Remove and Block ask for confirmation first.
 * - Decline, Cancel and Unblock run straight away.
 * Results land in the controller (`pending`, `error`), so the calls are fire-and-forget here.
 */
export function useFriendActions({ controller, profile: profileOption }: FriendActionsOptions): FriendActions {
  const tr = useT();
  const [profile] = useState<ProfileBackend>(() => profileOption ?? getProfileBackend());
  const gate = useNameGatedAction(profile);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const perform = (action: FriendRowAction, target: FriendTarget) => {
    const { userId } = target;
    switch (action) {
      case 'accept':
        gate.run(() => void controller.accept(userId));
        return;
      case 'add':
        gate.run(() => void controller.add(userId));
        return;
      case 'remove':
      case 'block':
        setConfirm({ kind: action, target });
        return;
      case 'decline':
        void controller.decline(userId);
        return;
      case 'cancel':
        void controller.cancel(userId);
        return;
      case 'unblock':
        void controller.unblock(userId);
        return;
    }
  };

  const addFromLookup = () => gate.run(() => void controller.addFromLookup());

  const confirmSheet = confirm === null ? null : renderConfirm(confirm);

  function renderConfirm({ kind, target }: Confirm): ReactNode {
    const name = target.displayName;
    const ok = () => {
      setConfirm(null);
      void (kind === 'remove' ? controller.remove(target.userId) : controller.block(target.userId));
    };
    const close = () => setConfirm(null);
    return kind === 'remove' ? (
      <ConfirmSheet
        title={tr('friends.confirm.removeTitle')}
        body={tr('friends.confirm.removeBody', { name })}
        confirmLabel={tr('friends.confirm.remove')}
        onConfirm={ok}
        onCancel={close}
        testID="friends-confirm-remove"
      />
    ) : (
      <ConfirmSheet
        title={tr('friends.confirm.blockTitle', { name })}
        body={tr('friends.confirm.blockBody')}
        confirmLabel={tr('friends.confirm.block')}
        onConfirm={ok}
        onCancel={close}
        destructive
        testID="friends-confirm-block"
      />
    );
  }

  return {
    perform,
    addFromLookup,
    sheet: (
      <>
        {confirmSheet}
        {gate.sheet}
      </>
    ),
  };
}
