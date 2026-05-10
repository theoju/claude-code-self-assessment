# /ship Slash Command — Design Spec

> **For agentic workers:** REQUIRED NEXT STEP: invoke `superpowers:writing-plans` to turn this spec into an implementation plan. **Do not implement in this repo (`claude-extensions`).** The /ship command is a personal tool that lives in `~/.claude/`; the plan should be created and executed in the user's personal-tools workspace, not here.

**Goal:** Codify Theo's recurring shipping pattern as a personal `/ship` slash command at `~/.claude/commands/ship.md`. The command chains test → verify-agent → simplify → code-review → commit → push+PR → Jira-update, with sensible halt rules and silent skips when optional tooling is absent.

**Why now:** The dashboard's `/self-assessment` flagged `automation/ship-command` (Boris tip 5) as the highest-weighted unsatisfied next-action, and `/insights` recently reported the same closeout sequence repeating across nearly every feature_implementation session. Codifying it eliminates the redundant_polling and forgotten-step friction the report called out.

**Scope:** Personal slash command + supporting skill folder under `~/.claude/`. Not project-scoped, not committed to any product repo. Executes against whatever repo the terminal is currently in.

---

## Architecture

### Files

| Path                                             | Purpose                                                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.claude/commands/ship.md`                     | Thin slash-command file. YAML frontmatter (`description`, `argument-hint`, `allowed-tools`) + a short body that delegates to the skill. |
| `~/.claude/skills/ship/SKILL.md`                 | Hub. ~30 lines. Step list with file pointers.                                                                                           |
| `~/.claude/skills/ship/spokes/test-detection.md` | Package-manager / test-command lookup table + fallback rules.                                                                           |
| `~/.claude/skills/ship/spokes/jira-update.md`    | Jira detection regex, tool resolution order, transition logic, gotchas.                                                                 |
| `~/.claude/skills/ship/spokes/halt-rules.md`     | Halt-vs-prompt-vs-log matrix per step.                                                                                                  |

### Why hub + spokes

Per Thariq's skill-authoring playbook: a skill is a folder, not a file. The slash command stays small (it's loaded into every session). The skill hub points at spokes. Spokes get read on demand, when /ship is invoked. Tweaks to (e.g.) the test-detection table don't require touching the slash command file.

---

## Command surface

```
/ship [--no-simplify] [--draft] [--base <branch>] [--jira <KEY>] [-m "<msg>"] [--skip-tests]
```

| Flag              | Default       | Effect                                                                                                           |
| ----------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--no-simplify`   | off           | Skip step 3 (code-simplifier subagent). Use for hot-path bug fixes you don't want re-touched.                    |
| `--draft`         | off           | `gh pr create --draft`.                                                                                          |
| `--base <branch>` | `main`        | Override base branch for `gh pr create --base`.                                                                  |
| `--jira <KEY>`    | auto-detected | Override Jira key. Used when branch/commit don't carry the key, or to force-skip with `--jira none`.             |
| `-m "<msg>"`      | derived       | Override commit message subject. By default, /ship asks the user to confirm a derived message before committing. |
| `--skip-tests`    | off           | Skip step 1. Halts /ship if no test command was detected anyway; this flag turns the halt into a warn.           |

---

## Chain (8 stages)

```
0. Pre-flight ─── refuse on main; confirm on dirty tree; refuse if open PR exists
1. Test ───────── auto-detect: pnpm/bun/npm/pytest/cargo/go ─ halt on red
2. Verify-agent ─ feature-dev:code-reviewer on diff ─ halt on disagreement
3. Simplify ───── code-simplifier:code-simplifier on staged diff ─ apply non-controversial, surface contested
4. Code review ── superpowers:requesting-code-review skill on diff ─ halt Critical, prompt Important
5. Commit ─────── conventional commit + Co-Authored-By footer (HEREDOC for multi-line bodies)
6. Push + PR ──── gh pr create --base main; capture PR URL
7. Jira update ── if Jira key detected AND tooling available: post comment with PR URL + transition to In Review
                  silent skip otherwise
```

### Stage details

**0. Pre-flight**

- `git rev-parse --abbrev-ref HEAD` → if `main`/`master`/`trunk`, abort with "create a feature branch first."
- `git status --porcelain` → if non-empty AND no commits ahead of base, prompt "uncommitted changes detected; stage them all and proceed? (y/n)".
- `gh pr list --head $(current-branch) --json number` → if non-empty, abort with "PR already exists: #N. /ship only opens new PRs in v1."

**1. Test**

- Detection table (first match wins): `pnpm-lock.yaml` → `pnpm test`; `bun.lockb` → `bun test`; `package.json` → `npm test`; `pyproject.toml` AND (pytest in deps OR `pytest.ini` exists) → `pytest`; `Cargo.toml` → `cargo test`; `go.mod` → `go test ./...`; `Makefile` with a `test:` target → `make test`.
- No match → abort unless `--skip-tests` (then warn and continue).
- Stream output. Non-zero exit → halt with the failing summary.

**2. Verify-agent**

- Dispatch `feature-dev:code-reviewer` subagent with: (a) `git diff` against base, (b) the last 3 commit subjects on the branch, (c) the conversation context (a one-paragraph summary the user can edit before dispatch).
- Subagent answers: "does this diff fulfill the stated goal? Any obvious behavior gaps?"
- If subagent flags gaps → halt and surface them. User decides whether to fix or pass `--skip-verify` (deliberately _not_ added in v1; halt forces an explicit re-invocation).

**3. Simplify** _(skipped if `--no-simplify`)_

- Dispatch `code-simplifier:code-simplifier` subagent on the diff.
- Returned suggestions classified by /ship into:
  - **Auto-apply**: rename a local var, remove dead branch, collapse trivial wrapper. Apply silently, log.
  - **Surface**: anything touching public API, control flow, or types. Show diff hunk + reasoning, prompt user.
- Re-run step 1 (tests) after auto-applies, since simplification can break tests.

**4. Code review**

- Invoke `superpowers:requesting-code-review` skill on the diff (post-simplify state).
- Findings classified Critical / Important / Nice-to-have:
  - Critical → halt, surface findings, no auto-fix.
  - Important → prompt: "address now? (y/n/show)".
  - Nice-to-have → log to a session journal; do not interrupt.

**5. Commit**

- Stage all tracked changes (`git add -u` plus any untracked files explicitly mentioned in the diff context — never `git add -A`).
- Derive subject: `<type>(<scope>): <one-line summary>` from conversation context. Show derived message; user accepts/edits.
- Body: bullet summary of changes, with HEREDOC for multi-line. Always append a `Co-Authored-By:` footer. Model name resolved from `ANTHROPIC_MODEL` env if set, else from the session's known model display name, else fallback to literal `Claude <noreply@anthropic.com>`. Never silently omit the footer.
- Never `--amend`. Never `--no-verify`. If a pre-commit hook fails → halt, surface output, leave changes staged.

**6. Push + PR**

- `git push -u origin $(current-branch)`.
- `gh pr create --base $BASE` (default `main`, overridable).
- PR title = commit subject. PR body = a 2-bullet summary + a test-plan checklist (rendered from the test command that ran in step 1, plus a "verify in browser/CLI" reminder per Boris 14/73).
- Capture PR URL into a session variable for step 7.

**7. Jira update** _(silent skip if no Jira key OR no Jira tooling)_

**Detection** (first match wins):

1. `--jira <KEY>` flag (overrides everything; `--jira none` force-skips this step).
2. Current branch name regex: `[A-Z][A-Z0-9]+-\d+` (matches `ADIS-201`, `feat/ADIS-201-foo`, `bugfix/PROJ-42`).
3. Last commit message regex: same pattern.
4. None matched → log "No Jira key detected — skipping Jira update" and exit step.

**Tool resolution order** (first available wins):

1. Atlassian/Jira MCP server (check via `mcp__plugin_*jira*__*` tool availability in current session).
2. `jira` CLI (`which jira`).
3. Direct REST: requires `JIRA_BASE_URL` + `JIRA_API_TOKEN` env. Use `curl` + `Authorization: Bearer` (or basic auth `email:token` if `JIRA_API_EMAIL` is also set).
4. None available → log "Jira key ADIS-201 detected but no Jira tooling — skipping" and exit step (not a halt; PR is already opened).

**Action** (per design decision: comment + transition):

1. Post comment on the ticket:
   ```
   PR opened: <pr-url>
   <commit-subject-line>
   ```
2. Transition status to the value of `JIRA_REVIEW_TRANSITION` env (default: `"In Review"`). On unknown transition → log warning, leave status alone, comment still posted.

**Failure modes**: any Jira API failure logs but does not roll back the PR. The comment-then-transition order means if the comment succeeds and the transition fails, the user still has the link in the ticket.

**Privacy**: `JIRA_API_TOKEN` read only from env. Never logged. Never written to the session journal. The PR URL posted is the public GitHub URL (same data Jira's GitHub integration would post on its own).

---

## Halt-vs-prompt-vs-log matrix

| Stage          | Halt                  | Prompt                                                                     | Log only                                                 |
| -------------- | --------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
| 0 Pre-flight   | on main; PR exists    | dirty tree                                                                 | —                                                        |
| 1 Test         | tests fail            | `--skip-tests` flag absent + no test command (use flag to convert to warn) | —                                                        |
| 2 Verify-agent | agent says "no"       | —                                                                          | agent's "yes with caveats"                               |
| 3 Simplify     | —                     | contested suggestions                                                      | auto-applied changes                                     |
| 4 Code review  | Critical findings     | Important findings                                                         | Nice-to-have findings                                    |
| 5 Commit       | pre-commit hook fails | derived commit message confirmation                                        | —                                                        |
| 6 Push + PR    | gh push/create errors | —                                                                          | —                                                        |
| 7 Jira update  | —                     | —                                                                          | every outcome (success / no key / no tool / API failure) |

"Halt" means /ship exits non-zero. The user fixes the issue and re-invokes /ship. State is preserved (commits, staged changes) — /ship is idempotent on re-invocation as long as the chain hasn't completed.

---

## Out of scope (deliberately)

- CI watch / auto-merge / cleanup (chain stops at PR opened, per design decision)
- Jira "Done" transition (happens at merge, not at PR-opened)
- Jira ticket creation (you bring an existing ticket)
- Stacked PRs (`--base feat/parent` works for the gh-side, but /ship doesn't try to keep a stack of children retargeted)
- Worktree cleanup
- Multi-repo orchestration
- Slack/Discord notifications
- `--update` semantics for amending an existing PR

---

## Testing strategy

The implementation plan should include:

1. **Detection unit tests** — table-driven tests for the test-command-detection function. One row per supported package manager. Verify "no match" returns the correct fallback signal.
2. **Jira-key-detection unit tests** — branch names, commit messages, override flag, `--jira none` force-skip, multi-key collision behavior.
3. **Halt-rules table tests** — given a stage's outcome, assert which of {halt, prompt, log} fires.
4. **End-to-end smoke** — manual: invoke `/ship --draft` on a one-line README change in a scratch repo. Verify each stage runs in order, the PR opens as draft, the Jira step silently skips when no key is set.

---

## Success criteria

- `/ship` runs on the user's most-active repo (advanced-data-importer) and ships a one-line README change start-to-PR-opened in under 2 minutes (excluding subagent compute time).
- After installation, `/self-assessment` reports `automation/ship-command` as ✓ done (the `hasShipCommand` predicate already looks for `ship.md` in personal commands).
- The Jira step works on a real ADIS ticket: comment posted, status moved to In Review.
- No edits required to /ship for at least 30 days of regular use (changes go to spokes only).

---

## Open questions deferred to implementation

These are small enough to decide during the build:

1. **Subagent context window**: how much git diff to send to verify-agent / simplifier before truncating? Suggest ~2k lines max with a "diff truncated, full diff at <path>" footer.
2. **Auto-apply heuristic for simplifier**: pattern-match against the simplifier's structured output, or run a small classifier prompt? Try pattern-match first; classifier prompt only if false-positive rate is too high.
3. **Session journal location**: `~/.claude/ship-journal.jsonl` vs `${CLAUDE_PLUGIN_DATA}/ship/journal.jsonl`. Prefer the latter for upgrade-safety per Thariq's playbook.

---

## Where this plan executes

**Not in `claude-extensions`.** The /ship command is personal tooling that lives in `~/.claude/`. The implementation plan should be created and executed in the user's personal-tooling workspace (a clone or worktree dedicated to `~/.claude/` content, or directly against the home directory if the user prefers in-place authoring with manual git management).

This spec is preserved in `claude-extensions/docs/superpowers/specs/` as a brainstorming artifact only; it can be moved or referenced from the implementation workspace.
