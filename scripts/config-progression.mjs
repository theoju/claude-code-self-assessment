// Configuration-side milestone detectors. Sibling to scripts/progression.mjs:
// where that module reads session telemetry to detect *behavioral* firsts
// (first auto-mode session, first plan-mode entry), this module reads the
// signals snapshot to detect *configuration* firsts (first hook configured,
// first allowlist tuning).
//
// Why a separate module: behavioral milestones can timestamp themselves from
// session start_time fields. Configuration is a current-state snapshot with
// no embedded "when did this entry get added" data, so we maintain our own
// state file (app/data/progression-config.json) recording the first run that
// observed each signal as satisfied. Once recorded, the timestamp is permanent
// — reverting the config later does not erase the historical milestone.
//
// First-run caveat: when this module ships, every already-satisfied signal
// gets firstSeenAt = today, even if the user actually did it months ago.
// That's acceptable; the alternative (back-dating from filesystem mtimes
// or settings.json git history) is fragile and lossy.

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";

// Each detector reads a single signal from signalsSummary and decides
// whether the milestone has been crossed. evidence() builds a one-line
// description displayed beneath the milestone in the timeline UI.
const DETECTORS = [
  {
    id: "stop-hook",
    dimension: "automation",
    milestone: "First Stop hook configured",
    borisTip: 13,
    isSatisfied: (s) => !!s.hasStopHook,
    evidence: () => "Stop event hook present in settings.json",
  },
  {
    id: "formatter-hook",
    dimension: "automation",
    milestone: "First PostToolUse hook configured",
    borisTip: 7,
    isSatisfied: (s) => !!s.hasPostToolHook,
    evidence: () => "PostToolUse event hook present in settings.json",
  },
  {
    id: "allowlist-tuned",
    dimension: "permissions",
    milestone: "Allowlist tuned (≥10 entries)",
    borisTip: 69,
    isSatisfied: (s) => (s.allowListCount ?? 0) >= 10,
    evidence: (s) =>
      `${s.allowListCount} permission allowlist entries in settings.json`,
  },
  {
    id: "wildcard-allow",
    dimension: "permissions",
    milestone: "First wildcard allowlist entry",
    borisTip: 20,
    isSatisfied: (s) => !!s.hasWildcardAllow,
    evidence: () =>
      "Wildcard pattern (e.g. 'Bash(npm run *)') in permissions.allow",
  },
  {
    id: "claude-md-authored",
    dimension: "memory",
    milestone: "First CLAUDE.md authored",
    borisTip: 4,
    isSatisfied: (s) => !!s.claudeMdExists,
    evidence: () => "CLAUDE.md present at project or ~/.claude/ scope",
  },
  {
    id: "first-plugin",
    dimension: "integrations",
    milestone: "First plugin enabled",
    borisTip: 9,
    isSatisfied: (s) => (s.plugins ?? 0) > 0,
    evidence: (s) => `${s.plugins} enabled plugin${s.plugins === 1 ? "" : "s"}`,
  },
  {
    id: "effort-upgraded",
    dimension: "model-effort",
    milestone: "Effort tuned beyond default",
    borisTip: 67,
    isSatisfied: (s) =>
      s.effortLevel === "high" ||
      s.effortLevel === "xhigh" ||
      s.effortLevel === "max",
    evidence: (s) => `effortLevel=${s.effortLevel} in settings.json`,
  },
  {
    id: "auto-compact-tuned",
    dimension: "memory",
    milestone: "Auto-compact window customized",
    borisTip: 17,
    isSatisfied: (s) => !!s.autoCompactWindow,
    evidence: (s) => `CLAUDE_CODE_AUTO_COMPACT_WINDOW=${s.autoCompactWindow}`,
  },
];

export async function loadConfigProgressionState(path) {
  if (!existsSync(path)) return {};
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Corrupt state file shouldn't tank the assessment run. Treat as empty
    // and rebuild on this run; subsequent runs will preserve correctly.
    return {};
  }
}

export async function saveConfigProgressionState(path, state) {
  await writeFile(path, JSON.stringify(state, null, 2));
}

// Pure function: given current signals + prior state + a "now" stamp, return
// the new state and the list of milestones to surface. Signals with no
// firstSeenAt yet that satisfy their detector get firstSeenAt = now.
// Already-recorded milestones are preserved unchanged.
export function detectConfigMilestones({
  signalsSummary,
  priorState = {},
  now = new Date().toISOString(),
}) {
  const newState = { ...priorState };
  const milestones = [];

  for (const d of DETECTORS) {
    const prior = priorState[d.id];
    const satisfied = d.isSatisfied(signalsSummary);
    if (satisfied && (!prior || !prior.firstSeenAt)) {
      newState[d.id] = { firstSeenAt: now };
    }
    const recorded = newState[d.id];
    if (recorded?.firstSeenAt) {
      milestones.push({
        timestamp: recorded.firstSeenAt,
        dimension: d.dimension,
        milestone: d.milestone,
        borisTip: d.borisTip,
        evidence: d.evidence(signalsSummary),
        // Synthetic sessionId: distinguishes config milestones from behavioral
        // ones in the unified timeline (which keys on sessionId). Stable per
        // detector so React keys remain consistent across renders.
        sessionId: `config:${d.id}`,
        source: "config",
      });
    }
  }

  return { state: newState, milestones };
}

// Re-exported for tests; allows `_DETECTORS.length` smoke checks without
// reaching into implementation details.
export const _DETECTORS = DETECTORS;
