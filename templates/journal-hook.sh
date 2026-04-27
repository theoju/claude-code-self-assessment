#!/bin/sh
# Tiny hook journal: appends one JSONL line per hook fire to ~/.claude/hook-fires.jsonl.
# Counted by scripts/transcript-signals.mjs to score Automation by *fires*, not
# by configured-but-silent hooks (anti-gaming).
#
# Usage in ~/.claude/settings.json:
#   "hooks": {
#     "PostToolUse": [{ "matcher": "Write|Edit", "hooks": [{ "type": "command", "command": "~/.claude/hooks/journal.sh PostToolUse Write|Edit" }] }],
#     "Stop":        [{ "hooks": [{ "type": "command", "command": "~/.claude/hooks/journal.sh Stop" }] }]
#   }

EVENT="${1:-unknown}"
MATCHER="${2:-}"
TS=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
JOURNAL="${CLAUDE_HOME:-$HOME/.claude}/hook-fires.jsonl"

mkdir -p "$(dirname "$JOURNAL")"
printf '{"event":"%s","ts":"%s","matcher":"%s"}\n' "$EVENT" "$TS" "$MATCHER" >> "$JOURNAL"
exit 0
