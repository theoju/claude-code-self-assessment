---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/236
synthesized_into: []
doc_kind: decision
---

# CCE-172 prerequisite: a durable record of citation-shortening observations

CCE-172 — the ticket to stop the page-author agent shortening citation paths —
is gated on reading what the CCE-141 diagnostic actually collected. Editing
the agent without that data means guessing at _why_ it shortens, which is the
same move that produced the repair CCE-141 itself withdrew after four
Critical review findings. The diagnostic has collected nothing that survives,
and this spec (source: `docs/superpowers/specs/2026-09-13-cce172-shortening-observations-design.md`
in `engineering-docs-agent`) proposes the fix.

## What the 2026-09-13 audit found

| Check | Result |
| --- | --- |
| Hosts with the agent installed | 4 — `advanced-data-importer`, `claude-extensions`, `eda-cce171`, `engineering-docs-agent` |
| Recorded `citation_shortening_suspected` findings, current state + full git history, all 4 hosts | **0** |
| Runs on host `claude-extensions` since CCE-141 shipped (2026-08-22) | 19 |
| Partial reasons actually recorded across those 19 | `prose_contamination_rescued` × 8, nothing else |

The wiring is sound, so zero means zero. `_diagnose_citation_paths` is called
once per authored page, is not config-gated, and every `save_current_run`
site downstream is in the same function with no intervening `def` — so
anything the diagnostic wrote would have been captured. The
`prose_contamination_rescued` hits prove the recording channel does capture
run-written reasons; it's a positive control sitting next to the measured
absence, which is what makes the zero credible rather than suspicious. (One
apparent historical hit doesn't count: a commit contains the string only as
prose in an authored docs page describing the diagnostic, not as a finding.)
This agrees with what CCE-141 concluded in its own docstring — the repair was
withdrawn against "a measured production value of zero firings across the
whole archived record."

## Why the existing record can't be trusted going forward

The record above was mined from the git history of
`.engineering-docs-agent/current_run.json` on host repos — and it was only
there because of a defect: host repos never inherited the agent's
`.gitignore`, so `git add -A .` swept that ephemeral sibling file into every
docs PR. CCE-170 (PR #265) fixed that. Hosts now gitignore the sibling
correctly, which is the right fix for accidental persistence — but it also
means the incidental archive this analysis depended on won't exist for future
runs. Findings will live only in the rendered run digest: prose, ephemeral,
and exactly the shape a separate change (CCE-173) just finished trimming out
of the run cap. CCE-172 is currently unopenable in both directions: no data
behind it, and after #265 no mechanism left to accumulate any.

## The proposed fix: a counter in `state.json`

A durable, append-only record in `state.json` — the file that's committed and
promoted on every merged docs-agent PR, so it survives the #265 gitignore fix
rather than depending on an accident to persist.

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

`total_ever` is the count; `recent` is the sample that answers _why_ — a bare
integer would confirm shortening happens without showing the shape it takes,
which is the question CCE-172 actually needs answered.

The contract mirrors `merge_skipped_pr_records` in `state_io.py` — the
established precedent for a durable list in this file:

- **Append-only.** A record is never removed or rewritten except FIFO
  eviction from `recent`. `total_ever` never decrements.
- **Idempotent per observation.** Identity is the triple
  `(page, cited, candidate)`, so a retry inside one run can't double-record
  and a page re-authored unchanged across runs doesn't inflate the count.
- **Never seeds the key.** An empty finding set leaves `state` untouched — a
  host that has never shortened keeps `state.json` byte-identical to its
  pre-CCE-172 content, and the absent key reads as zero everywhere.

`recent` caps at 200 with FIFO eviction; `total_ever` stays uncapped. That's
a deliberate departure from `skipped_prs` (unbounded, and fine at its
volume): a single run can emit many citation findings, so the cap keeps
`state.json` bounded while `total_ever` keeps the count exact.

Per this repo's rule on per-field categorization before summing into a
numerator: `total_ever` (cumulative-all-time, raw observation count) must
never be blended with a separate per-run counter that feeds a run-scoped cap
— different time window, different counter class, same rule that governs
this dashboard's own scorer numerators.

## Exit criterion

The spec states one explicitly, so CCE-172 doesn't reopen the "do we have
data yet?" question indefinitely:

> Open CCE-172 when `total_ever >= 20` across hosts, **or** at 90 days from
> this counter shipping — whichever comes first. If 90 days pass with
> `total_ever` still 0, close CCE-172 as unreproducible and delete the
> diagnostic rather than carrying detection for a behaviour that does not
> occur.

The second branch matters as much as the first: CCE-141 already withdrew a
repair for measured-zero value, and carrying a detector indefinitely against
the same zero would be the same mistake in a cheaper disguise.

## Related: a stale CCE-101 eligibility claim

A separate, smaller follow-up surfaced during this work: `CLAUDE.md` in
`engineering-docs-agent` still describes CCE-101 auto-merge eligibility as
"non-partial AND zero fact-checker warnings AND no human commits," and both
conditions have been false since CCE-140. The actual gate chain in
`_maybe_auto_merge` checks `partial and not advance_cursor_backed` (a
cursor-backed partial run may merge) and never treats fact-checker warnings
as an eligibility input at all — the function's own docstring says so;
warnings ride the PR body, digest, and notification instead. The fix is a
one-paragraph replacement of that bullet, verified against a unique anchor,
but it hasn't landed: the session that diagnosed it had writes to
`engineering-docs-agent` fenced by its sandbox profile, so this note captures
the diagnosis rather than the applied fix.
