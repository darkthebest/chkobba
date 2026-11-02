import type { CompetitiveStats, PlayerProfileResponse, PracticeStats } from '@chkobba/protocol';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Availability } from '@/components/directory/Availability';
import { ConfirmSheet } from '@/components/friends/ConfirmSheet';
import { FriendButton } from '@/components/friends/FriendButton';
import { nameInitial } from '@/components/friends/FriendRow';
import { useNameGatedAction } from '@/components/friends/useNameGatedAction';
import { StatBlock, type StatRow } from '@/components/profile/StatBlock';
import { useLanguage, useT, type LanguageCode, type TFunction } from '@/i18n';
import type {
  DirectoryBackend,
  DirectoryError,
  PlayerProfile as PlayerProfileResult,
} from '@/online/directory';
import type { FriendActionResult, FriendsBackend, InviteResult } from '@/online/friends';
import { directoryErrorMessage, friendErrorMessage, inviteErrorMessage } from '@/online/messages';
import type { ProfileBackend, SessionSource } from '@/online/profile';
import { getRoomSession, subscribeRoomSession } from '@/online/roomSession';
import { getDirectoryBackend, getFriendsBackend, getGuestAuth, getProfileBackend } from '@/online/services';
import { useSocial, useSocialRelations, type SocialRelations } from '@/online/socialContext';
import { useSkin } from '@/skins';

/**
 * One player's public profile, shared by the `/p/[userId]` route (phone, and a
 * desktop deep link) and the `/players` desktop panel.
 *
 * The component resolves the player itself, from the directory backend's
 * `profile` RPC — it is not a view over the directory search list and never
 * builds a second copy of the friends or directory controller. Relation state
 * comes from the app-level social context (`useSocialRelations`), which the
 * route and the desktop panel both reach, so no caller drills it in as a prop.
 *
 * Four states are reachable, plus the request error that replaces none of them:
 * - `loading`: the static skeleton idiom of `PlayerListSkeleton` (no shimmer,
 *   hidden from assistive tech; the polite live region announces the result).
 * - `found`: the player's name line, which Task 8.3 replaces with the header.
 * - `not_found`: an unknown, unlisted or blocked player, and a malformed id;
 *   the backend answers all of those the same way.
 * - `self`: the route/panel points at the caller's own user id. Recognised by
 *   comparing with the session's id, not by name (a display name can change).
 * - `error`: a network or rate-limit failure, with a retry.
 *
 * Extension points for Phase 8 (kept in one component so the two surfaces
 * cannot fork):
 * - 8.3 header and relation line, 8.4 hidden-availability line, 8.5 the two
 *   stat blocks, 8.6 actions by relation and 8.7 the in-room invite all mount
 *   inside `FoundProfile`, at the marked slots.
 * - 8.8 (the lists follow a block with no reload) belongs to the controllers:
 *   a successful action publishes the relation sets through
 *   `social.refreshFriends()`, and `useFriendsController` and
 *   `useDirectoryController` reload when the published blocked set no longer
 *   matches what they hold. This component never creates a controller and
 *   nothing is drilled down from the caller.
 *
 * ```tsx
 * <PlayerProfile userId={userId} />
 * ```
 */

export type PlayerProfileState =
  | { readonly status: 'loading' }
  | { readonly status: 'found'; readonly player: PlayerProfileResponse }
  | { readonly status: 'not_found' }
  | { readonly status: 'self' }
  | { readonly status: 'error'; readonly reason: DirectoryError };

export interface PlayerProfileProps {
  /** The player to show; an empty or malformed id renders `not_found`. */
  readonly userId: string;
  /** Defaults to the app's shared directory backend. */
  readonly backend?: DirectoryBackend;
  /**
   * The session source used to recognise the caller's own id. Defaults to the
   * shared `GuestAuth`, the same session the directory backend signs in with.
   */
  readonly auth?: SessionSource;
  /**
   * The caller's own user id when it is already known (tests, or a caller that
   * holds it). Omitted means "read it from the session".
   */
  readonly selfUserId?: string;
}

/** A bad id is not a player: the server distinguishes a malformed id from a fault, but the screen does not. */
const NOT_FOUND_REASONS: ReadonlySet<DirectoryError> = new Set(['directory_not_found', 'directory_bad_query']);

/** A resolved state, tagged with the request it belongs to so a selection change shows the skeleton at once. */
interface ResolvedProfile {
  readonly userId: string;
  readonly attempt: number;
  readonly state: PlayerProfileState;
}

/**
 * Resolves one profile. Kept outside the component so the effect has no
 * synchronous `setState`: it only installs the promise's result.
 */
async function resolveProfileState(
  targetId: string,
  backend: DirectoryBackend | undefined,
  auth: SessionSource | undefined,
  selfUserId: string | undefined,
): Promise<PlayerProfileState> {
  // Resolve the caller's id first, so a profile that points at the caller never
  // costs a directory read and never shows the wrong state.
  let ownId: string | null = selfUserId ?? null;
  if (selfUserId === undefined) {
    try {
      const source = auth ?? getGuestAuth();
      const { session } = await source.signIn();
      ownId = typeof session.user_id === 'string' ? session.user_id : null;
    } catch {
      // Unknown own id is not fatal: the profile read reports the real failure.
    }
    if (ownId !== null && ownId === targetId) return { status: 'self' };
  }

  let result: PlayerProfileResult;
  try {
    const source = backend ?? getDirectoryBackend();
    result = await source.profile(targetId);
  } catch {
    result = { ok: false, reason: 'network' };
  }

  if (result.ok) return { status: 'found', player: result };
  if (NOT_FOUND_REASONS.has(result.reason)) return { status: 'not_found' };
  return { status: 'error', reason: result.reason };
}

export function PlayerProfile({ userId, backend, auth, selfUserId }: PlayerProfileProps) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Panel } = skin.components;
  const tr = useT();
  const [resolved, setResolved] = useState<ResolvedProfile | null>(null);
  const [attempt, setAttempt] = useState(0);
  const targetId = userId.trim();

  // Derived, not stored: a new id or a retry reads as loading immediately,
  // without an effect writing state on the way in.
  const state: PlayerProfileState =
    targetId === ''
      ? { status: 'not_found' }
      : selfUserId !== undefined && selfUserId === targetId
        ? { status: 'self' }
        : resolved !== null && resolved.userId === targetId && resolved.attempt === attempt
          ? resolved.state
          : { status: 'loading' };

  useEffect(() => {
    if (targetId === '') return;
    // A known own id needs no session read and no directory call.
    if (selfUserId !== undefined && selfUserId === targetId) return;

    let cancelled = false;
    resolveProfileState(targetId, backend, auth, selfUserId).then(
      (next) => {
        if (!cancelled) setResolved({ userId: targetId, attempt, state: next });
      },
      () => {
        if (!cancelled) setResolved({ userId: targetId, attempt, state: { status: 'error', reason: 'network' } });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [attempt, auth, backend, selfUserId, targetId]);

  let content;
  switch (state.status) {
    case 'loading':
      content = <ProfileSkeleton />;
      break;
    case 'not_found':
      content = (
        <View style={styles.status} testID="profile-not-found">
          <Text
            style={[styles.statusTitle, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
            accessibilityRole="header"
          >
            {tr('profile.notFound.title')}
          </Text>
          <Text style={[styles.statusText, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
            {tr('profile.notFound.body')}
          </Text>
        </View>
      );
      break;
    case 'self':
      content = (
        <View style={styles.status} testID="profile-self">
          <Text style={[styles.statusText, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}>
            {tr('profile.self')}
          </Text>
        </View>
      );
      break;
    case 'error':
      content = (
        <View style={styles.status} testID="profile-error">
          <Text
            style={[styles.statusText, { color: t.colors.panelText, fontFamily: t.fonts.body }]}
            accessibilityRole="alert"
          >
            {directoryErrorMessage(state.reason, tr)}
          </Text>
          <FriendButton
            label={tr('common.tryAgain')}
            onPress={() => setAttempt((n) => n + 1)}
            tone="primary"
            testID="profile-retry"
          />
        </View>
      );
      break;
    case 'found':
      content = <FoundProfile player={state.player} />;
      break;
  }

  return (
    <View testID="player-profile">
      <Panel variant="sheet" style={styles.panel}>
        <Text
          style={[styles.title, { color: t.colors.panelText, fontFamily: t.fonts.display }]}
          accessibilityRole="header"
        >
          {tr('profile.title')}
        </Text>
        {/* One polite live region for every state change: loading -> found, not found, self or error. */}
        <View accessibilityLiveRegion="polite" testID="profile-state">
          {content}
        </View>
      </Panel>
    </View>
  );
}

/** The one relation line, already resolved by precedence. */
type PlayerRelation =
  | { readonly kind: 'blocked' }
  | { readonly kind: 'friends' }
  | { readonly kind: 'requestSent' }
  | { readonly kind: 'metAt'; readonly lastPlayedAt: number };

/**
 * The relation line's content, in precedence order: blocked, friends, an
 * outgoing pending request, then a shared table. Blocked is first so a blocked
 * player can never read as a friend, even when an old snapshot still carries
 * the friend edge. `outgoing` is the caller's sent request only, so an incoming
 * request never says "Request sent". No record at all means no line.
 */
function playerRelationOf(userId: string, relations: SocialRelations): PlayerRelation | null {
  if (relations.blocked.has(userId)) return { kind: 'blocked' };
  if (relations.friends.has(userId)) return { kind: 'friends' };
  if (relations.outgoing.has(userId)) return { kind: 'requestSent' };
  const lastPlayedAt = relations.metAt.get(userId);
  return lastPlayedAt === undefined ? null : { kind: 'metAt', lastPlayedAt };
}

type RelativeUnit = 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second';

interface RelativeStep {
  readonly unit: RelativeUnit;
  readonly ms: number;
}

/** Largest first, so a duration reads as one unit ("last week", not "7 days ago"). */
const RELATIVE_STEPS: readonly RelativeStep[] = [
  { unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: 'day', ms: 24 * 60 * 60 * 1000 },
  { unit: 'hour', ms: 60 * 60 * 1000 },
  { unit: 'minute', ms: 60 * 1000 },
];
const SECOND_MS = 1000;

/**
 * A past timestamp as the relative `{{when}}` that `profile.relation.metAt`
 * expects. Derja (`aeb`) has no CLDR data, so Arabic is the honest locale for
 * it; if the runtime has no `Intl.RelativeTimeFormat` (some Hermes builds), a
 * plain local date keeps the line readable instead of failing.
 */
function relativeWhen(at: number, language: LanguageCode, now: number): string {
  const diff = at - now;
  const step =
    RELATIVE_STEPS.find((candidate) => Math.abs(diff) >= candidate.ms) ?? { unit: 'second' as const, ms: SECOND_MS };
  const locale = language === 'aeb' ? 'ar' : language;
  if (typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function') {
    try {
      return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(Math.round(diff / step.ms), step.unit);
    } catch {
      // No locale data for this runtime: fall through to the date.
    }
  }
  try {
    return new Date(at).toLocaleDateString(locale);
  } catch {
    return new Date(at).toISOString().slice(0, 10);
  }
}

/** The translated line. Precedence already picked the single branch. */
function relationText(relation: PlayerRelation, tr: TFunction, language: LanguageCode, now: number): string {
  switch (relation.kind) {
    case 'blocked':
      return tr('profile.relation.blocked');
    case 'friends':
      return tr('profile.relation.friends');
    case 'requestSent':
      return tr('profile.relation.requestSent');
    case 'metAt':
      return tr('profile.relation.metAt', { when: relativeWhen(relation.lastPlayedAt, language, now) });
  }
}

/**
 * The competitive block's rows, in display order: games, wins, the team-level
 * chkobba sweeps, then the streaks. Server-observed only (ADR-0005).
 */
function competitiveRows(stats: CompetitiveStats): readonly StatRow[] {
  return [
    { id: 'games', value: stats.games },
    { id: 'wins', value: stats.wins },
    { id: 'chkobbas', value: stats.chkobbas },
    { id: 'currentStreak', value: stats.currentStreak },
    { id: 'bestStreak', value: stats.bestStreak },
  ];
}

/**
 * The practice block's rows. The same three counters and no streaks: a streak
 * the device asserted would read as a competitive fact (ADR-0005 §5).
 */
function practiceRows(stats: PracticeStats): readonly StatRow[] {
  return [
    { id: 'games', value: stats.games },
    { id: 'wins', value: stats.wins },
    { id: 'chkobbas', value: stats.chkobbas },
  ];
}

/** The buttons the profile can offer; each id is one translated label and one backend call. */
type ProfileActionId = 'add' | 'cancelRequest' | 'remove' | 'block' | 'unblock' | 'invite';

/** The friend-edge actions; `invite` is not one, it goes through the room's invite call. */
type FriendProfileActionId = Exclude<ProfileActionId, 'invite'>;

const PROFILE_ACTION_KEYS = {
  add: 'profile.actions.add',
  cancelRequest: 'profile.actions.cancelRequest',
  remove: 'profile.actions.remove',
  block: 'profile.actions.block',
  unblock: 'profile.actions.unblock',
  invite: 'profile.actions.invite',
} as const satisfies Record<ProfileActionId, string>;

/**
 * The action set for a relation, in display order. `metAt` is a recent-player
 * record, not an edge, so it gets the same Add as "no relation at all". Every
 * other relation renders exactly its own actions: nothing is disabled or
 * hidden with `display`, so a dropped button is never left focusable.
 *
 * Invite is added only for a friend, and only when the caller is in a live
 * private room (`roomCode !== null`). It is absent elsewhere, never disabled:
 * the server rejects a non-friend (`invite_not_friend`) and a caller outside a
 * room (`invite_room_not_found`), and a disabled button would only ask the
 * player to work out why. `blocked` is its own relation above `friends`, so a
 * blocked player can never reach the friends branch.
 */
function profileActionsFor(relation: PlayerRelation | null, roomCode: string | null): readonly ProfileActionId[] {
  switch (relation?.kind) {
    case 'friends':
      return roomCode === null ? ['remove', 'block'] : ['invite', 'remove', 'block'];
    case 'requestSent':
      return ['cancelRequest'];
    case 'blocked':
      return ['unblock'];
    case 'metAt':
    case undefined:
      return ['add'];
  }
}

/**
 * The room the caller is in right now, or null outside one. It subscribes to
 * the existing room session so a leave or a room swap re-renders the profile;
 * it adds no read of its own, and the session is only ever published by the
 * live private room and cleared when that screen ends.
 */
function useRoomCode(): string | null {
  const session = useSyncExternalStore(subscribeRoomSession, getRoomSession, getRoomSession);
  return session === null ? null : session.code;
}

/**
 * The friends backend call behind each button. Cancel, Remove and Unblock all
 * drop the edge in Nakama, which is why one `remove` serves all three
 * (`FriendsBackend.remove`). Add also accepts an incoming request, but the
 * profile never labels it Accept: the caller asked first, so Add is honest.
 */
function profileActionCall(
  friends: FriendsBackend,
  userId: string,
  action: FriendProfileActionId,
): Promise<FriendActionResult> {
  switch (action) {
    case 'add':
      return friends.add(userId);
    case 'cancelRequest':
    case 'remove':
    case 'unblock':
      return friends.remove(userId);
    case 'block':
      return friends.block(userId);
  }
}

/**
 * The relation-dependent actions and their sheets.
 *
 * It uses the `FriendsBackend` the social provider already owns — the profile
 * never builds a friends controller and never calls Nakama itself, matching the
 * friends sheet. Add goes through `useNameGatedAction` because a request shows
 * the caller's name to someone else; Remove and Block ask first through the
 * shared `ConfirmSheet`; Cancel and Unblock are reversible and run directly.
 *
 * A success calls the provider's `refreshFriends()`, which reloads the relation
 * sets (`SocialProvider.loadRelations`). The button set then follows the new
 * edge from the one source the header line already reads, so a block is not
 * duplicated here and no second copy of the friend list can drift. That
 * published set is also what the friends and directory controllers watch, so a
 * block made here drops the player from their lists without a reload (8.8).
 *
 * Invite (Task 8.7) is the room's own path, not a friend-edge call: the same
 * `FriendsBackend.invite` the invite sheet uses, with the room code from the
 * live room session, and the same feedback — the button becomes the sheet's
 * "Invited" (a `sent: false` duplicate included, since the friend already has
 * it) and a failure uses `inviteErrorMessage` in the shared alert line.
 */
function useProfileActions(
  player: PlayerProfileResponse,
  relation: PlayerRelation | null,
): { readonly body: ReactNode; readonly sheet: ReactNode } {
  const t = useSkin().skin.tokens;
  const tr = useT();
  const social = useSocial();
  // Null outside a live room; the invite action is absent then, never disabled.
  const roomCode = useRoomCode();
  const [friends] = useState<FriendsBackend>(() => social.friends ?? getFriendsBackend());
  const [profile] = useState<ProfileBackend>(() => getProfileBackend());
  const gate = useNameGatedAction(profile);
  const [confirm, setConfirm] = useState<'remove' | 'block' | null>(null);
  // Per player and per room code, so a new profile or room never inherits "Invited".
  const [invited, setInvited] = useState<{ readonly userId: string; readonly code: string } | null>(null);
  const invitedHere = invited !== null && invited.userId === player.userId && invited.code === roomCode;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The context value changes on every social update; read the refresh through a ref.
  const socialRef = useRef(social);
  useEffect(() => {
    socialRef.current = social;
  });

  const run = useCallback(
    async (action: FriendProfileActionId): Promise<void> => {
      setBusy(true);
      setError(null);
      let result: FriendActionResult;
      try {
        result = await profileActionCall(friends, player.userId, action);
      } catch {
        result = { ok: false, reason: 'network' };
      }
      if (!mounted.current) return;
      setBusy(false);
      if (result.ok) {
        // The provider owns the relation sets; a changed edge is reloaded there.
        void socialRef.current.refreshFriends();
      } else {
        setError(friendErrorMessage(result.reason, tr));
      }
    },
    [friends, player.userId, tr],
  );

  // The room's invite call, shared with `InviteFriendsSheet`. A duplicate
  // (`ok` with `sent: false`) is the friend already having it, so it lands in
  // the same "Invited" state rather than as an error.
  const runInvite = useCallback(async (): Promise<void> => {
    if (roomCode === null) return;
    setBusy(true);
    setError(null);
    let result: InviteResult;
    try {
      result = await friends.invite(player.userId, roomCode);
    } catch {
      result = { ok: false, reason: 'network' };
    }
    if (!mounted.current) return;
    setBusy(false);
    if (result.ok) setInvited({ userId: player.userId, code: roomCode });
    else setError(inviteErrorMessage(result.reason, tr));
  }, [friends, player.userId, roomCode, tr]);

  const perform = (action: ProfileActionId) => {
    switch (action) {
      case 'invite':
        // The invite shows our name to the friend, exactly like the sheet's.
        gate.run(() => void runInvite());
        return;
      case 'add':
        gate.run(() => void run(action));
        return;
      case 'remove':
      case 'block':
        setConfirm(action);
        return;
      case 'cancelRequest':
      case 'unblock':
        void run(action);
        return;
    }
  };

  const confirmSheet =
    confirm === null ? null : (
      <ConfirmSheet
        title={
          confirm === 'remove'
            ? tr('profile.confirm.removeTitle')
            : tr('profile.confirm.blockTitle', { name: player.name })
        }
        body={
          confirm === 'remove'
            ? tr('profile.confirm.removeBody', { name: player.name })
            : tr('profile.confirm.blockBody')
        }
        confirmLabel={confirm === 'remove' ? tr('profile.confirm.remove') : tr('profile.confirm.block')}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          void run(action);
        }}
        onCancel={() => setConfirm(null)}
        destructive={confirm === 'block'}
        testID={confirm === 'remove' ? 'profile-confirm-remove' : 'profile-confirm-block'}
      />
    );

  return {
    body: (
      <View style={styles.actionsBlock}>
        <View style={styles.actions} testID="profile-actions">
          {profileActionsFor(relation, roomCode).map((action) => {
            // The sheet's own success state: the same "Invited" label, disabled.
            const done = action === 'invite' && invitedHere;
            return (
              <FriendButton
                key={action}
                label={done ? tr('invite.invited') : tr(PROFILE_ACTION_KEYS[action])}
                onPress={() => perform(action)}
                tone={action === 'add' || action === 'invite' ? 'primary' : action === 'block' ? 'danger' : 'plain'}
                disabled={busy || done}
                testID={`profile-action-${action}`}
              />
            );
          })}
        </View>
        {error === null ? null : (
          <Text
            style={[styles.actionError, { color: t.colors.panelText, fontFamily: t.fonts.body }]}
            accessibilityRole="alert"
            testID="profile-action-error"
          >
            {error}
          </Text>
        )}
      </View>
    ),
    sheet: (
      <>
        {confirmSheet}
        {gate.sheet}
      </>
    ),
  };
}

/**
 * The found body. The header is the active skin's `Avatar` slot (the same one
 * `PlayerRow` and the table use), the name, and the directory's own
 * `Availability`, so the two surfaces cannot disagree. Relation state comes
 * from the app-level social context, which both the `/p/[userId]` route and the
 * desktop panel can reach; nothing here calls Nakama. Phase 8 fills the
 * remaining marked slots.
 */
function FoundProfile({ player }: { readonly player: PlayerProfileResponse }) {
  const { skin } = useSkin();
  const t = skin.tokens;
  const { Avatar } = skin.components;
  const tr = useT();
  const { language } = useLanguage();
  const social = useSocial();
  const relations = useSocialRelations();
  const relation = playerRelationOf(player.userId, relations);
  const availability = social.state.availability[player.userId];
  // One action set per relation (Task 8.6); the sheets mount over the profile body.
  const actions = useProfileActions(player, relation);

  return (
    <View style={styles.found} testID="profile-found">
      <View style={styles.header}>
        {/*
         * One stop for a screen reader: the avatar is decorative, and the name
         * keeps its full spoken label regardless of the one-line visual clamp.
         */}
        <View style={styles.identity} accessible accessibilityRole="text">
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Avatar initial={nameInitial(player.name)} side="us" isTurn={false} isDealer={false} size="md" />
          </View>
          <View style={styles.text}>
            <Text
              style={[styles.name, { color: t.colors.panelText, fontFamily: t.fonts.bodyBold }]}
              numberOfLines={1}
              accessibilityLabel={player.name}
              testID="profile-name"
            >
              {player.name}
            </Text>
            {/*
             * Visible players only: hidden is Task 8.4's own line with its own
             * wording, and `Availability` must not pre-empt it here.
             */}
            {player.presence === 'visible' ? (
              // `profile-availability` covers outcomes 1 and 3 (live state or
              // genuine offline); its text says which one. Hidden never mounts
              // this component, so it can never inherit an offline label.
              <View testID="profile-availability">
                <Availability presence={player.presence} availability={availability} />
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {/*
       * Task 8.3: exactly one relation line. When there is no edge and no
       * recent-player record, nothing renders; there is no "not met" wording.
       */}
      {relation !== null ? (
        <Text
          style={[styles.relation, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}
          numberOfLines={1}
          testID="profile-relation"
        >
          {relationText(relation, tr, language, relations.loadedAt)}
        </Text>
      ) : null}
      {/*
       * Task 8.4: hidden availability is its own line, with the profile's own
       * wording. The branch keys off `player.presence` alone, so a stale
       * availability entry can never turn a hidden player online or offline;
       * `Availability` (the only source of the offline string) is mounted only
       * for a visible player above. No dot is rendered: there is no state to
       * show, and a leftover dot would falsely imply presence. The line is plain
       * text, so assistive tech announces it rather than relying on colour.
       */}
      {player.presence === 'hidden' ? (
        <Text
          style={[styles.hiddenAvailability, { color: t.colors.panelMuted, fontFamily: t.fonts.body }]}
          testID="profile-availability-hidden"
        >
          {tr('profile.availability.hidden')}
        </Text>
      ) : null}
      {/*
       * Task 8.5: the two blocks, side by side and never summed, merged or
       * compared (ADR-0005). Competitive is server-observed; Practice is
       * device-reported and carries its marker. Both always render their rows,
       * so a new player sees real zeros rather than an empty block.
       */}
      <View style={styles.stats} testID="profile-stats">
        <StatBlock
          kind="competitive"
          label={tr('profile.stats.competitive')}
          rows={competitiveRows(player.stats.competitive)}
        />
        <StatBlock
          kind="practice"
          label={tr('profile.stats.practice')}
          rows={practiceRows(player.stats.practice)}
          deviceReported
        />
      </View>
      {/*
       * Task 8.6: Add / Request sent + Cancel / Friends + Remove + Block / Unblock, by relation.
       * Task 8.7: Invite to table joins the same row for a friend, and only while the caller is in
       * a live room; outside one `profileActionsFor` leaves it out, so there is no disabled invite
       * to explain. The non-found states never reach this body at all.
       */}
      {actions.body}
      {/* The confirm and name sheets, inside the profile body their actions belong to. */}
      {actions.sheet}
    </View>
  );
}

/**
 * The loading placeholder. Static, like `PlayerListSkeleton`: no shimmer, no
 * timer and no animation, and hidden from assistive tech because the polite
 * live region on the state wrapper announces the next state instead.
 */
function ProfileSkeleton() {
  const t = useSkin().skin.tokens;
  const fill = { backgroundColor: t.colors.segmentBg };

  return (
    <View
      style={styles.skeleton}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="profile-skeleton"
    >
      <View style={styles.skeletonHeader}>
        <View style={[styles.skeletonAvatar, fill]} />
        <View style={styles.skeletonLines}>
          <View style={[styles.skeletonName, fill]} />
          <View style={[styles.skeletonMeta, fill]} />
        </View>
      </View>
      <View style={[styles.skeletonBlock, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, alignItems: 'stretch' },
  title: { fontSize: 22, flexShrink: 1 },
  found: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, flexGrow: 1, flexShrink: 1, minWidth: 160 },
  text: { flexShrink: 1, gap: 2 },
  name: { fontSize: 18 },
  relation: { fontSize: 14 },
  // Same size as the directory's availability label, but with no dot: hidden is
  // a privacy state, not a presence state.
  hiddenAvailability: { fontSize: 13 },
  // Side by side when the panel is wide enough, stacked on a phone.
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  // Actions wrap under each other on a narrow panel rather than shrinking the labels.
  actionsBlock: { gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  actionError: { fontSize: 14, lineHeight: 20 },
  status: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 20 },
  statusTitle: { fontSize: 18, textAlign: 'center' },
  statusText: { fontSize: 15, textAlign: 'center' },
  skeleton: { gap: 16, paddingVertical: 4 },
  skeletonHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonAvatar: { width: 56, height: 56, borderRadius: 28 },
  skeletonLines: { flexGrow: 1, flexShrink: 1, gap: 8 },
  skeletonName: { width: '50%', height: 16, borderRadius: 8 },
  skeletonMeta: { width: '35%', height: 11, borderRadius: 6 },
  skeletonBlock: { height: 96, borderRadius: 12 },
});
