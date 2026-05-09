// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RadarChart from "../RadarChart";
import type { Dimension } from "@/app/lib/assessment";

function dim(id: string, score: number, target = 90): Dimension {
  return {
    id,
    title: id,
    weight: 1,
    target,
    rawTarget: target,
    rubricArea: "test",
    borisTips: "1",
    nextActions: [],
    score,
    rawScore: score,
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
  };
}

describe("RadarChart", () => {
  it("renders an svg with concentric rings, radial lines, and two paths", () => {
    const dims = [dim("a", 60), dim("b", 70), dim("c", 80), dim("d", 50)];
    const { container } = render(<RadarChart dimensions={dims} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    // 5 ring circles + n score-point dots (radius 3)
    expect(container.querySelectorAll("circle").length).toBe(5 + dims.length);
    // n radial lines
    expect(container.querySelectorAll("line").length).toBe(dims.length);
    // 2 paths: target + score
    expect(container.querySelectorAll("path").length).toBe(2);
    // n labels
    expect(container.querySelectorAll("text").length).toBe(dims.length);
  });

  it("places the first vertex at the top (angle = -π/2) for a known input", () => {
    const dims = [dim("a", 100), dim("b", 0), dim("c", 0), dim("d", 0)];
    const { container } = render(<RadarChart dimensions={dims} size={500} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(2);
    const scorePath = paths[1].getAttribute("d") || "";
    // First M coordinate should be (cx, cy - radius) for the first dim at score 100
    // size 500 → cx=cy=250, radius=180 → first vertex ≈ (250.0, 70.0)
    expect(scorePath).toMatch(/^M250\.0,70\.0/);
  });

  it("respects custom size", () => {
    const dims = [dim("a", 50), dim("b", 50), dim("c", 50)];
    const { container } = render(<RadarChart dimensions={dims} size={300} />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 300 300",
    );
  });

  it("does not draw an execution polygon when showExecution is false (default)", () => {
    const dims = [
      { ...dim("a", 60), executionScore: 30 },
      { ...dim("b", 70), executionScore: 40 },
      { ...dim("c", 80), executionScore: 50 },
    ];
    const { container } = render(<RadarChart dimensions={dims} />);
    expect(container.querySelectorAll("path").length).toBe(2);
  });

  it("draws an execution polygon spanning only the dimensions with executionScore set", () => {
    const dims = [
      { ...dim("a", 60), executionScore: 30 },
      { ...dim("b", 70), executionScore: null },
      { ...dim("c", 80), executionScore: 40 },
      { ...dim("d", 50), executionScore: 20 },
    ];
    const { container } = render(
      <RadarChart dimensions={dims} showExecution />,
    );
    expect(container.querySelectorAll("path").length).toBe(3);
    const execPath = container.querySelectorAll("path")[2];
    expect(execPath.getAttribute("stroke-dasharray")).toBe("3 3");
    // 5 rings + 4 score dots + 3 execution dots (only measured vertices)
    expect(container.querySelectorAll("circle").length).toBe(5 + 4 + 3);
  });

  it("italicizes labels and appends a footnote marker for unmeasured-execution dims", () => {
    const dims = [
      { ...dim("a", 60), executionScore: 30 },
      { ...dim("b", 70), executionScore: null }, // unmeasured
      { ...dim("c", 80), executionScore: 40 },
      { ...dim("d", 50), executionScore: null }, // unmeasured
    ];
    const { container } = render(
      <RadarChart dimensions={dims} showExecution />,
    );
    const italicLabels = Array.from(container.querySelectorAll("text")).filter(
      (t) => t.getAttribute("font-style") === "italic",
    );
    expect(italicLabels.length).toBe(2);
    // Each italic label should contain the ¹ marker as a tspan.
    for (const t of italicLabels) {
      expect(t.querySelector("tspan")?.textContent).toBe("¹");
    }
    // Without showExecution, no italic markers regardless of executionScore.
    const { container: c2 } = render(<RadarChart dimensions={dims} />);
    expect(
      Array.from(c2.querySelectorAll("text")).filter(
        (t) => t.getAttribute("font-style") === "italic",
      ).length,
    ).toBe(0);
  });

  it("omits the execution polygon when fewer than 2 dimensions have an execution score", () => {
    const dims = [
      { ...dim("a", 60), executionScore: 30 },
      { ...dim("b", 70), executionScore: null },
      { ...dim("c", 80), executionScore: null },
    ];
    const { container } = render(
      <RadarChart dimensions={dims} showExecution />,
    );
    // Only 2 paths (target + score). 1 execution dot still drawn.
    expect(container.querySelectorAll("path").length).toBe(2);
    expect(container.querySelectorAll("circle").length).toBe(5 + 3 + 1);
  });
});
