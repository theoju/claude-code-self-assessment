import { describe, it, expect } from "vitest";
import {
  tierFor,
  tierColor,
  tierLabel,
  trendGlyph,
  computeStats,
  evaluatePredicate,
  type Dimension,
} from "../assessment";

function dim(overrides: Partial<Dimension> = {}): Dimension {
  return {
    id: "x",
    title: "Test",
    weight: 1,
    target: 80,
    rawTarget: 80,
    rubricArea: "test",
    borisTips: "1",
    nextActions: [{ id: "do-thing", action: "do thing", effort: "5min" }],
    score: 50,
    rawScore: 50,
    tier: "developing",
    trend: "flat",
    evidence: [],
    gaps: [],
    summary: "",
    executionScore: null,
    executionRawScore: null,
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
    for (const t of [
      "not-touched",
      "starter",
      "developing",
      "solid",
      "advanced",
    ] as const) {
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
    expect(trendGlyph(trend as "improving" | "slipping" | "flat" | "new")).toBe(
      glyph,
    );
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
      dim({
        id: "low",
        weight: 1,
        target: 80,
        score: 70,
        nextActions: [{ id: "small", action: "small", effort: "5min" }],
      }),
      dim({
        id: "high",
        weight: 3,
        target: 90,
        score: 30,
        nextActions: [{ id: "big", action: "big", effort: "5min" }],
      }),
      dim({
        id: "mid",
        weight: 2,
        target: 80,
        score: 60,
        nextActions: [{ id: "mid", action: "mid", effort: "5min" }],
      }),
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
      dim({
        id: "done",
        target: 80,
        score: 80,
        nextActions: [{ id: "x", action: "x", effort: "5min" }],
      }),
      dim({
        id: "exceeds",
        target: 70,
        score: 90,
        nextActions: [{ id: "y", action: "y", effort: "5min" }],
      }),
      dim({
        id: "behind",
        target: 80,
        score: 50,
        nextActions: [{ id: "z", action: "z", effort: "5min" }],
      }),
    ];
    const stats = computeStats(dims);
    expect(stats.priorityActions.map((a) => a.dimensionId)).toEqual(["behind"]);
  });

  it("flattens multiple nextActions per dimension", () => {
    const dims = [
      dim({
        id: "x",
        target: 90,
        score: 30,
        nextActions: [
          { id: "a1", action: "a1", effort: "5min" },
          { id: "a2", action: "a2", effort: "5min" },
          { id: "a3", action: "a3", effort: "5min" },
        ],
      }),
    ];
    const stats = computeStats(dims);
    expect(stats.priorityActions).toHaveLength(3);
    expect(stats.priorityActions.map((a) => a.action.action)).toEqual([
      "a1",
      "a2",
      "a3",
    ]);
  });

  it("filters out actions whose satisfied flag is true from priorityActions", () => {
    const dims = [
      dim({
        id: "x",
        target: 90,
        score: 30,
        nextActions: [
          {
            id: "done",
            action: "Already done",
            effort: "5min",
            satisfied: true,
          },
          { id: "open", action: "Still actionable", effort: "5min" },
        ],
      }),
    ];
    const stats = computeStats(dims);
    const ids = stats.priorityActions.map((a) => a.action.id);
    expect(ids).toContain("open");
    expect(ids).not.toContain("done");
  });
});

describe("evaluatePredicate", () => {
  const sig = {
    effortLevel: "xhigh",
    skipDangerous: false,
    autoCompactWindow: "400000",
    plugins: 12,
    nested: { count: 5, name: "ok" },
  };

  it("treats present truthy paths as true", () => {
    expect(evaluatePredicate("effortLevel", sig)).toBe(true);
    expect(evaluatePredicate("plugins", sig)).toBe(true);
    expect(evaluatePredicate("nested.count", sig)).toBe(true);
    expect(evaluatePredicate("nested.name", sig)).toBe(true);
  });

  it("treats absent or falsy paths as false", () => {
    expect(evaluatePredicate("missing", sig)).toBe(false);
    expect(evaluatePredicate("nested.missing", sig)).toBe(false);
    expect(evaluatePredicate("skipDangerous", sig)).toBe(false);
  });

  it("supports negation", () => {
    expect(evaluatePredicate("!skipDangerous", sig)).toBe(true);
    expect(evaluatePredicate("!effortLevel", sig)).toBe(false);
    expect(evaluatePredicate("!missing", sig)).toBe(true);
  });

  it("supports equality and alternation", () => {
    expect(evaluatePredicate("effortLevel=xhigh", sig)).toBe(true);
    expect(evaluatePredicate("effortLevel=max", sig)).toBe(false);
    expect(evaluatePredicate("effortLevel=xhigh|max", sig)).toBe(true);
    expect(evaluatePredicate("effortLevel=high|max", sig)).toBe(false);
    expect(evaluatePredicate("plugins=12", sig)).toBe(true);
  });

  it("supports inequality", () => {
    expect(evaluatePredicate("effortLevel!=high", sig)).toBe(true);
    expect(evaluatePredicate("effortLevel!=xhigh", sig)).toBe(false);
  });

  it("supports numeric comparisons", () => {
    expect(evaluatePredicate("plugins>10", sig)).toBe(true);
    expect(evaluatePredicate("plugins>12", sig)).toBe(false);
    expect(evaluatePredicate("plugins>=12", sig)).toBe(true);
    expect(evaluatePredicate("plugins<20", sig)).toBe(true);
    expect(evaluatePredicate("plugins<=12", sig)).toBe(true);
    expect(evaluatePredicate("nested.count>=5", sig)).toBe(true);
  });

  it("returns false for non-numeric LHS in numeric ops", () => {
    expect(evaluatePredicate("effortLevel>1", sig)).toBe(false);
  });

  it("supports AND via &", () => {
    expect(evaluatePredicate("!skipDangerous & plugins>0", sig)).toBe(true);
    expect(evaluatePredicate("!skipDangerous & plugins>100", sig)).toBe(false);
    expect(
      evaluatePredicate("effortLevel=xhigh & autoCompactWindow", sig),
    ).toBe(true);
  });

  // Array-regex operator (~): true when LHS is a string array AND any element
  // matches the RHS regex (case-insensitive). Added to predicate the
  // `learning/spaced-repetition-skill` action against the user's
  // personalSkills array without baking specific skill names into the rubric.
  // Falls back to false for non-array LHS or unparseable regex — never throws.
  it("supports array-regex via ~", () => {
    const arrSig = {
      personalSkills: ["self-assessment", "spaced-repetition-skill", "ship"],
      otherSkills: ["unrelated", "another"],
      empty: [],
      notArray: "ship",
    };
    expect(evaluatePredicate("personalSkills~spaced|repetition", arrSig)).toBe(
      true,
    );
    expect(evaluatePredicate("personalSkills~SPACED", arrSig)).toBe(true); // case-insensitive
    expect(evaluatePredicate("personalSkills~retain|recall", arrSig)).toBe(
      false,
    );
    expect(evaluatePredicate("otherSkills~spaced|repetition", arrSig)).toBe(
      false,
    );
    expect(evaluatePredicate("empty~anything", arrSig)).toBe(false);
    expect(evaluatePredicate("notArray~ship", arrSig)).toBe(false); // non-array LHS
    expect(evaluatePredicate("missing~anything", arrSig)).toBe(false);
  });

  it("array-regex composes with & like other operators", () => {
    const arrSig = {
      personalSkills: ["self-assessment", "spaced-repetition-skill"],
      effortLevel: "max",
    };
    expect(
      evaluatePredicate(
        "personalSkills~spaced|repetition & effortLevel=max",
        arrSig,
      ),
    ).toBe(true);
    expect(
      evaluatePredicate(
        "personalSkills~spaced|repetition & effortLevel=high",
        arrSig,
      ),
    ).toBe(false);
  });

  it("returns false for empty or malformed predicates", () => {
    expect(evaluatePredicate("", sig)).toBe(false);
    expect(evaluatePredicate("   ", sig)).toBe(false);
  });
});
