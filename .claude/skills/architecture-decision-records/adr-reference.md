# ADR Reference Guide

This file contains detailed ADR templates, patterns, and anti-patterns. See SKILL.md for the core workflow.

---

## ADR Template Structure

<template-structure>

### Required Sections

<section name="frontmatter" required="true">
```markdown
---
title: [Short Title]
status: Proposed | Accepted | Rejected | Deprecated | Superseded
date: YYYY-MM-DD
deciders: [List of people involved]
---
```
</section>

<section name="context" required="true">
**Context Section**

- Why is this decision needed?
- What is the problem?
- What forces are at play?

**Guiding questions:**
1. "What is the current situation?"
2. "What problem are we trying to solve?"
3. "What constraints exist?"
</section>

<section name="decision" required="true">
**Decision Section**

- What specific approach will we take?
- How will we implement it?
- What technologies/patterns?

**Guiding questions:**
1. "What specific approach will we take?"
2. "What technologies/patterns will we use?"
3. "What will change in the codebase?"
</section>

<section name="consequences" required="true">
**Consequences Section**

<positive>
**Positive Consequences:**
- What problems does this solve?
- What becomes easier?
- What performance/security gains?
</positive>

<negative>
**Negative Consequences:**
- What new complexity?
- What becomes harder?
- What risks introduced?
</negative>

<mitigations>
**Mitigations:**
- How do we address each negative?
- What reduces risks?
</mitigations>

**Constraint:** MUST include both positive AND negative consequences.
</section>

<section name="alternatives" required="true">
**Alternatives Section**

List 2-4 alternatives with trade-offs and reasons for rejection.

<for-each-alternative>
1. Describe the approach
2. List pros and cons
3. Explain why not chosen
</for-each-alternative>

- Minimum: 2 alternatives
- Optimal: 3-4 alternatives
</section>
</template-structure>

---

## Common ADR Patterns

<pattern type="technology-selection">
### Technology Selection ADR

```markdown
# N. Use [Technology] for [Purpose]

## Context
Need [capability] for [use case]. Current approach [limitations].

## Decision
Adopt [technology] because:
1. [Reason 1]
2. [Reason 2]

Applied to: [scope]

## Consequences
Positive: [benefits]
Negative: [costs]
Mitigations: [how we address costs]

## Alternatives Considered
- [Alt 1]: [pros/cons, why not chosen]
- [Alt 2]: [pros/cons, why not chosen]
```
</pattern>

<pattern type="architecture-pattern">
### Architecture Pattern ADR

```markdown
# N. Adopt [Pattern] for [Use Case]

## Context
Problem with current approach, why change needed

## Decision
Standard pattern: [description]
Applied to: [scope]
Exceptions: [if any]

## Consequences
Consistency: Improved
Learning curve: Acceptable
Migration: Plan outlined

## Alternatives Considered
- Current approach - why insufficient
- Alternative pattern - why not chosen
```
</pattern>

<pattern type="deprecation">
### Deprecation ADR

```markdown
# N. Deprecate [Old Approach]

## Context
Why old approach no longer suitable

## Decision
Deprecate [old approach] in favor of [new approach]
Timeline: [migration plan]

## Consequences
Migration effort: [scope]
Benefits after migration: [list]

References:
- Superseded by: ADR-XXX
```
</pattern>

---

## Anti-Patterns to Avoid

<anti-pattern name="too-vague">
**Too Vague / Not Specific**
- Wrong: "We'll use microservices" (not specific enough)
- Right: "We'll split API into 3 services: Auth, Core, Analytics with gRPC communication"
</anti-pattern>

<anti-pattern name="no-alternatives">
**No Alternatives Documented**
- Wrong: Only documents chosen approach
- Right: Shows 3-4 alternatives considered with trade-offs
</anti-pattern>

<anti-pattern name="missing-consequences">
**Missing Consequences Analysis**
- Wrong: No trade-off analysis or only positive consequences
- Right: Lists both benefits and costs with mitigations
</anti-pattern>

<anti-pattern name="implementation-details">
**Implementation Details Instead of Decisions**
- Wrong: "Changed line 42 to use Zod"
- Right: "Standardized on Zod for all new validation"
</anti-pattern>

<anti-pattern name="non-architectural">
**Creating ADRs for Non-Architectural Changes**
- Wrong: Bug fixes, feature specs, temporary workarounds
- Right: Technology choices, architecture patterns, standards
</anti-pattern>

---

## Status Lifecycle

```
NEW DECISION
     |
Status: Proposed
     |
TEAM REVIEW --> Rejected (stop)
     |
Status: Accepted
     |
IMPLEMENTATION
     |
Status: Implemented
     |
EVOLUTION --> Superseded by ADR-XXX
           --> Deprecated (explain why)
```

---

## Integration with Other Skills

- **architecture-standards**: Provides context for architecture decisions
- **security-patterns**: Guides security-related ADRs
- **performance-optimization**: Informs performance-related decisions
- **testing-patterns**: Influences testing strategy ADRs
