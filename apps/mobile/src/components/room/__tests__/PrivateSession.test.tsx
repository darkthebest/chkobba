/**
 * PrivateSession: the room → table → final summary → room lifecycle. The real
 * `PrivateRoom` is exercised; `GameTable` is replaced by a light stub so this
 * file can watch when the table mounts (once per game) and press its final
 * summary button without rendering a whole hand.
 */
import { FIXTURE_ROOM_CODE, SEATED_VIEW } from '@chkobba/protocol/testing';
import type { Seat } from '@chkobba/rules';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type {
  GameClient,
  GameSnapshot,
  OnlineError,
  OnlineInfo,
  OnlineTablePhase,
  RoomMemberState,
  RoomState,
  SeatInfo,
} from '@/game/GameClient';

import { PrivateSession } from '../PrivateSession';

const mockTable = { mounts: 0 };

jest.mock('../../GameTable', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Pressable, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    GameTable: ({ onNewGame, newGameLabel }: { onNewGame: () => void; newGameLabel?: string }) => {
      React.useEffect(() => {
        mockTable.mounts += 1;
      }, []);
      return React.createElement(
        Pressable,
        { testID: 'table-new-game', onPress: onNewGame },
        React.createElement(Text, { testID: 'table-new-game-label' }, newGameLabel ?? 'Play again'),
      );
    },
  };
});

const mockRouter = { replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() };
jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    back: (...args: unknown[]) => mockRouter.back(...args),
    canGoBack: () => mockRouter.canGoBack(),
    setParams: (...args: unknown[]) => mockRouter.setParams(...args),
  },
}));

const HOST: RoomMemberState = { name: 'Hamza', seat: 0, isHost: true };
const PLAYERS: readonly SeatInfo[] = [
  { seat: 0, name: 'Hamza', isBot: false },
  { seat: 1, name: 'Bot 1', isBot: true },
  { seat: 2, name: 'Sami', isBot: false },
  { seat: 3, name: 'Bot 3', isBot: true },
];

interface Setup {
  phase?: OnlineTablePhase;
  started?: boolean;
  mySeat?: Seat | null;
  myIndex?: number;
  amHost?: boolean;
  gameKey?: number;
  resetAt?: number | null;
  scores?: readonly [number, number] | null;
  members?: readonly RoomMemberState[];
  lastError?: OnlineError | null;
  noRoom?: boolean;
}

function snapshotOf(setup: Setup = {}): GameSnapshot {
  const room: RoomState = {
    code: FIXTURE_ROOM_CODE,
    members: setup.members ?? [HOST],
    myIndex: setup.myIndex ?? 0,
    mySeat: setup.mySeat === undefined ? 0 : setup.mySeat,
    amHost: setup.amHost ?? true,
    scores: setup.scores ?? null,
    resetAt: setup.resetAt ?? null,
  };
  const online: OnlineInfo = {
    phase: setup.phase ?? 'waiting',
    seatsFilled: 1,
    seatCount: 4,
    backfillAt: null,
    started: setup.started ?? false,
    phaseSince: 0,
    lastError: setup.lastError ?? null,
    gameKey: setup.gameKey ?? 0,
    ...(setup.noRoom ? {} : { room }),
  };
  return { view: SEATED_VIEW, players: PLAYERS, log: [], online };
}

/** A GameClient whose snapshot the test sets directly. */
class FakeSessionClient implements GameClient {
  readonly seat: Seat = 0;
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<() => void>();
  readonly start = jest.fn();
  readonly stop = jest.fn();
  readonly play = jest.fn(async (): Promise<void> => undefined);
  readonly cut = jest.fn(async (): Promise<void> => undefined);
  readonly nextRound = jest.fn(async (): Promise<void> => undefined);
  readonly sit = jest.fn(async (_seat: Seat): Promise<void> => undefined);
  readonly startGame = jest.fn(async (): Promise<void> => undefined);

  constructor(snapshot: GameSnapshot) {
    this.snapshot = snapshot;
  }

  getSnapshot = (): GameSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}

async function renderSession(snapshot: GameSnapshot) {
  const client = new FakeSessionClient(snapshot);
  const onLeave = jest.fn();
  const view = await render(<PrivateSession client={client} onLeave={onLeave} />);
  return { client, onLeave, view };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function send(client: FakeSessionClient, snapshot: GameSnapshot): Promise<void> {
  await act(async () => {
    client.set(snapshot);
  });
}

describe('PrivateSession', () => {
  beforeEach(() => {
    mockTable.mounts = 0;
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('room to table', () => {
    it('should show the waiting room before the game starts', async () => {
      // Arrange
      const snapshot = snapshotOf();

      // Act
      await renderSession(snapshot);

      // Assert
      expect(screen.getByTestId('private-room')).toBeOnTheScreen();
    });

    it('should mount the table when the server starts the game', async () => {
      // Arrange
      const harness = await renderSession(snapshotOf());

      // Act
      await send(harness.client, snapshotOf({ phase: 'playing', started: true }));

      // Assert
      expect(screen.getByTestId('table-new-game')).toBeOnTheScreen();
    });

    it('should hide the room once the table is shown', async () => {
      // Arrange
      const harness = await renderSession(snapshotOf());

      // Act
      await send(harness.client, snapshotOf({ phase: 'playing', started: true }));

      // Assert
      expect(screen.queryByTestId('private-room')).not.toBeOnTheScreen();
    });

    it('should keep a standing member in the room during a game', async () => {
      // Arrange
      const snapshot = snapshotOf({ phase: 'playing', started: true, mySeat: null, amHost: false });

      // Act
      await renderSession(snapshot);

      // Assert
      expect(screen.getByTestId('private-room')).toBeOnTheScreen();
    });

    it('should show a spinner until the client knows the room', async () => {
      // Arrange
      const snapshot = snapshotOf({ noRoom: true });

      // Act
      await renderSession(snapshot);

      // Assert
      expect(screen.getByTestId('private-session-loading')).toBeOnTheScreen();
    });
  });

  describe('final summary', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should keep the table on screen while the final summary counts down', async () => {
      // Arrange
      const harness = await renderSession(snapshotOf({ phase: 'playing', started: true }));

      // Act
      await send(harness.client, snapshotOf({ phase: 'finished', started: true, resetAt: Date.now() + 20_000 }));

      // Assert
      expect(screen.getByTestId('table-new-game')).toBeOnTheScreen();
    });

    it('should label the final summary button with the time back to the room', async () => {
      // Arrange
      const harness = await renderSession(snapshotOf({ phase: 'playing', started: true }));

      // Act
      await send(harness.client, snapshotOf({ phase: 'finished', started: true, resetAt: Date.now() + 20_000 }));
      await advance(0);

      // Assert
      expect(screen.getByTestId('table-new-game-label')).toHaveTextContent('Back to the room in 20 s');
    });

    it('should return to the room once the server resets the table', async () => {
      // Arrange
      const harness = await renderSession(snapshotOf({ phase: 'finished', started: true, resetAt: Date.now() + 20_000 }));

      // Act
      await send(harness.client, snapshotOf({ phase: 'waiting', started: false }));

      // Assert
      expect(screen.getByTestId('private-room')).toBeOnTheScreen();
    });

    it('should unmount the table when the room returns', async () => {
      // Arrange
      const harness = await renderSession(snapshotOf({ phase: 'finished', started: true }));

      // Act
      await send(harness.client, snapshotOf({ phase: 'waiting', started: false }));

      // Assert
      expect(screen.queryByTestId('table-new-game')).not.toBeOnTheScreen();
    });

    it('should return to the room when the final summary button is pressed', async () => {
      // Arrange
      await renderSession(snapshotOf({ phase: 'finished', started: true }));

      // Act
      await fireEvent.press(screen.getByTestId('table-new-game'));

      // Assert
      expect(screen.getByTestId('private-room')).toBeOnTheScreen();
    });

    it('should never navigate to /finding from the final summary', async () => {
      // Arrange
      await renderSession(snapshotOf({ phase: 'finished', started: true }));

      // Act
      await fireEvent.press(screen.getByTestId('table-new-game'));

      // Assert
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
  });

  describe('next game', () => {
    it('should remount the table for the next game', async () => {
      // Arrange
      const harness = await renderSession(snapshotOf());
      await send(harness.client, snapshotOf({ phase: 'playing', started: true }));
      await send(harness.client, snapshotOf({ phase: 'waiting', started: false }));

      // Act
      await send(harness.client, snapshotOf({ phase: 'playing', started: true, gameKey: 1 }));

      // Assert
      expect(mockTable.mounts).toBe(2);
    });
  });

  describe('fatal errors', () => {
    it('should show the fatal error sheet over the room', async () => {
      // Arrange
      const snapshot = snapshotOf({ lastError: { id: 1, code: 'match_ended', fatal: true } });

      // Act
      await renderSession(snapshot);

      // Assert
      expect(screen.getByTestId('online-error-message')).toHaveTextContent('This table has closed.');
    });
  });
});
