import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { gatherSignals } from "../../signals.mjs";
import { scoreAll, computeTrends } from "../../score.mjs";
import { buildSlackMessage } from "../../slack.mjs";
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
        hooks: { PostToolUse: [{ command: "echo" }], Stop: [{ command: "echo" }] },
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
});
