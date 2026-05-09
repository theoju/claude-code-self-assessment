import { describe, it, expect } from "vitest";
import { buildSignalsSummary } from "../run-assessment.mjs";

// Minimal but realistic signals shape that exercises every path in
// buildSignalsSummary. Mirrors the structure produced by gatherSignals().
function makeSignals(overrides = {}) {
  return {
    settings: {
      effortLevel: "high",
      skipDangerousModePermissionPrompt: false,
      allowList: ["Bash(npm run *)", "Bash(gh pr *)", "Read"],
      denyList: [],
      autoCompactWindow: "400000",
      hookEvents: ["Stop", "PostToolUse"],
      hookTotalCount: 4,
    },
    plugins: ["slack@1", "vercel@1", "other@1"],
    personalAgents: ["verify-app.md", "other.md"],
    personalCommands: ["ship.md", "go.md"],
    personalSkills: ["my-skill"],
    projectAgents: [],
    projectCommands: [],
    memory: [{ project: "x" }],
    claudeMdExists: true,
    statuslineConfigured: true,
    keybindingsConfigured: false,
    insights: null,
    ...overrides,
  };
}

describe("buildSignalsSummary", () => {
  it("returns an object with every documented field", () => {
    const r = buildSignalsSummary(makeSignals());
    const expectedKeys = [
      "plugins",
      "personalAgents",
      "personalCommands",
      "personalSkills",
      "hookTotalCount",
      "effortLevel",
      "skipDangerous",
      "autoCompactWindow",
      "allowListCount",
      "hasWildcardAllow",
      "hookEvents",
      "hasStopHook",
      "hasPostToolHook",
      "hasShipCommand",
      "hasVerifyAgent",
      "claudeMdExists",
      "statuslineConfigured",
      "keybindingsConfigured",
      "hasSlackPlugin",
      "hasVercelPlugin",
      "projectsWithMemory",
      "insightsAvailable",
      "insightsSessionsAnalyzed",
      "insightsLookbackDays",
      "insightsTranscriptsScanned",
      "insightsHookFireCount",
    ];
    for (const k of expectedKeys) expect(r).toHaveProperty(k);
  });

  it("counts allowList entries correctly", () => {
    const r = buildSignalsSummary(makeSignals());
    expect(r.allowListCount).toBe(3);
  });

  it("hasWildcardAllow detects '*' in any allowlist entry", () => {
    expect(
      buildSignalsSummary(
        makeSignals({
          settings: {
            ...makeSignals().settings,
            allowList: ["Read", "Bash(npm run *)"],
          },
        }),
      ).hasWildcardAllow,
    ).toBe(true);
    expect(
      buildSignalsSummary(
        makeSignals({
          settings: {
            ...makeSignals().settings,
            allowList: ["Read", "WebFetch"],
          },
        }),
      ).hasWildcardAllow,
    ).toBe(false);
  });

  it("hasStopHook / hasPostToolHook reflect hookEvents membership", () => {
    const r = buildSignalsSummary(
      makeSignals({
        settings: {
          ...makeSignals().settings,
          hookEvents: ["Stop"],
        },
      }),
    );
    expect(r.hasStopHook).toBe(true);
    expect(r.hasPostToolHook).toBe(false);
  });

  it("hasStopHook / hasPostToolHook tolerate missing hookEvents", () => {
    const r = buildSignalsSummary(
      makeSignals({
        settings: { ...makeSignals().settings, hookEvents: undefined },
      }),
    );
    expect(r.hasStopHook).toBe(false);
    expect(r.hasPostToolHook).toBe(false);
  });

  it("hasShipCommand checks both personal and project commands", () => {
    expect(
      buildSignalsSummary(
        makeSignals({ personalCommands: ["ship.md"], projectCommands: [] }),
      ).hasShipCommand,
    ).toBe(true);
    expect(
      buildSignalsSummary(
        makeSignals({ personalCommands: [], projectCommands: ["ship.md"] }),
      ).hasShipCommand,
    ).toBe(true);
    expect(
      buildSignalsSummary(
        makeSignals({ personalCommands: ["go.md"], projectCommands: [] }),
      ).hasShipCommand,
    ).toBe(false);
  });

  it("hasVerifyAgent matches /^verify/i in either scope", () => {
    expect(
      buildSignalsSummary(makeSignals({ personalAgents: ["verify-app.md"] }))
        .hasVerifyAgent,
    ).toBe(true);
    expect(
      buildSignalsSummary(
        makeSignals({
          personalAgents: [],
          projectAgents: ["VerifyAuth.md"],
        }),
      ).hasVerifyAgent,
    ).toBe(true);
    expect(
      buildSignalsSummary(makeSignals({ personalAgents: ["other.md"] }))
        .hasVerifyAgent,
    ).toBe(false);
  });

  it("hasSlackPlugin / hasVercelPlugin do case-insensitive substring match", () => {
    const r = buildSignalsSummary(
      makeSignals({ plugins: ["foo-Slack-bar@1", "VercelLite@2"] }),
    );
    expect(r.hasSlackPlugin).toBe(true);
    expect(r.hasVercelPlugin).toBe(true);
  });

  it("insights null produces falsy/zero defaults rather than nulls or NaN", () => {
    const r = buildSignalsSummary(makeSignals({ insights: null }));
    expect(r.insightsAvailable).toBe(false);
    expect(r.insightsSessionsAnalyzed).toBe(0);
    expect(r.insightsLookbackDays).toBeNull();
    expect(r.insightsTranscriptsScanned).toBe(false);
    expect(r.insightsHookFireCount).toBe(0);
  });

  it("populated insights forwards numeric fields", () => {
    const r = buildSignalsSummary(
      makeSignals({
        insights: {
          sessionsAnalyzed: 144,
          lookbackDays: 30,
          transcriptsScanned: true,
          hookFireCount: 12,
        },
      }),
    );
    expect(r.insightsAvailable).toBe(true);
    expect(r.insightsSessionsAnalyzed).toBe(144);
    expect(r.insightsLookbackDays).toBe(30);
    expect(r.insightsTranscriptsScanned).toBe(true);
    expect(r.insightsHookFireCount).toBe(12);
  });

  it("output keys form a stable contract — locked-in by snapshot", () => {
    const r = buildSignalsSummary(makeSignals());
    const sortedKeys = Object.keys(r).sort();
    expect(sortedKeys).toMatchInlineSnapshot(`
      [
        "allowListCount",
        "autoCompactWindow",
        "claudeMdExists",
        "effortLevel",
        "hasFormatterHook",
        "hasPostToolHook",
        "hasShipCommand",
        "hasSlackPlugin",
        "hasStopHook",
        "hasVercelPlugin",
        "hasVerifyAgent",
        "hasWildcardAllow",
        "hookEvents",
        "hookTotalCount",
        "insightsAvailable",
        "insightsHookFireCount",
        "insightsLookbackDays",
        "insightsSessionsAnalyzed",
        "insightsTranscriptsScanned",
        "keybindingsConfigured",
        "personalAgents",
        "personalCommands",
        "personalSkills",
        "plugins",
        "projectsWithMemory",
        "skipDangerous",
        "statuslineConfigured",
      ]
    `);
  });
});
