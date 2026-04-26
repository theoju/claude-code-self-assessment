import { describe, it, expect } from "vitest";
import {
  borisTipLink,
  parseBorisTipList,
  formatTipsForSlack,
} from "../boris-tips.mjs";

describe("scripts/boris-tips.mjs", () => {
  it("borisTipLink: resolves a known section", () => {
    const t = borisTipLink(42);
    expect(t.unknown).toBe(false);
    expect(t.url).toBe("/tips/42");
    expect(t.externalUrl).toBe("https://howborisusesclaudecode.com");
    expect(t.topic).toBe("Auto Mode");
    expect(t.where).toBe("Vol 10 → auto mode");
  });

  it("borisTipLink: graceful fallback for unknown", () => {
    expect(borisTipLink(0).unknown).toBe(true);
  });

  it("parseBorisTipList: handles CSV", () => {
    const tips = parseBorisTipList("1, 14, 73");
    expect(tips.map((t) => t.n)).toEqual([1, 14, 73]);
  });

  it("formatTipsForSlack: emits Slack mrkdwn links to the dashboard tips route", () => {
    const out = formatTipsForSlack("7, 24", "http://localhost:3737");
    expect(out).toBe(
      "<http://localhost:3737/tips/7|§7> <http://localhost:3737/tips/24|§24>"
    );
  });

  it("formatTipsForSlack: empty input", () => {
    expect(formatTipsForSlack("", "http://localhost:3737")).toBe("");
    expect(formatTipsForSlack(undefined, "http://localhost:3737")).toBe("");
  });
});
