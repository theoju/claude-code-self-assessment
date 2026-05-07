import { join } from "node:path";
import { readJson } from "./_read-json";

export type Tier = "not-touched" | "starter" | "developing" | "solid" | "advanced";
export type Trend = "new" | "flat" | "improving" | "slipping";

export type Effort = "5min" | "15min" | "30min" | "1hr" | "2hr";

export interface NextAction {
  id: string;
  action: string;
  effort: Effort;
  requires?: string[];
  /**
   * Predicate evaluated against `signalsSummary`. When true, the action is
   * already done — filtered from priority lists and shown ✓ done on the
   * dimension page. Grammar: see evaluatePredicate.
   */
  satisfiedWhen?: string;
  /** Computed at load time from satisfiedWhen + signalsSummary. */
  satisfied?: boolean;
}

export interface RubricDimension {
  id: string;
  title: string;
  weight: number;
  target: number;
  rubricArea: string;
  borisTips: string;
  nextActions: NextAction[];
}

export interface ScoredDimension {
  id: string;
  // Normalized to per-dim target (rawScore / rawTarget × 100, clamped 0-100).
  // 100 = "you've hit the rubric's target for this dimension."
  score: number;
  rawScore: number;
  tier: Tier;
  evidence: string[];
  gaps: string[];
  executionScore: number | null;
  executionRawScore: number | null;
  executionEvidence: string[];
  executionGaps: string[];
  gapReason: string | null;
}

export interface Dimension extends Omit<RubricDimension, "target">, ScoredDimension {
  trend: Trend;
  summary: string;
  // After normalization, each dimension's effective target is 100. The raw
  // rubric target is preserved as `rawTarget` for display annotation.
  target: number;
  rawTarget: number;
}

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface ClaudeMdFile {
  path: string;
  score: number;
  grade: Grade;
  lineCount: number;
  ageDays: number;
  breakdown: {
    commands: number;
    architecture: number;
    patterns: number;
    conciseness: number;
    currency: number;
    actionability: number;
  };
  issues: string[];
}

export interface ClaudeMdRun {
  name: string;
  path: string;
  score: number | null;
  grade: Grade;
  files: ClaudeMdFile[];
  missing?: boolean;
  error?: string;
}

export type CriterionKey =
  | "commands"
  | "architecture"
  | "patterns"
  | "conciseness"
  | "currency"
  | "actionability";

export interface CriterionDef {
  key: CriterionKey;
  label: string;
  max: number;
}

export const CRITERIA: CriterionDef[] = [
  { key: "commands", label: "Commands/workflows", max: 20 },
  { key: "architecture", label: "Architecture clarity", max: 20 },
  { key: "patterns", label: "Non-obvious patterns", max: 15 },
  { key: "conciseness", label: "Conciseness", max: 15 },
  { key: "currency", label: "Currency", max: 15 },
  { key: "actionability", label: "Actionability", max: 15 },
];

export interface ClaudeMdSummary {
  targets: number;
  targetsScored: number;
  targetsMissing: number;
  targetsError: number;
  files: number;
  avgScore: number | null;
  avgGrade: Grade | null;
  distribution: Record<Grade, number>;
  avgBreakdown: Record<CriterionKey, number> | null;
}

export interface ClaudeMdReport {
  mode: "report-only";
  auditedAt: string;
  summary: ClaudeMdSummary;
  runs: ClaudeMdRun[];
}

export interface Assessment {
  capturedAt: string;
  overall: number;
  targetOverall: number;
  executionOverall: number | null;
  user: string | null;
  dimensions: Dimension[];
  signalsSummary: Record<string, unknown>;
  insights: Record<string, unknown> | null;
  claudeMd: ClaudeMdReport | null;
}

// ---------------------------------------------------------------------------
// Predicate engine — satisfiedWhen DSL
// ---------------------------------------------------------------------------

function readPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0 && v !== "0" && v.toLowerCase() !== "false";
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return Boolean(v);
}

function evaluateAtomic(expr: string, signals: Record<string, unknown>): boolean {
  const trimmed = expr.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("!")) return !evaluateAtomic(trimmed.slice(1), signals);
  // Order matters: longer operators first so ">=" doesn't match as ">".
  const cmpMatch = trimmed.match(/^(.+?)(>=|<=|!=|=|>|<)(.+)$/);
  if (cmpMatch) {
    const path = cmpMatch[1].trim();
    const op = cmpMatch[2];
    const rhs = cmpMatch[3].trim();
    const value = readPath(signals, path);
    if (op === "=" || op === "!=") {
      const literals = rhs.split("|").map((s) => s.trim());
      const hit = literals.some((lit) => String(value) === lit);
      return op === "=" ? hit : !hit;
    }
    const num = typeof value === "number" ? value : Number(value);
    const rhsNum = Number(rhs);
    if (Number.isNaN(num) || Number.isNaN(rhsNum)) return false;
    switch (op) {
      case ">": return num > rhsNum;
      case ">=": return num >= rhsNum;
      case "<": return num < rhsNum;
      case "<=": return num <= rhsNum;
    }
  }
  // No operator → truthy check on the path.
  return isTruthy(readPath(signals, trimmed));
}

export function evaluatePredicate(expr: string, signals: Record<string, unknown>): boolean {
  if (!expr || !expr.trim()) return false;
  const atoms = expr.split("&").map((s) => s.trim()).filter(Boolean);
  if (atoms.length === 0) return false;
  return atoms.every((atom) => evaluateAtomic(atom, signals));
}

// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), "app", "data");
const RUBRIC_PATH = join(DATA_DIR, "rubric.json");
const ASSESSMENT_PATH = join(DATA_DIR, "assessment.json");

const SUMMARIES: Record<string, string> = {
  automation:
    "Highest-leverage gap. You have the ecosystem's building blocks but may not have authored your own. Boris's 'if you do it 2×/day, turn it into a skill' rule compounds fastest here.",
  permissions:
    "You are trading safety for ergonomics if the dangerous-skip flag is on. Auto mode gives near-identical UX with a classifier backstop — strictly better.",
  "model-effort":
    "Settings tuned for 4.6-era defaults cost you reasoning depth on 4.7. Three small edits (xhigh, max-when-hard, compact window) align you with how the model was designed to run.",
  parallel:
    "Parallelism depends more on habit than tooling — spinning up multiple sessions by default rather than serializing work.",
  verification:
    "Boris calls verification the #1 tip for a reason. Tighten the closing ritual and you'll see measurable quality lift.",
  memory:
    "Memory discipline compounds. The knob worth turning is auto-compact window; the habit worth building is converting corrections into CLAUDE.md rules per project.",
  planning:
    "Planning infra is advanced when superpowers is installed. The remaining lift is behavioral: trust delegation over line-by-line guidance.",
  integrations:
    "Surface-area work is largely done. Close the last mile by installing CLIs the plugins depend on.",
  customization:
    "Baseline polish. Treat these as Friday-afternoon work unless parallel sessions make color-coding urgent.",
  scheduled:
    "The newest high-leverage features live here. Requires the permissions/auto-mode gap to be fixed first for full value.",
  remote:
    "iMessage is a good start. Everything else is optional unless you already work off-laptop.",
  learning:
    "Fully dialed in if explanatory mode is active. No action required beyond occasional use.",
};

export function tierFor(score: number): Tier {
  if (score >= 85) return "advanced";
  if (score >= 70) return "solid";
  if (score >= 55) return "developing";
  if (score >= 30) return "starter";
  return "not-touched";
}

export async function loadAssessment(): Promise<Assessment> {
  const rubric = (await readJson<{ dimensions: RubricDimension[] }>(RUBRIC_PATH)) || {
    dimensions: [],
  };
  // Older assessment.json files may not have executionOverall or insights;
  // loader backfills via ?? null below to satisfy the strict in-memory type.
  const scored = await readJson<{
    capturedAt: string;
    overall: number;
    targetOverall: number;
    executionOverall?: number | null;
    user: string | null;
    scores: ScoredDimension[];
    trends: Record<string, Trend>;
    signalsSummary: Record<string, unknown>;
    insights?: Record<string, unknown> | null;
    claudeMd?: ClaudeMdReport | null;
  }>(ASSESSMENT_PATH);

  if (!scored) {
    return {
      capturedAt: new Date().toISOString(),
      overall: 0,
      targetOverall: 100,
      executionOverall: null,
      insights: null,
      user: null,
      dimensions: rubric.dimensions.map((d) => ({
        ...d,
        score: 0,
        rawScore: 0,
        target: 100,
        rawTarget: d.target,
        tier: "not-touched",
        trend: "new",
        evidence: ["No assessment.json yet — run /self-assessment or `node scripts/run-assessment.mjs`."],
        gaps: [],
        executionScore: null,
        executionRawScore: null,
        executionEvidence: [],
        executionGaps: [],
        gapReason: null,
        summary: SUMMARIES[d.id] || "",
      })),
      signalsSummary: {},
      claudeMd: null,
    };
  }

  const dimensions: Dimension[] = rubric.dimensions.map((d) => {
    const s = scored.scores.find((x) => x.id === d.id);
    const nextActions = d.nextActions.map((a) => ({
      ...a,
      satisfied: a.satisfiedWhen
        ? evaluatePredicate(a.satisfiedWhen, scored.signalsSummary)
        : false,
    }));
    return {
      ...d,
      nextActions,
      score: s?.score ?? 0,
      rawScore: s?.rawScore ?? 0,
      target: 100,
      rawTarget: d.target,
      tier: s ? tierFor(s.score) : "not-touched",
      trend: scored.trends[d.id] ?? "new",
      evidence: s?.evidence ?? [],
      gaps: s?.gaps ?? [],
      executionScore: s?.executionScore ?? null,
      executionRawScore: s?.executionRawScore ?? null,
      executionEvidence: s?.executionEvidence ?? [],
      executionGaps: s?.executionGaps ?? [],
      gapReason: s?.gapReason ?? null,
      summary: SUMMARIES[d.id] || "",
    };
  });

  return {
    capturedAt: scored.capturedAt,
    overall: scored.overall,
    targetOverall: scored.targetOverall,
    executionOverall: scored.executionOverall ?? null,
    user: scored.user,
    dimensions,
    signalsSummary: scored.signalsSummary,
    insights: scored.insights ?? null,
    claudeMd: scored.claudeMd ?? null,
  };
}

export function gradeColor(grade: Grade | null): string {
  switch (grade) {
    case "A":
      return "text-[color:var(--color-good)]";
    case "B":
      return "text-[color:var(--color-accent)]";
    case "C":
      return "text-[color:var(--color-warn)]";
    case "D":
    case "F":
      return "text-[color:var(--color-bad)]";
    default:
      return "text-[color:var(--color-mute)]";
  }
}

export interface OverallStats {
  byTier: Record<Tier, number>;
  priorityActions: Array<{
    dimensionId: string;
    title: string;
    action: NextAction;
    weight: number;
    deficit: number;
  }>;
}

export function computeStats(dims: Dimension[]): OverallStats {
  const byTier: Record<Tier, number> = {
    "not-touched": 0,
    starter: 0,
    developing: 0,
    solid: 0,
    advanced: 0,
  };
  dims.forEach((d) => (byTier[d.tier] += 1));

  const priorityActions = dims
    .flatMap((d) =>
      d.nextActions.map((a) => ({
        dimensionId: d.id,
        title: d.title,
        action: a,
        weight: d.weight,
        deficit: d.target - d.score,
      }))
    )
    .filter((a) => a.deficit > 0)
    .filter((a) => !a.action.satisfied)
    .sort((a, b) => b.weight * b.deficit - a.weight * a.deficit)
    .slice(0, 6);

  return { byTier, priorityActions };
}

export function tierColor(tier: Tier): string {
  switch (tier) {
    case "advanced":
      return "text-[color:var(--color-good)]";
    case "solid":
      return "text-[color:var(--color-accent)]";
    case "developing":
      return "text-[color:var(--color-warn)]";
    case "starter":
      return "text-[color:var(--color-bad)]";
    case "not-touched":
      return "text-[color:var(--color-mute)]";
  }
}

export function tierLabel(tier: Tier): string {
  return tier.replace("-", " ");
}

export function trendGlyph(t: Trend): string {
  switch (t) {
    case "improving":
      return "↗";
    case "slipping":
      return "↘";
    case "flat":
      return "→";
    case "new":
      return "✦";
  }
}
