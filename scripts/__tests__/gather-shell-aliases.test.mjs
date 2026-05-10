import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
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
    expect(r).toEqual({ worktreeAliasCount: 0, worktreeShortcutCount: 0 });
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
    // All three reference .worktrees/ so the broad count also picks them up.
    expect(r.worktreeShortcutCount).toBe(3);
  });

  it("ignores unrelated aliases", async () => {
    writeFileSync(
      join(dir, ".zshrc"),
      ['alias ll="ls -la"', 'alias za="cd a"', 'alias gst="git status"'].join(
        "\n",
      ),
    );
    const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
    // Strict count keys off Boris za/zb/zc name regardless of body.
    expect(r.worktreeAliasCount).toBe(1);
    // Broad count requires worktree-ish body — `cd a` has none.
    expect(r.worktreeShortcutCount).toBe(0);
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

  // V1.1 broadening — match worktree-shortcut aliases by RHS, not just by
  // za/zb/zc name; match shell-function form; scan additional config files.
  describe("worktreeShortcutCount (V1.1)", () => {
    it("matches non-Boris-named aliases whose single-quoted RHS references .worktrees/", async () => {
      writeFileSync(
        join(dir, ".zshrc"),
        "alias wt-a='cd ~/.worktrees/a && claude'",
      );
      const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
      expect(r.worktreeAliasCount).toBe(0);
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("matches double-quoted RHS referencing .worktrees/", async () => {
      writeFileSync(
        join(dir, ".zshrc"),
        'alias claude-1="cd ~/.worktrees/b && claude"',
      );
      const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("matches alias body that mentions 'git worktree'", async () => {
      writeFileSync(
        join(dir, ".zshrc"),
        "alias newwt='git worktree add ../wt-$1'",
      );
      const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("matches shell-function form: wt() { cd ~/.worktrees/$1 && claude; }", async () => {
      writeFileSync(
        join(dir, ".zshrc"),
        "wt() { cd ~/.worktrees/$1 && claude; }",
      );
      const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("matches multi-line shell-function body referencing worktree", async () => {
      writeFileSync(
        join(dir, ".zshrc"),
        [
          "wt() {",
          "  local name=$1",
          "  cd ~/.worktrees/$name",
          "  claude",
          "}",
        ].join("\n"),
      );
      const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("does not double-count a strict-named worktree alias in the broad bucket", async () => {
      writeFileSync(
        join(dir, ".zshrc"),
        "alias za='cd ~/.worktrees/a && claude'",
      );
      const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
      expect(r.worktreeAliasCount).toBe(1);
      // za is also worktree-bodied, so the broad count includes it.
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("ignores trailing # comment that mentions worktree if RHS body does not", async () => {
      // Trailing-comment case: even though the line has the word, the
      // RHS body 'cd x' has no worktree reference. Per spec we strip the
      // comment before matching the body. So this should NOT count.
      writeFileSync(join(dir, ".zshrc"), "alias za='cd x' # worktree shortcut");
      const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
      // Strict still matches by name.
      expect(r.worktreeAliasCount).toBe(1);
      // Broad does not — body 'cd x' has no worktree reference.
      expect(r.worktreeShortcutCount).toBe(0);
    });

    it("reads ~/.zprofile in addition to ~/.zshrc when home is injected", async () => {
      writeFileSync(join(dir, ".zshrc"), 'alias gst="git status"');
      writeFileSync(
        join(dir, ".zprofile"),
        "alias deepwork='cd ~/.worktrees/main && claude'",
      );
      const r = await gatherShellAliases({ home: dir });
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("scans ~/.zshrc.d/* fragment files when home is injected", async () => {
      mkdirSync(join(dir, ".zshrc.d"));
      writeFileSync(
        join(dir, ".zshrc.d", "worktrees.zsh"),
        "alias wta='cd ~/.worktrees/a && claude'",
      );
      const r = await gatherShellAliases({ home: dir });
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("indented alias inside a sourced fragment still matches", async () => {
      mkdirSync(join(dir, ".zshrc.d"));
      writeFileSync(
        join(dir, ".zshrc.d", "fragment.zsh"),
        "    alias wta='cd ~/.worktrees/a && claude'",
      );
      const r = await gatherShellAliases({ home: dir });
      expect(r.worktreeShortcutCount).toBe(1);
    });

    it("strict and broad counts diverge for non-Boris-named aliases", async () => {
      writeFileSync(
        join(dir, ".zshrc"),
        [
          "alias za='cd ~/.worktrees/a'",
          "alias wt-foo='cd ~/.worktrees/foo'",
          "alias wt-bar='cd ~/.worktrees/bar'",
        ].join("\n"),
      );
      const r = await gatherShellAliases({ rcPaths: [join(dir, ".zshrc")] });
      expect(r.worktreeAliasCount).toBe(1); // only za
      expect(r.worktreeShortcutCount).toBe(3); // all three reference worktrees
    });
  });
});
