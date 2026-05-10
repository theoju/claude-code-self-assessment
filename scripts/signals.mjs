import { existsSync } from "node:fs";
import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { claudeHome, safeReadJson, safeReaddir } from "./_fs-utils.mjs";
import { gatherInsightsSignals } from "./insights-signals.mjs";

const execFileAsync = promisify(execFile);

// Action verbs that indicate the file actually tells Claude what to DO.
// A skill/command/agent that doesn't say "run", "use", "prefer", etc. is just
// decoration — anti-gaming defense against "spray empty stubs to inflate score".
const ACTION_VERBS =
  /\b(run|use|prefer|avoid|never|always|don'?t|do not|invoke|trigger|check|verify|build|create|skip|stop|launch|delegate|read|write|edit|fetch|search|generate|format|test|deploy|commit|push|review|update|remove)\b/i;
const MIN_SUBSTANTIVE_CHARS = 50;

/**
 * Strip frontmatter, headings, code-fence markers, and bullet markers so we
 * can measure how much *body* prose a file actually has. Empty stubs and
 * heading-only files collapse to near-zero characters here.
 */
function stripBoilerplate(content) {
  return content
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^\+\+\+[\s\S]*?\+\+\+\s*/m, "")
    .replace(/^#{1,6}\s.*$/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^```.*$/gm, "")
    .replace(/\bTODO\b.*$/gim, "")
    .replace(/\bFIXME\b.*$/gim, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True if the file at `path` has ≥50 chars of non-boilerplate body AND at
 * least one action verb. Used to count only substantive skills/commands/
 * agents/plans — empty stubs no longer inflate the score.
 */
export async function isSubstantive(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch {
    return false;
  }
  const body = stripBoilerplate(content);
  if (body.length < MIN_SUBSTANTIVE_CHARS) return false;
  if (!ACTION_VERBS.test(body)) return false;
  return true;
}

async function filterSubstantive(dir, names) {
  const out = [];
  for (const n of names) {
    if (await isSubstantive(join(dir, n))) out.push(n);
  }
  return out;
}

async function isSubstantiveSkill(skillPath) {
  let entries = [];
  try {
    const st = await stat(skillPath);
    if (st.isFile()) return isSubstantive(skillPath);
    entries = await readdir(skillPath);
  } catch {
    return false;
  }
  for (const e of entries) {
    if (e.endsWith(".md") && (await isSubstantive(join(skillPath, e))))
      return true;
  }
  return false;
}

async function filterSubstantiveSkillDirs(dir, names) {
  const out = [];
  for (const n of names) {
    if (await isSubstantiveSkill(join(dir, n))) out.push(n);
  }
  return out;
}

async function countSubstantiveFiles(dir) {
  const entries = await safeReaddir(dir);
  let n = 0;
  for (const e of entries) {
    if (await isSubstantive(join(dir, e))) n += 1;
  }
  return n;
}

async function listProjectMemoryFiles() {
  const base = join(claudeHome(), "projects");
  const projects = await safeReaddir(base);
  const found = [];
  for (const p of projects) {
    const memoryDir = join(base, p, "memory");
    if (existsSync(memoryDir)) {
      const files = await safeReaddir(memoryDir);
      if (files.length) found.push({ project: p, fileCount: files.length });
    }
  }
  return found;
}

async function dirSize(path) {
  const entries = await safeReaddir(path);
  return entries.length;
}

// True if a PostToolUse hook is wired up to run a formatter on Edit|Write
// (or MultiEdit) tool calls. Distinguishes "I have a formatter feedback loop"
// from "I have *some* PostToolUse hook" — generic detection would credit
// notification or logging hooks unfairly. Two-part check:
//   1. matcher includes Edit or Write (substring, regex-OR-pipe friendly)
//   2. command references a known formatter or the generic 'format' token
// Catches both name-based hooks (prettier, ruff, gofmt, rustfmt, shfmt,
// rubocop, black, eslint) and shell-script wrappers ('format-on-edit.sh',
// 'bun run format', 'npm run format').
const FORMATTER_TOKENS =
  /(prettier|ruff|gofmt|rustfmt|shfmt|rubocop|\bblack\b|eslint|\bformat\b)/i;
export function detectFormatterHook(hooks) {
  const postTool = hooks?.PostToolUse || [];
  for (const entry of postTool) {
    const matcher = entry.matcher || "";
    if (!/Edit|Write/i.test(matcher)) continue;
    for (const h of entry.hooks || []) {
      if (typeof h.command === "string" && FORMATTER_TOKENS.test(h.command)) {
        return true;
      }
    }
  }
  return false;
}

// True when the user has explicitly opted in to Claude in Chrome (a built-in
// Claude Code feature, distinct from MCP plugins). Lives in `~/.claude.json`
// — NOT `~/.claude/settings.json` — because it is CLI runtime state, not
// user-editable config. Strict equality on `true`: bare presence of the
// extension cache or onboarding flag does not imply the integration is on.
export function detectClaudeInChrome(cliConfig) {
  return cliConfig?.claudeInChromeDefaultEnabled === true;
}

// True when the user has invoked the iOS / web Remote Control flow at least
// once. Boris tip 47. Lives in `~/.claude.json#hasUsedRemoteControl` (CLI
// runtime state), not `~/.claude/settings.json`. Strict equality on `true`
// — the field is a sticky flag, not a config toggle, so we reject coerced
// truthy values (1, "true") to avoid future false positives if the CLI
// changes the encoding.
export function detectRemoteControl(cliConfig) {
  return cliConfig?.hasUsedRemoteControl === true;
}

// True if a Stop hook fires a system notification when Claude finishes —
// Boris tip 75. Distinguishes "I get pinged for autonomous runs" from "I
// have *some* Stop hook" (e.g. a stop-verify.sh check). Tokens cover macOS
// (osascript display notification, terminal-notifier, say), Linux
// (notify-send), and the generic `notification` keyword for shell wrappers.
const STOP_NOTIFICATION_TOKENS =
  /(osascript[^\n]*display\s+notification|terminal-notifier|notify-send|\bnotification\b|\bsay\b)/i;
export function detectStopHookNotification(hooks) {
  const stop = hooks?.Stop || [];
  for (const entry of stop) {
    for (const h of entry.hooks || []) {
      if (
        typeof h.command === "string" &&
        STOP_NOTIFICATION_TOKENS.test(h.command)
      ) {
        return true;
      }
    }
  }
  return false;
}

// True if any agent frontmatter declares `isolation: worktree` — Boris tip
// 28. Scans personal + project .md agent files. Frontmatter is a simple
// YAML block at the top; we just grep for the literal key/value pair after
// stripping CR. Cheap and avoids pulling a YAML parser.
async function hasWorktreeIsolatedAgent(dirs) {
  for (const dir of dirs) {
    const entries = await safeReaddir(dir);
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      try {
        const content = await readFile(join(dir, name), "utf8");
        if (/^isolation:\s*["']?worktree["']?\s*$/im.test(content)) return true;
      } catch {
        // unreadable — skip
      }
    }
  }
  return false;
}

// Pure parser for `claude mcp list` stdout. Returns one record per MCP
// server with name, scope (`plugin` | `claude.ai` | `user`) and status
// (`connected` | `failed` | `needs-auth`). Output format from the Claude
// Code CLI: "<name>: <transport> - <status-glyph> <status-label>". Treats
// any line that doesn't match as garbage rather than throwing — the
// stdout contract isn't strictly versioned and we don't want a CLI bump
// to break the assessment.
const STATUS_TOKEN = {
  "✓ Connected": "connected",
  "✗ Failed to connect": "failed",
  "! Needs authentication": "needs-auth",
};

// Parse a single JSONL line from ~/.claude/ship/journal.jsonl. Returns the
// parsed object on valid JSON object input, null on anything else (empty,
// malformed, non-object). Mirrors parseMcpListOutput's "skip silently"
// fault tolerance — the journal is append-only across all sessions and
// schema may evolve, so the reader stays tolerant.
export function parseJournalLine(line) {
  if (!line || !line.trim()) return null;
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseMcpListOutput(stdout) {
  if (!stdout || typeof stdout !== "string") return [];
  const out = [];
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("Checking MCP server health")) continue;
    const dashIdx = line.lastIndexOf(" - ");
    if (dashIdx < 0) continue;
    const statusLabel = line.slice(dashIdx + 3).trim();
    const status = STATUS_TOKEN[statusLabel];
    if (!status) continue;
    const left = line.slice(0, dashIdx);
    // ": " (colon-space) is the name/transport delimiter. Plugin-prefixed
    // names contain inner colons (`plugin:context7:context7`), so we need
    // the last occurrence — split-on-first-colon would clip them.
    const sepIdx = left.lastIndexOf(": ");
    if (sepIdx < 0) continue;
    const name = left.slice(0, sepIdx).trim();
    if (!name) continue;
    const scope = name.startsWith("plugin:")
      ? "plugin"
      : name.startsWith("claude.ai ")
        ? "claude.ai"
        : "user";
    out.push({ name, scope, status });
  }
  return out;
}

// Subprocess wrapper around `claude mcp list`. Uses the safe `execFile` API
// (argv array, no shell) — never the shell-prone alternative. Empty-array
// fallback if the CLI is missing, slow, or non-zero exits, so a broken
// `claude` install doesn't poison the whole assessment run. Skipped under
// vitest because the CLI takes ~10s to probe every MCP server (TLS round
// trips), which would balloon every integration test past its timeout.
async function gatherMcpServers() {
  if (process.env.VITEST) return [];
  try {
    const { stdout } = await execFileAsync("claude", ["mcp", "list"], {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
    return parseMcpListOutput(stdout);
  } catch {
    return [];
  }
}

export async function gatherSignals(projectRoot = process.cwd(), options = {}) {
  const { insightsLookbackDays = 30, includeTranscripts = false } = options;
  const settings =
    (await safeReadJson(join(claudeHome(), "settings.json"))) || {};
  const cliConfig =
    (await safeReadJson(join(claudeHome(), "..", ".claude.json"))) || {};
  const hasClaudeInChrome = detectClaudeInChrome(cliConfig);
  const hasRemoteControl = detectRemoteControl(cliConfig);
  const projectSettings =
    (await safeReadJson(join(projectRoot, ".claude", "settings.local.json"))) ||
    {};

  const personalAgentsDir = join(claudeHome(), "agents");
  const personalCommandsDir = join(claudeHome(), "commands");
  const personalSkillsDir = join(claudeHome(), "skills");
  const projectAgentsDir = join(projectRoot, ".claude", "agents");
  const projectCommandsDir = join(projectRoot, ".claude", "commands");

  const personalAgentsRaw = (await safeReaddir(personalAgentsDir)).filter((f) =>
    f.endsWith(".md"),
  );
  const personalCommandsRaw = (await safeReaddir(personalCommandsDir)).filter(
    (f) => f.endsWith(".md"),
  );
  const personalSkillsRaw = (await safeReaddir(personalSkillsDir)).filter(
    (f) => !f.startsWith("."),
  );
  const projectAgentsRaw = (await safeReaddir(projectAgentsDir)).filter((f) =>
    f.endsWith(".md"),
  );
  const projectCommandsRaw = (await safeReaddir(projectCommandsDir)).filter(
    (f) => f.endsWith(".md"),
  );

  // Substantive filter: count only files with real body content + an action
  // verb. Closes the "spray empty stubs to inflate the score" loophole.
  const personalAgents = await filterSubstantive(
    personalAgentsDir,
    personalAgentsRaw,
  );
  const personalCommands = await filterSubstantive(
    personalCommandsDir,
    personalCommandsRaw,
  );
  const personalSkills = await filterSubstantiveSkillDirs(
    personalSkillsDir,
    personalSkillsRaw,
  );
  const projectAgents = await filterSubstantive(
    projectAgentsDir,
    projectAgentsRaw,
  );
  const projectCommands = await filterSubstantive(
    projectCommandsDir,
    projectCommandsRaw,
  );

  const plugins = Object.entries(settings.enabledPlugins || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  const memory = await listProjectMemoryFiles();
  const claudeMdExists =
    existsSync(join(projectRoot, "CLAUDE.md")) ||
    existsSync(join(claudeHome(), "CLAUDE.md"));

  const hooks = settings.hooks || {};
  const env = settings.env || {};
  const hasFormatterHook = detectFormatterHook(hooks);
  const hasStopHookNotification = detectStopHookNotification(hooks);
  const customSpinnerVerbCount = Array.isArray(settings.spinnerVerbs?.verbs)
    ? settings.spinnerVerbs.verbs.length
    : 0;
  const hasIsolatedAgent = await hasWorktreeIsolatedAgent([
    personalAgentsDir,
    projectAgentsDir,
  ]);

  const plansDir = join(claudeHome(), "plans");
  const plansCountRaw = await dirSize(plansDir);
  // Empty plan files (no body, no checklist, no verbs) shouldn't count toward
  // Memory or Planning credit.
  const plansCount = await countSubstantiveFiles(plansDir);
  const sessionsCount = await dirSize(join(claudeHome(), "sessions"));
  const statuslineConfigured = existsSync(join(claudeHome(), "statusline.sh"));
  const keybindingsConfigured = existsSync(
    join(claudeHome(), "keybindings.json"),
  );

  const hasPlugin = (prefix) => plugins.some((p) => p.startsWith(prefix));

  const mcpServers = await gatherMcpServers();

  const insights = await gatherInsightsSignals({
    claudeHome: claudeHome(),
    lookbackDays: insightsLookbackDays,
    includeTranscripts,
  });

  return {
    capturedAt: new Date().toISOString(),
    settings: {
      effortLevel: settings.effortLevel || "unknown",
      skipDangerousModePermissionPrompt:
        !!settings.skipDangerousModePermissionPrompt,
      allowList: (settings.permissions?.allow || []).concat(
        projectSettings.permissions?.allow || [],
      ),
      denyList: (settings.permissions?.deny || []).concat(
        projectSettings.permissions?.deny || [],
      ),
      autoCompactWindow:
        env.CLAUDE_CODE_AUTO_COMPACT_WINDOW ||
        process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW ||
        null,
      hookEvents: Object.keys(hooks),
      hookTotalCount: Object.values(hooks).flat().length,
      hasFormatterHook,
      hasStopHookNotification,
      customSpinnerVerbCount,
      hasIsolatedAgent,
      hasClaudeInChrome,
      hasRemoteControl,
    },
    personalAgents,
    personalCommands,
    personalSkills,
    projectAgents,
    projectCommands,
    raw: {
      personalAgents: personalAgentsRaw,
      personalCommands: personalCommandsRaw,
      personalSkills: personalSkillsRaw,
      projectAgents: projectAgentsRaw,
      projectCommands: projectCommandsRaw,
      plansCount: plansCountRaw,
    },
    plugins,
    mcpServers,
    memory,
    claudeMdExists,
    plansCount,
    sessionsCount,
    statuslineConfigured,
    keybindingsConfigured,
    has: {
      superpowers: hasPlugin("superpowers@"),
      prReviewToolkit: hasPlugin("pr-review-toolkit@"),
      codeReview: hasPlugin("code-review@"),
      codeSimplifier: hasPlugin("code-simplifier@"),
      featureDev: hasPlugin("feature-dev@"),
      skillCreator: hasPlugin("skill-creator@"),
      claudeMdMgmt: hasPlugin("claude-md-management@"),
      ralphLoop: hasPlugin("ralph-loop@"),
      commitCommands: hasPlugin("commit-commands@"),
      explanatoryStyle: hasPlugin("explanatory-output-style@"),
      playwright: hasPlugin("playwright@"),
      semgrep: hasPlugin("semgrep@"),
      vercel: hasPlugin("vercel@"),
      imessage: hasPlugin("imessage@"),
      karpathy: hasPlugin("andrej-karpathy-skills@"),
      claudeCodeSetup: hasPlugin("claude-code-setup@"),
      frontendDesign: hasPlugin("frontend-design@"),
    },
    insights,
  };
}
