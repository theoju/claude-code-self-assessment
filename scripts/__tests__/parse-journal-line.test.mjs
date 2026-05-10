import { describe, it, expect } from "vitest";
import { parseJournalLine } from "../signals.mjs";

describe("parseJournalLine", () => {
  it("returns null on empty string", () => {
    expect(parseJournalLine("")).toBeNull();
    expect(parseJournalLine("   ")).toBeNull();
  });

  it("returns null on non-JSON", () => {
    expect(parseJournalLine("not json")).toBeNull();
    expect(parseJournalLine("{ broken")).toBeNull();
  });

  it("parses a stage entry", () => {
    const line = `{"ts":"2026-05-10T02:49:41Z","stage":2,"kind":"verify","summary":"x"}`;
    expect(parseJournalLine(line)).toEqual({
      ts: "2026-05-10T02:49:41Z",
      stage: 2,
      kind: "verify",
      summary: "x",
    });
  });

  it("parses a shipped outcome entry", () => {
    const line = `{"ts":"2026-05-10T02:49:41Z","outcome":"shipped","pr":42}`;
    expect(parseJournalLine(line)).toEqual({
      ts: "2026-05-10T02:49:41Z",
      outcome: "shipped",
      pr: 42,
    });
  });

  it("returns null on JSON that isn't an object", () => {
    expect(parseJournalLine("123")).toBeNull();
    expect(parseJournalLine('"a string"')).toBeNull();
    expect(parseJournalLine("[1,2,3]")).toBeNull();
  });
});
