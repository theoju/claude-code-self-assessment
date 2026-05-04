import { join } from "node:path";
import { readJson } from "./_read-json";

export interface CoverageMetrics {
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

export interface TestCounts {
  total: number;
  passed: number;
  failed: number;
}

export interface ScorerPerf {
  name: string;
  hz: number;
  meanMs: number;
  budgetMs: number;
  withinBudget: boolean;
}

export interface PerfBlock {
  scorers: ScorerPerf[];
  pipeline: { meanMs: number; budgetMs: number; withinBudget: boolean } | null;
  slackMsg: { meanMs: number; budgetMs: number; withinBudget: boolean } | null;
  webVitals:
    | {
        lcp: number | null;
        cls: number | null;
        inp: number | null;
        budgets: { lcp: number; cls: number; inp: number };
        withinBudget: boolean;
        samples: Array<{ route: string; lcp: number | null; cls: number | null; inp: number | null }>;
      }
    | null;
}

export interface CoverageReport {
  capturedAt: string;
  overall: {
    pass: boolean;
    total: number;
    passed: number;
    failed: number;
    coveragePct: number;
    durationMs: number;
  };
  unit: { tests: TestCounts; coverage: CoverageMetrics; durationMs: number; exitCode: number | null };
  integration: { tests: TestCounts; durationMs: number; exitCode: number | null };
  e2e: { available: true; tests: TestCounts; durationMs: number; exitCode: number | null } | { available: false; reason: string };
  perf: PerfBlock | null;
  deltas: {
    coverageLines: number | null;
    coverageBranches: number | null;
    unitPassed: number | null;
    integrationPassed: number | null;
    pipelineMeanMs: number | null;
    slackMeanMs: number | null;
  } | null;
}

export interface HistoryEntry {
  capturedAt: string;
  overall: CoverageReport["overall"];
  unit: { tests: TestCounts; coverage: CoverageMetrics };
  integration: { tests: TestCounts };
  perf: {
    pipeline: { meanMs: number; budgetMs: number; withinBudget: boolean } | null;
    slackMsg: { meanMs: number; budgetMs: number; withinBudget: boolean } | null;
    webVitals: { lcp: number | null; cls: number | null; inp: number | null } | null;
  } | null;
}

const DATA_DIR = join(process.cwd(), "app", "data");
const COVERAGE_PATH = join(DATA_DIR, "coverage.json");
const HISTORY_PATH = join(DATA_DIR, "coverage-history.json");

export async function loadCoverage(): Promise<{
  latest: CoverageReport | null;
  history: HistoryEntry[];
}> {
  const latest = await readJson<CoverageReport>(COVERAGE_PATH);
  const history = (await readJson<HistoryEntry[]>(HISTORY_PATH)) ?? [];
  return { latest, history: history.slice(-30) };
}

export function pctTone(pct: number, target: number): "good" | "warn" | "bad" {
  if (pct >= target) return "good";
  if (pct >= target * 0.75) return "warn";
  return "bad";
}
