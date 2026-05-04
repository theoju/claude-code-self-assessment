import { describe, it, expect } from "vitest";
import { SCORERS, EXECUTION_SCORERS, tierFor, clamp, scoreAll, computeTrends } from "../score.mjs";
import { makeSignals, makeRubric, makeInsights } from "./_fixtures.mjs";

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
  it("downweights hook credit when configured but never fires in the window", () => {
    const hot = SCORERS.automation(
      makeSignals({
        settings: { hookTotalCount: 3, hookEvents: ["PostToolUse"] },
        insights: makeInsights({ hookFireCount: 12 }),
      }),
    );
    const cold = SCORERS.automation(
      makeSignals({
        settings: { hookTotalCount: 3, hookEvents: ["PostToolUse"] },
        insights: makeInsights({ hookFireCount: 0 }),
      }),
    );
    expect(cold.score).toBeLessThan(hot.score);
    expect(cold.gaps.join(" ")).toMatch(/none fired/i);
    expect(cold.evidence.join(" ")).toMatch(/gated/i);
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
  it("amplifies penalty when transcripts show bypassPermissions usage", () => {
    const clean = SCORERS.permissions(makeSignals());
    const bypassed = SCORERS.permissions(
      makeSignals({
        insights: makeInsights({ transcriptsScanned: true, bypassPermissionsSessionCount: 5 }),
      }),
    );
    expect(bypassed.score).toBe(clean.score - 5);
    expect(bypassed.gaps.join(" ")).toMatch(/bypassPermissions used in 5/);
  });
  it("ignores bypass amplification when transcripts not scanned", () => {
    const clean = SCORERS.permissions(makeSignals());
    const noTranscript = SCORERS.permissions(
      makeSignals({ insights: makeInsights({ transcriptsScanned: false }) }),
    );
    expect(noTranscript.score).toBe(clean.score);
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
    expect(r.score).toBe(55);
  });
  it("flags missing imessage", () => {
    const r = SCORERS.remote(makeSignals());
    expect(r.gaps[0]).toMatch(/imessage/);
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

describe("EXECUTION_SCORERS", () => {
  describe("permissions", () => {
    it("returns null score with gapReason when insights are absent", () => {
      const r = EXECUTION_SCORERS.permissions(makeSignals());
      expect(r.score).toBeNull();
      expect(r.gapReason).toMatch(/run \/insights/i);
    });
    it("returns null score with gapReason when transcripts not scanned", () => {
      const r = EXECUTION_SCORERS.permissions(
        makeSignals({ insights: makeInsights({ transcriptsScanned: false }) }),
      );
      expect(r.score).toBeNull();
      expect(r.gapReason).toMatch(/includeTranscripts/);
    });
    it("rewards high auto-mode ratio, punishes bypass usage", () => {
      const r = EXECUTION_SCORERS.permissions(
        makeSignals({
          insights: makeInsights({
            transcriptsScanned: true,
            sessionsAnalyzed: 100,
            autoModeSessionCount: 90,
            bypassPermissionsSessionCount: 0,
          }),
        }),
      );
      expect(r.score).toBeGreaterThanOrEqual(85);
      const bad = EXECUTION_SCORERS.permissions(
        makeSignals({
          insights: makeInsights({
            transcriptsScanned: true,
            sessionsAnalyzed: 100,
            autoModeSessionCount: 50,
            bypassPermissionsSessionCount: 25,
          }),
        }),
      );
      expect(bad.score).toBeLessThan(r.score);
      expect(bad.gaps.join(" ")).toMatch(/bypassPermissions/);
    });
  });

  describe("verification", () => {
    it("returns null when insights absent", () => {
      const r = EXECUTION_SCORERS.verification(makeSignals());
      expect(r.score).toBeNull();
    });
    it("scales inversely with buggy_code + wrong_approach rate", () => {
      const clean = EXECUTION_SCORERS.verification(
        makeSignals({ insights: makeInsights({ sessionsAnalyzed: 100, frictionCounts: {} }) }),
      );
      const messy = EXECUTION_SCORERS.verification(
        makeSignals({
          insights: makeInsights({
            sessionsAnalyzed: 100,
            frictionCounts: { buggy_code: 20, wrong_approach: 5 },
          }),
        }),
      );
      expect(clean.score).toBe(100);
      expect(messy.score).toBeLessThan(clean.score);
      expect(messy.gaps.join(" ")).toMatch(/20 first-pass-bug/);
    });
  });

  describe("parallel", () => {
    it("scores subagent dispatch ratio without transcripts", () => {
      const r = EXECUTION_SCORERS.parallel(
        makeSignals({
          insights: makeInsights({
            sessionsAnalyzed: 100,
            subagentSessionCount: 60,
            transcriptsScanned: false,
          }),
        }),
      );
      expect(r.score).toBe(60);
    });
    it("adds worktree bonus when transcripts scanned", () => {
      const r = EXECUTION_SCORERS.parallel(
        makeSignals({
          insights: makeInsights({
            sessionsAnalyzed: 100,
            subagentSessionCount: 40,
            worktreeUsageSessionCount: 30,
            transcriptsScanned: true,
          }),
        }),
      );
      expect(r.score).toBe(40 + 15); // 30/100 * 50 = 15
    });
    it("flags low subagent dispatch as a gap", () => {
      const r = EXECUTION_SCORERS.parallel(
        makeSignals({
          insights: makeInsights({ sessionsAnalyzed: 100, subagentSessionCount: 5 }),
        }),
      );
      expect(r.gaps.join(" ")).toMatch(/Subagent dispatch/);
    });
  });

  describe("planning", () => {
    it("requires transcripts", () => {
      const r = EXECUTION_SCORERS.planning(
        makeSignals({ insights: makeInsights({ transcriptsScanned: false }) }),
      );
      expect(r.score).toBeNull();
      expect(r.gapReason).toMatch(/includeTranscripts/);
    });
    it("computes plan-mode ratio against multi-task sessions", () => {
      const r = EXECUTION_SCORERS.planning(
        makeSignals({
          insights: makeInsights({
            transcriptsScanned: true,
            multiTaskSessionCount: 10,
            planModeSessionCount: 3,
          }),
        }),
      );
      expect(r.score).toBe(30);
      expect(r.gaps.join(" ")).toMatch(/half of multi-task/);
    });
  });

  describe("automation", () => {
    it("scales with hook fire count", () => {
      const cold = EXECUTION_SCORERS.automation(
        makeSignals({ insights: makeInsights({ sessionsAnalyzed: 100, hookFireCount: 0 }) }),
      );
      const warm = EXECUTION_SCORERS.automation(
        makeSignals({ insights: makeInsights({ sessionsAnalyzed: 100, hookFireCount: 100 }) }),
      );
      expect(warm.score).toBeGreaterThan(cold.score);
      expect(cold.gaps.join(" ")).toMatch(/dormant/i);
    });
    it("adds subagent-with-personal-agents bonus", () => {
      const r = EXECUTION_SCORERS.automation(
        makeSignals({
          personalAgents: ["mine.md"],
          insights: makeInsights({ sessionsAnalyzed: 100, hookFireCount: 0, subagentSessionCount: 50 }),
        }),
      );
      expect(r.score).toBe(20);
    });
  });

  describe("integrations", () => {
    it("returns null with no plugins installed", () => {
      const r = EXECUTION_SCORERS.integrations(
        makeSignals({ plugins: [], insights: makeInsights({}) }),
      );
      expect(r.score).toBeNull();
    });
    it("scores ratio of installed-to-actually-used plugins", () => {
      const r = EXECUTION_SCORERS.integrations(
        makeSignals({
          plugins: ["a@1", "b@1", "c@1", "d@1"],
          insights: makeInsights({ toolInvocationsByPlugin: { a: 10, b: 5 } }),
        }),
      );
      expect(r.score).toBe(50);
      expect(r.evidence.join(" ")).toMatch(/2\/4 installed plugins/);
    });
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

  it("emits null executionOverall when no execution data is available", () => {
    const result = scoreAll(makeRubric(), makeSignals());
    expect(result.executionOverall).toBeNull();
    for (const s of result.scores) expect(s.executionScore).toBeNull();
  });

  it("emits weight-normalized executionOverall when insights present", () => {
    const result = scoreAll(
      makeRubric(),
      makeSignals({
        plugins: ["a@1", "b@1"],
        insights: makeInsights({ sessionsAnalyzed: 100, subagentSessionCount: 50, frictionCounts: {} }),
      }),
    );
    expect(typeof result.executionOverall).toBe("number");
    expect(result.executionOverall).toBeGreaterThan(0);
    const exScored = result.scores.filter((s) => typeof s.executionScore === "number");
    expect(exScored.length).toBeGreaterThan(0);
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

  it("classifies improving / slipping / flat against last entry", () => {
    const history = [
      {
        capturedAt: "2026-04-24",
        overall: 60,
        scores: [
          { id: "a", score: 65 },
          { id: "b", score: 55 },
          { id: "c", score: 80 },
        ],
      },
    ];
    const trends = computeTrends(current, history);
    expect(trends.a).toBe("improving");
    expect(trends.b).toBe("slipping");
    expect(trends.c).toBe("flat");
    expect(trends.d).toBe("new");
  });

  it("treats ±1 as flat (within noise band)", () => {
    const history = [
      { capturedAt: "x", overall: 60, scores: [{ id: "a", score: 71 }, { id: "b", score: 49 }] },
    ];
    const trends = computeTrends(
      { scores: [{ id: "a", score: 70 }, { id: "b", score: 50 }] },
      history,
    );
    expect(trends.a).toBe("flat");
    expect(trends.b).toBe("flat");
  });
});
