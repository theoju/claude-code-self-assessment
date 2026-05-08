#!/usr/bin/env bash
# First-run bootstrap. Idempotent — safe to re-run.
#
#   npm run setup
#
# Creates assessment.config.json and .env.local from their .example siblings
# (never overwrites). Prints the next steps.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

copy_if_missing() {
  local src="$1" dst="$2"
  if [[ -e "$dst" ]]; then
    echo "  ✓ $dst already exists — leaving as-is"
  else
    cp "$src" "$dst"
    echo "  + created $dst"
  fi
}

echo "Claude Code Self-Assessment — one-time setup"
echo ""

copy_if_missing assessment.config.example.json assessment.config.json
copy_if_missing .env.example .env.local

echo ""
echo "Next steps:"
echo ""
echo "  1. Edit assessment.config.json"
echo "       - user.displayName    (shown in the dashboard and Slack message)"
echo "       - slack.enabled       (false if you don't want Slack posts)"
echo ""
echo "  2. (Optional) Edit .env.local"
echo "       - SLACK_WEBHOOK_URL   from https://api.slack.com/apps → Incoming Webhooks"
echo ""
echo "  3. Score your setup:"
echo "       npm run assess:print"
echo ""
echo "  4. Launch the dashboard:"
echo "       npm run dev              # http://localhost:3737"
echo ""
echo "  5. (Optional) Daily 07:15 cron:"
echo "       npm run schedule:install"
echo ""
