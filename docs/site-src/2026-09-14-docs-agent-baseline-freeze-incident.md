---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/240
synthesized_into: []
doc_kind: decision
---

# Incident: the docs-agent baseline froze for 23 days

**Host:** `theoju/engineering-docs-agent` (the dogfood host for this
project's own docs pipeline).
**Frozen:** 2026-08-22 → 2026-09-21. Last merged nightly before the freeze
was PR #240, the same day the window opened.
**Status:** Resolved 2026-09-21. One sub-question raised during diagnosis
was never answered — the fix removed its relevance rather than settling it.

This is a genuinely different failure from the CCE-152 baseline freeze,
even though the outward symptom — no nightly promotion — looks identical.
CCE-152's fix (`fc65ab8`, PR #227) was already in `main` and predates every
failing night here. If you're triaging a frozen docs-agent baseline, don't
assume it's a CCE-152 recurrence; confirm which mechanism is actually stuck
before reaching for that fix.

## Symptom

Every nightly run from at least 2026-09-09 onward opened a PR, reported
`partial`, and left `last_successful_run` pinned at the 2026-08-22 baseline.
The in-window backlog grew to 15 PRs — large enough to trip
`time_budget_exceeded` on its own, which became one of several rotating
proximate causes:

| Night | Content failure        | Structural outcome               |
| ----- | ----------------------- | --------------------------------- |
| 09-09 | `lint_block`            | `held_back_no_advance_no_cursor`  |
| 09-10 | `lint_block`            | same                              |
| 09-11 | `schema_invalid`        | same                              |
| 09-12 | `time_budget_exceeded`  | same                              |
| 09-13 | `time_budget_exceeded`  | same                              |
| 09-14 | `schema_invalid`        | same                              |

Three different triggers, one invariant result. Fixing any single trigger
would have changed nothing — they were interchangeable entry points into the
same trap, which is why the diagnosis didn't stop at the newest-looking
error (`schema_invalid: page-author: None is not of type 'string'`).

## Root cause: the release valve was behind the door it existed to open

The orchestrator's deferral-skip hatch (CCE-140) was built specifically to
prevent an indefinite silent stall: after three consecutive deferrals of the
same held-back PR, the hatch is supposed to force a skip so the run can
still merge. The chain that defeated it:

1. Any content failure defers a page belonging to the oldest in-window PR.
2. That PR's held-back state makes the cursor walk (CCE-151) run with an
   empty cursor prefix, so the run is marked `advance_cursor_backed = False`.
3. `advance_cursor_backed = False` on a `partial` run makes the auto-merge
   gate skip the merge.
4. Because the run never merges, its `state.json` — which carries the
   deferral counters the skip hatch reads — exists only on the unmerged PR
   branch. The next night reads `main`'s `state.json` instead: same
   baseline, same counters, unchanged.
5. Repeat.

The counter that arms the release valve is persisted only in the artifact
the stall prevents from landing. It can never accumulate the three
consecutive deferrals needed to reach its own threshold — the mechanism
designed to escape a stalled merge depends on a merge to record its own
progress.

## Resolution (2026-09-21)

The fix didn't answer the open sub-question below — it removed the counter
from the escape path entirely:

- **CCE-175 / PR #274** rekeys the hatch off `last_successful_run.completed_at`,
  a field that already lived on the default branch, was written every run,
  but was never read. It measures time since anything last promoted rather
  than a per-PR deferral count. A night that holds nothing back is
  cursor-backed and merges normally, and merging is what resets the clock —
  so progress and clock-reset became the same event, closing the loop the
  old counter-based design left open.
- **CCE-178 / PR #276** fixed two defects the first production firing of
  that hatch exposed: an empty `held_back` set was still routing through the
  non-merging branch, and the escape was forgiving every deferred PR
  (including ones blocked by something unrelated) instead of only the
  prefix blocker.
- **CCE-179 / PR #277** recorded both lessons in the upstream project's
  memory file.

The host's baseline advanced to `2026-09-22T12:31` — the first promotion
since the freeze began — when the following night's run auto-merged after
the escape forgave the oldest deferred PR.

**What stayed unresolved:** during diagnosis, a second suspected defect was
raised — that the deferral counter wasn't just failing to increment but
actively deleting the held PR's entry from the map on every non-incrementing
night. That hypothesis was narrowed but never confirmed or falsified by an
actual run, because CCE-175 removed the counter from the escape path before
anyone needed to settle it. A later correction found the map's one
persistent entry wasn't the stale fossil the original diagnosis assumed —
it was the genuine, correctly-pinned live blocker the whole time.

## Why this matters for triage

If a docs-agent host's published baseline stops advancing, the deadlock
signature — repeated `partial` runs, rotating content-failure reasons,
`state.json`'s deferral state unchanged across many nights — points at this
class of bug, not at whatever the night's specific lint or schema error
happens to be. Fixing the reported error first is a wasted cycle: the
underlying trap reappears with a different trigger the next night. Confirm
first whether the release-valve mechanism itself can ever reach its own
threshold given where its state is stored.

## Related tickets

CCE-175 (this incident's fix, Done via PR #274) with follow-ups CCE-178
(PR #276) and CCE-179 (PR #277). Related but distinct, all already shipped
before this incident: CCE-109 (the original doom loop), CCE-140 (the
cursor-backed advance and the skip hatch that this incident defeated), and
CCE-151 (the cursor walk on every path). CCE-152 is the superficially
similar but structurally unrelated prior freeze — its fix predates and does
not touch this bug.

Full diagnostic trail, evidence, and the source-reading narrowing session:
`docs/superpowers/2026-09-14-docs-agent-baseline-freeze-incident.md`.
