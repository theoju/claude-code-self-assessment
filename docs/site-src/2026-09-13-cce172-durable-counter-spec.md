---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/236
synthesized_into: []
doc_kind: decision
---

# CCE-172 prerequisite: a durable counter for citation-shortening observations

CCE-172 would edit the `page-author` agent (in the sibling
`engineering-docs-agent` repo) to stop it shortening citation paths — the
behavior this repo's own CLAUDE.md warns about under "Cite code line-free."
But editing the agent without evidence of *why* it shortens paths is the same
move that produced the repair CCE-141 had to withdraw after four Critical
review findings. CCE-172 has been gated on reading what the CCE-141
diagnostic collected. As of 2026-09-13, it has collected nothing that
survives.

## The measured zero

A 2026-09-13 census across all four hosts that have the diagnostic installed
(`advanced-data-importer`, `claude-extensions`, `eda-cce171`,
`engineering-docs-agent`) found **zero** recorded
`citation_shortening_suspected` findings, checked against both current state
and full git history. On `claude-extensions` — the host with 19 runs since
CCE-141 shipped (2026-08-22) — the only partial reason recorded across those
runs was `prose_contamination_rescued`, eight times.

That zero is trustworthy rather than a measurement gap, for a reason worth
stating explicitly: the diagnostic call is unconditional (not config-gated),
runs once per authored page, and sits upstream of every place the run digest
gets saved, in the same function with no intervening function boundary — so
anything the diagnostic wrote would have been captured. `prose_contamination_rescued`
appearing in the same channel is the positive control that proves the
channel records what runs actually write; a zero next to a channel known to
work is a real absence, not a silent drop. (One apparent historical firing
turned out to be a false positive — a single commit contains the string only
as prose in an authored docs page describing the diagnostic itself, not as a
recorded finding.) This is the same conclusion CCE-141 reached in its own
docstring when it withdrew the repair: "a measured production value of zero
firings across the whole archived record."

## Why the record disappears going forward

The record above was mined from the git history of an ephemeral sibling
artifact that host repos had been committing only because of a defect
CCE-170 (PR #265) just fixed: hosts didn't inherit the agent repo's
`.gitignore`, so a broad `git add -A .` swept that file into every docs PR.
Now that hosts gitignore it, the incidental archive this analysis depended on
won't exist for future runs — findings will live only in the rendered run
digest, which is prose, ephemeral, and exactly the shape a separate change
(CCE-173) just finished removing from the run cap. Put together: CCE-172 is
currently unopenable in both directions. No data behind it, and after #265,
no mechanism left to accumulate any.

## The proposed fix: a durable counter

The design (`docs/superpowers/specs/2026-09-13-cce172-shortening-observations-design.md`
in this repo) proposes adding an append-only record to the file the
engineering-docs-agent already commits and promotes on every merged docs PR —
so it survives the #265 fix instead of depending on an accidental one.

Shape: a `citation_shortening_observations` key holding a `total_ever` count
plus a `recent` FIFO sample (capped at 200 entries) of individual
observations — page, cited path, candidate full path, confidence, and first-seen
timestamp. The count alone would tell CCE-172 that shortening happens and
nothing about the shape it takes, which is the actual question the ticket
needs answered.

The contract mirrors the existing durable-list precedent in the same file
(the one `merge_skipped_pr_records` already establishes) on three properties:

- **Append-only.** A record is never removed or rewritten except FIFO
  eviction from the recent sample; the total never decrements.
- **Idempotent per observation.** Identity is the triple of page, cited
  path, and candidate path, so a retry inside one run can't double-record,
  and a page re-authored unchanged across runs doesn't inflate the count.
- **Never seeds the key.** A run with no findings leaves state untouched, so
  a host that has never shortened a citation keeps a byte-identical file,
  and the absent key reads as zero everywhere that matters.

A single writer owns the key, following the same one-owner-per-key pattern
the file's existing fields already use.

Two rules the design is explicit about *not* breaking:

- **Don't blend this into the per-run counter a sibling change (CCE-173)
  already introduced.** The new `total_ever` is cumulative-all-time and a
  raw observation count; the per-run counter is scoped to one run and feeds
  a cap. Different time window, different counter class — this repo's own
  per-field categorization rule (see CLAUDE.md, "Per-field semantic
  categorization before adding to any numerator") is explicit that fields
  differing on either axis don't belong in the same sum, and the same logic
  applies here even though the two counters live in a different repo.
- **Test the durable field, never the rendered output.** A finding must be
  asserted against the state file itself after a run, not against console or
  digest text — the same lesson CCE-173 already learned applied to its own
  successor.

## Exit criterion

The design states one explicitly, so CCE-172 doesn't reopen the same "do we
have data yet?" question indefinitely:

> Open CCE-172 when `total_ever >= 20` across hosts, or at 90 days from this
> counter shipping — whichever comes first. If 90 days pass with `total_ever`
> still 0, close CCE-172 as unreproducible and delete the diagnostic rather
> than carrying detection for a behavior that doesn't occur.

The second branch matters as much as the first: CCE-141 already withdrew a
repair for measured-zero value, and carrying a detector indefinitely for the
same zero would be the identical mistake in a cheaper disguise.

No code has landed in either repo yet — this page documents the design and
its rationale, not a shipped counter.

## Related: a stale CCE-101 claim, corrected but not yet applied

A separate follow-up note
(`docs/superpowers/2026-09-13-cce101-eligibility-claim-followup.md` in this
repo) catches a second, unrelated defect surfaced during the same
diagnostic session: the engineering-docs-agent's own CLAUDE.md still
describes its auto-merge eligibility test as "non-partial AND zero
fact-checker warnings AND no human commits on the PR" — wording that has been
false on both counts since a 2026-06 change narrowed the partial-run gate and
made fact-checker warnings explicitly non-eligibility-determining (they ride
the PR body, digest, and notification only). The fix is a one-paragraph
replacement that names the gate chain in order and points at the function
that implements it rather than restating the mechanism — a pattern the note
proposes turning into a standing CLAUDE.md rule: state the invariant and why
it holds, and point at code for the mechanism, because a bullet that
transcribes a mechanism has a shelf life and nothing ties a written
behavioral claim to the code it describes. The fix itself remains unapplied:
the diagnosing session was write-fenced away from the target repo, so the
correction is captured as a ready-to-apply note rather than a merged change.
