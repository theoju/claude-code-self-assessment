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
// ExitPlanMode tool_use is followed by an assistant tool_use (the
// "launch" half of plan-then-launch).
//
// Slash-command detection: the CLI wraps user-typed slash commands in
// markup `<command-name>/cmd</command-name>`. Bare-text matches are kept
// as a fallback for transcript shapes that don't use the markup wrapper
// (e.g. earlier CLI versions, or commands invoked through alternate UIs).
//
// Plan-then-launch detection: ExitPlanMode is the marker (assistant
// tool_use, name === "ExitPlanMode"). Real transcripts interleave
// `type=attachment` (system-reminder injections) and `type=last-prompt`
// rows between assistant turns, so a fixed "next 2 messages" window
// gets consumed by those non-semantic rows. The fix is to advance past
// any line whose type is not "user" or "assistant" and find the next
// real assistant turn — if it contains a tool_use of any name (other
// than another ExitPlanMode), the session counts.

// Strip a plugin prefix like `superpowers:` from `/superpowers:writing-plans`.
function stripPluginPrefix(cmd) {
  return cmd.includes(":") ? cmd.slice(cmd.lastIndexOf(":") + 1) : cmd;
}

const TARGET_COMMANDS = new Set([
  "go",
  "batch",
  "focus",
  "schedule",
  "loop",
  "babysit",
]);

const COMMAND_NAME_TAG_RE = /<command-name>\/([\w:-]+)/g;
const SLASH_RE = {
  go: /^\/go(\s|$)/,
  batch: /^\/batch(\s|$)/,
  focus: /^\/focus(\s|$)/,
  schedule: /^\/schedule(\s|$)/,
  loop: /^\/loop(\s|$)/,
  babysit: /^\/babysit(\s|$)/,
};

// Returns the set of target slash-command names (e.g. {"loop", "focus"})
// found in the user message text — checking both the markup form
// (<command-name>/loop</command-name>) and the bare-text form (^/loop).
// Markup is the primary path in current CLI transcripts; bare text is a
// fallback for legacy/alternate shapes. Returns an empty set on no match.
function extractSlashCommands(text) {
  const found = new Set();
  if (!text) return found;
  for (const m of text.matchAll(COMMAND_NAME_TAG_RE)) {
    const cmd = stripPluginPrefix(m[1]);
    if (TARGET_COMMANDS.has(cmd)) found.add(cmd);
  }
  const trimmed = text.trimStart();
  for (const cmd of TARGET_COMMANDS) {
    if (SLASH_RE[cmd].test(trimmed)) found.add(cmd);
  }
  return found;
}

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
        const found = extractSlashCommands(uText);
        if (found.has("go")) counts.goCommandUses++;
        if (found.has("batch")) counts.batchCommandUses++;
        if (found.has("focus")) counts.focusCommandUses++;
        if (found.has("schedule")) counts.scheduleCommandUses++;
        if (found.has("loop")) sessionHasLoop = true;
        if (found.has("babysit")) sessionHasBabysit = true;
      }

      const toolName = assistantToolUseName(line);
      if (toolName === "ExitPlanMode") {
        // Walk forward past non-semantic rows (attachment/last-prompt/etc.)
        // until the next assistant turn. If that turn has any tool_use
        // other than ExitPlanMode, the session counts. Bound the walk at
        // 12 rows so a transcript with no following assistant turn (e.g.
        // session ended at the plan) doesn't scan the rest of the file.
        const SCAN_BOUND = 12;
        for (
          let j = i + 1;
          j < Math.min(i + 1 + SCAN_BOUND, lines.length);
          j++
        ) {
          const next = lines[j];
          if (next.type !== "assistant") continue;
          const nextTool = assistantToolUseName(next);
          if (nextTool && nextTool !== "ExitPlanMode") {
            counts.planThenLaunchSessions++;
          }
          break;
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
