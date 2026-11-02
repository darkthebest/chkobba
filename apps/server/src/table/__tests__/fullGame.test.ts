import { describe, it, expect } from 'vitest';
import { OpCode } from '@chkobba/protocol';
import { legalMoves } from '@chkobba/rules';
import { createTable, intent, join, nextWakeAt, tick, type Joiner, type TableState } from '../index';

const NOW = 3_000_000;
const SEED = 'full-game-seed';
const MAX_STEPS = 20000;
const HUMANS: readonly Joiner[] = [0, 1, 2, 3].map((i) => ({
  userId: `user-${i}`,
  sessionId: `session-${i}`,
  name: `Player ${i}`,
}));

/** Seats the first `count` humans in order, so HUMANS[i] holds seat i. */
function seatHumans(count: number, seed: string): TableState {
  let state = createTable({ now: NOW, seed });
  for (let i = 0; i < count; i++) {
    const joined = join(state, HUMANS[i]!, NOW);
    if (!joined.ok) throw new Error(`join failed: ${joined.error}`);
    state = joined.state;
  }
  return state;
}

interface Run {
  readonly final: TableState;
  readonly steps: number;
}

/** Two humans who never act: backfill, timeouts and bot turns all come from `tick`. */
function runIdleHumans(seed: string): Run {
  let state = seatHumans(2, seed);
  let steps = 0;
  while (state.phase !== 'finished' && steps < MAX_STEPS) {
    const wake = nextWakeAt(state);
    if (wake === null) throw new Error(`${seed}: table stalled in ${state.phase}`);
    state = tick(state, wake);
    steps++;
  }
  return { final: state, steps };
}

/**
 * Four humans who answer every cut and play every turn through `intent`
 * (alternating keep/throw, moves picked by a step counter); `tick` only starts
 * the next round.
 */
function runActiveHumans(seed: string): Run {
  let state = seatHumans(4, seed);
  let now = NOW;
  let steps = 0;
  while (state.phase !== 'finished' && steps < MAX_STEPS) {
    const game = state.game;
    if (state.phase === 'playing' && game && (game.phase === 'cutting' || game.phase === 'playing')) {
      const human = HUMANS[game.turn]!;
      const from = { userId: human.userId, sessionId: human.sessionId };
      const moves = legalMoves(game);
      const result =
        game.phase === 'cutting'
          ? intent(state, from, OpCode.CUT, { keep: steps % 2 === 0 }, now)
          : intent(state, from, OpCode.PLAY, moves[steps % moves.length], now);
      if (!result.ok) throw new Error(`${seed}: intent rejected with ${result.error} at step ${steps}`);
      state = result.state;
      now += 500;
    } else {
      const wake = nextWakeAt(state);
      if (wake === null) throw new Error(`${seed}: table stalled in ${state.phase}`);
      now = wake;
      state = tick(state, now);
    }
    steps++;
  }
  return { final: state, steps };
}

describe('full game', () => {
  describe('two idle humans with bot backfill driven only by tick', () => {
    it('should reach the finished phase', () => {
      // Arrange
      const seed = SEED;

      // Act
      const { final } = runIdleHumans(seed);

      // Assert
      expect(final.phase).toBe('finished');
    });

    it('should end with a winner and a finish time', () => {
      // Arrange
      const seed = SEED;

      // Act
      const { final } = runIdleHumans(seed);

      // Assert
      expect({ winner: final.game?.winner !== null, finishedAt: final.finishedAt !== null, gameOver: final.game?.phase }).toEqual({
        winner: true,
        finishedAt: true,
        gameOver: 'gameOver',
      });
    });

    it('should mark both idle humans away by the end of the game', () => {
      // Arrange
      const seed = SEED;

      // Act
      const { final } = runIdleHumans(seed);

      // Assert
      expect(final.seats.map((s) => (s && s.kind === 'human' ? s.away : 'bot'))).toEqual([true, true, 'bot', 'bot']);
    });

    it('should produce the same final table twice for a fixed seed', () => {
      // Arrange
      const first = runIdleHumans(SEED);

      // Act
      const second = runIdleHumans(SEED);

      // Assert
      expect(second).toEqual(first);
    });

    it('should play a different game for a different seed', () => {
      // Arrange
      const first = runIdleHumans(SEED);

      // Act
      const other = runIdleHumans(`${SEED}-other`);

      // Assert
      expect(JSON.stringify(other.final.log)).not.toBe(JSON.stringify(first.final.log));
    });

    it('should number every log entry consecutively from 1', () => {
      // Arrange
      const seed = SEED;

      // Act
      const { final } = runIdleHumans(seed);

      // Assert
      expect(final.log.map((e) => e.seq)).toEqual(final.log.map((_, i) => i + 1));
    });

    it('should schedule nothing and return the same object once finished', () => {
      // Arrange
      const { final } = runIdleHumans(SEED);

      // Act
      const after = tick(final, (final.finishedAt ?? NOW) + 1_000_000);

      // Assert
      expect({ same: after === final, wake: nextWakeAt(final) }).toEqual({ same: true, wake: null });
    });

    it.each(['seed-1', 'seed-2', 'seed-3', 'seed-4', 'seed-5'])('should finish for seed %s', (seed) => {
      // Arrange
      const run = () => runIdleHumans(seed);

      // Act
      const { final } = run();

      // Assert
      expect(final.phase).toBe('finished');
    });
  });

  describe('four humans playing legal moves via intent', () => {
    it('should reach the finished phase', () => {
      // Arrange
      const seed = SEED;

      // Act
      const { final } = runActiveHumans(seed);

      // Assert
      expect(final.phase).toBe('finished');
    });

    it('should never let a timeout fire because every human acted in time', () => {
      // Arrange
      const seed = SEED;

      // Act
      const { final } = runActiveHumans(seed);

      // Assert
      expect(final.seats.map((s) => (s && s.kind === 'human' ? { missed: s.missed, away: s.away } : null))).toEqual(
        [0, 1, 2, 3].map(() => ({ missed: 0, away: false })),
      );
    });

    it('should produce the same final table twice for a fixed seed', () => {
      // Arrange
      const first = runActiveHumans(SEED);

      // Act
      const second = runActiveHumans(SEED);

      // Assert
      expect(second).toEqual(first);
    });

    it('should number every log entry consecutively from 1', () => {
      // Arrange
      const seed = SEED;

      // Act
      const { final } = runActiveHumans(seed);

      // Assert
      expect(final.log.map((e) => e.seq)).toEqual(final.log.map((_, i) => i + 1));
    });

    it('should log the end of the game as the last event', () => {
      // Arrange
      const seed = SEED;

      // Act
      const { final } = runActiveHumans(seed);

      // Assert
      expect(final.log[final.log.length - 1]?.event.type).toBe('gameEnded');
    });

    it.each(['seed-1', 'seed-2', 'seed-3'])('should finish for seed %s', (seed) => {
      // Arrange
      const run = () => runActiveHumans(seed);

      // Act
      const { final } = run();

      // Assert
      expect(final.phase).toBe('finished');
    });
  });
});
