import type { BotLevel, PlayMove, PlayerView } from '@chkobba/rules';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import type { GameClient, GameSnapshot, OnlineInfo, SeatInfo } from '@/game/GameClient';
import { LocalGameClient, type Scheduler } from '@/game/LocalGameClient';
import { playerSheetTarget } from '@/game/useTableController';
import type { FriendsBackend, FriendsSnapshot } from '@/online/friends';
import { EMPTY_SOCIAL_STATE, SocialContext, type SocialContextValue } from '@/online/socialContext';
import type { TableInvite } from '@/online/socialSocket';
import between from '@/online/__tests__/fixtures/between.json';
import finished from '@/online/__tests__/fixtures/finished.json';
import { SkinProvider, type SkinId } from '@/skins';

import { isDesktopLayout } from '@/layout';

import { GameTable } from '../GameTable';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 390, height: 844, scale: 2, fontScale: 1 })),
}));

const windowDimensions = jest.requireMock<{ default: jest.Mock }>(
  'react-native/Libraries/Utilities/useWindowDimensions',
).default;

const noopScheduler: Scheduler = () => () => {};

async function setup(skin: SkinId = 'cafe', seed = 'ui', botLevel: BotLevel = 'easy') {
  const client = new LocalGameClient({ seed, playerCount: 4, dealer: 3, botLevel, rules: { cutCardChoice: false }, scheduler: noopScheduler });
  await render(
    <SkinProvider initial={skin}>
      <GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />
    </SkinProvider>,
  );
  return client;
}

describe.each(['cafe', 'minimal'] as const)('GameTable (%s skin)', (skin) => {
  it('renders the hand, the table, the other seats and the scoreboard', async () => {
    const client = await setup(skin);
    const { view } = client.getSnapshot();
    for (const card of [...view.hand, ...view.table]) {
      expect(screen.getByTestId(`card-${card.id}`)).toBeOnTheScreen();
    }
    for (const seat of [1, 2, 3]) expect(screen.getByTestId(`seat-${seat}`)).toBeOnTheScreen();
    expect(screen.getByTestId('score-us')).toBeOnTheScreen();
    expect(screen.getByTestId('status')).toHaveTextContent(/Your turn/);
  });

  it('plays a card through its option button', async () => {
    const client = await setup(skin);
    const move = client.getSnapshot().view.legalMoves[0]!;

    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    await fireEvent.press(screen.getByTestId(move.capture.length === 0 ? 'option-place' : 'option-1'));

    expect(client.getSnapshot().view.hand).toHaveLength(2);
    expect(client.getSnapshot().view.turn).toBe(1);
    expect(screen.getByTestId('status')).toHaveTextContent(/Waiting for/);
  });
});

describe('capture badges', () => {
  it('stamps option numbers on the table cards a selected card can take', async () => {
    // Find a seed where the human's first legal move is a capture.
    let client: LocalGameClient | null = null;
    for (let i = 0; i < 50 && !client; i++) {
      const candidate = new LocalGameClient({
        seed: `badge${i}`,
        playerCount: 4,
        dealer: 3,
        botLevel: 'easy',
        rules: { cutCardChoice: false },
        scheduler: noopScheduler,
      });
      if (candidate.getSnapshot().view.legalMoves.some((m) => m.capture.length > 0)) client = candidate;
    }
    const capture = client!.getSnapshot().view.legalMoves.find((m) => m.capture.length > 0)!;
    await render(<GameTable client={client!} onNewGame={jest.fn()} onExit={jest.fn()} />);

    await fireEvent.press(screen.getByTestId(`card-${capture.cardId}`));
    for (const id of capture.capture) expect(screen.getByTestId(`badge-${id}-1`)).toBeOnTheScreen();
  });
});

describe('layout selection', () => {
  it('uses the desktop layout on any window that is not small', () => {
    expect(isDesktopLayout(1440)).toBe(true);
    expect(isDesktopLayout(1024)).toBe(true);
    expect(isDesktopLayout(1000)).toBe(true); // tall desktop windows too
    expect(isDesktopLayout(820)).toBe(false); // small tablet in portrait
    expect(isDesktopLayout(390)).toBe(false); // phone
  });

  it('renders the side panel layout on a desktop-sized window', async () => {
    windowDimensions.mockReturnValue({ width: 1440, height: 900, scale: 1, fontScale: 1 });
    const client = new LocalGameClient({ seed: 'desk', playerCount: 4, dealer: 3, botLevel: 'easy', rules: { cutCardChoice: false }, scheduler: noopScheduler });
    await render(<GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />);
    expect(screen.getByTestId('desktop-layout')).toBeOnTheScreen();
    expect(screen.queryByTestId('phone-layout')).not.toBeOnTheScreen();
    expect(screen.getByText(/Hover a card to preview/)).toBeOnTheScreen();
  });
});

describe('cut, dealer draw and double-tap', () => {
  beforeEach(() => windowDimensions.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 }));

  it('asks the human cutter to keep or throw, then deals', async () => {
    const client = new LocalGameClient({ seed: 'cut-ui', playerCount: 4, dealer: 3, scheduler: noopScheduler });
    await render(<GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />);
    expect(screen.getByTestId('cut-prompt')).toBeOnTheScreen();
    expect(screen.getByTestId('status')).toHaveTextContent(/Your cut/);

    await fireEvent.press(screen.getByTestId('cut-throw'));
    expect(screen.queryByTestId('cut-prompt')).not.toBeOnTheScreen();
    expect(client.getSnapshot().view.phase).toBe('playing');
    expect(client.getSnapshot().view.hand).toHaveLength(3);
  });

  it('shows who deals first and can be dismissed', async () => {
    const client = new LocalGameClient({ seed: 'intro', playerCount: 4, scheduler: noopScheduler });
    await render(<GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />);
    expect(screen.getByTestId('dealer-draw')).toHaveTextContent(/deals? first/);
    await fireEvent.press(screen.getByTestId('dealer-draw'));
    expect(screen.queryByTestId('dealer-draw')).not.toBeOnTheScreen();
  });

  it('ignores a duplicated press instead of treating it as a double-tap', async () => {
    const client = new LocalGameClient({ seed: 'dup', playerCount: 4, dealer: 3, botLevel: 'easy', rules: { cutCardChoice: false }, scheduler: noopScheduler });
    const card = client.getSnapshot().view.hand[0]!;
    await render(<GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />);
    let clock = 10_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    await fireEvent.press(screen.getByTestId(`card-${card.id}`));
    clock += 5;
    await fireEvent.press(screen.getByTestId(`card-${card.id}`));
    now.mockRestore();
    expect(client.getSnapshot().view.hand).toHaveLength(3);
    expect(screen.getAllByTestId(/^option-/).length).toBeGreaterThan(0); // still selected, not toggled off
  });

  it('plays a card on a slower double-tap (450 ms) instead of toggling it off', async () => {
    const client = await setup('cafe', 'slow');
    const moves = client.getSnapshot().view.legalMoves;
    const single = moves.find((m) => moves.filter((o) => o.cardId === m.cardId).length === 1);
    if (!single) throw new Error('seed "slow" needs a hand card with a single move');

    let clock = 10_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    await fireEvent.press(screen.getByTestId(`card-${single.cardId}`));
    clock += 450;
    await fireEvent.press(screen.getByTestId(`card-${single.cardId}`));
    now.mockRestore();
    expect(client.getSnapshot().view.hand.map((c) => c.id)).not.toContain(single.cardId);
  });

  it('plays a card on double-tap when it has a single move', async () => {
    let client: LocalGameClient | null = null;
    for (let i = 0; i < 50 && !client; i++) {
      const candidate = new LocalGameClient({
        seed: `dbl${i}`,
        playerCount: 4,
        dealer: 3,
        botLevel: 'easy',
        rules: { cutCardChoice: false },
        scheduler: noopScheduler,
      });
      const moves = candidate.getSnapshot().view.legalMoves;
      if (moves.some((m) => moves.filter((o) => o.cardId === m.cardId).length === 1)) client = candidate;
    }
    const moves = client!.getSnapshot().view.legalMoves;
    const single = moves.find((m) => moves.filter((o) => o.cardId === m.cardId).length === 1)!;
    await render(<GameTable client={client!} onNewGame={jest.fn()} onExit={jest.fn()} />);

    // Two real taps 200 ms apart (presses under 40 ms apart are treated as one duplicated touch).
    let clock = 10_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    await fireEvent.press(screen.getByTestId(`card-${single.cardId}`));
    clock += 200;
    await fireEvent.press(screen.getByTestId(`card-${single.cardId}`));
    now.mockRestore();
    expect(client!.getSnapshot().view.hand.map((c) => c.id)).not.toContain(single.cardId);
    expect(client!.getSnapshot().view.turn).toBe(1);
  });
});

describe('picking captures on the table (Normal, Hard and online)', () => {
  beforeEach(() => windowDimensions.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 }));

  /** A Normal-bots deal where the human (leading) has a move matching `want`. */
  function dealWith(want: (move: PlayMove, view: PlayerView) => boolean): { client: LocalGameClient; move: PlayMove } {
    for (let i = 0; i < 300; i++) {
      const client = new LocalGameClient({
        seed: `pick${i}`,
        playerCount: 4,
        dealer: 3,
        rules: { cutCardChoice: false },
        scheduler: noopScheduler,
      });
      const { view } = client.getSnapshot();
      const move = view.legalMoves.find((m) => want(m, view));
      if (move) return { client, move };
    }
    throw new Error('no deal found');
  }

  async function show(client: LocalGameClient) {
    await render(<GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />);
  }

  const handIds = (client: LocalGameClient) => client.getSnapshot().view.hand.map((c) => c.id);

  it('shows no capture options or badges for a selected card', async () => {
    const { client, move } = dealWith((m) => m.capture.length > 0);
    await show(client);

    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));

    expect(screen.queryAllByTestId(/^option-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^badge-/)).toHaveLength(0);
    expect(screen.getByTestId('status')).toHaveTextContent(/Your turn/);
  });

  it('plays a multi-card capture once the picked table cards form it', async () => {
    const { client, move } = dealWith((m) => m.capture.length >= 2);
    await show(client);

    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    for (const id of move.capture.slice(0, -1)) await fireEvent.press(screen.getByTestId(`card-${id}`));
    expect(handIds(client)).toContain(move.cardId); // not yet: one card still to pick
    await fireEvent.press(screen.getByTestId(`card-${move.capture[move.capture.length - 1]!}`));

    expect(handIds(client)).not.toContain(move.cardId);
    expect(client.getSnapshot().view.table.map((c) => c.id)).not.toContain(move.capture[0]);
  });

  it('clears the picks on a table card no capture can use, and keeps the card selected', async () => {
    const { client, move } = dealWith(
      (m, view) => m.capture.length > 0 && view.table.some((t) => !view.legalMoves.some((o) => o.cardId === m.cardId && o.capture.includes(t.id))),
    );
    const { view } = client.getSnapshot();
    const wrong = view.table.find((t) => !view.legalMoves.some((o) => o.cardId === move.cardId && o.capture.includes(t.id)))!;
    await show(client);

    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    await fireEvent.press(screen.getByTestId(`card-${wrong.id}`));
    expect(handIds(client)).toHaveLength(3);

    // Still selected: picking the right cards now plays the capture.
    for (const id of move.capture) await fireEvent.press(screen.getByTestId(`card-${id}`));
    expect(handIds(client)).not.toContain(move.cardId);
  });

  it('places a card by pressing the table outside the cards', async () => {
    const { client, move } = dealWith((m) => m.capture.length === 0);
    await show(client);

    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    await fireEvent.press(screen.getByTestId('table-mat'));

    expect(handIds(client)).not.toContain(move.cardId);
    expect(client.getSnapshot().view.table.map((c) => c.id)).toContain(move.cardId);
  });

  it('does not place a card that must capture', async () => {
    const { client, move } = dealWith((m) => m.capture.length > 0);
    await show(client);

    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    await fireEvent.press(screen.getByTestId('table-mat'));

    expect(handIds(client)).toContain(move.cardId);
  });

  it('places on double-tap but never captures on double-tap', async () => {
    const { client, move } = dealWith(
      (m, view) => m.capture.length > 0 && view.legalMoves.filter((o) => o.cardId === m.cardId).length === 1,
    );
    await show(client);

    let clock = 10_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    clock += 200;
    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    now.mockRestore();

    expect(handIds(client)).toContain(move.cardId);
    // The double-tap left it selected, so the capture can still be picked.
    for (const id of move.capture) await fireEvent.press(screen.getByTestId(`card-${id}`));
    expect(handIds(client)).not.toContain(move.cardId);
  });

  it('places a non-capturing card on double-tap', async () => {
    const { client, move } = dealWith((m) => m.capture.length === 0);
    await show(client);

    let clock = 10_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    clock += 200;
    await fireEvent.press(screen.getByTestId(`card-${move.cardId}`));
    now.mockRestore();

    expect(handIds(client)).not.toContain(move.cardId);
  });
});

/**
 * Online UI through GameTable, with a fake GameClient whose snapshot the test
 * sets directly (online fields included). The game view comes from a real
 * LocalGameClient deal, or from the server's "between rounds" fixture.
 * Countdowns tick every 250 ms on jest fake timers (which also fake Date.now).
 */
const ONLINE_PLAYERS: readonly SeatInfo[] = [
  { seat: 0, name: 'You', isBot: false, away: false, connected: true },
  { seat: 1, name: 'Amira', isBot: false, away: false, connected: true },
  { seat: 2, name: 'Sonia', isBot: true, away: false, connected: true },
  { seat: 3, name: 'Mongi', isBot: false, away: false, connected: true },
];

function onlineInfo(overrides: Partial<OnlineInfo> = {}): OnlineInfo {
  return {
    phase: 'playing',
    seatsFilled: 4,
    seatCount: 4,
    backfillAt: null,
    nextRoundAt: null,
    started: true,
    phaseSince: 0,
    lastError: null,
    ...overrides,
  };
}

/** Seat 0's turn on a fresh deal (seed 'ui', dealer 3: the human leads). */
function playingSnapshot(): GameSnapshot {
  const local = new LocalGameClient({ seed: 'ui', playerCount: 4, dealer: 3, rules: { cutCardChoice: false }, scheduler: noopScheduler });
  const { view, log } = local.getSnapshot();
  return { view, log, players: ONLINE_PLAYERS, turnDeadline: null, connection: 'online', online: onlineInfo() };
}

class FakeOnlineClient implements GameClient {
  readonly seat = 0;
  readonly play = jest.fn(async (): Promise<void> => undefined);
  readonly cut = jest.fn(async (): Promise<void> => undefined);
  readonly nextRound = jest.fn(async (): Promise<void> => undefined);
  readonly back = jest.fn(async (): Promise<void> => undefined);
  readonly start = jest.fn();
  readonly stop = jest.fn();
  private snapshot: GameSnapshot;
  private readonly listeners = new Set<() => void>();

  constructor(snapshot: GameSnapshot) {
    this.snapshot = snapshot;
  }

  getSnapshot = (): GameSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Publishes a new snapshot, as the real client does on each server message. */
  async update(patch: Partial<GameSnapshot>): Promise<void> {
    await act(async () => {
      this.snapshot = { ...this.snapshot, ...patch };
      for (const listener of this.listeners) listener();
    });
  }
}

function withPlayer(seat: number, patch: Partial<SeatInfo>): SeatInfo[] {
  return ONLINE_PLAYERS.map((p) => (p.seat === seat ? { ...p, ...patch } : p));
}

async function renderOnline(patch: Partial<GameSnapshot> = {}) {
  const client = new FakeOnlineClient({ ...playingSnapshot(), ...patch });
  const onExit = jest.fn();
  const onNewGame = jest.fn();
  await render(<GameTable client={client} onNewGame={onNewGame} onExit={onExit} />);
  return { client, onExit, onNewGame };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

describe('GameTable online', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    windowDimensions.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('turn clock', () => {
    it('should label my clock as a generic turn timer before the first tick', async () => {
      // Arrange
      const turnDeadline = Date.now() + 15_000;

      // Act
      await renderOnline({ turnDeadline });

      // Assert
      expect(screen.getByTestId('my-clock')).toHaveAccessibleName('Your time: turn timer');
    });

    it('should announce my seconds left once the clock has ticked', async () => {
      // Arrange
      await renderOnline({ turnDeadline: Date.now() + 15_000 });

      // Act
      await advance(0);

      // Assert
      expect(screen.getByRole('timer', { name: 'Your time: 15 seconds left' })).toBeOnTheScreen();
    });

    it('should count my clock down as time passes', async () => {
      // Arrange
      await renderOnline({ turnDeadline: Date.now() + 15_000 });
      await advance(0);

      // Act
      await advance(5_000);

      // Assert
      expect(screen.getByTestId('my-clock')).toHaveAccessibleName('Your time: 10 seconds left');
    });

    it("should put the clock on the other player's seat when it is their turn", async () => {
      // Arrange
      const snapshot = playingSnapshot();
      const view: PlayerView = { ...snapshot.view, turn: 1 };
      await renderOnline({ view, turnDeadline: Date.now() + 15_000 });

      // Act
      await advance(0);

      // Assert
      expect(screen.getByTestId('seat-1-clock')).toHaveAccessibleName('Amira: 15 seconds left');
    });

    it("should not show my clock when it is another player's turn", async () => {
      // Arrange
      const snapshot = playingSnapshot();
      const view: PlayerView = { ...snapshot.view, turn: 1 };
      await renderOnline({ view, turnDeadline: Date.now() + 15_000 });

      // Act
      await advance(0);

      // Assert
      expect(screen.queryByTestId('my-clock')).not.toBeOnTheScreen();
    });

    it('should show no clock when the server runs no turn timer', async () => {
      // Arrange
      const turnDeadline = null;

      // Act
      await renderOnline({ turnDeadline });

      // Assert
      expect(screen.queryByRole('timer')).not.toBeOnTheScreen();
    });

    it('should show no clock in an offline game', async () => {
      // Arrange
      const client = new LocalGameClient({ seed: 'ui', playerCount: 4, dealer: 3, rules: { cutCardChoice: false }, scheduler: noopScheduler });

      // Act
      await render(<GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />);

      // Assert
      expect(screen.queryByTestId('my-clock')).not.toBeOnTheScreen();
    });
  });

  describe('seat badges', () => {
    it('should badge a disconnected opponent as Offline', async () => {
      // Arrange
      const players = withPlayer(1, { connected: false });

      // Act
      await renderOnline({ players });

      // Assert
      expect(screen.getByTestId('seat-1-status')).toHaveTextContent('Offline');
    });

    it('should badge an away partner as Away', async () => {
      // Arrange
      const players = withPlayer(3, { away: true });

      // Act
      await renderOnline({ players });

      // Assert
      expect(screen.getByLabelText('Mongi is away')).toBeOnTheScreen();
    });

    it('should never badge a bot seat', async () => {
      // Arrange
      const players = withPlayer(2, { away: true, connected: false });

      // Act
      await renderOnline({ players });

      // Assert
      expect(screen.queryByTestId('seat-2-status')).not.toBeOnTheScreen();
    });

    it('should drop the badge when the player reconnects', async () => {
      // Arrange
      const { client } = await renderOnline({ players: withPlayer(1, { connected: false }) });

      // Act
      await client.update({ players: ONLINE_PLAYERS });

      // Assert
      expect(screen.queryByTestId('seat-1-status')).not.toBeOnTheScreen();
    });
  });

  describe.each([
    { layout: 'phone', width: 390, height: 844 },
    { layout: 'desktop', width: 1440, height: 900 },
  ])('banners ($layout layout)', ({ width, height }) => {
    beforeEach(() => {
      windowDimensions.mockReturnValue({ width, height, scale: 1, fontScale: 1 });
    });

    it('should show the reconnecting banner when the link drops', async () => {
      // Arrange
      const { client } = await renderOnline();

      // Act
      await client.update({ connection: 'reconnecting' });

      // Assert
      expect(screen.getByTestId('reconnecting-banner')).toHaveTextContent('Reconnecting…');
    });

    it('should hide the reconnecting banner when the link is back', async () => {
      // Arrange
      const { client } = await renderOnline({ connection: 'reconnecting' });

      // Act
      await client.update({ connection: 'online' });

      // Assert
      expect(screen.queryByTestId('reconnecting-banner')).not.toBeOnTheScreen();
    });

    it('should show the away banner when the server marks my seat away', async () => {
      // Arrange
      const { client } = await renderOnline();

      // Act
      await client.update({ players: withPlayer(0, { away: true }) });

      // Assert
      expect(screen.getByTestId('away-banner')).toBeOnTheScreen();
    });

    it("should tell the server I'm back when the away button is pressed", async () => {
      // Arrange
      const { client } = await renderOnline({ players: withPlayer(0, { away: true }) });

      // Act
      await fireEvent.press(screen.getByRole('button', { name: "I'm back" }));

      // Assert
      expect(client.back).toHaveBeenCalledTimes(1);
    });
  });

  describe('away auto-back', () => {
    it('should tell the server I am back when I press a hand card while away', async () => {
      // Arrange
      const { client } = await renderOnline({ players: withPlayer(0, { away: true }) });
      const [card] = client.getSnapshot().view.hand;

      // Act
      await fireEvent.press(screen.getByTestId(`card-${card!.id}`));

      // Assert
      expect(client.back).toHaveBeenCalledTimes(1);
    });

    it('should send back only once per away episode when several hand cards are pressed', async () => {
      // Arrange
      const { client } = await renderOnline({ players: withPlayer(0, { away: true }) });
      const [first, second] = client.getSnapshot().view.hand;
      await fireEvent.press(screen.getByTestId(`card-${first!.id}`));

      // Act
      await fireEvent.press(screen.getByTestId(`card-${second!.id}`));

      // Assert
      expect(client.back).toHaveBeenCalledTimes(1);
    });

    it('should send back again when a new away episode starts', async () => {
      // Arrange
      const { client } = await renderOnline({ players: withPlayer(0, { away: true }) });
      const [first, second] = client.getSnapshot().view.hand;
      await fireEvent.press(screen.getByTestId(`card-${first!.id}`));
      await client.update({ players: ONLINE_PLAYERS });
      await client.update({ players: withPlayer(0, { away: true }) });

      // Act
      await fireEvent.press(screen.getByTestId(`card-${second!.id}`));

      // Assert
      expect(client.back).toHaveBeenCalledTimes(2);
    });

    it('should not send back when a hand card is pressed while present', async () => {
      // Arrange
      const { client } = await renderOnline();
      const [card] = client.getSnapshot().view.hand;

      // Act
      await fireEvent.press(screen.getByTestId(`card-${card!.id}`));

      // Assert
      expect(client.back).not.toHaveBeenCalled();
    });

    it('should show the reason when telling the server I am back fails', async () => {
      // Arrange
      const { client } = await renderOnline({ players: withPlayer(0, { away: true }) });
      client.back.mockRejectedValueOnce(new Error('offline'));

      // Act
      await fireEvent.press(screen.getByTestId('away-back'));

      // Assert
      expect(screen.getByText("You're offline. Reconnecting…")).toBeOnTheScreen();
    });
  });

  describe('round summary', () => {
    const betweenView = between.view as unknown as PlayerView;

    it('should show a starting message before the next-round countdown has ticked', async () => {
      // Arrange
      const online = onlineInfo({ phase: 'between', nextRoundAt: Date.now() + 8_000 });

      // Act
      await renderOnline({ view: betweenView, log: [], online });

      // Assert
      expect(screen.getByTestId('next-round-countdown')).toHaveTextContent('Next round starting…');
    });

    it('should count down to the next round once the ticker runs', async () => {
      // Arrange
      await renderOnline({ view: betweenView, log: [], online: onlineInfo({ phase: 'between', nextRoundAt: Date.now() + 8_000 }) });

      // Act
      await advance(0);

      // Assert
      expect(screen.getByRole('timer')).toHaveTextContent('Next round in 8 s');
    });

    it('should keep counting down to the next round as time passes', async () => {
      // Arrange
      await renderOnline({ view: betweenView, log: [], online: onlineInfo({ phase: 'between', nextRoundAt: Date.now() + 8_000 }) });
      await advance(0);

      // Act
      await advance(3_000);

      // Assert
      expect(screen.getByTestId('next-round-countdown')).toHaveTextContent('Next round in 5 s');
    });

    it('should not offer a Next round button online', async () => {
      // Arrange
      const online = onlineInfo({ phase: 'between', nextRoundAt: Date.now() + 8_000 });

      // Act
      await renderOnline({ view: betweenView, log: [], online });

      // Assert
      expect(screen.queryByRole('button', { name: 'Next round' })).not.toBeOnTheScreen();
    });

    it('should keep the Next round button in an offline game', async () => {
      // Arrange
      const { connection: _connection, online: _online, turnDeadline: _deadline, ...offline } = playingSnapshot();
      const client = new FakeOnlineClient({ ...offline, view: betweenView, log: [] });
      await render(<GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />);

      // Act
      await fireEvent.press(screen.getByRole('button', { name: 'Next round' }));

      // Assert
      expect(client.nextRound).toHaveBeenCalledTimes(1);
    });
  });

  describe('errors', () => {
    it('should show the fatal error sheet when the client gives up on the table', async () => {
      // Arrange
      const { client } = await renderOnline();

      // Act
      await client.update({ online: onlineInfo({ lastError: { id: 1, code: 'match_ended', fatal: true } }) });

      // Assert
      expect(screen.getByRole('alert')).toHaveTextContent('This table has closed.');
    });

    it('should expose the fatal error message under its testID', async () => {
      // Arrange
      const online = onlineInfo({ lastError: { id: 1, code: 'table_full', fatal: true } });

      // Act
      await renderOnline({ online });

      // Assert
      expect(screen.getByTestId('online-error-message')).toHaveTextContent('That table filled up. Try another quick match.');
    });

    it('should leave the table from the fatal error sheet', async () => {
      // Arrange
      const { onExit } = await renderOnline({ online: onlineInfo({ lastError: { id: 1, code: 'match_ended', fatal: true } }) });

      // Act
      await fireEvent.press(screen.getByTestId('online-error-back'));

      // Assert
      expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('should not show the fatal sheet for a non-fatal rejection', async () => {
      // Arrange
      const { client } = await renderOnline();

      // Act
      await client.update({ online: onlineInfo({ lastError: { id: 1, code: 'not_your_turn', fatal: false } }) });

      // Assert
      expect(screen.queryByTestId('online-error')).not.toBeOnTheScreen();
    });

    it('should show a non-fatal rejection as a notice', async () => {
      // Arrange
      const { client } = await renderOnline();

      // Act
      await client.update({ online: onlineInfo({ lastError: { id: 1, code: 'not_your_turn', fatal: false } }) });

      // Assert
      expect(screen.getByText("It's not your turn.")).toBeOnTheScreen();
    });

    it('should clear a non-fatal notice after a few seconds', async () => {
      // Arrange
      const { client } = await renderOnline();
      await client.update({ online: onlineInfo({ lastError: { id: 1, code: 'not_your_turn', fatal: false } }) });

      // Act
      await advance(3_500);

      // Assert
      expect(screen.queryByText("It's not your turn.")).not.toBeOnTheScreen();
    });

    it('should not replay a non-fatal error that was already there when the table mounted', async () => {
      // Arrange
      const online = onlineInfo({ lastError: { id: 1, code: 'not_your_turn', fatal: false } });

      // Act
      await renderOnline({ online });

      // Assert
      expect(screen.queryByText("It's not your turn.")).not.toBeOnTheScreen();
    });
  });
});

describe('table invites', () => {
  const INVITE: TableInvite = {
    id: 'invite-1',
    fromUserId: 'user-amira',
    fromName: 'Amira',
    code: 'K7M2QX',
    sentAt: 0,
    expired: false,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    windowDimensions.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  function socialWithInvites(): SocialContextValue {
    return { ...sheetSocial(), state: { ...EMPTY_SOCIAL_STATE, invites: [INVITE] } };
  }

  /** The server's real game-over fixture, with the online seats and lifecycle the table reads. */
  function finishedSnapshot(): GameSnapshot {
    return {
      ...(finished as unknown as GameSnapshot),
      players: ONLINE_PLAYERS,
      connection: 'online',
      online: onlineInfo({ phase: 'finished' }),
      turnDeadline: null,
    };
  }

  async function renderWithInvites(snapshot: GameSnapshot): Promise<FakeOnlineClient> {
    const client = new FakeOnlineClient(snapshot);
    await render(
      <SocialContext.Provider value={socialWithInvites()}>
        <GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />
      </SocialContext.Provider>,
    );
    return client;
  }

  it('should show the invite badge on the table while a hand is in progress', async () => {
    // Arrange / Act
    await renderWithInvites(playingSnapshot());

    // Assert
    expect(screen.getByTestId('invite-badge')).toBeOnTheScreen();
  });

  it('should not render the invite banner over the table mid-hand', async () => {
    // Arrange / Act
    await renderWithInvites(playingSnapshot());

    // Assert
    expect(screen.queryByTestId('invite-banner')).not.toBeOnTheScreen();
  });

  it('should show the invite banner on the final summary after the game', async () => {
    // Arrange / Act
    await renderWithInvites(finishedSnapshot());

    // Assert
    expect(screen.getByTestId('invite-banner')).toBeOnTheScreen();
  });
});

/**
 * The player sheet at an online table: only another human with a user id gets
 * one. The friend list comes from a fake backend in SocialContext (the sheet
 * itself is covered in table/__tests__/PlayerSheet.test.tsx).
 */
const SHEET_PLAYERS: readonly SeatInfo[] = [
  { seat: 0, name: 'You', isBot: false, away: false, connected: true, userId: 'user-me' },
  { seat: 1, name: 'Amira', isBot: false, away: false, connected: true, userId: 'user-amira' },
  { seat: 2, name: 'Sonia', isBot: true, away: false, connected: true },
  { seat: 3, name: 'Mongi', isBot: false, away: false, connected: true, userId: 'user-mongi' },
];

/** An online client that also sends and receives emotes, so the emote keys and seat menus are live. */
class EmotingOnlineClient extends FakeOnlineClient {
  readonly emote = jest.fn();
  subscribeEmotes = (): (() => void) => () => undefined;
}

const EMPTY_FRIENDS: FriendsSnapshot = { friends: [], incoming: [], outgoing: [], blocked: [] };

function sheetSocial(): SocialContextValue {
  const friends: FriendsBackend = {
    list: jest.fn(async () => EMPTY_FRIENDS),
    recentPlayers: jest.fn(async () => []),
    lookupCode: jest.fn(async () => ({ ok: false as const, reason: 'not_found' as const })),
    add: jest.fn(async () => ({ ok: true as const })),
    remove: jest.fn(async () => ({ ok: true as const })),
    block: jest.fn(async () => ({ ok: true as const })),
    invite: jest.fn(async () => ({ ok: true as const, sent: true })),
  };
  return {
    state: EMPTY_SOCIAL_STATE,
    friends,
    ensureConnected: jest.fn(async () => true),
    refreshFriends: jest.fn(async () => undefined),
    dismissInvite: jest.fn(async () => undefined),
    setActivity: jest.fn(),
    presenceVisibility: 'everyone',
    setPresenceVisibility: jest.fn(async () => ({ ok: false as const, reason: 'network' as const })),
    handInProgress: false,
    setHandInProgress: jest.fn(),
    onEvent: jest.fn(() => () => undefined),
  };
}

async function settleSheet(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function renderSheetTable(players: readonly SeatInfo[] = SHEET_PLAYERS): Promise<EmotingOnlineClient> {
  const client = new EmotingOnlineClient({ ...playingSnapshot(), players });
  await render(
    <SocialContext.Provider value={sheetSocial()}>
      <GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />
    </SocialContext.Provider>,
  );
  await settleSheet();
  return client;
}

async function openSheetFor(seat: number): Promise<void> {
  await fireEvent.press(screen.getByTestId(`seat-${seat}-avatar`));
  await settleSheet();
}

type KeyListener = (e: KeyboardEvent) => void;

/**
 * A browser for the web-only keyboard hooks: Platform.OS is 'web' and window
 * gets a tiny keydown registry (capture listeners first, honouring
 * stopImmediatePropagation, like a real keydown on the document).
 * `restore` must run after the table unmounts (afterAll), since unmounting
 * removes the listeners.
 */
function installWebKeyboard(): { press: (key: string) => Promise<void>; restore: () => void } {
  const win = window as unknown as Record<string, unknown>;
  const saved = { add: win.addEventListener, remove: win.removeEventListener };
  const capture = new Set<KeyListener>();
  const bubble = new Set<KeyListener>();
  win.addEventListener = (type: string, listener: KeyListener, useCapture?: boolean) => {
    if (type === 'keydown') (useCapture ? capture : bubble).add(listener);
  };
  win.removeEventListener = (type: string, listener: KeyListener, useCapture?: boolean) => {
    if (type === 'keydown') (useCapture ? capture : bubble).delete(listener);
  };
  const press = async (key: string) => {
    await act(async () => {
      let stopped = false;
      const event = {
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        target: null,
        preventDefault: () => undefined,
        stopImmediatePropagation: () => {
          stopped = true;
        },
      } as unknown as KeyboardEvent;
      for (const listener of [...capture, ...bubble]) {
        if (stopped) break;
        listener(event);
      }
    });
  };
  const restore = () => {
    win.addEventListener = saved.add;
    win.removeEventListener = saved.remove;
  };
  return { press, restore };
}

describe('GameTable player sheet', () => {
  beforeEach(() => {
    windowDimensions.mockReturnValue({ width: 390, height: 844, scale: 2, fontScale: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('who gets a sheet', () => {
    it('should open the sheet when another human seat is tapped', async () => {
      // Arrange
      await renderSheetTable();

      // Act
      await openSheetFor(1);

      // Assert
      expect(screen.getByTestId('player-sheet')).toHaveTextContent(/Amira/);
    });

    it("should label another human's avatar as player options", async () => {
      // Arrange
      const players = SHEET_PLAYERS;

      // Act
      await renderSheetTable(players);

      // Assert
      expect(screen.getByTestId('seat-3-avatar')).toHaveAccessibleName('Mongi: player options');
    });

    it('should not open a sheet when a bot seat is tapped', async () => {
      // Arrange
      await renderSheetTable();

      // Act
      await openSheetFor(2);

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });

    it('should keep the emote menu label on a bot seat', async () => {
      // Arrange
      const players = SHEET_PLAYERS;

      // Act
      await renderSheetTable(players);

      // Assert
      expect(screen.getByTestId('seat-2-avatar')).toHaveAccessibleName('Sonia: emote options');
    });

    it('should not open a sheet for a human seat without a user id (empty or unknown seat)', async () => {
      // Arrange
      await renderSheetTable(SHEET_PLAYERS.map((p) => (p.seat === 1 ? { ...p, userId: undefined } : p)));

      // Act
      await openSheetFor(1);

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });

    it('should not open a sheet in an offline game', async () => {
      // Arrange
      const client = new LocalGameClient({ seed: 'ui', playerCount: 4, dealer: 3, rules: { cutCardChoice: false }, scheduler: noopScheduler });
      await render(<GameTable client={client} onNewGame={jest.fn()} onExit={jest.fn()} />);

      // Act
      await openSheetFor(1);

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });

    it('should close the sheet from its close button', async () => {
      // Arrange
      await renderSheetTable();
      await openSheetFor(1);

      // Act
      await fireEvent.press(screen.getByTestId('sheet-close'));

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });
  });

  describe('playerSheetTarget', () => {
    it('should target another human with a user id', () => {
      // Arrange
      const players = SHEET_PLAYERS;

      // Act
      const target = playerSheetTarget(players, 0, 1);

      // Assert
      expect(target).toEqual({ seat: 1, userId: 'user-amira', name: 'Amira' });
    });

    it('should have no target for my own seat', () => {
      // Arrange
      const players = SHEET_PLAYERS;

      // Act
      const target = playerSheetTarget(players, 0, 0);

      // Assert
      expect(target).toBeNull();
    });

    it('should have no target for a bot seat', () => {
      // Arrange
      const players = SHEET_PLAYERS;

      // Act
      const target = playerSheetTarget(players, 0, 2);

      // Assert
      expect(target).toBeNull();
    });

    it('should have no target for an empty seat', () => {
      // Arrange
      const players = SHEET_PLAYERS.slice(0, 2);

      // Act
      const target = playerSheetTarget(players, 0, 3);

      // Assert
      expect(target).toBeNull();
    });

    it('should have no target in an offline game where seats have no user id', () => {
      // Arrange
      const players = ONLINE_PLAYERS;

      // Act
      const target = playerSheetTarget(players, 0, 1);

      // Assert
      expect(target).toBeNull();
    });
  });

  describe('seat changes while open', () => {
    it('should close the sheet when another user takes the seat', async () => {
      // Arrange
      const client = await renderSheetTable();
      await openSheetFor(1);

      // Act
      await client.update({ players: SHEET_PLAYERS.map((p) => (p.seat === 1 ? { ...p, name: 'Karim', userId: 'user-karim' } : p)) });

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });

    it('should close the sheet when a bot takes the seat', async () => {
      // Arrange
      const client = await renderSheetTable();
      await openSheetFor(1);

      // Act
      await client.update({ players: SHEET_PLAYERS.map((p) => (p.seat === 1 ? { seat: 1, name: 'Bot', isBot: true, away: false, connected: true } : p)) });

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });

    it('should stay closed for the newcomer on later updates of the seat', async () => {
      // Arrange
      const client = await renderSheetTable();
      await openSheetFor(1);
      await client.update({ players: SHEET_PLAYERS.map((p) => (p.seat === 1 ? { ...p, name: 'Karim', userId: 'user-karim' } : p)) });

      // Act
      await client.update({ players: SHEET_PLAYERS.map((p) => (p.seat === 1 ? { ...p, name: 'Karim', userId: 'user-karim', away: true } : p)) });

      // Assert
      expect(screen.queryByTestId('player-sheet')).not.toBeOnTheScreen();
    });

    it('should keep the sheet open when the same player only disconnects', async () => {
      // Arrange
      const client = await renderSheetTable();
      await openSheetFor(1);

      // Act
      await client.update({ players: SHEET_PLAYERS.map((p) => (p.seat === 1 ? { ...p, connected: false } : p)) });

      // Assert
      expect(screen.getByTestId('player-sheet')).toBeOnTheScreen();
    });
  });

  describe('keyboard while the sheet is open (web)', () => {
    let keyboard: ReturnType<typeof installWebKeyboard>;

    beforeAll(() => {
      keyboard = installWebKeyboard();
    });

    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'web');
    });

    afterAll(() => {
      keyboard.restore();
    });

    it('should select a hand card with the arrow key when no sheet is open', async () => {
      // Arrange
      await renderSheetTable();

      // Act
      await keyboard.press('ArrowRight');

      // Assert
      expect(screen.getByTestId('table-mat')).toBeEnabled();
    });

    it('should ignore the arrow key while the sheet is open', async () => {
      // Arrange
      await renderSheetTable();
      await openSheetFor(1);

      // Act
      await keyboard.press('ArrowRight');

      // Assert
      expect(screen.getByTestId('table-mat')).toBeDisabled();
    });

    it('should not play a card with Enter while the sheet is open', async () => {
      // Arrange
      const client = await renderSheetTable();
      await openSheetFor(1);

      // Act
      for (let i = 0; i < 3; i++) {
        await keyboard.press('ArrowRight');
        await keyboard.press('Enter');
      }

      // Assert
      expect(client.play).not.toHaveBeenCalled();
    });

    it('should open the emote picker with E when no sheet is open', async () => {
      // Arrange
      await renderSheetTable();

      // Act
      await keyboard.press('e');

      // Assert
      expect(screen.getByTestId('emote-picker')).toBeOnTheScreen();
    });

    it('should ignore E while the sheet is open', async () => {
      // Arrange
      await renderSheetTable();
      await openSheetFor(1);

      // Act
      await keyboard.press('e');

      // Assert
      expect(screen.queryByTestId('emote-picker')).not.toBeOnTheScreen();
    });

    it('should take keys again once the sheet is closed', async () => {
      // Arrange
      await renderSheetTable();
      await openSheetFor(1);
      await fireEvent.press(screen.getByTestId('sheet-close'));

      // Act
      await keyboard.press('e');

      // Assert
      expect(screen.getByTestId('emote-picker')).toBeOnTheScreen();
    });
  });
});
