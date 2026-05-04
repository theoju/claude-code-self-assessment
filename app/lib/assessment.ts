import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type Tier = "not-touched" | "starter" | "developing" | "solid" | "advanced";
export type Trend = "new" | "flat" | "improving" | "slipping";

export interface RubricDimension {
  id: string;
  title: string;
  weight: number;
  target: number;
  rubricArea: string;
  borisTips: string;
  nextActions: string[];
}

export interface ScoredDimension {
  id: string;
  score: number;
  tier: Tier;
  evidence: string[];
  gaps: string[];
  executionScore: number | null;
  executionEvidence: string[];
  executionGaps: string[];
  gapReason: string | null;
}

export interface Dimension extends RubricDimension, ScoredDimension {
  trend: Trend;
  summary: string;
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

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

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
      targetOverall: 0,
      executionOverall: null,
      insights: null,
      user: null,
      dimensions: rubric.dimensions.map((d) => ({
        ...d,
        score: 0,
        tier: "not-touched",
        trend: "new",
        evidence: ["No assessment.json yet — run /self-assessment or `node scripts/run-assessment.mjs`."],
        gaps: [],
        executionScore: null,
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
    return {
      ...d,
      score: s?.score ?? 0,
      tier: s ? tierFor(s.score) : "not-touched",
      trend: scored.trends[d.id] ?? "new",
      evidence: s?.evidence ?? [],
      gaps: s?.gaps ?? [],
      executionScore: s?.executionScore ?? null,
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
    action: string;
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
