---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/240
synthesized_into: []
doc_kind: decision
---

# Root cause: the engineering-docs-agent baseline has been frozen for 23 days

This is a summary of an incident analysis filed in this repo at
`docs/superpowers/2026-09-14-docs-agent-baseline-freeze-incident.md`. The
incident itself is not in this repo — it's in the sibling
`theoju/engineering-docs-agent` host, the nightly that fills in this
project's lens pages and `whats-new.md`. The diagnosis landed here because
the diagnosing session was write-fenced away from that repo (this repo's
cross-repo write-fencing rule blocks `Edit`/`Write` into
`engineering-docs-agent` by design) and `claude-mem` capture was down at the
time, so the write-fenced repo's docs tree became the only place to record
findings for whoever picks up the fix. **No code changed.** This page
documents a diagnosis, not a shipped fix.

## Symptom

`engineering-docs-agent`'s nightly has not merged a docs PR since
2026-08-22 (PR #240 there). Every run since at least 2026-09-09 opens a new
PR, reports a partial outcome, and leaves the host's `last_successful_run`
pinned to the same commit. By 2026-09-14 the backlog had grown to 15
unmerged PRs — large enough that the nightly started tripping its own
`time_budget_exceeded` guard on top of the original stall.

## Three failures, one trap

The proximate content failure rotates night to night — `lint_block`,
`schema_invalid`, `time_budget_exceeded` all appear across the six nights
tabulated in the source analysis — but every single one resolves to the
same structural outcome: `held_back_no_advance_no_cursor` plus
`auto_merge_skipped: partial_run`. Fixing whichever failure is newest (the
source analysis explicitly declines to chase `schema_invalid: page-author:
None is not of type 'string'` for this reason) changes nothing, because the
three failures are interchangeable entry points into the same downstream
trap.

## Why: the release valve is behind the door it's meant to open

The chain, as traced against `.engineering-docs-agent/state.json`:

1. A content failure defers a page belonging to the oldest in-window PR.
2. That PR becomes the head of the held-back set, so the cursor walk (added
   under CCE-151) runs with an empty cursor prefix — the run is marked
   `advance_cursor_backed = False`.
3. A run with `advance_cursor_backed = False` is `partial`, and the
   deferral-skip hatch built under CCE-140 gates auto-merge on exactly that
   flag — so it returns `skip("partial_run")`.
4. The PR stays open. The `deferral_counts` map that would eventually arm
   the skip hatch's 3-consecutive-deferrals threshold lives only in
   `state.json` on that unmerged branch.
5. The next night's run reads `state.json` from `main`, which never saw the
   increment. Same baseline, same counts, same failure. Repeat.

CCE-140 built the deferral-skip hatch on the premise that three consecutive
deferrals should force a loud, recorded skip rather than an indefinite
silent stall. The defect is that the counter which arms that hatch is
persisted only in the artifact the stall itself prevents from landing — the
valve can never reach its own threshold. The source analysis is explicit
that this is a reinstatement of the older CCE-109 doom loop through a route
that neither CCE-140 nor CCE-151 closed, and that it is a distinct defect
from CCE-152 (already shipped and in `main`, and predates every failing
night in this window).

## An open, likely-second defect

A held PR should, on paper, still pick up an in-run increment on nights
where the failure doesn't truncate the window (`lint_block` and
`schema_invalid` nights, as opposed to `time_budget_exceeded` nights, where
truncation happens before the counter is built). The evidence — a
byte-identical `deferral_counts` map across 23 days, containing only a
stale entry for a PR that has already left the window — says that isn't
happening. The current leading hypothesis, narrowed by reading the
orchestrator's source rather than by running it, is an asymmetry between
two constructions in the runner: the held-back set is built from the raw,
unfiltered deferred-pages keys, while the counter-relevant set is built
only from keys that survive a lookup into the admitted-PR map. Anything
present in the first and absent from the second gets deleted from the
counter map on every run rather than merely failing to increment, which
would also explain why no currently-held PR ever appears in the map. This
question is not yet settled by execution — only by reading — and the
source analysis proposes a single, narrow reproduction step (diffing the
deferred-pages keys against the admitted-PR keys on a non-truncated night)
to confirm or falsify it.

## What this means for this project

This project's `whats-new.md` and lens pages depend on that nightly.
Nothing here changes how the self-assessment dashboard scores or runs —
this is upstream tooling infrastructure — but a stalled `main` baseline on
the docs-agent host means future lens updates for this repo will not land
until the fix ships there.

## Status

Root cause is established at the structural level (the merge-gated
counter). The second, narrower defect around which PRs the counter
actually tracks is open pending a reproduction run outside the write-fence.
The recommended fix direction is to make the deferral counter advance
somewhere that doesn't depend on the blocked PR merging — or to key the
skip hatch off something durable, like a run count or a timestamp — rather
than a counter that only persists on merge. Filed as **CCE-175** in the
shared `CCE` Jira project; related, already-shipped tickets in the same
history are CCE-109, CCE-140, CCE-151, and CCE-152, none of which closed
this particular gap.
