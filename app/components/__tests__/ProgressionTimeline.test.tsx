// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ProgressionTimeline from "../ProgressionTimeline";
import type { Milestone, Progression } from "@/app/lib/progression";

function milestone(over: Partial<Milestone> = {}): Milestone {
  return {
    timestamp: "2026-04-01T12:00:00.000Z",
    dimension: "parallel",
    milestone: "Started using subagents",
    borisTip: 1,
    evidence: "First Task-agent session",
    sessionId: "abc",
    ...over,
  };
}

function pg(milestones: Milestone[]): Progression {
  return {
    capturedAt: "2026-05-04T00:00:00.000Z",
    lookbackDays: null,
    sessionsWalked: 200,
    transcriptsScanned: false,
    milestones,
  };
}

describe("ProgressionTimeline", () => {
  it("renders the empty state when no milestones detected", () => {
    const { container } = render(<ProgressionTimeline progression={pg([])} />);
    expect(container.textContent).toMatch(/No behavioral milestones/);
  });

  it("renders one row per milestone with date, title, evidence, and tip link", () => {
    const r = render(
      <ProgressionTimeline
        progression={pg([
          milestone({ timestamp: "2026-03-21T00:00:00.000Z" }),
          milestone({
            timestamp: "2026-04-07T00:00:00.000Z",
            milestone: "First MCP-powered session",
            borisTip: 9,
            dimension: "integrations",
          }),
        ])}
      />,
    );
    expect(r.container.querySelectorAll("li").length).toBe(2);
    expect(screen.getByText("Started using subagents")).toBeTruthy();
    expect(screen.getByText("First MCP-powered session")).toBeTruthy();
    expect(screen.getByText(/Boris tip 1/)).toBeTruthy();
    expect(screen.getByText(/Boris tip 9/)).toBeTruthy();
    expect(r.container.textContent).toContain("2026-03-21");
    expect(r.container.textContent).toContain("2026-04-07");
  });

  it("sorts milestones chronologically even if input is reversed", () => {
    const r = render(
      <ProgressionTimeline
        progression={pg([
          milestone({ timestamp: "2026-04-07T00:00:00.000Z", milestone: "Late" }),
          milestone({ timestamp: "2026-03-21T00:00:00.000Z", milestone: "Early" }),
        ])}
      />,
    );
    const items = r.container.querySelectorAll("li");
    expect(items[0].textContent).toContain("Early");
    expect(items[1].textContent).toContain("Late");
  });
});
