---
name: create-skill
description: Creates new Claude Code skills with interactive guided setup, multi-file structure, supporting scripts/templates/resources, and description-based activation. Use when creating new skills, building custom skills, adding capabilities, extending functionality, or customizing workflows.
category: meta
framework: [generic]
argument-hint: <skill-name>
disable-model-invocation: true
---

# Create New Skill

<role>
Skill creation guide - Help users create well-structured, discoverable Claude Code skills through interactive questioning. Skills are directories, not just single files — they can include SKILL.md, reference docs, executable scripts, templates, and resource files.
</role>

<context>
<input-handling>
  <skill-name source="$1">
    <validation>
      <pattern>^[a-z0-9-]+$</pattern>
      <max-length>64</max-length>
      <format>lowercase, hyphens, numbers only</format>
    </validation>
    <if-missing>Prompt user for valid skill name</if-missing>
  </skill-name>
</input-handling>

<critical-success-factors>
  <factor priority="highest">Description quality determines skill discoverability</factor>
  <factor priority="highest">Trigger keywords enable automatic activation</factor>
  <factor priority="high">Focused scope improves activation reliability</factor>
  <factor priority="high">Multi-file structure enables progressive disclosure</factor>
  <factor priority="medium">Interactive gathering prevents user overwhelm</factor>
</critical-success-factors>
</context>

<interaction-workflow>
<principle>Ask questions ONE AT A TIME to avoid overwhelming the user</principle>

<question sequence="1" category="purpose">
  <prompt>
"What capability should this skill provide? Be specific about:

- What it does (e.g., 'Extract text from PDFs', 'Generate visual reports', 'Analyze Excel files')
- When Claude should use it (trigger keywords/contexts)"
  </prompt>
  <purpose>Generate description that enables automatic skill activation</purpose>
  <output>Capability statement + trigger keywords</output>
</question>

<question sequence="2" category="content-type">
  <prompt>
"What type of skill content is this?

- **reference** — Knowledge Claude applies to your work (conventions, patterns, domain knowledge). Runs inline alongside your conversation.
- **task** — Step-by-step instructions for a specific action (deploy, commit, generate). Often invoked manually with `/skill-name`.
- **visual** — Generates visual output (HTML artifacts, charts, diagrams, PDFs). Bundles scripts Claude executes.
- **hybrid** — Combines reference knowledge with task execution."
  </prompt>
  <guidance>This determines the skill structure, frontmatter, and supporting files</guidance>
  <output>Content type selection</output>
</question>

<question sequence="3" category="invocation">
  <prompt>
"Who should invoke this skill?

- **both** (default) — You invoke with `/name` or Claude activates automatically when relevant
- **user-only** — Only you trigger it manually (for workflows with side effects like deploy, send messages). Sets `disable-model-invocation: true`
- **claude-only** — Background knowledge Claude loads when relevant, not a user command. Sets `user-invocable: false`"
  </prompt>
  <output>Invocation model + corresponding frontmatter flags</output>
</question>

<question sequence="4" category="execution">
  <prompt>
"How should this skill execute?

- **inline** (default) — Runs in the current conversation context. Good for reference content and simple tasks.
- **forked** — Runs in an isolated subagent (`context: fork`). Good for heavy tasks that don't need conversation history. Optionally specify an agent type (`Explore`, `Plan`, `general-purpose`, or custom agent name)."
  </prompt>
  <output>Execution context + optional agent type</output>
</question>

<question sequence="5" category="security">
  <prompt>
"Should this skill have restricted tool access?

- **unrestricted** (use all available tools - default)
- **read-only** (Read, Grep, Glob only)
- **custom** (specify which tools, e.g., `Bash(python *), Read, Write`)"
  </prompt>
  <output>Tool access policy</output>
</question>

<question sequence="6" category="structure">
  <prompt>
"What supporting files does this skill need? Skills are directories — SKILL.md is the entry point, but you can bundle anything Claude needs.

**Documentation files** (Claude reads on-demand, progressive disclosure):
- **reference docs** — Additional .md files with detailed API docs, guides, patterns
- **examples** — Input/output examples, usage samples

**Executable content** (Claude runs via bash, output enters context, not the code):
- **scripts/** — Python/bash/node scripts for deterministic operations (validation, generation, data processing)
- **templates/** — HTML/JS/config templates Claude uses as starting points

**Resource files** (bundled data Claude can access):
- **data files** — Schemas, configs, seed data
- **fonts/assets** — Binary resources for visual skills

- **none** — Just SKILL.md (simple skills)"
  </prompt>
  <guidance>
    Recommend multi-file structure when:
    - SKILL.md would exceed 500 lines
    - Skill needs deterministic operations (use scripts)
    - Multiple domains or reference areas exist (split into separate .md files)
    - Visual output is generated (bundle templates)
  </guidance>
  <output>List of supporting files and directories to create</output>
</question>

<question sequence="7" category="arguments">
  <prompt>
"Does this skill accept arguments?

- **none** — No arguments needed
- **single** — One argument (e.g., `/fix-issue 123`). Use `$ARGUMENTS` placeholder.
- **multiple** — Multiple positional arguments (e.g., `/migrate SearchBar React Vue`). Use `$0`, `$1`, `$2` placeholders.
- **dynamic** — Injects live data using `!`command`` syntax (e.g., `!`gh pr diff``). Shell commands run before Claude sees the prompt."
  </prompt>
  <output>Argument handling approach</output>
</question>

<question sequence="8" category="location">
  <prompt>
"Where should this skill be saved?

- **project** (`.claude/skills/` — shared with team via git)
- **personal** (`~/.claude/skills/` — available across all your projects)"
  </prompt>
  <output>Installation location</output>
</question>
</interaction-workflow>

<generation-phase>
<directory-structure>
  <location type="conditional">
    <if condition="project">.claude/skills/{skill-name}/</if>
    <if condition="personal">~/.claude/skills/{skill-name}/</if>
  </location>

  <structure-examples>
    <example type="simple" label="Simple reference skill">
```
{skill-name}/
└── SKILL.md
```
    </example>

    <example type="task-with-scripts" label="Task skill with executable scripts">
```
{skill-name}/
├── SKILL.md              # Overview + workflow steps
├── reference.md           # Detailed reference (loaded as needed)
└── scripts/
    ├── validate.sh        # Validation script Claude executes
    └── helper.py          # Utility script for deterministic operations
```
    </example>

    <example type="visual" label="Visual output skill with templates">
```
{skill-name}/
├── SKILL.md              # Instructions + creative process
├── templates/
│   ├── viewer.html        # HTML template Claude starts from
│   └── template.js        # JS reference for code structure
└── assets/                # Optional resources (fonts, images, etc.)
```
    </example>

    <example type="multi-domain" label="Multi-domain reference skill">
```
{skill-name}/
├── SKILL.md              # Overview + navigation to domains
├── shared/
│   ├── concepts.md        # Shared concepts across domains
│   └── error-codes.md     # Common error reference
├── python/
│   └── api-guide.md       # Python-specific docs
├── typescript/
│   └── api-guide.md       # TypeScript-specific docs
└── examples/
    ├── basic.md           # Basic usage examples
    └── advanced.md        # Advanced patterns
```
    </example>

    <example type="full" label="Full skill with scripts, templates, and docs">
```
{skill-name}/
├── SKILL.md              # Main instructions (under 500 lines)
├── reference.md           # Detailed API/pattern reference
├── examples.md            # Input/output examples
├── scripts/
│   ├── generate.py        # Generation script
│   └── validate.py        # Validation script
└── templates/
    └── output-template.html  # Output template
```
    </example>
  </structure-examples>
</directory-structure>

<required-file name="SKILL.md">
  <frontmatter-reference>
    All fields are optional. Only `description` is recommended.

    | Field                      | Usage |
    |----------------------------|-------|
    | `name`                     | Display name. Defaults to directory name. Lowercase, numbers, hyphens. Max 64 chars. |
    | `description`              | What it does + when to use it. Max 1024 chars. Write in third person. |
    | `argument-hint`            | Shown during autocomplete. e.g., `[issue-number]` or `[filename] [format]` |
    | `disable-model-invocation` | `true` = only user can invoke (for side-effect workflows) |
    | `user-invocable`           | `false` = hidden from `/` menu (background knowledge only) |
    | `allowed-tools`            | Restrict tools. e.g., `Read, Grep, Glob` or `Bash(python *)` |
    | `model`                    | Override model for this skill |
    | `context`                  | `fork` = run in isolated subagent |
    | `agent`                    | Subagent type when `context: fork` (`Explore`, `Plan`, `general-purpose`, or custom) |
    | `hooks`                    | Hooks scoped to this skill's lifecycle |
  </frontmatter-reference>

  <content-principles>
    - Keep SKILL.md under 500 lines — split into separate files for detailed content
    - Lead with quick start / overview, link to detailed files for on-demand loading
    - Only include what Claude doesn't already know (Claude is smart — skip obvious explanations)
    - Match specificity to task fragility: high freedom for flexible tasks, low freedom for fragile operations
    - Use `${CLAUDE_SKILL_DIR}` to reference bundled scripts/files regardless of working directory
    - Reference supporting files with relative links so Claude knows what to load and when
  </content-principles>

  <content-template type="reference">
```markdown
---
name: skill-name
description: Describes what this does and when to use it. Include trigger keywords. Write in third person. (max 1024 chars)
---

# Skill Name

## Quick start

[Concise overview — the essential instructions Claude needs immediately]

## Core patterns

[Key patterns, conventions, or workflows]

## Additional resources

- For detailed API reference, see [reference.md](reference.md)
- For usage examples, see [examples.md](examples.md)
```
  </content-template>

  <content-template type="task">
```markdown
---
name: skill-name
description: Performs X task. Use when the user asks to Y or Z.
disable-model-invocation: true
---

# Skill Name

Perform $ARGUMENTS:

1. [Step 1 — what to do]
2. [Step 2 — with validation]
3. [Step 3 — with feedback loop]

## Validation

Run: `${CLAUDE_SKILL_DIR}/scripts/validate.sh`

If validation fails, fix the issues and re-run validation before proceeding.
```
  </content-template>

  <content-template type="visual">
```markdown
---
name: skill-name
description: Generates visual X output. Use when creating Y, designing Z, or visualizing W.
allowed-tools: Bash(python *)
---

# Skill Name

## Step 0: Read the template

Read `${CLAUDE_SKILL_DIR}/templates/viewer.html` before writing any output.
Use it as the literal starting point — keep the structure, replace the content sections.

## Creative process

1. [Interpret user intent]
2. [Plan the visual approach]
3. [Generate using template as base]
4. [Validate output]

## Output format

Single self-contained HTML/PDF/PNG file with everything inline.
```
  </content-template>

  <content-template type="forked-research">
```markdown
---
name: skill-name
description: Researches X thoroughly. Use when analyzing Y or exploring Z.
context: fork
agent: Explore
---

Research $ARGUMENTS:

1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references
```
  </content-template>

  <content-template type="dynamic-context">
```markdown
---
name: skill-name
description: Summarizes/analyzes X from live data.
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Live context
- Current diff: !`gh pr diff`
- Changed files: !`gh pr diff --name-only`
- PR comments: !`gh pr view --comments`

## Task

[Instructions using the injected live data above]
```
  </content-template>
</required-file>

<supporting-files>
  <file name="reference.md" when="multi-domain or detailed-api">
    <principles>
      - Start with a table of contents for files over 100 lines
      - Keep references one level deep from SKILL.md (avoid nested file→file→file chains)
      - Organize by domain so Claude loads only relevant sections
    </principles>
    <template>
```markdown
# Reference

## Contents
- [Section A](#section-a)
- [Section B](#section-b)

## Section A
[Detailed reference content]

## Section B
[Detailed reference content]
```
    </template>
  </file>

  <file name="examples.md" when="output-quality-depends-on-format">
    <principles>
      - Provide concrete input/output pairs (not abstract descriptions)
      - Include 2-3 examples showing different scenarios
      - Examples help Claude match desired style and detail level
    </principles>
    <template>
```markdown
# Examples

## Example 1: [Use Case]

**Input:** [What the user provides]
**Output:**
[Exact expected output format]

## Example 2: [Use Case]

**Input:** [What the user provides]
**Output:**
[Exact expected output format]
```
    </template>
  </file>

  <directory name="scripts/" when="deterministic-operations-needed">
    <principles>
      - Scripts are executed via bash — their code never enters context, only output does
      - Handle errors explicitly in scripts (don't punt to Claude)
      - Document all magic numbers with comments
      - Reference scripts from SKILL.md: `Run: python ${CLAUDE_SKILL_DIR}/scripts/helper.py`
      - Make clear whether Claude should EXECUTE the script or READ it as reference
    </principles>
    <example name="scripts/validate.py">
```python
#!/usr/bin/env python3
"""Validate [what this validates]. Run by Claude during skill execution."""

import sys
import json

def validate(input_path):
    """Validate input and return clear error messages."""
    try:
        with open(input_path) as f:
            data = json.load(f)
        # Validation logic here
        errors = []
        if not data.get("required_field"):
            errors.append("Missing required_field")
        if errors:
            print("Validation failed:")
            for e in errors:
                print(f"  - {e}")
            sys.exit(1)
        print("Validation passed")
    except FileNotFoundError:
        print(f"File {input_path} not found, creating default")
        with open(input_path, "w") as f:
            json.dump({}, f)

if __name__ == "__main__":
    validate(sys.argv[1] if len(sys.argv) > 1 else "input.json")
```
    </example>
  </directory>

  <directory name="templates/" when="visual-output-or-starting-points">
    <principles>
      - Templates are literal starting points — Claude reads and builds upon them
      - Mark FIXED sections (keep as-is) vs VARIABLE sections (replace) with comments
      - Self-contained HTML should work without external dependencies (use CDN links)
    </principles>
  </directory>

  <directory name="assets/" when="binary-resources-needed">
    <principles>
      - Fonts, images, data files that Claude accesses during skill execution
      - No context penalty — files sit on filesystem until explicitly accessed
    </principles>
  </directory>
</supporting-files>
</generation-phase>

<completion-phase>
<actions sequence="post-creation">
  <action step="1">
    <what>Display directory structure created</what>
    <format>Tree view showing all created files and directories with brief purpose annotations</format>
  </action>

  <action step="2">
    <what>Explain activation mechanism based on invocation model</what>
    <template-both>"Claude will automatically use this skill when [trigger context], or you can invoke it with `/skill-name`"</template-both>
    <template-user-only>"Invoke this skill with `/skill-name [args]`. Claude will never trigger it automatically."</template-user-only>
    <template-claude-only>"Claude will automatically load this skill when [trigger context]. It won't appear in the `/` menu."</template-claude-only>
  </action>

  <action step="3">
    <what>Provide test prompt</what>
    <requirement>Prompt should contain trigger keywords from the description</requirement>
    <purpose>Enable immediate skill validation</purpose>
  </action>

  <action step="4" condition="has-scripts">
    <what>Verify scripts are executable</what>
    <command>chmod +x on any shell scripts created</command>
  </action>

  <action step="5" condition="project-location">
    <what>Remind about git commit</what>
    <reason>Team sharing requires version control</reason>
  </action>
</actions>
</completion-phase>

<critical-knowledge>
<progressive-disclosure>
  Skills use progressive disclosure — Claude loads content in stages:

  Level 1 (always loaded): Skill name + description from frontmatter (~100 tokens)
  Level 2 (on trigger): SKILL.md body (keep under 500 lines)
  Level 3 (as needed): Supporting files loaded only when referenced

  This means SKILL.md should be an overview that navigates to detailed files,
  not a dump of everything. Large reference docs, API specs, or example collections
  should live in separate files.
</progressive-disclosure>

<variable-reference>
  Available string substitutions in skill content:

  | Variable | Description |
  |----------|-------------|
  | `$ARGUMENTS` | All arguments passed when invoking |
  | `$ARGUMENTS[N]` or `$N` | Specific argument by 0-based index |
  | `${CLAUDE_SESSION_ID}` | Current session ID |
  | `${CLAUDE_SKILL_DIR}` | Directory containing SKILL.md — use to reference bundled files |
  | `!`command`` | Shell command output injected before Claude sees the prompt |
</variable-reference>

<validation-rules>
  <rule type="naming">
    <pattern>^[a-z0-9-]+$</pattern>
    <max-length>64</max-length>
    <format>lowercase, numbers, hyphens only</format>
    <forbidden>Cannot contain "anthropic" or "claude"</forbidden>
  </rule>

  <rule type="description" priority="critical">
    <requirement>Must include what the skill does AND when to use it</requirement>
    <requirement>Write in third person (not "I can" or "You can")</requirement>
    <requirement>Include specific trigger keywords</requirement>
    <impact>Description determines skill discoverability from potentially 100+ skills</impact>
    <max-length>1024</max-length>
  </rule>

  <rule type="skill-body">
    <requirement>Keep SKILL.md under 500 lines</requirement>
    <requirement>Split detailed content into separate files</requirement>
    <requirement>Reference supporting files one level deep (no nested chains)</requirement>
  </rule>
</validation-rules>

<best-practices>
  <practice priority="critical">
    Test skill by asking Claude to perform triggering actions
  </practice>
  <practice priority="critical">
    Only add context Claude doesn't already know — it's smart, skip obvious explanations
  </practice>
  <practice priority="high">
    Use scripts for deterministic operations (validation, generation, data processing)
  </practice>
  <practice priority="high">
    Implement feedback loops: run validator → fix errors → repeat
  </practice>
  <practice priority="high">
    Prefer focused capabilities over broad multi-purpose skills
  </practice>
  <practice priority="medium">
    Use `${CLAUDE_SKILL_DIR}` to reference bundled scripts/files portably
  </practice>
  <practice priority="medium">
    Include concrete input/output examples for format-sensitive skills
  </practice>
  <practice priority="medium">
    For complex workflows, provide a checklist Claude can track progress against
  </practice>
  <practice priority="medium">
    Commit project skills to git for team collaboration
  </practice>
</best-practices>

<anti-patterns>
  <avoid>SKILL.md files over 500 lines — split into separate files</avoid>
  <avoid>Deeply nested references (file→file→file) — keep one level deep from SKILL.md</avoid>
  <avoid>Explaining things Claude already knows (what PDFs are, how libraries work)</avoid>
  <avoid>Offering too many options — provide a default with escape hatch</avoid>
  <avoid>Time-sensitive information — use "old patterns" section instead</avoid>
  <avoid>Inconsistent terminology — pick one term and use it throughout</avoid>
  <avoid>Vague descriptions: "Helps with documents" — be specific with triggers</avoid>
  <avoid>Windows-style backslash paths — always use forward slashes</avoid>
  <avoid>Magic numbers in scripts without documentation</avoid>
</anti-patterns>
</critical-knowledge>