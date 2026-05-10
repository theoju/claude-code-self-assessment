// Shared loaders for ~/.claude/usage-data/. Both the per-window aggregation
// (insights-signals.mjs) and the time-ordered milestone walk (progression.mjs)
// read the same files; this module keeps the read shape in one place.

import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { safeReadJson, safeReaddir } from "./_fs-utils.mjs";

export function withinWindow(startTime, cutoff) {
  if (cutoff === null) return true;
  if (!startTime) return false;
  const t = Date.parse(startTime);
  return Number.isFinite(t) && t >= cutoff;
}

export function cutoffFromLookback(now, lookbackDays) {
  if (lookbackDays == null) return null;
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error(
      `cutoffFromLookback: invalid now timestamp ${JSON.stringify(now)}`,
    );
  }
  return nowMs - lookbackDays * 86_400_000;
}

async function readJsonDir(dir) {
  const files = (await safeReaddir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(files.map((f) => safeReadJson(join(dir, f))));
}

export async function loadSessionMeta(claudeHome) {
  const docs = await readJsonDir(
    join(claudeHome, "usage-data", "session-meta"),
  );
  return docs.filter((d) => d && d.session_id);
}

export async function loadFacetsMap(claudeHome) {
  const docs = await readJsonDir(join(claudeHome, "usage-data", "facets"));
  const map = new Map();
  for (const d of docs) {
    if (d && d.session_id) map.set(d.session_id, d);
  }
  return map;
}

// Build sessionId → transcript path map in a single pass over projects/*.
// Avoids O(sessions × projects) existsSync calls in any per-session loop.
// Worktrees can leave the same sessionId under multiple project dirs; sort
// and first-wins so repeat runs return identical results.
export async function buildTranscriptIndex(claudeHome) {
  const projectsDir = join(claudeHome, "projects");
  const projects = (await safeReaddir(projectsDir)).slice().sort();
  const entries = await Promise.all(
    projects.map(async (p) => {
      const projectPath = join(projectsDir, p);
      const files = await safeReaddir(projectPath);
      return files
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => [f.slice(0, -".jsonl".length), join(projectPath, f)]);
    }),
  );
  const index = new Map();
  for (const projectEntries of entries) {
    for (const [sessionId, path] of projectEntries) {
      if (!index.has(sessionId)) index.set(sessionId, path);
    }
  }
  return index;
}

// Walks ~/.claude/projects/*/*.jsonl transcripts within lookback. Returns
// counts of /go /batch /focus /schedule slash commands, sessions where
// /loop + /babysit both appear (1 per session), and sessions where an
// ExitPlanMode tool_use is followed by a non-plan tool_use within the
// next 2 assistant messages.
//
// Plan-then-launch detection (confirmed by transcript sampling 2026-05-09):
// the marker is `message.content[*].type === "tool_use" &&
// message.content[*].name === "ExitPlanMode"` on an assistant-role line.
// Window is "next 2 messages" — index+1 and index+2 in the per-session
// stream. Any tool_use whose name !== "ExitPlanMode" within that window
// counts the session once.

const SLASH_RE = {
  go: /^\/go(\s|$)/,
  batch: /^\/batch(\s|$)/,
  focus: /^\/focus(\s|$)/,
  schedule: /^\/schedule(\s|$)/,
  loop: /^\/loop(\s|$)/,
  babysit: /^\/babysit(\s|$)/,
};

function userMessageText(line) {
  if (line.type !== "user" || !line.message) return null;
  const c = line.message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    for (const item of c) {
      if (item?.type === "text" && typeof item.text === "string") {
        return item.text;
      }
    }
  }
  return null;
}

function assistantToolUseName(line) {
  if (line.type !== "assistant" || !line.message) return null;
  const c = line.message.content;
  if (!Array.isArray(c)) return null;
  for (const item of c) {
    if (item?.type === "tool_use" && typeof item.name === "string") {
      return item.name;
    }
  }
  return null;
}

export async function scanTranscriptInvocations({
  projectsRoot,
  now = new Date(),
  lookbackDays = 30,
} = {}) {
  const counts = {
    goCommandUses: 0,
    batchCommandUses: 0,
    focusCommandUses: 0,
    scheduleCommandUses: 0,
    babysitLoopUses: 0,
    planThenLaunchSessions: 0,
  };
  // Vitest skip: when integration tests run gatherSignals without injecting
  // projectsRoot, don't walk the developer's real ~/.claude/projects/.
  if (process.env.VITEST && !arguments[0]?.projectsRoot) {
    return counts;
  }
  if (!projectsRoot) return counts;
  let sessionFiles;
  try {
    const { readdir } = await import("node:fs/promises");
    const projectDirs = await readdir(projectsRoot, { withFileTypes: true });
    sessionFiles = [];
    for (const d of projectDirs) {
      if (!d.isDirectory()) continue;
      const inner = await readdir(join(projectsRoot, d.name));
      for (const f of inner) {
        if (f.endsWith(".jsonl")) {
          sessionFiles.push(join(projectsRoot, d.name, f));
        }
      }
    }
  } catch {
    return counts;
  }
  const cutoff = now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;

  for (const path of sessionFiles) {
    let raw;
    try {
      const { readFile } = await import("node:fs/promises");
      raw = await readFile(path, "utf8");
    } catch {
      continue;
    }
    const lines = raw
      .split("\n")
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    let sessionHasLoop = false;
    let sessionHasBabysit = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ts = Date.parse(line.timestamp || "");
      if (!Number.isNaN(ts) && ts < cutoff) continue;

      const uText = userMessageText(line);
      if (uText) {
        const trimmed = uText.trimStart();
        if (SLASH_RE.go.test(trimmed)) counts.goCommandUses++;
        if (SLASH_RE.batch.test(trimmed)) counts.batchCommandUses++;
        if (SLASH_RE.focus.test(trimmed)) counts.focusCommandUses++;
        if (SLASH_RE.schedule.test(trimmed)) counts.scheduleCommandUses++;
        if (SLASH_RE.loop.test(trimmed)) sessionHasLoop = true;
        if (SLASH_RE.babysit.test(trimmed)) sessionHasBabysit = true;
      }

      const toolName = assistantToolUseName(line);
      if (toolName === "ExitPlanMode") {
        for (let j = i + 1; j <= i + 2 && j < lines.length; j++) {
          const next = assistantToolUseName(lines[j]);
          if (next && next !== "ExitPlanMode") {
            counts.planThenLaunchSessions++;
            break;
          }
        }
      }
    }

    if (sessionHasLoop && sessionHasBabysit) counts.babysitLoopUses++;
  }
  return counts;
}

// Single transcript scan that surfaces every behavioral signal both consumers
// need (permissionMode set, worktree-state flag, attributionSkill set). Keeps
// transcript parsing in one place even if today both insights-signals.mjs and
// progression.mjs each call it on the same files.
export async function scanTranscriptModes(path) {
  const modes = new Set();
  const skills = new Set();
  let hasWorktreeState = false;
  // Detect explanatory-output-style adoption via its rendered banner. The
  // transcript schema has no outputStyle field (verified empirically across
  // 60+ sample transcripts); the plugin's instruction to emit `★ Insight `
  // is the only reliable behavioral signature. Substring on raw line text
  // is intentional — avoids stringifying nested message.content per turn.
  let learningModeMatches = 0;
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
  });
  for await (const raw of rl) {
    if (!raw) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (entry.type === "worktree-state") hasWorktreeState = true;
    if (typeof entry.permissionMode === "string")
      modes.add(entry.permissionMode);
    if (typeof entry.attributionSkill === "string")
      skills.add(entry.attributionSkill);
    if (entry.type === "assistant" && raw.includes("★ Insight ")) {
      learningModeMatches += 1;
    }
  }
  return { modes, hasWorktreeState, skills, learningModeMatches };
}
