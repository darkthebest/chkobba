---
name: create-handoff
description: Creates thorough handoff documents capturing task status, learnings, and artifacts for seamless session transitions. Use when ending a session, handing off work, documenting progress, creating handoffs, or pausing development work.
category: workflow
framework: [generic]
---

<!--
PLACEHOLDERS:
- chkobba: Repository name
- @chkobba/rules: Shared types package path
-->

# Create Handoff

<role>
Handoff document generator that creates thorough, concise session transition documents for agent-to-agent work continuity.
</role>

<purpose>
Compact and summarize conversation context into structured handoff documents without losing key details of ongoing work.
</purpose>

<quality-principles>
  <principle name="thoroughness">Include all critical information for work resumption</principle>
  <principle name="conciseness">Balance detail with readability - avoid overwhelming future agents</principle>
  <principle name="precision">Use specific file:line references over large code blocks</principle>
  <principle name="traceability">Always link back to source documents (plans, checklists)</principle>
</quality-principles>

## Process

<workflow>
  <step number="1" name="gather-metadata">
    <description>Collect all context metadata before writing</description>
    <tools>
      <tool>Read tool for files</tool>
      <tool>Glob tool for directory listing</tool>
      <tool>Bash (git commands, pwd)</tool>
    </tools>
    <data-to-collect>
      <item name="filepath">
        <pattern>context/handoffs/YYYY-MM-DD_description.md</pattern>
        <rules>
          <rule>YYYY-MM-DD is today's date</rule>
          <rule>description is kebab-case summary of work</rule>
        </rules>
        <examples>
          <example>context/handoffs/2025-01-15_add-context7-integration.md</example>
          <example>context/handoffs/2025-01-15_update-nestjs-agents.md</example>
        </examples>
      </item>
      <item name="workspace-root">pwd command</item>
      <item name="git-branch">git rev-parse --abbrev-ref HEAD</item>
      <item name="git-commit">git rev-parse HEAD</item>
      <item name="apps-involved">From conversation context (api | admin-ui | dts | monorepo-root | multiple)</item>
      <item name="package-changes">Check if packages/types/* modified</item>
    </data-to-collect>
    <output>Complete metadata for YAML frontmatter</output>
  </step>

  <step number="2" name="write-document">
    <description>Create handoff document using template structure</description>
    <input>Metadata from step 1 + conversation context</input>
    <template>See document-template section below</template>
    <output>Complete handoff document</output>
  </step>

  <step number="3" name="complete-notify">
    <description>Save document and notify user</description>
    <actions>
      <action>Save to context/handoffs/ directory</action>
      <action>Respond with completion message and file path</action>
    </actions>
    <response-template>
Handoff created! You can resume from this handoff in a new session by reading the file:

context/handoffs/YYYY-MM-DD_description.md
</response-template>
</step>
</workflow>

## Document Template

<document-template>
  <structure>Use the following template structure</structure>

```markdown
---
date: [Current date and time with timezone in ISO format]
git_commit: [Current commit hash from git rev-parse HEAD]
branch: [Current branch name from git rev-parse --abbrev-ref HEAD]
repository: chkobba
apps_involved: [api | admin-ui | dts | monorepo-root | multiple]
topic: '[Feature/Task Name] Handoff'
tags: [implementation, relevant-component-names]
status: [complete | in-progress | planning]
last_updated: [Current date in YYYY-MM-DD format]
type: handoff
---

# Handoff: {very concise description}

## Task(s)

{description of the task(s) that you were working on, along with the status of each (completed, work in progress, planned/discussed). If you are working on an implementation plan, make sure to call out which phase you are on. Make sure to reference the plan document and/or research document(s) you are working from that were provided to you at the beginning of the session, if applicable.}

## Critical References

{List any critical specification documents, architectural decisions, or design docs that must be followed. Include only 2-3 most important file paths. Leave blank if none.}

### Source Documents (REQUIRED)

- **Plan**: `context/plans/[plan-file].md` (or "N/A - ad hoc task")
- **Checklist**: `context/checklists/[checklist-file].md` (or "N/A")

## Recent changes

{describe recent changes made to the codebase that you made in line:file syntax}

## Learnings

{describe important things that you learned - e.g. patterns, root causes of bugs, or other important pieces of information someone that is picking up your work after you should know. consider listing explicit file paths.}

## Artifacts

{ an exhaustive list of artifacts you produced or updated as filepaths and/or file:line references - e.g. paths to feature documents, implementation plans, etc that should be read in order to resume your work.}

## Action Items & Next Steps

{ a list of action items and next steps for the next agent to accomplish based on your tasks and their statuses}

## Other Notes

{ other notes, references, or useful information - e.g. where relevant sections of the codebase are, where relevant documents are, or other important things you leanrned that you want to pass on but that don't fall into the above categories}

### Handoff Completeness Check (REQUIRED before saving)

- [ ] Plan/checklist references included (or explicitly marked N/A)
- [ ] All tasks have explicit status (completed / in-progress / blocked)
- [ ] Next steps are specific and actionable (not vague)
- [ ] File paths are absolute, not relative
- [ ] Branch name and commit hash included
- [ ] Apps involved correctly identified
```

  <completeness-checklist priority="mandatory">
    <check name="source-references">Plan/checklist references included (or explicitly marked N/A)</check>
    <check name="task-status">All tasks have explicit status (completed / in-progress / blocked)</check>
    <check name="actionable-next-steps">Next steps are specific and actionable (not vague)</check>
    <check name="absolute-paths">File paths are absolute, not relative</check>
    <check name="git-metadata">Branch name and commit hash included</check>
    <check name="app-identification">Apps involved correctly identified</check>
  </completeness-checklist>
</document-template>

---

## Tool Integration

<mcp-tools>
  <tool-category name="file-operations">
    <tool name="Read">Read plans, research docs, previous handoffs</tool>
    <tool name="Glob">List artifacts in directories</tool>
    <tool name="Glob">Check packages/types/ for type changes</tool>
  </tool-category>

  <tool-category name="project-context">
    <tool name="nx-cli">pnpm nx show project &lt;app&gt; (via Bash) for app-specific info</tool>
    <tool name="git-commands">git rev-parse for branch/commit metadata</tool>
    <tool name="bash">pwd for workspace root</tool>
  </tool-category>
</mcp-tools>

<monorepo-patterns>
  <pattern name="package-changes">
    <when>Work involved packages/types/*</when>
    <document>
      <item>List modified type submodules</item>
      <item>Document new exports added</item>
      <item>Note apps affected by type changes</item>
      <item>Include import pattern examples (@chkobba/rules/*)</item>
    </document>
  </pattern>

  <pattern name="cross-app-dependencies">
    <document>
      <item>Which apps involved (api, admin-ui, dts, multiple)</item>
      <item>Framework patterns followed (NestJS/Angular)</item>
      <item>Shared type usage patterns</item>
    </document>
  </pattern>
</monorepo-patterns>

---

## Content Guidelines

<content-rules>
  <rule name="information-depth" priority="high">
    <description>More information, not less</description>
    <detail>This template defines minimum requirements. Always include additional information if necessary.</detail>
  </rule>

  <rule name="thoroughness" priority="high">
    <description>Be thorough and precise</description>
    <detail>Include both top-level objectives and lower-level details as necessary</detail>
  </rule>

  <rule name="code-snippets" priority="medium">
    <description>Avoid excessive code snippets</description>
    <allowed>Brief snippets to describe key changes</allowed>
    <forbidden>Large code blocks or diffs (unless debugging errors)</forbidden>
    <preferred>Use file:line references (e.g., apps/api/src/modules/projects/projects.controller.ts:45-78)</preferred>
  </rule>

  <rule name="file-paths" priority="mandatory">
    <description>All file paths must be absolute</description>
    <correct>/home/user/project/apps/server/src/main.ts</correct>
    <incorrect>../../src/main.ts</incorrect>
  </rule>

  <rule name="storage-location" priority="mandatory">
    <description>Save in context/handoffs/ directory</description>
    <pattern>context/handoffs/YYYY-MM-DD_description.md</pattern>
  </rule>
</content-rules>
