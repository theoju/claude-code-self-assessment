import { existsSync } from "node:fs";
import { readFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { claudeHome, safeReadJson, safeReaddir } from "./_fs-utils.mjs";
import { gatherInsightsSignals } from "./insights-signals.mjs";

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

export async function gatherSignals(projectRoot = process.cwd(), options = {}) {
  const { insightsLookbackDays = 30, includeTranscripts = false } = options;
  const settings =
    (await safeReadJson(join(claudeHome(), "settings.json"))) || {};
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
