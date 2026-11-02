#!/bin/bash
# Desktop notification hook for Claude Code.
#
# Usage: notify.sh "<message>" [timeout-ms]
#
# Picks whatever notifier the host actually has and stays silent when there is
# none. Notifications are cosmetic, so every path exits 0 — a missing notifier
# must never surface as a hook failure.
#
# NOTE: deliberately NO `set -e`, and no placeholders. An earlier version of
# this wiring used {{NOTIFY_*_CMD}} placeholders in hooks-settings.json that no
# init step ever substituted, so the literal string "{{NOTIFY_STOP_CMD}}" was
# written into the project's settings.json and run as a command on every event.

MESSAGE="${1:-Claude Code}"
TIMEOUT_MS="${2:-5000}"
TITLE="Claude Code"

if command -v notify-send >/dev/null 2>&1; then
  # Linux / BSD (libnotify)
  notify-send -u normal -t "$TIMEOUT_MS" "$TITLE" "$MESSAGE" >/dev/null 2>&1
elif command -v terminal-notifier >/dev/null 2>&1; then
  # macOS, if the user installed terminal-notifier
  terminal-notifier -title "$TITLE" -message "$MESSAGE" >/dev/null 2>&1
elif command -v osascript >/dev/null 2>&1; then
  # macOS built-in. Escape double quotes and backslashes for AppleScript.
  esc=$(printf '%s' "$MESSAGE" | sed 's/\\/\\\\/g; s/"/\\"/g')
  osascript -e "display notification \"$esc\" with title \"$TITLE\"" >/dev/null 2>&1
elif command -v powershell.exe >/dev/null 2>&1; then
  # WSL — fall back to a balloon tip via Windows PowerShell.
  powershell.exe -NoProfile -Command \
    "[reflection.assembly]::LoadWithPartialName('System.Windows.Forms') > \$null; \
     \$n = New-Object System.Windows.Forms.NotifyIcon; \
     \$n.Icon = [System.Drawing.SystemIcons]::Information; \
     \$n.Visible = \$true; \
     \$n.ShowBalloonTip($TIMEOUT_MS, '$TITLE', '$MESSAGE', 'Info')" >/dev/null 2>&1
fi

# No notifier available, or the notifier failed — that is not an error.
exit 0
