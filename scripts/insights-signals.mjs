// Pure read-only ingest. Returns null when ~/.claude/usage-data/ is absent so
// the rest of the scoring pipeline can fail soft for fresh users.

import { existsSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { safeReadJson, safeReaddir } from "./_fs-utils.mjs";

// Matches plugin-namespaced MCP tool names (`mcp__plugin_<name>_<server>__*`).
// Built-in connectors like `mcp__claude_ai_Gmail__*` are intentionally not
// attributed — they're not user-installed plugins.
const PLUGIN_TOOL_RE = /^mcp__plugin_([a-z0-9-]+?)_[a-z0-9-]+__/i;

function parsePluginName(toolName) {
  const m = toolName.match(PLUGIN_TOOL_RE);
  return m ? m[1].toLowerCase() : null;
}

function withinWindow(startTime, cutoff) {
  if (cutoff === null) return true;
  if (!startTime) return false;
  const t = Date.parse(startTime);
  return Number.isFinite(t) && t >= cutoff;
}

async function readJsonDir(dir) {
  const files = (await safeReaddir(dir)).filter((f) => f.endsWith(".json"));
  return Promise.all(files.map((f) => safeReadJson(join(dir, f))));
}

async function loadSessionMeta(dir) {
  const docs = await readJsonDir(dir);
  return docs.filter((d) => d && d.session_id);
}

async function loadFacetsMap(dir) {
  const docs = await readJsonDir(dir);
  const map = new Map();
  for (const d of docs) {
    if (d && d.session_id) map.set(d.session_id, d);
  }
  return map;
}

async function readHookFires(claudeHome, cutoff) {
  const path = join(claudeHome, "hook-fires.jsonl");
  if (!existsSync(path)) return { total: 0, byEvent: {} };
  let total = 0;
  const byEvent = {};
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }) });
  for await (const raw of rl) {
    if (!raw) continue;
    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      continue;
    }
    if (cutoff !== null) {
      const t = Date.parse(entry.timestamp || "");
      if (!Number.isFinite(t) || t < cutoff) continue;
    }
    total += 1;
    const ev = entry.event || "unknown";
    byEvent[ev] = (byEvent[ev] || 0) + 1;
  }
  return { total, byEvent };
}

// Build sessionId → transcript path map in a single pass over projects/*.
// Avoids O(sessions × projects) existsSync calls in the transcript loop.
// Worktrees can leave the same sessionId under multiple project dirs; sort
// and first-wins so repeat runs return identical counters.
async function buildTranscriptIndex(claudeHome) {
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

async function scanTranscript(path) {
  const modes = new Set();
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
  }
  return { modes, hasWorktreeState };
}

export async function gatherInsightsSignals({
  claudeHome,
  now = new Date().toISOString(),
  lookbackDays = 30,
  includeTranscripts = false,
} = {}) {
  if (!claudeHome) throw new Error("gatherInsightsSignals: claudeHome required");
  const usageDir = join(claudeHome, "usage-data");
  if (!existsSync(usageDir)) return null;

  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs)) {
    throw new Error(`gatherInsightsSignals: invalid now timestamp ${JSON.stringify(now)}`);
  }
  const cutoff = lookbackDays == null ? null : nowMs - lookbackDays * 86_400_000;

  const [allMeta, facets] = await Promise.all([
    loadSessionMeta(join(usageDir, "session-meta")),
    loadFacetsMap(join(usageDir, "facets")),
  ]);
  const inWindow = allMeta.filter((m) => withinWindow(m.start_time, cutoff));

  let subagentSessionCount = 0;
  let mcpSessionCount = 0;
  let multiTaskSessionCount = 0;
  let taskInvocationsTotal = 0;
  let toolInvocationsTotal = 0;
  let gitCommitsTotal = 0;
  const toolInvocationsByPlugin = {};
  const frictionCounts = {};
  const outcomeCounts = {};

  for (const m of inWindow) {
    if (m.uses_task_agent) subagentSessionCount += 1;
    if (m.uses_mcp) mcpSessionCount += 1;
    if (typeof m.git_commits === "number") gitCommitsTotal += m.git_commits;

    const tools = m.tool_counts || {};
    for (const [name, count] of Object.entries(tools)) {
      if (typeof count !== "number") continue;
      toolInvocationsTotal += count;
      // "TaskCreate" is current; "Task" appears in older session-meta files.
      if (name === "TaskCreate" || name === "Task") taskInvocationsTotal += count;
      const plugin = parsePluginName(name);
      if (plugin) toolInvocationsByPlugin[plugin] = (toolInvocationsByPlugin[plugin] || 0) + count;
    }

    const facet = facets.get(m.session_id);
    if (facet) {
      if (facet.session_type === "multi_task") multiTaskSessionCount += 1;
      if (facet.outcome) outcomeCounts[facet.outcome] = (outcomeCounts[facet.outcome] || 0) + 1;
      const fc = facet.friction_counts || {};
      for (const [k, v] of Object.entries(fc)) {
        if (typeof v === "number") frictionCounts[k] = (frictionCounts[k] || 0) + v;
      }
    }
  }

  const hookFires = await readHookFires(claudeHome, cutoff);

  const result = {
    capturedAt: now,
    lookbackDays,
    sessionsAnalyzed: inWindow.length,
    subagentSessionCount,
    mcpSessionCount,
    multiTaskSessionCount,
    taskInvocationsTotal,
    toolInvocationsTotal,
    toolInvocationsByPlugin,
    gitCommitsTotal,
    frictionCounts,
    outcomeCounts,
    hookFireCount: hookFires.total,
    hookFiresByEvent: hookFires.byEvent,
    transcriptsScanned: false,
    // Null (not undefined) when transcripts were skipped: scoring predicates
    // must distinguish "user doesn't do X" from "we didn't look."
    autoModeSessionCount: null,
    bypassPermissionsSessionCount: null,
    planModeSessionCount: null,
    worktreeUsageSessionCount: null,
  };

  if (includeTranscripts) {
    const transcriptIndex = await buildTranscriptIndex(claudeHome);
    let autoModeSessionCount = 0;
    let bypassPermissionsSessionCount = 0;
    let planModeSessionCount = 0;
    let worktreeUsageSessionCount = 0;
    for (const m of inWindow) {
      const path = transcriptIndex.get(m.session_id);
      if (!path) continue;
      const { modes, hasWorktreeState } = await scanTranscript(path);
      if (modes.has("auto")) autoModeSessionCount += 1;
      if (modes.has("bypassPermissions")) bypassPermissionsSessionCount += 1;
      if (modes.has("plan")) planModeSessionCount += 1;
      if (hasWorktreeState) worktreeUsageSessionCount += 1;
    }
    result.transcriptsScanned = true;
    result.autoModeSessionCount = autoModeSessionCount;
    result.bypassPermissionsSessionCount = bypassPermissionsSessionCount;
    result.planModeSessionCount = planModeSessionCount;
    result.worktreeUsageSessionCount = worktreeUsageSessionCount;
  }

  return result;
}
