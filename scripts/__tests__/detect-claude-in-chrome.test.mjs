import { describe, it, expect } from "vitest";
import { detectClaudeInChrome } from "../signals.mjs";

describe("detectClaudeInChrome", () => {
  it("returns false when cliConfig is undefined or null", () => {
    expect(detectClaudeInChrome(undefined)).toBe(false);
    expect(detectClaudeInChrome(null)).toBe(false);
  });

  it("returns false when no chrome flags are set", () => {
    expect(detectClaudeInChrome({})).toBe(false);
    expect(detectClaudeInChrome({ unrelated: true })).toBe(false);
  });

  it("returns true when claudeInChromeDefaultEnabled is true", () => {
    expect(detectClaudeInChrome({ claudeInChromeDefaultEnabled: true })).toBe(
      true,
    );
  });

  it("requires explicit true (not truthy strings/numbers)", () => {
    expect(detectClaudeInChrome({ claudeInChromeDefaultEnabled: 1 })).toBe(
      false,
    );
    expect(detectClaudeInChrome({ claudeInChromeDefaultEnabled: "true" })).toBe(
      false,
    );
  });

  it("ignores cachedChromeExtensionInstalled alone (extension cache != enabled)", () => {
    expect(detectClaudeInChrome({ cachedChromeExtensionInstalled: true })).toBe(
      false,
    );
  });

  it("ignores hasCompletedClaudeInChromeOnboarding alone (onboarded != enabled)", () => {
    expect(
      detectClaudeInChrome({ hasCompletedClaudeInChromeOnboarding: true }),
    ).toBe(false);
  });
});
