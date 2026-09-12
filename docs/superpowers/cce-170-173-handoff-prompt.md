# Handoff prompt — CCE-170/171/172/173 (paste into a fresh session)

Open the session with cwd `~/Projects/engineering-docs-agent`, then paste
everything below the rule.

---

Work four tickets in this repo: **CCE-171**, **CCE-173**, **CCE-170**, and
conditionally **CCE-172**. All four are in Jira project `CCE` at
`designitright.atlassian.net`. Read each ticket before starting it — the
descriptions carry verified evidence (file:line, measured counts) that this
prompt only summarises.

**Why this arrives as a prompt rather than an edit:** they were filed from a
session rooted in `claude-extensions`, which cannot write to this repo. A
native `permissions.deny` rule fences cross-repo writes after an incident where
three session roots mutated this repo concurrently between 2026-08-07 and
2026-08-22 (12 files written from more than one root). Reads work; writes do
not. Background:
`claude-code-self-assessment/docs/superpowers/retrospectives/2026-08-26-repo-fence-postmortem.md`.

**The order below is load-bearing. Do not reorder it.**

## 1. CCE-171 finding 1 — unguarded OSError in the blocking citation loop

Do this first. Smallest diff, largest risk reduction, and the fix already
exists one module away.

`check_path` in `scripts/lint/citation_exists.py:511-527` loops over citations
calling `_relativize` then `_resolves`, with no `OSError` guard. One
pathological token — an over-long path inside backticks — raises out of the
whole function. `_REPO_PATH_RE` constrains token _shape_ but not _length_.

The identical defect was already fixed in the diagnostic at
`scripts/citation_repair.py:355`, where a per-citation `except OSError` was
added in CCE-141 round 6 after a real failure. Its comment records the
mechanism: pathlib re-raises OSError for errno values outside its ignored set,
ENAMETOOLONG among them. Copy that shape.

This one matters more than where it was fixed: `citation_exists` is the
**blocking** rule, not the advisory diagnostic.

Watch out — the file _does_ handle OSError at `:377`, `:501`, `:549`, `:596`
and `:621`, which makes the gap easy to miss. `:501` guards only
`path.read_text()`; the citation loop starts after it.

## 2. CCE-171 findings 2 and 3

Same file, same session, after finding 1 lands.

**Finding 2 — bare filenames are never checked.** `_REPO_PATH_RE`
(`scripts/lint/citation_exists.py:39-41`) requires a directory separator, so
`README.md` and `orchestrator_runner.py:128` never enter `cites["paths"]`. The
file's own comment on `_LINE_PIN_RE` (`:47-48`) calls bare filenames "the worst
offenders — unlinted AND drifting". Pick one of the three options on the ticket
and make the choice explicit in the rule's user-facing description, not only in
a comment.

**Finding 3 — verify before fixing.** `_relativize` (`:245-253`) returns
non-absolute tokens unchanged, and `_REPO_PATH_RE`'s character class admits
`..`. Both verified. What was **not** verified is the downstream join in
`_resolves` — only its docstring was read, not its body. Read the body first.
If `_resolves` already normalises, this finding evaporates; say so on the
ticket and move on.

## 3. CCE-173 — the run cap recovers state by string-matching its own output

`_diagnose_citation_paths` in `scripts/orchestrator_runner.py:1711-1716` counts
how many findings the run has emitted by matching digest lines against the
literal `"citation_shortening_suspected: "` — the same string its own writer
formats at `:1733`. The cap's state lives only inside its rendered prose.

Rename the prefix in one place and the bound in the other silently stops
firing, with nothing failing. `add_partial` also dedupes identical strings, so
two pages producing the same line collapse and the count under-reports.

Fix: keep the count as data. Increment a field on `state["current_run"]` (e.g.
`citation_findings_emitted`) as findings are written, and read that for `room`.

**Test-quality warning, and it applies to the test you write.** The original
run-cap test asserted only on `citation_shortening_suspected` lines. That
cannot observe the early `return`'s real job — `shown` is already empty when
`room` is 0, so the finding lines vanish either way, and a mutation removing
the `return` survived. Assert on the count that feeds `room`, never on the
rendered output.

## 4. CCE-170 — the gitignore invariant that only holds here

`scripts/state_io.py:219-220` says the `current_run.json` sibling "is gitignored
(see .gitignore) and not part of the merge-as-promotion path — only state.json
is committed." True in this repo (`.gitignore:221`). False on hosts, which do
not inherit that file: in host `claude-code-self-assessment`,
`git check-ignore` exits 1, the file is tracked, and 23 commits have touched
it. `_stage_docs_run_changes` (`scripts/orchestrator_runner.py:3782`) stages
with `git add -A .`, which commits it.

Apply option 1 (correct the docstring) **and** option 2 (have `setup_scaffold`
add the entry to the host's `.gitignore` at onboarding). Note that
`_stage_docs_run_changes`'s own docstring already reasons carefully about hosts
that do and do not gitignore `.docs-agent-plugin/` (CCE-70, CCE-75) — the same
host-vs-agent split, never applied to `current_run.json`.

The latent `checkout_failed` consequence described on the ticket has **never**
fired on that host. Do not describe it as an outage in the PR.

## CCE-172 — do NOT start yet

Its own first step is to read what the CCE-141 diagnostic has already
collected, before touching `agents/page-author.md`. Two reasons to hold:

1. Editing the agent without that data means guessing at _why_ it shortens
   paths — the exact move that produced the repair withdrawn from CCE-141 after
   four Critical review findings.
2. It depends on CCE-171 finding 2. If bare-filename citations are never
   checked, some shortening is invisible to the block rule and the diagnostic's
   sample is biased.

Do CCE-171 first, let the diagnostic accumulate, then open CCE-172.

Background: CCE-141 shipped detection only. `agents/page-author.md` was never
modified — its last change is `0c88411` (CCE-137, PR #209), and PR #241 does
not appear in its history. The acceptance criteria were not skipped by
oversight; there was nothing to regression-test.

## Rules for all four

- One PR per ticket. Reference the key in the title, per this repo's
  convention. **Open the PRs; do not merge any of them without asking me.**
- Work on branches in the main checkout; do **not** create a worktree. Four
  sequential tickets, three of them sharing one file — a worktree buys no
  isolation here and reintroduces the `gh pr merge --delete-branch` trap
  (it fails mid-cleanup when `main` is checked out in the parent, leaving the
  remote branch alive and local main un-fast-forwarded). A worktree also sits
  outside the absolute-path `permissions.deny` glob that fences this repo from
  sibling sessions.
- Tests you will touch live in `tests/orchestrator/`:
  `test_citation_repair.py`, `test_citation_repair_wiring.py`,
  `test_verify_citations.py`. This repo's CLAUDE.md has the runner command and
  the `tests/scripts/` import-mode trap (CCE-122) — read it before adding a
  test module.
- TDD. Each fix needs a test that fails before and passes after, and that can
  actually observe the thing its name claims — see the CCE-173 warning.
- Do **not** build a `PreToolUse` hook that classifies command text. One was
  built for the fence and measured at 11 of 17 commands wrong (7 false
  negative, 4 false positive) behind a green 25-test suite, then removed.
  Evidence:
  `claude-code-self-assessment/docs/superpowers/retrospectives/artifacts/2026-08-26-repo-fence/`.
- Report what you verified versus what you inferred. Three of these four
  tickets changed materially when their claims were checked against source
  rather than taken from notes.

## Report back

Per ticket: the PR link, what the test asserts, and anything the ticket got
wrong. Finding 3 of CCE-171 is explicitly expected to possibly evaporate — that
is a valid outcome, not a failure.
