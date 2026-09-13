# CCE-172 prerequisite — a durable record of citation-shortening observations

**Status:** design, not implemented. Target repo: `engineering-docs-agent`
(write-fenced from this session root, so the design travels as a document —
same reason as `docs/superpowers/cce-170-173-handoff-prompt.md`).

**Date:** 2026-09-13

## Why this exists

CCE-172 would edit `agents/page-author.md` to stop the agent shortening
citation paths. It is gated on reading what the CCE-141 diagnostic collected,
because editing the agent without that data means guessing at _why_ it
shortens — the move that produced the repair withdrawn from CCE-141 after four
Critical review findings.

The diagnostic has collected nothing that survives.

### Measured 2026-09-13

| Check                                                                                            | Result                                                                                    |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Hosts with the agent installed                                                                   | 4 — `advanced-data-importer`, `claude-extensions`, `eda-cce171`, `engineering-docs-agent` |
| Recorded `citation_shortening_suspected` findings, current state + full git history, all 4 hosts | **0**                                                                                     |
| Runs on host `claude-extensions` since CCE-141 shipped (2026-08-22)                              | 19                                                                                        |
| Partial reasons actually recorded across those 19                                                | `prose_contamination_rescued` × 8, nothing else                                           |

The wiring is sound, so zero means zero: `_diagnose_citation_paths` is called
at `scripts/orchestrator_runner.py:2612`, is not config-gated, and runs once
per authored page. All five `save_current_run` sites (`:3211`–`:3313`) are
downstream in the same function with no intervening `def`, so anything the
diagnostic wrote would be captured — and `prose_contamination_rescued` proves
that channel does capture run-written reasons.

One apparent firing in history is not one: commit `9b2b37c` contains the
string only as prose in an authored docs page describing the diagnostic.

This agrees with what CCE-141 concluded in its own docstring — the repair was
deleted against "a measured production value of zero firings across the whole
archived record."

### The part that is new, and is the reason for this spec

The record above was mined from the **git history of
`.engineering-docs-agent/current_run.json`** on host repos. That file was
committed on hosts only because of the defect CCE-170 just fixed: hosts did
not inherit the agent repo's `.gitignore`, so `git add -A .` swept the
ephemeral sibling into every docs PR.

**CCE-170 (#265) closed that channel.** Hosts now gitignore the sibling. The
incidental archive this analysis depended on will not exist for future runs,
and findings will live only in the rendered run digest — prose, ephemeral, and
exactly the shape CCE-173 (#264) just finished removing from the run cap.

So CCE-172 is currently unopenable in both directions: no data behind it, and
after #265 no mechanism to accumulate any.

## What to build

A durable, append-only record in `state.json` — the file that **is** committed
and promoted by merging the docs-agent PR, so it survives #265.

### Shape

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

`total_ever` is the count. `recent` is the sample that answers _why_ — a bare
integer would tell CCE-172 that shortening happens and nothing about the shape
it takes, which is the question the ticket actually needs answered.

### Contract

Mirror `merge_skipped_pr_records` (`scripts/state_io.py:286-309`) exactly; it
is the established precedent for a durable list in this file, and its
docstring already states the three properties this needs:

- **Append-only.** A record is never removed or rewritten, except FIFO
  eviction from `recent` (below). `total_ever` never decrements.
- **Idempotent per observation.** Identity is the triple
  `(page, cited, candidate)`, so a retry inside one run cannot double-record,
  and a page re-authored unchanged across runs does not inflate the count.
- **Never seeds the key.** An empty finding set leaves `state` untouched, so a
  host that has never shortened keeps a `state.json` byte-identical to its
  pre-CCE-172 content, and the absent key reads as zero everywhere.

Single writer: a new `record_citation_shortening(state, records)` in
`state_io.py`, owning this key the way `add_partial` owns `partial_reasons`
and `merge_skipped_pr_records` owns `skipped_prs`.

### Bound on `recent`

Cap at 200 with FIFO eviction; `total_ever` is uncapped.

`skipped_prs` is unbounded and that is fine for its volume, but citation
findings are not comparable: CCE-173's run cap exists precisely because one
run can emit many (`_CITATION_RUN_FINDINGS_CAP` = 40). A pathological run
could add 40 records at once. The cap keeps `state.json` bounded — it is
18.5 KB today — while `total_ever` keeps the count exact.

### Schema

Declare the key in `templates/state.schema.json`. The schema does not set
`additionalProperties`, so an undeclared key would validate — but all seven
existing top-level keys are declared, several with descriptions citing their
ticket, and `load_state_validated` validates on every load. Follow the
convention.

## Two rules this must not break

**Do not blend this into CCE-173's per-run counter.** `total_ever` is
**cumulative-all-time** and a **raw observation count**. CCE-173's
`citation_findings_emitted` is scoped to **one run** and feeds a cap. Different
time window, different counter class. They must not be summed, and neither
should be substituted for the other — the per-field categorization rule in this
repo's CLAUDE.md is explicit that a field differing on either axis does not
belong in the same numerator.

**The test must assert on the durable field, never on rendered output.** This
is CCE-173's warning applied to its own successor. Required cases:

1. A finding in one run appears in `state.json` after the run.
2. The same finding in a later run does not double-record (identity triple).
3. A run with no findings leaves `state.json` byte-identical.
4. `recent` evicts FIFO at 200 while `total_ever` keeps counting.

## Exit criterion for CCE-172

State it in the ticket, or CCE-172 reopens this same "do we have data yet?"
question indefinitely:

> Open CCE-172 when `total_ever >= 20` across hosts, **or** at 90 days from
> this counter shipping — whichever comes first. If 90 days pass with
> `total_ever` still 0, close CCE-172 as unreproducible and delete the
> diagnostic rather than carrying detection for a behaviour that does not
> occur.

The second branch matters as much as the first. CCE-141 already withdrew a
repair for measured-zero value; carrying a detector indefinitely for the same
zero is the same mistake in a cheaper disguise.

## Verified vs inferred

**Verified by execution:** the four-host finding counts, the 19-run reason
census, the call-site line numbers and their ordering within one function, the
`9b2b37c` false positive, `state.json`'s current keys and size, the schema's
declared properties and absent `additionalProperties`, and the
`merge_skipped_pr_records` contract.

**Inferred:** that `save_current_run` at `:3211`–`:3313` executes after
`:2612` — read from line order within a single function, not from execution
tracing. Also unverified: that all four hosts run comparable page-authoring
volume. A host that authors little would contribute little opportunity, and I
did not measure per-host authored-page counts (the `current_run` snapshot
carries no such field — an earlier probe of mine looked for one and returned a
misleading zero).
