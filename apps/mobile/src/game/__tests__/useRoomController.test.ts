/**
 * useRoomController: private-room state and actions over a fake GameClient
 * whose snapshot carries `online.room`. Jest fake timers also fake Date.now,
 * which the reset countdown reads.
 */
import { FIXTURE_ROOM_CODE } from '@chkobba/protocol/testing';
import type { PlayerView, Seat } from '@chkobba/rules';
import { act, renderHook } from '@testing-library/react-native';
import { Platform, Share } from 'react-native';

import * as shareRoomModule from '@/online/shareRoom';

import type {
  GameClient,
  GameSnapshot,
  OnlineError,
  OnlineInfo,
  OnlineTablePhase,
  RoomMemberState,
  RoomState,
  SeatInfo,
} from '../GameClient';
import { useRoomController, type RoomController } from '../useRoomController';

// Real implementation by default; individual tests override one call where that is simpler.
jest.mock('@/online/shareRoom', () => {
  const actual = jest.requireActual<typeof import('@/online/shareRoom')>('@/online/shareRoom');
  return {
    ...actual,
    shareRoom: jest.fn(actual.shareRoom),
    copyRoomCode: jest.fn(actual.copyRoomCode),
  };
});
const mockedShareRoom = jest.mocked(shareRoomModule.shareRoom);
const mockedCopyRoomCode = jest.mocked(shareRoomModule.copyRoomCode);

const CODE = FIXTURE_ROOM_CODE;
const BASE = 'http://192.168.1.10:8081';

const HOST: RoomMemberState = { name: 'Hamza', seat: 0, isHost: true };
const GUEST: RoomMemberState = { name: 'Sami', seat: 1, isHost: false };
const BOT_SEAT_2: SeatInfo = { seat: 2, name: 'Bot Salah', isBot: true };

interface Setup {
  phase?: OnlineTablePhase;
  members?: readonly RoomMemberState[];
  myIndex?: number;
  mySeat?: Seat | null;
  amHost?: boolean;
  players?: readonly SeatInfo[];
  scores?: readonly [number, number] | null;
  resetAt?: number | null;
  lastError?: OnlineError | null;
  noRoom?: boolean;
}

function snapshotOf(setup: Setup = {}): GameSnapshot {
  const room: RoomState = {
    code: CODE,
    members: setup.members ?? [HOST, GUEST],
    myIndex: setup.myIndex ?? 0,
    mySeat: setup.mySeat === undefined ? 0 : setup.mySeat,
    amHost: setup.amHost ?? true,
    scores: setup.scores ?? null,
    resetAt: setup.resetAt ?? null,
  };
  const online: OnlineInfo = {
    phase: setup.phase ?? 'waiting',
    seatsFilled: 2,
    seatCount: 4,
    backfillAt: null,
    started: false,
    phaseSince: 0,
    lastError: setup.lastError ?? null,
    ...(setup.noRoom ? {} : { room }),
  };
  return {
    // The room screen never reads the game view.
    view: {} as PlayerView,
    players: setup.players ?? [
      { seat: 0, name: 'Hamza', isBot: false },
      { seat: 1, name: 'Sami', isBot: false },
    ],
    log: [],
    online,
  };
}

/** A GameClient whose snapshot the test sets directly. */
class FakeRoomClient implements GameClient {
  readonly seat: Seat = 0;
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<() => void>();
  readonly sit = jest.fn(async (_seat: Seat): Promise<void> => undefined);
  readonly startGame = jest.fn(async (): Promise<void> => undefined);
  readonly start = jest.fn();
  readonly stop = jest.fn();
  readonly play = jest.fn(async (): Promise<void> => undefined);
  readonly cut = jest.fn(async (): Promise<void> => undefined);
  readonly nextRound = jest.fn(async (): Promise<void> => undefined);

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

async function renderRoom(client: GameClient) {
  return renderHook(() => useRoomController(client));
}

/** The controller, failing the test when the hook returned null. */
function room(result: { current: RoomController | null }): RoomController {
  if (result.current === null) throw new Error('expected a room controller');
  return result.current;
}

async function flush(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('useRoomController', () => {
  const savedEnv = process.env.EXPO_PUBLIC_WEB_BASE_URL;

  beforeEach(() => {
    jest.useFakeTimers();
    delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    jest.restoreAllMocks();
    if (savedEnv === undefined) delete process.env.EXPO_PUBLIC_WEB_BASE_URL;
    else process.env.EXPO_PUBLIC_WEB_BASE_URL = savedEnv;
  });

  describe('without a room', () => {
    it('should return null when the table has no room', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ noRoom: true }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(result.current).toBeNull();
    });

    it('should return null for a local game without online info', async () => {
      // Arrange
      const { online: _online, ...local } = snapshotOf();
      const client = new FakeRoomClient(local);

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(result.current).toBeNull();
    });
  });

  describe('seats', () => {
    it('should mark each seat as me, human, bot or empty', async () => {
      // Arrange
      const client = new FakeRoomClient(
        snapshotOf({ players: [{ seat: 0, name: 'Hamza', isBot: false }, { seat: 1, name: 'Sami', isBot: false }, BOT_SEAT_2] }),
      );

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).seats.map((seat) => seat.kind)).toEqual(['me', 'human', 'bot', 'empty']);
    });

    it('should name members and bots and leave empty seats unnamed', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ players: [BOT_SEAT_2] }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).seats.map((seat) => seat.name)).toEqual(['Hamza', 'Sami', 'Bot Salah', null]);
    });

    it('should pair seats 0+2 as team 0 and 1+3 as team 1', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).seats.map((seat) => seat.team)).toEqual([0, 1, 0, 1]);
    });

    it('should mark the host seat', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).seats.map((seat) => seat.isHost)).toEqual([true, false, false, false]);
    });

    it('should mark our seated member entry as me via myIndex', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ myIndex: 1, mySeat: 1, amHost: false }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).members.map((member) => member.isMe)).toEqual([false, true]);
    });

    it('should mark our standing member entry as me via myIndex', async () => {
      // Arrange
      const standing: RoomMemberState = { name: 'Leila', seat: null, isHost: false };
      const client = new FakeRoomClient(
        snapshotOf({ members: [HOST, GUEST, standing], myIndex: 2, mySeat: null, amHost: false }),
      );

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).standing).toEqual([{ name: 'Leila', seat: null, isHost: false, isMe: true }]);
    });

    it('should pass a standing member userId through to the member view', async () => {
      // Arrange
      const standing: RoomMemberState = { name: 'Leila', seat: null, isHost: false, userId: 'user-leila' };
      const client = new FakeRoomClient(snapshotOf({ members: [HOST, GUEST, standing] }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).standing).toEqual([
        { name: 'Leila', seat: null, isHost: false, userId: 'user-leila', isMe: false },
      ]);
    });
  });

  describe('canSit', () => {
    it('should allow sitting only on the empty seats while waiting', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).seats.map((seat) => seat.canSit)).toEqual([false, false, true, true]);
    });

    it('should not allow sitting on an empty seat during a game', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ phase: 'playing' }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).canSit(3)).toBe(false);
    });

    it('should not allow sitting on an empty seat after the game finished', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ phase: 'finished' }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).canSit(3)).toBe(false);
    });
  });

  describe('canStart', () => {
    it('should let the host start while waiting with a human seated', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).canStart).toBe(true);
    });

    it('should not let a guest start', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ amHost: false, myIndex: 1, mySeat: 1 }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).canStart).toBe(false);
    });

    it('should not let the host start during a game', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ phase: 'between' }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).canStart).toBe(false);
    });

    it('should not let the host start when no human is seated', async () => {
      // Arrange
      const client = new FakeRoomClient(
        snapshotOf({ members: [{ name: 'Hamza', seat: null, isHost: true }], mySeat: null, players: [] }),
      );

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).canStart).toBe(false);
    });
  });

  describe('canTakeOver', () => {
    const standingSetup: Setup = {
      phase: 'playing',
      members: [HOST, GUEST, { name: 'Leila', seat: null, isHost: false }],
      myIndex: 2,
      mySeat: null,
      amHost: false,
      players: [
        { seat: 0, name: 'Hamza', isBot: false },
        { seat: 1, name: 'Sami', isBot: false },
        BOT_SEAT_2,
        { seat: 3, name: 'Bot Mona', isBot: true },
      ],
    };

    it('should allow a standing member to take over the bot seats during a game', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf(standingSetup));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).seats.map((seat) => seat.canTakeOver)).toEqual([false, false, true, true]);
    });

    it('should not allow a seated member to take over a bot seat', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ ...standingSetup, myIndex: 1, mySeat: 1 }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).canTakeOver(2)).toBe(false);
    });

    it('should not allow taking over a bot seat while waiting', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ ...standingSetup, phase: 'waiting' }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).canTakeOver(2)).toBe(false);
    });
  });

  describe('actions', () => {
    it('should sit in an empty seat while waiting', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).sit(3));

      // Assert
      expect(client.sit).toHaveBeenCalledWith(3);
    });

    it('should not send sit for an occupied seat', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).sit(1));

      // Assert
      expect(client.sit).not.toHaveBeenCalled();
    });

    it('should start the game when the host may start', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).start());

      // Assert
      expect(client.startGame).toHaveBeenCalledTimes(1);
    });

    it('should not send start for a guest', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ amHost: false, myIndex: 1, mySeat: 1 }));
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).start());

      // Assert
      expect(client.startGame).not.toHaveBeenCalled();
    });

    it('should take over a bot seat through sit when standing in a game', async () => {
      // Arrange
      const client = new FakeRoomClient(
        snapshotOf({
          phase: 'playing',
          members: [HOST, { name: 'Sami', seat: null, isHost: false }],
          myIndex: 1,
          mySeat: null,
          amHost: false,
          players: [{ seat: 0, name: 'Hamza', isBot: false }, BOT_SEAT_2],
        }),
      );
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).takeOver(2));

      // Assert
      expect(client.sit).toHaveBeenCalledWith(2);
    });

    it('should not send a takeover for a human seat', async () => {
      // Arrange
      const client = new FakeRoomClient(
        snapshotOf({
          phase: 'playing',
          members: [HOST, { name: 'Sami', seat: null, isHost: false }],
          myIndex: 1,
          mySeat: null,
          amHost: false,
        }),
      );
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).takeOver(0));

      // Assert
      expect(client.sit).not.toHaveBeenCalled();
    });
  });

  describe('actionError', () => {
    it('should show a localized error when an action is rejected', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());
      client.sit.mockRejectedValueOnce(new Error('seat_taken'));
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).sit(3));
      await flush();

      // Assert
      expect(room(result).actionError).toBe('Someone already took that seat.');
    });

    it('should show a non-fatal server error that arrives after mount', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      await act(async () => client.set(snapshotOf({ lastError: { id: 1, code: 'not_host', fatal: false } })));

      // Assert
      expect(room(result).actionError).toBe('Only the host can do that.');
    });

    it('should clear a non-fatal server error after 3.5 s', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);
      await act(async () => client.set(snapshotOf({ lastError: { id: 1, code: 'not_host', fatal: false } })));

      // Act
      await advance(3500);

      // Assert
      expect(room(result).actionError).toBeNull();
    });

    it('should still show a non-fatal server error just before 3.5 s', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);
      await act(async () => client.set(snapshotOf({ lastError: { id: 1, code: 'not_host', fatal: false } })));

      // Act
      await advance(3400);

      // Assert
      expect(room(result).actionError).toBe('Only the host can do that.');
    });

    it('should ignore a non-fatal error that was already there at mount', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ lastError: { id: 4, code: 'table_full', fatal: false } }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).actionError).toBeNull();
    });

    it('should not show a fatal error as an action error', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      await act(async () => client.set(snapshotOf({ lastError: { id: 1, code: 'match_ended', fatal: true } })));

      // Assert
      expect(room(result).actionError).toBeNull();
    });
  });

  describe('resetCountdown', () => {
    it('should be null when no reset is scheduled', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ phase: 'finished' }));

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).resetCountdown).toBeNull();
    });

    it('should count whole seconds down to resetAt', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf({ phase: 'finished', resetAt: Date.now() + 15_000 }));
      const { result } = await renderRoom(client);

      // Act
      await advance(5_000);

      // Assert
      expect(room(result).resetCountdown).toBe(10);
    });
  });

  describe('share', () => {
    it('should expose no link when no web base URL is configured', async () => {
      // Arrange
      const client = new FakeRoomClient(snapshotOf());

      // Act
      const { result } = await renderRoom(client);

      // Assert
      expect(room(result).link).toBeNull();
    });

    it('should share the code alone on native when no web base URL is configured', async () => {
      // Arrange
      const shareSpy = jest
        .spyOn(Share, 'share')
        .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).share());
      await flush();

      // Assert
      expect(shareSpy).toHaveBeenCalledWith({ message: `Join my Chkobba table! Code: ${CODE}` });
    });

    it('should fall back to unavailable on an insecure web context', async () => {
      // Arrange
      process.env.EXPO_PUBLIC_WEB_BASE_URL = BASE;
      jest.replaceProperty(Platform, 'OS', 'web');
      const g = globalThis as unknown as Record<string, unknown>;
      const savedWindow = Object.getOwnPropertyDescriptor(g, 'window');
      Object.defineProperty(g, 'window', { value: { isSecureContext: false }, configurable: true, writable: true });
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      try {
        await act(async () => room(result).share());
        await flush();
      } finally {
        if (savedWindow === undefined) delete g.window;
        else Object.defineProperty(g, 'window', savedWindow);
      }

      // Assert
      expect({ shareState: room(result).shareState, link: room(result).link }).toEqual({
        shareState: 'unavailable',
        link: `${BASE}/t/${CODE}`,
      });
    });

    it('should report unavailable when sharing rejects', async () => {
      // Arrange
      mockedShareRoom.mockRejectedValueOnce(new Error('boom'));
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).share());
      await flush();

      // Assert
      expect(room(result).shareState).toBe('unavailable');
    });

    it('should show copied after copying the code', async () => {
      // Arrange
      mockedCopyRoomCode.mockResolvedValueOnce('copied');
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);

      // Act
      await act(async () => room(result).copy());
      await flush();

      // Assert
      expect(room(result).shareState).toBe('copied');
    });

    it('should return to idle 2.5 s after copying', async () => {
      // Arrange
      mockedCopyRoomCode.mockResolvedValueOnce('copied');
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);
      await act(async () => room(result).copy());
      await flush();

      // Act
      await advance(2500);

      // Assert
      expect(room(result).shareState).toBe('idle');
    });

    it('should keep unavailable instead of returning to idle', async () => {
      // Arrange
      mockedCopyRoomCode.mockResolvedValueOnce('unavailable');
      const client = new FakeRoomClient(snapshotOf());
      const { result } = await renderRoom(client);
      await act(async () => room(result).copy());
      await flush();

      // Act
      await advance(2500);

      // Assert
      expect(room(result).shareState).toBe('unavailable');
    });
  });
});
