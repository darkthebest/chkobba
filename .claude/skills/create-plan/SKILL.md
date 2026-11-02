---
name: create-plan
description: Two-stage implementation planning workflow using planner and checklist-generator agents. Creates structured plans and execution checklists. Use when creating a plan, planning implementation, starting new features, planning complex changes, or organizing development work.
category: workflow
framework: [generic]
---

# Create Plan Command

Orchestrates a two-stage planning process: interactive collaboration with the developer via the `planner` agent, then conversion to an actionable checklist via the `checklist-generator` agent.

## Usage

```bash
/create-plan                                      # Interactive mode
/create-plan context/tickets/task-description.md  # With context file
/create-plan think deeply about context/tickets/feature-request.md
```

## Two-Stage Workflow

### Stage 1: Planning (Interactive)

**Agent:** `planner`

1. Read context files if provided
2. Ask clarifying questions (max 2-4)
3. Research codebase patterns
4. Identify ADR opportunities (architectural decisions)
5. Collaborate with developer on design
6. Write implementation plan
7. Get explicit developer confirmation

**Deliverable:** `context/plans/YYYY-MM-DD-feature-name.md` with CONFIRMED status.

**Critical:** MUST NOT proceed to Stage 2 without explicit confirmation ("confirm", "approved", "looks good", "lgtm", "go ahead").

### Confirmation Gate

```
Stage 1 Complete -> Plan confirmed? -> NO -> Iterate on plan (stay in Stage 1)
                                    -> YES -> Stage 2 -> Ready for /execute-plan
```

### Stage 2: Checklist Generation (Automated)

**Agent:** `checklist-generator`

**Prerequisites:** Stage 1 complete with CONFIRMED: true.

1. Discover available agents (`.claude/agents/`)
2. Discover available skills (`.claude/skills/`)
3. Parse plan phases and task summaries
4. Decompose each summary into executable tasks and locate the real files
5. Assign best agent for each task (6-tier system)
6. Recommend skills, identify dependencies
7. Write execution checklist

**Deliverable:** `context/checklists/YYYY-MM-DD-feature-name-checklist.md`

## Plan vs Checklist — Altitude Contract

The two artifacts live at different altitudes; they must not duplicate each other.

| Artifact      | Altitude                 | Contains                                                                                                                                                | MUST NOT contain                                                                                            |
| ------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Plan**      | WHAT / WHY — phase-level | Per phase: a **Goal** + one-line **task summaries**; data-structure proposals; risks; out-of-scope; ADR links                                           | `[ ]` task checkboxes, agent assignments, skills, per-task validation commands, implementation code, status |
| **Checklist** | HOW / WHO — task-level   | Decomposing each task summary into executable tasks, **locating the files**, assigning the agent (6-tier) + skills + dependencies + validation + status | —                                                                                                           |

The plan says _what_ needs doing; the checklist decides _who_, _which files_, and _how it is
verified_. **Agent selection lives only in the checklist.** Canonical task shape:
`${CLAUDE_SKILL_DIR}/task-template.md`.

## Execution Instructions

### Step 1: Spawn Planner Agent

```
Task({
  subagent_type: "planner",
  description: "Interactive planning session",
  prompt: `Create implementation plan. Context: $ARGUMENTS
    Responsibilities: Read context, research codebase, collaborate on design,
    write plan (phase-level altitude only), get explicit confirmation.
    Report: PLAN_FILE, CONFIRMED, NOTES`
})
```

Full prompt template: `${CLAUDE_SKILL_DIR}/reference.md`.

### Step 2: Evaluate Response

- If CONFIRMED: true -> Proceed to Step 3
- If CONFIRMED: false -> Report "Plan is not yet confirmed. Continue iterating with the planner." Do NOT proceed.

### Step 3: Spawn Checklist Generator

**ONLY if Step 2 confirmed the plan.**

```
Task({
  subagent_type: "checklist-generator",
  description: "Generate execution checklist",
  prompt: `Convert confirmed plan to checklist.
    Plan file: [path from planner].
    Discover agents/skills, decompose task summaries, locate files,
    assign agent per task, identify dependencies.
    Emit every task in the canonical block from create-plan/task-template.md.
    Report: CHECKLIST_FILE, SUMMARY, NOTES`
})
```

### Step 4: Report Final Status

```
✅ Plan created and confirmed!

**Plan file:** context/plans/YYYY-MM-DD-feature-name.md
**Checklist file:** context/checklists/YYYY-MM-DD-feature-name-checklist.md

**Summary:**
- X phases, Y tasks total
- Agents assigned: [list]

**Next step:**
Run `/execute-plan YYYY-MM-DD-feature-name.md` to begin implementation.
```

## File Management

| Stage     | Output                                                   | Tool  |
| --------- | -------------------------------------------------------- | ----- |
| Plan      | `context/plans/YYYY-MM-DD-description.md`                | Write |
| Checklist | `context/checklists/YYYY-MM-DD-description-checklist.md` | Write |

**MUST use Write tool** for all file creation. NEVER use cat/echo/bash redirection — the Write tool ensures atomic writes and error reporting.

**Naming:** Date format `YYYY-MM-DD`. Description in lowercase-with-hyphens.

**Branch convention:** name the feature branch after the plan slug (`feature/YYYY-MM-DD-description`) so `/execute-plan` and `/review-execution` can resolve branch → plan → checklist automatically.

## Guidelines

**For Planner Agent:**

- Be interactive (ask before assuming)
- Be thorough (read all context, research actual code patterns, cite file:line)
- Be skeptical (question vague requirements, verify assumptions with code)
- Never execute (planning only — no code changes, no tests, no builds)
- Stay at phase altitude: Goal + one-line task summaries only — no agents, no checkboxes, no per-task validation, no code (data structures excepted, after confirmation)

**For Checklist Generator:**

- Decompose each plan task summary into executable tasks and locate the real files
- Emit every task in the canonical block (`task-template.md`) — exact field labels
- Every task needs an assigned agent (6-tier) — the checklist OWNS agent selection
- Include skill recommendations
- Identify dependencies for parallel execution
- Specify validation commands per framework

## Error Handling

| Scenario                     | Action                                                           |
| ---------------------------- | ---------------------------------------------------------------- |
| Missing context/requirements | Report what's missing, ask specific questions, don't proceed     |
| Developer doesn't confirm    | Listen to feedback, revise plan, re-present for review           |
| Ambiguous confirmation       | Clarify: "Should I make changes first, or is the plan approved?" |
| Checklist generation fails   | Report which tasks couldn't be assigned, ask for guidance        |

## Supporting Files

- **Canonical task block + altitude contract**: `${CLAUDE_SKILL_DIR}/task-template.md`
- **Interaction templates, spawn prompts, naming**: `${CLAUDE_SKILL_DIR}/reference.md`
