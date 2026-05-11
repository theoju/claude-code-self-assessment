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

  it("returns signals.insights = null when ~/.claude/usage-data is absent", async () => {
    claudeHome = makeTmpClaudeHome();
    projectRoot = makeTmpProjectRoot();
    process.env.CLAUDE_HOME = claudeHome;
    const signals = await gatherSignals(projectRoot);
    expect(signals.insights).toBeNull();
  });

  it("populates signals.insights when usage-data exists", async () => {
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
    claudeHome = makeTmpClaudeHome({
      usageData: {
        sessions: [
          {
            id: "s1",
            meta: {
              start_time: recent,
              uses_task_agent: true,
              tool_counts: { Bash: 4, TaskCreate: 2 },
            },
            facet: {
              outcome: "fully_achieved",
              friction_counts: { buggy_code: 1 },
            },
          },
        ],
      },
    });
    projectRoot = makeTmpProjectRoot();
    process.env.CLAUDE_HOME = claudeHome;

    const signals = await gatherSignals(projectRoot, {
      insightsLookbackDays: 30,
    });
    expect(signals.insights).not.toBeNull();
    expect(signals.insights.sessionsAnalyzed).toBe(1);
    expect(signals.insights.subagentSessionCount).toBe(1);
    expect(signals.insights.taskInvocationsTotal).toBe(2);
    expect(signals.insights.frictionCounts).toEqual({ buggy_code: 1 });
    expect(signals.insights.outcomeCounts).toEqual({ fully_achieved: 1 });
  });

  // Probe-Logic Challenger fix: hasIsolatedAgent originally scanned only
  // personal + project agents. Even after a scope fix, the user's plugin
  // agents are the most likely place an `isolation: worktree` declaration
  // would appear. These integration tests pin the broadened scope.
  describe("hasIsolatedAgent scope", () => {
    it("fires when a personal agent declares isolation: worktree (regression)", async () => {
      claudeHome = makeTmpClaudeHome();
      // Manually write an agent file with frontmatter (the standard fixture
      // body doesn't include frontmatter).
      const { writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      writeFileSync(
        join(claudeHome, "agents", "isolated.md"),
        "---\nname: isolated\nisolation: worktree\n---\n\nUse this agent to do isolated work in its own branch. Run tests and verify.",
      );
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.settings.hasIsolatedAgent).toBe(true);
    });

    it("fires when a PLUGIN agent declares isolation: worktree", async () => {
      claudeHome = makeTmpClaudeHome({
        pluginAgents: [
          {
            vendor: "claude-plugins-official",
            plugin: "superpowers",
            version: "5.0.7",
            name: "isolation-pro.md",
            content:
              "---\nname: isolation-pro\nisolation: worktree\n---\n\nDoes the work in a sandboxed worktree.",
          },
        ],
      });
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.settings.hasIsolatedAgent).toBe(true);
    });

    it("does NOT fire when no agent (personal/project/plugin) declares isolation", async () => {
      claudeHome = makeTmpClaudeHome({
        pluginAgents: [
          {
            vendor: "claude-plugins-official",
            plugin: "superpowers",
            version: "5.0.7",
            name: "code-reviewer.md",
            content:
              "---\nname: code-reviewer\n---\n\nReviews code without isolation.",
          },
        ],
      });
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.settings.hasIsolatedAgent).toBe(false);
    });
  });

  // P2.2 — outputStyle (Boris tip 34): a root-level string in settings.json.
  // gatherSignals must surface it verbatim on signals.settings.outputStyle.
  describe("outputStyle", () => {
    it("reads outputStyle string from settings.json", async () => {
      claudeHome = makeTmpClaudeHome({
        settings: { outputStyle: "Explanatory" },
      });
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.settings.outputStyle).toBe("Explanatory");
    });

    it("returns null when settings.outputStyle is absent", async () => {
      claudeHome = makeTmpClaudeHome({ settings: { effortLevel: "high" } });
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.settings.outputStyle).toBeNull();
    });
  });

  // P6.1 — hasCodeReviewPlugin (Boris tip 44): true when settings.enabledPlugins
  // has a key matching /^code-review(@|$)/i. The anchored prefix prevents
  // false positives on pr-review-toolkit (already routed through hasVerifyAgent)
  // and on unrelated names like code-review-helper or pre-code-review.
  describe("hasCodeReviewPlugin", () => {
    it("fires when code-review@<marketplace> is enabled", async () => {
      claudeHome = makeTmpClaudeHome({
        settings: {
          enabledPlugins: { "code-review@claude-plugins-official": true },
        },
      });
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.hasCodeReviewPlugin).toBe(true);
    });

    it("does NOT fire when only pr-review-toolkit is enabled", async () => {
      claudeHome = makeTmpClaudeHome({
        settings: {
          enabledPlugins: {
            "pr-review-toolkit@claude-plugins-official": true,
          },
        },
      });
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.hasCodeReviewPlugin).toBe(false);
    });

    it("does NOT fire on unrelated prefix names (code-review-helper, pre-code-review)", async () => {
      claudeHome = makeTmpClaudeHome({
        settings: {
          enabledPlugins: {
            "code-review-helper@x": true,
            "pre-code-review@y": true,
          },
        },
      });
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.hasCodeReviewPlugin).toBe(false);
    });

    it("ignores disabled code-review plugin entries", async () => {
      claudeHome = makeTmpClaudeHome({
        settings: {
          enabledPlugins: { "code-review@claude-plugins-official": false },
        },
      });
      projectRoot = makeTmpProjectRoot();
      process.env.CLAUDE_HOME = claudeHome;
      const signals = await gatherSignals(projectRoot);
      expect(signals.hasCodeReviewPlugin).toBe(false);
    });
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
