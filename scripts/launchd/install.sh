#!/usr/bin/env bash
# Installs the daily 07:15 Claude Code Mastery assessment as a macOS LaunchAgent.
#
#   ./scripts/launchd/install.sh          # install / reload
#   ./scripts/launchd/install.sh uninstall
#
# Reads SLACK_WEBHOOK_URL from .env.local (if present) so you don't have to paste it.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="com.$(whoami).claude-mastery"
PLIST_NAME="${LABEL}.plist"
PLIST_DEST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"
TEMPLATE="${REPO_ROOT}/scripts/launchd/claude-mastery.plist.template"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl unload "${PLIST_DEST}" 2>/dev/null || true
  rm -f "${PLIST_DEST}"
  echo "Uninstalled ${LABEL}"
  exit 0
fi

if [[ -f "${REPO_ROOT}/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${REPO_ROOT}/.env.local"
  set +a
fi

NODE_BIN="$(command -v node || true)"
if [[ -z "${NODE_BIN}" ]]; then
  echo "Error: node not on PATH. Install Node.js first." >&2
  exit 1
fi

if [[ -z "${SLACK_WEBHOOK_URL:-}" ]]; then
  echo "Warning: SLACK_WEBHOOK_URL not set — Slack posts will be skipped."
  echo "         Add it to .env.local and re-run this installer."
  SLACK_WEBHOOK_URL=""
fi

mkdir -p "${HOME}/Library/LaunchAgents"

sed \
  -e "s|{{LABEL}}|${LABEL}|g" \
  -e "s|{{NODE_BIN}}|${NODE_BIN}|g" \
  -e "s|{{REPO_ROOT}}|${REPO_ROOT}|g" \
  -e "s|{{HOME}}|${HOME}|g" \
  -e "s|{{SLACK_WEBHOOK_URL}}|${SLACK_WEBHOOK_URL}|g" \
  "${TEMPLATE}" > "${PLIST_DEST}"

launchctl unload "${PLIST_DEST}" 2>/dev/null || true
launchctl load "${PLIST_DEST}"

echo "Installed: ${PLIST_DEST}"
echo "Next run:  07:15 daily (launchd wakes the laptop if asleep)"
echo ""
echo "Commands:"
echo "  launchctl list | grep ${LABEL}        # verify loaded"
echo "  launchctl start ${LABEL}              # run once now, for testing"
echo "  tail .launchd.out.log .launchd.err.log"
echo "  ./scripts/launchd/install.sh uninstall"
