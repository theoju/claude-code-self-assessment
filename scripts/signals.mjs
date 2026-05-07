import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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

export async function gatherSignals(projectRoot = process.cwd(), options = {}) {
  const { insightsLookbackDays = 30, includeTranscripts = false } = options;
  const settings = (await safeReadJson(join(claudeHome(), "settings.json"))) || {};
  const projectSettings =
    (await safeReadJson(join(projectRoot, ".claude", "settings.local.json"))) || {};

  const personalAgents = (await safeReaddir(join(claudeHome(), "agents"))).filter(
    (f) => f.endsWith(".md")
  );
  const personalCommands = (await safeReaddir(join(claudeHome(), "commands"))).filter(
    (f) => f.endsWith(".md")
  );
  const personalSkills = (await safeReaddir(join(claudeHome(), "skills"))).filter(
    (f) => !f.startsWith(".")
  );

  const projectAgents = (await safeReaddir(join(projectRoot, ".claude", "agents"))).filter(
    (f) => f.endsWith(".md")
  );
  const projectCommands = (await safeReaddir(join(projectRoot, ".claude", "commands"))).filter(
    (f) => f.endsWith(".md")
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

  const plansCount = await dirSize(join(claudeHome(), "plans"));
  const sessionsCount = await dirSize(join(claudeHome(), "sessions"));
  const statuslineConfigured = existsSync(join(claudeHome(), "statusline.sh"));
  const keybindingsConfigured = existsSync(join(claudeHome(), "keybindings.json"));

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
