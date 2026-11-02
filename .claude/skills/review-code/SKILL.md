---
name: review-code
description: Reviews pull requests and merge requests through platform-native CLI extraction, severity-based comment organization, and interactive fix workflows. Use when reviewing PRs, analyzing merge requests, addressing review comments, fixing review issues, or responding to code reviews.
category: review
framework: [generic]
context: fork
---

# Code Review Command

<role>
Code review orchestrator that fetches pull/merge requests from GitHub/GitLab, extracts review comments, and facilitates interactive fix workflows
</role>

<purpose>
This command invokes the code reviewer agent to extract, summarize, and help address review comments from GitHub pull requests or GitLab merge requests through an interactive conversational interface.
</purpose>

<input-modes>
  <mode name="interactive" default="true">
    <syntax>/review-code</syntax>
    <description>Presents list of open PRs/MRs for user selection</description>
    <behavior>Fetches open PRs/MRs from GitHub/GitLab and prompts user to choose</behavior>
  </mode>

  <mode name="direct">
    <syntax>/review-code [NUMBER]</syntax>
    <example>/review-code 138</example>
    <description>Directly analyzes specific PR/MR by number</description>
    <behavior>Skips selection, immediately fetches PR/MR 138</behavior>
  </mode>

  <mode name="url">
    <syntax>/review-code [FULL_URL]</syntax>
    <example>/review-code https://github.com/org/repo/pull/138</example>
    <description>Extracts number from full PR/MR URL</description>
    <behavior>Parses URL to extract PR/MR number, then fetches</behavior>
  </mode>
</input-modes>

## Usage

```bash
# Interactive mode - select from PR/MR list
/review-code

# Direct mode - provide PR/MR number
/review-code 138

# URL mode - provide full PR/MR URL
/review-code https://github.com/org/repo/pull/138
```

<capabilities>
  <capability name="fetch">
    <description>Retrieves pull/merge request from GitHub or GitLab</description>
    <modes>
      <mode>Lists all open PRs/MRs for selection if not specified</mode>
      <mode>Direct fetch by number or URL</mode>
    </modes>
  </capability>

  <capability name="extract">
    <description>Parses discussion threads and review comments</description>
    <sources>
      <primary>GitHub PR review comments via gh CLI</primary>
      <secondary>GitLab MR discussions via glab CLI</secondary>
    </sources>
  </capability>

  <capability name="summarize">
    <description>Organizes comments by severity and file location</description>
    <categories>
      <category severity="critical">Must-fix issues</category>
      <category severity="warning">Should-fix issues</category>
      <category severity="suggestion">Nice-to-have improvements</category>
      <category severity="informational">Context and explanations</category>
    </categories>
  </capability>

  <capability name="interactive">
    <description>Conversational interface for addressing review comments</description>
    <actions>
      <action>Ask for details on specific comments</action>
      <action>Request clarification about concerns</action>
      <action>Generate implementation plans for fixes</action>
      <action>Execute fixes automatically with approval</action>
    </actions>
  </capability>
</capabilities>

## What This Command Does

1. **Fetch PR/MR**: Retrieves pull/merge request from GitHub/GitLab (lists for selection if not specified)
2. **Extract Comments**: Parses discussion threads to find review comments
3. **Summarize**: Organizes comments by severity and file location
4. **Interactive**: Allows you to:
   - Ask for details on specific comments
   - Request clarification about concerns
   - Generate implementation plans for fixes
   - Execute fixes automatically with approval

<workflow>
  <phase number="1" name="pr-selection">
    <trigger>User invokes /review-code without PR/MR identifier</trigger>
    <action>Fetch open PRs/MRs using gh or glab CLI</action>
    <output format="numbered-list">
      <item>PR/MR number (#138)</item>
      <item>Title</item>
      <item>Author</item>
      <item>Age</item>
    </output>
    <user-interaction>Prompt for selection (1-N)</user-interaction>
    <skip-condition>PR/MR number or URL provided in command</skip-condition>
  </phase>

  <phase number="2" name="data-collection">
    <platform name="github">
      <action>
        <command>gh pr view [NUMBER] --json title,author,state,headRefName,baseRefName</command>
        <purpose>Fetch PR metadata (title, author, status, branch)</purpose>
      </action>
      <action>
        <command>gh pr diff [NUMBER]</command>
        <purpose>Understand file changes</purpose>
      </action>
      <action>
        <command>gh api repos/{owner}/{repo}/pulls/[NUMBER]/comments</command>
        <purpose>Extract review comments</purpose>
      </action>
    </platform>

    <platform name="gitlab">
      <action>
        <command>glab mr view [NUMBER]</command>
        <purpose>Fetch MR metadata (title, author, status, branch)</purpose>
      </action>
      <action>
        <command>glab mr diff [NUMBER]</command>
        <purpose>Understand file changes</purpose>
      </action>
      <action>
        <command>glab api projects/{id}/merge_requests/[NUMBER]/discussions</command>
        <purpose>Extract MR discussions and comments</purpose>
      </action>
    </platform>
  </phase>

  <phase number="3" name="analysis-and-presentation">
    <organize-by>
      <dimension name="severity">
        <level value="critical">Must-fix issues</level>
        <level value="warning">Should-fix issues</level>
        <level value="suggestion">Nice-to-have improvements</level>
        <level value="informational">Context and explanations</level>
      </dimension>
      <dimension name="status">
        <state value="unaddressed">Needs attention</state>
        <state value="addressed">Already handled</state>
      </dimension>
      <dimension name="location">
        <file>Path to affected file</file>
        <line>Line number or range</line>
      </dimension>
    </organize-by>

    <presentation-format>
      ## Review Summary for [PR/MR Title]

      **Critical Issues**: X
      **Warnings**: Y
      **Suggestions**: Z

      ### Critical Issues (Must Fix)

      1. **[File:Line]** Issue description
         - Comment: "Original review comment"
         - Suggestion: "How to fix"

      ### Warnings (Should Fix)

      ...

      ### Suggestions (Nice to Have)

      ...
    </presentation-format>
  </phase>

  <phase number="4" name="interactive-resolution">
    <user-prompts>
      <prompt>Which issue would you like to work on first?</prompt>
      <prompt>Would you like me to explain the concern?</prompt>
      <prompt>Should I generate a fix for this?</prompt>
    </user-prompts>

    <resolution-actions>
      <action name="explain">Provide detailed explanation of the concern</action>
      <action name="plan">Create implementation plan for the fix</action>
      <action name="fix">Generate code changes to address the issue</action>
      <action name="skip">Mark as will address later</action>
    </resolution-actions>
  </phase>
</workflow>

<platform-detection>
  <detection-rule>
    Check for .git/config or run git remote -v to determine platform:
    - Contains "github.com" -> Use gh CLI
    - Contains "gitlab" -> Use glab CLI
  </detection-rule>
</platform-detection>

<configuration>
  <platform name="github">
    <cli-tool>gh</cli-tool>
    <auth-command>gh auth status</auth-command>
    <required-scopes>repo, read:org</required-scopes>
  </platform>

  <platform name="gitlab">
    <cli-tool>glab</cli-tool>
    <auth-command>glab auth status</auth-command>
    <required-scopes>api, read_repository</required-scopes>
  </platform>
</configuration>

<prerequisites>
  <prerequisite>
    <name>GitHub CLI (gh)</name>
    <check>gh --version</check>
    <install>brew install gh</install>
    <auth>gh auth login</auth>
  </prerequisite>

  <prerequisite>
    <name>GitLab CLI (glab)</name>
    <check>glab --version</check>
    <install>brew install glab</install>
    <auth>glab auth login</auth>
  </prerequisite>
</prerequisites>

<example-usage>
  ## Example Session

  ```
  User: /review-code

  Agent: I'll fetch the open pull requests...

  Open Pull Requests:
  1. #142 - Add user authentication flow (author: dev1, 2 days old)
  2. #141 - Fix memory leak in worker (author: dev2, 5 days old)
  3. #138 - Refactor database layer (author: dev3, 1 week old)

  Which PR would you like to review?

  User: 1

  Agent: Fetching PR #142...

  ## Review Summary for "Add user authentication flow"

  **Critical Issues**: 2
  **Warnings**: 3
  **Suggestions**: 5

  ### Critical Issues (Must Fix)

  1. **src/auth/auth.service.ts:45** - Missing input validation
     - Comment: "User input should be validated before processing"
     - Suggestion: "Add Zod validation schema"

  2. **src/auth/auth.controller.ts:28** - Unhandled error case
     - Comment: "What happens if the token is expired?"
     - Suggestion: "Add proper error handling"

  Which issue would you like to work on first?
  ```
</example-usage>

<quality-checklist>
  - [ ] All review comments fetched and parsed
  - [ ] Comments organized by severity
  - [ ] Comments organized by file location
  - [ ] Addressed/unaddressed status tracked
  - [ ] Interactive resolution workflow offered
</quality-checklist>
