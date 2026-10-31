#!/usr/bin/env bash
# Installs the daily 06:00 Claude Code Coverage routine as a macOS LaunchAgent.
# Runs vitest + playwright + benchmarks, posts a Slack summary, links to /coverage.
#
#   ./scripts/launchd/install-coverage.sh           # install / reload
#   ./scripts/launchd/install-coverage.sh uninstall

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="com.$(whoami).claude-coverage"
PLIST_NAME="${LABEL}.plist"
PLIST_DEST="${HOME}/Library/LaunchAgents/${PLIST_NAME}"
TEMPLATE="${REPO_ROOT}/scripts/launchd/coverage.plist.template"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl unload "${PLIST_DEST}" 2>/dev/null || true
  rm -f "${PLIST_DEST}"
  echo "Uninstalled ${LABEL}"
  exit 0
fi

# Prefer the Keychain: `secret run` hands the webhook to each run, so the plist
# holds no Secret. Without it, .env.local's value is baked into the plist.
SECRET_BIN="$(command -v secret || true)"
RUN_PREFIX=""
if [[ -n "${SECRET_BIN}" ]] && "${SECRET_BIN}" list | grep -x 'claude-extensions/SLACK_WEBHOOK_URL' >/dev/null; then
  RUN_PREFIX="<string>${SECRET_BIN}</string><string>run</string><string>claude-extensions</string><string>--</string>"
  SLACK_WEBHOOK_URL=""
elif [[ -f "${REPO_ROOT}/.env.local" ]]; then
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

if [[ -z "${RUN_PREFIX}" && -z "${SLACK_WEBHOOK_URL:-}" ]]; then
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
  -e "s|{{RUN_PREFIX}}|${RUN_PREFIX}|g" \
  "${TEMPLATE}" > "${PLIST_DEST}"

launchctl unload "${PLIST_DEST}" 2>/dev/null || true
launchctl load "${PLIST_DEST}"

echo "Installed: ${PLIST_DEST}"
echo "Next run:  06:00 daily (75 min before the 07:15 Self-Assessment routine)"
echo ""
echo "Commands:"
echo "  launchctl list | grep ${LABEL}        # verify loaded"
echo "  launchctl start ${LABEL}              # run once now, for testing"
echo "  tail .launchd-coverage.out.log .launchd-coverage.err.log"
echo "  ./scripts/launchd/install-coverage.sh uninstall"
