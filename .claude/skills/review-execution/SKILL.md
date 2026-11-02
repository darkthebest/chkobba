---
name: review-execution
description: Post-execution review of a finished plan. Validates the checklist plus the git diff against project standards (checklist completion, security, architecture, code standards, design patterns, framework correctness, tests, docs). Read-only — outputs a severity-ranked report under context/reviews/. Use after /execute-plan finishes, before committing or opening a PR/MR.
category: review
framework: [generic]
argument-hint: '[checklist-path] [base-branch]'
allowed-tools: Task
disable-model-invocation: true
---

# /review-execution

Spawn the `plan-execution-reviewer` agent to verify a finished implementation.

## Arguments

- `$1` (optional) — Path to a checklist under `context/checklists/`. Omit to resolve it from the current branch name (see below).
- `$2` (optional) — Base branch to diff against. Defaults to `main`.

## Resolving the checklist from the branch

The convention is **branch name = plan name** (plan `context/plans/2026-06-12-webhook-retry.md` → branch `2026-06-12-webhook-retry`). When no checklist path is passed, the agent resolves it from the current branch so agent-driven reviews and CI pipelines map branch → plan → checklist without a human picking the file:

1. **Exact match** — `context/checklists/<branch>-checklist.md`.
2. **Prefix-tolerant** — strips a leading workflow prefix (`feature/`, `feat/`, `fix/`, `bugfix/`, `hotfix/`, `chore/`, `refactor/`, `docs/`) then matches.
3. **Fallback** — if the branch doesn't follow the convention, falls back to the most recent checklist and notes in the report that resolution was by recency, not branch name.

## What it does

1. Resolves the checklist (provided, by branch name, or most recent) and matching plan.
2. Computes `git diff <base>...HEAD` and categorizes changed files by app/package.
3. Loads project standards (`CLAUDE.md`, installed skills) so the review is measured against this project's rules, not generic ones.
4. Spawns **8 parallel sub-agents** in one message, one per validation dimension:
   - **Checklist completion** — every task done? scope creep?
   - **Security** — authn/authz, tenant isolation, input validation, secrets, OWASP
   - **Architecture & data flow** — layering, events/audit trail, cache invalidation, transaction boundaries
   - **Code standards & SOLID** — naming, complexity, conventions, project import rules
   - **Design patterns** — appropriate use, anti-pattern detection, reuse of existing code
   - **Framework correctness** — per-framework contracts for the changed paths (backend, frontend, migrations)
   - **Tests** — coverage for new code, AAA, no skipped tests
   - **Docs** — API docs, JSDoc, ADRs, Diataxis bucket
5. Synthesizes findings into a single severity-ranked report.
6. Writes the report to `context/reviews/<checklist-basename>-review.md`.
7. Prints a brief chat summary with verdict + top blockers + report path.

## Output verdicts

- **SHIP** — no blockers, only nits/minors. Safe to commit/push.
- **FIX BLOCKERS** — one or more blocker findings. Must fix before merge.
- **NEEDS REVIEW** — majors only; human judgment required.

## Severity rubric

| Severity    | Meaning                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| **blocker** | Must fix before merge. Breaks auth, tenant isolation, data integrity, or violates an ADR.                   |
| **major**   | Should fix before merge. Missing audit/event emit, broken framework contract, untested new feature.         |
| **minor**   | Should fix soon. Naming, SOLID violations that don't break behavior, JSDoc gaps on internal APIs.           |
| **nit**     | Optional. Style, formatting lint doesn't catch, opinion-only design suggestions.                            |

## Constraints

- Strictly **read-only** for source code. The agent never edits, formats, or auto-fixes.
- Only writes one file: the review report under `context/reviews/`.
- Restricted Bash use: read-only git commands only (`diff`, `log`, `status`, `show`, `rev-parse`, `merge-base`, `ls-files`).

## Where it sits in the flow

```
/create-plan  →  /execute-plan  →  /review-execution  →  /commit
```

`/execute-plan` runs unattended and deliberately does not commit. `/review-execution` is the
quality gate between a finished working tree and a commit. It reviews whatever state the
checklist is in — an unfinished checklist will (correctly) surface as findings in the
**Checklist completion** dimension.

## Examples

```
/review-execution
/review-execution context/checklists/2026-05-04-add-user-roles-checklist.md
/review-execution context/checklists/2026-05-06-webhook-retry-checklist.md main
```

## Invocation

Launch the `plan-execution-reviewer` agent with the user-provided arguments:

```
checklist_path: $1 (or empty → agent resolves from current branch name, then falls back to most recent)
base_branch: $2 (or empty → defaults to "main")
```

**Spawn it SYNCHRONOUSLY — `run_in_background: false`.** The Task tool may background a
sub-agent by default, which is wrong here: the report the agent writes *is* this skill's
entire output, so the turn must not end before it exists. Backgrounding also breaks headless
runs (`claude -p`), where the main loop finishing early leaves the reviewer orphaned and the
report never lands. Await the agent's result, then summarize it.

The agent owns the rest of the workflow (parallel validators, synthesis, report write, chat summary).
