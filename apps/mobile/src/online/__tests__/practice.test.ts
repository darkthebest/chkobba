/**
 * Practice reporting over nakama-js (ADR-0005): one finished offline bot game
 * is folded into the player's server-owned practice block. Practice is
 * display-only, so the contract the tests pin is: no account is created for an
 * offline game, only two fields go on the wire, a bad local count is clamped,
 * and every failure — no session, a rejected lookup, a rate limit, an
 * unreadable body — is dropped silently instead of surfacing in the UI.
 */
import { Session, type RpcResponse } from '@heroiclabs/nakama-js';

import { PRACTICE_MAX_CHKOBBA_PER_GAME, type PracticeStats } from '@chkobba/protocol';

import {
  clampPracticeChkobbas,
  createPracticeReporter,
  practiceResultFor,
  practiceStatsFromPayload,
  type PracticeClient,
} from '../practice';

const NOW_MS = 1_800_000_000_000;

/** A real nakama-js Session whose JWT carries `uid`. */
function makeSession(): Session {
  const claims = btoa(JSON.stringify({ uid: 'user-1', exp: NOW_MS / 1000 + 3600 }));
  return new Session(`h.${claims}.s`, `h.${claims}.s`, false);
}

/** A nakama-js rejection: the fetch Response with the server's JSON body. */
function responseError(status: number, body: unknown) {
  return { status, statusText: `HTTP ${status}`, json: async () => body };
}

function fakeClient() {
  const rpc = jest.fn(async (_session: Session, _id: string, _input: object): Promise<RpcResponse> => ({ payload: {} }));
  return { rpc } satisfies PracticeClient;
}

function createHarness() {
  const session = makeSession();
  const resume = jest.fn(async (): Promise<{ session: Session } | null> => ({ session }));
  const client = fakeClient();
  const reporter = createPracticeReporter({ client, resume });
  return { reporter, client, resume, session };
}

const PRACTICE: PracticeStats = { games: 4, wins: 2, chkobbas: 3, updatedAt: NOW_MS };

afterEach(() => {
  jest.clearAllMocks();
});

describe('practiceResultFor', () => {
  it.each([
    { seat: 0, won: false, chkobbas: 2 },
    { seat: 1, won: true, chkobbas: 5 },
    { seat: 2, won: false, chkobbas: 2 },
    { seat: 3, won: true, chkobbas: 5 },
  ])("should give seat $seat its team's outcome and sweep count", ({ seat, won, chkobbas }) => {
    // Arrange (team 1 won; the two teams' sweep counts differ so the index is visible)
    const view = { seat, winner: 1 as const, chkobbas: [2, 5] as const };

    // Act
    const result = practiceResultFor(view);

    // Assert
    expect(result).toEqual({ won, chkobbas });
  });

  it('should be null while the game has no winner', () => {
    // Arrange
    const undecided = { seat: 0, winner: null, chkobbas: [2, 5] as const };

    // Act
    const result = practiceResultFor(undecided);

    // Assert
    expect(result).toBeNull();
  });
});

describe('clampPracticeChkobbas', () => {
  it.each([
    { scenario: 'a fraction', chkobbas: 4.9, expected: 4 },
    { scenario: 'a negative count', chkobbas: -3.2, expected: 0 },
    { scenario: 'zero', chkobbas: 0, expected: 0 },
    { scenario: 'the per-game maximum', chkobbas: PRACTICE_MAX_CHKOBBA_PER_GAME, expected: PRACTICE_MAX_CHKOBBA_PER_GAME },
    {
      scenario: 'a count above the per-game maximum',
      chkobbas: PRACTICE_MAX_CHKOBBA_PER_GAME + 10,
      expected: PRACTICE_MAX_CHKOBBA_PER_GAME,
    },
    { scenario: 'NaN', chkobbas: NaN, expected: 0 },
    { scenario: 'Infinity', chkobbas: Infinity, expected: 0 },
    { scenario: '-Infinity', chkobbas: -Infinity, expected: 0 },
  ])('should read $scenario as $expected', ({ chkobbas, expected }) => {
    // Arrange (the reported count)

    // Act
    const clamped = clampPracticeChkobbas(chkobbas);

    // Assert
    expect(clamped).toBe(expected);
  });
});

describe('createPracticeReporter session gate', () => {
  it('should never call the RPC when there is no stored session', async () => {
    // Arrange
    const t = createHarness();
    t.resume.mockResolvedValueOnce(null);

    // Act
    const result = await t.reporter({ won: true, chkobbas: 1 });

    // Assert
    expect({ result, requests: t.client.rpc.mock.calls.length }).toEqual({ result: null, requests: 0 });
  });

  it('should resolve null without calling the RPC when resuming the session rejects', async () => {
    // Arrange
    const t = createHarness();
    t.resume.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    // Act
    const result = await t.reporter({ won: true, chkobbas: 1 });

    // Assert
    expect({ result, requests: t.client.rpc.mock.calls.length }).toEqual({ result: null, requests: 0 });
  });
});

describe('createPracticeReporter request', () => {
  it('should send exactly { win, chkobbas } with the sweep count clamped', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValueOnce({ payload: { practice: PRACTICE } });

    // Act
    await t.reporter({ won: true, chkobbas: 4.9 });

    // Assert
    expect(t.client.rpc.mock.calls[0]?.[2]).toEqual({ win: true, chkobbas: 4 });
  });

  it('should send win false when the player lost', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValueOnce({ payload: { practice: PRACTICE } });

    // Act
    await t.reporter({ won: false, chkobbas: 0 });

    // Assert
    expect(t.client.rpc.mock.calls[0]?.[2]).toEqual({ win: false, chkobbas: 0 });
  });

  it('should return the parsed practice block from a successful report', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValueOnce({ payload: { practice: PRACTICE } });

    // Act
    const result = await t.reporter({ won: true, chkobbas: 1 });

    // Assert
    expect(result).toEqual(PRACTICE);
  });
});

describe('createPracticeReporter failure silence', () => {
  it('should resolve null when the RPC rejects with a network error', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    // Act
    const result = await t.reporter({ won: true, chkobbas: 1 });

    // Assert
    expect(result).toBeNull();
  });

  it('should resolve null when the RPC rejects with a rate-limit body', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockRejectedValueOnce(responseError(429, { code: 8, message: 'practice_rate_limited' }));

    // Act
    const result = await t.reporter({ won: true, chkobbas: 1 });

    // Assert
    expect(result).toBeNull();
  });

  it('should resolve null when the response body cannot be read', async () => {
    // Arrange
    const t = createHarness();
    const unreadable = {} as RpcResponse;
    Object.defineProperty(unreadable, 'payload', {
      get: () => {
        throw new SyntaxError('bad body');
      },
    });
    t.client.rpc.mockResolvedValueOnce(unreadable);

    // Act
    const result = await t.reporter({ won: true, chkobbas: 1 });

    // Assert
    expect(result).toBeNull();
  });

  it('should resolve null when the success envelope is malformed', async () => {
    // Arrange
    const t = createHarness();
    t.client.rpc.mockResolvedValueOnce({ payload: { practice: { games: 1 } } });

    // Act
    const result = await t.reporter({ won: true, chkobbas: 1 });

    // Assert
    expect(result).toBeNull();
  });
});

describe('practiceStatsFromPayload', () => {
  it('should map a well-formed practice block', () => {
    // Arrange
    const payload = { practice: PRACTICE };

    // Act
    const stats = practiceStatsFromPayload(payload);

    // Assert
    expect(stats).toEqual(PRACTICE);
  });

  it.each([
    { scenario: 'a null payload', payload: null },
    { scenario: 'an array payload', payload: [] },
    { scenario: 'a payload without practice', payload: {} },
    { scenario: 'a null practice block', payload: { practice: null } },
    { scenario: 'an array practice block', payload: { practice: [] } },
    { scenario: 'a practice block missing a field', payload: { practice: { games: 1, wins: 1, chkobbas: 1 } } },
    { scenario: 'a string game count', payload: { practice: { games: '1', wins: 1, chkobbas: 1, updatedAt: 1 } } },
    { scenario: 'a negative win count', payload: { practice: { games: 1, wins: -1, chkobbas: 1, updatedAt: 1 } } },
    { scenario: 'a NaN sweep count', payload: { practice: { games: 1, wins: 1, chkobbas: NaN, updatedAt: 1 } } },
    { scenario: 'a string timestamp', payload: { practice: { games: 1, wins: 1, chkobbas: 1, updatedAt: 'now' } } },
  ])('should return null for $scenario', ({ payload }) => {
    // Arrange (the malformed response)

    // Act
    const stats = practiceStatsFromPayload(payload);

    // Assert
    expect(stats).toBeNull();
  });
});
