// Runs vitest benchmarks and the Playwright web-vitals suite, returning a normalized
// performance object with `withinBudget` flags. Designed to never throw — it returns
// `available: false` when a runner is missing so the orchestrator can degrade gracefully.

import { spawn } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SCORER_BUDGET_MS = 1; // each scorer should finish in < 1ms median
const PIPELINE_BUDGET_MS = 1000; // full assessment pipeline < 1s
const SLACK_BUDGET_MS = 5; // buildSlackMessage < 5ms
const WV_BUDGETS = { lcp: 2500, cls: 0.1, inp: 200 };

export async function runBench(repoRoot, { print = false } = {}) {
  await mkdir(join(repoRoot, "coverage"), { recursive: true });
  const outPath = join(repoRoot, "coverage", "bench.json");
  const args = ["vitest", "bench", "--run", `--outputJson=${outPath}`];
  const start = Date.now();
  const exitCode = await spawnSilent("npx", args, repoRoot, print);
  const durationMs = Date.now() - start;
  const benches = await parseBenchOutput(outPath);
  return { durationMs, exitCode, benches };
}

export async function runE2E(repoRoot, { print = false, skip = false } = {}) {
  if (skip) return { available: false, reason: "skipped via --no-e2e" };
  if (!existsSync(join(repoRoot, "node_modules", "@playwright"))) {
    return { available: false, reason: "@playwright/test not installed" };
  }
  const start = Date.now();
  const exitCode = await spawnSilent("npx", ["playwright", "test"], repoRoot, print);
  const durationMs = Date.now() - start;

  const playwrightJson = await readJson(join(repoRoot, "coverage", "playwright.json"));
  const webVitals = await readJson(join(repoRoot, "coverage", "web-vitals.json"));

  const tests = playwrightJson?.stats
    ? {
        total: (playwrightJson.stats.expected ?? 0) + (playwrightJson.stats.unexpected ?? 0),
        passed: playwrightJson.stats.expected ?? 0,
        failed: playwrightJson.stats.unexpected ?? 0,
      }
    : { total: 0, passed: 0, failed: 0 };

  return {
    available: true,
    durationMs,
    exitCode,
    tests,
    webVitals: shapeWebVitals(webVitals?.samples || []),
  };
}

export function summarizePerf({ benches, webVitals }) {
  // benches: array of { name, hz, mean(ms) }
  const scorerBenches = benches.filter((b) => b.name.startsWith("SCORERS."));
  const pipelineBench = benches.find((b) =>
    /gatherSignals \+ scoreAll \+ buildSlackMessage|scoreAll \(full rubric\)/.test(b.name),
  );
  const slackBench = benches.find((b) => b.name === "buildSlackMessage");

  const scorers = scorerBenches.map((b) => ({
    name: b.name.replace(/^SCORERS\./, ""),
    hz: b.hz,
    meanMs: b.mean,
    budgetMs: SCORER_BUDGET_MS,
    withinBudget: b.mean < SCORER_BUDGET_MS,
  }));

  const pipeline = pipelineBench
    ? {
        meanMs: pipelineBench.mean,
        budgetMs: PIPELINE_BUDGET_MS,
        withinBudget: pipelineBench.mean < PIPELINE_BUDGET_MS,
      }
    : null;

  const slackMsg = slackBench
    ? {
        meanMs: slackBench.mean,
        budgetMs: SLACK_BUDGET_MS,
        withinBudget: slackBench.mean < SLACK_BUDGET_MS,
      }
    : null;

  const wv = webVitals?.length ? webVitals : null;
  const wvWorst = wv
    ? {
        lcp: maxOrNull(wv.map((s) => s.lcp)),
        cls: maxOrNull(wv.map((s) => s.cls)),
        inp: maxOrNull(wv.map((s) => s.inp)),
      }
    : null;
  const webVitalsBlock = wvWorst
    ? {
        ...wvWorst,
        budgets: WV_BUDGETS,
        withinBudget:
          (wvWorst.lcp == null || wvWorst.lcp < WV_BUDGETS.lcp) &&
          (wvWorst.cls == null || wvWorst.cls < WV_BUDGETS.cls) &&
          (wvWorst.inp == null || wvWorst.inp < WV_BUDGETS.inp),
        samples: wv,
      }
    : null;

  return { scorers, pipeline, slackMsg, webVitals: webVitalsBlock };
}

function shapeWebVitals(samples) {
  return samples.map((s) => ({
    route: s.route,
    lcp: s.lcp,
    cls: s.cls,
    inp: s.inp,
    fcp: s.fcp,
    ttfb: s.ttfb,
  }));
}

function maxOrNull(arr) {
  const nums = arr.filter((n) => typeof n === "number");
  return nums.length ? Math.max(...nums) : null;
}

async function parseBenchOutput(path) {
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    // vitest bench JSON: files[].groups[].benchmarks[] with { name, result: { mean, hz } }
    const out = [];
    for (const file of raw.files || []) {
      for (const group of file.groups || []) {
        for (const b of group.benchmarks || []) {
          out.push({
            name: b.name,
            mean: b.result?.mean ?? b.mean ?? 0,
            hz: b.result?.hz ?? b.hz ?? 0,
          });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

async function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function spawnSilent(cmd, args, cwd, print) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: print ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    if (!print) {
      child.stdout?.on("data", () => {});
      child.stderr?.on("data", () => {});
    }
    child.on("close", (code) => resolve(code ?? 0));
  });
}
