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

**Where to read those paths.** Every `claude-code-self-assessment/...` path in
this prompt lives in the repo the prompt was written from —
`theoju/claude-code-self-assessment`, checked out locally at
`~/Projects/claude-extensions` under a different directory name. Read them
there: `~/Projects/claude-code-self-assessment` does not exist on this machine,
so following these paths literally returns ENOENT. That same repo is the
CCE-170 host named in §4.

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

**Two call sites, not one — the ticket says one.** The symbol-citation loop has
the identical defect: `_resolve_target` is called at `:544`, _outside_ the
`try` that opens at `:547`, and it raises `OSError(errno=63)` on the same
over-long token (measured — see the probe cited in §2). Guard both loops. A fix
scoped to `:511-527` alone leaves an equivalent hole 30 lines below it, and the
`:549` handler in the "already handled" list above is precisely the one that
_looks_ like it covers the symbol loop but only wraps `target.read_text()`.

## 2. CCE-171 findings 2 and 3

Same file, same session, after finding 1 lands.

**Finding 2 — bare filenames are never checked.** `_REPO_PATH_RE`
(`scripts/lint/citation_exists.py:39-41`) requires a directory separator, so
`README.md` and `orchestrator_runner.py:128` never enter `cites["paths"]`. The
file's own comment on `_LINE_PIN_RE` (`:47-48`) calls bare filenames "the worst
offenders — unlinted AND drifting". Pick one of the three options on the ticket
and make the choice explicit in the rule's user-facing description, not only in
a comment.

**Finding 3 — CONFIRMED, pre-verified. Fix `_relativize`, not `_resolves`.**
Do not re-derive this; the body was read and the behaviour measured before this
session started.

`_resolves` (`:433-469`) does no normalisation. All four arms are plain string
joins plus `.exists()`, and pathlib's `/` operator never collapses `..` — it is
string concatenation, so `.exists()` hands the un-collapsed path to `stat(2)`
and the _kernel_ walks it out of the repo. Measured end-to-end against the repo
venv: a page citing `docs/../../claude-extensions/README.md` yields
`check_path(...) == (True, "ok")`. The blocking rule passes a citation that
points into a sibling repo.

Three corrections to the shape as the ticket states it:

- **Traversal only works through directories that exist.**
  `a/../scripts/lint/citation_exists.py` resolves `False` — the kernel walks
  components and `a/` is ENOENT. Reachability needs a real prefix directory,
  which `docs/` supplies.
- **`/etc/passwd`-style examples are unreachable, and for the wrong reason.**
  `_REPO_PATH_RE` requires a `.ext` on the final component, so
  `docs/../../../../etc/passwd` is rejected by the _regex_ — not by any
  containment logic. Do not frame the ticket around that example; it reads as
  unreachable and invites dismissal of a real defect.
- **The failure mode is fresh-checkout divergence, not security.** A page citing
  `docs/../../sibling-repo/file.md` passes the blocking lint on the author's
  machine and names nothing in CI or for any reader. Same BLOCK→PASS class
  CCE-141 catalogued.

The fix belongs in `_relativize` (`:245-253`), not `_resolves`. The asymmetry is
the bug: absolute tokens already get both normalisation and containment
(`.resolve().relative_to(repo_root)` returns `None` when outside — measured,
an absolute path into a sibling repo yields `None`); relative tokens get
neither. Normalise there and return `None` on escape — one change covers every
call site and reuses the function's existing "None means not a repo citation"
contract. Note that the `rel in files` arm is safe by construction
(`git ls-files` cannot emit a `..` component — reasoned, not measured); the
hole is the on-disk `.exists()` fallback, which exists to cover same-run
siblings not yet staged. All **three** `.exists()` arms are unnormalised
(`repo_root/rel`, `docs_dir/rel`, `roots/rel`), not just the first — the
`_relativize` fix covers all three, which is part of why it is the right site.

Do not cite `/etc/passwd` → `None` as the containment evidence, even though it
is true of `_relativize` in isolation: that token never reaches the function,
because `_REPO_PATH_RE` rejects it for lacking an extension. Using it makes the
finding look like an unreachable security theory — the trap this section warns
about two paragraphs up.

Every measurement in this section is reproducible with
`docs/superpowers/artifacts/2026-09-12-cce171-citation-probe.py` in
`claude-code-self-assessment`; run it from this repo's checkout root with the
repo venv and `PYTHONDONTWRITEBYTECODE=1`.

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
wrong. CCE-171 finding 3 was pre-verified before this session opened: it is
confirmed, and §2 carries the corrected shape and fix location. Do not spend a
turn re-reading `_resolves` to re-establish it — do confirm the fix location
still holds once finding 1 has landed.
