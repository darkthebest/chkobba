/**
 * `report_practice_game` (ADR-0005 section 5): folds one finished offline bot
 * game into the caller's own server-owned `player_stats/practice` record.
 *
 * The tests drive the RPC end to end through the fake Nakama boundary and
 * assert what a client can observe: the returned block, the stored record, the
 * exact write (collection/key and permission bits), and — for every refusal —
 * that no write happened. The clock is faked so `updatedAt` and the fixed
 * window are deterministic.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPETITIVE_STATS_KEY,
  PRACTICE_MAX_CHKOBBA_PER_GAME,
  PRACTICE_REPORT_LIMIT,
  PRACTICE_STATS_KEY,
  PRACTICE_WINDOW_MS,
  STATS_COLLECTION,
  type CompetitiveStats,
  type PracticeStats,
  type ReportPracticeGameResponse,
} from '@chkobba/protocol';
import { rpcReportPracticeGame } from '../reportPractice';
import {
  createContext,
  createFakeLogger,
  createFakeNk,
  createUnauthenticatedContext,
} from '../../__tests__/fakes';

const NOW = 1_700_000_000_000;
const USER = 'user-1';
/** One second into the first window: all reports in a fast sequence share it. */
const NEXT_MS = NOW + 1_000;

let nk: ReturnType<typeof createFakeNk>;
let logger: ReturnType<typeof createFakeLogger>;
let ctx: nkruntime.Context;

/** Calls the RPC with raw payload text (bad JSON included) and parses the success response. */
function reportRaw(payload: string): ReportPracticeGameResponse {
  return JSON.parse(rpcReportPracticeGame(ctx, logger, nk, payload)) as ReportPracticeGameResponse;
}

/** Calls the RPC with a JSON-encoded payload. */
function report(payload: unknown): ReportPracticeGameResponse {
  return reportRaw(JSON.stringify(payload));
}

/** What `fn` threw, or undefined when it returned normally. */
function thrownBy(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** Every storage key the RPC read or wrote, in call order. */
function storageRequests(): Array<{ collection: string; key: string }> {
  const requests: Array<{ collection: string; key: string }> = [];
  for (const [reads] of nk.storageRead.mock.calls) {
    for (const read of reads) requests.push(read);
  }
  for (const [writes] of nk.storageWrite.mock.calls) {
    for (const write of writes) requests.push(write);
  }
  return requests;
}

/** The write requests the RPC sent, flattened across calls. */
function writtenRequests(): nkruntime.StorageWriteRequest[] {
  const requests: nkruntime.StorageWriteRequest[] = [];
  for (const [writes] of nk.storageWrite.mock.calls) {
    for (const write of writes) requests.push(write);
  }
  return requests;
}

/** The stored practice record, as the fake memory store keeps it. */
function storedPractice(): Record<string, unknown> {
  return nk.fake.storedValue(STATS_COLLECTION, PRACTICE_STATS_KEY, USER) as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  logger = createFakeLogger();
  nk = createFakeNk();
  nk.fake.useMemoryStorage();
  ctx = createContext(USER);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('report_practice_game accumulation', () => {
  it('should record one game, the win and the chkobbas on the first report', () => {
    // Arrange (an empty record)
    const expected: PracticeStats = { games: 1, wins: 1, chkobbas: 3, updatedAt: NOW };

    // Act
    const response = report({ win: true, chkobbas: 3 });

    // Assert
    expect(response.practice).toEqual(expected);
  });

  it('should add the second report to games, wins and chkobbas', () => {
    // Arrange
    report({ win: true, chkobbas: 2 });

    // Act
    const response = report({ win: true, chkobbas: 5 });

    // Assert
    expect(response.practice).toEqual({ games: 2, wins: 2, chkobbas: 7, updatedAt: NOW });
  });

  it('should add a game and the chkobbas but leave wins alone after a loss', () => {
    // Arrange
    report({ win: true, chkobbas: 1 });

    // Act
    const response = report({ win: false, chkobbas: 2 });

    // Assert
    expect(response.practice).toEqual({ games: 2, wins: 1, chkobbas: 3, updatedAt: NOW });
  });

  it('should leave wins at zero when the very first report is a loss', () => {
    // Arrange (an empty record)

    // Act
    const response = report({ win: false, chkobbas: 0 });

    // Assert
    expect(response.practice).toEqual({ games: 1, wins: 0, chkobbas: 0, updatedAt: NOW });
  });
});

describe('report_practice_game chkobba clamping', () => {
  it('should floor a fractional chkobba count', () => {
    // Arrange (a buggy device sends a fraction)

    // Act
    const response = report({ win: true, chkobbas: 2.9 });

    // Assert
    expect(response.practice.chkobbas).toBe(2);
  });

  it('should store zero rather than a negative chkobba count', () => {
    // Arrange (a buggy device sends a negative count)

    // Act
    const response = report({ win: true, chkobbas: -4 });

    // Assert
    expect(response.practice.chkobbas).toBe(0);
  });

  it('should cap a chkobba count above the per-game maximum', () => {
    // Arrange
    const aboveCap = PRACTICE_MAX_CHKOBBA_PER_GAME + 10;

    // Act
    const response = report({ win: true, chkobbas: aboveCap });

    // Assert
    expect(response.practice.chkobbas).toBe(PRACTICE_MAX_CHKOBBA_PER_GAME);
  });

  it('should keep every stored counter an integer when the report is fractional', () => {
    // Arrange (a fractional count must not leak a fraction into the stored block)

    // Act
    report({ win: true, chkobbas: 3.7 });

    // Assert
    expect({
      counters: [storedPractice().games, storedPractice().wins, storedPractice().chkobbas],
      integers: [storedPractice().games, storedPractice().wins, storedPractice().chkobbas].every(
        (value) => typeof value === 'number' && Math.floor(value) === value,
      ),
    }).toEqual({ counters: [1, 1, 3], integers: true });
  });
});

describe('report_practice_game validation', () => {
  it.each([
    { scenario: 'the payload is not JSON', payload: '{not json' },
    { scenario: 'the payload is JSON null', payload: 'null' },
    { scenario: 'the payload is an array', payload: '[]' },
    { scenario: 'the payload is a bare string', payload: '"game"' },
    { scenario: 'the payload is a number', payload: '7' },
    { scenario: 'win is missing', payload: '{"chkobbas":2}' },
    { scenario: 'chkobbas is missing', payload: '{"win":true}' },
    { scenario: 'win is a number', payload: '{"win":1,"chkobbas":2}' },
    { scenario: 'win is a fraction', payload: '{"win":0.5,"chkobbas":2}' },
    { scenario: 'win is a string', payload: '{"win":"true","chkobbas":2}' },
    { scenario: 'chkobbas is a string', payload: '{"win":true,"chkobbas":"3"}' },
    { scenario: 'chkobbas is null', payload: '{"win":true,"chkobbas":null}' },
    { scenario: 'chkobbas is NaN', payload: '{"win":true,"chkobbas":NaN}' },
    { scenario: 'chkobbas is infinite', payload: '{"win":true,"chkobbas":1e999}' },
  ])('should reject the request with practice_bad_request (3) and write nothing when $scenario', ({ payload }) => {
    // Arrange (the malformed request)

    // Act
    const error = thrownBy(() => reportRaw(payload));

    // Assert
    expect({
      error,
      reads: nk.storageRead.mock.calls.length,
      writes: nk.storageWrite.mock.calls.length,
    }).toEqual({ error: { message: 'practice_bad_request', code: 3 }, reads: 0, writes: 0 });
  });
});

describe('report_practice_game fixed window', () => {
  /** Spends the whole window at NOW so the next report is over the limit. */
  function spendWindow(): void {
    for (let index = 0; index < PRACTICE_REPORT_LIMIT; index += 1) {
      report({ win: false, chkobbas: 0 });
    }
  }

  it('should accept exactly PRACTICE_REPORT_LIMIT reports in one window', () => {
    // Arrange (an empty record and a fixed clock)

    // Act
    let last: ReportPracticeGameResponse | null = null;
    for (let index = 0; index < PRACTICE_REPORT_LIMIT; index += 1) {
      last = report({ win: false, chkobbas: 0 });
    }

    // Assert
    expect(last?.practice.games).toBe(PRACTICE_REPORT_LIMIT);
  });

  it('should refuse the report after the limit with practice_rate_limited (8) and write nothing', () => {
    // Arrange
    spendWindow();
    const writesBefore = nk.storageWrite.mock.calls.length;

    // Act
    const error = thrownBy(() => report({ win: true, chkobbas: 1 }));

    // Assert
    expect({ error, writes: nk.storageWrite.mock.calls.length - writesBefore }).toEqual({
      error: { message: 'practice_rate_limited', code: 8 },
      writes: 0,
    });
  });

  it('should still refuse one millisecond before the window expires', () => {
    // Arrange
    spendWindow();

    // Act
    vi.setSystemTime(NOW + PRACTICE_WINDOW_MS - 1);
    const error = thrownBy(() => report({ win: true, chkobbas: 1 }));

    // Assert
    expect(error).toEqual({ message: 'practice_rate_limited', code: 8 });
  });

  it('should accept a report exactly PRACTICE_WINDOW_MS after the window started and restart the count', () => {
    // Arrange
    spendWindow();
    const expiresAt = NOW + PRACTICE_WINDOW_MS;

    // Act
    vi.setSystemTime(expiresAt);
    const response = report({ win: false, chkobbas: 0 });

    // Assert
    expect({
      games: response.practice.games,
      windowStart: storedPractice().windowStart,
      windowReports: storedPractice().windowReports,
    }).toEqual({ games: PRACTICE_REPORT_LIMIT + 1, windowStart: expiresAt, windowReports: 1 });
  });
});

describe('report_practice_game authentication', () => {
  it('should throw UNAUTHENTICATED (16) and touch no storage when there is no user', () => {
    // Arrange (an RPC called with only the http key)

    // Act
    const error = thrownBy(() =>
      rpcReportPracticeGame(createUnauthenticatedContext(), logger, nk, '{"win":true,"chkobbas":1}'),
    );

    // Assert
    expect({
      code: (error as { code?: unknown } | undefined)?.code,
      reads: nk.storageRead.mock.calls.length,
      writes: nk.storageWrite.mock.calls.length,
    }).toEqual({ code: 16, reads: 0, writes: 0 });
  });
});

describe('report_practice_game storage faults', () => {
  it('should answer practice_storage_error (13), log the read fault and write nothing', () => {
    // Arrange
    nk.fake.failStorageReads();

    // Act
    const error = thrownBy(() => report({ win: true, chkobbas: 1 }));

    // Assert
    expect({ error, warned: logger.warn.mock.calls.length, writes: nk.storageWrite.mock.calls.length }).toEqual({
      error: { message: 'practice_storage_error', code: 13 },
      warned: 1,
      writes: 0,
    });
  });

  it('should answer practice_storage_error (13) and log the write fault rather than the raw error', () => {
    // Arrange
    nk.fake.failStorageWrites();

    // Act
    const error = thrownBy(() => report({ win: true, chkobbas: 1 }));

    // Assert
    expect({ error, warned: logger.warn.mock.calls.length }).toEqual({
      error: { message: 'practice_storage_error', code: 13 },
      warned: 1,
    });
  });

  it.each([
    { scenario: 'a non-object value', value: 'not a record' },
    { scenario: 'an object with malformed counters', value: { games: 'many', wins: -1, chkobbas: 2.5, updatedAt: 'now' } },
  ])('should degrade $scenario to a zero block before folding the report', ({ value }) => {
    // Arrange
    nk.fake.seedStorage(STATS_COLLECTION, PRACTICE_STATS_KEY, USER, value);

    // Act
    const response = report({ win: true, chkobbas: 2 });

    // Assert
    expect(response.practice).toEqual({ games: 1, wins: 1, chkobbas: 2, updatedAt: NOW });
  });
});

describe('report_practice_game record ownership', () => {
  it('should write player_stats/practice server-owned (read 0 / write 0)', () => {
    // Arrange (an empty record)

    // Act
    report({ win: true, chkobbas: 2 });

    // Assert
    expect(writtenRequests()).toEqual([
      {
        collection: STATS_COLLECTION,
        key: PRACTICE_STATS_KEY,
        userId: USER,
        value: { games: 1, wins: 1, chkobbas: 2, updatedAt: NOW, windowStart: NOW, windowReports: 1 },
        permissionRead: 0,
        permissionWrite: 0,
      },
    ]);
  });

  it('should make exactly one read and one write per accepted report', () => {
    // Arrange (an empty record)

    // Act
    report({ win: true, chkobbas: 2 });

    // Assert
    expect({ reads: nk.storageRead.mock.calls.length, writes: nk.storageWrite.mock.calls.length }).toEqual({
      reads: 1,
      writes: 1,
    });
  });

  it('should respond with exactly the four public fields, without the window state', () => {
    // Arrange (an empty record)

    // Act
    const response = report({ win: true, chkobbas: 2 });

    // Assert
    expect({ top: Object.keys(response), block: Object.keys(response.practice).sort() }).toEqual({
      top: ['practice'],
      block: ['chkobbas', 'games', 'updatedAt', 'wins'],
    });
  });

  it('should never read or write the competitive record', () => {
    // Arrange
    const competitive: CompetitiveStats = {
      games: 9,
      wins: 4,
      chkobbas: 6,
      currentStreak: 1,
      bestStreak: 3,
      updatedAt: NOW - 5_000,
    };
    nk.fake.seedStorage(STATS_COLLECTION, COMPETITIVE_STATS_KEY, USER, competitive);

    // Act
    report({ win: true, chkobbas: 2 });

    // Assert
    expect({
      touched: storageRequests().map((request) => `${request.collection}/${request.key}`),
      competitive: nk.fake.storedValue(STATS_COLLECTION, COMPETITIVE_STATS_KEY, USER),
    }).toEqual({
      touched: [`${STATS_COLLECTION}/${PRACTICE_STATS_KEY}`, `${STATS_COLLECTION}/${PRACTICE_STATS_KEY}`],
      competitive,
    });
  });

  it('should stamp updatedAt with the server clock of the report', () => {
    // Arrange (an empty record)

    // Act
    vi.setSystemTime(NEXT_MS);
    const response = report({ win: true, chkobbas: 0 });

    // Assert
    expect(response.practice.updatedAt).toBe(NEXT_MS);
  });
});
