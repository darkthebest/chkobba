---
name: maintain
description: Deep maintenance workflow that audits installed agents and skills, researches current best practices for the project's frameworks online, and interactively proposes additions, updates, and removals. Run periodically to keep workflow tooling aligned with evolving project needs and industry standards.
category: workflow
framework: [generic]
---

# Maintain Command

This command runs a comprehensive audit of your installed Claude Code workflow tooling (agents and skills), researches current best practices for your specific stack online, and walks you through an interactive proposal review to keep everything sharp and relevant.

> **Tip:** For the best experience, run `cc-init maintain` from your terminal instead. The CLI version has direct access to the full template catalog and can install new agents and skills during the session. When invoked as `/maintain` inside Claude Code, the catalog path and template source files must be discoverable from within your project (see Execution Instructions for path details).

<role>
Workflow maintenance orchestrator
</role>

<mission>
Surface the gap between your current installed tooling and what a well-maintained, best-practice setup would look like for your specific project stack — then let you decide, one proposal at a time, what to adopt.
</mission>

<overview>

## What This Does

`/maintain` runs four phases:

1. **Audit** — Scans your installed agents and skills, cross-references against the full template catalog, detects your project profile, and identifies gaps, outdated templates, and relevance mismatches
2. **Research** — Spawns parallel web researchers for each detected framework to find current best practices, new patterns, and community-validated approaches
3. **Synthesis** — Cross-references audit findings + research to generate a ranked, specific proposal list
4. **Interactive Review** — Walks through proposals one by one: you accept, skip, modify, or ask why

</overview>

<workflow>

## Four-Phase Workflow

<phase number="1" name="audit">

### Phase 1: Audit (Parallel)

Spawn three agents in parallel:

**Agent 1: `workflow-auditor`**
- Reads all installed `.claude/agents/` and `.claude/skills/`
- Cross-references against `templates/catalog.json`
- Detects project profile from `package.json`
- Outputs: gaps, outdated templates, relevance mismatches, custom templates

**Agent 2: `codebase-pattern-finder`**
- Scans source code for actual patterns in use
- Identifies architectural patterns, design patterns, common operations
- Outputs: what patterns the codebase actually uses (e.g., repository pattern, factory, observer, CQRS)

**Agent 3: `codebase-analyzer`**
- Analyzes project structure, module organization, complexity
- Identifies domains (auth, payments, notifications, etc.) and technical layers
- Outputs: project domains, architectural layers, integration surface

Collect all three outputs before proceeding to Phase 2.

</phase>

<phase number="2" name="research">

### Phase 2: Research (Parallel)

From Phase 1's project profile, extract the list of detected frameworks/libraries.

For each detected framework, spawn a `web-search-researcher` agent in parallel:

```
For each framework in [detected_frameworks]:
  Spawn web-search-researcher with:
    "Research current best practices for [framework] in [year]:
    - Most-recommended agents, tools, and workflow patterns for Claude Code users
    - Common gaps in developer tooling when using [framework]
    - Anti-patterns and outdated approaches still commonly used
    - New patterns gaining adoption in the community (2024-2025)
    - Specific skills or agents that would improve code quality and velocity"
```

Collect all research outputs before proceeding to Phase 3.

</phase>

<phase number="3" name="synthesis">

### Phase 3: Synthesis

Cross-reference all Phase 1 + Phase 2 findings to build a **ranked proposal list**.

Each proposal must have:
- **Type**: ADD | UPDATE | REMOVE
- **Target**: agent name or skill name
- **Priority**: HIGH | MEDIUM | LOW
- **Rationale**: specific finding that justifies this (gap + research backing, or outdated + new pattern)
- **Change**: what would be added, updated, or removed

**Ranking criteria:**
- HIGH: gap confirmed by both audit (missing) AND research (best practice says you need it)
- MEDIUM: audit gap with weak research signal, or outdated template with meaningful drift
- LOW: relevance mismatch, minor update, or research-only signal with no audit gap

**Proposal types:**

```
ADD agent/skill:
  Condition: in catalog but not installed AND relevant to project profile
  Boost to HIGH if: research identifies it as a best-practice gap for the detected framework

UPDATE agent/skill:
  Condition: installed template lags source (outdated) OR installed template missing sections
  that research identifies as important for this stack
  Include: specific sections or patterns that would change

REMOVE agent/skill:
  Condition: installed template framework mismatches project profile AND
  no evidence of actual use in the codebase
  Note: never propose REMOVE for custom templates (not in catalog)
```

Sort proposals: HIGH first, then MEDIUM, then LOW.

Announce to the user:

```
Audit and research complete.

Project profile: [frameworks detected]
Templates audited: [N agents, N skills]
Proposals generated: [N total — X high, Y medium, Z low]

Ready to review proposals. I'll walk through them one at a time.
You can: accept / skip / modify / ask why — at each step.

Starting with HIGH priority proposals...
```

</phase>

<phase number="4" name="interactive-review">

### Phase 4: Interactive Review

Walk through proposals one at a time in priority order.

**For each proposal, present:**

```
─────────────────────────────────────────
[N/TOTAL] [PRIORITY] — [TYPE] [TARGET]
─────────────────────────────────────────

[TYPE]: [agent/skill name]
Category: [category]
[If ADD]: Not currently installed. Available in the template catalog.
[If UPDATE]: Currently installed. Source version has meaningful differences.
[If REMOVE]: Currently installed but [framework] not detected in project.

Why: [specific rationale combining audit finding + research backing]

[If ADD]: What it does: [description from catalog]
[If UPDATE]: What changes: [specific sections/patterns that would update]
[If REMOVE]: Safe to remove because: [no code usage detected + profile mismatch]

Accept / Skip / Modify / Ask why?
```

**Handling user responses:**

- **Accept** → Execute immediately (see Execution section), then move to next proposal
- **Skip** → Move to next proposal, no change
- **Modify** → Ask what they want changed, apply modification, confirm, then execute
- **Ask why** → Provide deeper context (source research, specific audit finding), then re-present the proposal

**After all proposals reviewed:**

```
Maintenance session complete.

Summary:
- Accepted: [N] changes applied
- Skipped: [N]
- Modified and applied: [N]

Your workflow tooling is now up to date.
```

</phase>

</workflow>

---

<execution-instructions>

## EXECUTION INSTRUCTIONS

<step id="1" name="Launch Phase 1 Audit">

### Step 1: Launch Phase 1 — Parallel Audit

Spawn three agents simultaneously using parallel Task calls:

**workflow-auditor:**
```
Task({
  subagent_type: "workflow-auditor",
  description: "Audit installed agents and skills",
  prompt: `Audit the installed workflow tooling for this project.

Read all files in .claude/agents/ and .claude/skills/, cross-reference against
templates/catalog.json, and detect the project profile from package.json.

Produce the full structured audit report as specified in your instructions.`
})
```

**codebase-pattern-finder:**
```
Task({
  subagent_type: "codebase-pattern-finder",
  description: "Find patterns in use across codebase",
  prompt: `Scan the project source code (exclude .claude/, node_modules/, dist/) and identify:

1. Design patterns actively used (factory, repository, observer, strategy, decorator, CQRS, etc.)
2. Architectural patterns (layered, event-driven, microservices, monorepo structure, etc.)
3. Common operations that repeat across the codebase (could benefit from shared tooling)
4. Domains/bounded contexts evident in the code structure

Return a concise structured list. Include file:line references for each pattern found.`
})
```

**codebase-analyzer:**
```
Task({
  subagent_type: "codebase-analyzer",
  description: "Analyze project structure and domains",
  prompt: `Analyze the top-level project structure and identify:

1. Main application domains (auth, payments, notifications, users, etc.)
2. Technical layers present (API, services, repositories, UI, workers, etc.)
3. External integrations (third-party APIs, message queues, caches, etc.)
4. Project complexity level (small/medium/large based on module count and depth)

Read package.json, the top-level directory structure, and key index/module files.
Return a concise structured report. Include file references.`
})
```

Wait for all three to complete before proceeding to Step 2.

</step>

<step id="2" name="Launch Phase 2 Research">

### Step 2: Launch Phase 2 — Parallel Research

From the workflow-auditor's project profile output, extract detected frameworks.

For each framework detected, spawn a `web-search-researcher` in parallel:

```
Task({
  subagent_type: "web-search-researcher",
  description: `Research best practices for [framework]`,
  prompt: `Research current best practices for [FRAMEWORK] development workflows in 2024-2025.

Focus specifically on:
1. Recommended Claude Code agents and skills that [FRAMEWORK] developers find most valuable
2. Common developer workflow gaps when working with [FRAMEWORK]
3. Outdated patterns/approaches still common but now superseded
4. New tooling patterns gaining adoption (AI-assisted development, code generation, testing)
5. Specific areas where better tooling improves code quality or velocity (testing, security, i18n, etc.)

Synthesize findings into a concise list of workflow tooling recommendations.
Cite sources for each recommendation.`
})
```

Wait for all researchers to complete before proceeding to Step 3.

</step>

<step id="3" name="Synthesize Proposals">

### Step 3: Synthesize Proposals

Cross-reference all findings from Steps 1 and 2.

Build the proposal list as described in Phase 3. Sort by priority. Announce the summary to the user.

</step>

<step id="4" name="Interactive Review Loop">

### Step 4: Interactive Review Loop

Present proposals one at a time as described in Phase 4.

**On ACCEPT or MODIFY+confirm — execute the change:**

**For ADD:**
- Read source template from `templates/agents/[name].md` or `templates/skills/[name]/SKILL.md`
- Write to `.claude/agents/[name].md` or `.claude/skills/[name]/SKILL.md`
- Confirm: `✓ Added [name]`

**For UPDATE:**
- Read source template from `templates/agents/[name].md` or `templates/skills/[name]/SKILL.md`
- Overwrite the installed file at `.claude/agents/[name].md` or `.claude/skills/[name]/SKILL.md`
- Confirm: `✓ Updated [name]`

**For REMOVE:**
- Before deleting, confirm once more: `This will delete .claude/[path]. Confirm? (yes/no)`
- On confirmation: delete the file
- Confirm: `✓ Removed [name]`

Continue loop until all proposals reviewed.

</step>

</execution-instructions>

<guidelines>

## Important Guidelines

1. **Never modify custom templates (not in catalog) without explicit user instruction**
   - Custom templates are the user's own work — treat them as read-only during maintenance

2. **Never auto-accept — every change requires explicit user confirmation**
   - The interactive review is the core value. Don't batch or skip it.

3. **Research is per-framework, not generic**
   - A NestJS project and a React project need different research queries
   - Generic "best practices" searches produce low-signal results

4. **REMOVE proposals require higher justification**
   - Only propose REMOVE if: framework mismatch is clear AND codebase-pattern-finder found no evidence of related patterns in use
   - When in doubt, propose UPDATE instead

5. **Respect the proposal ranking**
   - HIGH proposals first — these are the ones with both audit evidence and research backing
   - Users may stop the session early; HIGH items should be seen first

6. **Keep proposal presentation scannable**
   - One screen per proposal maximum
   - The rationale should be one sentence, not a paragraph

</guidelines>
