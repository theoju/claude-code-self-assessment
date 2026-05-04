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
    throw new Error(`cutoffFromLookback: invalid now timestamp ${JSON.stringify(now)}`);
  }
  return nowMs - lookbackDays * 86_400_000;
}

async function readJsonDir(dir) {
  const files = (await safeReaddir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(files.map((f) => safeReadJson(join(dir, f))));
}

export async function loadSessionMeta(claudeHome) {
  const docs = await readJsonDir(join(claudeHome, "usage-data", "session-meta"));
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

// Single transcript scan that surfaces every behavioral signal both consumers
// need (permissionMode set, worktree-state flag, attributionSkill set). Keeps
// transcript parsing in one place even if today both insights-signals.mjs and
// progression.mjs each call it on the same files.
export async function scanTranscriptModes(path) {
  const modes = new Set();
  const skills = new Set();
  let hasWorktreeState = false;
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }) });
  for await (const raw of rl) {
    if (!raw) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (entry.type === "worktree-state") hasWorktreeState = true;
    if (typeof entry.permissionMode === "string") modes.add(entry.permissionMode);
    if (typeof entry.attributionSkill === "string") skills.add(entry.attributionSkill);
  }
  return { modes, hasWorktreeState, skills };
}
