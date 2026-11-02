import { LocalGameClient, type Scheduler } from '../LocalGameClient';

/** Collects scheduled bot turns so tests can run them one at a time. */
function manualScheduler() {
  const queue: (() => void)[] = [];
  const scheduler: Scheduler = (fn) => {
    queue.push(fn);
    return () => {
      const i = queue.indexOf(fn);
      if (i !== -1) queue.splice(i, 1);
    };
  };
  return {
    scheduler,
    pending: () => queue.length,
    runNext: () => queue.shift()?.(),
  };
}

/** Seat 3 deals, so the human (seat 0) cuts and leads. The cut is off unless a test turns it on. */
function newClient(seed = 'test', cutCardChoice = false) {
  const timers = manualScheduler();
  const client = new LocalGameClient({
    seed,
    playerCount: 4,
    dealer: 3,
    rules: { cutCardChoice },
    scheduler: timers.scheduler,
  });
  return { client, timers };
}

describe('LocalGameClient', () => {
  it('exposes only the human seat’s view', () => {
    const { client } = newClient();
    const { view, players } = client.getSnapshot();
    expect(view.seat).toBe(0);
    expect(view.hand).toHaveLength(3);
    expect(view).not.toHaveProperty('hands');
    expect(players.map((p) => p.isBot)).toEqual([false, true, true, true]);
  });

  it('lets the human play on their turn and then schedules the next bot', async () => {
    const { client, timers } = newClient();
    client.start();
    expect(timers.pending()).toBe(0); // seat 0 leads (dealer is seat 3)

    const listener = jest.fn();
    client.subscribe(listener);
    const move = client.getSnapshot().view.legalMoves[0]!;
    await client.play(move.cardId, move.capture);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(client.getSnapshot().view.hand).toHaveLength(2);
    expect(client.getSnapshot().view.turn).toBe(1);
    expect(timers.pending()).toBe(1);
  });

  it('runs bot turns until it is the human’s turn again', async () => {
    const { client, timers } = newClient();
    client.start();
    const move = client.getSnapshot().view.legalMoves[0]!;
    await client.play(move.cardId, move.capture);

    timers.runNext();
    timers.runNext();
    timers.runNext();
    expect(client.getSnapshot().view.turn).toBe(0);
    expect(timers.pending()).toBe(0);
    expect(client.getSnapshot().log.filter((e) => e.event.type === 'cardPlayed')).toHaveLength(4);
  });

  it('rejects illegal plays without changing state', async () => {
    const { client } = newClient();
    const before = client.getSnapshot();
    await expect(client.play('KD', [])).rejects.toThrow();
    expect(client.getSnapshot()).toBe(before);
  });

  it('numbers log entries so new events can be detected', async () => {
    const { client } = newClient();
    const before = client.getSnapshot().log;
    const move = client.getSnapshot().view.legalMoves[0]!;
    await client.play(move.cardId, move.capture);
    const after = client.getSnapshot().log;
    expect(after[after.length - 1]!.seq).toBeGreaterThan(before[before.length - 1]!.seq);
    expect(after.map((e) => e.seq)).toEqual([...after.map((e) => e.seq)].sort((a, b) => a - b));
  });

  it('cancels pending bot turns on stop and resumes on start', async () => {
    const { client, timers } = newClient();
    client.start();
    const move = client.getSnapshot().view.legalMoves[0]!;
    await client.play(move.cardId, move.capture);
    expect(timers.pending()).toBe(1);

    client.stop();
    expect(timers.pending()).toBe(0);
    client.start();
    expect(timers.pending()).toBe(1);
  });

  it('lets the human cut and keep the cut card', async () => {
    const { client, timers } = newClient('cut', true);
    client.start();
    const { view } = client.getSnapshot();
    expect(view.phase).toBe('cutting');
    expect(view.cut?.seat).toBe(0);
    const cutCard = view.cut!.card!;
    expect(timers.pending()).toBe(0); // waiting for the human, not a bot

    await client.cut(true);
    const after = client.getSnapshot().view;
    expect(after.phase).toBe('playing');
    expect(after.hand.map((c) => c.id)).toContain(cutCard.id);
    expect(after.turn).toBe(0);
  });

  it('lets bots make their own cut', () => {
    const timers = manualScheduler();
    const client = new LocalGameClient({ seed: 'botcut', playerCount: 4, dealer: 0, scheduler: timers.scheduler });
    client.start();
    expect(client.getSnapshot().view.cut?.seat).toBe(1);
    expect(client.getSnapshot().view.cut?.card).toBeNull(); // the human cannot see a bot's cut card
    timers.runNext();
    expect(client.getSnapshot().view.phase).toBe('playing');
    expect(client.getSnapshot().log.some((e) => e.event.type === 'cutResolved')).toBe(true);
  });

  it('draws for the first dealer when none is given', () => {
    const client = new LocalGameClient({ seed: 'draw', playerCount: 4, scheduler: manualScheduler().scheduler });
    const first = client.getSnapshot().log[0]!.event;
    expect(first.type).toBe('dealerDrawn');
    if (first.type === 'dealerDrawn') expect(client.getSnapshot().view.dealer).toBe(first.dealer);
  });

  it('plays a whole game to the end with the human always taking the first legal move', async () => {
    const { client, timers } = newClient('full-game', true);
    client.start();
    for (let steps = 0; steps < 5000; steps++) {
      const { view } = client.getSnapshot();
      if (view.phase === 'gameOver') break;
      if (view.phase === 'roundOver') await client.nextRound();
      else if (view.phase === 'cutting' && view.turn === 0) await client.cut(false);
      else if (view.turn === 0) {
        const move = view.legalMoves[0]!;
        await client.play(move.cardId, move.capture);
      } else timers.runNext();
    }
    const { view } = client.getSnapshot();
    expect(view.phase).toBe('gameOver');
    expect(view.winner).not.toBeNull();
  });
});

describe('LocalGameClient emotes', () => {
  /** Human leads (seat 3 deals), so no bot turn is queued until we play. */
  function emoteClient(random: () => number, botEmotes = true) {
    const timers = manualScheduler();
    const client = new LocalGameClient({
      seed: 'emotes',
      playerCount: 4,
      dealer: 3,
      rules: { cutCardChoice: false },
      scheduler: timers.scheduler,
      botEmotes,
      random,
    });
    const heard = jest.fn();
    client.subscribeEmotes(heard);
    client.start();
    return { client, timers, heard };
  }

  it('should let a bot answer our emote when the reply roll succeeds', () => {
    // Arrange
    const { client, timers, heard } = emoteClient(() => 0);

    // Act
    client.emote('yalla');
    timers.runNext();

    // Assert
    expect(heard).toHaveBeenCalledWith({ seat: 1, id: 'chwaya' });
  });

  it('should stay quiet when the reply roll fails', () => {
    // Arrange
    const { client, timers } = emoteClient(() => 0.99);

    // Act
    client.emote('yalla');

    // Assert
    expect(timers.pending()).toBe(0);
  });

  it('should never emote when bot emotes are off', () => {
    // Arrange
    const { client, timers } = emoteClient(() => 0, false);

    // Act
    client.emote('yalla');

    // Assert
    expect(timers.pending()).toBe(0);
  });

  it('should default bot emotes to off when a test injects its scheduler', () => {
    // Arrange
    const timers = manualScheduler();
    const client = new LocalGameClient({ seed: 'emotes', playerCount: 4, dealer: 3, rules: { cutCardChoice: false }, scheduler: timers.scheduler, random: () => 0 });
    client.start();

    // Act
    client.emote('yalla');

    // Assert
    expect(timers.pending()).toBe(0);
  });

  it('should cancel a pending bot emote on stop', () => {
    // Arrange
    const { client, timers, heard } = emoteClient(() => 0);
    client.emote('laugh');

    // Act
    client.stop();

    // Assert
    expect({ pending: timers.pending(), heard: heard.mock.calls.length }).toEqual({ pending: 0, heard: 0 });
  });
});
