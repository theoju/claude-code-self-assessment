#!/usr/bin/env node
// Entry point for the /self-assessment slash command and the morning routine.
//
// Usage:
//   node scripts/run-assessment.mjs [--no-slack] [--no-write] [--print]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { gatherSignals } from "./signals.mjs";
import { scoreAll, computeTrends } from "./score.mjs";
import { detectMilestones } from "./progression.mjs";
import { buildSlackMessage, postToSlack } from "./slack.mjs";
import { auditAll, summarize, CRITERIA, expandHome } from "./claude-md-audit.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, "app", "data");
const CONFIG_PATH = join(ROOT, "assessment.config.json");
const CONFIG_EXAMPLE_PATH = join(ROOT, "assessment.config.example.json");
const HISTORY_PATH = join(DATA_DIR, "assessment-history.json");
const ASSESSMENT_PATH = join(DATA_DIR, "assessment.json");
const RUBRIC_PATH = join(DATA_DIR, "rubric.json");
const PROGRESSION_PATH = join(DATA_DIR, "progression.json");

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

function singleFlagValue(name) {
  const all = flagValues(name);
  return all.length ? all[all.length - 1] : null;
}

function parseLookbackOverride(raw) {
  if (raw === "none" || raw === "null" || raw === "full") return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`expected a positive integer or 'none', got: ${JSON.stringify(raw)}`);
  }
  return n;
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

  const scoringConfig = config?.scoring || {};
  // CLI flags override config so a one-shot deep run doesn't require editing
  // assessment.config.json. Useful for the weekly transcript scan.
  const insightsLookbackRaw = singleFlagValue("--insights-lookback");
  const progressionLookbackRaw = singleFlagValue("--progression-lookback");
  const insightsLookbackDays =
    insightsLookbackRaw != null
      ? parseLookbackOverride(insightsLookbackRaw)
      : scoringConfig.insightsLookbackDays ?? 30;
  const progressionLookbackDays =
    progressionLookbackRaw != null
      ? parseLookbackOverride(progressionLookbackRaw)
      : scoringConfig.progressionLookbackDays ?? null;
  // --no-transcripts > --include-transcripts > config. The explicit "off"
  // form lets users skip the expensive scan in one run without editing config.
  const includeTranscripts = flags.has("--no-transcripts")
    ? false
    : flags.has("--include-transcripts")
    ? true
    : !!scoringConfig.includeTranscripts;

  const claudeHome = process.env.CLAUDE_HOME || join(homedir(), ".claude");
  const signals = await gatherSignals(ROOT, {
    insightsLookbackDays,
    includeTranscripts,
  });
  const progression = await detectMilestones({
    claudeHome,
    lookbackDays: progressionLookbackDays,
    includeTranscripts,
  });
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
      insightsAvailable: !!signals.insights,
      insightsSessionsAnalyzed: signals.insights?.sessionsAnalyzed ?? 0,
      insightsLookbackDays: signals.insights?.lookbackDays ?? null,
      insightsTranscriptsScanned: signals.insights?.transcriptsScanned ?? false,
      insightsHookFireCount: signals.insights?.hookFireCount ?? 0,
    },
    insights: signals.insights,
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
    if (progression) {
      await writeFile(PROGRESSION_PATH, JSON.stringify(progression, null, 2));
    }
  }

  if (flags.has("--print") || !process.env.CI) {
    const exHeader = scored.executionOverall == null
      ? "Execution    n/a / 100 (run /insights to populate)"
      : `Execution ${scored.executionOverall} / 100 (observed practice)`;
    const lines = [
      `Claude Code Self-Assessment — ${assessment.user || "you"}`,
      `Platform Setup  ${assessment.overall} / 100`,
      exHeader,
      ``,
      ...scored.scores.map((s) => {
        const d = rubric.dimensions.find((x) => x.id === s.id);
        const trend = { improving: "↗", slipping: "↘", flat: "→", new: "✦" }[trends[s.id]] || "?";
        const ex = typeof s.executionScore === "number"
          ? ` · ex ${s.executionScore.toString().padStart(3)}`
          : "";
        // Show normalized score with raw value as a small hint so the formula
        // (raw / d.target × 100) is auditable from the CLI output.
        return `  ${s.score.toString().padStart(3)} / 100  ${trend}  ${d.title} (raw ${s.rawScore}/${d.target})${ex}`;
      }),
    ];
    if (progression && progression.milestones.length > 0) {
      lines.push("", `Progression — ${progression.milestones.length} milestone(s):`);
      for (const m of progression.milestones) {
        lines.push(`  ${m.timestamp.slice(0, 10)}  ${m.milestone}  (${m.dimension}, Boris tip ${m.borisTip})`);
      }
    }
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
