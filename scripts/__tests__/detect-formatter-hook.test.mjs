import { describe, it, expect } from "vitest";
import { detectFormatterHook } from "../signals.mjs";

// Helper: build the hooks shape that ~/.claude/settings.json uses.
function hooks(postToolEntries) {
  return { PostToolUse: postToolEntries };
}

describe("detectFormatterHook", () => {
  it("returns false when hooks is undefined or empty", () => {
    expect(detectFormatterHook(undefined)).toBe(false);
    expect(detectFormatterHook(null)).toBe(false);
    expect(detectFormatterHook({})).toBe(false);
    expect(detectFormatterHook({ PostToolUse: [] })).toBe(false);
  });

  it("matches the canonical user setup: bash format-on-edit.sh on Edit|Write|MultiEdit", () => {
    const r = detectFormatterHook(
      hooks([
        {
          matcher: "Edit|Write|MultiEdit",
          hooks: [
            {
              type: "command",
              command: "bash ~/.claude/hooks/format-on-edit.sh",
            },
          ],
        },
      ]),
    );
    expect(r).toBe(true);
  });

  it("matches when matcher is a single tool name", () => {
    expect(
      detectFormatterHook(
        hooks([
          {
            matcher: "Edit",
            hooks: [
              {
                type: "command",
                command: "prettier --write $CLAUDE_FILE_PATHS",
              },
            ],
          },
        ]),
      ),
    ).toBe(true);
    expect(
      detectFormatterHook(
        hooks([
          {
            matcher: "Write",
            hooks: [{ type: "command", command: "ruff format" }],
          },
        ]),
      ),
    ).toBe(true);
  });

  it("matches all known formatter names individually", () => {
    const FORMATTERS = [
      "prettier --write file",
      "ruff format file",
      "gofmt -w file",
      "rustfmt file",
      "shfmt -w file",
      "rubocop -a file",
      "black file",
      "eslint --fix file",
    ];
    for (const cmd of FORMATTERS) {
      expect(
        detectFormatterHook(
          hooks([{ matcher: "Write", hooks: [{ command: cmd }] }]),
        ),
      ).toBe(true);
    }
  });

  it("matches the generic 'format' token (npm/bun/pnpm wrappers)", () => {
    expect(
      detectFormatterHook(
        hooks([{ matcher: "Edit", hooks: [{ command: "bun run format" }] }]),
      ),
    ).toBe(true);
    expect(
      detectFormatterHook(
        hooks([{ matcher: "Edit", hooks: [{ command: "npm run format" }] }]),
      ),
    ).toBe(true);
  });

  it("does NOT match when matcher excludes Edit and Write", () => {
    expect(
      detectFormatterHook(
        hooks([
          { matcher: "Bash", hooks: [{ command: "prettier --write file" }] },
        ]),
      ),
    ).toBe(false);
    expect(
      detectFormatterHook(
        hooks([
          {
            matcher: "TaskCreate",
            hooks: [{ command: "echo formatting" }],
          },
        ]),
      ),
    ).toBe(false);
  });

  it("does NOT match when command lacks a formatter token", () => {
    expect(
      detectFormatterHook(
        hooks([
          {
            matcher: "Edit|Write",
            hooks: [{ command: "echo 'edit happened'" }],
          },
        ]),
      ),
    ).toBe(false);
    expect(
      detectFormatterHook(
        hooks([
          {
            matcher: "Edit|Write",
            hooks: [{ command: "logger -t claude 'edit'" }],
          },
        ]),
      ),
    ).toBe(false);
  });

  it("does NOT spuriously match 'transformer' or 'unformat' substrings", () => {
    // \bformat\b boundary — these should not trigger formatter detection.
    expect(
      detectFormatterHook(
        hooks([
          { matcher: "Edit", hooks: [{ command: "node ./transformer.js" }] },
        ]),
      ),
    ).toBe(false);
    expect(
      detectFormatterHook(
        hooks([
          { matcher: "Edit", hooks: [{ command: "echo 'unformatted'" }] },
        ]),
      ),
    ).toBe(false);
  });

  it("matches if ANY of multiple commands in the entry is a formatter", () => {
    const r = detectFormatterHook(
      hooks([
        {
          matcher: "Edit|Write",
          hooks: [
            { command: "echo 'a non-formatter hook'" },
            { command: "bash ~/.claude/hooks/lint-on-edit.sh" },
            { command: "bash ~/.claude/hooks/format-on-edit.sh" },
          ],
        },
      ]),
    );
    expect(r).toBe(true);
  });

  it("matches if ANY of multiple PostToolUse entries qualifies", () => {
    const r = detectFormatterHook(
      hooks([
        { matcher: "Bash", hooks: [{ command: "echo 'unrelated'" }] },
        { matcher: "Edit", hooks: [{ command: "prettier --write" }] },
      ]),
    );
    expect(r).toBe(true);
  });

  it("ignores non-PostToolUse events even with matching matcher+command", () => {
    // PreToolUse with prettier should NOT count — the action is specifically
    // about *post*-edit formatting feedback.
    expect(
      detectFormatterHook({
        PreToolUse: [
          { matcher: "Edit", hooks: [{ command: "prettier --check" }] },
        ],
      }),
    ).toBe(false);
  });

  it("handles malformed entries gracefully (missing fields)", () => {
    expect(detectFormatterHook(hooks([{}]))).toBe(false);
    expect(detectFormatterHook(hooks([{ matcher: "Edit" }]))).toBe(false);
    expect(detectFormatterHook(hooks([{ matcher: "Edit", hooks: [{}] }]))).toBe(
      false,
    );
    expect(
      detectFormatterHook(
        hooks([{ matcher: "Edit", hooks: [{ command: null }] }]),
      ),
    ).toBe(false);
  });
});
