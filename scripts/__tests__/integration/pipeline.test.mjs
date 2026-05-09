import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { gatherSignals } from "../../signals.mjs";
import { scoreAll, computeTrends } from "../../score.mjs";
import { buildSlackMessage } from "../../slack.mjs";
import { detectMilestones } from "../../progression.mjs";
import { detectConfigMilestones } from "../../config-progression.mjs";
import { makeTmpClaudeHome, makeTmpProjectRoot, cleanup } from "./_tmpHome.mjs";
import { makeRubric } from "../_fixtures.mjs";

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

describe("pipeline gatherSignals → scoreAll → buildSlackMessage", () => {
  it("produces an end-to-end Slack payload with at least one tier per dimension", async () => {
    claudeHome = makeTmpClaudeHome({
      settings: {
        effortLevel: "xhigh",
        permissions: { allow: ["Bash(npm run *)", "Bash(gh pr *)"] },
        hooks: {
          PostToolUse: [{ command: "echo" }],
          Stop: [{ command: "echo" }],
        },
        env: { CLAUDE_CODE_AUTO_COMPACT_WINDOW: "400000" },
        enabledPlugins: {
          "superpowers@1": true,
          "playwright@1": true,
          "imessage@1": true,
          "andrej-karpathy-skills@1": true,
          "explanatory-output-style@1": true,
        },
      },
      agents: ["verify-app.md"],
      commands: ["go.md", "ship.md", "babysit.md"],
      skills: ["my-skill"],
      projectsWithMemory: ["claude-extensions"],
      statusline: true,
      keybindings: true,
      plans: 15,
      claudeMd: true,
    });
    projectRoot = makeTmpProjectRoot({ claudeMd: true });
    process.env.CLAUDE_HOME = claudeHome;

    const rubric = makeRubric();
    const signals = await gatherSignals(projectRoot);
    const scored = scoreAll(rubric, signals);
    const trends = computeTrends(scored, []);
    const assessment = { ...scored, trends, user: "Engineer" };

    // Pipeline integrity
    expect(scored.scores).toHaveLength(rubric.dimensions.length);
    expect(scored.overall).toBeGreaterThan(0);
    expect(scored.overall).toBeLessThanOrEqual(100);

    // Trends from empty history → all 'new'
    expect(Object.values(trends).every((t) => t === "new")).toBe(true);

    // Slack message renders
    const msg = buildSlackMessage(assessment, rubric, {
      user: { displayName: "Engineer" },
      slack: { channel: "#test" },
      publish: { publicUrl: "http://localhost:3737" },
    });

    expect(msg.channel).toBe("#test");
    const flat = JSON.stringify(msg.blocks);
    expect(flat).toMatch(/Claude Code Self-Assessment — Engineer/);
    expect(msg.blocks.at(-1).elements[0].url).toBe("http://localhost:3737");
  });

  it("produces a low overall when nothing is configured", async () => {
    claudeHome = makeTmpClaudeHome();
    projectRoot = makeTmpProjectRoot();
    process.env.CLAUDE_HOME = claudeHome;

    const signals = await gatherSignals(projectRoot);
    const scored = scoreAll(makeRubric(), signals);
    // Empty signals → all base scores, no plugins, no agents, no hooks
    // Should land well under the targets across the board.
    expect(scored.overall).toBeLessThan(70);
    expect(scored.targetOverall - scored.overall).toBeGreaterThan(15);
    // High-leverage dimensions should have explicit gaps reported
    const automation = scored.scores.find((s) => s.id === "automation");
    expect(automation.gaps.length).toBeGreaterThan(0);
    // Empty-state contract for fresh users: insights null, dashboard renders.
    expect(signals.insights).toBeNull();
  });

  it("merges behavioral + config milestones into a single sorted progression", async () => {
    claudeHome = makeTmpClaudeHome({
      settings: {
        permissions: { allow: ["Bash(npm run *)", "Bash(gh pr *)", "Read"] },
        hooks: { Stop: [{ command: "echo" }] },
      },
      claudeMd: true,
      usageData: {
        sessions: [
          {
            id: "sess-A",
            meta: {
              start_time: "2026-04-01T10:00:00Z",
              uses_task_agent: true,
              uses_mcp: false,
              tool_counts: { TaskCreate: 2 },
            },
          },
          {
            id: "sess-B",
            meta: {
              start_time: "2026-04-15T10:00:00Z",
              uses_task_agent: false,
              uses_mcp: true,
            },
          },
        ],
      },
    });
    projectRoot = makeTmpProjectRoot();
    process.env.CLAUDE_HOME = claudeHome;

    const signals = await gatherSignals(projectRoot);

    // Behavioral milestones from session-meta
    const behavioral = await detectMilestones({
      claudeHome,
      now: "2026-05-09T00:00:00Z",
      lookbackDays: null,
      includeTranscripts: false,
    });

    // Config milestones from signalsSummary-shaped derivation
    const configResult = detectConfigMilestones({
      signalsSummary: {
        hasStopHook: true,
        allowListCount: signals.settings.allowList.length,
        hasWildcardAllow: signals.settings.allowList.some((e) =>
          e.includes("*"),
        ),
        claudeMdExists: signals.claudeMdExists,
        plugins: signals.plugins.length,
      },
      priorState: {},
      now: "2026-05-09T00:00:00Z",
    });

    const merged = [
      ...(behavioral?.milestones ?? []),
      ...configResult.milestones,
    ].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    // Expected behavioral milestones from the session-meta fixtures:
    //   sess-A → "Started using subagents" (uses_task_agent)
    //   sess-B → "First MCP-powered session" (uses_mcp)
    expect(merged.some((m) => m.milestone === "Started using subagents")).toBe(
      true,
    );
    expect(
      merged.some((m) => m.milestone === "First MCP-powered session"),
    ).toBe(true);

    // Expected config milestones from the settings/permissions fixtures:
    //   stop-hook, wildcard-allow, claude-md-authored
    expect(merged.some((m) => m.sessionId === "config:stop-hook")).toBe(true);
    expect(merged.some((m) => m.sessionId === "config:wildcard-allow")).toBe(
      true,
    );
    expect(
      merged.some((m) => m.sessionId === "config:claude-md-authored"),
    ).toBe(true);

    // Sort order is timestamp-ascending across both sources
    for (let i = 1; i < merged.length; i++) {
      expect(Date.parse(merged[i].timestamp)).toBeGreaterThanOrEqual(
        Date.parse(merged[i - 1].timestamp),
      );
    }

    // Source provenance: behavioral milestones use real session_id;
    // config ones use the synthetic "config:<id>" namespace.
    const configOnes = merged.filter((m) => m.sessionId.startsWith("config:"));
    const behavioralOnes = merged.filter(
      (m) => !m.sessionId.startsWith("config:"),
    );
    expect(configOnes.length).toBeGreaterThan(0);
    expect(behavioralOnes.length).toBeGreaterThan(0);
  });
});
