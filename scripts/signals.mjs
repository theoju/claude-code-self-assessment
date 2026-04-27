import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

function claudeHome() {
  return process.env.CLAUDE_HOME || join(homedir(), ".claude");
}

async function safeReadJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function safeReaddir(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

// Action verbs that indicate the file actually tells Claude what to DO.
// A skill/command/agent that doesn't say "run", "use", "prefer", etc. is just
// decoration — anti-gaming defense against "spray empty stubs to inflate score".
const ACTION_VERBS = /\b(run|use|prefer|avoid|never|always|don'?t|do not|invoke|trigger|check|verify|build|create|skip|stop|launch|delegate|read|write|edit|fetch|search|generate|format|test|deploy|commit|push|review|score|score|update|remove)\b/i;
const MIN_SUBSTANTIVE_CHARS = 50;

/**
 * Strip frontmatter, headings, code-fence markers, and bullet markers so we
 * can measure how much *body* prose a file actually has. Empty stubs and
 * heading-only files collapse to near-zero characters here.
 */
function stripBoilerplate(content) {
  return content
    // YAML/TOML frontmatter
    .replace(/^---[\s\S]*?---\s*/m, "")
    .replace(/^\+\+\+[\s\S]*?\+\+\+\s*/m, "")
    // Markdown headings
    .replace(/^#{1,6}\s.*$/gm, "")
    // Bullet/list markers (keep the text after them)
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Code fences (keep inner content)
    .replace(/^```.*$/gm, "")
    // TODO/placeholder markers
    .replace(/\bTODO\b.*$/gim, "")
    .replace(/\bFIXME\b.*$/gim, "")
    // Whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the file at `path` has ≥50 chars of non-boilerplate body
 * AND at least one action verb. Used to count only substantive
 * skills/commands/agents/plans — empty stubs no longer inflate the score.
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

/**
 * Filter a list of relative file names against `isSubstantive` rooted at `dir`.
 * Returns the substantive subset preserving order.
 */
async function filterSubstantive(dir, names) {
  const out = [];
  for (const n of names) {
    if (await isSubstantive(join(dir, n))) out.push(n);
  }
  return out;
}

/**
 * Skills are usually directories with a SKILL.md inside (or any .md). Treat a
 * skill as substantive if it has at least one substantive markdown file inside.
 */
async function filterSubstantiveSkillDirs(dir, names) {
  const out = [];
  for (const n of names) {
    const skillDir = join(dir, n);
    let entries = [];
    try {
      const st = await stat(skillDir);
      if (st.isFile()) {
        if (await isSubstantive(skillDir)) out.push(n);
        continue;
      }
      entries = await readdir(skillDir);
    } catch {
      continue;
    }
    let any = false;
    for (const e of entries) {
      if (!e.endsWith(".md")) continue;
      if (await isSubstantive(join(skillDir, e))) { any = true; break; }
    }
    if (any) out.push(n);
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

export async function gatherSignals(projectRoot = process.cwd()) {
  const settings = (await safeReadJson(join(claudeHome(), "settings.json"))) || {};
  const projectSettings =
    (await safeReadJson(join(projectRoot, ".claude", "settings.local.json"))) || {};

  const personalAgentsDir = join(claudeHome(), "agents");
  const personalCommandsDir = join(claudeHome(), "commands");
  const personalSkillsDir = join(claudeHome(), "skills");
  const projectAgentsDir = join(projectRoot, ".claude", "agents");
  const projectCommandsDir = join(projectRoot, ".claude", "commands");

  const personalAgentsRaw = (await safeReaddir(personalAgentsDir)).filter((f) => f.endsWith(".md"));
  const personalCommandsRaw = (await safeReaddir(personalCommandsDir)).filter((f) => f.endsWith(".md"));
  const personalSkillsRaw = (await safeReaddir(personalSkillsDir)).filter((f) => !f.startsWith("."));
  const projectAgentsRaw = (await safeReaddir(projectAgentsDir)).filter((f) => f.endsWith(".md"));
  const projectCommandsRaw = (await safeReaddir(projectCommandsDir)).filter((f) => f.endsWith(".md"));

  // Substantive filter: count only files with real body content + an action
  // verb. Closes the "spray empty stubs to inflate the score" loophole.
  const personalAgents = await filterSubstantive(personalAgentsDir, personalAgentsRaw);
  const personalCommands = await filterSubstantive(personalCommandsDir, personalCommandsRaw);
  const personalSkills = await filterSubstantiveSkillDirs(personalSkillsDir, personalSkillsRaw);
  const projectAgents = await filterSubstantive(projectAgentsDir, projectAgentsRaw);
  const projectCommands = await filterSubstantive(projectCommandsDir, projectCommandsRaw);

  const plugins = Object.entries(settings.enabledPlugins || {})
    .filter(([, v]) => v === true)
    .map(([k]) => k);

  const memory = await listProjectMemoryFiles();
  const claudeMdExists =
    existsSync(join(projectRoot, "CLAUDE.md")) ||
    existsSync(join(claudeHome(), "CLAUDE.md"));

  const hooks = settings.hooks || {};
  const env = settings.env || {};

  const plansDir = join(claudeHome(), "plans");
  const plansCountRaw = await dirSize(plansDir);
  // Empty plan files (a plan with no body, no checklist, no verbs) shouldn't
  // count toward Memory or Planning credit.
  const plansCount = await countSubstantiveFiles(plansDir);
  const sessionsCount = await dirSize(join(claudeHome(), "sessions"));
  const statuslineConfigured = existsSync(join(claudeHome(), "statusline.sh"));
  const keybindingsConfigured = existsSync(join(claudeHome(), "keybindings.json"));
  const routinesCount = await dirSize(join(claudeHome(), "routines"));
  const chromeExtensionConfigured =
    existsSync(join(claudeHome(), "chrome-extension")) ||
    existsSync(join(claudeHome(), "browser-extension"));

  const hasPlugin = (prefix) => plugins.some((p) => p.startsWith(prefix));

  return {
    capturedAt: new Date().toISOString(),
    settings: {
      effortLevel: settings.effortLevel || "unknown",
      skipDangerousModePermissionPrompt: !!settings.skipDangerousModePermissionPrompt,
      allowList: (settings.permissions?.allow || []).concat(
        projectSettings.permissions?.allow || []
      ),
      denyList: (settings.permissions?.deny || []).concat(
        projectSettings.permissions?.deny || []
      ),
      autoCompactWindow:
        env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || null,
      hookEvents: Object.keys(hooks),
      hookTotalCount: Object.values(hooks).flat().length,
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
    routinesCount,
    chromeExtensionConfigured,
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
  };
}
