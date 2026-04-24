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

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = join(ROOT, "app", "data");
const CONFIG_PATH = join(ROOT, "assessment.config.json");
const CONFIG_EXAMPLE_PATH = join(ROOT, "assessment.config.example.json");
const HISTORY_PATH = join(DATA_DIR, "assessment-history.json");
const ASSESSMENT_PATH = join(DATA_DIR, "assessment.json");
const RUBRIC_PATH = join(DATA_DIR, "rubric.json");

const flags = new Set(process.argv.slice(2));

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
  const scored = scoreAll(rubric, signals);
  const history = (await readJson(HISTORY_PATH)) || [];
  const trends = computeTrends(scored, history);

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
    },
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
