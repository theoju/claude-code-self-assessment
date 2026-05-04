import { describe, it, expect } from "vitest";
import {
  tierFor,
  tierColor,
  tierLabel,
  trendGlyph,
  computeStats,
  type Dimension,
} from "../assessment";

function dim(overrides: Partial<Dimension> = {}): Dimension {
  return {
    id: "x",
    title: "Test",
    weight: 1,
    target: 80,
    rubricArea: "test",
    borisTips: "1",
    nextActions: ["do thing"],
    score: 50,
    tier: "developing",
    trend: "flat",
    evidence: [],
    gaps: [],
    summary: "",
    executionScore: null,
    executionEvidence: [],
    executionGaps: [],
    gapReason: null,
    ...overrides,
  };
}

describe("tierFor", () => {
  it.each([
    [29, "not-touched"],
    [30, "starter"],
    [55, "developing"],
    [70, "solid"],
    [85, "advanced"],
  ])("score %i → %s", (score, expected) => {
    expect(tierFor(score)).toBe(expected);
  });
});

describe("tierColor", () => {
  it("returns a CSS class string for every tier", () => {
    for (const t of ["not-touched", "starter", "developing", "solid", "advanced"] as const) {
      expect(tierColor(t)).toMatch(/text-/);
    }
  });
});

describe("tierLabel", () => {
  it("hyphen → space", () => {
    expect(tierLabel("not-touched")).toBe("not touched");
    expect(tierLabel("solid")).toBe("solid");
  });
});

describe("trendGlyph", () => {
  it.each([
    ["improving", "↗"],
    ["slipping", "↘"],
    ["flat", "→"],
    ["new", "✦"],
  ])("%s → %s", (trend, glyph) => {
    expect(trendGlyph(trend as "improving" | "slipping" | "flat" | "new")).toBe(glyph);
  });
});

describe("computeStats", () => {
  it("counts dimensions per tier", () => {
    const dims = [
      dim({ id: "a", tier: "advanced" }),
      dim({ id: "b", tier: "advanced" }),
      dim({ id: "c", tier: "developing" }),
      dim({ id: "d", tier: "starter" }),
    ];
    const stats = computeStats(dims);
    expect(stats.byTier.advanced).toBe(2);
    expect(stats.byTier.developing).toBe(1);
    expect(stats.byTier.starter).toBe(1);
    expect(stats.byTier.solid).toBe(0);
    expect(stats.byTier["not-touched"]).toBe(0);
  });

  it("orders priorityActions by weight × deficit and caps at 6", () => {
    const dims = [
      dim({ id: "low", weight: 1, target: 80, score: 70, nextActions: ["small"] }),
      dim({ id: "high", weight: 3, target: 90, score: 30, nextActions: ["big"] }),
      dim({ id: "mid", weight: 2, target: 80, score: 60, nextActions: ["mid"] }),
    ];
    const stats = computeStats(dims);
    // weight × deficit: high=180, mid=40, low=10 → high first
    expect(stats.priorityActions[0].dimensionId).toBe("high");
    expect(stats.priorityActions[1].dimensionId).toBe("mid");
    expect(stats.priorityActions[2].dimensionId).toBe("low");
    expect(stats.priorityActions.length).toBeLessThanOrEqual(6);
  });

  it("excludes dimensions already at or above target", () => {
    const dims = [
      dim({ id: "done", target: 80, score: 80, nextActions: ["x"] }),
      dim({ id: "exceeds", target: 70, score: 90, nextActions: ["y"] }),
      dim({ id: "behind", target: 80, score: 50, nextActions: ["z"] }),
    ];
    const stats = computeStats(dims);
    expect(stats.priorityActions.map((a) => a.dimensionId)).toEqual(["behind"]);
  });

  it("flattens multiple nextActions per dimension", () => {
    const dims = [
      dim({ id: "x", target: 90, score: 30, nextActions: ["a1", "a2", "a3"] }),
    ];
    const stats = computeStats(dims);
    expect(stats.priorityActions).toHaveLength(3);
    expect(stats.priorityActions.map((a) => a.action)).toEqual(["a1", "a2", "a3"]);
  });
});
