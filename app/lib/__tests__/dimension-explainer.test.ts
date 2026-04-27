import { describe, it, expect } from "vitest";
import { EXPLAINERS, explainerFor, plusTenPath } from "../dimension-explainer";
import type { Dimension } from "../assessment";

function dim(overrides: Partial<Dimension> = {}): Dimension {
  return {
    id: "x",
    title: "Test",
    weight: 1,
    target: 80,
    rubricArea: "test",
    borisTips: "1",
    nextActions: [],
    score: 50,
    tier: "developing",
    trend: "flat",
    evidence: [],
    gaps: [],
    summary: "",
    ...overrides,
  };
}

describe("EXPLAINERS coverage", () => {
  it("covers every dimension id used by the rubric", async () => {
    const rubric = (await import("../../data/rubric.json")).default as {
      dimensions: Array<{ id: string }>;
    };
    for (const d of rubric.dimensions) {
      expect(EXPLAINERS[d.id], `missing explainer for ${d.id}`).toBeTruthy();
    }
  });

  it("each explainer has at least one formula term and a what-it-measures blurb", () => {
    for (const [id, e] of Object.entries(EXPLAINERS)) {
      expect(e.what.length, `what blurb missing on ${id}`).toBeGreaterThan(20);
      expect(e.formula.length, `no formula terms on ${id}`).toBeGreaterThan(0);
    }
  });
});

describe("explainerFor", () => {
  it("returns the explainer for a known id", () => {
    expect(explainerFor("automation")?.id).toBe("automation");
  });
  it("returns null for an unknown id", () => {
    expect(explainerFor("not-a-real-dimension")).toBeNull();
  });
});

describe("plusTenPath", () => {
  it("returns null when there are no nextActions", () => {
    expect(plusTenPath(dim({ nextActions: [] }))).toBeNull();
  });

  it("prefers the lowest-effort action that has no prerequisites", () => {
    const d = dim({
      nextActions: [
        { id: "slow", action: "slow thing", effort: "1hr" },
        { id: "fast", action: "fast thing", effort: "5min" },
        { id: "blocked", action: "blocked thing", effort: "5min", requires: ["fast"] },
      ],
    });
    expect(plusTenPath(d)?.step).toBe("fast thing");
  });

  it("falls back to the first when every action has a prerequisite", () => {
    const d = dim({
      nextActions: [
        { id: "a", action: "needs auto", effort: "1hr", requires: ["auto"] },
        { id: "b", action: "needs prep", effort: "5min", requires: ["prep"] },
      ],
    });
    expect(plusTenPath(d)?.step).toBe("needs prep");
  });
});
