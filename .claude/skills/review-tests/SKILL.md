---
name: review-tests
description: Reviews and approves TDD test specifications with interactive feedback before implementation. Use when reviewing Gherkin specs, approving test behavior, locking tests for TDD execution, validating test coverage plans, or iterating test scenarios based on feedback.
category: testing
framework: [jest, gherkin]
---

# Review Tests Command

<role>Test Specification Reviewer - Interactive approval workflow for locking test behavior before implementation</role>

<primary-task>Display test specifications phase-by-phase, collect developer feedback, iterate until approved, then lock tests for implementation</primary-task>

Interactive command for developers to review and approve Gherkin specifications and Jest test skeletons before implementation begins.

## Overview

This command displays the test specifications for a given phase and collects developer approval. Tests cannot be modified during implementation - this review is the final opportunity to ensure tests reflect intended behavior.

<workflow>
  <description>5-step interactive review process with approval loops</description>

  <process-flow>
    /review-tests [plan-name] [phase]
          ↓
      Load Gherkin specs for phase
          ↓
      Display specs in readable format
          ↓
      Ask developer to review
          ↓
      Approved? ─── NO ──→ Collect feedback, iterate
          │
         YES
          ↓
      Mark phase tests as "locked"
          ↓
      Ready for implementation
  </process-flow>

  <steps>
    <step number="1">Load test specifications (Gherkin + Jest skeletons)</step>
    <step number="2">Display in readable format with visual structure</step>
    <step number="3">Collect developer feedback with explicit options</step>
    <step number="4">Process feedback (approve OR iterate changes)</step>
    <step number="5">Lock tests and update approval tracker</step>
  </steps>
</workflow>

## Process Flow

```
/review-tests [plan-name] [phase]
      ↓
  Load Gherkin specs for phase
      ↓
  Display specs in readable format
      ↓
  Ask developer to review
      ↓
  Approved? ─── NO ──→ Collect feedback, iterate
      │
     YES
      ↓
  Mark phase tests as "locked"
      ↓
  Ready for implementation
```

## Usage

```bash
# Review all tests for phase 1
/review-tests 2025-01-15-feature-name 1

# Review E2E specs
/review-tests 2025-01-15-feature-name e2e

# Interactive selection
/review-tests
```

---

## EXECUTION INSTRUCTIONS

**You (Claude) must follow these steps:**

### Step 1: Load Test Specifications

**If plan and phase provided:**

1. Read the plan file from `context/plans/[plan-name].md`
2. Find all `.feature` files created for that phase
3. Find corresponding `.spec.ts` skeleton files

**If no parameters:**

1. List available plans with pending test reviews
2. Ask developer to select plan and phase

### Step 2: Display Specifications

Format the Gherkin specs for easy reading:

```
═══════════════════════════════════════════════════════════════
  TEST REVIEW: Phase [X] - [Phase Name]
  Plan: [plan-name]
═══════════════════════════════════════════════════════════════

📋 FEATURE: [Feature Name]
   File: src/modules/foo/foo.service.feature

   Background:
   ├─ Given [common setup]
   └─ And [additional setup]

   ┌─────────────────────────────────────────────────────────┐
   │ @unit @phase-1                                          │
   │ Scenario: [Scenario Name]                               │
   ├─────────────────────────────────────────────────────────┤
   │ Given  [precondition]                                   │
   │ When   [action taken]                                   │
   │ Then   [expected outcome]                               │
   │ And    [additional expectation]                         │
   └─────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────┐
   │ @unit @phase-1 @edge-case                               │
   │ Scenario: [Edge Case Name]                              │
   ├─────────────────────────────────────────────────────────┤
   │ Given  [edge case setup]                                │
   │ When   [action]                                         │
   │ Then   [expected handling]                              │
   └─────────────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════

📊 SUMMARY:
   Total Scenarios: 5
   ├─ Unit Tests: 3
   ├─ Integration: 2
   └─ Edge Cases: 2

═══════════════════════════════════════════════════════════════
```

<interaction-flow>
  <display-format>Present specs with visual structure (boxes, tree diagrams)</display-format>

  <feedback-collection>
    <prompt>Please review the test specifications above.</prompt>

    <verification-checklist>
      <check>✓ Do the scenarios cover all expected behaviors?</check>
      <check>✓ Are the edge cases complete?</check>
      <check>✓ Do the error scenarios match expected error handling?</check>
      <check>✓ Are the test names clear and descriptive?</check>
    </verification-checklist>

    <feedback-options>
      <option name="approve">
        <command>"approve"</command>
        <action>Lock tests for implementation, mark as approved</action>
        <next>Proceed to approval tracker update</next>
      </option>

      <option name="add-scenario">
        <command>"add [scenario description]"</command>
        <action>Spawn test-writer to add new scenario</action>
        <next>Re-display specs, collect feedback again</next>
      </option>

      <option name="request-changes">
        <command>"change [scenario name]: [new behavior]"</command>
        <action>Spawn test-writer to update scenario</action>
        <next>Re-display updated scenario, collect feedback again</next>
      </option>

      <option name="question">
        <command>"question"</command>
        <action>Answer questions about specific scenarios</action>
        <next>Continue review after clarification</next>
      </option>
    </feedback-options>

    <approval-loop>
      <logic>Repeat feedback collection until developer types "approve"</logic>
      <max-iterations>Unlimited - iterate until developer satisfied</max-iterations>
    </approval-loop>

  </feedback-collection>

  <warning>
    ⚠️  Once approved, test BEHAVIOR cannot be modified during implementation.
        (Syntax fixes allowed, behavior changes require re-review)
  </warning>
</interaction-flow>

### Step 3: Collect Developer Feedback

Ask specific questions:

```
Please review the test specifications above.

**Verification Checklist:**

1. ✓ Do the scenarios cover all expected behaviors?
2. ✓ Are the edge cases complete?
3. ✓ Do the error scenarios match expected error handling?
4. ✓ Are the test names clear and descriptive?

**Actions:**
- Type **"approve"** to lock these tests for implementation
- Type **"add [scenario]"** to request additional test cases
- Type **"change [scenario]: [new behavior]"** to modify expected behavior
- Type **"question"** to ask about specific scenarios

⚠️  Once approved, test BEHAVIOR cannot be modified during implementation.
    (Syntax fixes allowed, behavior changes require re-review)
```

### Step 4: Process Feedback

**If "approve":**

1. Update the test files with approval header:
   ```typescript
   /**
    * @approved 2025-01-15T10:30:00Z
    * @reviewer developer
    * @locked true
    *
    * LOCKED - Behavior defined in this file is immutable during implementation.
    * Only syntax/import fixes allowed. Behavior changes require /review-tests.
    */
   ```
2. Create/update approval record in `context/test-approvals/[plan-name].json`
3. Report success

**If changes requested:**

1. Spawn test-writer agent to update specs
2. Re-display updated specs
3. Ask for approval again

### Step 5: Update Approval Tracker

Create/update `context/test-approvals/[plan-name].json`:

```json
{
  "plan": "[plan-name]",
  "phases": {
    "1": {
      "approved": true,
      "approved_at": "2025-01-15T10:30:00Z",
      "files": ["src/modules/foo/foo.service.feature", "src/modules/foo/foo.service.spec.ts"],
      "scenarios": 5
    },
    "2": {
      "approved": false,
      "files": []
    }
  },
  "e2e": {
    "specs_approved": true,
    "implemented": false
  }
}
```

---

## Developer Interaction Examples

### Approve Flow

```
Developer: /review-tests 2025-01-15-user-auth 1

[Claude displays test specs]

Developer: approve

Claude:
✅ Phase 1 tests approved and locked!

Files locked:
- src/modules/auth/auth.service.feature
- src/modules/auth/auth.service.spec.ts

5 scenarios ready for implementation.
Implementation can now begin for Phase 1.

Run `/execute-plan-tdd 2025-01-15-user-auth` to start implementation.
```

### Change Request Flow

```
Developer: change "Successful login": should also verify last_login timestamp is updated

Claude:
I'll update the scenario to include last_login verification.

[Spawns test-writer to update specs]

Updated scenario:
┌─────────────────────────────────────────────────────────────┐
│ @unit @phase-1                                              │
│ Scenario: Successful login                                  │
├─────────────────────────────────────────────────────────────┤
│ Given  a registered user with email "test@example.com"      │
│ When   they submit valid credentials                        │
│ Then   they should receive a JWT token                      │
│ And    the token should expire in 24 hours                  │
│ And    the user's last_login timestamp should be updated    │ ← NEW
└─────────────────────────────────────────────────────────────┘

Do you approve this change? (approve/modify further)
```

### Add Scenario Flow

```
Developer: add scenario for rate limiting - should block after 5 failed attempts

Claude:
I'll add a rate limiting scenario.

[Spawns test-writer]

New scenario added:
┌─────────────────────────────────────────────────────────────┐
│ @unit @phase-1 @security                                    │
│ Scenario: Rate limiting on failed login attempts            │
├─────────────────────────────────────────────────────────────┤
│ Given  a user with email "test@example.com"                 │
│ And    they have failed login 5 times in the last hour      │
│ When   they attempt to login again                          │
│ Then   they should receive a 429 Too Many Requests error    │
│ And    the error message should indicate retry time         │
└─────────────────────────────────────────────────────────────┘

Total scenarios now: 6

Do you approve all scenarios? (approve/modify further)
```

## Important Notes

1. **Approval is per-phase** - Each phase must be approved before implementation
2. **E2E specs separate** - E2E specs are reviewed separately from unit/integration
3. **Locked means locked** - After approval, executor cannot modify test behavior
4. **Syntax fixes allowed** - Imports, typos, setup code can be fixed
5. **Behavior changes require re-review** - Any change to expected outcomes needs new approval

<error-handling>
  <scenario name="no-test-files">
    <symptom>No .feature or .spec.ts files found for specified phase</symptom>
    <message>
      ⚠️  No test files found for Phase [X].

      Either:
      1. Tests haven't been created yet - run test-writer first
      2. Phase number is incorrect - check plan phases

      Available phases with tests: 1, 2 (Phase 3 pending)
    </message>
    <action>List available phases, ask developer to select or create tests</action>

  </scenario>

  <scenario name="already-approved">
    <symptom>Phase tests already have approval header</symptom>
    <message>
      ℹ️  Phase [X] tests are already approved.

      Approved: 2025-01-15T10:30:00Z
      Scenarios: 5

      To re-review and unlock, type "unlock" (requires re-approval before implementation)
    </message>
    <action>Offer to unlock for re-review (removes approval header)</action>

  </scenario>

  <scenario name="approval-stuck">
    <symptom>Developer repeatedly requests changes, specs not converging</symptom>
    <diagnosis>Test specs may not align with intended feature behavior</diagnosis>
    <recommendation>
      Ask developer if they want to:
      1. Modify the plan instead of test specs
      2. Schedule a clarification discussion
      3. Skip TDD for this phase (use regular execution)
    </recommendation>
  </scenario>

  <scenario name="test-writer-failure">
    <symptom>Test-writer agent fails to update specs</symptom>
    <action>Report error, offer manual edit or retry with clearer instructions</action>
  </scenario>
</error-handling>

<constraints>
  <approval-rules>
    <rule>Approval is per-phase - each phase must be approved before implementation</rule>
    <rule>E2E specs reviewed separately from unit/integration tests</rule>
    <rule>Once approved, tests are LOCKED - behavior cannot change</rule>
  </approval-rules>

  <allowed-changes>
    <after-approval>
      <allowed>Syntax fixes (imports, typos)</allowed>
      <allowed>Setup code adjustments (mocks, test data)</allowed>
      <allowed>Type annotations for TypeScript compatibility</allowed>
      <forbidden>Assertion logic changes</forbidden>
      <forbidden>Expected outcome modifications</forbidden>
      <forbidden>Test skipping or disabling</forbidden>
    </after-approval>
  </allowed-changes>

  <behavior-change-protocol>
    <requirement>Re-run /review-tests to unlock and re-approve</requirement>
    <reason>Behavior changes invalidate TDD contract</reason>
  </behavior-change-protocol>
</constraints>

## Error Handling

**If no test files found:**

```
⚠️  No test files found for Phase [X].

Either:
1. Tests haven't been created yet - run test-writer first
2. Phase number is incorrect - check plan phases

Available phases with tests: 1, 2 (Phase 3 pending)
```

**If already approved:**

```
ℹ️  Phase [X] tests are already approved.

Approved: 2025-01-15T10:30:00Z
Scenarios: 5

To re-review and unlock, type "unlock" (requires re-approval before implementation)
```
