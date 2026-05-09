import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { claudeHome, safeReadJson, safeReaddir } from "../_fs-utils.mjs";

let tmpDir;
let originalEnv;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "fs-utils-test-"));
  originalEnv = process.env.CLAUDE_HOME;
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalEnv === undefined) delete process.env.CLAUDE_HOME;
  else process.env.CLAUDE_HOME = originalEnv;
});

describe("claudeHome", () => {
  it("returns CLAUDE_HOME env var when set", () => {
    process.env.CLAUDE_HOME = "/some/test/path";
    expect(claudeHome()).toBe("/some/test/path");
  });

  it("falls back to ~/.claude when env var is unset", () => {
    delete process.env.CLAUDE_HOME;
    expect(claudeHome()).toMatch(/\.claude$/);
  });
});

describe("safeReadJson", () => {
  it("returns parsed JSON when file is valid", async () => {
    const path = join(tmpDir, "ok.json");
    writeFileSync(path, '{"a":1,"b":[2,3]}');
    expect(await safeReadJson(path)).toEqual({ a: 1, b: [2, 3] });
  });

  it("returns null when file does not exist", async () => {
    expect(await safeReadJson(join(tmpDir, "missing.json"))).toBeNull();
  });

  it("returns null when file is not valid JSON", async () => {
    const path = join(tmpDir, "broken.json");
    writeFileSync(path, "not valid {");
    expect(await safeReadJson(path)).toBeNull();
  });

  it("returns null when path is a directory", async () => {
    expect(await safeReadJson(tmpDir)).toBeNull();
  });
});

describe("safeReaddir", () => {
  it("returns directory entries when path exists", async () => {
    writeFileSync(join(tmpDir, "a.md"), "");
    writeFileSync(join(tmpDir, "b.md"), "");
    const entries = await safeReaddir(tmpDir);
    expect(entries.sort()).toEqual(["a.md", "b.md"]);
  });

  it("returns [] when directory does not exist", async () => {
    expect(await safeReaddir(join(tmpDir, "nope"))).toEqual([]);
  });

  it("returns [] when path is a regular file", async () => {
    const path = join(tmpDir, "file.txt");
    writeFileSync(path, "x");
    expect(await safeReaddir(path)).toEqual([]);
  });

  it("returns [] for empty directory", async () => {
    const empty = join(tmpDir, "empty");
    mkdirSync(empty);
    expect(await safeReaddir(empty)).toEqual([]);
  });
});
