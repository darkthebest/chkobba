---
name: ui-prototype
description: UI/UX prototyping - generates interactive HTML prototypes and mockups matching production styling. Accepts feature descriptions or screenshots to create pixel-perfect prototypes for feature visualization and UX exploration. Use when creating HTML mockups, building interactive prototypes, visualizing new features, or recreating UI from screenshots.
category: ui
framework: [generic]
invocable: true
---

# UI Prototype Skill

Thin delegation wrapper that parses user input and delegates to the **ui-prototyper** agent.
All design system knowledge, templates, and generation logic live in the agent.

## Usage

```bash
/ui-prototype "Create a rating scale node (1-5 stars) for lead qualification"
/ui-prototype [attach screenshot] "Recreate this dashboard layout"
/ui-prototype "Admin UI: project analytics dashboard with charts and metrics"
```

## Rules

1. **Always delegate** to the `ui-prototyper` agent - never generate HTML directly
2. Parse the user input to extract: feature description, style preference (DTS/Admin UI), screenshot context
3. Output files MUST be saved to `context/ui/` directory (enforced by agent)

## Delegation Logic

1. **Parse input**: Extract feature description, style preference (`DTS` or `Admin UI`), and any screenshot context
2. **Delegate**: Call `Task({ subagent_type: 'ui-prototyper' })` with the parsed requirements
3. **Report**: Summarize what was created and provide the file path

```
Task({
  subagent_type: 'ui-prototyper',
  description: 'Generate UI prototype',
  prompt: `Generate a self-contained HTML prototype for: ${userRequest}

    Save the output to context/ui/[feature-name].html.
    Follow all instructions in the ui-prototyper agent documentation.`
});
```

## Error Handling

- **No input provided**: Ask user to describe the feature to prototype
- **Ambiguous style**: Default to DTS style unless "Admin UI" is mentioned
