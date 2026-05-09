import { describe, it, expect } from "vitest";
import { detectStopHookNotification } from "../signals.mjs";

function hooks(stopEntries) {
  return { Stop: stopEntries };
}

describe("detectStopHookNotification", () => {
  it("returns false when hooks is undefined or empty", () => {
    expect(detectStopHookNotification(undefined)).toBe(false);
    expect(detectStopHookNotification(null)).toBe(false);
    expect(detectStopHookNotification({})).toBe(false);
    expect(detectStopHookNotification({ Stop: [] })).toBe(false);
  });

  it("matches the canonical user setup: osascript display notification", () => {
    expect(
      detectStopHookNotification(
        hooks([
          {
            hooks: [
              {
                type: "command",
                command:
                  'osascript -e \'display notification "Claude finished" with title "Claude Code" sound name "Glass"\' >/dev/null 2>&1 || true',
              },
            ],
          },
        ]),
      ),
    ).toBe(true);
  });

  it("matches notify-send (Linux), terminal-notifier, and bare `say`", () => {
    expect(
      detectStopHookNotification(
        hooks([{ hooks: [{ command: "notify-send 'Claude' 'finished'" }] }]),
      ),
    ).toBe(true);
    expect(
      detectStopHookNotification(
        hooks([
          {
            hooks: [
              { command: "terminal-notifier -message done -title Claude" },
            ],
          },
        ]),
      ),
    ).toBe(true);
    expect(
      detectStopHookNotification(
        hooks([{ hooks: [{ command: "say 'Claude is done'" }] }]),
      ),
    ).toBe(true);
  });

  it("matches the generic 'notification' token (shell wrappers)", () => {
    expect(
      detectStopHookNotification(
        hooks([
          { hooks: [{ command: "bash ~/.claude/hooks/notification.sh" }] },
        ]),
      ),
    ).toBe(true);
  });

  it("does NOT match a non-notification Stop hook (verify-only)", () => {
    expect(
      detectStopHookNotification(
        hooks([
          { hooks: [{ command: "bash ~/.claude/hooks/stop-verify.sh" }] },
        ]),
      ),
    ).toBe(false);
    expect(
      detectStopHookNotification(
        hooks([{ hooks: [{ command: "echo 'stopped'" }] }]),
      ),
    ).toBe(false);
  });

  it("does NOT match `say` substrings like `essay` or `gateway`", () => {
    expect(
      detectStopHookNotification(
        hooks([{ hooks: [{ command: "node essay-builder.js" }] }]),
      ),
    ).toBe(false);
    expect(
      detectStopHookNotification(
        hooks([{ hooks: [{ command: "curl gateway.example.com" }] }]),
      ),
    ).toBe(false);
  });

  it("matches if ANY entry/command qualifies (mixed Stop hook chain)", () => {
    expect(
      detectStopHookNotification(
        hooks([
          { hooks: [{ command: "bash stop-verify.sh" }] },
          {
            hooks: [
              { command: "osascript -e 'display notification \"done\"'" },
            ],
          },
        ]),
      ),
    ).toBe(true);
  });

  it("ignores non-Stop events even with matching commands", () => {
    expect(
      detectStopHookNotification({
        PostToolUse: [{ hooks: [{ command: "notify-send done" }] }],
      }),
    ).toBe(false);
  });

  it("handles malformed entries gracefully", () => {
    expect(detectStopHookNotification(hooks([{}]))).toBe(false);
    expect(detectStopHookNotification(hooks([{ hooks: [{}] }]))).toBe(false);
    expect(
      detectStopHookNotification(hooks([{ hooks: [{ command: null }] }])),
    ).toBe(false);
  });
});
