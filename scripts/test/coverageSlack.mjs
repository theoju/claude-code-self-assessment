// Builds a Slack Block Kit message summarizing a coverage report.
// Reuses postToSlack from scripts/slack.mjs at call site.

export function buildCoverageSlackMessage(report, config) {
  const url = config?.publish?.publicUrl ? `${config.publish.publicUrl}/coverage` : "http://localhost:3737/coverage";
  const date = new Date(report.capturedAt).toISOString().slice(0, 10);
  const name = config?.user?.displayName || "Engineer";

  const failed = report.overall.failed;
  const linePct = formatPct(report.unit.coverage.lines);
  const branchPct = formatPct(report.unit.coverage.branches);

  const status =
    failed > 0
      ? `❌ ${failed} failing test${failed === 1 ? "" : "s"}`
      : report.overall.pass
        ? "✅ All tests passing"
        : "⚠️ No tests ran";

  const regressions = collectRegressions(report);

  return {
    channel: config?.slack?.channel,
    username: config?.slack?.username || "Claude Code Coverage",
    icon_emoji: config?.slack?.iconEmoji || ":test_tube:",
    text: `${name}'s test coverage — ${linePct} lines (${date})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Test Coverage — ${name}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Status*\n${status}` },
          { type: "mrkdwn", text: `*Date*\n${date}` },
          { type: "mrkdwn", text: `*Lines*\n${linePct}${deltaStr(report.deltas?.coverageLines)}` },
          { type: "mrkdwn", text: `*Branches*\n${branchPct}${deltaStr(report.deltas?.coverageBranches)}` },
          { type: "mrkdwn", text: `*Tests*\n${report.overall.passed}/${report.overall.total}` },
          {
            type: "mrkdwn",
            text: `*Duration*\n${(report.overall.durationMs / 1000).toFixed(1)}s`,
          },
        ],
      },
      perfSection(report.perf),
      regressions.length
        ? {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Regressions*\n" + regressions.map((r) => `• ${r}`).join("\n"),
            },
          }
        : null,
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open coverage dashboard" },
            url,
          },
        ],
      },
    ].filter(Boolean),
  };
}

function perfSection(perf) {
  if (!perf) return null;
  const lines = [];
  if (perf.pipeline) {
    const ok = perf.pipeline.withinBudget ? "✅" : "⚠️";
    lines.push(`${ok} pipeline ${perf.pipeline.meanMs.toFixed(1)}ms / ${perf.pipeline.budgetMs}ms`);
  }
  if (perf.slackMsg) {
    const ok = perf.slackMsg.withinBudget ? "✅" : "⚠️";
    lines.push(`${ok} slack-msg ${perf.slackMsg.meanMs.toFixed(2)}ms / ${perf.slackMsg.budgetMs}ms`);
  }
  if (perf.webVitals) {
    const ok = perf.webVitals.withinBudget ? "✅" : "⚠️";
    const lcp = perf.webVitals.lcp != null ? `${Math.round(perf.webVitals.lcp)}ms` : "—";
    const cls = perf.webVitals.cls != null ? perf.webVitals.cls.toFixed(3) : "—";
    lines.push(`${ok} web vitals LCP ${lcp} · CLS ${cls}`);
  }
  if (perf.scorers?.length) {
    const slow = perf.scorers.filter((s) => !s.withinBudget);
    if (slow.length) {
      lines.push(`⚠️ scorers over budget: ${slow.map((s) => s.name).join(", ")}`);
    } else {
      lines.push(`✅ all ${perf.scorers.length} scorers under ${perf.scorers[0].budgetMs}ms`);
    }
  }
  if (!lines.length) return null;
  return {
    type: "section",
    text: { type: "mrkdwn", text: "*Performance*\n" + lines.join("\n") },
  };
}

function collectRegressions(report) {
  const out = [];
  if (report.unit.tests.failed > 0) {
    out.push(`${report.unit.tests.failed} unit test failure${report.unit.tests.failed === 1 ? "" : "s"}`);
  }
  if (report.integration.tests.failed > 0) {
    out.push(
      `${report.integration.tests.failed} integration failure${report.integration.tests.failed === 1 ? "" : "s"}`,
    );
  }
  if (report.e2e?.available && report.e2e.tests.failed > 0) {
    out.push(`${report.e2e.tests.failed} e2e failure${report.e2e.tests.failed === 1 ? "" : "s"}`);
  }
  if (report.deltas?.coverageLines != null && report.deltas.coverageLines <= -1) {
    out.push(`line coverage dropped ${report.deltas.coverageLines.toFixed(1)} pp`);
  }
  if (report.perf?.pipeline && !report.perf.pipeline.withinBudget) {
    out.push(`pipeline over budget (${report.perf.pipeline.meanMs.toFixed(0)}ms)`);
  }
  if (report.perf?.webVitals && !report.perf.webVitals.withinBudget) {
    out.push(`web vitals over budget`);
  }
  return out.slice(0, 5);
}

function formatPct(n) {
  return `${(n ?? 0).toFixed(1)}%`;
}

function deltaStr(delta) {
  if (delta == null) return "";
  if (delta === 0) return " (→)";
  const sign = delta > 0 ? "+" : "";
  return ` (${sign}${delta.toFixed(1)})`;
}
