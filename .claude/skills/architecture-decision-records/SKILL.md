---
name: architecture-decision-records
description: Expert in creating and managing Architecture Decision Records (ADRs) to document architectural decisions and design decisions during planning. Use when recording architecture decisions, evaluating technology choices, documenting significant design decisions, comparing multiple alternatives, or establishing standards and conventions.
category: architecture
framework: [generic]
---

<!--
PLACEHOLDERS:
- docs: Path to documentation directory (e.g., docs)
-->

# Architecture Decision Records (ADR) Skill

<role>Guide creation and management of Architecture Decision Records during planning and development</role>

<resources>
  <file path="${CLAUDE_SKILL_DIR}/adr-reference.md">ADR templates, patterns, anti-patterns, and status lifecycle</file>
</resources>

<overview>
## Core Expertise

- Recognizing when decisions warrant ADRs
- Guiding ADR creation process
- ADR lifecycle management
- Integrating ADRs into planning workflow
</overview>

<trigger-conditions>
## Recognition Triggers

<activation-signals>
**WATCH FOR THESE SIGNALS - Immediately suggest creating an ADR when you hear:**

- "Should we use X or Y?"
- "What's the best approach for..."
- "Which library/framework should we..."
- Discussion of trade-offs between approaches
- Evaluating multiple technology options
- Making security or performance decisions
- Choosing between design patterns or architectures
</activation-signals>

<action-on-trigger>
**WHEN TRIGGERED - Respond:**

This sounds like an architectural decision! I notice we're deciding between [X and Y] for [purpose]. This should be documented in an ADR.

Would you like me to:
1. Create an ADR now?
2. Continue the discussion first?
3. Skip the ADR for now?
</action-on-trigger>
</trigger-conditions>

<decision-matrix>
## When to Create an ADR

<mandatory-categories>
### ALWAYS Create ADRs For

- **Architecture Patterns**: Monorepo structure, layered architecture, module boundaries
- **Technology Choices**: Framework selection, database selection, auth systems
- **Standards & Conventions**: Validation library, API design, testing strategies
- **Security Patterns**: Authentication mechanisms, authorization models
- **Performance**: Caching strategies, indexing approaches
- **Integrations**: Third-party services, payment gateways
</mandatory-categories>

<forbidden-scenarios>
### NEVER Create ADRs For

- Bug fixes (use commit messages)
- Feature specifications (use context/plans/)
- Temporary workarounds (use TODO comments)
- Minor refactoring (use PR descriptions)
- Implementation details (use code comments)
</forbidden-scenarios>
</decision-matrix>

<workflow>
## ADR Creation Workflow

<phase name="creation">
### Creation Steps

<step number="1">
**Find next ADR number**
```bash
ls docs/adr/*.md | tail -1
# Increment last number (e.g., 0005 -> 0006)
```
</step>

<step number="2">
**Copy template**
```bash
cp docs/adr/adr-template.md docs/adr/NNNN-short-title.md
```
</step>

<step number="3">
**Fill template sections**
- Status: Start with "Proposed"
- Context: WHY is this decision needed?
- Decision: WHAT specific approach will we take?
- Consequences: Both positive AND negative
- Alternatives: List 2-4 with trade-offs
</step>

<step number="4">
**Update ADR index**
```markdown
| [NNNN](NNNN-title.md) | Title | Proposed | YYYY-MM-DD |
```
</step>
</phase>

<phase name="integration">
### Integration with Plan

If creating ADR during planning workflow:
1. Reference ADR in implementation plan
2. Add to plan context section
3. Include in checklist: `- [ ] Verify implementation follows ADR-NNNN`
</phase>

<phase name="lifecycle">
### Status Transitions

| From | To | When |
|------|----|----|
| none | Proposed | ADR is created |
| Proposed | Accepted | Team consensus |
| Accepted | Implemented | Code merged to main |
| Accepted | Superseded | Better approach found |
| Accepted | Deprecated | No longer applicable |
</phase>
</workflow>

<validation-checklist>
## Before Finalizing an ADR

- [ ] **Clear problem statement** in Context
- [ ] **Specific decision** with implementation details
- [ ] **Both positive AND negative** consequences listed
- [ ] **At least 2 alternatives** considered
- [ ] **Mitigations** for negative consequences
- [ ] **Status** is accurate (Proposed/Accepted)
- [ ] **Date** is present
- [ ] **ADR number** is sequential
- [ ] **Index updated** in docs/adr/README.md
</validation-checklist>

<examples>
## Examples

See `docs/adr/` for examples:

- **ADR-0001**: Nx Monorepo - Technology selection
- **ADR-0002**: Zod Validation - Library standardization
- **ADR-0003**: OpenFGA Authorization - Architecture pattern
</examples>

---

**See also**: [adr-reference.md](${CLAUDE_SKILL_DIR}/adr-reference.md) for detailed templates, patterns, and anti-patterns.
