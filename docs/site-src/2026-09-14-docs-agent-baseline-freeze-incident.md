---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/240
synthesized_into: []
doc_kind: decision
---

# Incident: the docs-agent baseline froze for 23 days

This is a root-cause writeup, not a fix. Nothing shipped against it — it's
captured here because the finding (interchangeable proximate triggers
collapsing into one structural trap) needed a durable home before a follow-up
fix gets scoped.

**Host:** the engineering-docs-agent nightly pipeline that publishes this
site (dogfood host: `theoju/engineering-docs-agent`).
**Frozen since:** 2026-08-22. Last successfully merged nightly: the PR that
merged that day.
**Diagnosed:** 2026-09-14, narrowed further 2026-09-16.

## Symptom

Every nightly run since at least 2026-09-09 opened a PR, reported `partial`,
and left the pipeline's `last_successful_run` cursor untouched at the
2026-08-22 baseline. By 2026-09-14 the in-window backlog had grown to 15
open PRs — large enough on its own to trip the `time_budget_exceeded`
failure mode.

## The proximate cause rotates; the outcome doesn't

Six consecutive nights, three different content failures, one identical
structural result:

| Night | Content failure        | Structural outcome               |
| ----- | ----------------------- | --------------------------------- |
| 09-09 | `lint_block`            | `held_back_no_advance_no_cursor` |
| 09-10 | `lint_block`            | same                              |
| 09-11 | `schema_invalid`        | same                              |
| 09-12 | `time_budget_exceeded`  | same                              |
| 09-13 | `time_budget_exceeded`  | same                               |
| 09-14 | `schema_invalid`        | same                               |

All six also carried `auto_merge_skipped: partial_run`. Fixing any one
trigger — the lint block, the schema error, the time budget — changes
nothing, because they're interchangeable entry points into the same trap.
That's why this investigation didn't stop at the newest failure
(`schema_invalid: page-author: None is not of type 'string'`); a
single-trigger fix would have been re-diagnosing the same freeze a week
later under a different error string.

## Root cause: the release valve is behind the door it's meant to open

The chain, reconstructed from the orchestrator's own state transitions:

1. Any content failure defers a page belonging to the oldest in-window PR.
2. That makes `held_back` non-empty, so the cursor-walk logic runs. Because
   the held PR is the first one in the window, the cursor prefix is empty —
   the run advances with no cursor backing.
3. A run with no cursor-backed advance is `partial`, and the auto-merge gate
   skips a `partial_run`.
4. The PR stays open. The `state.json` file that carries the
   `deferral_counts` counter exists only on that PR's branch — it's never on
   `main` because the PR never merges. The next night's auto-close sweep
   closes the stale PR.
5. The following run reads `main`'s `state.json`: same baseline, same
   counts, unchanged.
6. Repeat.

A prior fix had built exactly this kind of release valve as a safety net:
skip auto-merge blocking after 3 consecutive deferrals, on the reasoning
that a loud, recorded loss beats an indefinite silent stall. But the counter
that arms that valve is persisted in the very artifact the stall prevents
from landing. The valve can never reach its own threshold.

This is a return of an older, already-fixed doom loop — but reinstated by a
different route than the one closed previously. It is **not** a recurrence
of that earlier fix, which is already on `main` and predates every failing
night in the table above; the structural signature looks the same, but the
cause is new.

## Evidence

- The `deferral_counts` map on `main`'s `state.json` and the map written by
  the 2026-09-14 run branch are byte-identical — unchanged across 23 days
  and roughly 23 runs.
- The deferral-skip threshold defaults to 3 consecutive deferrals.
- No docs-agent PR merged after the 2026-08-22 baseline commit, confirmed
  against the merged-PR list.
- A run log for the 2026-09-14 attempt shows `schema_invalid` firing at the
  first authoring dispatch, followed by `held_back_no_advance_no_cursor`
  roughly 25 minutes later.

## Open sub-question: a likely second defect

The held-back PR should, in principle, receive `count + 1` on every run —
the deferral-counter logic increments anything currently in the window or
still deferred. Yet the written map never carries an entry for any
currently-held PR; the only entry is a stale one from a PR that has already
left the window entirely.

Reading the orchestrator source (no run performed) narrowed this further on
2026-09-16:

1. **The full window is always visible to the counter.** The window
   snapshot is taken before the admission cut, so every held PR's number is
   always present in the by-number lookup the counter reads. One earlier
   candidate explanation — that a held PR's number was silently missing from
   the window — doesn't hold up.
2. **The counter doesn't just fail to increment — it deletes.** Because a
   held PR is always in the window, the "not in this window, carry forward
   unchanged" rule never applies to it. It always lands on the
   increment-or-drop branch, and on any night it isn't found in the
   still-deferred set, its key is dropped. That's why no held PR ever
   appears in the map, and it explains the stale entry as a fossil from a PR
   that has genuinely aged out of the window.
3. **The deferral-partitioning step is exonerated** — it splits on count
   versus threshold and drops nothing, so it isn't where the leak happens.

The remaining candidate: the leak can only happen on a night that isn't
time-truncated. On a `time_budget_exceeded` night, the truncated PRs enter
the held set unfiltered and should increment in-run — narrowing the
09-09/09-10 (`lint_block`) and 09-11/09-14 (`schema_invalid`) nights as the
ones that matter for settling this. This also means the run-branch
`state.json` alone can't distinguish the two defects on a truncated night:
the primary root cause (increments only ever exist on branches that never
merge) already fully explains a missing in-run increment there, without
needing the second defect at all.

## Observability gap found along the way

The nightly log never names which PRs were admitted, deferred, or held
back. The entire diagnosis came from diffing `state.json` between `main`
and a run branch by hand. Any structural fix should also log the held-back
set explicitly — this incident took as long as it did partly because that
information had to be reconstructed rather than read.

## Recommended next steps

1. **Reproduce locally**, in a session with write access to the
   engineering-docs-agent repo: run the orchestrator's dry-run mode against
   the real `state.json` and window, and print the difference between the
   deferred-pages set and the by-number PR lookup on a non-time-truncated
   night. A non-empty result names the blocking PR and confirms the second
   defect; an empty result falsifies it and sends the investigation back to
   the primary cause alone.
2. **Don't fix `schema_invalid` or the lint block first.** The table above
   shows the trigger rotates; the next night just picks a different one.
3. **Structural fix direction:** the deferral counter needs to advance
   somewhere that doesn't depend on the blocked PR merging — or the skip
   hatch needs to key off something durable, like a run count since the
   last successful baseline, rather than a counter that only ever persists
   on merge.
4. **Operational unblock is a separate decision with real data loss.** A
   hand-written baseline rewind abandons documentation of every PR currently
   in the window. Don't do that silently — it needs its own call, separate
   from the structural fix.

## Tracking

Filed as a bug carrying the full analysis; this page is the primary source
for it. Related work, all already shipped and on `main`, closed adjacent
but distinct gaps: the original doom-loop fix, the cursor-backed
auto-merge advance and skip hatch, the cursor walk applied on every code
path, and the PR-boundary authoring cut. None of that prior work closed the
gap described here.
