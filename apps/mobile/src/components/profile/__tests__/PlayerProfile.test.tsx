/**
 * PlayerProfile: the shared profile body (`/p/[userId]` on a phone, the
 * directory's desktop panel). These tests drive the component with fake
 * directory/friends backends and a seeded social context, never a live socket.
 *
 * Every test mounts both the `SocialContext` and the `SocialRelationsContext`,
 * including the blocked case, so a relation is never exercised from
 * `useSocialRelations`' fail-open empty fallback (Task 8.3). The in-room invite
 * is driven through the real room-session store rather than a mocked component.
 *
 * Route-level wiring (`/p/[userId]`, the session-based self check, Derja) lives
 * in `src/__tests__/playerProfile.test.tsx`, never under `src/app`.
 */
import type {
  CompetitiveStats,
  PlayerProfileResponse,
  PracticeStats,
} from '@chkobba/protocol';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { LanguageProvider, i18n } from '@/i18n';
import { isolate } from '@/i18n/i18n';
import { aeb } from '@/i18n/locales/aeb';
import { en } from '@/i18n/locales/en';
import type {
  DirectoryBackend,
  PlayerProfile as PlayerProfileResult,
} from '@/online/directory';
import type {
  FriendActionResult,
  FriendsBackend,
  FriendsSnapshot,
  InviteResult,
} from '@/online/friends';
import type { Profile, ProfileBackend } from '@/online/profile';
import { clearRoomSession, publishRoomSession } from '@/online/roomSession';
import {
  EMPTY_SOCIAL_STATE,
  SocialContext,
  SocialRelationsContext,
  type SocialContextValue,
  type SocialRelations,
} from '@/online/socialContext';

import { PlayerProfile } from '../PlayerProfile';

const PLAYER_ID = 'u-nadia';
const SELF_ID = 'u-me';
/** A fixed clock, so the relative `metAt` line is deterministic. */
const LOADED_AT = 1_700_000_000_000;
const ROOM_CODE = 'HJKM67';

const EMPTY_SNAPSHOT: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };

const ZERO_COMPETITIVE: CompetitiveStats = {
  games: 0,
  wins: 0,
  chkobbas: 0,
  currentStreak: 0,
  bestStreak: 0,
  updatedAt: 0,
};
const ZERO_PRACTICE: PracticeStats = { games: 0, wins: 0, chkobbas: 0, updatedAt: 0 };

// The component falls back to the shared singletons for the profile and friends
// backends; every test injects a fake so no nakama-js client is ever built.
const mockServices: {
  directory: DirectoryBackend | null;
  friends: FriendsBackend | null;
  profile: ProfileBackend | null;
} = { directory: null, friends: null, profile: null };

jest.mock('@/online/services', () => ({
  // The component always receives its directory backend as a prop in these tests.
  getDirectoryBackend: () => mockServices.directory,
  getFriendsBackend: () => mockServices.friends,
  getProfileBackend: () => mockServices.profile,
  getGuestAuth: () => ({ signIn: async () => ({ session: { user_id: 'u-me' } }) }),
}));

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function profileResponse(overrides: Partial<PlayerProfileResponse> = {}): PlayerProfileResponse {
  return {
    userId: PLAYER_ID,
    name: 'Nadia',
    presence: 'visible',
    stats: {
      competitive: { ...ZERO_COMPETITIVE },
      practice: { ...ZERO_PRACTICE },
    },
    ...overrides,
  };
}

function found(overrides: Partial<PlayerProfileResponse> = {}): PlayerProfileResult {
  return { ok: true, ...profileResponse(overrides) };
}

function makeDirectory(responder: () => Promise<PlayerProfileResult>) {
  const profile = jest.fn(responder);
  const backend: DirectoryBackend = {
    search: jest.fn(async () => ({ ok: true as const, players: [], nextCursor: null, capped: false })),
    profile,
    setPresenceVisibility: jest.fn(async () => ({ ok: false as const, reason: 'network' as const })),
  };
  return { backend, profile };
}

function makeFriends() {
  return {
    list: jest.fn((): Promise<FriendsSnapshot> => Promise.resolve(EMPTY_SNAPSHOT)),
    recentPlayers: jest.fn(async () => []),
    lookupCode: jest.fn(async () => ({ ok: true as const, userId: 'u-zied', displayName: 'Zied', self: false })),
    add: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    remove: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    block: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    invite: jest.fn((_id: string, _code: string): Promise<InviteResult> => Promise.resolve({ ok: true, sent: true })),
  } satisfies FriendsBackend;
}

function makeProfileBackend(namePicked = true): ProfileBackend {
  const profile: Profile = {
    displayName: 'Hamza',
    namePicked,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
  };
  return {
    getProfile: jest.fn((): Promise<Profile> => Promise.resolve(profile)),
    setDisplayName: jest.fn(
      (name: string): Promise<{ ok: true; profile: Profile }> =>
        Promise.resolve({ ok: true, profile: { ...profile, displayName: name, namePicked: true } }),
    ),
  } satisfies ProfileBackend;
}

function makeSocial(options: {
  friends: FriendsBackend;
  availability?: SocialContextValue['state']['availability'];
}): SocialContextValue {
  return {
    state: { ...EMPTY_SOCIAL_STATE, availability: options.availability ?? {} },
    friends: options.friends,
    ensureConnected: jest.fn(() => Promise.resolve(true)),
    refreshFriends: jest.fn(() => Promise.resolve()),
    dismissInvite: jest.fn(() => Promise.resolve()),
    setActivity: jest.fn(),
    presenceVisibility: 'everyone',
    setPresenceVisibility: jest.fn(() => Promise.resolve({ ok: false, reason: 'network' })),
    handInProgress: false,
    setHandInProgress: jest.fn(),
    onEvent: jest.fn(() => () => undefined),
  };
}

function makeRelations(overrides: Partial<SocialRelations> = {}): SocialRelations {
  return {
    friends: new Set<string>(),
    outgoing: new Set<string>(),
    blocked: new Set<string>(),
    metAt: new Map<string, number>(),
    loadedAt: LOADED_AT,
    ...overrides,
  };
}

/** Lets the directory read, the action promises and the gate's profile read settle. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

/** Presses a control and lets its promises settle (RNTL v14 `fireEvent` is async). */
async function press(testID: string): Promise<void> {
  await fireEvent.press(screen.getByTestId(testID));
  await settle();
}

async function switchLanguage(language: 'en' | 'aeb'): Promise<void> {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

interface MountOptions {
  userId?: string;
  result?: PlayerProfileResult;
  pending?: Deferred<PlayerProfileResult>;
  directory?: ReturnType<typeof makeDirectory>;
  relations?: Partial<SocialRelations>;
  availability?: SocialContextValue['state']['availability'];
  friends?: ReturnType<typeof makeFriends>;
  profile?: ProfileBackend;
  selfUserId?: string;
  language?: 'en' | 'aeb';
}

async function mount(options: MountOptions = {}) {
  const userId = options.userId ?? PLAYER_ID;
  const friends = options.friends ?? makeFriends();
  const profile = options.profile ?? makeProfileBackend();
  mockServices.friends = friends;
  mockServices.profile = profile;

  const directory =
    options.directory ??
    makeDirectory(() =>
      options.pending !== undefined ? options.pending.promise : Promise.resolve(options.result ?? found()),
    );
  mockServices.directory = directory.backend;

  const social = makeSocial({ friends, availability: options.availability });
  const relations = makeRelations(options.relations);
  const language = options.language ?? 'en';
  if (language === 'aeb') await switchLanguage('aeb');

  const element: ReactElement = (
    <LanguageProvider initial={language}>
      <SocialContext.Provider value={social}>
        <SocialRelationsContext.Provider value={relations}>
          <PlayerProfile userId={userId} backend={directory.backend} selfUserId={options.selfUserId ?? SELF_ID} />
        </SocialRelationsContext.Provider>
      </SocialContext.Provider>
    </LanguageProvider>
  );
  await render(element);
  await settle();
  return { directory, friends, profile, social, relations, element };
}

const ALL_ACTIONS = ['add', 'cancelRequest', 'remove', 'block', 'unblock', 'invite'] as const;
type ActionId = (typeof ALL_ACTIONS)[number];

/** Asserts the exact action set: every expected button mounts, every other is absent. */
function expectActions(expected: readonly ActionId[]): void {
  for (const id of ALL_ACTIONS) {
    const node = screen.queryByTestId(`profile-action-${id}`);
    if (expected.includes(id)) expect(node).toBeOnTheScreen();
    else expect(node).not.toBeOnTheScreen();
  }
}

describe('PlayerProfile states', () => {
  afterEach(async () => {
    clearRoomSession();
    await switchLanguage('en');
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    jest.clearAllMocks();
  });

  it('should show the hidden skeleton while the profile is read', async () => {
    // Arrange
    const pending = deferred<PlayerProfileResult>();

    // Act
    await mount({ pending });

    // Assert
    expect(screen.getByTestId('profile-skeleton', { includeHiddenElements: true })).toBeOnTheScreen();
  });

  it('should show the player name when the profile is found', async () => {
    // Arrange & Act
    await mount({ result: found() });

    // Assert
    expect(screen.getByTestId('profile-found')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Nadia');
  });

  it('should show the not-found state when the backend does not know the player', async () => {
    // Arrange & Act
    await mount({ result: { ok: false, reason: 'directory_not_found' } });

    // Assert
    expect(screen.getByTestId('profile-not-found')).toHaveTextContent(en.profile.notFound.title, { exact: false });
  });

  it('should treat a malformed id as not found', async () => {
    // Arrange & Act
    await mount({ result: { ok: false, reason: 'directory_bad_query' } });

    // Assert
    expect(screen.getByTestId('profile-not-found')).toBeOnTheScreen();
  });

  it('should show the self state without asking the directory', async () => {
    // Arrange & Act
    const { directory } = await mount({ userId: PLAYER_ID, selfUserId: PLAYER_ID });

    // Assert
    expect(screen.getByTestId('profile-self')).toHaveTextContent(en.profile.self);
    expect(directory.profile).not.toHaveBeenCalled();
  });

  it('should show the localised error when the profile read fails', async () => {
    // Arrange & Act
    await mount({ result: { ok: false, reason: 'network' } });

    // Assert
    expect(screen.getByTestId('profile-retry')).toBeOnTheScreen();
    expect(screen.getByText(en.directory.errors.network)).toBeOnTheScreen();
  });

  it('should refetch the profile when retry is pressed', async () => {
    // Arrange
    const directory = makeDirectory(() => Promise.resolve(found()));
    directory.profile
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce(found({ name: 'Nadia' }));
    await mount({ directory });

    // Act
    await press('profile-retry');

    // Assert: the second read replaced the error with the found body.
    expect(screen.getByTestId('profile-found')).toBeOnTheScreen();
  });
});

describe('PlayerProfile relations', () => {
  afterEach(async () => {
    clearRoomSession();
    await switchLanguage('en');
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    jest.clearAllMocks();
  });

  it('should render no relation line and only Add when there is no relation', async () => {
    // Arrange & Act
    await mount();

    // Assert
    expect(screen.queryByTestId('profile-relation')).not.toBeOnTheScreen();
    expectActions(['add']);
  });

  it('should say Request sent and offer only Cancel for an outgoing request', async () => {
    // Arrange & Act
    await mount({ relations: { outgoing: new Set([PLAYER_ID]) } });

    // Assert
    expect(screen.getByTestId('profile-relation')).toHaveTextContent(en.profile.relation.requestSent);
    expectActions(['cancelRequest']);
  });

  it('should say You are friends and offer Remove and Block outside a room', async () => {
    // Arrange & Act
    await mount({ relations: { friends: new Set([PLAYER_ID]) } });

    // Assert
    expect(screen.getByTestId('profile-relation')).toHaveTextContent(en.profile.relation.friends);
    expectActions(['remove', 'block']);
  });

  it('should say You blocked this player and offer only Unblock', async () => {
    // Arrange & Act
    await mount({ relations: { blocked: new Set([PLAYER_ID]) } });

    // Assert: a blocked player never reaches the friends branch, so no Add button.
    expect(screen.getByTestId('profile-relation')).toHaveTextContent(en.profile.relation.blocked);
    expectActions(['unblock']);
    expect(screen.queryByTestId('profile-action-add')).not.toBeOnTheScreen();
  });

  it('should say Met at a table and offer Add for a recent player', async () => {
    // Arrange & Act
    await mount({
      relations: { metAt: new Map([[PLAYER_ID, LOADED_AT - 2 * 60 * 60 * 1000]]) },
    });

    // Assert: the relative time is runtime-formatted, so the prefix is the stable part.
    expect(screen.getByTestId('profile-relation')).toHaveTextContent('Met at a table', { exact: false });
    expectActions(['add']);
  });
});

describe('PlayerProfile availability', () => {
  afterEach(async () => {
    clearRoomSession();
    await switchLanguage('en');
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    jest.clearAllMocks();
  });

  it('should show the live activity of a present player', async () => {
    // Arrange & Act
    await mount({ availability: { [PLAYER_ID]: 'online' } });

    // Assert
    expect(within(screen.getByTestId('profile-availability')).getByText(en.friends.availability.online)).toBeOnTheScreen();
  });

  it('should show offline for a visible player with no presence', async () => {
    // Arrange & Act
    await mount({ result: found({ presence: 'visible' }) });

    // Assert
    expect(within(screen.getByTestId('profile-availability')).getByText(en.friends.availability.offline)).toBeOnTheScreen();
  });

  it('should show the hidden line and never the offline text or a dot', async () => {
    // Arrange & Act
    await mount({ result: found({ presence: 'hidden' }) });

    // Assert: hidden is a privacy state with its own line; Availability never
    // mounts, so neither the offline wording nor its dot can leak in.
    expect(screen.getByTestId('profile-availability-hidden')).toHaveTextContent(en.profile.availability.hidden);
    expect(screen.queryByText(en.friends.availability.offline)).not.toBeOnTheScreen();
    expect(screen.queryByText(en.directory.availability.hidden)).not.toBeOnTheScreen();
    expect(screen.queryByTestId('profile-availability')).not.toBeOnTheScreen();
  });
});

describe('PlayerProfile stats', () => {
  afterEach(async () => {
    clearRoomSession();
    await switchLanguage('en');
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    jest.clearAllMocks();
  });

  it('should render every competitive row, streaks included', async () => {
    // Arrange
    const competitive: CompetitiveStats = {
      games: 12,
      wins: 7,
      chkobbas: 3,
      currentStreak: 2,
      bestStreak: 5,
      updatedAt: 1,
    };

    // Act
    await mount({ result: found({ stats: { competitive, practice: { ...ZERO_PRACTICE } } }) });

    // Assert
    const block = screen.getByTestId('profile-stat-block-competitive');
    expect(within(block).getByTestId('profile-stat-competitive-games')).toHaveTextContent('12', { exact: false });
    expect(within(block).getByTestId('profile-stat-competitive-wins')).toHaveTextContent('7', { exact: false });
    expect(within(block).getByTestId('profile-stat-competitive-chkobbas')).toHaveTextContent('3', { exact: false });
    expect(within(block).getByTestId('profile-stat-competitive-currentStreak')).toHaveTextContent('2', { exact: false });
    expect(within(block).getByTestId('profile-stat-competitive-bestStreak')).toHaveTextContent('5', { exact: false });
  });

  it('should label the competitive block', async () => {
    // Arrange & Act
    await mount();

    // Assert
    expect(screen.getByTestId('profile-stat-label-competitive')).toHaveTextContent(en.profile.stats.competitive);
  });

  it('should render the practice rows and no streaks', async () => {
    // Arrange
    const practice: PracticeStats = { games: 9, wins: 4, chkobbas: 1, updatedAt: 1 };

    // Act
    await mount({ result: found({ stats: { competitive: { ...ZERO_COMPETITIVE }, practice } }) });

    // Assert
    const block = screen.getByTestId('profile-stat-block-practice');
    expect(within(block).getByTestId('profile-stat-practice-games')).toHaveTextContent('9', { exact: false });
    expect(within(block).getByTestId('profile-stat-practice-wins')).toHaveTextContent('4', { exact: false });
    expect(within(block).getByTestId('profile-stat-practice-chkobbas')).toHaveTextContent('1', { exact: false });
    expect(within(block).queryByTestId('profile-stat-practice-currentStreak')).not.toBeOnTheScreen();
    expect(within(block).queryByTestId('profile-stat-practice-bestStreak')).not.toBeOnTheScreen();
  });

  it('should show the device-reported marker on the practice block only', async () => {
    // Arrange & Act
    await mount();

    // Assert
    expect(within(screen.getByTestId('profile-stat-block-practice')).getByTestId('profile-stat-device-reported')).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('profile-stat-block-competitive')).queryByTestId('profile-stat-device-reported'),
    ).not.toBeOnTheScreen();
  });

  it('should render zeros for a new player instead of omitting the rows', async () => {
    // Arrange & Act
    await mount();

    // Assert
    for (const kind of ['competitive', 'practice'] as const) {
      for (const row of ['games', 'wins', 'chkobbas'] as const) {
        expect(within(screen.getByTestId(`profile-stat-${kind}-${row}`)).getByText('0')).toBeOnTheScreen();
      }
    }
  });
});

describe('PlayerProfile invite action', () => {
  afterEach(async () => {
    clearRoomSession();
    await switchLanguage('en');
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    jest.clearAllMocks();
  });

  it('should leave Invite out for a friend outside a live room', async () => {
    // Arrange & Act
    await mount({ relations: { friends: new Set([PLAYER_ID]) } });

    // Assert
    expect(screen.queryByTestId('profile-action-invite')).not.toBeOnTheScreen();
  });

  it('should show Invite for a friend inside a live room', async () => {
    // Arrange
    publishRoomSession({ code: ROOM_CODE, matchId: 'match-1' });

    // Act
    await mount({ relations: { friends: new Set([PLAYER_ID]) } });

    // Assert
    expect(screen.getByTestId('profile-action-invite')).toBeOnTheScreen();
    expectActions(['invite', 'remove', 'block']);
  });

  it('should leave Invite out for a non-friend inside a live room', async () => {
    // Arrange
    publishRoomSession({ code: ROOM_CODE, matchId: 'match-1' });

    // Act
    await mount();

    // Assert
    expect(screen.queryByTestId('profile-action-invite')).not.toBeOnTheScreen();
    expectActions(['add']);
  });

  it('should leave Invite out for a blocked player inside a live room', async () => {
    // Arrange
    publishRoomSession({ code: ROOM_CODE, matchId: 'match-1' });

    // Act
    await mount({ relations: { blocked: new Set([PLAYER_ID]) } });

    // Assert
    expect(screen.queryByTestId('profile-action-invite')).not.toBeOnTheScreen();
    expectActions(['unblock']);
  });

  it('should leave Invite out in the self state', async () => {
    // Arrange
    publishRoomSession({ code: ROOM_CODE, matchId: 'match-1' });

    // Act
    await mount({ userId: PLAYER_ID, selfUserId: PLAYER_ID });

    // Assert
    expect(screen.queryByTestId('profile-action-invite')).not.toBeOnTheScreen();
  });

  it('should leave Invite out in the not-found state', async () => {
    // Arrange
    publishRoomSession({ code: ROOM_CODE, matchId: 'match-1' });

    // Act
    await mount({ result: { ok: false, reason: 'directory_not_found' } });

    // Assert
    expect(screen.queryByTestId('profile-action-invite')).not.toBeOnTheScreen();
  });

  it('should leave Invite out in the loading state', async () => {
    // Arrange
    publishRoomSession({ code: ROOM_CODE, matchId: 'match-1' });
    const pending = deferred<PlayerProfileResult>();

    // Act
    await mount({ pending });

    // Assert
    expect(screen.queryByTestId('profile-action-invite')).not.toBeOnTheScreen();
  });

  it('should leave Invite out in the error state', async () => {
    // Arrange
    publishRoomSession({ code: ROOM_CODE, matchId: 'match-1' });

    // Act
    await mount({ result: { ok: false, reason: 'network' } });

    // Assert
    expect(screen.queryByTestId('profile-action-invite')).not.toBeOnTheScreen();
  });

  it('should invite the friend with the live room code and mark the button Invited', async () => {
    // Arrange
    publishRoomSession({ code: ROOM_CODE, matchId: 'match-1' });
    const { friends } = await mount({ relations: { friends: new Set([PLAYER_ID]) } });

    // Act
    await press('profile-action-invite');

    // Assert
    expect(friends.invite).toHaveBeenCalledWith(PLAYER_ID, ROOM_CODE);
    expect(screen.getByTestId('profile-action-invite')).toHaveTextContent(en.invite.invited);
  });
});

describe('PlayerProfile confirmations', () => {
  afterEach(async () => {
    clearRoomSession();
    await switchLanguage('en');
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    jest.clearAllMocks();
  });

  it('should open the Remove sheet with the player name interpolated', async () => {
    // Arrange
    await mount({ relations: { friends: new Set([PLAYER_ID]) } });

    // Act
    await press('profile-action-remove');

    // Assert
    expect(screen.getByTestId('profile-confirm-remove-body')).toHaveTextContent(
      en.profile.confirm.removeBody.replace('{{name}}', 'Nadia'),
    );
  });

  it('should remove the friend when the Remove sheet is confirmed', async () => {
    // Arrange
    const { friends } = await mount({ relations: { friends: new Set([PLAYER_ID]) } });
    await press('profile-action-remove');

    // Act
    await press('profile-confirm-remove-ok');

    // Assert
    expect(friends.remove).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('should not remove the friend when the Remove sheet is cancelled', async () => {
    // Arrange
    const { friends } = await mount({ relations: { friends: new Set([PLAYER_ID]) } });
    await press('profile-action-remove');

    // Act
    await press('profile-confirm-remove-cancel');

    // Assert
    expect(friends.remove).not.toHaveBeenCalled();
    expect(screen.queryByTestId('profile-confirm-remove')).not.toBeOnTheScreen();
  });

  it('should open the Block sheet with the player name in its title', async () => {
    // Arrange
    await mount({ relations: { friends: new Set([PLAYER_ID]) } });

    // Act
    await press('profile-action-block');

    // Assert
    expect(screen.getByText(en.profile.confirm.blockTitle.replace('{{name}}', 'Nadia'))).toBeOnTheScreen();
  });

  it('should block the player when the Block sheet is confirmed', async () => {
    // Arrange
    const { friends } = await mount({ relations: { friends: new Set([PLAYER_ID]) } });
    await press('profile-action-block');

    // Act
    await press('profile-confirm-block-ok');

    // Assert
    expect(friends.block).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('should not block the player when the Block sheet is cancelled', async () => {
    // Arrange
    const { friends } = await mount({ relations: { friends: new Set([PLAYER_ID]) } });
    await press('profile-action-block');

    // Act
    await press('profile-confirm-block-cancel');

    // Assert
    expect(friends.block).not.toHaveBeenCalled();
  });

  it('should unblock without a confirmation sheet', async () => {
    // Arrange
    const { friends } = await mount({ relations: { blocked: new Set([PLAYER_ID]) } });

    // Act
    await press('profile-action-unblock');

    // Assert
    expect(friends.remove).toHaveBeenCalledWith(PLAYER_ID);
    expect(screen.queryByTestId('profile-confirm-block')).not.toBeOnTheScreen();
    expect(screen.queryByTestId('profile-confirm-remove')).not.toBeOnTheScreen();
  });
});

describe('PlayerProfile action errors', () => {
  afterEach(async () => {
    clearRoomSession();
    await switchLanguage('en');
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    jest.clearAllMocks();
  });

  it('should show the localised error when a friend action fails', async () => {
    // Arrange
    const friends = makeFriends();
    friends.add.mockResolvedValueOnce({ ok: false, reason: 'network' });
    await mount({ friends });

    // Act
    await press('profile-action-add');

    // Assert
    expect(screen.getByTestId('profile-action-error')).toHaveTextContent(en.friends.errors.network);
  });
});

describe('PlayerProfile Derja (RTL)', () => {
  afterEach(async () => {
    clearRoomSession();
    await switchLanguage('en');
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    jest.clearAllMocks();
  });

  it('should render in Derja with the direction applied', async () => {
    // Arrange & Act
    await mount({ language: 'aeb' });

    // Assert
    expect(screen.getAllByText(aeb.profile.title, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('language-root')).toHaveStyle({ direction: 'rtl' });
  });

  it('should isolate the stat values inside the RTL row', async () => {
    // Arrange
    const competitive: CompetitiveStats = { ...ZERO_COMPETITIVE, games: 12 };

    // Act
    await mount({ language: 'aeb', result: found({ stats: { competitive, practice: { ...ZERO_PRACTICE } } }) });

    // Assert: the digits carry their own LTR isolate, matched by testID, never as bare text.
    expect(within(screen.getByTestId('profile-stat-competitive-games')).getByText(isolate('12'))).toBeOnTheScreen();
  });
});
