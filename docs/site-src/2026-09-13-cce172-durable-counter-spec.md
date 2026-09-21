---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/236
synthesized_into: []
doc_kind: decision
---

# A durable counter for citation-shortening observations (CCE-172 prerequisite)

PR #236 doesn't change any code in this repo. It records a design decision —
the actual implementation will land in the sibling `engineering-docs-agent`
repo — and files a short correction note alongside it. Both are worth a
decision record here because they set the terms for reopening CCE-172, the
ticket that would stop the `page-author` agent from silently shortening
citation paths.

## The problem: a diagnostic with nothing to show

CCE-172 depends on reading what the CCE-141 diagnostic collected about
citation shortening. On 2026-09-13, a measurement across all four hosts that
have the agent installed (`advanced-data-importer`, `claude-extensions`,
`eda-cce171`, `engineering-docs-agent`) found **zero** recorded
`citation_shortening_suspected` findings — in current state and in full git
history, on every host. On `claude-extensions` specifically, 19 runs since
CCE-141 shipped (2026-08-22) recorded only unrelated partial reasons
(`prose_contamination_rescued` × 8, nothing else).

The wiring was checked, not assumed: the diagnostic call is unconditional
(not config-gated) and runs once per authored page, and the state-saving call
sites downstream in the same function have no intervening function
boundary — so anything the diagnostic wrote would have been captured. A
`prose_contamination_rescued` entry in the same snapshots is the positive
control proving the channel does record what runs write; the zero sitting
next to it is credible rather than a silent gap. One apparent historical hit
turned out to be a false positive — a commit where the string appeared only
as prose in an authored docs page describing the diagnostic itself, not an
actual finding.

This matches CCE-141's own conclusion: its repair was withdrawn against "a
measured production value of zero firings across the whole archived record."

## Why the zero is about to get worse, not better

The record above was mined from the git history of a file
(`current_run.json`) that was only ever committed on hosts because of a
defect: hosts didn't inherit the agent repo's `.gitignore`, so a blanket
`git add -A .` swept the ephemeral sibling checkout into every docs PR.
CCE-170 fixed that — hosts now gitignore the sibling — which means the
incidental archive this analysis depended on won't exist going forward.
Findings will live only in the rendered run digest: prose, ephemeral, and
exactly the shape a separate cleanup (CCE-173) just finished trimming out of
the run cap.

So CCE-172 is unopenable in both directions at once: no data behind it today,
and after the CCE-170 fix, no mechanism left to accumulate any tomorrow.

## The proposed fix: a durable, append-only counter

The spec proposes a new key in the sibling repo's committed state file —
`citation_shortening_observations` — shaped as a running total plus a bounded
sample:

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

`total_ever` answers "does this happen at all"; `recent` (capped at 200,
FIFO-evicted) answers "what does it look like when it does" — a bare integer
would tell CCE-172 nothing about the shape the shortening takes, which is the
actual question the ticket needs answered. `total_ever` itself is never
capped.

The contract mirrors the existing durable-list precedent in that repo's state
module (an existing `merge_skipped_pr_records` function), and inherits its
three properties:

- **Append-only.** Records are never removed or rewritten, aside from FIFO
  eviction from `recent`. `total_ever` never decrements.
- **Idempotent per observation.** Identity is the triple `(page, cited,
  candidate)`, so a retried run can't double-record and an unchanged
  re-authored page doesn't inflate the count.
- **Never seeds the key.** A run with no findings leaves state untouched — a
  host that has never shortened a citation keeps a byte-identical state file,
  and the absent key reads as zero everywhere.

A single writer (`record_citation_shortening`) would own this key, the same
way the existing `add_partial` and `merge_skipped_pr_records` functions each
own one key. The key gets declared in the repo's state schema alongside the
other top-level keys, since the schema doesn't allow undeclared properties to
pass validation silently — declaring it is the difference between "this key
is part of the contract" and "this key happens to validate."

Two counters this must **not** get blended with each other: `total_ever` here
is cumulative-all-time and a raw observation count, while CCE-173's per-run
counter is scoped to one run and feeds a cap. Different time window,
different counter class — summing or substituting one for the other is
exactly the mistake this repo's own per-field categorization rule exists to
block.

## Exit criterion

The spec states one explicitly, so CCE-172 doesn't reopen the "do we have
data yet?" question indefinitely:

> Open CCE-172 when `total_ever >= 20` across hosts, **or** at 90 days from
> this counter shipping — whichever comes first. If 90 days pass with
> `total_ever` still 0, close CCE-172 as unreproducible and delete the
> diagnostic rather than carrying detection for a behaviour that does not
> occur.

The second branch is the point as much as the first: CCE-141 already
withdrew a repair for a measured zero, and carrying a detector indefinitely
for the same zero would be the identical mistake in a cheaper disguise.

## Also in this PR: an unrelated CCE-101 correction

PR #236 also files a short follow-up note on a stale claim in the sibling
repo's CLAUDE.md, unrelated to the counter work above except by having been
found during the same session. The CCE-101 auto-merge bullet currently reads
"Eligible = non-partial AND zero fact-checker warnings AND no human commits
on the PR" — and both conjuncts have been false since CCE-140. Plain
non-partial was replaced by "partial and not advance-cursor-backed" (every
run this pipeline produces is partial, so the unconditional block would have
meant auto-merge never fires), and fact-checker warnings were explicitly
carved out as *not* an eligibility input by CCE-140's own design decision —
they ride the PR body, digest, and notification instead. The note's fix
replaces the stale sentence with a pointer at the gate-chain function itself
rather than re-transcribing the chain a third time, on the reasoning that a
bullet stating an invariant and its reason survives refactors where a bullet
transcribing a mechanism does not. Not yet applied — the diagnosing session
was write-fenced from the target repo — but the replacement text and
ordering are fully specified for whoever applies it.
