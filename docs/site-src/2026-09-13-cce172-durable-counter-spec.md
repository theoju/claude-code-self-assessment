---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/236
synthesized_into: []
doc_kind: decision
---

# CCE-172 is blocked on a diagnostic that recorded nothing — here's the durable counter that unblocks it

CCE-172 wants to edit `page-author.md` (the sibling `engineering-docs-agent`
repo's page-authoring agent) so it stops shortening citation paths. That edit
is deliberately gated on evidence: the CCE-141 diagnostic was supposed to have
collected examples of the shortening in the wild, because editing the agent
from a guess is exactly the move that got CCE-141's own repair withdrawn after
four Critical review findings.

A 2026-09-13 measurement found the diagnostic has collected nothing that
survives.

## What was measured

Across the four hosts that have the agent installed —
`advanced-data-importer`, `claude-extensions`, `eda-cce171`,
`engineering-docs-agent` — a full scan of current state plus git history
turned up **zero** recorded `citation_shortening_suspected` findings. On
`claude-extensions`, the host with the most runs since CCE-141 shipped
(2026-08-22), 19 runs recorded partial reasons, and every one of them was
`prose_contamination_rescued` — nothing else.

That's not read as a measurement gap. The wiring was checked directly:
`_diagnose_citation_paths` is called unconditionally once per authored page,
and every `save_current_run` call site sits downstream in the same function
with no intervening `def`, so anything the diagnostic wrote would have been
captured. `prose_contamination_rescued` showing up in those same 19 runs is
the positive control proving the channel does record what runs actually
write — a zero next to a channel known to work is a real zero, not a silent
key that was never populated. (One apparent hit in git history, commit
`9b2b37c`, turned out to be the string appearing only as prose in an authored
docs page describing the diagnostic — not an actual finding.)

This confirms what CCE-141 already concluded in its own docstring: the
repair was withdrawn against "a measured production value of zero firings
across the whole archived record."

## Why the record disappears going forward, not just historically

The zero above was reconstructed by mining the git history of
`.engineering-docs-agent/current_run.json` on host repos — a file that only
ended up committed because of a defect CCE-170 (PR #265) has since fixed:
hosts weren't inheriting the agent repo's `.gitignore`, so `git add -A .`
swept the ephemeral sibling file into every docs PR. CCE-170 closed that
channel correctly — but it also means the incidental archive this whole
analysis depended on won't exist for future runs. Findings will live only in
the rendered run digest going forward: prose, ephemeral, and exactly the
shape a separate change (CCE-173) just finished stripping out of the run cap.

So CCE-172 is unopenable in both directions right now — no data behind it,
and after #265, no mechanism left to accumulate any.

## The proposed fix: a durable counter in `state.json`

The design (targeting the `engineering-docs-agent` repo, not this one) adds
an append-only record to `state.json` — the file that's actually committed
and promoted when a docs-agent PR merges, so it survives the CCE-170 fix
rather than depending on an accidental git-history artifact.

```json
"citation_shortening_observations": {
  "total_ever": 3,
  "recent": [
    {
      "page": "docs/site-src/architecture/linting.md",
      "cited": "citation_exists.py:511",
      "candidate": "scripts/lint/citation_exists.py:511",
      "confidence": "high",
      "first_seen": "2026-09-13T14:02:11Z"
    }
  ]
}
```

`total_ever` answers "has this happened." `recent` — capped at 200 entries,
FIFO-evicted — answers "what does it look like when it does," which is the
question CCE-172 actually needs answered before it can safely edit the
agent's prompt.

The contract mirrors `merge_skipped_pr_records`, the existing precedent for a
durable list in this file: append-only (no record is ever removed or
rewritten, aside from FIFO eviction from `recent`); idempotent per
observation, keyed on the triple `(page, cited, candidate)`, so a retry
within one run or an unchanged page re-authored across runs can't inflate the
count; and it never seeds the key — a host that has never shortened a
citation keeps a byte-identical `state.json`, and the absent key reads as
zero everywhere. A single writer, `record_citation_shortening` in
`state_io.py`, owns the key, the same way `add_partial` owns
`partial_reasons`.

Two counter classes get kept deliberately separate here. `total_ever` is
cumulative-all-time and a raw observation count; a different in-flight
counter (CCE-173's `citation_findings_emitted`) is scoped to one run and
feeds a cap. Different time window, different counter class — they don't get
summed or substituted for each other.

## The exit criterion — the part that matters as much as the counter

A detector kept running indefinitely against a measured zero is the same
mistake CCE-141's withdrawn repair made, just in a cheaper disguise. So the
spec states the exit condition up front, before the counter ships:

> Open CCE-172 when `total_ever >= 20` across hosts, or at 90 days from this
> counter shipping — whichever comes first. If 90 days pass with `total_ever`
> still 0, close CCE-172 as unreproducible and delete the diagnostic rather
> than carrying detection for a behaviour that does not occur.

Either the counter accumulates enough real observations to inform the
CCE-172 edit, or the 90-day branch fires and the diagnostic gets deleted
instead of carried forward on faith.

## A related correction surfaced alongside this

The same investigation window turned up a second, unrelated defect worth
recording here rather than losing to a session transcript: `CLAUDE.md` in
`engineering-docs-agent` states the CCE-101 auto-merge eligibility rule as
"non-partial AND zero fact-checker warnings AND no human commits," and both
conjuncts have been false since CCE-140. `_maybe_auto_merge` actually
evaluates a gate chain (policy check → merge-veto → blind-run check →
`partial and not advance_cursor_backed` → human-edit guard → checks poll),
and fact-checker warnings were explicitly removed as an eligibility input by
CCE-140 Decision 4 — they ride the PR body, digest, and notification only.
The accepted fix replaces the stale restatement with a pointer at
`_maybe_auto_merge` itself, on the theory that a bullet naming the invariant
and pointing at code for the mechanism can't drift the way a transcribed
mechanism did across two tickets that never circled back to update it.

Neither of these changes has landed in code yet — both are write-fenced from
the diagnosing session and recorded here as ready-to-apply designs.
