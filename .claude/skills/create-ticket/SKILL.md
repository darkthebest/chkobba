---
name: create-ticket
description: Creates GitLab issues with interactive template-based data gathering, label validation, and API integration. Use when creating issues, reporting bugs, requesting features, creating tickets, or documenting work items.
category: workflow
framework: [generic]
argument-hint: [bug|feature] [title]
allowed-tools: Bash(curl:*), Read, Glob, AskUserQuestion
disable-model-invocation: true
---

<!--
PLACEHOLDERS:
- {{GITLAB_URL}}: GitLab instance URL (e.g., https://gitlab.example.com)
- {{PROJECT_ID}}: GitLab project ID (numeric)
-->

# Create GitLab Ticket Command

<role>
Interactive GitLab issue creator with guided information gathering and label validation
</role>

<purpose>
Creates well-structured GitLab issues (bugs or features) using standardized templates, validated labels, and proper API authentication.
</purpose>

## Usage

```bash
# Interactive mode (recommended)
/create-ticket

# With type specified
/create-ticket bug
/create-ticket feature

# With type and title
/create-ticket feature "Add real-time preview mode for DTS"
```

<input>
  <parameter name="issue-type" optional="true">
    <description>Type of issue to create</description>
    <value>$1</value>
    <options>
      <option value="bug">Bug report</option>
      <option value="feature">Feature request</option>
    </options>
  </parameter>
  <parameter name="issue-title" optional="true">
    <description>Short title for the issue</description>
    <value>$2</value>
  </parameter>
  <raw-arguments>
    <value>$ARGUMENTS</value>
    <description>Full argument string passed to the command (parsed to extract type and title)</description>
  </raw-arguments>
</input>

## Parameters

- `$1` (optional): Issue type - `bug` or `feature`
- `$2` (optional): Issue title

<critical-constraints>
  <authentication>
    <requirement>GITLAB_PERSONAL_ACCESS_TOKEN must be set in environment</requirement>
    <verification>Check token exists before any API calls</verification>
    <error-handling>Fail gracefully with clear error message if missing</error-handling>
  </authentication>

  <label-validation priority="absolute">
    <rule>ONLY use labels from the approved list below</rule>
    <rule>NEVER invent or create new labels</rule>
    <rule>Labels are case-sensitive - use exactly as listed</rule>
    <rule>Type and App labels are REQUIRED for every issue</rule>
  </label-validation>

  <api-constraints>
    <endpoint>{{GITLAB_URL}}/api/v4</endpoint>
    <project-id>240</project-id>
    <method>POST to /projects/240/issues</method>
  </api-constraints>
</critical-constraints>

## Valid Labels

<label-registry>
  <category name="app" required="true">
    <!-- @generated: app-scope-mapping -->
    <label name="App::Rules" scope="Pure 2v2 Chkobba rules engine, scoring, deck/RNG, bots (packages/rules, @chkobba/rules)" />
    <label name="App::Server" scope="Nakama TypeScript runtime: InitModule, RPCs, authoritative matches, matchmaker hook, bot backfill, reconnection, wallet/storage (apps/server, @chkobba/server)" />
    <label name="App::Mobile" scope="Expo / React Native client: expo-router screens, Nakama client session/socket, social login UI, ads/consent, IAP (apps/mobile, @chkobba/mobile)" />
    <label name="App::Infra" scope="docker-compose.yml, Nakama + Postgres hosting, pnpm workspace config, CI, store build pipeline (repo root)" />
    <label name="App::Docs" scope="Rules variant spec, match flow, data model, privacy policy docs (docs/)" />
    <!-- @end: app-scope-mapping -->
  </category>

  <category name="component" required="false">
    <label name="Component::Authentication" scope="Auth, login, JWT, user management, roles, permissions" />
    <label name="Component::Canvas" scope="Canvas editor, node drag/drop, connectors, visual editor" />
    <label name="Component::DT-Renderer" scope="Decision tree execution, node processing, lead capture" />
    <label name="Component::Infrastructure" scope="DevOps, caching, monitoring, deployment, Docker, AWS" />
    <label name="Component::Integrations" scope="Third-party APIs, webhooks, postbacks, credentials" />
    <label name="Component::UI/UX" scope="Frontend improvements, design system, user experience" />
  </category>

  <category name="priority" required="false">
    <label name="Priority::Critical" meaning="Must fix immediately" />
    <label name="Priority::Major" meaning="Should fix soon" />
    <label name="Priority::Show Stopper" meaning="Blocks release" />
  </category>

  <category name="state" required="false">
    <label name="State::Discussion" meaning="Under discussion" />
    <label name="State::In Progress" meaning="Being worked on" />
    <label name="State::Pending Verification" meaning="Awaiting verification" />
    <label name="State::Ready To Merge" meaning="Ready for merge" />
    <label name="State:Draft" meaning="Draft state" />
  </category>

  <category name="type" required="true">
    <label name="Type::bug" meaning="Bug report" />
    <label name="Type::feature" meaning="Feature request" />
    <label name="Type::usability" meaning="Usability improvement" />
    <label name="Type::Concept-Idea-Resource" meaning="Concept, Idea or Resource" />
    <label name="Type: Network effect" meaning="Distribution potential" />
  </category>
</label-registry>

## Execution Steps

<workflow>
  <step number="1" name="determine-type">
    <trigger>When $1 is not provided or invalid</trigger>
    <action>Ask user for issue type (bug/feature)</action>
    <validation>Must be exactly "bug" or "feature"</validation>
    <output>Selected issue type</output>
  </step>

  <step number="2" name="gather-details">
    <purpose>Collect all required information for the issue template</purpose>

    <information-gathering>
      <for-bugs>
        <required>
          <field name="title" prompt="Brief description of the bug" />
          <field name="summary" prompt="What is the problem?" guidance="1-2 sentences" />
          <field name="affected-app" options="Select from project applications, or multiple" />
          <field name="steps-to-reproduce" prompt="How to trigger the bug" guidance="Numbered list" />
          <field name="current-behavior" prompt="What happens now" />
          <field name="expected-behavior" prompt="What should happen" />
          <field name="environment" prompt="Production/Staging/Local, browser, etc." />
        </required>
        <optional>
          <field name="evidence" prompt="Logs, screenshots, error messages" />
          <field name="priority" options="Critical, Major, or normal" />
        </optional>
      </for-bugs>

      <for-features>
        <required>
          <field name="title" prompt="Brief description of the feature" />
          <field name="summary" prompt="What do you want to build?" guidance="1-2 sentences" />
          <field name="target-app" options="Select from project applications, or multiple" />
          <field name="problem-statement" prompt="What limitation does this address?" />
          <field name="proposed-solution" prompt="High-level approach" />
          <field name="acceptance-criteria" prompt="How do we know it's done?" guidance="Checklist format" />
        </required>
        <optional>
          <field name="priority" options="Critical, Major, or normal" />
        </optional>
      </for-features>
    </information-gathering>

  </step>

  <step number="3" name="check-plans">
    <action>Search for related implementation plans</action>
    <command>ls context/plans/*.md 2>/dev/null | head -10</command>
    <prompt>Ask user if any existing plan relates to this ticket</prompt>
    <output>Plan reference (if applicable)</output>
  </step>

  <step number="4" name="select-labels">
    <purpose>Map gathered information to validated labels</purpose>

    <label-selection-rules>
      <required>
        <type-label source="issue type">
          <mapping from="bug" to="Type::bug" />
          <mapping from="feature" to="Type::feature" />
        </type-label>

        <app-label source="affected/target app">
          <!-- @generated: app-scope-mapping -->
          <mapping from="rules engine / scoring / bots / packages/rules" to="App::Rules" />
          <mapping from="Nakama server / matches / matchmaker / RPC / apps/server" to="App::Server" />
          <mapping from="mobile app / Expo / UI / apps/mobile" to="App::Mobile" />
          <mapping from="docker-compose / hosting / workspace / CI / store builds" to="App::Infra" />
          <mapping from="specs / documentation / docs/" to="App::Docs" />
          <mapping from="feature spanning rules + server + mobile" to="App::Rules, App::Server, App::Mobile (one label per affected app)" />
          <!-- @end: app-scope-mapping -->
        </app-label>
      </required>

      <optional>
        <component-label source="problem domain">
          <mapping from="auth/login/JWT/roles" to="Component::Authentication" />
          <mapping from="canvas/editor/drag-drop" to="Component::Canvas" />
          <mapping from="DT rendering/leads" to="Component::DT-Renderer" />
          <mapping from="DevOps/Docker/AWS" to="Component::Infrastructure" />
          <mapping from="external APIs/webhooks" to="Component::Integrations" />
          <mapping from="UI/design/UX" to="Component::UI/UX" />
        </component-label>

        <priority-label source="user input">
          <mapping from="Critical" to="Priority::Critical" />
          <mapping from="Major" to="Priority::Major" />
          <mapping from="Show Stopper" to="Priority::Show Stopper" />
        </priority-label>
      </optional>
    </label-selection-rules>

  </step>

  <step number="5" name="format-body">
    <purpose>Format collected information into proper GitLab issue template</purpose>

    <templates>
      <bug-template>
        <structure>
          ## Summary
          {summary}

          ## Affected Application
          - [x] {app}

          ## Steps to Reproduce
          {steps}

          ## Current Behavior
          {current_behavior}

          ## Expected Behavior
          {expected_behavior}

          ## Environment
          - **Environment**: {environment}
            {additional_env_details}

          ## Logs / Screenshots / Evidence
          {evidence_or_"None provided"}

          ## Implementation Plan (If Available)
          {plan_reference_or_"No plan created yet. Use `/create-plan` to create one."}
        </structure>
      </bug-template>

      <feature-template>
        <structure>
          ## Summary
          {summary}

          ## Target Application
          - [x] {app}

          ## Problem Statement
          {problem_statement}

          ## Proposed Solution
          {proposed_solution}

          ## Acceptance Criteria
          {acceptance_criteria}

          ## Implementation Plan
          {plan_reference_or_"No plan created yet. Use `/create-plan` to create one."}
        </structure>
      </feature-template>
    </templates>

  </step>

  <step number="6" name="create-issue">
    <purpose>Submit issue to GitLab via API</purpose>

    <api-call>
      <method>POST</method>
      <url>{{GITLAB_URL}}/api/v4/projects/{{PROJECT_ID}}/issues</url>
      <headers>
        <header name="PRIVATE-TOKEN" value="$GITLAB_PERSONAL_ACCESS_TOKEN" />
        <header name="Content-Type" value="application/json" />
      </headers>
      <body>
        {
          "title": "{title}",
          "description": "{formatted_body}",
          "labels": "{comma_separated_labels}"
        }
      </body>
    </api-call>

    <implementation>
      curl -s --request POST "{{GITLAB_URL}}/api/v4/projects/{{PROJECT_ID}}/issues" \
        --header "PRIVATE-TOKEN: $GITLAB_PERSONAL_ACCESS_TOKEN" \
        --header "Content-Type: application/json" \
        --data '{
          "title": "{title}",
          "description": "{formatted_body}",
          "labels": "{comma_separated_labels}"
        }'
    </implementation>

  </step>

  <step number="7" name="report-result">
    <purpose>Display success message and next steps</purpose>

    <success-format>
      ✅ GitLab ticket created successfully!

      | Field | Value |
      |-------|-------|
      | Issue | #{iid} |
      | Title | {title} |
      | URL | {web_url} |
      | Labels | {labels} |
      | Status | Open |

      Next steps:
      - Review the issue at {web_url}
      - Create implementation plan: /create-plan
      - Start implementation: /execute-plan
    </success-format>

  </step>
</workflow>

<examples>
  <example name="bug-report">
    <command>/create-ticket bug "Login fails with SSO users"</command>
    <result>
      <title>Login fails with SSO users</title>
      <labels>Type::bug, App::api, Component::Authentication</labels>
      <template>Bug report format</template>
    </result>
  </example>

  <example name="feature-request">
    <command>/create-ticket feature "Add real-time preview mode for DTS"</command>
    <result>
      <title>Add real-time preview mode for DTS</title>
      <labels>Type::feature, App::web, Component::Preview</labels>
      <template>Feature request format</template>
    </result>
  </example>

  <example name="interactive-mode">
    <command>/create-ticket</command>
    <behavior>Prompts for all required information interactively</behavior>
  </example>
</examples>

<error-handling>
  <scenario name="missing-token">
    <error>GITLAB_PERSONAL_ACCESS_TOKEN not set</error>
    <message>Error: GITLAB_PERSONAL_ACCESS_TOKEN not set. Please set it in your environment.</message>
  </scenario>

  <scenario name="api-error">
    <error>GitLab API returns error response</error>
    <action>Display the error message from GitLab API response</action>
  </scenario>

  <scenario name="invalid-label">
    <error>Label not in approved list</error>
    <message>Error: '{label}' is not a valid label. Valid labels are: ...</message>
  </scenario>
</error-handling>

<gitlab-configuration>
  <api-url>{{GITLAB_URL}}/api/v4</api-url>
  <project-id>240</project-id>
  <authentication>
    <method>Personal Access Token</method>
    <env-var>GITLAB_PERSONAL_ACCESS_TOKEN</env-var>
  </authentication>
</gitlab-configuration>

<related-commands>
  <command name="/create-plan" purpose="Create implementation plan for the ticket" />
  <command name="/execute-plan" purpose="Execute the implementation plan" />
  <command name="/commit" purpose="Commit changes and reference the ticket" />
</related-commands>

<best-practices>
  <practice>Always verify the token is set before making API calls</practice>
  <practice>Labels are case-sensitive - use exactly as listed</practice>
  <practice>The issue URL is returned for easy access</practice>
  <practice>Reference implementation plans when they exist</practice>
  <practice>Use conventional commit format when referencing tickets: `fix(scope): description (#issue-number)`</practice>
</best-practices>
