# Handoff prompt — CCE-145 (paste into a fresh session)

---

Work **CCE-145** in `~/Projects/engineering-docs-agent` — **not**
`~/Projects/claude-extensions`. The linter lives in the plugin; the host repo is
only where I watched it fail.

> **CCE-145** — `citation_exists` linter reports exported symbols and gitignored
> paths as nonexistent — silently strands ~11 docs pages per nightly run.
> https://designitright.atlassian.net/browse/CCE-145

Read that repo's `CLAUDE.md` first; it has hard rules I have not repeated here.

## Start here

- `scripts/lint/citation_exists.py` — the implementation
- `tests/lint/test_citation_exists.py` — existing tests
- `tests/lint/test_citation_source_roots.py`, `scripts/verify_citations.py` — adjacent
- Repo HEAD when I looked: `ab2a1e8`

## Live reproduction — 2026-08-21, not a historical report

The nightly for `theoju/claude-code-self-assessment` ran clean
(run `32460602658`, conclusion `success`) and opened PR #201, which merged as
`2707b31`. The run authored 3 pages and **blocked 2**. `current_run.json`
recorded `partial: true` with these `partial_reasons`:

```
lint_block: docs/site-src/2026-08-21-memory-execution-scorer-redesign-cce163.md
  citation_exists: cites nonexistent symbol 'memory' in 'scripts/score.mjs'

lint_block: docs/site-src/2026-08-21-claude-md-audit-command-scoring.md
  internal_links: broken internal link(s): docs/runbook.md
```

**Only the first is CCE-145.** I verified both by hand:

- **`memory` in `scripts/score.mjs` is a false positive.** The symbol is real. It
  is a property key at `score.mjs:977` inside the object `export const
  EXECUTION_SCORERS = {` declared at `score.mjs:655`. So it is exported code at a
  correct, reachable citation target — it is simply not a *top-level* export
  binding. If the linter only matches `^export (const|function|class|default)`
  style top-level declarations, every scorer, handler, or route registered as a
  key inside an exported object map is unciteable. That is a large class of real
  code, and it is why pages keep getting stranded.
- **`docs/runbook.md` is a genuine block, not a linter bug.** No such file exists
  anywhere in the host repo. The page-author invented the link target. Do **not**
  fold this into CCE-145 — it belongs with the page-author defects (CCE-141 is
  the closest existing ticket). Say so explicitly rather than silently widening
  scope.

The ticket also names a **second false-positive class — gitignored paths.** I did
not reproduce that one. Confirm it independently before fixing it; if it no
longer reproduces, say so rather than fixing a phantom.

## What good looks like

1. **Reproduce first, in a test.** A failing test that cites a symbol nested in an
   exported object literal, before touching the implementation.
2. **Do not just widen a regex until the error stops.** Decide what a citation is
   *supposed* to mean — "this identifier exists at this path" vs "this is an
   importable binding" — and make the code express that. Write the decision down.
3. **Keep it strict where strictness is the point.** The linter exists to catch
   hallucinated citations. A fix that makes `citation_exists` pass for genuinely
   nonexistent symbols is worse than the bug. Add a test proving a hallucinated
   symbol still fails.
4. **Verify with the real consumer**, not `test -f`. Run the actual lint entry
   point (`scripts/lint/lint_runner.py`) against the two real pages named above.
5. Check whether `fact-checker.md` / `content-validator.md` agent contracts
   encode assumptions about the old behaviour.

## Recovering the stranded pages afterward

Two pages documenting real work are stranded and are **not** re-attempted
automatically — advancing the bookmark moved the collection window past them.
`docs/site-src/2026-08-16-docs-agent-bookmark-advance-cce145.md` in the host repo
records the recovery path: a single run with a **since-sha override**. Once the
linter is fixed, run that against the host repo to recover:

- `2026-08-21-memory-execution-scorer-redesign-cce163.md` (CCE-163)
- `2026-08-21-claude-md-audit-command-scoring.md` (CCE-161 — also needs its
  invented `docs/runbook.md` link removed; the linter fix alone will not land it)

## Things I would want told to me, not hidden

- If the "gitignored paths" class does not reproduce, say so.
- If the real fix belongs in the page-author's citation *generation* rather than
  the linter's *validation*, say so and re-scope the ticket instead of forcing a
  fix into the wrong layer.
- If "~11 pages per nightly run" no longer matches reality, give the current
  number and where it came from.

Land it through a PR. Note the two repos are **not** protected the same way, and
I checked both on 2026-08-21:

- `theoju/claude-code-self-assessment` — requires a pull request and a passing
  `lint · typecheck · test · build` check, no admin bypass.
- `theoju/engineering-docs-agent` — the repo you will actually be editing —
  blocks branch deletion and force-pushes on `main`, but does **not** require a
  PR or any status check. A direct push to `main` there will succeed. Use a PR
  anyway, and run the repo's own gate before merging rather than trusting CI to
  stop you.

Transition CCE-145 only after the fix has actually recovered a page.
