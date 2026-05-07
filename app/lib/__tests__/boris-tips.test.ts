import { describe, it, expect } from "vitest";
import { borisTipLink, parseBorisTipList } from "../boris-tips";

describe("borisTipLink", () => {
  it("resolves a known section to internal /tips/N URL plus the Vol/tab hint", () => {
    const t = borisTipLink(7);
    expect(t.unknown).toBe(false);
    expect(t.url).toBe("/tips/7");
    expect(t.externalUrl).toBe("https://howborisusesclaudecode.com");
    expect(t.topic).toBe("Hooks");
    expect(t.where).toBe("Vol 1 → hooks");
  });

  it("handles all sections referenced by the rubric (no unknowns)", async () => {
    const rubric = (await import("../../data/rubric.json")).default as {
      dimensions: Array<{ borisTips: string; nextActions: Array<{ action: string }> }>;
    };
    const tipNumbers = new Set<number>();
    for (const d of rubric.dimensions) {
      parseBorisTipList(d.borisTips).forEach((t) => tipNumbers.add(t.n));
      // Also catch "Boris tip N" mentions in nextActions
      for (const a of d.nextActions) {
        for (const m of a.action.matchAll(/Boris tip\s+(\d+)/gi)) {
          tipNumbers.add(parseInt(m[1]!, 10));
        }
      }
    }
    expect(tipNumbers.size).toBeGreaterThan(30);
    const unknowns = [...tipNumbers].filter((n) => borisTipLink(n).unknown);
    expect(unknowns).toEqual([]);
  });

  it("returns a graceful fallback for an unknown section", () => {
    const t = borisTipLink(999);
    expect(t.unknown).toBe(true);
    expect(t.url).toBe("https://howborisusesclaudecode.com");
    expect(t.externalUrl).toBe("https://howborisusesclaudecode.com");
    expect(t.where).toMatch(/howborisusesclaudecode/);
  });
});

describe("parseBorisTipList", () => {
  it("parses a CSV and skips junk", () => {
    const tips = parseBorisTipList(" 5, 7 ,  abc, 14");
    expect(tips.map((t) => t.n)).toEqual([5, 7, 14]);
    expect(tips[0].topic).toBe("Skills & Slash Commands");
  });

  it("returns empty for empty input", () => {
    expect(parseBorisTipList("")).toEqual([]);
  });
});
