---
name: research
description: Interactive pre-planning research workflow that explores ideas, investigates options,
  and helps make informed decisions through structured phases with optional consensus analysis.
  Use when researching options, exploring ideas before planning, comparing alternatives,
  investigating technical approaches, or preparing for /create-plan.
category: workflow
framework: [generic]
---

# Research Command

This command initiates an interactive pre-planning research session that wraps the `research-advisor` agent with enhanced workflow integration.

<role>
Pre-planning research orchestrator
</role>

<mission>
Formalize the research -> consensus -> plan handoff workflow. Provide a structured path from initial exploration through informed decision-making to actionable planning.
</mission>

<overview>

## Overview

The `/research` command orchestrates a three-stage research process:

1. **Research Stage** - Spawn `research-advisor` agent for structured exploration (8-phase interactive workflow)
2. **Consensus Stage** (optional) - Offer `zen:consensus` for stress-testing options with a multi-perspective panel
3. **Handoff Stage** - Structure findings and decisions for `/create-plan` consumption

</overview>

<workflow>

## Three-Stage Workflow

<stage number="1" name="research">

### Stage 1: Research (Interactive)

**Agent**: `research-advisor`

**Process:**

1. Pass developer's research topic/question to the agent
2. Agent runs its 8-phase interactive workflow:
   - Explore topic using parallel web-search-researcher agents
   - Clarify unclear requirements
   - Present findings (facts only, no questions)
   - Present options with pros/cons
   - Wait for user decision
   - Ask implementation questions
   - Prepare handoff context
3. At Phase 5 (options presented), this skill intervenes to offer zen:consensus

**Key**: The research-advisor handles ALL research logic. This skill does NOT reimplement the 8-phase workflow.

</stage>

<stage number="2" name="consensus">

### Stage 2: Consensus (Optional)

**Tool**: `zen:consensus` (MCP)

**When to offer**: After research-advisor presents options (Phase 5), proactively suggest:

```
Would you like to run zen:consensus on these options? It spawns a 3-agent panel
(critical, neutral, advocate) to stress-test the alternatives before you decide.

This can help surface risks or benefits you might not have considered.
```

**Important**: The research-advisor agent itself does NOT suggest zen:consensus (by design). This skill wrapper is the right layer to surface this capability proactively.

**If user accepts:**

- Guide them to invoke zen:consensus with the options context
- After consensus completes, resume with research-advisor Phase 6 (user decision)

**If user declines:**

- Continue normally with research-advisor Phase 6

</stage>

<stage number="3" name="handoff">

### Stage 3: Handoff to /create-plan

**After the research-advisor completes its workflow**, structure the output for planning:

```
Research complete! Here's a structured summary for planning:

**Confirmed Approach:**
- [Key decision from research]
- [Implementation details confirmed]

**Key Findings:**
- [Discovery 1 with references]
- [Discovery 2 with references]

**Decisions Made:**
- [Decision 1 - rationale]
- [Decision 2 - rationale]

**ADRs to Create:**
- [Architectural decision identified during research]

**Open Questions for Planning:**
- [Any remaining questions for the planner]

**Next Step:**
Run `/create-plan` to create an implementation plan based on this research.
The planner will have access to this conversation context.
```

</stage>

</workflow>

---

<execution-instructions>

## EXECUTION INSTRUCTIONS

**You (Claude) must follow these steps in order:**

<step id="1" name="Spawn Research Advisor">

### Step 1: Spawn the Research Advisor Agent

<agent-delegation type="research-advisor">

Use the Task tool to spawn the research-advisor agent:

<agent-prompt name="research-advisor">

```
Task({
  subagent_type: "research-advisor",
  description: "Interactive research session",
  prompt: `Help the developer research and explore this topic through your structured 8-phase workflow.

**Research topic**: $ARGUMENTS

<responsibilities>

**Your responsibilities:**

1. Research the topic thoroughly using parallel web-search-researcher agents
2. Explore the codebase for current state understanding
3. Present findings clearly (facts only, no embedded questions)
4. Present distinct options with pros/cons
5. Wait for user decision (they may use zen:consensus)
6. Ask implementation-specific questions after decision
7. Prepare handoff context for the planner

</responsibilities>

<critical-output>

**CRITICAL:** You MUST report back with:
- FINDINGS: [key discoveries]
- OPTIONS_PRESENTED: [list of options]
- USER_DECISION: [chosen approach]
- IMPLEMENTATION_DETAILS: [answers to implementation questions]
- HANDOFF_CONTEXT: [structured summary for planner]

</critical-output>
`
})
```

</agent-prompt>

</agent-delegation>

</step>

<step id="2" name="Offer Consensus at Options Stage">

### Step 2: Offer zen:consensus at Options Stage

**After the research-advisor presents options (Phase 5)**, proactively offer:

```
Before you decide, would you like to run zen:consensus on these options?

It spawns a 3-agent panel (critical thinker, neutral analyst, advocate) to
stress-test the alternatives. This can surface risks or benefits that might
not be obvious from the research alone.
```

**If user accepts**: Help them invoke zen:consensus, then resume research flow.
**If user declines**: Continue with research-advisor's decision phase.

</step>

<step id="3" name="Flag Architectural Decisions">

### Step 3: Flag Architectural Decisions

**During the research session, watch for architectural decision signals:**

- Technology/library choices ("Should we use X or Y?")
- Architecture pattern decisions
- Database, caching, auth, or API design choices

**When detected, note for the planning phase:**

```
This looks like an architectural decision. When we move to planning,
the `architecture-decision-records` skill should document this properly
with context, alternatives, and trade-offs.
```

**Do NOT create ADRs during research** -- flag them for the planning phase where the ADR skill handles the full workflow.

</step>

<step id="3.5" name="Gate New Dependencies">

### Step 3.5: Gate New Dependencies

**Whenever an option under discussion introduces a package the project does not already
depend on**, the dependency health gate must have been run before the developer is asked to
decide. The criteria and the check commands live in exactly one place: the
`dependency-integration` skill's `<dependency-health-gate>` section. Do not restate or
invent thresholds here.

`research-advisor` has no shell. `web-search-researcher` is the agent that runs the checks.
If an option reaches the decision stage with an unchecked package, that is a gap in the
research — send it back rather than letting the developer choose blind.

**What must be on the table before the decision:**

- One Health line per proposed package — last publish, weekly downloads, maintainer count,
  issue/PR trend, whether types ship, open advisories, license
- Any red line hit (deprecated · archived · dormant 3+ years with an unanswered tracker ·
  unpatched advisory), stated plainly with a maintained alternative beside it
- Rejected candidates, kept visible with their evidence

Low download counts and rare releases are **reported, not disqualifying** — a small
finished library and a niche-but-correct package both look "quiet". The judgment is the
developer's; the omission is the defect.

</step>

<step id="4" name="Structure Handoff">

### Step 4: Structure Handoff for /create-plan

After the research-advisor completes, provide structured context:

```
Research session complete!

**Summary for /create-plan:**
- Confirmed approach: [chosen option with details]
- Key findings: [discoveries with references]
- Decisions made: [list with rationale]
- ADRs needed: [architectural decisions to document]
- Open questions: [anything remaining for planning]

**Next step:**
Run `/create-plan` to create an implementation plan.
The planner will reference this research context.
```

</step>

</execution-instructions>

<developer-interaction-flow>

## Developer Interaction Flow

<interaction type="initial-prompt">

### Initial Prompt (if no arguments)

```
I'll help you research and explore this topic before planning.

**What would you like to research?**

Examples:
- "Research upgrading to React 19"
- "Explore authentication options for our API"
- "Compare BullMQ vs Agenda for background jobs"
- "Investigate caching strategies for our dashboard"

I'll spawn a research advisor to explore this thoroughly, then help you
make an informed decision before moving to planning.
```

</interaction>

<interaction type="at-options">

### At Options Stage (zen:consensus offer)

```
The research advisor has presented your options.

Before you decide, would you like to run zen:consensus?
It provides a multi-perspective stress-test of the alternatives.

Otherwise, go ahead and pick your preferred option.
```

</interaction>

<interaction type="after-decision">

### After Decision (handoff offer)

```
Great decision! Here's what we've established:

[Structured summary]

Ready to move to planning? Run `/create-plan` with this context,
and the planner will build on our research.
```

</interaction>

</developer-interaction-flow>

<guidelines>

## Important Guidelines

1. **Delegate, Don't Reimplement**
   - The research-advisor has a complete 8-phase workflow
   - This skill adds: easy invocation, zen:consensus surfacing, structured handoff
   - Never duplicate research logic

2. **Proactively Offer Consensus**
   - The research-advisor does NOT suggest zen:consensus (by design)
   - This skill IS the right layer to offer it
   - Offer at the options stage, before the user decides

3. **Flag ADRs, Don't Create Them**
   - Note architectural decisions during research
   - Recommend the `architecture-decision-records` skill for planning phase
   - Research is for exploration, not documentation

4. **Never Hand Over an Unchecked Dependency**
   - Any option that adds a new package carries its Health line into the handoff
   - The gate is defined once, in the `dependency-integration` skill
   - A red line is escalated to the developer, never silently dropped or accepted

5. **Structure the Handoff**
   - The handoff to `/create-plan` should be structured and actionable
   - Include: approach, findings, decisions, ADR needs, open questions
   - Make it easy for the planner to pick up where research left off

</guidelines>
