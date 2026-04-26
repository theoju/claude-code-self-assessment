// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import ClaudeMdHealth from "../ClaudeMdHealth";
import type { ClaudeMdReport } from "@/app/lib/assessment";

function makeReport(partial: Partial<ClaudeMdReport> = {}): ClaudeMdReport {
  return {
    mode: "report-only",
    auditedAt: "2026-04-25T07:15:00.000Z",
    summary: {
      targets: 3,
      targetsScored: 2,
      targetsMissing: 1,
      targetsError: 0,
      files: 3,
      avgScore: 78,
      avgGrade: "B",
      distribution: { A: 1, B: 1, C: 1, D: 0, F: 0 },
      avgBreakdown: {
        commands: 19,
        architecture: 16,
        patterns: 15,
        conciseness: 12,
        currency: 11,
        actionability: 15,
      },
    },
    runs: [
      {
        name: "alpha",
        path: "/private/alpha",
        score: 92,
        grade: "A",
        files: [
          {
            path: "CLAUDE.md",
            score: 92,
            grade: "A",
            lineCount: 120,
            ageDays: 4,
            breakdown: {
              commands: 20,
              architecture: 20,
              patterns: 15,
              conciseness: 15,
              currency: 15,
              actionability: 7,
            },
            issues: [],
          },
        ],
      },
      {
        name: "beta",
        path: "/private/beta",
        score: 64,
        grade: "C",
        files: [
          {
            path: "CLAUDE.md",
            score: 64,
            grade: "C",
            lineCount: 80,
            ageDays: 45,
            breakdown: {
              commands: 14,
              architecture: 10,
              patterns: 5,
              conciseness: 15,
              currency: 10,
              actionability: 10,
            },
            issues: ["patterns: no Gotchas/Notes section"],
          },
        ],
      },
      {
        name: "gamma",
        path: "/private/gamma",
        score: null,
        grade: "F",
        missing: true,
        files: [],
      },
    ],
    ...partial,
  };
}

describe("ClaudeMdHealth", () => {
  it("renders the aggregate score, grade, and counts", () => {
    const { getByText, getAllByText } = render(<ClaudeMdHealth report={makeReport()} />);
    expect(getByText("CLAUDE.md health")).toBeTruthy();
    // Aggregate score
    expect(getByText("78")).toBeTruthy();
    // Stats labels
    expect(getByText("Targets")).toBeTruthy();
    expect(getByText("Files")).toBeTruthy();
    expect(getByText("No CLAUDE.md")).toBeTruthy();
    // Distribution legend renders all five letters (some also appear elsewhere — multi-match)
    for (const g of ["A", "B", "C", "D", "F"]) {
      expect(getAllByText(g).length).toBeGreaterThan(0);
    }
  });

  it("does not show the error stat when there are no errors", () => {
    const r = makeReport();
    r.summary.targetsError = 0;
    const { queryByText } = render(<ClaudeMdHealth report={r} />);
    expect(queryByText("Errors")).toBeNull();
  });

  it("renders per-target detail rows including missing/error states", () => {
    const { getByText, container } = render(<ClaudeMdHealth report={makeReport()} />);
    expect(getByText("alpha")).toBeTruthy();
    expect(getByText("beta")).toBeTruthy();
    expect(getByText("gamma")).toBeTruthy();
    expect(getByText("no CLAUDE.md found")).toBeTruthy();
    // "Per-target detail (3)" toggle present
    expect(container.textContent).toMatch(/Per-target detail \(3\)/);
  });

  it("renders the criterion breakdown with labels and scores", () => {
    const { getByText } = render(<ClaudeMdHealth report={makeReport()} />);
    expect(getByText("Criterion breakdown")).toBeTruthy();
    expect(getByText("Commands/workflows")).toBeTruthy();
    expect(getByText("Architecture clarity")).toBeTruthy();
    expect(getByText("Non-obvious patterns")).toBeTruthy();
    expect(getByText("Conciseness")).toBeTruthy();
    expect(getByText("Currency")).toBeTruthy();
    expect(getByText("Actionability")).toBeTruthy();
    expect(getByText("19/20")).toBeTruthy();
    expect(getByText("16/20")).toBeTruthy();
    expect(getByText("12/15")).toBeTruthy();
    expect(getByText("11/15")).toBeTruthy();
  });

  it("renders gracefully when nothing is scoreable", () => {
    const r = makeReport({
      summary: {
        targets: 1,
        targetsScored: 0,
        targetsMissing: 1,
        targetsError: 0,
        files: 0,
        avgScore: null,
        avgGrade: null,
        distribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
        avgBreakdown: null,
      },
      runs: [
        { name: "only", path: "/x", score: null, grade: "F", missing: true, files: [] },
      ],
    });
    const { getByText, container } = render(<ClaudeMdHealth report={r} />);
    expect(getByText("—")).toBeTruthy();
    // No grade distribution bars shown when total is 0
    const bars = container.querySelectorAll('[title^="A:"], [title^="B:"], [title^="C:"], [title^="D:"], [title^="F:"]');
    expect(bars.length).toBe(0);
  });
});
