import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { gatherSignals } from "../../signals.mjs";
import { makeTmpClaudeHome, makeTmpProjectRoot, cleanup } from "./_tmpHome.mjs";

let originalClaudeHome;
let claudeHome;
let projectRoot;

beforeEach(() => {
  originalClaudeHome = process.env.CLAUDE_HOME;
});

afterEach(() => {
  if (originalClaudeHome === undefined) delete process.env.CLAUDE_HOME;
  else process.env.CLAUDE_HOME = originalClaudeHome;
  cleanup(claudeHome, projectRoot);
});

describe("gatherSignals (integration)", () => {
  it("returns empty defaults when no settings exist", async () => {
    claudeHome = makeTmpClaudeHome();
    projectRoot = makeTmpProjectRoot();
    process.env.CLAUDE_HOME = claudeHome;

    const signals = await gatherSignals(projectRoot);
    expect(signals.settings.effortLevel).toBe("unknown");
    expect(signals.settings.skipDangerousModePermissionPrompt).toBe(false);
    expect(signals.settings.allowList).toEqual([]);
    expect(signals.settings.hookTotalCount).toBe(0);
    expect(signals.personalAgents).toEqual([]);
    expect(signals.personalCommands).toEqual([]);
    expect(signals.plugins).toEqual([]);
    expect(signals.memory).toEqual([]);
    expect(signals.claudeMdExists).toBe(false);
  });

  it("reads settings.json: effortLevel, hooks, allowList, plugins", async () => {
    claudeHome = makeTmpClaudeHome({
      settings: {
        effortLevel: "xhigh",
        skipDangerousModePermissionPrompt: false,
        permissions: { allow: ["Bash(npm run *)"], deny: ["Bash(rm -rf *)"] },
        hooks: {
          PostToolUse: [{ command: "echo hi" }],
          Stop: [{ command: "echo bye" }],
        },
        env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "400000" },
        enabledPlugins: {
          "superpowers@1": true,
          "playwright@1": true,
          "frontend-design@1": false, // disabled — should not appear
        },
      },
      agents: ["verify-app.md", "ship.md"],
      commands: ["go.md", "ship.md"],
      skills: ["my-skill"],
      projectsWithMemory: ["proj-a", "proj-b"],
      statusline: true,
      keybindings: true,
      plans: 12,
    });
    projectRoot = makeTmpProjectRoot({
      claudeMd: true,
      projectSettings: { permissions: { allow: ["Read"] } },
      projectCommands: ["deploy.md"],
    });
    process.env.CLAUDE_HOME = claudeHome;

    const signals = await gatherSignals(projectRoot);

    expect(signals.settings.effortLevel).toBe("xhigh");
    expect(signals.settings.allowList).toEqual(["Bash(npm run *)", "Read"]);
    expect(signals.settings.denyList).toEqual(["Bash(rm -rf *)"]);
    expect(signals.settings.autoCompactWindow).toBe("400000");
    expect(signals.settings.hookEvents.sort()).toEqual(["PostToolUse", "Stop"]);
    expect(signals.settings.hookTotalCount).toBe(2);

    expect(signals.personalAgents.sort()).toEqual(["ship.md", "verify-app.md"]);
    expect(signals.personalCommands.sort()).toEqual(["go.md", "ship.md"]);
    expect(signals.personalSkills).toContain("my-skill");
    expect(signals.projectCommands).toEqual(["deploy.md"]);

    expect(signals.plugins.sort()).toEqual(["playwright@1", "superpowers@1"]);
    expect(signals.has.superpowers).toBe(true);
    expect(signals.has.playwright).toBe(true);
    expect(signals.has.frontendDesign).toBe(false);

    expect(signals.memory).toHaveLength(2);
    expect(signals.memory.every((m) => m.fileCount === 1)).toBe(true);
    expect(signals.claudeMdExists).toBe(true);
    expect(signals.statuslineConfigured).toBe(true);
    expect(signals.keybindingsConfigured).toBe(true);
    expect(signals.plansCount).toBe(12);
  });

  it("does not pollute the real ~/.claude — uses only the tmp dir", async () => {
    claudeHome = makeTmpClaudeHome({ settings: { effortLevel: "max" } });
    projectRoot = makeTmpProjectRoot();
    process.env.CLAUDE_HOME = claudeHome;
    const signals = await gatherSignals(projectRoot);
    expect(signals.settings.effortLevel).toBe("max");
    // Sanity: the real ~/.claude/settings.json may have a different value, but we read tmp
    expect(claudeHome.startsWith("/")).toBe(true);
    expect(claudeHome).toMatch(/claude-home-/);
  });
});
