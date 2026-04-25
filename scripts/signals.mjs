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
  };
}
