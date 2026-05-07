import type { Dimension } from "./assessment";

export interface FormulaTerm {
  label: string;
  /** Plain-language description of how the term contributes. */
  contributes: string;
  /** Maximum points this term can add. */
  max: number;
}

export interface DimensionExplainer {
  id: string;
  base: number;
  formula: FormulaTerm[];
  /** Short explanation of what the dimension is measuring overall. */
  what: string;
  /** Optional deeper context (Boris tips already render via the rubric). */
  notes?: string;
}

/**
 * Plain-language formula breakdown per dimension. Mirrors the rules in
 * scripts/score.mjs so the explainer page is the single source of truth
 * the user can audit. If a scorer changes, update the matching entry here.
 */
export const EXPLAINERS: Record<string, DimensionExplainer> = {
  automation: {
    id: "automation",
    base: 25,
    what: "How much of your daily flow is codified into hooks, slash commands, agents, and skills — i.e. how much you've stopped re-typing the same prompts.",
    formula: [
      { label: "Hooks configured", contributes: "+8 per configured hook event (PostToolUse, Stop, SessionStart, PostCompact, …); fires-cold caps credit at 7", max: 25 },
      { label: "Personal agents (~/.claude/agents)", contributes: "+5 each (substantive only — empty stubs ignored)", max: 15 },
      { label: "Personal commands (~/.claude/commands)", contributes: "+5 each", max: 15 },
      { label: "Project-scoped commands (.claude/commands)", contributes: "flat +8 if any are present", max: 8 },
      { label: "Personal skills beyond plugin defaults", contributes: "flat +7 if any are present", max: 7 },
    ],
  },
  permissions: {
    id: "permissions",
    base: 50,
    what: "Whether your permission posture is tuned (allowlist + auto mode) instead of either disabled (skip-dangerous) or fully prompted.",
    formula: [
      { label: "skipDangerousModePermissionPrompt", contributes: "−25 if true (bypasses the auto-mode classifier); +15 if false", max: 15 },
      { label: "Allowlist entries", contributes: "+3 each", max: 20 },
      { label: "Denylist entries", contributes: "flat +5 if any", max: 5 },
    ],
  },
  "model-effort": {
    id: "model-effort",
    base: 40,
    what: "Whether you've tuned reasoning depth (effortLevel) and context-rot defenses (auto-compact window) for Opus 4.7-era expectations.",
    formula: [
      { label: "effortLevel: xhigh / max", contributes: "+35", max: 35 },
      { label: "effortLevel: high", contributes: "+15", max: 15 },
      { label: "CLAUDE_CODE_AUTO_COMPACT_WINDOW set", contributes: "+15", max: 15 },
    ],
  },
  parallel: {
    id: "parallel",
    base: 40,
    what: "Throughput via worktrees, subagents, and parallel review specialists — running N things at once instead of one.",
    formula: [
      { label: "superpowers plugin", contributes: "+15 (worktrees, parallel agents, subagent-driven-development)", max: 15 },
      { label: "pr-review-toolkit plugin", contributes: "+8 (parallel specialist reviewers)", max: 8 },
      { label: "feature-dev plugin", contributes: "+7 (architect/explorer/reviewer agents)", max: 7 },
      { label: "Personal agents (≥1)", contributes: "+15 (proves you've built a custom worker)", max: 15 },
    ],
  },
  verification: {
    id: "verification",
    base: 40,
    what: "Whether every meaningful change goes through a verification pass before you accept it. Boris's #1 tip.",
    formula: [
      { label: "playwright plugin", contributes: "+15", max: 15 },
      { label: "semgrep plugin", contributes: "+10", max: 10 },
      { label: "pr-review-toolkit / code-review plugin", contributes: "+10", max: 10 },
      { label: "superpowers plugin (verification skill)", contributes: "+5", max: 5 },
      { label: "/go composite command present", contributes: "+12", max: 12 },
    ],
  },
  memory: {
    id: "memory",
    base: 45,
    what: "Long-horizon context hygiene — auto-memory, CLAUDE.md, plans, plugin support, and the auto-compact window.",
    formula: [
      { label: "Project memory files (~/.claude/projects/*/memory)", contributes: "+20 if any", max: 20 },
      { label: "claude-md-management plugin", contributes: "+10", max: 10 },
      { label: "CLAUDE.md exists", contributes: "+10", max: 10 },
      { label: "≥10 saved plans", contributes: "+8", max: 8 },
    ],
  },
  planning: {
    id: "planning",
    base: 55,
    what: "Specification quality — whether you frame work with goal/constraints/acceptance criteria and lean on plan mode for non-trivial tasks.",
    formula: [
      { label: "superpowers plugin (brainstorming/writing-plans/executing-plans)", contributes: "+15", max: 15 },
      { label: "karpathy-guidelines plugin", contributes: "+8", max: 8 },
      { label: "≥10 saved plans", contributes: "+10", max: 10 },
      { label: "feature-dev plugin", contributes: "+5", max: 5 },
    ],
  },
  integrations: {
    id: "integrations",
    base: 20,
    what: "External tool reach — MCP servers, plugins, and marketplaces that extend Claude past the editor.",
    formula: [
      { label: "Plugins enabled", contributes: "+3 per plugin", max: 70 },
    ],
  },
  customization: {
    id: "customization",
    base: 45,
    what: "Personal ergonomics — statusline, output style, keybindings — the small touches that make multi-session work tolerable.",
    formula: [
      { label: "Custom statusline.sh", contributes: "+15", max: 15 },
      { label: "explanatory-output-style plugin", contributes: "+10", max: 10 },
      { label: "Custom keybindings.json", contributes: "+10", max: 10 },
    ],
  },
  scheduled: {
    id: "scheduled",
    base: 25,
    what: "Headless / scheduled / event-driven runs — /loop, /babysit, Stop-hook notifications, cloud routines.",
    formula: [
      { label: "ralph-loop plugin", contributes: "+15", max: 15 },
      { label: "Personal scheduled/loop commands", contributes: "+20", max: 20 },
      { label: "Stop hook configured", contributes: "+10", max: 10 },
    ],
  },
  remote: {
    id: "remote",
    base: 30,
    what: "Cross-device workflow — kicking off work from phone, web, or another machine and picking it back up later.",
    formula: [
      { label: "imessage plugin", contributes: "+20", max: 20 },
      { label: "Chrome extension configured", contributes: "+15", max: 15 },
      { label: "Cloud routines (~/.claude/routines)", contributes: "+15 if any", max: 15 },
      { label: "Session teleporting used in last 30 days", contributes: "+10 (behavioral)", max: 10 },
    ],
  },
  learning: {
    id: "learning",
    base: 55,
    what: "Growing your own knowledge through Claude — explanatory mode, anti-overcomplication guidelines, skill-creator.",
    formula: [
      { label: "explanatory-output-style plugin", contributes: "+20", max: 20 },
      { label: "karpathy-guidelines plugin", contributes: "+10", max: 10 },
      { label: "skill-creator plugin", contributes: "+5", max: 5 },
    ],
  },
};

export interface PlusTenPath {
  step: string;
  rationale: string;
}

/**
 * Pick the highest-leverage move that would push the dimension's score up.
 * Uses the rubric author's stated order: the first non-satisfied action is
 * treated as the load-bearing step.
 */
export function plusTenPath(dim: Dimension): PlusTenPath | null {
  if (!dim.nextActions || dim.nextActions.length === 0) return null;
  const first = dim.nextActions.find((a) => !a.satisfied);
  if (!first) return null;
  return {
    step: first.action,
    rationale: "First action listed by the rubric author for this dimension.",
  };
}

export function explainerFor(id: string): DimensionExplainer | null {
  return EXPLAINERS[id] ?? null;
}
