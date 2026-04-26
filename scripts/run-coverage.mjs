#!/usr/bin/env node
// Daily 06:00 coverage routine.
// Runs unit tests with V8 coverage, integration tests, vitest benches, and Playwright e2e
// (web vitals). Aggregates into a single report, appends to history, posts to Slack.
//
// Usage:
//   node scripts/run-coverage.mjs                 # full run + Slack
//   node scripts/run-coverage.mjs --print --no-slack
//   node scripts/run-coverage.mjs --no-e2e        # skip Playwright (faster, no dev server)
//   node scripts/run-coverage.mjs --no-bench      # skip vitest bench

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runUnitWithCoverage, runIntegration } from "./test/runUnit.mjs";
import { runBench, runE2E, summarizePerf } from "./test/runPerf.mjs";
import { buildReport, attachDeltas, appendToHistory } from "./test/coverageReport.mjs";
import { buildCoverageSlackMessage } from "./test/coverageSlack.mjs";
import { postToSlack } from "./slack.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, "app", "data");
const CONFIG_PATH = join(ROOT, "assessment.config.json");
const CONFIG_EXAMPLE_PATH = join(ROOT, "assessment.config.example.json");
const HISTORY_PATH = join(DATA_DIR, "coverage-history.json");
const COVERAGE_PATH = join(DATA_DIR, "coverage.json");

const flags = new Set(process.argv.slice(2));
const PRINT = flags.has("--print");
const NO_SLACK = flags.has("--no-slack");
const NO_WRITE = flags.has("--no-write");
const NO_E2E = flags.has("--no-e2e");
const NO_BENCH = flags.has("--no-bench");

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const config =
    (await readJson(CONFIG_PATH)) || (await readJson(CONFIG_EXAMPLE_PATH)) || {};
  const history = (await readJson(HISTORY_PATH)) || [];

  log(`▸ unit tests + coverage`);
  const unit = await runUnitWithCoverage(ROOT, { print: PRINT });

  log(`▸ integration tests`);
  const integration = await runIntegration(ROOT, { print: PRINT });

  let benches = [];
  if (!NO_BENCH) {
    log(`▸ benchmarks`);
    const benchResult = await runBench(ROOT, { print: PRINT });
    benches = benchResult.benches;
  } else {
    log(`▸ benchmarks SKIPPED (--no-bench)`);
  }

  let e2e = { available: false, reason: "skipped via --no-e2e" };
  if (!NO_E2E) {
    log(`▸ e2e + web vitals`);
    e2e = await runE2E(ROOT, { print: PRINT, skip: false });
  } else {
    log(`▸ e2e SKIPPED (--no-e2e)`);
  }

  const perf = summarizePerf({
    benches,
    webVitals: e2e?.webVitals,
  });

  const report = attachDeltas(
    buildReport({
      unit,
      integration,
      perf,
      e2e,
      capturedAt: new Date().toISOString(),
    }),
    history,
  );

  if (!NO_WRITE) {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(COVERAGE_PATH, JSON.stringify(report, null, 2));
    await writeFile(HISTORY_PATH, JSON.stringify(appendToHistory(history, report), null, 2));
  }

  printSummary(report);

  if (!NO_SLACK && config?.slack?.enabled !== false) {
    const msg = buildCoverageSlackMessage(report, config);
    const result = await postToSlack(msg);
    if (result.posted) console.log(`\nPosted to Slack ${config.slack?.channel || ""}`.trim());
    else console.log(`\nSlack post skipped: ${result.reason}`);
  }

  return report;
}

function log(msg) {
  if (!PRINT) console.log(msg);
}

function printSummary(report) {
  const lines = [
    ``,
    `Test Coverage — ${new Date(report.capturedAt).toISOString().slice(0, 10)}`,
    `Status:    ${report.overall.pass ? "PASS" : "FAIL"} (${report.overall.passed}/${report.overall.total})`,
    `Lines:     ${report.unit.coverage.lines.toFixed(1)}%   Branches: ${report.unit.coverage.branches.toFixed(1)}%`,
    `Functions: ${report.unit.coverage.functions.toFixed(1)}%   Statements: ${report.unit.coverage.statements.toFixed(1)}%`,
    `Unit:      ${report.unit.tests.passed}/${report.unit.tests.total} (${(report.unit.durationMs / 1000).toFixed(1)}s)`,
    `Integration: ${report.integration.tests.passed}/${report.integration.tests.total} (${(report.integration.durationMs / 1000).toFixed(1)}s)`,
    report.e2e.available
      ? `E2E:       ${report.e2e.tests.passed}/${report.e2e.tests.total} (${(report.e2e.durationMs / 1000).toFixed(1)}s)`
      : `E2E:       SKIPPED (${report.e2e.reason})`,
  ];
  if (report.perf?.pipeline) {
    lines.push(
      `Pipeline:  ${report.perf.pipeline.meanMs.toFixed(1)}ms / ${report.perf.pipeline.budgetMs}ms ${
        report.perf.pipeline.withinBudget ? "✓" : "✗"
      }`,
    );
  }
  if (report.perf?.slackMsg) {
    lines.push(
      `Slack-msg: ${report.perf.slackMsg.meanMs.toFixed(2)}ms / ${report.perf.slackMsg.budgetMs}ms ${
        report.perf.slackMsg.withinBudget ? "✓" : "✗"
      }`,
    );
  }
  if (report.perf?.webVitals) {
    const wv = report.perf.webVitals;
    lines.push(
      `Web Vitals: LCP ${wv.lcp ? Math.round(wv.lcp) + "ms" : "—"} · CLS ${wv.cls?.toFixed(3) ?? "—"} · INP ${wv.inp ? Math.round(wv.inp) + "ms" : "—"}`,
    );
  }
  console.log(lines.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
