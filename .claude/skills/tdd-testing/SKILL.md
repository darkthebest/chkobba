---
name: tdd-testing
description: Implements Test-Driven Development workflows with Gherkin specifications and Jest test skeletons. Use when writing Gherkin feature files, creating TDD test skeletons, implementing code from test specs, following red-green-refactor cycles, or debugging Jest test failures.
category: testing
framework: [jest, gherkin]
---

# TDD Testing Skill

Expert in Test-Driven Development patterns, Gherkin specification writing, and Jest test implementation.

## When to Activate

Activate this skill when:

- Writing Gherkin feature specifications
- Creating Jest test skeletons for TDD
- Implementing code to satisfy existing tests
- Debugging failing tests
- Understanding test expectations
- Working with test fixtures and mocks

## Gherkin Best Practices

### Feature File Structure

```gherkin
# Always include metadata comments
# Feature: [Descriptive Name]
# Phase: [Phase Number] (if part of a plan)
# Module: [app/module path]

Feature: [User-Facing Feature Name]
  As a [role]
  I want [capability]
  So that [benefit]

  Background:
    # Common setup for all scenarios
    Given [shared precondition]

  @unit @phase-1
  Scenario: [Specific behavior - happy path]
    Given [precondition with specific values]
    And [additional context]
    When [single action taken]
    Then [observable outcome]
    And [additional verification]

  @unit @phase-1 @edge-case
  Scenario: [Edge case - boundary/limit]
    Given [boundary condition setup]
    When [action at boundary]
    Then [expected boundary behavior]

  @unit @phase-1 @error
  Scenario: [Error case - invalid input]
    Given [setup for error condition]
    When [action that should fail]
    Then [error should be thrown/returned]
    And [error should have specific message/code]

  @integration @phase-1
  Scenario: [Cross-service interaction]
    Given [service A state]
    And [service B state]
    When [action involving both]
    Then [integrated outcome]
```

### Gherkin Writing Guidelines

1. **Use concrete examples, not abstractions**

   ```gherkin
   # Bad - vague
   Given a user
   When they login
   Then they should be authenticated

   # Good - specific
   Given a user with email "test@example.com" and password "ValidP@ss123"
   When they submit login credentials
   Then they should receive a JWT token with 24-hour expiry
   ```

2. **One action per When clause**

   ```gherkin
   # Bad - multiple actions
   When they fill the form and submit it and wait for response

   # Good - single action
   When they submit the registration form
   ```

3. **Observable outcomes in Then clauses**

   ```gherkin
   # Bad - internal implementation
   Then the database should have a new record

   # Good - observable behavior
   Then they should receive a 201 Created response
   And the response should contain the new user ID
   ```

4. **Tag appropriately**
   - `@unit` - Isolated function/method tests
   - `@integration` - Service/database interaction tests
   - `@e2e` - Full system tests
   - `@phase-N` - Plan phase association
   - `@edge-case` - Boundary conditions
   - `@error` - Error handling scenarios
   - `@security` - Security-related tests
   - `@slow` - Tests that take longer to run

## Jest Test Patterns

<!-- @generated: testing-setup-patterns -->
**TDD Test Setup Patterns (Vitest for rules/server, jest-expo for mobile)**

This project uses two runners. The heading above says Jest, but only `apps/mobile` uses Jest (jest-expo preset + @testing-library/react-native). `packages/rules` and `apps/server` use **Vitest**: write `vi.fn()` / `vi.spyOn()` / `vi.restoreAllMocks()` there, and import test APIs explicitly from `'vitest'`. The generic examples later in this skill (`jest.spyOn`, `jest.clearAllMocks`, TypeORM database setup, `src/...` absolute imports) do not apply to rules/server; translate them to Vitest. There is no database or ORM in app code. Server data goes through mocked Nakama `nk` storage calls.

The project is greenfield, so the file names below are planned conventions. Glob first and follow the convention when creating new files.

### Gherkin to test mapping

| Gherkin | Test code |
| --- | --- |
| `Feature:` | top-level `describe('<unit name>')` + `@feature` header |
| `Background:` | `beforeEach` |
| `Scenario:` | `it('should <Then> when <When>')` |
| `Scenario Outline` + `Examples:` | `it.each([...])` with `$field` interpolation in the title |
| `Given` / `When` / `Then` | `// Arrange` / `// Act` / `// Assert` |
| Card setups like "table holds 3 of hearts and 4 of spades" | `cards('3H 4S')` from the rules fixtures |

**Red phase rule**: before writing a skeleton, create the exported function as a stub that throws `new Error('Not implemented')`. Then the file compiles and every test fails on its own assertion, not on a missing import.

### Skeleton: rules engine (Vitest, pure functions)

```typescript
/**
 * @feature Capture and chkobba resolution
 * @phase 1
 * @spec specs/rules/capture.feature
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { GameState } from './types';
import { playCard } from './engine';
import { buildState, card, cards } from './test/fixtures';

describe('playCard', () => {
  let state: GameState;

  beforeEach(() => {
    // Background: seat 0 to play, team 0 = seats 0 and 2
    state = buildState({ turn: 0, hands: { 0: cards('7D 2H') }, table: cards('3H 4S') });
  });

  it('should capture 3H and 4S when 7D is played on a table summing to 7', () => {
    // Arrange (Background is enough)

    // Act
    const next = playCard(state, 0, card('7D'));

    // Assert
    expect(next.captured[0]).toEqual(cards('3H 4S 7D'));
  });

  it('should record a chkobba for team 0 when the capture empties the table', () => {
    // Arrange (Background is enough)

    // Act
    const next = playCard(state, 0, card('7D'));

    // Assert
    expect(next.chkobbas[0]).toBe(1);
  });

  it('should leave 2H on the table when it matches no rank or sum', () => {
    // Arrange (Background is enough)

    // Act
    const next = playCard(state, 0, card('2H'));

    // Assert
    expect(next.table).toEqual(cards('3H 4S 2H'));
  });

  it('should throw when a seat plays out of turn', () => {
    // Arrange
    const outOfTurn = buildState({ turn: 1, hands: { 0: cards('7D') }, table: cards('3H') });

    // Act
    const act = () => playCard(outOfTurn, 0, card('7D'));

    // Assert
    expect(act).toThrow('Not your turn');
  });
});
```

The rules engine needs no mocks and no afterEach. Randomness (deal, bots) is injected: pass `createRng(<literal seed>)` from `./rng`.

### Skeleton: server match handler and RPC (Vitest, Nakama boundary mocked)

Match handlers and RPCs are the "controllers" of this project. Call them directly with doubles from `apps/server/src/test/nakamaMocks.ts`.

```typescript
/**
 * @feature Private tables
 * @phase 3
 * @spec specs/server/private-tables.feature
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { INVALID_ARGUMENT } from '../errors';
import { rpcCreatePrivateTable } from './privateTables';
import { createContext, createMockLogger, createMockNk } from '../test/nakamaMocks';

describe('rpcCreatePrivateTable', () => {
  let ctx: nkruntime.Context;
  let logger: ReturnType<typeof createMockLogger>;
  let nk: ReturnType<typeof createMockNk>;

  beforeEach(() => {
    ctx = createContext('host-user');
    logger = createMockLogger();
    nk = createMockNk();
    nk.matchCreate.mockReturnValue('match-private-1');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return the new match id when the host creates a private table', () => {
    // Arrange
    const payload = JSON.stringify({ invitees: ['friend-1'] });

    // Act
    const response = rpcCreatePrivateTable(ctx, logger, nk, payload);

    // Assert
    expect(JSON.parse(response)).toEqual({ matchId: 'match-private-1' });
  });

  it('should reject the request with INVALID_ARGUMENT when the payload is not JSON', () => {
    // Arrange
    let thrown: unknown;

    // Act
    try {
      rpcCreatePrivateTable(ctx, logger, nk, '{not json');
    } catch (error) {
      thrown = error;
    }

    // Assert
    expect(thrown).toMatchObject({ code: INVALID_ARGUMENT });
  });
});
```

Server TDD rules:

- Match-loop time is ticks. Write "after 15 seconds" scenarios as `matchLoop(..., BACKFILL_WAIT_TICKS + 1, state, [])`, never fake timers (the Nakama runtime has no `setTimeout`).
- Seed matches through `matchInit(ctx, logger, nk, { seed: '42' })`.
- Never reference `nkruntime.Codes` or any `nkruntime.*` value at runtime. The namespace is types-only and is undefined under Vitest. Error codes live in `apps/server/src/errors.ts`.
- Do not mock `@chkobba/rules`; the server test exercises the real engine.
- Hidden-information scenarios ("each player only sees their own hand") assert on the `presences` argument of `dispatcher.broadcastMessage.mock.calls`, filtered by `OpCode`.

### Skeleton: mobile component (Jest via jest-expo + RNTL)

```tsx
/**
 * @feature Playing a card from hand
 * @phase 1
 * @spec specs/mobile/hand.feature
 */
import { render, screen, userEvent } from '@testing-library/react-native';
import { cards } from '@chkobba/rules/test';
import { Hand } from '@/components/Hand';

jest.useFakeTimers();

describe('Hand', () => {
  const onPlayCard = jest.fn();

  beforeEach(() => {
    onPlayCard.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call onPlayCard with 7D when the player presses it on their turn', async () => {
    // Arrange
    const user = userEvent.setup();
    await render(<Hand cards={cards('7D 3H')} isMyTurn onPlayCard={onPlayCard} />);

    // Act
    await user.press(screen.getByRole('button', { name: '7 of diamonds' }));

    // Assert
    expect(onPlayCard).toHaveBeenCalledWith({ rank: 7, suit: 'diamonds' });
  });

  it('should not call onPlayCard when it is not the player turn', async () => {
    // Arrange
    const user = userEvent.setup();
    await render(<Hand cards={cards('7D')} isMyTurn={false} onPlayCard={onPlayCard} />);

    // Act
    await user.press(screen.getByRole('button', { name: '7 of diamonds' }));

    // Assert
    expect(onPlayCard).not.toHaveBeenCalled();
  });
});
```

Mobile TDD rules:

- Always `await render(...)`. Interact through `userEvent.setup()`, and query by role or label.
- Network goes through `@/services/nakama`; `jest.mock('@/services/nakama', () => ({ ... }))` in tests that need it.
- Navigation specs use `renderRouter` / `testRouter` / `toHavePathname` from `'expo-router/testing-library'`. Put those tests in `apps/mobile/src/__tests__/`, never in `apps/mobile/src/app/`.
<!-- @end: testing-setup-patterns -->

## TDD Implementation Guidelines

### Red-Green-Refactor Cycle

1. **Red**: Write a failing test first
   - Test should fail for the right reason
   - Test should clearly express expected behavior

2. **Green**: Write minimal code to pass
   - Don't over-engineer
   - Focus on making the test pass
   - Okay to hardcode initially

3. **Refactor**: Clean up while tests pass
   - Remove duplication
   - Improve naming
   - Extract abstractions if needed
   - Tests must stay green

### Implementation Order

For each test:

1. Read the test expectation carefully
2. Understand what the test needs
3. Write the simplest implementation
4. Run the test
5. If failing, analyze why
6. Adjust implementation (NOT the test)
7. Repeat until passing

### Common TDD Mistakes to Avoid

1. **Modifying tests to pass**

   ```typescript
   // WRONG - changing test to match broken code
   expect(result).toBe('wrong value'); // changed from 'correct value'

   // RIGHT - fix the implementation
   return 'correct value'; // in the actual code
   ```

2. **Testing implementation, not behavior**

   ```typescript
   // Bad - testing internal state
   expect(service['_internalCache'].size).toBe(1);

   // Good - testing observable behavior
   expect(service.getCachedValue('key')).toBe('value');
   ```

3. **Over-mocking**

   ```typescript
   // Bad - mocking the thing you're testing
   jest.spyOn(service, 'methodUnderTest').mockReturnValue('fake');

   // Good - mock dependencies only
   jest.spyOn(dependency, 'externalCall').mockReturnValue('fake');
   ```

## Test Fixtures and Factories

### Create Test Data Factories

```typescript
// test/factories/user.factory.ts
import { User } from 'src/entities/user.entity';

export const createMockUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  email: 'test@example.com',
  name: 'Test User',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

export const createMockUsers = (count: number): User[] => {
  return Array.from({ length: count }, (_, i) => createMockUser({ id: i + 1, email: `user${i + 1}@example.com` }));
};
```

### Test Database Setup (Integration Tests)

```typescript
// test/setup/test-database.ts
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export const testDatabaseModule = TypeOrmModule.forRoot({
  type: 'sqlite',
  database: ':memory:',
  entities: [
    /* entities */
  ],
  synchronize: true,
});

export const cleanDatabase = async (dataSource: DataSource) => {
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.clear();
  }
};
```

## Running Tests

<!-- @generated: app-scope-mapping -->
**Running Tests**

All commands run from the repo root (`/home/hamza/Projects/chkobba`). Root scripts fan out with `pnpm -r`:

```bash
pnpm test            # every package
pnpm test:coverage   # every package, with coverage thresholds enforced
pnpm lint
pnpm build           # includes the server goja bundle
```

| App | Package | Runner | Test files | Gherkin specs |
| --- | --- | --- | --- | --- |
| rules | `@chkobba/rules` | Vitest | `packages/rules/src/**/*.test.ts` | `specs/rules/*.feature` |
| server | `@chkobba/server` | Vitest | `apps/server/src/**/*.test.ts` | `specs/server/*.feature` |
| mobile | `@chkobba/mobile` | Jest (jest-expo) | `apps/mobile/src/**/*.test.tsx` (outside `src/app`), routes in `apps/mobile/src/__tests__/` | `specs/mobile/*.feature` |

**rules (Vitest)**

```bash
pnpm --filter @chkobba/rules test                                         # run once
pnpm --filter @chkobba/rules test:watch                                   # watch mode
pnpm --filter @chkobba/rules exec vitest run src/capture.test.ts          # single file
pnpm --filter @chkobba/rules exec vitest run src/capture.test.ts -t "chkobba"  # single test by name
pnpm --filter @chkobba/rules test:coverage
```

**server (Vitest)**

```bash
pnpm --filter @chkobba/server test
pnpm --filter @chkobba/server test:watch
pnpm --filter @chkobba/server exec vitest run src/match/chkobbaMatch.test.ts
pnpm --filter @chkobba/server test:coverage
pnpm --filter @chkobba/server build      # Green phase is not done until the goja bundle still builds
```

**mobile (Jest via jest-expo)**

```bash
pnpm --filter @chkobba/mobile test
pnpm --filter @chkobba/mobile test:watch
pnpm --filter @chkobba/mobile exec jest src/components/Hand.test.tsx
pnpm --filter @chkobba/mobile exec jest src/components/Hand.test.tsx -t "not the player turn"
pnpm --filter @chkobba/mobile test:coverage
```

**Package script convention** (create when scaffolding each package): Vitest packages use `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:coverage": "vitest run --coverage"`; mobile uses `"test": "jest"`, `"test:watch": "jest --watch"`, `"test:coverage": "jest --coverage"`.

**Coverage thresholds (planned)**:

- rules: 90% statements/branches/functions/lines, via `coverage.thresholds` in `packages/rules/vitest.config.ts`, provider v8. The engine is pure and drives scoring, so this is the strictest bar.
- server: 80%, via `apps/server/vitest.config.ts`, excluding `src/test/**`.
- mobile: 70%, via `coverageThreshold.global` in `apps/mobile/jest.config.js`.

**TDD red-phase check**: run the single new test file and confirm every test fails on its assertion or on `Not implemented`. A failure from a module-resolution or syntax error means the skeleton is wrong, not red.
<!-- @end: app-scope-mapping -->

## Debugging Failing Tests

### Common Issues and Solutions

1. **Async test timeout**

   ```typescript
   // Increase timeout for slow tests
   it('should handle slow operation', async () => {
     // ...
   }, 10000); // 10 second timeout
   ```

2. **Mock not being called**

   ```typescript
   // Ensure mock is set up BEFORE the action
   mockService.findOne.mockResolvedValue(mockData); // Setup first
   await service.doSomething(); // Action second
   ```

3. **State leaking between tests**

   ```typescript
   // Always clean up in afterEach
   afterEach(() => {
     jest.clearAllMocks();
     jest.resetModules();
   });
   ```

4. **Import path issues**
   ```typescript
   // Use consistent import paths
   import { Service } from 'src/modules/service'; // Absolute
   // NOT
   import { Service } from '../../../modules/service'; // Relative
   ```
