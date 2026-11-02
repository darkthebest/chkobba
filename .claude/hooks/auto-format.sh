#!/bin/bash
# Auto-format hook for Claude Code
#
# Called after Write/Edit/NotebookEdit operations. Formats the touched file
# using the project's configured formatter.
#
# Environment variables from Claude Code:
#   CLAUDE_TOOL_INPUT  - JSON with tool input (contains file_path)
#   CLAUDE_PROJECT_DIR - Project root directory
#
# NOTE: deliberately NO `set -e`. This hook runs after every file edit; a
# missing or misconfigured formatter must never fail the hook and interrupt the
# session. Every path below exits 0.

# === FORMATTER CONFIGURATION ===
# Each value is substituted during initialization based on project detection.
# If a placeholder is left unresolved (project has no formatter for that
# language, or init could not detect one), it is detected below and skipped.
FORMAT_CMD_JS="{{FORMAT_CMD_JS}}"
FORMAT_CMD_TS="{{FORMAT_CMD_TS}}"
FORMAT_CMD_PY="{{FORMAT_CMD_PY}}"
FORMAT_CMD_GO="{{FORMAT_CMD_GO}}"
FORMAT_CMD_RS="{{FORMAT_CMD_RS}}"
FORMAT_CMD_CSS="{{FORMAT_CMD_CSS}}"
FORMAT_CMD_JSON="{{FORMAT_CMD_JSON}}"
FORMAT_CMD_YAML="{{FORMAT_CMD_YAML}}"
FORMAT_CMD_MD="{{FORMAT_CMD_MD}}"

# Extract file path from tool input
FILE=$(echo "$CLAUDE_TOOL_INPUT" | jq -r '.file_path // .filePath // .notebook_path // empty' 2>/dev/null)

# Exit early if no usable file path
if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  exit 0
fi

# Run a formatter command, skipping unresolved placeholders and empty values.
# An unresolved placeholder still looks like "{{FORMAT_CMD_XX}}".
run_formatter() {
  local cmd="$1"

  case "$cmd" in
    '' | '{{'*'}}')
      # No formatter configured for this language — nothing to do.
      exit 0
      ;;
  esac

  # Word-split intentionally: values are commands with flags (e.g. "gofmt -w").
  # shellcheck disable=SC2086
  if $cmd "$FILE" >/dev/null 2>&1; then
    echo "[Hook] Formatted: $FILE"
  fi
  exit 0
}

# === EXTENSION ROUTING ===

case "${FILE##*.}" in
  js | jsx | mjs | cjs) run_formatter "$FORMAT_CMD_JS" ;;
  ts | tsx | mts | cts) run_formatter "$FORMAT_CMD_TS" ;;
  py | pyi) run_formatter "$FORMAT_CMD_PY" ;;
  go) run_formatter "$FORMAT_CMD_GO" ;;
  rs) run_formatter "$FORMAT_CMD_RS" ;;
  css | scss | sass | less) run_formatter "$FORMAT_CMD_CSS" ;;
  json | jsonc) run_formatter "$FORMAT_CMD_JSON" ;;
  yml | yaml) run_formatter "$FORMAT_CMD_YAML" ;;
  md | mdx) run_formatter "$FORMAT_CMD_MD" ;;
  *) : ;; # Unsupported extension — skip silently
esac

exit 0
