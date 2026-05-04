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
    rubricArea: "test",
    borisTips: "1",
    nextActions: [],
    score,
    tier: "developing",
    trend: "flat",
    evidence: [],
    gaps: [],
    summary: "",
    executionScore: null,
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
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 300 300");
  });
});
