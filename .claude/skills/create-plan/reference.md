# Create Plan — Reference

## Developer Interaction Templates

### Initial Prompt (no arguments)

```
I'll help you create a detailed implementation plan. Let me understand what we're building.

Please provide:
1. What feature/change are you implementing?
2. Any specific requirements or constraints?
3. Related files, tickets, or documentation?

Tip: You can also run `/create-plan context/tickets/task.md` with a context file.
```

### After Research

```
Based on my research, I found:

Current Implementation:
- [Discovery with file:line reference]
- [Pattern to follow]

Questions:
1. [Technical question]
2. [Business logic clarification]
```

### Design Discussion

```
Here are the approaches I'm considering:

Option A: [Name]
- Pros: ...
- Cons: ...

Option B: [Name]
- Pros: ...
- Cons: ...

Which approach do you prefer?
```

### Plan Structure Proposal

```
Here's my proposed plan structure:

## Phases:
1. [Phase 1] - [what it accomplishes]
2. [Phase 2] - [what it accomplishes]

Does this make sense before I write the details?
```

### Confirmation Request

```
I've created the implementation plan at:
context/plans/YYYY-MM-DD-feature-name.md

Please review and confirm:
1. Are the phases properly scoped?
2. Are the success criteria specific enough?
3. Any missing considerations?

Type "confirm" to finalize, or provide feedback for revisions.
```

### After Confirmation

```
Plan confirmed! Now generating the execution checklist...

Checklist created at:
context/checklists/YYYY-MM-DD-feature-name-checklist.md

Summary:
- X phases, Y tasks total
- Agents assigned: module-generator (2), api-enhancer (1), ui-builder (3)

You can now execute with: /execute-plan YYYY-MM-DD-feature-name.md
```

## Valid Confirmation Phrases

- "confirm", "approved", "looks good", "lgtm", "go ahead"
- Invalid: "maybe", "probably", "mostly good" (feedback without explicit approval)

## File Naming Convention

- Plan: `context/plans/YYYY-MM-DD-feature-name.md`
- Checklist: `context/checklists/YYYY-MM-DD-feature-name-checklist.md`
- Date format: `YYYY-MM-DD`
- Description: lowercase-with-hyphens

**Branch naming:** the convention is **branch name = plan name** (plan
`2026-06-12-webhook-retry.md` → branch `2026-06-12-webhook-retry` or
`feature/2026-06-12-webhook-retry`). `/execute-plan` and `/review-execution` both resolve
branch → plan → checklist automatically when this holds.

## Planner Agent Spawn Template

```
Task({
  subagent_type: "planner",
  description: "Interactive planning session",
  prompt: `Create an implementation plan through interactive collaboration.

Context provided: $ARGUMENTS

Responsibilities:
1. If context files provided: Read them fully, summarize understanding, ask clarifying questions
2. If no context: Ask developer what they want to implement
3. Research codebase using codebase-analyzer, codebase-locator, codebase-pattern-finder
4. Collaborate on design: present options with trade-offs
5. Identify ADR opportunities (architectural decisions)
6. Write plan: Save to context/plans/YYYY-MM-DD-name.md using Write tool
7. Get explicit confirmation

ALTITUDE: phase-level only. Per phase, write a Goal plus one-line task summaries.
Do NOT write task checkboxes, agent assignments, skills, per-task validation commands,
or implementation code (data structures excepted, after confirmation).

CRITICAL: Report back with:
- PLAN_FILE: [path]
- CONFIRMED: [true/false]
- NOTES: [considerations for checklist generation]`
})
```

## Checklist Generator Spawn Template

```
Task({
  subagent_type: "checklist-generator",
  description: "Generate execution checklist",
  prompt: `Convert confirmed plan to actionable checklist.

Plan file: [path from planner]

Responsibilities:
1. Discover agents (.claude/agents/) and skills (.claude/skills/)
2. Parse plan phases and task summaries
3. Decompose each summary into executable tasks and LOCATE the real target files
4. Assign the best agent per task (6-tier), recommend skills
5. Identify dependencies for parallel execution
6. Write checklist: context/checklists/[plan-name]-checklist.md

Critical rules:
- Emit every task in the canonical block from create-plan/task-template.md — exact field labels
- Every task MUST have an assigned agent and a Files field
- Add a documentation task AFTER each phase
- ALWAYS use Write tool

Report back:
- CHECKLIST_FILE: [path]
- SUMMARY: [agent assignments]
- NOTES: [concerns]`
})
```

## Error Handling

| Scenario                     | Action                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| Missing context/requirements | Report what's missing, ask specific questions, don't proceed     |
| Developer doesn't confirm    | Listen to feedback, revise plan, re-present for review           |
| Ambiguous confirmation       | Clarify: "Should I make changes first, or is the plan approved?" |
| Checklist generation fails   | Report which tasks couldn't be assigned, ask for guidance        |
