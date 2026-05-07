import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPLAINERS, explainerFor, plusTenPath } from "../dimension-explainer";
import type { Dimension } from "../assessment";

function dim(overrides: Partial<Dimension> = {}): Dimension {
  return {
    id: "automation",
    title: "Automation",
    weight: 3,
    target: 90,
    rawTarget: 90,
    rubricArea: "x",
    borisTips: "1",
    nextActions: ["First action — Boris tip 1", "Second action — Boris tip 2"],
    score: 30,
    rawScore: 30,
    tier: "starter",
    evidence: [],
    gaps: [],
    executionScore: null,
    executionRawScore: null,
    executionEvidence: [],
    executionGaps: [],
    gapReason: null,
    trend: "flat",
    summary: "stub",
    ...overrides,
  };
}

describe("explainerFor", () => {
  it("returns null for an unknown id", () => {
    expect(explainerFor("nope")).toBeNull();
  });

  it("returns the EXPLAINERS entry for a known id", () => {
    const e = explainerFor("automation");
    expect(e).not.toBeNull();
    expect(e!.id).toBe("automation");
    expect(e!.formula.length).toBeGreaterThan(0);
  });
});

describe("plusTenPath", () => {
  it("returns null when there are no next actions", () => {
    expect(plusTenPath(dim({ nextActions: [] }))).toBeNull();
  });

  it("uses the first next action as the +10 step", () => {
    const path = plusTenPath(dim());
    expect(path).not.toBeNull();
    expect(path!.step).toBe("First action — Boris tip 1");
  });
});

describe("EXPLAINERS coverage vs rubric", () => {
  it("has an entry for every dimension id in app/data/rubric.json", () => {
    const rubric = JSON.parse(
      readFileSync(join(process.cwd(), "app/data/rubric.json"), "utf8"),
    ) as { dimensions: Array<{ id: string }> };
    const missing = rubric.dimensions
      .map((d) => d.id)
      .filter((id) => !(id in EXPLAINERS));
    expect(missing).toEqual([]);
  });
});
