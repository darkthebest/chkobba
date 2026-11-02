/**
 * Route-level `/p/[userId]` flows with a fake directory backend: the profile the
 * route param names, the empty param, the session-based self check, the retry
 * after a failed read, and the Derja rendering.
 *
 * Route tests live here, not under `src/app`, because every file there becomes
 * an expo-router route (same correction as the `/players` test). The component
 * itself, with every relation, availability and stat branch, is covered in
 * `src/components/profile/__tests__/PlayerProfile.test.tsx`.
 */
import type {
  CompetitiveStats,
  PlayerProfileResponse,
  PracticeStats,
} from '@chkobba/protocol';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import PlayerProfileScreen from '@/app/p/[userId]';
import { LanguageProvider, i18n } from '@/i18n';
import { isolate } from '@/i18n/i18n';
import { aeb } from '@/i18n/locales/aeb';
import { en } from '@/i18n/locales/en';
import type { DirectoryBackend, PlayerProfile } from '@/online/directory';
import type { FriendsBackend, FriendsSnapshot } from '@/online/friends';

const PLAYER_ID = 'u-nadia';
const SELF_ID = 'u-me';

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  replace: jest.fn(),
  push: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockRouter.back(...args),
    canGoBack: () => mockRouter.canGoBack(),
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    push: (...args: unknown[]) => mockRouter.push(...args),
  },
  useLocalSearchParams: () => mockParams.current,
}));

const EMPTY_SNAPSHOT: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };

// The real module builds a nakama-js client; every test injects a fake here.
const mockServices: {
  directory: DirectoryBackend | null;
  friends: FriendsBackend | null;
  profile: unknown;
  sessionUserId: string;
} = { directory: null, friends: null, profile: null, sessionUserId: SELF_ID };

jest.mock('@/online/services', () => ({
  getDirectoryBackend: () => mockServices.directory,
  getFriendsBackend: () => mockServices.friends,
  getProfileBackend: () => mockServices.profile,
  getGuestAuth: () => ({ signIn: async () => ({ session: { user_id: mockServices.sessionUserId } }) }),
}));

const ZERO_COMPETITIVE: CompetitiveStats = {
  games: 0,
  wins: 0,
  chkobbas: 0,
  currentStreak: 0,
  bestStreak: 0,
  updatedAt: 0,
};
const ZERO_PRACTICE: PracticeStats = { games: 0, wins: 0, chkobbas: 0, updatedAt: 0 };

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

function found(overrides: Partial<PlayerProfileResponse> = {}): PlayerProfile {
  return { ok: true, ...profileResponse(overrides) };
}

function makeDirectory(responder: () => Promise<PlayerProfile>) {
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
    add: jest.fn(async () => ({ ok: true as const })),
    remove: jest.fn(async () => ({ ok: true as const })),
    block: jest.fn(async () => ({ ok: true as const })),
    invite: jest.fn(async () => ({ ok: true as const, sent: true })),
  } satisfies FriendsBackend;
}

/** A profile backend that reports a picked name, so the name gate never opens. */
function makeProfileBackend() {
  const profile = {
    displayName: 'Hamza',
    namePicked: true,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone' as const,
  };
  return {
    getProfile: jest.fn(async () => profile),
    setDisplayName: jest.fn(async () => ({ ok: true as const, profile })),
  };
}

/** Lets the directory read, the session read and the action promises settle. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function switchLanguage(language: 'en' | 'aeb'): Promise<void> {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

async function renderRoute(
  options: {
    params?: Record<string, string | string[] | undefined>;
    result?: PlayerProfile;
    directory?: ReturnType<typeof makeDirectory>;
    sessionUserId?: string;
    language?: 'en' | 'aeb';
  } = {},
) {
  const directory =
    options.directory ?? makeDirectory(() => Promise.resolve(options.result ?? found()));
  mockServices.directory = directory.backend;
  mockServices.friends = makeFriends();
  mockServices.profile = makeProfileBackend();
  mockServices.sessionUserId = options.sessionUserId ?? SELF_ID;
  mockParams.current = options.params ?? { userId: PLAYER_ID };

  const language = options.language ?? 'en';
  if (language === 'aeb') await switchLanguage('aeb');

  const element: ReactElement = (
    <LanguageProvider initial={language}>
      <PlayerProfileScreen />
    </LanguageProvider>
  );
  await render(element);
  await settle();
  return { directory };
}

describe('/p/[userId]', () => {
  afterEach(async () => {
    await switchLanguage('en');
    mockParams.current = {};
    mockServices.directory = null;
    mockServices.friends = null;
    mockServices.profile = null;
    mockServices.sessionUserId = SELF_ID;
    jest.clearAllMocks();
  });

  it('should render the profile the route param names', async () => {
    // Arrange & Act
    await renderRoute({ params: { userId: PLAYER_ID }, result: found() });

    // Assert
    expect(screen.getByTestId('profile-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-name')).toHaveTextContent('Nadia');
  });

  it('should render not found without asking the backend when the param is empty', async () => {
    // Arrange & Act
    const { directory } = await renderRoute({ params: {} });

    // Assert
    expect(screen.getByTestId('profile-not-found')).toBeOnTheScreen();
    expect(directory.profile).not.toHaveBeenCalled();
  });

  it('should treat an array param as unusable rather than rendering it', async () => {
    // Arrange & Act
    await renderRoute({ params: { userId: [PLAYER_ID, 'u-omar'] } });

    // Assert
    expect(screen.getByTestId('profile-not-found')).toBeOnTheScreen();
  });

  it('should recognise the caller own profile from the session', async () => {
    // Arrange & Act
    const { directory } = await renderRoute({
      params: { userId: PLAYER_ID },
      sessionUserId: PLAYER_ID,
    });

    // Assert
    expect(screen.getByTestId('profile-self')).toHaveTextContent(en.profile.self);
    expect(directory.profile).not.toHaveBeenCalled();
  });

  it('should recover from a failed read when retry is pressed', async () => {
    // Arrange
    const directory = makeDirectory(() => Promise.resolve(found()));
    directory.profile
      .mockResolvedValueOnce({ ok: false, reason: 'network' })
      .mockResolvedValueOnce(found());
    await renderRoute({ directory });

    // Act
    await fireEvent.press(screen.getByTestId('profile-retry'));
    await settle();

    // Assert
    expect(screen.getByTestId('profile-found')).toBeOnTheScreen();
  });

  it('should render the screen in Derja with the direction applied', async () => {
    // Arrange & Act
    await renderRoute({ language: 'aeb' });

    // Assert
    expect(screen.getAllByText(aeb.profile.title, { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByTestId('language-root')).toHaveStyle({ direction: 'rtl' });
  });

  it('should isolate the stat values in Derja and expose them by testID', async () => {
    // Arrange
    const competitive: CompetitiveStats = { ...ZERO_COMPETITIVE, games: 12 };

    // Act
    await renderRoute({
      language: 'aeb',
      result: found({ stats: { competitive, practice: { ...ZERO_PRACTICE } } }),
    });

    // Assert: the digits carry their own LTR isolate, so the exact-wrapper match
    // is scoped to the row's testID rather than the whole bare-text tree.
    expect(within(screen.getByTestId('profile-stat-competitive-games')).getByText(isolate('12'))).toBeOnTheScreen();
  });
});
