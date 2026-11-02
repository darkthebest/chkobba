/**
 * Route-level `/players` flows with fake backends: search states (skeleton,
 * rows, empty, error), the single root name gate for Add, the URL tabs, both
 * layout widths and the Derja rendering. Route tests live here, not under
 * `src/app`, because every file there becomes an expo-router route.
 */
import type { DirectoryPlayer } from '@chkobba/protocol';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { useWindowDimensions } from 'react-native';

import PlayersScreen from '@/app/players';
import { DEFAULT_LANGUAGE, i18n, isLanguageCode, LanguageProvider } from '@/i18n';
import { isolate, RLM } from '@/i18n/i18n';
import { aeb } from '@/i18n/locales/aeb';
import { en } from '@/i18n/locales/en';
import type { DirectoryBackend, DirectoryPage } from '@/online/directory';
import type {
  CodeLookupResult,
  FriendActionResult,
  FriendsBackend,
  FriendsSnapshot,
  RecentPlayerEntry,
} from '@/online/friends';
import type { Profile, ProfileBackend, SetNameResult } from '@/online/profile';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';
import type { SocialSocket } from '@/online/socialSocket';

const SEARCH_DEBOUNCE_MS = 300;

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockRouter.push(...args),
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    back: (...args: unknown[]) => mockRouter.back(...args),
    canGoBack: () => mockRouter.canGoBack(),
    setParams: (...args: unknown[]) => mockRouter.setParams(...args),
  },
  useLocalSearchParams: () => mockParams.current,
}));

const mockServices: {
  directory: DirectoryBackend | null;
  profile: ProfileBackend | null;
  follows: Pick<SocialSocket, 'setTemporaryFollows'> | null;
} = { directory: null, profile: null, follows: null };

// The real module builds a nakama-js client; every test injects a fake here.
jest.mock('@/online/services', () => ({
  getDirectoryBackend: () => mockServices.directory,
  getProfileBackend: () => mockServices.profile,
  getSocialSocket: () => mockServices.follows,
}));

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 2, fontScale: 1 })),
}));
const mockedDimensions = jest.mocked(useWindowDimensions);

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

function player(userId: string, name: string, presence: DirectoryPlayer['presence'] = 'visible'): DirectoryPlayer {
  return { userId, name, presence };
}

const NADIA = player('u-nadia', 'Nadia');
const OMAR = player('u-omar', 'Omar');

function page(players: DirectoryPlayer[], nextCursor: string | null = null, capped = false): DirectoryPage {
  return { ok: true, players, nextCursor, capped };
}

function makeDirectory() {
  return {
    search: jest.fn((_query: string, _cursor?: string | null): Promise<DirectoryPage> => Promise.resolve(page([]))),
    profile: jest.fn(),
    setPresenceVisibility: jest.fn(),
  } satisfies DirectoryBackend;
}

const SNAPSHOT: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };
const RECENT: readonly RecentPlayerEntry[] = [{ userId: 'u-karim', displayName: 'Karim', lastPlayedAt: 1000, state: null }];

function makeFriendsBackend() {
  return {
    list: jest.fn((): Promise<FriendsSnapshot> => Promise.resolve(SNAPSHOT)),
    recentPlayers: jest.fn((): Promise<readonly RecentPlayerEntry[]> => Promise.resolve(RECENT)),
    lookupCode: jest.fn((_code: string): Promise<CodeLookupResult> =>
      Promise.resolve({ ok: true, userId: 'u-karim', displayName: 'Karim', self: false }),
    ),
    add: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    remove: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    block: jest.fn((_id: string): Promise<FriendActionResult> => Promise.resolve({ ok: true })),
    invite: jest.fn(() => Promise.resolve({ ok: true as const, sent: true })),
  } satisfies FriendsBackend;
}

function makeProfile(namePicked = true): ProfileBackend {
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
      (name: string): Promise<SetNameResult> =>
        Promise.resolve({ ok: true, profile: { ...profile, displayName: name, namePicked: true } }),
    ),
  };
}

function makeSocial(friends: FriendsBackend): SocialContextValue {
  return {
    state: EMPTY_SOCIAL_STATE,
    friends,
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

function makeFollows(): Pick<SocialSocket, 'setTemporaryFollows'> {
  return { setTemporaryFollows: jest.fn((_ids: readonly string[]) => Promise.resolve()) };
}

/** Lets backend promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function typeQuery(text: string): Promise<void> {
  await fireEvent.changeText(screen.getByTestId('directory-search'), text);
}

/** Types a searchable query and lets its debounced request settle. */
async function search(text: string): Promise<void> {
  await typeQuery(text);
  await advance(SEARCH_DEBOUNCE_MS);
  await settle();
}

function setWidth(width: number): void {
  mockedDimensions.mockReturnValue({ width, height: 800, scale: 2, fontScale: 1 });
}

async function switchLanguage(language: 'en' | 'aeb'): Promise<void> {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

async function renderScreen(options: { directory?: ReturnType<typeof makeDirectory>; namePicked?: boolean } = {}) {
  const directory = options.directory ?? makeDirectory();
  const friends = makeFriendsBackend();
  mockServices.directory = directory;
  mockServices.profile = makeProfile(options.namePicked ?? true);
  mockServices.follows = makeFollows();
  const social = makeSocial(friends);
  // The screen reads its direction from the app's LanguageProvider, so the test
  // wraps it in one seeded with the language `switchLanguage` selected.
  const language = isLanguageCode(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
  const build = (): ReactElement => (
    <LanguageProvider initial={language}>
      <SocialContext.Provider value={social}>
        <PlayersScreen />
      </SocialContext.Provider>
    </LanguageProvider>
  );
  await render(build());
  await settle();
  return { build, directory, friends, social };
}

describe('/players', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockParams.current = {};
    setWidth(390);
    mockServices.directory = null;
    mockServices.profile = null;
    mockServices.follows = null;
  });

  afterEach(async () => {
    await switchLanguage('en');
    mockParams.current = {};
    mockServices.directory = null;
    mockServices.profile = null;
    mockServices.follows = null;
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('search states', () => {
    it('should show recent players when no query is typed', async () => {
      // Arrange & Act
      await renderScreen();

      // Assert
      expect(screen.getByTestId('directory-recent')).toBeOnTheScreen();
      expect(screen.getByTestId('recent-row-u-karim')).toBeOnTheScreen();
    });

    it('should show the skeleton while the first page is debouncing', async () => {
      // Arrange
      await renderScreen();

      // Act
      await typeQuery('na');

      // Assert
      expect(screen.getByTestId('directory-skeleton', { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it('should keep the skeleton while the first page is fetched', async () => {
      // Arrange
      const { directory } = await renderScreen();
      const answer = deferred<DirectoryPage>();
      directory.search.mockReturnValueOnce(answer.promise);

      // Act
      await typeQuery('na');
      await advance(SEARCH_DEBOUNCE_MS);

      // Assert
      expect(screen.getByTestId('directory-skeleton', { includeHiddenElements: true })).toBeOnTheScreen();
    });

    it('should render one PlayerRow per search result', async () => {
      // Arrange
      const { directory } = await renderScreen();
      directory.search.mockResolvedValueOnce(page([NADIA, OMAR]));

      // Act
      await search('na');

      // Assert
      expect(screen.getByTestId('directory-row-u-nadia')).toBeOnTheScreen();
      expect(screen.getByTestId('directory-row-u-omar')).toBeOnTheScreen();
    });

    it('should show the no-results state when nobody matches', async () => {
      // Arrange
      const { directory } = await renderScreen();
      directory.search.mockResolvedValueOnce(page([]));

      // Act
      await search('zz');

      // Assert
      expect(screen.getByTestId('directory-empty')).toHaveTextContent(en.directory.noResults, { exact: false });
    });

    it('should clear the query and return to recent players from the no-results state', async () => {
      // Arrange
      const { directory } = await renderScreen();
      directory.search.mockResolvedValueOnce(page([]));
      await search('zz');

      // Act
      await fireEvent.press(screen.getByTestId('directory-show-recent'));
      await settle();

      // Assert
      expect(screen.getByTestId('directory-recent')).toBeOnTheScreen();
      expect(screen.getByTestId('directory-search')).toHaveDisplayValue('');
    });

    it('should show a localised message when the search is refused', async () => {
      // Arrange
      const { directory } = await renderScreen();
      directory.search.mockResolvedValueOnce({ ok: false, reason: 'directory_rate_limited' });

      // Act
      await search('na');

      // Assert
      expect(screen.getByTestId('directory-error-text')).toHaveTextContent(
        en.directory.errors.directory_rate_limited,
      );
    });

    it('should retry the search from the error state', async () => {
      // Arrange
      const { directory } = await renderScreen();
      directory.search
        .mockResolvedValueOnce({ ok: false, reason: 'network' })
        .mockResolvedValueOnce(page([NADIA]));
      await search('na');

      // Act
      await fireEvent.press(screen.getByTestId('directory-retry'));
      await settle();

      // Assert
      expect(directory.search).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId('directory-row-u-nadia')).toBeOnTheScreen();
    });
  });

  describe('Add through the root action sheet', () => {
    it('should mount one name gate at the screen root for an Add on a first visit', async () => {
      // Arrange
      const { directory } = await renderScreen({ namePicked: false });
      directory.search.mockResolvedValueOnce(page([NADIA, OMAR]));
      await search('na');

      // Act
      await fireEvent.press(screen.getByTestId('directory-add-u-nadia'));
      await settle();

      // Assert
      expect(screen.getAllByTestId('friends-name-gate')).toHaveLength(1);
    });

    it('should send the request after Continue on the root name gate', async () => {
      // Arrange
      const { directory, friends } = await renderScreen({ namePicked: false });
      directory.search.mockResolvedValueOnce(page([NADIA]));
      await search('na');
      await fireEvent.press(screen.getByTestId('directory-add-u-nadia'));
      await settle();

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(friends.add).toHaveBeenCalledWith('u-nadia');
    });
  });

  describe('tabs', () => {
    it('should render the Ranking placeholder and no search field from the URL', async () => {
      // Arrange
      mockParams.current = { tab: 'ranking' };

      // Act
      await renderScreen();

      // Assert
      expect(screen.getByTestId('directory-ranking')).toBeOnTheScreen();
      expect(screen.getByTestId('directory-ranking-placeholder')).toHaveTextContent(
        en.directory.rankingPlaceholder,
      );
      expect(screen.queryByTestId('directory-search')).not.toBeOnTheScreen();
    });

    it('should fall back to Players for an unknown tab value', async () => {
      // Arrange
      mockParams.current = { tab: 'nonsense' };

      // Act
      await renderScreen();

      // Assert
      expect(screen.getByTestId('directory-search')).toBeOnTheScreen();
      expect(screen.queryByTestId('directory-ranking')).not.toBeOnTheScreen();
    });

    it('should write the chosen tab back into the URL', async () => {
      // Arrange
      await renderScreen();

      // Act
      await fireEvent.press(screen.getByTestId('directory-tabs-ranking'));

      // Assert
      expect(mockRouter.setParams).toHaveBeenCalledWith({ tab: 'ranking' });
    });

    it('should keep the query and the rows after switching to Ranking and back', async () => {
      // Arrange
      const { build, directory } = await renderScreen();
      directory.search.mockResolvedValueOnce(page([NADIA]));
      await search('na');
      expect(screen.getByTestId('directory-row-u-nadia')).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId('directory-tabs-ranking'));
      mockParams.current = { tab: 'ranking' };
      await screen.rerender(build());
      await settle();
      expect(screen.getByTestId('directory-ranking')).toBeOnTheScreen();

      // Act
      await fireEvent.press(screen.getByTestId('directory-tabs-players'));
      mockParams.current = { tab: 'players' };
      await screen.rerender(build());
      await settle();

      // Assert
      expect(screen.getByTestId('directory-search')).toHaveDisplayValue('na');
      expect(screen.getByTestId('directory-row-u-nadia')).toBeOnTheScreen();
      expect(directory.search).toHaveBeenCalledTimes(1);
    });
  });

  describe('layout widths', () => {
    it('should stack the tabs and the body in one column below 900 px', async () => {
      // Arrange
      setWidth(899);

      // Act
      await renderScreen();

      // Assert
      const column = screen.getByTestId('directory-state').parent!;
      expect(within(column).getByTestId('directory-tabs')).toBeOnTheScreen();
    });

    it('should render the phone stack and the row Add control at 390 px', async () => {
      // Arrange
      setWidth(390);
      const { directory } = await renderScreen();
      directory.search.mockResolvedValueOnce(page([NADIA]));

      // Act
      await search('na');

      // Assert: tabs, search and body share one column, and the row keeps its
      // Add control inside it (structure and presence, not pixel geometry).
      const column = screen.getByTestId('directory-state').parent!;
      expect(within(column).getByTestId('directory-tabs')).toBeOnTheScreen();
      expect(within(column).getByTestId('directory-search')).toBeOnTheScreen();
      const row = screen.getByTestId('directory-row-u-nadia');
      expect(row).toBeOnTheScreen();
      expect(within(row).getByTestId('directory-add-u-nadia')).toBeOnTheScreen();
    });

    it('should use two columns at exactly 900 px', async () => {
      // Arrange
      setWidth(900);

      // Act
      await renderScreen();

      // Assert
      const bodyColumn = screen.getByTestId('directory-state').parent!;
      expect(within(bodyColumn).queryByTestId('directory-tabs')).not.toBeOnTheScreen();
    });

    it('should put the tabs and the body in separate columns on a desktop width', async () => {
      // Arrange
      setWidth(1280);

      // Act
      await renderScreen();

      // Assert
      const bodyColumn = screen.getByTestId('directory-state').parent!;
      expect(within(bodyColumn).queryByTestId('directory-search')).not.toBeOnTheScreen();
    });
  });

  describe('Derja (RTL)', () => {
    it('should render the directory screen in Derja', async () => {
      // Arrange
      await switchLanguage('aeb');

      // Act
      await renderScreen();

      // Assert
      expect(screen.getAllByText(aeb.directory.title, { exact: false }).length).toBeGreaterThan(0);
      expect(screen.getByTestId('directory-search')).toHaveProp(
        'accessibilityLabel',
        expect.stringContaining(aeb.directory.searchPlaceholder),
      );
    });

    it('should align the search field to the right in Derja', async () => {
      // Arrange
      await switchLanguage('aeb');

      // Act
      await renderScreen();

      // Assert: the Latin query keeps its own direction; only the alignment mirrors.
      expect(screen.getByTestId('directory-search')).toHaveStyle({ textAlign: 'right' });
    });

    it('should render the recent-players panel in Derja', async () => {
      // Arrange
      await switchLanguage('aeb');

      // Act
      await renderScreen();

      // Assert
      expect(screen.getByTestId('directory-recent')).toHaveTextContent(aeb.directory.recentPlayers, {
        exact: false,
      });
    });

    it('should isolate the interpolated results count in Derja', async () => {
      // Arrange
      await switchLanguage('aeb');
      const { directory } = await renderScreen();
      directory.search.mockResolvedValueOnce(page([NADIA, OMAR]));
      // The count is a number, so it gets its own LTR isolate inside the RTL line.
      const expected = `${RLM}${isolate('2')}${aeb.directory.resultsCount_other.replace('{{count}}', '')}`;

      // Act
      await search('na');

      // Assert
      expect(screen.getByTestId('directory-results-count')).toHaveTextContent(expected, { exact: true });
    });
  });
});
