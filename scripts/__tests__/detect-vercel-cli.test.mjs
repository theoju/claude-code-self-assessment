import { describe, it, expect, vi } from "vitest";
import { detectVercelCli } from "../signals.mjs";

describe("detectVercelCli", () => {
  it("returns false when execFile rejects (vercel not installed)", async () => {
    const fakeExec = vi.fn().mockRejectedValue(new Error("ENOENT"));
    expect(await detectVercelCli({ execFile: fakeExec })).toBe(false);
  });

  it("returns true when execFile resolves with a path", async () => {
    const fakeExec = vi
      .fn()
      .mockResolvedValue({ stdout: "/usr/local/bin/vercel\n", stderr: "" });
    expect(await detectVercelCli({ execFile: fakeExec })).toBe(true);
  });

  it("returns false when stdout is empty (which printed nothing)", async () => {
    const fakeExec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    expect(await detectVercelCli({ execFile: fakeExec })).toBe(false);
  });

  it("returns false when stdout is whitespace-only", async () => {
    const fakeExec = vi.fn().mockResolvedValue({ stdout: "  \n", stderr: "" });
    expect(await detectVercelCli({ execFile: fakeExec })).toBe(false);
  });
});
