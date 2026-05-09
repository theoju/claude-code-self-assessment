import { describe, it, expect } from "vitest";
import { detectConfigMilestones, _DETECTORS } from "../config-progression.mjs";

const NOW = "2026-05-09T08:00:00.000Z";
const LATER = "2026-05-15T08:00:00.000Z";

const noSignals = {
  hasStopHook: false,
  hasPostToolHook: false,
  allowListCount: 0,
  hasWildcardAllow: false,
  claudeMdExists: false,
  plugins: 0,
  effortLevel: "medium",
  autoCompactWindow: null,
};

const allSignals = {
  hasStopHook: true,
  hasPostToolHook: true,
  allowListCount: 38,
  hasWildcardAllow: true,
  claudeMdExists: true,
  plugins: 33,
  effortLevel: "high",
  autoCompactWindow: "400000",
};

describe("detectConfigMilestones", () => {
  it("emits no milestones when nothing is satisfied", () => {
    const r = detectConfigMilestones({
      signalsSummary: noSignals,
      priorState: {},
      now: NOW,
    });
    expect(r.milestones).toEqual([]);
    expect(r.state).toEqual({});
  });

  it("records firstSeenAt for every newly-satisfied detector", () => {
    const r = detectConfigMilestones({
      signalsSummary: allSignals,
      priorState: {},
      now: NOW,
    });
    expect(r.milestones).toHaveLength(_DETECTORS.length);
    for (const d of _DETECTORS) {
      expect(r.state[d.id]).toEqual({ firstSeenAt: NOW });
    }
    for (const m of r.milestones) {
      expect(m.timestamp).toBe(NOW);
      expect(m.source).toBe("config");
      expect(m.sessionId).toMatch(/^config:/);
    }
  });

  it("preserves prior firstSeenAt across runs (does not move milestone forward)", () => {
    const prior = {
      "stop-hook": { firstSeenAt: "2026-04-01T00:00:00.000Z" },
    };
    const r = detectConfigMilestones({
      signalsSummary: allSignals,
      priorState: prior,
      now: LATER,
    });
    const stopHook = r.milestones.find(
      (m) => m.sessionId === "config:stop-hook",
    );
    expect(stopHook.timestamp).toBe("2026-04-01T00:00:00.000Z");
    expect(r.state["stop-hook"].firstSeenAt).toBe("2026-04-01T00:00:00.000Z");
  });

  it("preserves milestone after the underlying signal reverts to false", () => {
    const prior = {
      "wildcard-allow": { firstSeenAt: "2026-04-01T00:00:00.000Z" },
    };
    const r = detectConfigMilestones({
      signalsSummary: { ...noSignals }, // wildcard-allow no longer true
      priorState: prior,
      now: LATER,
    });
    const wildcard = r.milestones.find(
      (m) => m.sessionId === "config:wildcard-allow",
    );
    expect(wildcard).toBeDefined();
    expect(wildcard.timestamp).toBe("2026-04-01T00:00:00.000Z");
  });

  it("allowlist threshold is exactly 10", () => {
    const just9 = detectConfigMilestones({
      signalsSummary: { ...noSignals, allowListCount: 9 },
      priorState: {},
      now: NOW,
    });
    expect(
      just9.milestones.find((m) => m.sessionId === "config:allowlist-tuned"),
    ).toBeUndefined();

    const just10 = detectConfigMilestones({
      signalsSummary: { ...noSignals, allowListCount: 10 },
      priorState: {},
      now: NOW,
    });
    expect(
      just10.milestones.find((m) => m.sessionId === "config:allowlist-tuned"),
    ).toBeDefined();
  });

  it("effort upgrade fires for high|xhigh|max but not medium|low|unknown", () => {
    for (const lvl of ["high", "xhigh", "max"]) {
      const r = detectConfigMilestones({
        signalsSummary: { ...noSignals, effortLevel: lvl },
        priorState: {},
        now: NOW,
      });
      expect(
        r.milestones.find((m) => m.sessionId === "config:effort-upgraded"),
      ).toBeDefined();
    }
    for (const lvl of ["medium", "low", "unknown"]) {
      const r = detectConfigMilestones({
        signalsSummary: { ...noSignals, effortLevel: lvl },
        priorState: {},
        now: NOW,
      });
      expect(
        r.milestones.find((m) => m.sessionId === "config:effort-upgraded"),
      ).toBeUndefined();
    }
  });

  it("uses synthetic stable sessionId for React keys", () => {
    const r = detectConfigMilestones({
      signalsSummary: allSignals,
      priorState: {},
      now: NOW,
    });
    const ids = r.milestones.map((m) => m.sessionId);
    expect(new Set(ids).size).toBe(ids.length); // all unique
    for (const id of ids) expect(id).toMatch(/^config:/);
  });

  it("evidence string contains the live signal value when relevant", () => {
    const r = detectConfigMilestones({
      signalsSummary: { ...allSignals, allowListCount: 42 },
      priorState: {},
      now: NOW,
    });
    const allowlist = r.milestones.find(
      (m) => m.sessionId === "config:allowlist-tuned",
    );
    expect(allowlist.evidence).toContain("42");
  });
});
