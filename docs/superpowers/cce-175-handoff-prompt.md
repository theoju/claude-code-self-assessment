# Handoff prompt — CCE-175 baseline deadlock (paste into a fresh session)

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
- The window's real PRs (cached summaries `#219`–`#239`, 13 entries) have accumulated
  **zero** deferrals, while `held_back` has been non-empty on every run.
- Therefore the skip threshold of 3 is unreachable for exactly the PRs the valve exists to
  release. **The counter is not merely failing to persist — it never increments.**
- Merge-as-promotion is dead in both run shapes: a blind run (#271, 2026-09-18) emits no
  `state.json` at all; a degraded run (#272, 2026-09-19) emits one that is semantically
  identical to `main` (all four top-level keys compare equal; the +132/-13 diff is
  formatting churn only).
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

This is a real decision, not a detail: **both the deferral-skip valve and a manual baseline
advance ABANDON the held PRs rather than documenting them.** 28 days of merged work would go
permanently undocumented either way. Options are roughly:

1. Let the fixed valve release naturally (~3 nights after the fix lands; abandons the window).
2. Hand-write a baseline rewind on `main` (abandons it too).
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

## Spin-off noted, not filed

The nightly `state.json` write produces a ~132-line diff with zero semantic change — the
serializer emits unstable output for identical state. It inflates every nightly PR and makes
a real advance hard to spot in review. Worth its own ticket; triage it, don't fold it into
CCE-175.
