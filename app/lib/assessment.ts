import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildSummary } from "./dimension-summary";

export type Tier = "not-touched" | "starter" | "developing" | "solid" | "advanced";
export type Trend = "new" | "flat" | "improving" | "slipping";

export type Effort = "5min" | "15min" | "30min" | "1hr" | "2hr";

export interface NextAction {
  id: string;
  action: string;
  effort: Effort;
  requires?: string[];
}

export interface RubricDimension {
  id: string;
  title: string;
  weight: number;
  target: number;
  rubricArea: string;
  borisTips: string;
  noiseFloor?: number;
  nextActions: NextAction[];
}

export const EFFORT_MINUTES: Record<Effort, number> = {
  "5min": 5,
  "15min": 15,
  "30min": 30,
  "1hr": 60,
  "2hr": 120,
};

export interface ScoredDimension {
  id: string;
  score: number;
  tier: Tier;
  evidence: string[];
  gaps: string[];
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
  user: string | null;
  dimensions: Dimension[];
  signalsSummary: Record<string, unknown>;
  claudeMd: ClaudeMdReport | null;
}

const DATA_DIR = join(process.cwd(), "app", "data");
const RUBRIC_PATH = join(DATA_DIR, "rubric.json");
const ASSESSMENT_PATH = join(DATA_DIR, "assessment.json");

// Editorial summaries are now generated per-dimension from live signals.
// See app/lib/dimension-summary.ts. Keep this hook here in case a dimension
// needs a hand-written override later (none today).
const SUMMARY_OVERRIDES: Record<string, string> = {};

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
  const scored = await readJson<{
    capturedAt: string;
    overall: number;
    targetOverall: number;
    user: string | null;
    scores: ScoredDimension[];
    trends: Record<string, Trend>;
    signalsSummary: Record<string, unknown>;
    claudeMd?: ClaudeMdReport | null;
  }>(ASSESSMENT_PATH);

  if (!scored) {
    return {
      capturedAt: new Date().toISOString(),
      overall: 0,
      targetOverall: 0,
      user: null,
      dimensions: rubric.dimensions.map((d) => ({
        ...d,
        score: 0,
        tier: "not-touched",
        trend: "new",
        evidence: ["No assessment.json yet — run /self-assessment or `node scripts/run-assessment.mjs`."],
        gaps: [],
        summary:
          SUMMARY_OVERRIDES[d.id] ||
          buildSummary({
            id: d.id,
            title: d.title,
            score: 0,
            target: d.target,
            tier: "not-touched",
            evidence: [],
            gaps: [],
          }),
      })),
      signalsSummary: {},
      claudeMd: null,
    };
  }

  const dimensions: Dimension[] = rubric.dimensions.map((d) => {
    const s = scored.scores.find((x) => x.id === d.id);
    const score = s?.score ?? 0;
    const tier = s ? tierFor(s.score) : "not-touched";
    const evidence = s?.evidence ?? [];
    const gaps = s?.gaps ?? [];
    return {
      ...d,
      score,
      tier,
      trend: scored.trends[d.id] ?? "new",
      evidence,
      gaps,
      summary:
        SUMMARY_OVERRIDES[d.id] ||
        buildSummary({
          id: d.id,
          title: d.title,
          score,
          target: d.target,
          tier,
          evidence,
          gaps,
        }),
    };
  });

  return {
    capturedAt: scored.capturedAt,
    overall: scored.overall,
    targetOverall: scored.targetOverall,
    user: scored.user,
    dimensions,
    signalsSummary: scored.signalsSummary,
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

export interface PriorityAction {
  id: string;
  dimensionId: string;
  title: string;
  action: string;
  weight: number;
  deficit: number;
  effort: Effort;
  effortMinutes: number;
  requires: string[];
  /** Score = weight × deficit / effortMinutes. Higher = better leverage. */
  leverage: number;
}

export interface OverallStats {
  byTier: Record<Tier, number>;
  priorityActions: PriorityAction[];
}

/**
 * Order priority actions by leverage (`weight × deficit / effortMinutes`),
 * then bubble any prerequisite up so it precedes the action that requires it.
 * "30min auto-mode-on" should land before "loop-babysit" even when the latter
 * has higher raw leverage.
 */
function topoBubblePrereqs(actions: PriorityAction[]): PriorityAction[] {
  const ordered: PriorityAction[] = [];
  const placed = new Set<string>();
  const byId = new Map(actions.map((a) => [a.id, a]));
  const visit = (a: PriorityAction, stack = new Set<string>()) => {
    if (placed.has(a.id) || stack.has(a.id)) return;
    stack.add(a.id);
    for (const reqId of a.requires) {
      const req = byId.get(reqId);
      if (req) visit(req, stack);
    }
    stack.delete(a.id);
    if (!placed.has(a.id)) {
      ordered.push(a);
      placed.add(a.id);
    }
  };
  for (const a of actions) visit(a);
  return ordered;
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

  const all: PriorityAction[] = dims
    .flatMap((d) =>
      d.nextActions.map((a) => {
        const effort = (a.effort ?? "30min") as Effort;
        const minutes = EFFORT_MINUTES[effort] ?? 30;
        const deficit = Math.max(0, d.target - d.score);
        return {
          id: a.id,
          dimensionId: d.id,
          title: d.title,
          action: a.action,
          weight: d.weight,
          deficit,
          effort,
          effortMinutes: minutes,
          requires: a.requires ?? [],
          leverage: deficit > 0 ? (d.weight * deficit) / minutes : 0,
        };
      })
    )
    .filter((a) => a.deficit > 0)
    .sort((a, b) => b.leverage - a.leverage);

  const priorityActions = topoBubblePrereqs(all).slice(0, 6);
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
