import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatherShellAliases } from "../signals.mjs";

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "shell-rc-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("gatherShellAliases", () => {
  it("returns 0 when no rc files exist", async () => {
    const r = await gatherShellAliases({
      rcPaths: [join(dir, "missing.zshrc"), join(dir, "missing.bashrc")],
    });
    expect(r).toEqual({ worktreeAliasCount: 0 });
  });

  it("counts za, zb, zc aliases", async () => {
    writeFileSync(
      join(dir, ".zshrc"),
      [
        "# my zshrc",
        'alias za="cd ~/repo/.worktrees/a"',
        'alias zb="cd ~/repo/.worktrees/b"',
        'alias zc="cd ~/repo/.worktrees/c"',
      ].join("\n"),
    );
    const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
    expect(r.worktreeAliasCount).toBe(3);
  });

  it("ignores unrelated aliases", async () => {
    writeFileSync(
      join(dir, ".zshrc"),
      ['alias ll="ls -la"', 'alias za="cd a"', 'alias gst="git status"'].join(
        "\n",
      ),
    );
    const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
    expect(r.worktreeAliasCount).toBe(1);
  });

  it("dedupes across multiple rc files (zshrc + bashrc both define za)", async () => {
    writeFileSync(join(dir, ".zshrc"), 'alias za="cd a"\nalias zb="cd b"');
    writeFileSync(join(dir, ".bashrc"), 'alias za="cd a"');
    const r = await gatherShellAliases({
      rcPaths: [join(dir, ".zshrc"), join(dir, ".bashrc")],
    });
    expect(r.worktreeAliasCount).toBe(2);
  });

  it("matches with leading whitespace and tab indentation", async () => {
    writeFileSync(
      join(dir, ".zshrc"),
      ["  alias za='cd a'", "\talias zb='cd b'"].join("\n"),
    );
    const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
    expect(r.worktreeAliasCount).toBe(2);
  });
});
