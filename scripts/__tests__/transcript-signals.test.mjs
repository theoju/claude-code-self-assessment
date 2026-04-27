import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gatherTranscriptSignals } from "../transcript-signals.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_HOME = join(HERE, "_fixtures", "transcripts");

describe("gatherTranscriptSignals", () => {
  it("aggregates tool-use, plan-mode, multi-file, and ship/verify ratios across sessions", async () => {
    // Long window so the fixture mtimes always fall inside it.
    const out = await gatherTranscriptSignals({ days: 36500, root: FIXTURE_HOME });
    expect(out.sessions).toBe(3);

    // Per-tool aggregates roll up across all sessions.
    expect(out.toolCounts.Edit).toBeGreaterThanOrEqual(3);
    expect(out.toolCounts.Read).toBeGreaterThanOrEqual(9);
    expect(out.toolCounts.Bash).toBeGreaterThanOrEqual(4);

    // Agent dispatches only counted from the auto-long session.
    expect(out.agentDispatches).toBe(2);

    // Plan mode used in 1 session.
    expect(out.planModeSessions).toBe(1);

    // Auto + ≥10 turns true only for the auto-long session.
    expect(out.autoModeLongSessions).toBe(1);

    // bypassPermissions true only for proj-b session.
    expect(out.bypassPermSessions).toBe(1);

    // Multi-file sessions: plan-multi (3 files) + auto-long (0 files) = 1.
    expect(out.multiFileSessions).toBe(1);
    expect(out.multiFilePlanRate).toBe(1); // the only multi-file session was planned

    // Ship/verify: plan-multi (npm test + git commit) and auto-long (vitest + git push)
    // both count as ship+verify; bypass session has commit but no verify.
    expect(out.shipSessions).toBe(3);
    expect(out.shipVerifyRate).toBeCloseTo(2 / 3, 1);
  });

  it("reads ~/.claude/hook-fires.jsonl and only counts fires within the window", async () => {
    const recent = await gatherTranscriptSignals({ days: 365, root: FIXTURE_HOME });
    expect(recent.hookFires).toBe(3);
    expect(recent.hookFiresByEvent.PostToolUse).toBe(2);
    expect(recent.hookFiresByEvent.Stop).toBe(1);

    const ancient = await gatherTranscriptSignals({ days: 36500, root: FIXTURE_HOME });
    expect(ancient.hookFires).toBe(4);
  });

  it("returns zero counters when the projects dir is missing", async () => {
    const out = await gatherTranscriptSignals({
      days: 30,
      root: "/no/such/path/should/never/exist",
    });
    expect(out.sessions).toBe(0);
    expect(out.agentDispatches).toBe(0);
    expect(out.hookFires).toBe(0);
  });

  it("skips malformed JSONL lines without crashing", async () => {
    // proj-b has a non-JSON line; the test in the first case passing already
    // proves we kept going. This re-asserts the count is what we expect.
    const out = await gatherTranscriptSignals({ days: 36500, root: FIXTURE_HOME });
    expect(out.sessions).toBe(3);
  });
});
