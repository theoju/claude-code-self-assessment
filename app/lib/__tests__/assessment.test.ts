import { describe, it, expect } from "vitest";
import {
  tierFor,
  tierColor,
  tierLabel,
  trendGlyph,
  computeStats,
  type Dimension,
} from "../assessment";

function action(id: string, label = id, effort: "5min" | "15min" | "30min" | "1hr" | "2hr" = "30min", requires?: string[]) {
  return { id, action: label, effort, ...(requires ? { requires } : {}) };
}

function dim(overrides: Partial<Dimension> = {}): Dimension {
  return {
    id: "x",
    title: "Test",
    weight: 1,
    target: 80,
    rubricArea: "test",
    borisTips: "1",
    nextActions: [action("default", "do thing")],
    score: 50,
    tier: "developing",
    trend: "flat",
    evidence: [],
    gaps: [],
    summary: "",
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

  it("orders priorityActions by leverage (weight × deficit / effortMinutes), capped at 6", () => {
    const dims = [
      dim({ id: "low", weight: 1, target: 80, score: 70, nextActions: [action("low", "small")] }),
      dim({ id: "high", weight: 3, target: 90, score: 30, nextActions: [action("high", "big")] }),
      dim({ id: "mid", weight: 2, target: 80, score: 60, nextActions: [action("mid", "mid")] }),
    ];
    const stats = computeStats(dims);
    // All effort 30min → leverage proportional to weight × deficit: high=6, mid=1.33, low=0.33
    expect(stats.priorityActions[0].dimensionId).toBe("high");
    expect(stats.priorityActions[1].dimensionId).toBe("mid");
    expect(stats.priorityActions[2].dimensionId).toBe("low");
    expect(stats.priorityActions.length).toBeLessThanOrEqual(6);
  });

  it("favors low-effort actions when weight × deficit ties", () => {
    const dims = [
      dim({ id: "x", weight: 2, target: 80, score: 60, nextActions: [action("slow", "slow", "1hr")] }),
      dim({ id: "y", weight: 2, target: 80, score: 60, nextActions: [action("fast", "fast", "5min")] }),
    ];
    const stats = computeStats(dims);
    expect(stats.priorityActions[0].id).toBe("fast");
  });

  it("bubbles a prerequisite action ahead of its dependent", () => {
    const dims = [
      dim({
        id: "scheduled",
        weight: 2,
        target: 80,
        score: 30,
        nextActions: [action("loop-babysit", "loop", "15min", ["auto-mode-on"])],
      }),
      dim({
        id: "permissions",
        weight: 3,
        target: 85,
        score: 50,
        nextActions: [action("auto-mode-on", "turn on auto mode", "5min")],
      }),
    ];
    const stats = computeStats(dims);
    const ids = stats.priorityActions.map((a) => a.id);
    expect(ids.indexOf("auto-mode-on")).toBeLessThan(ids.indexOf("loop-babysit"));
  });

  it("excludes dimensions already at or above target", () => {
    const dims = [
      dim({ id: "done", target: 80, score: 80, nextActions: [action("a")] }),
      dim({ id: "exceeds", target: 70, score: 90, nextActions: [action("b")] }),
      dim({ id: "behind", target: 80, score: 50, nextActions: [action("c")] }),
    ];
    const stats = computeStats(dims);
    expect(stats.priorityActions.map((a) => a.dimensionId)).toEqual(["behind"]);
  });

  it("flattens multiple nextActions per dimension", () => {
    const dims = [
      dim({ id: "x", target: 90, score: 30, nextActions: [action("a1"), action("a2"), action("a3")] }),
    ];
    const stats = computeStats(dims);
    expect(stats.priorityActions).toHaveLength(3);
    expect(stats.priorityActions.map((a) => a.id).sort()).toEqual(["a1", "a2", "a3"]);
  });
});
