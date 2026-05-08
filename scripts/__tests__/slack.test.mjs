import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildSlackMessage, postToSlack } from "../slack.mjs";
import { makeAssessment, makeRubric } from "./_fixtures.mjs";

const config = {
  user: { displayName: "Engineer" },
  slack: { channel: "#self-assessment", username: "Self-Assessment", iconEmoji: ":chart:" },
  publish: { publicUrl: "http://localhost:3737" },
};

describe("buildSlackMessage", () => {
  it("includes header, overall block, and dashboard link", () => {
    const msg = buildSlackMessage(makeAssessment(), makeRubric(), config);
    expect(msg.channel).toBe("#self-assessment");
    expect(msg.username).toBe("Self-Assessment");
    const types = msg.blocks.map((b) => b.type);
    expect(types[0]).toBe("header");
    expect(types).toContain("section");
    expect(types).toContain("actions");
    const action = msg.blocks.at(-1);
    expect(action.elements[0].url).toBe("http://localhost:3737");
  });

  it("renders Platform Setup and Execution as two separate axes (never collapsed)", () => {
    const msg = buildSlackMessage(makeAssessment(), makeRubric(), config);
    const flat = JSON.stringify(msg.blocks);
    expect(flat).toMatch(/Platform Setup/);
    expect(flat).toMatch(/Execution/);
    expect(flat).not.toMatch(/\*Overall\*/);
    expect(msg.text).toMatch(/Platform 60\/100/);
    expect(msg.text).toMatch(/Execution 50\/100/);
  });

  it("shows Execution as unmeasured when executionOverall is missing", () => {
    const a = makeAssessment();
    delete a.executionOverall;
    const msg = buildSlackMessage(a, makeRubric(), config);
    const flat = JSON.stringify(msg.blocks);
    expect(flat).toMatch(/_unmeasured_/);
    expect(msg.text).not.toMatch(/Execution/);
  });

  it("renders the Δ between Platform and Execution when nonzero", () => {
    const a = makeAssessment({ overall: 80, executionOverall: 62 });
    const msg = buildSlackMessage(a, makeRubric(), config);
    const flat = JSON.stringify(msg.blocks);
    expect(flat).toMatch(/Δ \+18/);
  });

  it("surfaces strengths only when score >= 80", () => {
    const a = makeAssessment();
    a.scores[0].score = 90; // strength
    a.scores[1].score = 75; // not a strength
    const msg = buildSlackMessage(a, makeRubric(), config);
    const flat = JSON.stringify(msg.blocks);
    expect(flat).toMatch(/Strengths/);
    expect(flat).toMatch(/Automation/);
  });

  it("orders top gaps by weight × deficit", () => {
    const a = makeAssessment();
    // Float every other score above gap threshold so only the two we set are gap candidates.
    a.scores.forEach((s) => {
      s.score = s.target; // no gap
    });
    // automation: weight 3, target 90, score 30 → gap 60, leverage 180 (TOP gap)
    a.scores.find((s) => s.id === "automation").score = 30;
    // memory: weight 3, target 92, score 60 → gap 32, leverage 96 (second)
    a.scores.find((s) => s.id === "memory").score = 60;
    // remote: weight 1, target 75, score 0 → gap 75, leverage 75 (third)
    a.scores.find((s) => s.id === "remote").score = 0;

    const msg = buildSlackMessage(a, makeRubric(), config);
    const gapsBlock = msg.blocks.find(
      (b) => b?.text?.text && /Biggest gaps/.test(b.text.text),
    );
    expect(gapsBlock).toBeTruthy();
    const text = gapsBlock.text.text;
    const automationIdx = text.indexOf("Automation");
    const memoryIdx = text.indexOf("Memory");
    const remoteIdx = text.indexOf("Remote");
    expect(automationIdx).toBeGreaterThan(0);
    expect(memoryIdx).toBeGreaterThan(automationIdx);
    expect(remoteIdx).toBeGreaterThan(memoryIdx);
  });

  it("falls back to default url and engineer name", () => {
    const msg = buildSlackMessage(
      makeAssessment({ user: null }),
      makeRubric(),
      {
        slack: {},
        user: {},
      },
    );
    expect(msg.text).toMatch(/Engineer/);
    const action = msg.blocks.at(-1);
    expect(action.elements[0].url).toBe("http://localhost:3737");
  });

  it("omits Biggest gaps when every score is at/above 80 (post-normalization)", () => {
    // After per-dim normalization, a score is a "gap" when it's <= 80 (deficit
    // >= 20 against the universal target of 100). All scores here are >= 90,
    // so no gaps qualify. Strengths still appear because >= 80 = strength.
    const rubric = {
      dimensions: [
        { id: "a", title: "A", weight: 1, target: 70 },
        { id: "b", title: "B", weight: 1, target: 75 },
        { id: "c", title: "C", weight: 1, target: 70 },
      ],
    };
    const a = {
      capturedAt: "2026-04-25T07:15:00.000Z",
      overall: 92,
      targetOverall: 100,
      user: "Engineer",
      scores: [
        {
          id: "a",
          score: 90,
          rawScore: 63,
          tier: "advanced",
          target: 100,
          rawTarget: 70,
          weight: 1,
        },
        {
          id: "b",
          score: 95,
          rawScore: 71,
          tier: "advanced",
          target: 100,
          rawTarget: 75,
          weight: 1,
        },
        {
          id: "c",
          score: 92,
          rawScore: 64,
          tier: "advanced",
          target: 100,
          rawTarget: 70,
          weight: 1,
        },
      ],
      trends: { a: "flat", b: "flat", c: "flat" },
    };
    const msg = buildSlackMessage(a, rubric, config);
    const flat = JSON.stringify(msg.blocks);
    expect(flat).toMatch(/Strengths/);
    expect(flat).not.toMatch(/Biggest gaps/);
  });
});

describe("postToSlack", () => {
  let originalFetch;
  let originalEnv;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.SLACK_WEBHOOK_URL;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.SLACK_WEBHOOK_URL;
    else process.env.SLACK_WEBHOOK_URL = originalEnv;
  });

  it("returns posted:false when webhook is not set", async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const res = await postToSlack({ text: "hi" });
    expect(res).toEqual({ posted: false, reason: "SLACK_WEBHOOK_URL not set" });
  });

  it("returns posted:true on a 200 response", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/X";
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200 }));
    const res = await postToSlack({ text: "hi" });
    expect(res).toEqual({ posted: true });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe("https://hooks.slack.com/services/X");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ text: "hi" });
  });

  it("returns posted:false with status text on failure", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/services/X";
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "invalid_payload",
    }));
    const res = await postToSlack({ text: "hi" });
    expect(res.posted).toBe(false);
    expect(res.reason).toMatch(/400/);
    expect(res.reason).toMatch(/invalid_payload/);
  });
});
