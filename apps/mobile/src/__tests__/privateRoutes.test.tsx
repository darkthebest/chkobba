/**
 * Route-level private-table flows with a fake backend: `/private` creates a
 * table, `/t/CODE` joins one (through the name gate), shows the room join
 * errors, and a reload looks the code up again so the server can give the same
 * seat back. `PrivateSession` is stubbed here because it is covered by its own
 * test; these tests are about the routes' choices.
 */
import { FIXTURE_ROOM_CODE, PRIVATE_PLAYING_SEATED_SNAPSHOT } from '@chkobba/protocol/testing';
import { ROOM_JOIN_CODE_KEY } from '@chkobba/protocol';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import PrivateScreen from '@/app/private';
import RoomScreen from '@/app/t/[code]';
import type {
  JoinByCodeResult,
  JoinResult,
  MatchSocket,
  MatchSocketHandlers,
  OnlineServicesBackend,
} from '@/online/NakamaGameClient';
import type { Profile, ProfileBackend, SetNameResult } from '@/online/profile';
import { OpCode } from '@/online/protocol';

const MATCH_ID = 'match-1';
const CODE = FIXTURE_ROOM_CODE;
const LOOKED_UP_CODE = 'K7M2QX';

const mockParams: { current: Record<string, string | string[] | undefined> } = { current: {} };
const mockRouter = {
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
};

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockRouter.replace(...args),
    back: (...args: unknown[]) => mockRouter.back(...args),
    canGoBack: () => mockRouter.canGoBack(),
    setParams: (...args: unknown[]) => mockRouter.setParams(...args),
  },
  useLocalSearchParams: () => mockParams.current,
}));

const mockBackends: { online: OnlineServicesBackend | null; profile: ProfileBackend | null } = {
  online: null,
  profile: null,
};

// The real module builds a nakama-js client; the route tests swap in a fake backend.
jest.mock('@/online/services', () => ({
  getOnlineBackend: () => mockBackends.online,
  getProfileBackend: () => mockBackends.profile,
}));

// Stand-in for the session: shows which seat the live snapshot gives the player.
jest.mock('@/components/room/PrivateSession', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const { useGame } = jest.requireActual<typeof import('@/game/useGame')>('@/game/useGame');
  return {
    PrivateSession: ({ client }: { client: Parameters<typeof useGame>[0] }) => {
      const snapshot = useGame(client);
      return React.createElement(Text, { testID: 'session-seat' }, `seat:${snapshot.online?.room?.mySeat ?? 'none'}`);
    },
  };
});

type Json = { [key: string]: unknown };

class FakeSocket implements MatchSocket {
  readonly joinMatch = jest.fn(
    async (_matchId: string, _metadata?: Record<string, string>): Promise<JoinResult> => ({ ok: true }),
  );
  readonly leaveMatch = jest.fn(async (_matchId: string): Promise<void> => undefined);
  readonly send = jest.fn(async (_matchId: string, _opCode: number, _data: string): Promise<void> => undefined);
  readonly close = jest.fn((): void => undefined);

  constructor(private readonly handlers: MatchSocketHandlers) {}

  emitSnapshot(snapshot: Json): void {
    this.handlers.onMatchData(OpCode.SNAPSHOT, JSON.stringify(snapshot));
  }
}

function createFakeBackend(options: { join?: JoinByCodeResult } = {}) {
  const sockets: FakeSocket[] = [];
  const backend = {
    signIn: jest.fn(async (): Promise<void> => undefined),
    quickMatch: jest.fn(async (): Promise<string> => MATCH_ID),
    openSocket: jest.fn(async (handlers: MatchSocketHandlers): Promise<MatchSocket> => {
      const socket = new FakeSocket(handlers);
      sockets.push(socket);
      return socket;
    }),
    createPrivateTable: jest.fn(async (): Promise<{ matchId: string; code: string }> => ({ matchId: MATCH_ID, code: CODE })),
    joinByCode: jest.fn(async (_code: string): Promise<JoinByCodeResult> => options.join ?? { ok: true, matchId: MATCH_ID }),
  } satisfies OnlineServicesBackend;

  const lastSocket = (): FakeSocket => {
    const socket = sockets[sockets.length - 1];
    if (!socket) throw new Error('no socket opened');
    return socket;
  };
  return { backend, sockets, lastSocket };
}

function returningProfile(): ProfileBackend {
  const profile: Profile = {
    displayName: 'Hamza',
    namePicked: true,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
  };
  return {
    getProfile: jest.fn(async (): Promise<Profile> => profile),
    setDisplayName: jest.fn(
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
    ),
  };
}

function firstVisitProfile(displayName = 'Guest4821'): ProfileBackend {
  const profile: Profile = {
    displayName,
    namePicked: false,
    renameAvailableAt: null,
    friendCode: null,
    listed: false,
    presenceVisibility: 'everyone',
  };
  return {
    getProfile: jest.fn(async (): Promise<Profile> => profile),
    setDisplayName: jest.fn(
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
    ),
  };
}

/** Lets the profile / RPC promises settle inside act. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

async function emit(socket: FakeSocket, snapshot: Json): Promise<void> {
  await act(async () => {
    socket.emitSnapshot(snapshot);
  });
}

function useBackend(fake = createFakeBackend(), profile: ProfileBackend = returningProfile()) {
  mockBackends.online = fake.backend;
  mockBackends.profile = profile;
  return fake;
}

describe('private-table routes', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockParams.current = {};
    mockBackends.online = null;
    mockBackends.profile = null;
  });

  afterEach(() => {
    mockParams.current = {};
    mockBackends.online = null;
    mockBackends.profile = null;
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('/private create flow', () => {
    it('should create a private table', async () => {
      // Arrange
      const fake = useBackend();

      // Act
      await render(<PrivateScreen />);
      await settle();

      // Assert
      expect(fake.backend.createPrivateTable).toHaveBeenCalledTimes(1);
    });

    it('should replace itself with the room route carrying the match id', async () => {
      // Arrange
      useBackend();

      // Act
      await render(<PrivateScreen />);
      await settle();

      // Assert
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/t/[code]',
        params: { code: CODE, matchId: MATCH_ID },
      });
    });

    it('should not look the code up when it already created the table', async () => {
      // Arrange
      const fake = useBackend();

      // Act
      await render(<PrivateScreen />);
      await settle();

      // Assert
      expect(fake.backend.joinByCode).not.toHaveBeenCalled();
    });

    it('should offer a retry when creating the table fails', async () => {
      // Arrange
      const fake = useBackend();
      fake.backend.createPrivateTable.mockRejectedValueOnce(new Error('offline'));

      // Act
      await render(<PrivateScreen />);
      await settle();

      // Assert
      expect(screen.getByTestId('finding-retry')).toBeOnTheScreen();
    });
  });

  describe('/t/CODE link flow', () => {
    it('should ask for a name before joining on a first visit', async () => {
      // Arrange
      useBackend(createFakeBackend(), firstVisitProfile());
      mockParams.current = { code: CODE.toLowerCase() };

      // Act
      await render(<RoomScreen />);
      await settle();

      // Assert
      expect(screen.getByRole('header')).toHaveTextContent('Choose your name');
    });

    it('should not look up the code before a name is picked', async () => {
      // Arrange
      const fake = useBackend(createFakeBackend(), firstVisitProfile());
      mockParams.current = { code: CODE };

      // Act
      await render(<RoomScreen />);
      await settle();

      // Assert
      expect(fake.backend.joinByCode).not.toHaveBeenCalled();
    });

    it('should normalize the typed code before looking it up', async () => {
      // Arrange
      const fake = useBackend(createFakeBackend(), firstVisitProfile());
      mockParams.current = { code: 'k7m2-qx' };
      await render(<RoomScreen />);
      await settle();

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(fake.backend.joinByCode).toHaveBeenCalledWith(LOOKED_UP_CODE);
    });

    it('should start the session once the code resolves', async () => {
      // Arrange
      useBackend(createFakeBackend(), firstVisitProfile());
      mockParams.current = { code: CODE };
      await render(<RoomScreen />);
      await settle();

      // Act
      await fireEvent.press(screen.getByTestId('finding-name-submit'));
      await settle();

      // Assert
      expect(screen.getByTestId('session-seat')).toBeOnTheScreen();
    });

    it('should explain that the table was not found', async () => {
      // Arrange
      useBackend(createFakeBackend({ join: { ok: false, reason: 'not_found' } }));
      mockParams.current = { code: CODE };

      // Act
      await render(<RoomScreen />);
      await settle();

      // Assert
      expect(screen.getByTestId('online-error-message')).toHaveTextContent('Table not found. Check the code.');
    });

    it('should explain that the player is rate limited', async () => {
      // Arrange
      useBackend(createFakeBackend({ join: { ok: false, reason: 'rate_limited' } }));
      mockParams.current = { code: CODE };

      // Act
      await render(<RoomScreen />);
      await settle();

      // Assert
      expect(screen.getByTestId('online-error-message')).toHaveTextContent('Too many attempts. Try again later.');
    });

    it('should offer a retry when the join lookup is unreachable', async () => {
      // Arrange
      useBackend(createFakeBackend({ join: { ok: false, reason: 'network' } }));
      mockParams.current = { code: CODE };

      // Act
      await render(<RoomScreen />);
      await settle();

      // Assert
      expect(screen.getByTestId('finding-retry')).toBeOnTheScreen();
    });
  });

  describe('/t/CODE reload mid-game', () => {
    it('should look the code up again when the URL carries no match id', async () => {
      // Arrange
      const fake = useBackend();
      mockParams.current = { code: CODE };

      // Act
      await render(<RoomScreen />);
      await settle();

      // Assert
      expect(fake.backend.joinByCode).toHaveBeenCalledWith(CODE);
    });

    it('should join the table with the room code so the server can hand the seat back', async () => {
      // Arrange
      const fake = useBackend();
      mockParams.current = { code: CODE };
      await render(<RoomScreen />);
      await settle();

      // Act
      // (assertion below)

      // Assert
      expect(fake.lastSocket().joinMatch).toHaveBeenCalledWith(MATCH_ID, { [ROOM_JOIN_CODE_KEY]: CODE });
    });

    it('should show the player back in the same seat after the reload', async () => {
      // Arrange
      const fake = useBackend();
      mockParams.current = { code: CODE };
      await render(<RoomScreen />);
      await settle();

      // Act
      await emit(fake.lastSocket(), PRIVATE_PLAYING_SEATED_SNAPSHOT as unknown as Json);

      // Assert
      expect(screen.getByTestId('session-seat')).toHaveTextContent('seat:0');
    });
  });
});
