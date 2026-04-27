import { describe, it, expect } from "vitest";
import { SCORERS, tierFor, clamp, scoreAll, computeTrends } from "../score.mjs";
import { makeSignals, makeRubric } from "./_fixtures.mjs";

describe("clamp", () => {
  it("clamps to 0..100 by default", () => {
    expect(clamp(-5)).toBe(0);
    expect(clamp(50)).toBe(50);
    expect(clamp(200)).toBe(100);
  });
  it("respects custom bounds", () => {
    expect(clamp(5, 10, 20)).toBe(10);
    expect(clamp(25, 10, 20)).toBe(20);
  });
});

describe("tierFor", () => {
  it.each([
    [0, "not-touched"],
    [29, "not-touched"],
    [30, "starter"],
    [54, "starter"],
    [55, "developing"],
    [69, "developing"],
    [70, "solid"],
    [84, "solid"],
    [85, "advanced"],
    [100, "advanced"],
  ])("score %i → %s", (score, tier) => {
    expect(tierFor(score)).toBe(tier);
  });
});

describe("SCORERS.automation", () => {
  it("rewards hooks, agents, commands, skills", () => {
    const r = SCORERS.automation(
      makeSignals({
        settings: { hookTotalCount: 3, hookEvents: ["PostToolUse", "Stop"] },
        personalAgents: ["a.md", "b.md"],
        personalCommands: ["c.md"],
        projectCommands: ["pc.md"],
        personalSkills: ["s1", "s2"],
      }),
    );
    expect(r.score).toBeGreaterThan(60);
    expect(r.evidence.length).toBeGreaterThanOrEqual(4);
    expect(r.gaps.length).toBeLessThan(2);
  });
  it("flags missing hooks/agents/commands/skills as gaps", () => {
    const r = SCORERS.automation(makeSignals());
    expect(r.score).toBeLessThanOrEqual(40);
    expect(r.gaps.join(" ")).toMatch(/no hooks/i);
    expect(r.gaps.join(" ")).toMatch(/agents/i);
    expect(r.gaps.join(" ")).toMatch(/commands/i);
  });
});

describe("SCORERS.permissions", () => {
  it("downgrades when skipDangerousModePermissionPrompt is true", () => {
    const skip = SCORERS.permissions(
      makeSignals({ settings: { skipDangerousModePermissionPrompt: true } }),
    );
    const safe = SCORERS.permissions(makeSignals());
    expect(skip.score).toBeLessThan(safe.score);
    expect(skip.gaps.join(" ")).toMatch(/dangerous/i);
  });
  it("rewards allowlist and denylist entries", () => {
    const r = SCORERS.permissions(
      makeSignals({
        settings: {
          allowList: ["Bash(npm run *)", "Bash(gh pr *)", "Read"],
          denyList: ["Bash(rm -rf *)"],
        },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.evidence.some((e) => /3 permission allowlist/i.test(e))).toBe(true);
  });
});

describe("SCORERS['model-effort']", () => {
  it("rewards xhigh/max effort", () => {
    const xhigh = SCORERS["model-effort"](
      makeSignals({ settings: { effortLevel: "xhigh", autoCompactWindow: "400000" } }),
    );
    expect(xhigh.score).toBeGreaterThanOrEqual(85);
    expect(xhigh.gaps.length).toBe(0);
  });
  it("flags medium/low as significantly under-tuned", () => {
    const med = SCORERS["model-effort"](
      makeSignals({ settings: { effortLevel: "medium" } }),
    );
    expect(med.gaps.join(" ")).toMatch(/under-tuned/i);
  });
  it("partially credits 'high'", () => {
    const high = SCORERS["model-effort"](
      makeSignals({ settings: { effortLevel: "high" } }),
    );
    expect(high.score).toBeGreaterThan(40);
    expect(high.gaps.join(" ")).toMatch(/xhigh/i);
  });
});

describe("SCORERS.parallel", () => {
  it("rewards superpowers + personal agents", () => {
    const r = SCORERS.parallel(
      makeSignals({
        has: { superpowers: true, prReviewToolkit: true, featureDev: true },
        personalAgents: ["verify.md"],
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
  it("flags zero personal agents", () => {
    const r = SCORERS.parallel(makeSignals());
    expect(r.gaps.join(" ")).toMatch(/personal/i);
  });
});

describe("SCORERS.verification", () => {
  it("rewards playwright + /go composite + review plugins", () => {
    const r = SCORERS.verification(
      makeSignals({
        has: { playwright: true, semgrep: true, prReviewToolkit: true, superpowers: true },
        personalCommands: ["go.md"],
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(85);
  });
  it("flags missing /go and missing playwright", () => {
    const r = SCORERS.verification(makeSignals());
    const gaps = r.gaps.join(" ");
    expect(gaps).toMatch(/go composite/i);
    expect(gaps).toMatch(/browser-automation/i);
  });
});

describe("SCORERS.memory", () => {
  it("rewards memory files + claudeMd + plans + plugin", () => {
    const r = SCORERS.memory(
      makeSignals({
        memory: [{ project: "x", fileCount: 3 }, { project: "y", fileCount: 2 }],
        claudeMdExists: true,
        plansCount: 15,
        has: { claudeMdMgmt: true },
        settings: { autoCompactWindow: "400000" },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(80);
  });
  it("flags missing CLAUDE.md and missing memory and missing window", () => {
    const r = SCORERS.memory(makeSignals());
    const gaps = r.gaps.join(" ");
    expect(gaps).toMatch(/MEMORY\.md/);
    expect(gaps).toMatch(/CLAUDE\.md/);
    expect(gaps).toMatch(/AUTO_COMPACT/);
  });
});

describe("SCORERS.planning", () => {
  it("rewards superpowers + karpathy + saved plans", () => {
    const r = SCORERS.planning(
      makeSignals({
        has: { superpowers: true, karpathy: true, featureDev: true },
        plansCount: 12,
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(85);
  });
  it("always emits the behavioral check gap", () => {
    const r = SCORERS.planning(makeSignals());
    expect(r.gaps.length).toBeGreaterThan(0);
    expect(r.gaps[0]).toMatch(/Goal|Constraints|Acceptance/);
  });
});

describe("SCORERS.integrations", () => {
  it("scales with plugin count", () => {
    const few = SCORERS.integrations(makeSignals({ plugins: ["a@1", "b@1"] }));
    const many = SCORERS.integrations(
      makeSignals({ plugins: Array.from({ length: 25 }, (_, i) => `p${i}@1`) }),
    );
    expect(many.score).toBeGreaterThan(few.score);
  });
  it("flags missing Slack MCP", () => {
    const r = SCORERS.integrations(makeSignals({ plugins: ["foo@1"] }));
    expect(r.gaps.join(" ")).toMatch(/Slack/);
  });
});

describe("SCORERS.customization", () => {
  it("rewards statusline + explanatory + keybindings", () => {
    const r = SCORERS.customization(
      makeSignals({
        statuslineConfigured: true,
        keybindingsConfigured: true,
        has: { explanatoryStyle: true },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.gaps.length).toBe(0);
  });
});

describe("SCORERS.scheduled", () => {
  it("rewards ralph-loop + Stop hook + scheduled commands", () => {
    const r = SCORERS.scheduled(
      makeSignals({
        has: { ralphLoop: true },
        personalCommands: ["babysit-prs.md"],
        settings: { hookEvents: ["Stop"], hookTotalCount: 1 },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(70);
  });
});

describe("SCORERS.remote", () => {
  it("rewards imessage plugin", () => {
    const r = SCORERS.remote(makeSignals({ has: { imessage: true } }));
    expect(r.score).toBe(50);
  });
  it("flags missing imessage", () => {
    const r = SCORERS.remote(makeSignals());
    expect(r.gaps[0]).toMatch(/imessage/);
  });
  it("can reach the solid tier (target 75) when iMessage + Chrome ext + routines are present", () => {
    const r = SCORERS.remote(
      makeSignals({
        has: { imessage: true },
        chromeExtensionConfigured: true,
        routinesCount: 2,
        behavior: { teleportSessions: 3 },
      })
    );
    expect(r.score).toBeGreaterThanOrEqual(75);
  });
});

describe("SCORERS.learning", () => {
  it("rewards explanatory + karpathy + skill-creator", () => {
    const r = SCORERS.learning(
      makeSignals({
        has: { explanatoryStyle: true, karpathy: true, skillCreator: true },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(85);
  });
});

describe("behavioral signal wiring", () => {
  it("automation: configured-but-silent hooks lose their per-hook bonus when behavior is on", () => {
    const silent = SCORERS.automation(
      makeSignals({
        settings: { hookTotalCount: 4, hookEvents: ["PostToolUse", "Stop"] },
        behavior: { transcriptsEnabled: true, hookFires: 0 },
      })
    );
    const firing = SCORERS.automation(
      makeSignals({
        settings: { hookTotalCount: 4, hookEvents: ["PostToolUse", "Stop"] },
        behavior: { transcriptsEnabled: true, hookFires: 12 },
      })
    );
    expect(silent.score).toBeLessThan(firing.score);
    expect(silent.gaps.join(" ")).toMatch(/never fire/i);
  });

  it("permissions: bypassPermissions usage in transcripts subtracts points", () => {
    const noBypass = SCORERS.permissions(
      makeSignals({
        behavior: { transcriptsEnabled: true, autoModeLongSessions: 3, bypassPermSessions: 0 },
      })
    );
    const withBypass = SCORERS.permissions(
      makeSignals({
        behavior: { transcriptsEnabled: true, autoModeLongSessions: 3, bypassPermSessions: 4 },
      })
    );
    expect(withBypass.score).toBeLessThan(noBypass.score);
    expect(withBypass.gaps.join(" ")).toMatch(/bypassPermissions/);
  });

  it("verification: shipVerifyRate of 100% adds up to +12", () => {
    const r = SCORERS.verification(
      makeSignals({
        behavior: { transcriptsEnabled: true, shipSessions: 5, shipVerifyRate: 1 },
      })
    );
    const baseline = SCORERS.verification(makeSignals());
    expect(r.score).toBeGreaterThan(baseline.score);
  });

  it("planning: high plan-mode utilization adds points and removes the GCA gap", () => {
    const r = SCORERS.planning(
      makeSignals({
        behavior: { transcriptsEnabled: true, multiFileSessions: 5, multiFilePlanRate: 0.9 },
      })
    );
    expect(r.gaps.find((g) => /Goal|Constraints|Acceptance/.test(g))).toBeUndefined();
    expect(r.evidence.some((e) => /Plan-mode utilization/.test(e))).toBe(true);
  });

  it("integrations: plugin-spray with zero behavior gets gated to baseline + 5", () => {
    const noBehavior = SCORERS.integrations(
      makeSignals({ plugins: Array.from({ length: 25 }, (_, i) => `p${i}@1`) })
    );
    const gated = SCORERS.integrations(
      makeSignals({
        plugins: Array.from({ length: 25 }, (_, i) => `p${i}@1`),
        behavior: { transcriptsEnabled: true, toolCounts: {} },
      })
    );
    expect(gated.score).toBeLessThan(noBehavior.score);
    expect(gated.gaps.join(" ")).toMatch(/installed but no recent tool invocations/);
  });
});

describe("scoreAll", () => {
  it("emits one row per rubric dimension with tier and clamped score", () => {
    const rubric = makeRubric();
    const result = scoreAll(rubric, makeSignals());
    expect(result.scores).toHaveLength(rubric.dimensions.length);
    for (const s of result.scores) {
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
      expect(["not-touched", "starter", "developing", "solid", "advanced"]).toContain(s.tier);
    }
  });
  it("computes weight-normalized overall and target", () => {
    const rubric = makeRubric();
    const result = scoreAll(rubric, makeSignals());
    expect(typeof result.overall).toBe("number");
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.targetOverall).toBeGreaterThanOrEqual(result.overall);
  });
  it("preserves capturedAt as ISO string", () => {
    const result = scoreAll(makeRubric(), makeSignals());
    expect(() => new Date(result.capturedAt).toISOString()).not.toThrow();
  });
  it("zeroes out scores for unknown rubric ids", () => {
    const rubric = { dimensions: [{ id: "made-up", title: "X", weight: 1, target: 50 }] };
    const result = scoreAll(rubric, makeSignals());
    expect(result.scores[0]).toMatchObject({ id: "made-up", score: 0, tier: "not-touched" });
  });
});

describe("computeTrends", () => {
  const current = {
    scores: [
      { id: "a", score: 70 },
      { id: "b", score: 50 },
      { id: "c", score: 80 },
      { id: "d", score: 40 },
    ],
  };

  it("marks every dimension as 'new' when history is empty", () => {
    const trends = computeTrends(current, []);
    expect(Object.values(trends).every((t) => t === "new")).toBe(true);
  });

  it("classifies improving / slipping / flat against last entry (with evidence change)", () => {
    // Adaptive trend now requires both: |delta| >= noiseFloor AND evidence/gap changed.
    // Bump the deltas above the default noise floor of 5 and toggle evidence.
    const history = [
      {
        capturedAt: "2026-04-24",
        overall: 60,
        scores: [
          { id: "a", score: 60, evidence: ["was-here"], gaps: [] },
          { id: "b", score: 60, evidence: ["b-old"], gaps: [] },
          { id: "c", score: 80, evidence: ["c-stable"], gaps: [] },
        ],
      },
    ];
    const next = {
      scores: [
        { id: "a", score: 70, evidence: ["new-thing"], gaps: [] },
        { id: "b", score: 50, evidence: ["b-old"], gaps: ["b-new-gap"] },
        { id: "c", score: 80, evidence: ["c-stable"], gaps: [] },
        { id: "d", score: 40, evidence: [], gaps: [] },
      ],
    };
    const trends = computeTrends(next, history);
    expect(trends.a).toBe("improving");
    expect(trends.b).toBe("slipping");
    expect(trends.c).toBe("flat");
    expect(trends.d).toBe("new");
  });

  it("treats deltas below the noise floor as flat", () => {
    // Default noise floor is 5; ±4 should be flat even if evidence changed.
    const history = [
      {
        capturedAt: "x",
        overall: 60,
        scores: [
          { id: "a", score: 71, evidence: ["a"], gaps: [] },
          { id: "b", score: 49, evidence: ["b"], gaps: [] },
        ],
      },
    ];
    const trends = computeTrends(
      {
        scores: [
          { id: "a", score: 67, evidence: ["different"], gaps: [] },
          { id: "b", score: 53, evidence: ["different"], gaps: [] },
        ],
      },
      history,
    );
    expect(trends.a).toBe("flat");
    expect(trends.b).toBe("flat");
  });

  it("treats a score wobble without evidence change as flat (noise filter)", () => {
    // delta exceeds noise floor but evidence/gaps identical → flat.
    const history = [
      { capturedAt: "x", overall: 60, scores: [{ id: "a", score: 60, evidence: ["same"], gaps: [] }] },
    ];
    const trends = computeTrends(
      { scores: [{ id: "a", score: 75, evidence: ["same"], gaps: [] }] },
      history,
    );
    expect(trends.a).toBe("flat");
  });

  it("respects per-dimension noiseFloor from rubric", () => {
    const history = [
      { capturedAt: "x", overall: 60, scores: [{ id: "a", score: 70, evidence: ["x"], gaps: [] }] },
    ];
    const next = { scores: [{ id: "a", score: 78, evidence: ["y"], gaps: [] }] };
    // With noise floor 10, an 8-point move stays flat.
    const trends = computeTrends(next, history, {
      dimensions: [{ id: "a", noiseFloor: 10 }],
    });
    expect(trends.a).toBe("flat");
  });
});
