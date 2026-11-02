# Canonical Checklist Task Template

This is the **single source of truth** for how one task is written in a checklist.
`checklist-generator` MUST emit every task in exactly this shape, and `execute-plan`
reads/updates these exact field labels. Do not invent variant labels (`**Agent**`,
`Agent:`, etc.) — the canonical agent field is **`**Assigned Agent**`**.

## The altitude contract (plan vs checklist)

| Artifact                              | Altitude                 | Owns                                                                                                                                                          | MUST NOT contain                                                                                                              |
| ------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Plan** (`planner`)                  | WHAT / WHY — phase-level | Goal + one-line **task summaries** per phase; data-structure proposals; risks; out-of-scope; ADR links                                                        | `[ ]` task checkboxes, agent assignments, skills, per-task validation commands, implementation code snippets, status tracking |
| **Checklist** (`checklist-generator`) | HOW / WHO — task-level   | Decomposing each plan task summary into executable tasks, **locating the real files**, assigning the agent (6-tier), skills, dependencies, validation, status | —                                                                                                                             |

The plan names _what_ needs doing; the checklist decides _who_ does it, _which files_,
and _how it is verified_. Agent selection lives ONLY in the checklist.

## Canonical task block

```markdown
- [ ] **Task X.Y**: <imperative summary — what to do; file:line refs ok>
  - **Files**: <target file path(s)> — <brief per-file note>
  - **Assigned Agent**: <agent-name> (Tier N - <category>)
  - **Skills**: <comma-separated skills, or "None">
  - **Dependencies**: None | Task X.Y (<reason>)
  - **Validation**: <command(s) or observable success criterion>
  - **Status**: Pending
```

### Field rules

- **Task line** — restates the plan's task _summary_ as an imperative. This is the only
  thing carried up from the plan; the checklist expands everything else itself.
- **Files** — REQUIRED. `checklist-generator` locates the real target file(s) for the
  task (the plan does not). `execute-plan` overwrites this with the actual files touched
  on completion.
- **Assigned Agent** — REQUIRED. Chosen by `checklist-generator` via the 6-tier system.
  Always include the `(Tier N - <category>)` annotation. The plan never sets this.
- **Skills** — REQUIRED (use `None` if genuinely none apply).
- **Dependencies** — REQUIRED. `None`, or `Task X.Y (reason)`. Phase-doc tasks (X.X)
  block the next phase's first task per `checklist-generator` rules.
- **Validation** — REQUIRED. The command(s) or observable criterion that proves the task
  is done.
- **Status** — REQUIRED. Starts `Pending`; `execute-plan` flips it to `✅ Complete` (or
  `✅ Complete (reconciled — …)`) in the same edit that ticks the checkbox.

### Optional fields (use only when they add signal)

- **Constraint** — a hard rule the agent must not violate (place right after the task line).
- **Target App** — the app/package the work lands in — when **Files** alone is ambiguous.

## Worked example

```markdown
- [ ] **Task 1.1**: Create `@Public(reason: string)` decorator
  - **Files**: `apps/server/src/common/decorators/public.decorator.ts` (new) — export `IS_PUBLIC_KEY` + `Public()`
  - **Constraint**: `reason` is a REQUIRED string — must not compile with zero args (it is the audit trail)
  - **Assigned Agent**: nestjs-developer (Tier 6 - General Developer)
  - **Skills**: security-patterns, code-quality-standards, type-safety-patterns
  - **Dependencies**: None
  - **Validation**: `npx tsc --noEmit --skipLibCheck`, `pnpm test`
  - **Status**: Pending
```
