---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/256
synthesized_into: []
doc_kind: decision
---

# CCE-175: the docs-agent baseline freeze is resolved

The dogfood host's nightly docs pipeline (`theoju/engineering-docs-agent`) went
31.2 days without landing a single promotion — frozen at PR #240
(2026-08-22) while every subsequent nightly opened, failed on a rotating
content error, and got auto-closed the next night with nothing carried
forward. That incident is now resolved. This page summarizes the fix and the
one question it left open. The full write-up, including the day-by-day
diagnosis, lives in the internal retrospective
`docs/superpowers/2026-09-14-docs-agent-baseline-freeze-incident.md`; treat
that file as the source of truth and this page as the pointer for readers of
the published docs.

## What was actually broken

The pipeline had a deferral-skip hatch: after 3 consecutive nights deferring
the same PR, the run should forgive it and move on rather than stall
indefinitely. The hatch never armed. Its counter lived inside `state.json`,
and `state.json` only reaches `main` when a run merges — which is exactly the
one outcome a stall prevents. The valve was behind the door it existed to
open. Three different content failures (`lint_block`, `schema_invalid`,
`time_budget_exceeded`) rotated across the six nights closest to diagnosis,
but all six produced the identical structural outcome
(`held_back_no_advance_no_cursor`), which is what pointed the investigation
at the escape hatch rather than at any one failure.

## The fix

Three tickets, all merged 2026-09-21:

- **CCE-175 (PR #274)** — re-keyed the skip hatch off
  `last_successful_run.completed_at` instead of the merge-only counter. That
  field already existed on the default branch and was written every run but
  never read. The hatch now measures time since anything last promoted, so a
  night that holds nothing back is cursor-backed and merges — and merging is
  what resets the clock. Progress and clock-reset become the same event,
  closing the deadlock instead of retuning it.
- **CCE-178 (PR #276)** — the fix's first production firing exposed two
  further defects in the same escape path. Emptying `held_back` was routing
  the run through the branch that sets `advance_cursor_backed = False`, which
  reproduced the deadlock one layer up; the flag is now derived from
  `bool(skipped_numbers)` instead. Separately, the escape had been forgiving
  every deferred PR in the window, including PRs blocked for unrelated
  reasons with a deferral count of zero — forgiveness is now scoped to the
  one PR actually blocking the prefix.
- **CCE-179 (PR #277)** — recorded both lessons in the plugin's `CLAUDE.md`
  so a future host hitting the same shape has the diagnosis in hand.

The nightly on 2026-09-22 (PR #280) auto-merged at 13:10Z, advancing the
baseline to `2026-09-22T12:31` — the first promotion since 2026-08-22. PR
#275, the pre-fix run from 09-21, was closed as superseded rather than
merged.

## What's still open

The original incident carried an "Open sub-question" about a second,
independent defect: a suspected asymmetry in how the deferral counter is
constructed relative to `held_back`, which appeared to starve or delete
increments for the held PR on the dogfood host. That question was never
answered — CCE-175's fix routes around the counter entirely rather than
repairing it, so the hatch no longer depends on the answer. But the asymmetry
itself is real and unexplained:

- On `claude-code-self-assessment` (this repo), the deferral counts **did**
  increment on the run branch relative to `main` (`{#235: 2, #236: 2, #240:
  1, #243: 1}` vs `{#235: 1, #236: 1}`).
- On the dogfood host, the run branch's counter map was byte-identical to
  `main` — zero increments across roughly 23 runs.

Neither confirms nor refutes the second-defect hypothesis; it's simply moot
for the fix that shipped.

A related correction is worth flagging for anyone reading the original
incident note directly: it initially read the `{"#221": 1}` counter entry as
a stale fossil left behind by a PR that had exited the deferral window. Log
evidence from PR #280 shows the opposite — PR #221 (a source PR merged
2026-08-14) was the live blocker for the entire 31.2-day freeze, and CCE-178's
forgiveness logic (scoped to the prefix blocker) is precisely why forgiving
it unstuck the pipeline. The retrospective keeps the wrong sentence in place
under an explicit correction marker rather than rewriting history — read the
correction, not just the original claim, if you go to the source document.

## Takeaway

A counter that only persists in the artifact its own stall prevents from
landing cannot arm the safety valve gated on it. The durable fix is to key
time-based escapes off state that's written independent of merge outcome —
here, a timestamp on the last successful run rather than a count that only
survives success.
