// Behavioral signals derived from ~/.claude/projects/*/*.jsonl transcripts.
//
// Privacy: callers must opt in. We only emit aggregate counters, never raw
// turns or prompts. The collector skips any session whose JSONL we can't
// parse — partial data is preferred over crashing the assessment run.
//
// Sources scanned (last `--days`, default 30):
//   - assistant tool_use entries → tool counts, agent dispatches
//   - permission-mode entries    → plan / auto / bypass / acceptEdits modes
//   - assistant entries          → turn count per session
//   - hook journal               → hook fires per week (#11)

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

function claudeHome() {
  return process.env.CLAUDE_HOME || join(homedir(), ".claude");
}

const DEFAULT_DAYS = 30;
const VERIFY_TOOLS = new Set(["Bash"]);
const VERIFY_PATTERNS = /\b(npm\s+(?:test|run\s+test|run\s+coverage)|vitest|playwright|pytest|cargo\s+test|go\s+test|curl\s+(?:-|http)|gh\s+pr\s+(?:view|checks))\b/i;
const SHIP_PATTERNS = /\b(git\s+commit|git\s+push|gh\s+pr\s+create|gh\s+pr\s+merge|vercel\s+deploy|npm\s+publish)\b/i;

async function safeReaddir(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

/**
 * Stream-parse a JSONL transcript. Returns the per-session aggregate so a
 * 50MB transcript doesn't blow up the assessment's memory.
 */
async function summarizeSession(path) {
  const summary = {
    path,
    assistantTurns: 0,
    toolCounts: new Map(),
    agentDispatches: 0,
    permissionModes: new Set(),
    sawShip: false,
    sawVerify: false,
    editTouchedFiles: new Set(),
  };
  let stream;
  try {
    stream = createReadStream(path, { encoding: "utf8" });
  } catch {
    return summary;
  }
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type === "permission-mode" && entry.permissionMode) {
      summary.permissionModes.add(entry.permissionMode);
    } else if (entry.type === "assistant") {
      summary.assistantTurns += 1;
      const content = entry.message?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          if (c?.type === "tool_use" && c.name) {
            summary.toolCounts.set(c.name, (summary.toolCounts.get(c.name) || 0) + 1);
            if (c.name === "Agent") summary.agentDispatches += 1;
            if (c.name === "Edit" || c.name === "Write") {
              const fp = c.input?.file_path;
              if (fp) summary.editTouchedFiles.add(fp);
            }
            if (VERIFY_TOOLS.has(c.name)) {
              const cmd = c.input?.command || "";
              if (VERIFY_PATTERNS.test(cmd)) summary.sawVerify = true;
              if (SHIP_PATTERNS.test(cmd)) summary.sawShip = true;
            }
          }
        }
      }
    }
  }
  return summary;
}

function ratio(num, denom) {
  if (denom <= 0) return 0;
  return Math.round((num / denom) * 100) / 100;
}

async function readHookJournal(path, sinceMs) {
  if (!existsSync(path)) return { fires: 0, byEvent: {} };
  const stream = createReadStream(path, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  const byEvent = {};
  let fires = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = Date.parse(entry.ts || "");
    if (Number.isFinite(ts) && ts < sinceMs) continue;
    fires += 1;
    const k = entry.event || "unknown";
    byEvent[k] = (byEvent[k] || 0) + 1;
  }
  return { fires, byEvent };
}

/**
 * Walk every session JSONL in `~/.claude/projects/*` modified within the
 * last `days` and return aggregate behavioral signals.
 */
export async function gatherTranscriptSignals({ days = DEFAULT_DAYS, root } = {}) {
  const home = root || claudeHome();
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const projectsDir = join(home, "projects");
  const projects = await safeReaddir(projectsDir);

  const sessions = [];
  for (const p of projects) {
    const dir = join(projectsDir, p);
    const files = await safeReaddir(dir);
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const full = join(dir, f);
      let st;
      try { st = await stat(full); } catch { continue; }
      if (st.mtimeMs < sinceMs) continue;
      sessions.push(full);
    }
  }

  const toolCounts = {};
  let agentDispatches = 0;
  let planModeSessions = 0;
  let autoModeLongSessions = 0;
  let bypassPermSessions = 0;
  let multiFileSessions = 0;
  let multiFilePlanned = 0;
  let shipSessions = 0;
  let shipVerified = 0;

  for (const path of sessions) {
    const s = await summarizeSession(path);
    for (const [name, n] of s.toolCounts) {
      toolCounts[name] = (toolCounts[name] || 0) + n;
    }
    agentDispatches += s.agentDispatches;
    if (s.permissionModes.has("plan")) planModeSessions += 1;
    if (s.permissionModes.has("auto") && s.assistantTurns >= 10) autoModeLongSessions += 1;
    if (s.permissionModes.has("bypassPermissions")) bypassPermSessions += 1;
    if (s.editTouchedFiles.size >= 3) {
      multiFileSessions += 1;
      if (s.permissionModes.has("plan")) multiFilePlanned += 1;
    }
    if (s.sawShip) {
      shipSessions += 1;
      if (s.sawVerify) shipVerified += 1;
    }
  }

  const journal = await readHookJournal(join(home, "hook-fires.jsonl"), sinceMs);

  return {
    days,
    sessions: sessions.length,
    toolCounts,
    agentDispatches,
    agentDispatchesPerSession: ratio(agentDispatches, sessions.length),
    planModeSessions,
    planModeRate: ratio(planModeSessions, sessions.length),
    autoModeLongSessions,
    bypassPermSessions,
    bypassPermRate: ratio(bypassPermSessions, sessions.length),
    multiFileSessions,
    multiFilePlanRate: ratio(multiFilePlanned, multiFileSessions),
    shipSessions,
    shipVerifyRate: ratio(shipVerified, shipSessions),
    hookFires: journal.fires,
    hookFiresByEvent: journal.byEvent,
  };
}

export const TRANSCRIPT_OPT_IN_KEY = "scoring.includeTranscripts";
