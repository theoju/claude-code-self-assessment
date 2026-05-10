import { describe, it, expect } from "vitest";
import { detectRemoteControl } from "../signals.mjs";

describe("detectRemoteControl", () => {
  it("returns false for null/undefined config", () => {
    expect(detectRemoteControl(null)).toBe(false);
    expect(detectRemoteControl(undefined)).toBe(false);
  });

  it("returns false for empty config", () => {
    expect(detectRemoteControl({})).toBe(false);
  });

  it("returns true when hasUsedRemoteControl is strictly true", () => {
    expect(detectRemoteControl({ hasUsedRemoteControl: true })).toBe(true);
  });

  it("rejects non-strict-true values (defensive)", () => {
    expect(detectRemoteControl({ hasUsedRemoteControl: 1 })).toBe(false);
    expect(detectRemoteControl({ hasUsedRemoteControl: "true" })).toBe(false);
    expect(detectRemoteControl({ hasUsedRemoteControl: false })).toBe(false);
  });

  it("ignores unrelated cliConfig fields", () => {
    expect(detectRemoteControl({ claudeInChromeDefaultEnabled: true })).toBe(
      false,
    );
  });
});
