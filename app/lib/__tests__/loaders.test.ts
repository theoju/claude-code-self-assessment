import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readJson } from "../_read-json";
import { pctTone } from "../coverage";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "loaders-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("readJson", () => {
  it("returns parsed JSON when file is valid", async () => {
    const path = join(tmpDir, "ok.json");
    writeFileSync(path, '{"a":1}');
    expect(await readJson<{ a: number }>(path)).toEqual({ a: 1 });
  });

  it("returns null when file does not exist (fail-soft)", async () => {
    expect(await readJson(join(tmpDir, "missing.json"))).toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    const path = join(tmpDir, "broken.json");
    writeFileSync(path, "{not valid");
    expect(await readJson(path)).toBeNull();
  });

  it("preserves nested array/object shape via generic", async () => {
    const path = join(tmpDir, "nested.json");
    writeFileSync(path, JSON.stringify({ items: [{ id: 1 }, { id: 2 }] }));
    type T = { items: { id: number }[] };
    const r = await readJson<T>(path);
    expect(r?.items[1].id).toBe(2);
  });
});

describe("pctTone", () => {
  it("returns 'good' at or above target", () => {
    expect(pctTone(80, 80)).toBe("good");
    expect(pctTone(95, 80)).toBe("good");
  });

  it("returns 'warn' between 75% of target and target", () => {
    expect(pctTone(60, 80)).toBe("warn"); // 60 / 80 = 75%
    expect(pctTone(70, 80)).toBe("warn");
    expect(pctTone(79, 80)).toBe("warn");
  });

  it("returns 'bad' below 75% of target", () => {
    expect(pctTone(59, 80)).toBe("bad");
    expect(pctTone(0, 80)).toBe("bad");
  });

  it("respects different target thresholds", () => {
    expect(pctTone(95, 95)).toBe("good");
    // 95 * 0.75 = 71.25 — anything ≥ 71.25 is 'warn', below is 'bad'.
    expect(pctTone(72, 95)).toBe("warn");
    expect(pctTone(71, 95)).toBe("bad");
  });
});

describe("loadInsightsNarrative", () => {
  // The exported function reads from a hard-coded path
  // (app/data/insights-narrative.md). We can't easily redirect it without
  // refactoring, so we use vi.doMock + dynamic import to swap the module's
  // path computation.
  it("returns null when narrative file is missing", async () => {
    vi.resetModules();
    const realCwd = process.cwd();
    const fakeRoot = mkdtempSync(join(tmpdir(), "narr-cwd-"));
    mkdirSync(join(fakeRoot, "app", "data"), { recursive: true });
    process.chdir(fakeRoot);
    try {
      const mod = await import("../insights-narrative");
      const r = await mod.loadInsightsNarrative();
      expect(r).toBeNull();
    } finally {
      process.chdir(realCwd);
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  it("returns body+capturedAt when narrative file exists with content", async () => {
    vi.resetModules();
    const realCwd = process.cwd();
    const fakeRoot = mkdtempSync(join(tmpdir(), "narr-cwd-"));
    mkdirSync(join(fakeRoot, "app", "data"), { recursive: true });
    writeFileSync(
      join(fakeRoot, "app", "data", "insights-narrative.md"),
      "# Insights\n\nbody",
    );
    process.chdir(fakeRoot);
    try {
      const mod = await import("../insights-narrative");
      const r = await mod.loadInsightsNarrative();
      expect(r?.body).toContain("Insights");
      expect(typeof r?.capturedAt).toBe("string");
    } finally {
      process.chdir(realCwd);
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  it("returns null for empty narrative file (whitespace only)", async () => {
    vi.resetModules();
    const realCwd = process.cwd();
    const fakeRoot = mkdtempSync(join(tmpdir(), "narr-cwd-"));
    mkdirSync(join(fakeRoot, "app", "data"), { recursive: true });
    writeFileSync(
      join(fakeRoot, "app", "data", "insights-narrative.md"),
      "   \n\n\t",
    );
    process.chdir(fakeRoot);
    try {
      const mod = await import("../insights-narrative");
      const r = await mod.loadInsightsNarrative();
      expect(r).toBeNull();
    } finally {
      process.chdir(realCwd);
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });
});

describe("detectInsightsReportFile", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.CLAUDE_HOME;
  });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CLAUDE_HOME;
    else process.env.CLAUDE_HOME = originalEnv;
  });

  it("returns null when report.html is absent", async () => {
    vi.resetModules();
    process.env.CLAUDE_HOME = tmpDir;
    const mod = await import("../insights-narrative");
    expect(mod.detectInsightsReportFile()).toBeNull();
  });

  it("returns capturedAt+byteSize when report.html is present", async () => {
    vi.resetModules();
    const reportDir = join(tmpDir, "usage-data");
    mkdirSync(reportDir, { recursive: true });
    const reportPath = join(reportDir, "report.html");
    writeFileSync(reportPath, "<html>hi</html>");
    process.env.CLAUDE_HOME = tmpDir;

    const mod = await import("../insights-narrative");
    const r = mod.detectInsightsReportFile();
    expect(r?.byteSize).toBeGreaterThan(0);
    expect(typeof r?.capturedAt).toBe("string");
  });
});

describe("loadCoverage", () => {
  // loadCoverage reads from app/data/{coverage,coverage-history}.json relative
  // to process.cwd(). We use the same chdir trick as loadInsightsNarrative.
  it("returns null latest + [] history when neither file exists", async () => {
    vi.resetModules();
    const realCwd = process.cwd();
    const fakeRoot = mkdtempSync(join(tmpdir(), "cov-cwd-"));
    mkdirSync(join(fakeRoot, "app", "data"), { recursive: true });
    process.chdir(fakeRoot);
    try {
      const mod = await import("../coverage");
      const r = await mod.loadCoverage();
      expect(r.latest).toBeNull();
      expect(r.history).toEqual([]);
    } finally {
      process.chdir(realCwd);
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });

  it("history is capped at 30 entries (rolling window)", async () => {
    vi.resetModules();
    const realCwd = process.cwd();
    const fakeRoot = mkdtempSync(join(tmpdir(), "cov-cwd-"));
    mkdirSync(join(fakeRoot, "app", "data"), { recursive: true });
    const big = Array.from({ length: 50 }, (_, i) => ({
      capturedAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
    }));
    writeFileSync(
      join(fakeRoot, "app", "data", "coverage-history.json"),
      JSON.stringify(big),
    );
    process.chdir(fakeRoot);
    try {
      const mod = await import("../coverage");
      const r = await mod.loadCoverage();
      expect(r.history.length).toBe(30);
      // Confirms slice(-30) — we get the LAST 30, not the first 30.
      expect(r.history[0].capturedAt).toBe("2026-01-21T00:00:00Z");
    } finally {
      process.chdir(realCwd);
      rmSync(fakeRoot, { recursive: true, force: true });
    }
  });
});
