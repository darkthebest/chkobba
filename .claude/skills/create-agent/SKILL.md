---
name: create-agent
description: Creates new Claude Code subagents through interactive one-at-a-time questioning for purpose, tools, model selection, and location. Use when creating new agents, building custom agents, adding subagents, extending capabilities, or customizing workflows.
category: meta
framework: [generic]
argument-hint: <agent-name>
disable-model-invocation: true
---

# Create New Subagent

<role>
Interactive guide for creating new Claude Code subagents through structured questioning
</role>

<interaction-mode>
<principle>Ask questions ONE AT A TIME</principle>
<principle>Wait for user response before proceeding</principle>
<principle>Build complete agent definition progressively</principle>
</interaction-mode>

## Subagent Name

<input-handling>
  <provided-argument>
    The subagent name is: **$1**
  </provided-argument>
  <missing-argument>
    <prompt>What name should this subagent have?</prompt>
    <validation>
      <rule>Lowercase letters only</rule>
      <rule>Use hyphens for word separation</rule>
      <rule>No spaces or special characters</rule>
    </validation>
    <example>migration-planner</example>
    <example>test-generator</example>
  </missing-argument>
</input-handling>

## Guided Creation Process

<workflow sequential="true">

  <step number="1" name="purpose-and-description">
    <prompt>
What is the primary purpose of this subagent? Describe when and why it should be used.
    </prompt>

    <collect>
      <field name="purpose">Primary purpose and use cases</field>
      <field name="trigger-conditions">When should it be invoked</field>
    </collect>

    <generate>
      <output>Clear, specific description for frontmatter</output>
      <output>Proactivity keywords if applicable</output>
      <keywords>
        <keyword condition="auto-invocation">use PROACTIVELY</keyword>
        <keyword condition="mandatory">MUST BE USED</keyword>
      </keywords>
    </generate>

  </step>

  <step number="2" name="tool-access">
    <prompt>
Which tools should this subagent have access to? Options:

- **all** (inherit all tools - default)
- **specific** (you'll specify which tools)
- **read-only** (Read, Grep, Glob only)
  </prompt>

      <options>
        <option value="all" default="true">
          <description>Inherit all tools from parent</description>
          <frontmatter-action>Omit tools field</frontmatter-action>
        </option>
        <option value="specific">
          <description>Custom tool subset</description>
          <follow-up>Which specific tools? (comma-separated)</follow-up>
          <examples>Read, Write, Edit, Bash</examples>
        </option>
        <option value="read-only">
          <description>Read-only analysis tasks</description>
          <tools>Read, Grep, Glob</tools>
        </option>
      </options>

      <generate>
        <output>tools frontmatter field (if not 'all')</output>
      </generate>

    </step>

    <step number="3" name="model-selection">
      <prompt>
  Which model should this subagent use?

- **inherit** (use parent conversation's model - default)
- **haiku** (fast, cost-effective for simple tasks)
- **sonnet** (balanced performance)
- **opus** (most capable for complex tasks)
  </prompt>

      <options>
        <option value="inherit" default="true">
          <description>Use parent's model</description>
          <frontmatter-action>Omit model field</frontmatter-action>
        </option>
        <option value="haiku">
          <use-case>Simple, repetitive tasks</use-case>
          <use-case>Code formatting, linting</use-case>
          <use-case>Basic file operations</use-case>
        </option>
        <option value="sonnet">
          <use-case>Balanced reasoning and speed</use-case>
          <use-case>Code generation</use-case>
          <use-case>Testing tasks</use-case>
        </option>
        <option value="opus">
          <use-case>Complex architecture decisions</use-case>
          <use-case>Multi-step planning</use-case>
          <use-case>Advanced debugging</use-case>
        </option>
      </options>

      <generate>
        <output>model frontmatter field (if not 'inherit')</output>
      </generate>

    </step>

    <step number="4" name="system-prompt-generation">
      <context>
        <input>Purpose from step 1</input>
        <input>Tools from step 2</input>
        <input>Model from step 3</input>
      </context>

      <generate-prompt>
        <section name="role-definition">
          <content>Clear, specific role statement</content>
          <tone>Authoritative, focused</tone>
        </section>

        <section name="responsibilities">
          <format>Bulleted list</format>
          <content>3-5 key responsibilities</content>
          <specificity>Concrete, actionable</specificity>
        </section>

        <section name="approach">
          <content>Step-by-step methodology</content>
          <content>Best practices for this task type</content>
          <content>Common pitfalls to avoid</content>
        </section>

        <section name="output-format">
          <content>Expected deliverable structure</content>
          <content>Reporting requirements</content>
          <examples>Include if helpful</examples>
        </section>

        <section name="constraints" optional="true">
          <content>Forbidden actions</content>
          <content>Required validations</content>
          <content>Performance considerations</content>
        </section>
      </generate-prompt>

    </step>

    <step number="5" name="location-selection">
      <prompt>
  Where should this subagent be saved?

- **project** (.claude/agents/ - shared with team)
- **user** (~/.claude/agents/ - personal use only)
  </prompt>

    <options>
      <option value="project" recommended="true">
        <path>.claude/agents/{agent-name}.md</path>
        <visibility>Shared with team via git</visibility>
        <use-when>Agent benefits multiple developers</use-when>
      </option>
      <option value="user">
        <path>~/.claude/agents/{agent-name}.md</path>
        <visibility>Personal use only</visibility>
        <use-when>Personal workflow preferences</use-when>
      </option>
    </options>

    <generate>
      <output>Full file path for creation</output>
    </generate>
  </step>

</workflow>

## File Generation

<generation-rules>
  <trigger>All 5 workflow steps completed</trigger>

  <file-structure>
    <section name="frontmatter" format="yaml">
      <field name="name" required="true">Agent name (kebab-case)</field>
      <field name="description" required="true">Clear purpose statement</field>
      <field name="tools" optional="true">Tool list (omit if 'all')</field>
      <field name="model" optional="true">Model name (omit if 'inherit')</field>
    </section>

    <section name="heading" format="markdown">
      <h1>Agent Name (Title Case)</h1>
    </section>

    <section name="system-prompt" format="markdown">
      <content>Generated comprehensive prompt from step 4</content>
      <structure>
        <subsection>Role definition</subsection>
        <subsection>Responsibilities</subsection>
        <subsection>Approach</subsection>
        <subsection>Output Format</subsection>
        <subsection optional="true">Constraints</subsection>
      </structure>
    </section>

  </file-structure>

  <template>
    <example-format>
---
name: {agent-name}
description: {generated-description}
{tools-field-if-needed}
{model-field-if-needed}
---

# {Agent Name}

{generated-system-prompt}

## Responsibilities

- {responsibility-1}
- {responsibility-2}
- {responsibility-3}

## Approach

{methodology-and-best-practices}

## Output Format

{expected-deliverable-structure}
</example-format>
</template>

<action>Create file using Write tool</action>
<validation>
<check>File created successfully</check>
<check>Valid YAML frontmatter</check>
<check>Readable markdown structure</check>
</validation>
</generation-rules>

## Post-Creation Actions

<follow-up-sequence>
  <action priority="1">
    <do>Display the full file path</do>
    <format>✅ Created: {absolute-path}</format>
  </action>

  <action priority="2">
    <do>Explain usage</do>
    <template>
Use the **{agent-name}** subagent to {purpose-summary}.

Invoke with: `@{agent-name}` or let Claude detect when it's needed.
</template>
</action>

  <action priority="3" condition="proactive-agent">
    <do>Explain automatic invocation</do>
    <message>
This agent is marked for proactive use. Claude will automatically invoke it when detecting relevant scenarios.
    </message>
  </action>

  <action priority="4">
    <do>Suggest testing</do>
    <message>
Try testing it with a sample task to verify the behavior matches expectations.
    </message>
  </action>

  <action priority="5" condition="project-location">
    <do>Remind about git commit</do>
    <message>
Remember to commit this agent to git so your team can use it.
    </message>
  </action>
</follow-up-sequence>

## Critical Guidelines

<constraints>
  <naming-rules>
    <rule>Agent names: lowercase with hyphens only</rule>
    <rule>No spaces, underscores, or special characters</rule>
    <pattern>^[a-z]+(-[a-z]+)*$</pattern>
  </naming-rules>

  <description-rules>
    <rule>Be specific enough for Claude to know when to use it</rule>
    <rule>Include trigger conditions if proactive</rule>
    <rule>Avoid vague language like "helps with" or "works on"</rule>
  </description-rules>

  <location-rules>
    <rule>Project agents (.claude/agents/) should be committed to git</rule>
    <rule>User agents (~/.claude/agents/) are for personal use</rule>
    <rule>Team-beneficial agents should be project-level</rule>
  </location-rules>

  <editability>
    <note>Users can edit the generated file to refine the prompt</note>
    <note>The generated prompt is a starting point, not final</note>
  </editability>
</constraints>
