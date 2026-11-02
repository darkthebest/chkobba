/**
 * FindingPlayers drives a real NakamaGameClient against a fake OnlineBackend
 * (same shape as the fake in src/online/__tests__/NakamaGameClient.test.ts).
 * Jest fake timers also fake Date.now, which both the client clock and the
 * 250 ms countdown ticker read.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import FindingScreen from '@/app/finding';
import { FindingPlayers } from '@/components/lobby/FindingPlayers';
import { peekClient, releaseClient } from '@/online/activeClient';
import type { JoinResult, MatchSocket, MatchSocketHandlers, OnlineBackend } from '@/online/NakamaGameClient';
import type { Profile, ProfileBackend, SetNameResult } from '@/online/profile';
import { OpCode } from '@/online/protocol';
import playing from '@/online/__tests__/fixtures/snapshot.json';
import waiting from '@/online/__tests__/fixtures/waiting.json';

const MATCH_ID = 'match-1';

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    back: (...args: unknown[]) => mockRouter.back(...args),
    canGoBack: () => mockRouter.canGoBack(),
  },
}));

// The real module builds a nakama-js client; the route test swaps in the fake backend.
const mockBackendRef: { current: OnlineBackend | null } = { current: null };
jest.mock('@/online/services', () => ({
  getOnlineBackend: () => mockBackendRef.current,
  getProfileBackend: () => mockPickedProfile(),
}));

/** A profile backend whose name was already picked, so the flow goes straight to quick match. */
function mockPickedProfile(): ProfileBackend {
  const profile: Profile = {
    displayName: 'Hamza',
    namePicked: true,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
  };
  return {
    getProfile: jest.fn(async () => profile),
    setDisplayName: jest.fn(async (): Promise<SetNameResult> => ({ ok: true, profile })),
  };
}

type Json = { [key: string]: unknown };

class FakeSocket implements MatchSocket {
  readonly joinMatch = jest.fn(async (_matchId: string): Promise<JoinResult> => this.joinResult);
  readonly leaveMatch = jest.fn(async (_matchId: string): Promise<void> => undefined);
  readonly send = jest.fn(async (_matchId: string, _opCode: number, _data: string): Promise<void> => undefined);
  readonly close = jest.fn((): void => undefined);

  constructor(
    private readonly handlers: MatchSocketHandlers,
    private readonly joinResult: JoinResult,
  ) {}

  emitSnapshot(snapshot: Json): void {
    this.handlers.onMatchData(OpCode.SNAPSHOT, JSON.stringify(snapshot));
  }
}

function createFakeBackend(options: { joinResult?: JoinResult } = {}) {
  const sockets: FakeSocket[] = [];
  const backend = {
    signIn: jest.fn(async (): Promise<void> => undefined),
    quickMatch: jest.fn(async (): Promise<string> => MATCH_ID),
    openSocket: jest.fn(async (handlers: MatchSocketHandlers): Promise<MatchSocket> => {
      const socket = new FakeSocket(handlers, options.joinResult ?? { ok: true });
      sockets.push(socket);
      return socket;
    }),
  } satisfies OnlineBackend;
  const lastSocket = (): FakeSocket => {
    const socket = sockets[sockets.length - 1];
    if (!socket) throw new Error('no socket opened');
    return socket;
  };
  return { backend, sockets, lastSocket };
}

/** A fixture snapshot whose server clock matches the (fake) local clock, so local and server deadlines line up. */
function snapshotAt(source: unknown, overrides: Json = {}): Json {
  const json = JSON.parse(JSON.stringify(source)) as Json;
  const serverTime = json.serverTime as number;
  const shift = (value: unknown) => (typeof value === 'number' ? value - serverTime + Date.now() : value);
  return {
    ...json,
    backfillAt: shift(json.backfillAt),
    turnDeadline: shift(json.turnDeadline),
    nextRoundAt: shift(json.nextRoundAt),
    serverTime: Date.now(),
    ...overrides,
  };
}

/** Lets the quickMatch → signIn → openSocket → joinMatch promise chain settle inside act. */
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

async function emit(socket: FakeSocket, snapshot: Json): Promise<void> {
  await act(async () => {
    socket.emitSnapshot(snapshot);
  });
}

/** A profile backend for a first visit: the player has not picked a name yet. */
function firstVisitProfile(displayName = 'Guest4821') {
  const before: Profile = {
    displayName,
    namePicked: false,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
  };
  const getProfile = jest.fn(async (): Promise<Profile> => before);
  const setDisplayName = jest.fn(
    async (name: string): Promise<SetNameResult> => ({
      ok: true,
      profile: {
        displayName: name,
        namePicked: true,
        renameAvailableAt: null,
        friendCode: null,
        listed: false,
        presenceVisibility: 'everyone',
      },
    }),
  );
  return { getProfile, setDisplayName } satisfies ProfileBackend;
}

async function renderFinding(fake = createFakeBackend(), profile: ProfileBackend = mockPickedProfile()) {
  const onStarted = jest.fn();
  const onExit = jest.fn();
  const view = await render(
    <FindingPlayers backend={fake.backend} profile={profile} onStarted={onStarted} onExit={onExit} />,
  );
  await settle();
  return { ...fake, onStarted, onExit, unmount: view.unmount };
}

describe('FindingPlayers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    const held = peekClient(MATCH_ID);
    if (held) {
      releaseClient(held);
      held.stop();
    }
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('while searching', () => {
    it('should show the finding-players screen while quick match is pending', async () => {
      // Arrange
      const fake = createFakeBackend();
      fake.backend.quickMatch.mockReturnValue(new Promise<string>(() => undefined));

      // Act
      await renderFinding(fake);

      // Assert
      expect(screen.getByTestId('finding-status')).toHaveTextContent('Looking for a table…');
    });

    it('should not show a seat count before the first snapshot', async () => {
      // Arrange
      const fake = createFakeBackend();

      // Act
      await renderFinding(fake);

      // Assert
      expect(screen.queryByTestId('finding-seats')).not.toBeOnTheScreen();
    });

    it('should report the connection once the table is joined', async () => {
      // Arrange
      const fake = createFakeBackend();

      // Act
      await renderFinding(fake);

      // Assert
      expect(screen.getByTestId('finding-status')).toHaveTextContent('Connected');
    });

    it('should join the table quick match returned', async () => {
      // Arrange
      const fake = createFakeBackend();

      // Act
      await renderFinding(fake);

      // Assert
      expect(fake.lastSocket().joinMatch).toHaveBeenCalledWith(MATCH_ID);
    });
  });

  describe('waiting room', () => {
    it('should announce how many seats are filled after the first snapshot', async () => {
      // Arrange
      const harness = await renderFinding();

      // Act
      await emit(harness.lastSocket(), snapshotAt(waiting));

      // Assert
      expect(screen.getByTestId('finding-seats')).toHaveAccessibleName('1 of 4 seats filled');
    });

    it('should count down to the bot backfill once the ticker has measured the clock', async () => {
      // Arrange
      const harness = await renderFinding();
      await emit(harness.lastSocket(), snapshotAt(waiting));

      // Act
      await advance(0);

      // Assert
      expect(screen.getByRole('timer')).toHaveTextContent('Bots join in 14 s');
    });

    it('should keep counting down as time passes', async () => {
      // Arrange
      const harness = await renderFinding();
      await emit(harness.lastSocket(), snapshotAt(waiting));
      await advance(0);

      // Act
      await advance(4000);

      // Assert
      expect(screen.getByTestId('finding-backfill')).toHaveTextContent('Bots join in 10 s');
    });

    it('should say bots are joining when the backfill countdown reaches zero', async () => {
      // Arrange
      const harness = await renderFinding();
      await emit(harness.lastSocket(), snapshotAt(waiting));

      // Act
      await advance(15_000);

      // Assert
      expect(screen.getByTestId('finding-backfill')).toHaveTextContent('Bots are joining…');
    });

    it('should hide the backfill countdown when the server runs no backfill timer', async () => {
      // Arrange
      const harness = await renderFinding();
      await emit(harness.lastSocket(), snapshotAt(waiting, { backfillAt: null }));

      // Act
      await advance(1000);

      // Assert
      expect(screen.queryByTestId('finding-backfill')).not.toBeOnTheScreen();
    });
  });

  describe('cancel and unmount', () => {
    it('should call onExit when Cancel is pressed', async () => {
      // Arrange
      const harness = await renderFinding();

      // Act
      await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));

      // Assert
      expect(harness.onExit).toHaveBeenCalledTimes(1);
    });

    it('should stop the client and leave the table when Cancel is pressed', async () => {
      // Arrange
      const harness = await renderFinding();

      // Act
      await fireEvent.press(screen.getByTestId('finding-cancel'));
      await settle();

      // Assert
      expect(harness.lastSocket().leaveMatch).toHaveBeenCalledWith(MATCH_ID);
    });

    it('should stop the client and leave the table when unmounted before the game starts', async () => {
      // Arrange
      const harness = await renderFinding();

      // Act
      await harness.unmount();
      await settle();

      // Assert
      expect(harness.lastSocket().leaveMatch).toHaveBeenCalledWith(MATCH_ID);
    });

    it('should call onExit when Cancel is pressed before a table was found', async () => {
      // Arrange
      const fake = createFakeBackend();
      fake.backend.quickMatch.mockReturnValue(new Promise<string>(() => undefined));
      const harness = await renderFinding(fake);

      // Act
      await fireEvent.press(screen.getByTestId('finding-cancel'));

      // Assert
      expect(harness.onExit).toHaveBeenCalledTimes(1);
    });
  });

  describe('hand-off to the game screen', () => {
    it('should call onStarted with the match id when the first game view arrives', async () => {
      // Arrange
      const harness = await renderFinding();

      // Act
      await emit(harness.lastSocket(), snapshotAt(playing));

      // Assert
      expect(harness.onStarted).toHaveBeenCalledWith(MATCH_ID);
    });

    it('should hold the client for the game screen when the game starts', async () => {
      // Arrange
      const harness = await renderFinding();

      // Act
      await emit(harness.lastSocket(), snapshotAt(playing));

      // Assert
      expect(peekClient(MATCH_ID)).not.toBeNull();
    });

    it('should not stop the held client when the screen unmounts after the hand-off', async () => {
      // Arrange
      const harness = await renderFinding();
      await emit(harness.lastSocket(), snapshotAt(playing));

      // Act
      await harness.unmount();
      await settle();

      // Assert
      expect(harness.lastSocket().leaveMatch).not.toHaveBeenCalled();
    });

    it('should call onStarted only once when more snapshots follow', async () => {
      // Arrange
      const harness = await renderFinding();
      await emit(harness.lastSocket(), snapshotAt(playing));

      // Act
      await emit(harness.lastSocket(), snapshotAt(playing));

      // Assert
      expect(harness.onStarted).toHaveBeenCalledTimes(1);
    });
  });

  describe('name gate', () => {
    it('should ask for a name on the first visit', async () => {
      // Arrange
      const profile = firstVisitProfile();

      // Act
      await renderFinding(createFakeBackend(), profile);

      // Assert
      expect(screen.getByRole('header')).toHaveTextContent('Choose your name');
    });

    it('should prefill the name field with the current display name', async () => {
      // Arrange
      const profile = firstVisitProfile('Guest4821');

      // Act
      await renderFinding(createFakeBackend(), profile);

      // Assert
      expect(screen.getByTestId('finding-name-input')).toHaveDisplayValue('Guest4821');
    });

    it('should not start a search while the name gate shows', async () => {
      // Arrange
      const fake = createFakeBackend();

      // Act
      await renderFinding(fake, firstVisitProfile());

      // Assert
      expect(fake.backend.quickMatch).not.toHaveBeenCalled();
    });

    it('should not start a search while the profile is loading', async () => {
      // Arrange
      const fake = createFakeBackend();
      const profile = firstVisitProfile();
      profile.getProfile.mockReturnValue(new Promise<Profile>(() => undefined));

      // Act
      await renderFinding(fake, profile);

      // Assert
      expect(fake.backend.quickMatch).not.toHaveBeenCalled();
    });

    it('should skip the gate and search when a name was already picked', async () => {
      // Arrange
      const fake = createFakeBackend();

      // Act
      await renderFinding(fake, mockPickedProfile());

      // Assert
      expect(fake.backend.quickMatch).toHaveBeenCalledTimes(1);
    });

    it('should not show the name form when a name was already picked', async () => {
      // Arrange
      const profile = mockPickedProfile();

      // Act
      await renderFinding(createFakeBackend(), profile);

      // Assert
      expect(screen.queryByTestId('finding-name')).not.toBeOnTheScreen();
    });

    it('should save the name even when unchanged when Continue is pressed', async () => {
      // Arrange
      const profile = firstVisitProfile('Guest4821');
      await renderFinding(createFakeBackend(), profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(profile.setDisplayName).toHaveBeenCalledWith('Guest4821');
    });

    it('should save the name before starting quick match', async () => {
      // Arrange
      const fake = createFakeBackend();
      const profile = firstVisitProfile();
      await renderFinding(fake, profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      const [saveOrder] = profile.setDisplayName.mock.invocationCallOrder;
      const [searchOrder] = fake.backend.quickMatch.mock.invocationCallOrder;
      expect(saveOrder).toBeLessThan(searchOrder ?? -1);
    });

    it('should join a table after the name is saved', async () => {
      // Arrange
      const profile = firstVisitProfile();
      await renderFinding(createFakeBackend(), profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(screen.getByTestId('finding-status')).toHaveTextContent('Connected');
    });

    it('should save the edited name when the player changes it', async () => {
      // Arrange
      const profile = firstVisitProfile();
      await renderFinding(createFakeBackend(), profile);
      await fireEvent.changeText(screen.getByTestId('finding-name-input'), '  Hédi  B ');

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(profile.setDisplayName).toHaveBeenCalledWith('Hédi B');
    });

    it('should show the localized error when the server rejects the name', async () => {
      // Arrange
      const profile = firstVisitProfile();
      profile.setDisplayName.mockResolvedValueOnce({ ok: false, reason: 'name_not_allowed' });
      await renderFinding(createFakeBackend(), profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(screen.getByTestId('finding-name-error')).toHaveTextContent("This name isn't allowed. Try another.");
    });

    it('should not start a search when the server rejects the name', async () => {
      // Arrange
      const fake = createFakeBackend();
      const profile = firstVisitProfile();
      profile.setDisplayName.mockResolvedValueOnce({ ok: false, reason: 'name_not_allowed' });
      await renderFinding(fake, profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(fake.backend.quickMatch).not.toHaveBeenCalled();
    });

    it('should show the network error when saving the name throws', async () => {
      // Arrange
      const profile = firstVisitProfile();
      profile.setDisplayName.mockRejectedValueOnce(new Error('offline'));
      await renderFinding(createFakeBackend(), profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(screen.getByTestId('finding-name-error')).toHaveTextContent(
        "Couldn't save your name. Check your connection and try again.",
      );
    });

    it('should call onExit when Cancel is pressed on the name gate', async () => {
      // Arrange
      const harness = await renderFinding(createFakeBackend(), firstVisitProfile());

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-cancel'));

      // Assert
      expect(harness.onExit).toHaveBeenCalledTimes(1);
    });

    it('should never start a search when Cancel is pressed on the name gate', async () => {
      // Arrange
      const harness = await renderFinding(createFakeBackend(), firstVisitProfile());

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-cancel'));
      await settle();

      // Assert
      expect(harness.backend.quickMatch).not.toHaveBeenCalled();
    });

    it('should show the failed state when the profile cannot be loaded', async () => {
      // Arrange
      const profile = mockPickedProfile();
      jest.mocked(profile.getProfile).mockRejectedValueOnce(new Error('unreachable'));

      // Act
      await renderFinding(createFakeBackend(), profile);

      // Assert
      expect(screen.getByRole('alert')).toHaveProp('testID', 'finding-error');
    });

    it('should not start a search when the profile cannot be loaded', async () => {
      // Arrange
      const fake = createFakeBackend();
      const profile = mockPickedProfile();
      jest.mocked(profile.getProfile).mockRejectedValueOnce(new Error('unreachable'));

      // Act
      await renderFinding(fake, profile);

      // Assert
      expect(fake.backend.quickMatch).not.toHaveBeenCalled();
    });

    it('should load the profile again when Try again is pressed after a profile failure', async () => {
      // Arrange
      const profile = mockPickedProfile();
      jest.mocked(profile.getProfile).mockRejectedValueOnce(new Error('unreachable'));
      await renderFinding(createFakeBackend(), profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-retry'));
      await settle();

      // Assert
      expect(profile.getProfile).toHaveBeenCalledTimes(2);
    });

    it('should start the search once the retried profile load succeeds', async () => {
      // Arrange
      const fake = createFakeBackend();
      const profile = mockPickedProfile();
      jest.mocked(profile.getProfile).mockRejectedValueOnce(new Error('unreachable'));
      await renderFinding(fake, profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-retry'));
      await settle();

      // Assert
      expect(fake.backend.quickMatch).toHaveBeenCalledTimes(1);
    });

    it('should not start a search when unmounted while the name is being saved', async () => {
      // Arrange
      const fake = createFakeBackend();
      const profile = firstVisitProfile();
      let resolveSave: (result: SetNameResult) => void = () => undefined;
      profile.setDisplayName.mockReturnValueOnce(
        new Promise<SetNameResult>((resolve) => {
          resolveSave = resolve;
        }),
      );
      const harness = await renderFinding(fake, profile);
      await fireEvent.press(screen.getByTestId('finding-name-submit'));

      // Act
      await harness.unmount();
      resolveSave({
        ok: true,
        profile: {
          displayName: 'Guest4821',
          namePicked: true,
          renameAvailableAt: null,
          friendCode: null,
          listed: false,
          presenceVisibility: 'everyone',
        },
      });
      await settle();

      // Assert
      expect(fake.backend.quickMatch).not.toHaveBeenCalled();
    });

    it('should lock the name form while the name is being saved', async () => {
      // Arrange
      const profile = firstVisitProfile();
      profile.setDisplayName.mockReturnValueOnce(new Promise<SetNameResult>(() => undefined));
      await renderFinding(createFakeBackend(), profile);

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));

      // Assert
      expect(screen.getByTestId('finding-name-cancel')).toBeDisabled();
    });
  });

  describe('failures', () => {
    it('should show an error alert when quick match is rejected', async () => {
      // Arrange
      const fake = createFakeBackend();
      fake.backend.quickMatch.mockRejectedValueOnce(new Error('unreachable'));

      // Act
      await renderFinding(fake);

      // Assert
      expect(screen.getByRole('alert')).toHaveProp('testID', 'finding-error');
    });

    it('should ask for a table again when Try again is pressed', async () => {
      // Arrange
      const fake = createFakeBackend();
      fake.backend.quickMatch.mockRejectedValueOnce(new Error('unreachable'));
      await renderFinding(fake);

      // Act
      await fireEvent.press(screen.getByTestId('finding-retry'));
      await settle();

      // Assert
      expect(fake.backend.quickMatch).toHaveBeenCalledTimes(2);
    });

    it('should return to the waiting room when the retry succeeds', async () => {
      // Arrange
      const fake = createFakeBackend();
      fake.backend.quickMatch.mockRejectedValueOnce(new Error('unreachable'));
      await renderFinding(fake);

      // Act
      await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
      await settle();

      // Assert
      expect(screen.getByTestId('finding-status')).toHaveTextContent('Connected');
    });

    it('should call onExit when Back is pressed after a failed search', async () => {
      // Arrange
      const fake = createFakeBackend();
      fake.backend.quickMatch.mockRejectedValueOnce(new Error('unreachable'));
      const harness = await renderFinding(fake);

      // Act
      await fireEvent.press(screen.getByTestId('finding-back'));

      // Assert
      expect(harness.onExit).toHaveBeenCalledTimes(1);
    });

    it('should show the fatal error sheet when the table cannot be joined', async () => {
      // Arrange
      const fake = createFakeBackend({ joinResult: { ok: false, reason: 'not_found' } });

      // Act
      await renderFinding(fake);

      // Assert
      expect(screen.getByTestId('online-error-message')).toHaveTextContent('This table has closed.');
    });

    it('should call onExit from the fatal error sheet', async () => {
      // Arrange
      const fake = createFakeBackend({ joinResult: { ok: false, reason: 'not_found' } });
      const harness = await renderFinding(fake);

      // Act
      await fireEvent.press(screen.getByTestId('online-error-back'));

      // Assert
      expect(harness.onExit).toHaveBeenCalledTimes(1);
    });
  });
});

describe('FindingScreen route', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    const held = peekClient(MATCH_ID);
    if (held) {
      releaseClient(held);
      held.stop();
    }
    mockBackendRef.current = null;
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should replace the route with the online game when the game starts', async () => {
    // Arrange
    const fake = createFakeBackend();
    mockBackendRef.current = fake.backend;
    await render(<FindingScreen />);
    await settle();

    // Act
    await emit(fake.lastSocket(), snapshotAt(playing));

    // Assert
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/game', params: { online: '1', matchId: MATCH_ID } });
  });

  it('should go back when Cancel is pressed and there is a previous screen', async () => {
    // Arrange
    const fake = createFakeBackend();
    mockBackendRef.current = fake.backend;
    await render(<FindingScreen />);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-cancel'));

    // Assert
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  it('should go to the lobby when Cancel is pressed and there is no previous screen', async () => {
    // Arrange
    const fake = createFakeBackend();
    mockBackendRef.current = fake.backend;
    mockRouter.canGoBack.mockReturnValueOnce(false);
    await render(<FindingScreen />);
    await settle();

    // Act
    await fireEvent.press(screen.getByTestId('finding-cancel'));

    // Assert
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});
