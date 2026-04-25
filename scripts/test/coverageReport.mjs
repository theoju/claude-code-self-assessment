// Composes the coverage report shape, computes deltas vs the previous run,
// and slices history to a 90-entry rolling window.

export function buildReport({ unit, integration, perf, e2e, capturedAt }) {
  const totals = computeTotals({ unit, integration, e2e });
  return {
    capturedAt,
    overall: {
      pass: totals.passed === totals.total && totals.total > 0,
      total: totals.total,
      passed: totals.passed,
      failed: totals.failed,
      coveragePct: unit?.coverage?.lines ?? 0,
      durationMs: (unit?.durationMs ?? 0) + (integration?.durationMs ?? 0) + (e2e?.durationMs ?? 0),
    },
    unit: {
      tests: unit?.tests ?? { total: 0, passed: 0, failed: 0 },
      coverage: unit?.coverage ?? { lines: 0, branches: 0, functions: 0, statements: 0 },
      durationMs: unit?.durationMs ?? 0,
      exitCode: unit?.exitCode ?? null,
    },
    integration: {
      tests: integration?.tests ?? { total: 0, passed: 0, failed: 0 },
      durationMs: integration?.durationMs ?? 0,
      exitCode: integration?.exitCode ?? null,
    },
    e2e: e2e?.available
      ? {
          available: true,
          tests: e2e.tests,
          durationMs: e2e.durationMs,
          exitCode: e2e.exitCode,
        }
      : { available: false, reason: e2e?.reason ?? "skipped" },
    perf,
  };
}

export function attachDeltas(current, history) {
  const prev = history.length ? history[history.length - 1] : null;
  if (!prev) return { ...current, deltas: null };
  const d = (a, b) =>
    typeof a === "number" && typeof b === "number" ? Math.round((a - b) * 100) / 100 : null;
  const deltas = {
    coverageLines: d(current.unit.coverage.lines, prev.unit.coverage.lines),
    coverageBranches: d(current.unit.coverage.branches, prev.unit.coverage.branches),
    unitPassed: d(current.unit.tests.passed, prev.unit.tests.passed),
    integrationPassed: d(current.integration.tests.passed, prev.integration.tests.passed),
    pipelineMeanMs:
      current.perf?.pipeline && prev.perf?.pipeline
        ? d(current.perf.pipeline.meanMs, prev.perf.pipeline.meanMs)
        : null,
    slackMeanMs:
      current.perf?.slackMsg && prev.perf?.slackMsg
        ? d(current.perf.slackMsg.meanMs, prev.perf.slackMsg.meanMs)
        : null,
  };
  return { ...current, deltas };
}

export function appendToHistory(history, current) {
  const lite = {
    capturedAt: current.capturedAt,
    overall: current.overall,
    unit: { tests: current.unit.tests, coverage: current.unit.coverage },
    integration: { tests: current.integration.tests },
    perf: current.perf
      ? {
          pipeline: current.perf.pipeline,
          slackMsg: current.perf.slackMsg,
          webVitals: current.perf.webVitals
            ? { lcp: current.perf.webVitals.lcp, cls: current.perf.webVitals.cls, inp: current.perf.webVitals.inp }
            : null,
        }
      : null,
  };
  return [...history, lite].slice(-90);
}

function computeTotals({ unit, integration, e2e }) {
  const sources = [unit?.tests, integration?.tests, e2e?.tests].filter(Boolean);
  const passed = sources.reduce((s, t) => s + (t.passed ?? 0), 0);
  const failed = sources.reduce((s, t) => s + (t.failed ?? 0), 0);
  return { total: passed + failed, passed, failed };
}
