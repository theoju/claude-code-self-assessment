---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/238
synthesized_into: []
doc_kind: decision
---

# Three rules from the CCE-170/171/172/173 cycle

PR #238 added three hard-rule entries to `CLAUDE.md`, distilled from a single
work cycle (CCE-170 through CCE-173). No code changed — the PR is
documentation only — but each rule traces to a real cost paid during that
cycle, and each is now enforced as a convention future work must follow.

## Check what reads a file before you stop persisting it

CCE-170 (`engineering-docs-agent` PR #265) correctly stopped a host from
committing `.engineering-docs-agent/current_run.json` by mistake. The fix was
right on its own terms. What wasn't visible at review time is that the file's
git history was the *only* durable archive of the CCE-141 diagnostic firings
that CCE-172 later depended on — nothing in the codebase imported the file, so
grepping for readers in the normal sense would have found none. The dependency
was on a side effect (git history), not an interface.

The rule: before fixing accidental persistence of a file, check what reads
it — including analyses and git-history mining, not just source imports. A
file committed by mistake is still a record, and something may depend on it.
If something does, replace the channel in the same PR rather than deleting the
only archive.

## A detector shipped in place of a withdrawn fix needs an exit criterion

CCE-141 withdrew its own repair, citing a measured production value of zero
firings, and shipped a diagnostic in its place with no stated stopping
condition. At three weeks and four hosts, the diagnostic had still recorded
nothing, and the question "do we have enough data yet?" had to be re-derived
from scratch on 2026-09-13 instead of being answered by a threshold that was
already written down.

The rule: state the threshold that opens the follow-up, and the date at which
zero findings means delete the detector, in the same PR that ships the
detector. Carrying a detector indefinitely against a measured zero is the
withdrawn fix's original mistake, just in a cheaper disguise.

## Back a measured absence with a positive control

A probe reading a field this repo's docs refer to as

```
pages_authored
```

returned "0 pages authored" across 19 runs. That field has never existed in
the schema it was read from — the zero was not a measurement of anything, it
was the shape a missing key returns by default. The zero read as plausible
because a *real* finding-count zero sat right beside it in the same report.

What made the absence credible, once someone checked, was that
`prose_contamination_rescued` — a field that does exist — showed real values
in the same snapshots, proving the recording channel itself was working.

The rule: when measuring an absence, print the object's actual keys before
trusting a count, and report a measured zero only alongside a positive
control — some other value the same channel is known to have captured. A zero
from a key that doesn't exist looks exactly like a real zero; only a sibling
value proves the difference.

## Why this belongs in `CLAUDE.md` rather than a runbook

All three rules are diagnostic reflexes, not one-off fixes: "what reads this
before you stop writing it," "what's the exit criterion for this detector,"
and "what's the positive control for this zero" are questions that generalize
past the specific files and tickets that produced them. That's the same shape
as the existing session-classifier and denominator-semantics rules already in
`CLAUDE.md` — each one is a class of bug, named once, so the next instance of
it is caught by asking the question rather than re-discovering the failure.
