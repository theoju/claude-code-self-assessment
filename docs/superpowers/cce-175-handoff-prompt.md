# Handoff prompt — CCE-175 baseline deadlock (paste into a fresh session)

> **SUPERSEDED 2026-09-20. Do not work from this prompt.**
>
> CCE-175 was fixed and merged while this doc was being written — PR #274,
> `fix(orchestrator): break the deferral deadlock with a stall clock`, merged to
> `theoju/engineering-docs-agent` `main` at `c5dc23b2` on 2026-09-21T04:03:55Z.
> The ticket is Done. Its write-up reaches the same diagnosis this doc landed on
> after correction: the counters increment correctly each run and are discarded
> when the nightly PR closes unmerged, so the threshold of 3 is unreachable
> because the base never moves.
>
> **The freeze did not lift.** The stall clock addresses the *degraded* path, and
> 2 of the last 3 nightlies were *blind* — `schema_invalid: source-collector:
> 'prs' is a required property` (#271 on 09-18, #273 on 09-20). A blind run emits
> no `state.json` at all, so the stall clock has nothing to write. That is now
> tracked as **CCE-177**, which is where the live work is.
>
> Kept for its method warning at the end, and as the record of a false finding and
> its correction (CCE-175 comments 16047 and 16090).

Open the session with cwd `~/Projects/engineering-docs-agent`, from a **new terminal tab**
— not from a shell that is a descendant of another Claude process, or it inherits that
process's seatbelt profile and lands write-fenced.

Everything below the rule is the prompt.

All day counts and run numbers are stated as-of **2026-09-19**; recompute from the
baseline timestamp rather than trusting the count.

---

Work CCE-175 in this repo (`theoju/engineering-docs-agent`). The nightly docs pipeline
has been frozen since 2026-08-22 (28 days as of 2026-09-19) and cannot release itself.

**Before anything else, confirm you are not write-fenced:**
`touch .wprobe && rm .wprobe && echo WRITES OK`. If that prints `Operation not permitted`,
stop — you inherited a stale seatbelt profile and must be relaunched from a terminal tab
that is not a descendant of another Claude process. The profile is compiled at process
launch and can only be tightened, never reloaded; no amount of editing `settings.json`
fixes the live process.

**Use `superpowers:systematic-debugging`.** Part of the root cause is established from
production data and part is still inferred; the Iron Law applies to the inferred part.

## Established from production data — do not re-derive

- Baseline is stuck at `12c3125c` / `2026-08-22T07:37:35Z`. Review window is 16 merged PRs.
- `deferral_counts` on `main` reads exactly `{"theoju/engineering-docs-agent#221": 1}` and
  has not changed across ~28 nightly runs.
- **PR #221 merged 2026-08-14, eight days before the baseline** — it is outside the review
  window. Per `next_deferral_counts` rule 3, a PR not in the window is carried forward
  unchanged, so that `1` is a fossil that never moves.
- **The counters increment correctly inside each run and are then thrown away.** PR #272
  (unmerged) computes `deferral_counts` with 15 entries — `#221` at 2 and fourteen window
  PRs at 1. Because that PR never merges, `main` keeps the stale `{#221: 1}`, and the next
  night recomputes from it and lands on 2 again. **The threshold of 3 is unreachable
  because the base never moves, not because counting fails.** This is the originally filed
  root cause, confirmed — not a different one.
- A degraded run's `state.json` write IS promotable: #272 advances `completed_at` while
  leaving `last_successful_run.head_sha` at `12c3125c`, so merging it persists the counters
  **without** advancing the watermark past undocumented work. A blind run (#271,
  2026-09-18) emits no `state.json` at all and has nothing to promote.
- Degradation is measurable: gap-check coverage fell from 14/15 (2026-09-13) to 5/15
  (2026-09-19) at the same 2100s budget.

Full write-up: CCE-175 comments 16039 and 16047, and
`~/Projects/claude-extensions/docs/superpowers/2026-09-14-docs-agent-baseline-freeze-incident.md`.

## Step 1 — confirm the code path (inferred, not proven)

The candidate is an asymmetry in the CCE-151 cursor walk in `scripts/orchestrator_runner.py`
(around the emission site at `:3059`): `_deferred_all` is filtered by `if n in pr_by_number`,
while `held_back` is built unfiltered. If a held-back PR is absent from `pr_by_number`, it
blocks the advance forever while never entering `still_deferred` and so never being counted.

Run a dry-run against the real window that prints `deferred_pages_by_pr`, `window_prs`,
`pr_by_number.keys()`, `still_deferred` and `held_back` side by side. Confirm or refute
before writing any fix. If refuted, you have a different root cause — follow it, don't patch
the symptom.

## Step 2 — decide the recovery shape, then ask before acting

**There is an escape that needs no code change: merge the nightly PR by hand.** That
persists the deferral counters to `main`; two or three merged nightlies later the counts
reach the threshold of 3 and the skip valve arms itself. Verify before each merge that
`last_successful_run.head_sha` is unchanged in the diff — that is what makes the merge safe.

That is recovery, not a fix: the valve then ABANDONS the held PRs rather than documenting
them, so ~28 days of merged work goes undocumented. So does a manual baseline rewind.
Options are roughly:

1. Merge nightlies by hand until the valve arms (~2-3 nights, no code change; abandons the
   window).
2. Fix the persistence path so counters survive without an operator merge, then let it
   release (abandons the window too).
3. Advance the baseline in stages so the window shrinks to a size the pipeline can process,
   documenting each slice.

Put the trade-off to the operator with a recommendation; do not pick silently.

## Constraints

- Branch `fix/CCE-175-<slug>`, PR title contains `CCE-175`. No direct commits to `main`.
- Merge only on a green **integrated** suite — merge `main` into your branch locally and run
  the full `python3 -m pytest` first. `git fetch` before verifying; `origin/main` goes stale
  after an API-side merge.
- **Do not change the classification of any `time_budget_exceeded` call site.** Marking one
  blind reinstates the CCE-109 doom loop. Guards: `tests/orchestrator/test_time_budget.py`,
  `test_deferral_skip.py`, `test_cursor_backed_merge.py` — the authoring site is the
  thinnest-guarded (2 tests), treat changes near it as effectively untested and add coverage
  before touching it.
- Do not reintroduce citation repair in any form (CCE-141 — detection only; there must never
  be a `write_text` in `scripts/citation_repair.py`).
- `tests/scripts/` must stay a non-package. Import via `from scripts.lint import ...`, never
  by `sys.path.insert`-ing the scripts dir. When running a script directly, put the **repo
  root** on `sys.path`, never `scripts/` itself (CCE-122).
- Use the repo venv (`.venv/bin/python`) — system `python3` lacks `yaml`.

## Diagnostic reflex worth keeping

If a nightly is green, `partial: true`, and the baseline moved anyway, print
`deferred_pages_by_pr` and `held_back` before suspecting the linter. A populated
`deferred_pages_by_pr` next to a HEAD-valued baseline is the CCE-151 bug, not a
page-authoring one.

## Queued behind this — do not start

CCE-176 (voice-sample 20KB cap in `state_io.load_voice_samples`), then the three CLAUDE.md
changes in apply order **3 → 1 → 2** as recorded in
`~/Projects/claude-extensions/docs/superpowers/2026-09-13-cce101-eligibility-claim-followup.md`.
The order is load-bearing: change 3 moves text, change 1 edits text that change 3 may have
moved, change 2 adds a new bullet.

## Method warning, learned the hard way here

An earlier pass on this ticket claimed the nightly's `state.json` diff was semantically
empty. It was not. The comparison had been run against `FETCH_HEAD` after
`git fetch origin pull/272/head:pr272` failed silently under `2>/dev/null`, leaving
`FETCH_HEAD` pointing at `origin/main` — so it compared `main` against `main` and read the
tautology as a finding.

**Resolve a PR ref explicitly and check it.** Use `gh pr diff <N>`, or
`gh pr view <N> --json headRefOid` and `git show <sha>:<path>`. Never let a fetch failure
reach a comparison, and never pipe one to `/dev/null`.
