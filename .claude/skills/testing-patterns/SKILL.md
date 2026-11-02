---
name: testing-patterns
description: Provides testing patterns, best practices, and coverage strategies for unit tests, component tests, and service tests. Use when writing tests, improving test coverage, implementing mocking strategies, debugging failing tests, or organizing test suites.
category: testing
framework: [generic]
---

# Testing Patterns Skill

<role>
Testing expert specializing in test patterns, frameworks, and comprehensive test coverage strategies.
</role>

<!-- @generated: testing-frameworks -->
<test-pattern-catalog>
  <runners>
    <runner scope="packages/rules, apps/server">Vitest, node environment, explicit imports from 'vitest' (no globals)</runner>
    <runner scope="apps/mobile">Jest with the jest-expo preset + @testing-library/react-native (RNTL) + expo-router/testing-library</runner>
    <rule>Never mix them: `vi.*` only in rules/server, `jest.*` only in mobile.</rule>
    <status>Greenfield project: paths and helper names below are the planned conventions. Glob before assuming a file exists.</status>
  </runners>

  <expertise-domains>
    <domain name="rules-unit">Pure Chkobba engine in @chkobba/rules: captures, chkobba sweeps, dealing/redeals, 2v2 team scoring, match end. Highest coverage bar.</domain>
    <domain name="bot-determinism">Bot move selection with an injected seeded RNG; same state + same seed = same move.</domain>
    <domain name="simulation-invariants">Bot-vs-bot full matches over a sweep of seeds, asserting invariants instead of exact outcomes.</domain>
    <domain name="server-match-handler">Nakama authoritative match handler functions called directly with mocked ctx/logger/nk/dispatcher.</domain>
    <domain name="server-rpc-storage">RPC handlers and storage/wallet access via mocked `nk`.</domain>
    <domain name="mobile-component">React Native components rendered with RNTL and driven with userEvent.</domain>
    <domain name="mobile-navigation">expo-router flows via renderRouter / testRouter / toHavePathname.</domain>
    <domain name="out-of-scope">E2E on Expo web (http://localhost:8081) and real-device testing belong to other agents/manual QA, not to unit suites.</domain>
  </expertise-domains>

  <pattern name="rules-table-driven" runner="Vitest">
    <when>Scoring categories, capture combinations, redeal conditions: many small input/output cases</when>
    <code>
```typescript
import { describe, it, expect } from 'vitest';
import { scoreRound } from './scoring';
import { cards } from './test/fixtures';

describe('scoreRound', () => {
  it.each([
    { scenario: 'team 0 captured more diamonds', team0: '1D 2D 3D', team1: '4D 5D', expected: [1, 0] },
    { scenario: 'team 1 captured more diamonds', team0: '1D', team1: '4D 5D', expected: [0, 1] },
    { scenario: 'both teams captured the same number of diamonds', team0: '1D 2D', team1: '4D 5D', expected: [0, 0] },
  ])('should score diamonds as $expected when $scenario', ({ team0, team1, expected }) => {
    // Arrange
    const captured = [cards(team0), cards(team1)];

    // Act
    const result = scoreRound({ captured, chkobbas: [0, 0] });

    // Assert
    expect(result.map((team) => team.diamonds)).toEqual(expected);
  });

  it('should award the 7 of diamonds point to the team that captured it', () => {
    // Arrange
    const captured = [cards('2H 3S'), cards('7D 4C')];

    // Act
    const result = scoreRound({ captured, chkobbas: [0, 0] });

    // Assert
    expect(result.map((team) => team.sevenOfDiamonds)).toEqual([0, 1]);
  });
});
```
    </code>
    <techniques>
      <technique>Card shorthand strings keep cases readable; one row per rule from the spec</technique>
      <technique>Cover ties explicitly for every majority category (cards, diamonds, sevens): ties are where variants differ</technique>
      <technique>Test the final table pickup going to the last capturing team and NOT counting as a chkobba</technique>
    </techniques>
  </pattern>

  <pattern name="simulation-invariants" runner="Vitest">
    <when>Proving the engine and bots never reach an illegal state, beyond hand-picked cases</when>
    <code>
```typescript
import { describe, it, expect } from 'vitest';
import { playOutMatch } from './simulate';
import { createRng } from './rng';

describe('bot-only matches', () => {
  it('should conserve all 40 cards in every round across 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      // Arrange
      const rng = createRng(seed);

      // Act
      const history = playOutMatch(rng);

      // Assert
      for (const round of history.rounds) {
        expect(round.capturedCount[0] + round.capturedCount[1], `seed ${seed}`).toBe(40);
      }
    }
  });
});
```
    </code>
    <techniques>
      <technique>Put the seed in the assertion message so a failure is reproducible</technique>
      <technique>When a sweep finds a bug, add a dedicated named test pinned to that seed before fixing</technique>
      <technique>No fast-check dependency: a plain seed loop over the project's own RNG is enough</technique>
    </techniques>
  </pattern>

  <pattern name="server-match-handler" runner="Vitest">
    <when>Any change to apps/server/src/match/**: joins, turns, backfill, disconnect/reconnect, hidden information</when>
    <code>
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpCode } from '@chkobba/rules';
import { matchInit, matchJoin, matchLeave, matchLoop } from './chkobbaMatch';
import {
  createContext,
  createMockDispatcher,
  createMockLogger,
  createMockNk,
  createPresence,
} from '../test/nakamaMocks';

describe('chkobbaMatch reconnection', () => {
  const ctx = createContext();
  let logger: ReturnType<typeof createMockLogger>;
  let nk: ReturnType<typeof createMockNk>;
  let dispatcher: ReturnType<typeof createMockDispatcher>;
  const players = ['u1', 'u2', 'u3', 'u4'].map(createPresence);

  beforeEach(() => {
    logger = createMockLogger();
    nk = createMockNk();
    dispatcher = createMockDispatcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should hand the seat back to the player when they rejoin after a disconnect', () => {
    // Arrange
    const { state } = matchInit(ctx, logger, nk, { seed: '42' });
    const started = matchLoop(ctx, logger, nk, dispatcher, 2,
      matchJoin(ctx, logger, nk, dispatcher, 1, state, players)!.state, [])!.state;
    const left = matchLeave(ctx, logger, nk, dispatcher, 3, started, [players[1]])!.state;

    // Act
    const rejoined = matchJoin(ctx, logger, nk, dispatcher, 4, left, [players[1]])!.state;

    // Assert
    expect(rejoined.seats[1]).toMatchObject({ kind: 'human', userId: 'u2' });
  });

  it('should resend the rejoining player their current hand only to them', () => {
    // Arrange
    const { state } = matchInit(ctx, logger, nk, { seed: '42' });
    const started = matchLoop(ctx, logger, nk, dispatcher, 2,
      matchJoin(ctx, logger, nk, dispatcher, 1, state, players)!.state, [])!.state;
    const left = matchLeave(ctx, logger, nk, dispatcher, 3, started, [players[1]])!.state;
    dispatcher.broadcastMessage.mockClear();

    // Act
    matchJoin(ctx, logger, nk, dispatcher, 4, left, [players[1]]);

    // Assert
    const handRecipients = dispatcher.broadcastMessage.mock.calls
      .filter(([opCode]) => opCode === OpCode.DealHand)
      .map(([, , presences]) => presences);
    expect(handRecipients).toEqual([[players[1]]]);
  });
});
```
    </code>
    <techniques>
      <technique>Time is ticks: advance by passing a larger `tick` (use exported constants like BACKFILL_WAIT_TICKS), never fake timers; the Nakama runtime has no setTimeout</technique>
      <technique>Hidden information: filter `dispatcher.broadcastMessage.mock.calls` by opcode and assert the recipients array; assert public-state payloads never contain a `hands` field or the deck</technique>
      <technique>Illegal and out-of-turn moves: send them via `matchMessage(sender, OpCode.PlayCard, payload)` and assert state is unchanged plus an error opcode to that sender only</technique>
      <technique>Run the real @chkobba/rules engine inside server tests; only the Nakama boundary is mocked</technique>
    </techniques>
  </pattern>

  <pattern name="mobile-component" runner="Jest (jest-expo)">
    <when>Hand, table, scoreboard, lobby components</when>
    <code>
```tsx
import { render, screen } from '@testing-library/react-native';
import { Scoreboard } from '@/components/Scoreboard';

describe('Scoreboard', () => {
  it('should show each team total when the round ends', async () => {
    // Arrange
    const totals = { team0: 11, team1: 7 };

    // Act
    await render(<Scoreboard totals={totals} />);

    // Assert
    expect(screen.getByLabelText('Your team score')).toHaveTextContent('11');
  });
});
```
    </code>
    <techniques>
      <technique>`await render(...)`; query by role/label first, testID last</technique>
      <technique>`userEvent.setup()` + `await user.press(...)` for interactions, with `jest.useFakeTimers()` at file top</technique>
      <technique>Give cards accessible labels ("7 of diamonds") so tests and screen readers share the same query</technique>
    </techniques>
  </pattern>

  <pattern name="mobile-async-match-data" runner="Jest (jest-expo)">
    <when>Hooks/screens reacting to realtime match messages from the Nakama socket</when>
    <code>
```tsx
import { act, renderHook } from '@testing-library/react-native';
import { OpCode } from '@chkobba/rules';
import { cards } from '@chkobba/rules/test';
import { useMatchState } from '@/hooks/useMatchState';
import { onMatchData } from '@/services/nakama';

jest.mock('@/services/nakama', () => ({
  onMatchData: jest.fn(),
}));

type Listener = (opCode: number, payload: unknown) => void;

describe('useMatchState', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should expose the dealt hand when a DealHand message arrives', async () => {
    // Arrange
    let emit: Listener = () => undefined;
    jest.mocked(onMatchData).mockImplementation((listener: Listener) => {
      emit = listener;
      return () => undefined;
    });
    const { result } = await renderHook(() => useMatchState());

    // Act
    await act(async () => {
      emit(OpCode.DealHand, { hand: cards('7D 3H') });
    });

    // Assert
    expect(result.current.hand).toEqual(cards('7D 3H'));
  });
});
```
    </code>
    <techniques>
      <technique>The services/nakama wrapper decodes socket data into (opCode, payload), so hooks and tests never touch ArrayBuffers</technique>
      <technique>Capture the registered listener from the mock and emit inside `act`</technique>
      <technique>Assert the unsubscribe function is called on unmount to prevent duplicate listeners after reconnect</technique>
    </techniques>
  </pattern>

  <pattern name="mobile-navigation" runner="Jest (jest-expo)">
    <code>
```tsx
import { renderRouter, screen, testRouter } from 'expo-router/testing-library';

it('should navigate to the table route when a match is joined', async () => {
  // Arrange
  await renderRouter(['index', 'table/[matchId]']);

  // Act
  await testRouter.push('/table/match-1');

  // Assert
  expect(screen).toHavePathname('/table/match-1');
});
```
    </code>
    <techniques>
      <technique>Route tests live in apps/mobile/src/__tests__/, never in apps/mobile/src/app (every file there becomes a route)</technique>
    </techniques>
  </pattern>
</test-pattern-catalog>
<!-- @end: testing-frameworks -->

<best-practices>
  <principle name="AAA Pattern">
    <description>Arrange, Act, Assert - Structure tests in three clear phases</description>
    <example>
      // Arrange: Set up test data and mocks
      const mockData = { id: 1 };
      // Act: Execute the behavior being tested
      const result = service.process(mockData);
      // Assert: Verify expected outcomes
      expect(result).toBe(expected);
    </example>
  </principle>

  <principle name="Single Assertion">
    <description>Each test should verify one specific behavior</description>
    <rationale>Makes failures easier to diagnose and tests easier to maintain</rationale>
  </principle>

  <principle name="Descriptive Test Names">
    <description>Test names should clearly describe what is being tested</description>
    <format>should [expected behavior] when [condition]</format>
    <example>it('should emit event when button is clicked', ...)</example>
  </principle>

  <principle name="Mock External Dependencies">
    <description>Isolate unit under test by mocking external services, HTTP calls, and third-party libraries</description>
    <techniques>
      <technique>HTTP mocking utilities for network calls</technique>
      <technique>Spies/mocks for method calls</technique>
      <technique>Test doubles for complex dependencies</technique>
    </techniques>
  </principle>

  <principle name="Test Edge Cases">
    <description>Always test error conditions, empty states, boundary values, and null/undefined inputs</description>
    <categories>
      <category>Happy path (normal operation)</category>
      <category>Error conditions (exceptions, network failures)</category>
      <category>Edge cases (null, undefined, empty arrays)</category>
      <category>Boundary values (min, max, zero)</category>
    </categories>
  </principle>

  <principle name="Test Isolation">
    <description>Tests must not depend on each other or shared state</description>
    <enforcement>
      <rule>Use beforeEach for setup</rule>
      <rule>Use afterEach for cleanup</rule>
      <rule>Never rely on test execution order</rule>
    </enforcement>
  </principle>

  <principle name="Coverage Targets">
    <description>Aim for high coverage but focus on meaningful tests</description>
    <targets>
      <target metric="statements" minimum="80%" />
      <target metric="branches" minimum="80%" />
      <target metric="functions" minimum="80%" />
      <target metric="lines" minimum="80%" />
    </targets>
    <note>Coverage is a metric, not a goal. 100% coverage with poor tests is worse than 80% coverage with quality tests.</note>
  </principle>
</best-practices>

<quality-standards>
  <coverage-requirements>
    <threshold type="statements" value="80%" />
    <threshold type="branches" value="80%" />
    <threshold type="functions" value="80%" />
    <threshold type="lines" value="80%" />
  </coverage-requirements>

  <test-organization>
    <structure>
      <level>Describe blocks for classes/components</level>
      <level>Nested describe blocks for methods/features</level>
      <level>Individual it blocks for specific behaviors</level>
    </structure>
  </test-organization>

  <naming-conventions>
    <describe-block>Name of class/component being tested</describe-block>
    <it-block>should [expected behavior] when [condition]</it-block>
  </naming-conventions>
</quality-standards>

<activation-context>
  <keywords>
    <keyword>testing</keyword>
    <keyword>tests</keyword>
    <keyword>Jest</keyword>
    <keyword>unit tests</keyword>
    <keyword>component tests</keyword>
    <keyword>service tests</keyword>
    <keyword>mocking</keyword>
    <keyword>coverage</keyword>
    <keyword>E2E</keyword>
    <keyword>integration tests</keyword>
    <keyword>test suite</keyword>
    <keyword>test spec</keyword>
  </keywords>

  <activation-triggers>
    <trigger>User mentions writing tests</trigger>
    <trigger>User asks about test coverage</trigger>
    <trigger>User discusses mocking strategies</trigger>
    <trigger>User needs help debugging failing tests</trigger>
    <trigger>User asks how to test specific framework features</trigger>
  </activation-triggers>
</activation-context>

<!-- @generated: project-specific-patterns -->
<project-specific-patterns>
  <shared-test-utilities>
    <utility name="card shorthand" file="packages/rules/src/test/fixtures.ts">
      `card('7D')` returns `{ rank: 7, suit: 'diamonds' }`; `cards('3H 4S 7D')` returns Card[]; `cards('')` returns [].
      Suits: D diamonds, H hearts, C clubs, S spades. Ranks 1-10; face-card mapping follows the written spec.
    </utility>
    <utility name="state builders" file="packages/rules/src/test/fixtures.ts">
      `buildState({ hands, table, turn, captured, lastCapturer })` returns a valid GameState with defaults for every omitted field,
      so a test states only what matters (for example `buildState({ table: cards('3H 4S'), hands: { 0: cards('7D') }, turn: 0 })`).
    </utility>
    <utility name="seeded RNG" file="packages/rules/src/rng.ts">
      `createRng(seed: number): () => number`, a small deterministic PRNG with no dependencies. Production code receives an RNG
      as an argument; tests always pass `createRng(literalSeed)`. The server seeds a match via matchInit params so server tests are deterministic too.
    </utility>
    <utility name="simulation" file="packages/rules/src/simulate.ts">
      `playOutMatch(rng)` runs four bots to match end and returns per-round history, used by seed-sweep invariant tests and handy for reproducing bugs.
    </utility>
    <utility name="Nakama doubles" file="apps/server/src/test/nakamaMocks.ts">
      `createMockNk()`, `createMockLogger()`, `createMockDispatcher()`, `createContext(userId?)`, `createPresence(userId)`,
      `matchMessage(sender, opCode, payload)`. Each returns `vi.fn()`-backed objects typed as both the mock and the `nkruntime` interface.
      The file is never imported from InitModule, so it is never bundled into the goja module.
    </utility>
  </shared-test-utilities>

  <package-and-type-imports>
    <rule>@chkobba/rules exports TypeScript source for workspace consumers (`"exports": { ".": "./src/index.ts", "./test": "./src/test/fixtures.ts" }`), so server and mobile tests never need a prior build of the rules package</rule>
    <rule>Types: `import type { Card, GameState, Seat } from '@chkobba/rules';` in server/mobile tests; relative `import type` inside packages/rules</rule>
    <rule>Protocol: `OpCode` and message payload types are imported from '@chkobba/rules' (packages/rules/src/protocol.ts) by both server and mobile tests; never hard-code opcode numbers</rule>
    <rule>Nakama server types come from the ambient `nkruntime` namespace (nakama-runtime types listed in apps/server/tsconfig.json `types`); no import statement is needed</rule>
    <rule>Mobile: `@/` maps to apps/mobile/src via tsconfig paths and Jest `moduleNameMapper`</rule>
  </package-and-type-imports>

  <service-mocking>
    <server>
      <mock target="nk.storageRead / nk.storageWrite">Return `nkruntime.StorageObject[]` fixtures. On writes, assert the collection/key constants and the permissions (server-owned data such as profiles and cosmetics ownership must use `permissionWrite: 0`).</mock>
      <mock target="nk.walletUpdate">Credits are cosmetic only. Add a guard test that finishing a match never calls `walletUpdate` (no wagering); only purchase/reward RPCs may.</mock>
      <mock target="nk.binaryToString">Decodes ArrayBuffer to string so the handler's JSON parsing runs for real.</mock>
      <mock target="dispatcher.broadcastMessage">Inspect `.mock.calls` as `[opCode, data, presences, sender, reliable]`; bots have no presence and must never appear as recipients.</mock>
    </server>
    <mobile>
      <mock target="@/services/nakama">The only module that talks to @heroiclabs/nakama-js (client, session, socket). Tests `jest.mock` it and drive listeners manually.</mock>
      <mock target="@/services/ads, @/services/purchases">Planned wrappers around AdMob/UMP and RevenueCat (Phases 4-5). Mock the wrapper, never the native SDK. Required test: no interstitial is requested while a hand is in progress.</mock>
      <mock target="secure session storage">Mock the session persistence wrapper so auth tests do not need native modules.</mock>
    </mobile>
  </service-mocking>

  <domain-test-checklist>
    <item>Capture: equal-rank capture, every valid sum combination, no capture (card goes to table), spec rule when both an equal rank and a sum are available</item>
    <item>Chkobba: sweep scored to the capturing team; last-card-of-the-round pickup not scored as chkobba</item>
    <item>Round end: remaining table cards go to the last capturing team</item>
    <item>Scoring per team (seats 0+2 vs 1+3): cards, diamonds, 7 of diamonds, sevens, chkobbas, with a tie case for each majority category</item>
    <item>Dealing and redeal condition from the spec; 40 cards conserved</item>
    <item>Match end at the spec target score, including both teams crossing it in the same round</item>
    <item>Bots: always legal, deterministic per seed</item>
    <item>Server: hand privacy, turn enforcement, backfill after wait, bot takeover on leave, seat handback on rejoin, private table invite-only joins</item>
  </domain-test-checklist>
</project-specific-patterns>
<!-- @end: project-specific-patterns -->

<workflow>
  <step number="1" name="understand-requirement">
    <action>Understand what needs to be tested</action>
    <questions>
      <question>Is this a component, service, or integration test?</question>
      <question>What behavior needs verification?</question>
      <question>What are the edge cases?</question>
    </questions>
  </step>

  <step number="2" name="select-pattern">
    <action>Choose appropriate test pattern from catalog</action>
    <decision-tree>
      <branch>Component test -> Use component test setup pattern</branch>
      <branch>Service with HTTP -> Use HTTP mocking pattern</branch>
      <branch>Async behavior -> Use async test pattern</branch>
    </decision-tree>
  </step>

  <step number="3" name="write-test">
    <action>Write test following AAA pattern</action>
    <structure>
      <phase>Arrange: Set up test data, mocks, spies</phase>
      <phase>Act: Execute the behavior</phase>
      <phase>Assert: Verify outcomes</phase>
    </structure>
  </step>

  <step number="4" name="verify-coverage">
    <action>Run coverage report and ensure targets met</action>
    <!-- @generated: app-scope-mapping -->
    <test-run-commands>
      <all>
        <dev>pnpm test</dev>
        <coverage>pnpm test:coverage</coverage>
      </all>
      <app name="rules" package="@chkobba/rules" runner="Vitest">
        <dev>pnpm --filter @chkobba/rules test</dev>
        <coverage>pnpm --filter @chkobba/rules test:coverage</coverage>
        <watch>pnpm --filter @chkobba/rules test:watch</watch>
        <single-file>pnpm --filter @chkobba/rules exec vitest run src/scoring.test.ts</single-file>
        <planned-threshold>90% statements/branches/functions/lines (coverage.thresholds in packages/rules/vitest.config.ts)</planned-threshold>
      </app>
      <app name="server" package="@chkobba/server" runner="Vitest">
        <dev>pnpm --filter @chkobba/server test</dev>
        <coverage>pnpm --filter @chkobba/server test:coverage</coverage>
        <watch>pnpm --filter @chkobba/server test:watch</watch>
        <single-file>pnpm --filter @chkobba/server exec vitest run src/match/chkobbaMatch.test.ts</single-file>
        <bundle-check>pnpm --filter @chkobba/server build</bundle-check>
        <planned-threshold>80% (coverage.thresholds in apps/server/vitest.config.ts, src/test/** excluded)</planned-threshold>
      </app>
      <app name="mobile" package="@chkobba/mobile" runner="Jest (jest-expo)">
        <dev>pnpm --filter @chkobba/mobile test</dev>
        <coverage>pnpm --filter @chkobba/mobile test:coverage</coverage>
        <watch>pnpm --filter @chkobba/mobile test:watch</watch>
        <single-file>pnpm --filter @chkobba/mobile exec jest src/components/Hand.test.tsx</single-file>
        <planned-threshold>70% (coverageThreshold.global in apps/mobile/jest.config.js)</planned-threshold>
      </app>
      <note>Package scripts convention: Vitest packages use `vitest run`, `vitest`, `vitest run --coverage`; mobile uses `jest`, `jest --watch`, `jest --coverage`.</note>
    </test-run-commands>
    <!-- @end: app-scope-mapping -->
  </step>
</workflow>

<common-issues>
  <issue name="Async test failures">
    <symptoms>Test passes sometimes, fails other times</symptoms>
    <solutions>
      <solution>Use fake timers or async test utilities instead of real timers</solution>
      <solution>Ensure all async operations complete before assertions</solution>
      <solution>Use done() callback for promise-based tests</solution>
    </solutions>
  </issue>

  <issue name="Change detection not running">
    <symptoms>Template assertions fail even though logic works</symptoms>
    <solutions>
      <solution>Call fixture.detectChanges() after state changes</solution>
      <solution>Use fixture.whenStable() for async operations</solution>
      <solution>Check OnPush components require manual change detection</solution>
    </solutions>
  </issue>

  <issue name="Spy not being called">
    <symptoms>toHaveBeenCalled() fails unexpectedly</symptoms>
    <solutions>
      <solution>Verify spy is created before method execution</solution>
      <solution>Check spy is on correct object instance</solution>
      <solution>Use callThrough() if spy needs to execute original method</solution>
    </solutions>
  </issue>
</common-issues>
