---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/252
synthesized_into: []
doc_kind: decision
---

# CCE-177: the nightly orchestrator freeze didn't lift when CCE-175 closed

CCE-175 tracked a baseline deadlock in the nightly docs pipeline for the
sibling `theoju/engineering-docs-agent` repo: the pipeline had been frozen
since 2026-08-22 and couldn't release itself. It's Done now, fixed by PR #274
(`fix(orchestrator): break the deferral deadlock with a stall clock`, merged
to `main` at `c5dc23b2` on 2026-09-21T04:03:55Z) — but closing that ticket did
not clear the freeze. The live work continues under **CCE-177**.

This page exists because the handoff prompt written for CCE-175,
[`docs/superpowers/cce-175-handoff-prompt.md`](https://github.com/theoju/claude-code-self-assessment/blob/main/docs/superpowers/cce-175-handoff-prompt.md),
was still being drafted when PR #274 landed independently and reached the
same corrected diagnosis. Rather than delete the handoff doc, PR #252 marked
it superseded and kept it — its postscript is the only durable record of a
false finding and its correction, and that's worth more than a clean history.

## What was actually wrong

The root cause, confirmed by production data rather than inferred: nightly
runs compute `deferral_counts` correctly every time, but the counters are
discarded whenever that night's PR doesn't merge. `main`'s `deferral_counts`
sat at exactly `{"theoju/engineering-docs-agent#221": 1}` across roughly 28
nightly runs — a fossil left by a PR that merged eight days before the
baseline and is outside the review window, so it's carried forward unchanged
per the `next_deferral_counts` rule rather than incremented. Each subsequent
run recomputes from that same stale base and lands on `2` again. The
threshold of `3` that arms the skip valve was unreachable because the base
never moved — not because counting failed.

## What the stall clock fixes, and what it doesn't

PR #274's stall clock addresses the **degraded** path: a nightly run whose
`state.json` gets written but whose PR is left unmerged. That write is
promotable — an earlier degraded run (#272) advanced `completed_at` while
correctly leaving `last_successful_run.head_sha` untouched, meaning the
counters can be persisted to `main` without advancing the watermark past
undocumented work.

The freeze persists because a second failure mode sits upstream of anything
the stall clock can see. Two of the last three nightly runs were **blind**:
they emitted no `state.json` at all, failing instead with

```
schema_invalid: source-collector: 'prs' is a required property
```

(#271 on 2026-09-18, #273 on 2026-09-20). A blind run has nothing for the
stall clock to write or promote. `main` is still reading the same stale
`deferral_counts` baseline it was reading before CCE-175 closed. Both
failure modes have to be addressed for the pipeline to actually release
itself — the stall clock closes one of the two, and the missing-`'prs'`
schema failure driving the blind runs is the open half, tracked as CCE-177.

## Why this is worth writing down

Two things are easy to conflate here, and the handoff doc's own postscript
exists to keep them apart:

- **A ticket closing is not the same as the underlying condition clearing.**
  CCE-175 is Done; the nightly pipeline is still frozen. Anyone picking up
  CCE-177 should verify current state (`state.json` presence, `deferral_counts`
  on `main`) rather than trusting the ticket status as a proxy for it.
- **A corrected diagnosis is still worth keeping the record of the wrong one.**
  The handoff doc's method-warning postscript documents an earlier pass that
  claimed a nightly's `state.json` diff was semantically empty — it wasn't;
  the comparison had silently fallen back to comparing `main` against itself
  after a failed `git fetch` was piped to `/dev/null`. That failure mode
  (resolve a PR ref explicitly and check it — `gh pr diff <N>`, never let a
  fetch failure reach a comparison) generalizes past this one incident, which
  is why PR #252 kept the doc instead of deleting it once superseded.

## Where the live work is

CCE-177 is the tracked ticket for the blind-run schema failure. The
CCE-175 write-up (comments 16039 and 16047, with the correction at 16090) and
the original incident doc it references remain the fullest account of the
deferral-deadlock root cause for anyone who needs the counter-by-counter
detail before touching the pipeline again.
