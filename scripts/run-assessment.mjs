#!/usr/bin/env node
// Entry point for the /self-assessment slash command and the morning routine.
//
// Usage:
//   node scripts/run-assessment.mjs [--no-slack] [--no-write] [--print]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gatherSignals } from "./signals.mjs";
import { scoreAll, computeTrends } from "./score.mjs";
import { buildSlackMessage, postToSlack } from "./slack.mjs";
import { auditAll, summarize, CRITERIA, expandHome } from "./claude-md-audit.mjs";
import { gatherTranscriptSignals } from "./transcript-signals.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, "app", "data");
const CONFIG_PATH = join(ROOT, "assessment.config.json");
const CONFIG_EXAMPLE_PATH = join(ROOT, "assessment.config.example.json");
const HISTORY_PATH = join(DATA_DIR, "assessment-history.json");
const ASSESSMENT_PATH = join(DATA_DIR, "assessment.json");
const RUBRIC_PATH = join(DATA_DIR, "rubric.json");

const argv = process.argv.slice(2);
const flags = new Set(argv);

function flagValues(name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === name) {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        out.push(next);
        i++;
      }
    } else if (a.startsWith(`${name}=`)) {
      out.push(a.slice(name.length + 1));
    }
  }
  return out;
}

function parseTargetSpec(spec) {
  // Accepts "name=path" or just "path" (name defaults to last path segment).
  const eq = spec.indexOf("=");
  if (eq > 0) {
    return { name: spec.slice(0, eq), path: spec.slice(eq + 1) };
  }
  const path = spec;
  const name = path.replace(/\/+$/, "").split("/").pop() || path;
  return { name, path };
}

async function readJson(path, fallback = null) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

async function main() {
  const rubric = await readJson(RUBRIC_PATH);
  if (!rubric) throw new Error(`rubric.json missing at ${RUBRIC_PATH}`);

  const config =
    (await readJson(CONFIG_PATH)) ||
    (await readJson(CONFIG_EXAMPLE_PATH)) ||
    {};

  const signals = await gatherSignals(ROOT);

  // Behavioral signals are opt-in (privacy: transcripts contain real prompts).
  // CLI override: --include-transcripts forces it on for one run.
  const transcriptsOptIn =
    config?.scoring?.includeTranscripts === true || flags.has("--include-transcripts");
  if (transcriptsOptIn) {
    const behavior = await gatherTranscriptSignals({ days: 30 });
    signals.behavior = { ...behavior, transcriptsEnabled: true };
  }

  const scored = scoreAll(rubric, signals);
  const history = (await readJson(HISTORY_PATH)) || [];
  const trends = computeTrends(scored, history, rubric);

  const cliTargets = flagValues("--claude-md-target").map(parseTargetSpec);
  const cmConfig = config?.claudeMd || {};
  const configTargets = cmConfig.enabled === false ? [] : cmConfig.targets || [];
  const cmTargets = (cliTargets.length ? cliTargets : configTargets).map((t) => ({
    name: t.name,
    path: expandHome(t.path),
  }));
  const claudeMdRuns = cmTargets.length ? await auditAll(cmTargets) : [];

  const assessment = {
    ...scored,
    trends,
    signalsSummary: {
      plugins: signals.plugins.length,
      personalAgents: signals.personalAgents.length,
      personalCommands: signals.personalCommands.length,
      personalSkills: signals.personalSkills.length,
      hookTotalCount: signals.settings.hookTotalCount,
      effortLevel: signals.settings.effortLevel,
      skipDangerous: signals.settings.skipDangerousModePermissionPrompt,
      autoCompactWindow: signals.settings.autoCompactWindow,
      projectsWithMemory: signals.memory.length,
      // Behavioral aggregates (opt-in; null when transcripts not enabled).
      behavior: signals.behavior
        ? {
            sessions: signals.behavior.sessions,
            agentDispatches: signals.behavior.agentDispatches,
            planModeRate: signals.behavior.planModeRate,
            shipVerifyRate: signals.behavior.shipVerifyRate,
            autoModeLongSessions: signals.behavior.autoModeLongSessions,
            bypassPermSessions: signals.behavior.bypassPermSessions,
            hookFires: signals.behavior.hookFires,
          }
        : null,
    },
    claudeMd: claudeMdRuns.length
      ? {
          mode: "report-only",
          auditedAt: new Date().toISOString(),
          summary: summarize(claudeMdRuns),
          runs: claudeMdRuns,
        }
      : null,
    user: config?.user?.displayName || null,
  };

  if (!flags.has("--no-write")) {
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(ASSESSMENT_PATH, JSON.stringify(assessment, null, 2));
    const newHistory = [
      ...history,
      { capturedAt: assessment.capturedAt, overall: assessment.overall, scores: scored.scores },
    ].slice(-90);
    await writeFile(HISTORY_PATH, JSON.stringify(newHistory, null, 2));
  }

  if (flags.has("--print") || !process.env.CI) {
    const lines = [
      `Claude Code Mastery — ${assessment.user || "you"}`,
      `Overall ${assessment.overall} / ${assessment.targetOverall}`,
      ``,
      ...scored.scores.map((s) => {
        const d = rubric.dimensions.find((x) => x.id === s.id);
        const trend = { improving: "↗", slipping: "↘", flat: "→", new: "✦" }[trends[s.id]] || "?";
        return `  ${s.score.toString().padStart(3)} / ${d.target}  ${trend}  ${d.title}`;
      }),
    ];
    if (claudeMdRuns.length) {
      const sum = assessment.claudeMd.summary;
      lines.push("", "CLAUDE.md health (report-only):");
      const avgPart = sum.avgScore == null ? "no scoreable files" : `Avg: ${sum.avgScore} (${sum.avgGrade})`;
      lines.push(`  Targets: ${sum.targets} · Files: ${sum.files} · ${avgPart}`);
      if (sum.files > 0) {
        const dist = sum.distribution;
        lines.push(`  Distribution: A:${dist.A} B:${dist.B} C:${dist.C} D:${dist.D} F:${dist.F}`);
      }
      if (sum.targetsMissing) lines.push(`  Targets without CLAUDE.md: ${sum.targetsMissing}`);
      if (sum.targetsError) lines.push(`  Targets with errors: ${sum.targetsError}`);
      if (sum.avgBreakdown) {
        const labelWidth = Math.max(...CRITERIA.map((c) => c.label.length));
        lines.push(`  Breakdown (avg across ${sum.files} file${sum.files === 1 ? "" : "s"}):`);
        for (const c of CRITERIA) {
          const v = sum.avgBreakdown[c.key];
          lines.push(`    ${c.label.padEnd(labelWidth)}  ${v}/${c.max}`);
        }
      }
    }
    console.log(lines.join("\n"));
  }

  if (!flags.has("--no-slack") && config?.slack?.enabled) {
    const msg = buildSlackMessage(assessment, rubric, config);
    const result = await postToSlack(msg);
    if (result.posted) console.log(`\nPosted to Slack ${config.slack.channel || ""}`.trim());
    else console.log(`\nSlack post skipped: ${result.reason}`);
  }

  return assessment;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
