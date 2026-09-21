---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/238
synthesized_into: []
doc_kind: decision
---

# Three process rules from the CCE-170–173 cycle

PR #238 added three rules to `CLAUDE.md`. No code changed — the PR is
`CLAUDE.md` only. Each rule was paid for by a concrete mistake during the
CCE-170 through CCE-173 work cycle, and each is short enough to restate
here without losing the reason it exists.

## Check what reads an artifact before you stop writing it

**Before fixing accidental persistence, check what reads it.** A file
committed by mistake is still a record, and something may depend on it.

CCE-170 (PR #265 in `engineering-docs-agent`) correctly stopped hosts
committing `.engineering-docs-agent/current_run.json`. That part of the fix
was right — the file was never supposed to be checked in. What wasn't
visible at review time was that the file's git history was the *only*
durable archive of CCE-141 diagnostic firings, and CCE-172 is gated on that
data. Deleting the persistence deleted the archive along with it, because
the dependency was on a side effect (git history of an accidentally
committed file) rather than an interface (something designed to be read).

The rule this leaves behind: grep for readers of the artifact — including
downstream analyses and anything mining git history, not just code that
imports the file — before removing it. If something depends on it, replace
the channel in the same PR, not a follow-up. This is now filed as CCE-174;
the design for the replacement channel is at
`docs/superpowers/specs/2026-09-13-cce172-shortening-observations-design.md`.

## A detection shipped instead of a fix needs its own expiry date

**Detection shipped in place of a withdrawn fix needs an exit criterion in
the same PR.** State the threshold that opens the follow-up and the date at
which zero findings means delete the detector.

CCE-141 withdrew its repair against "a measured production value of zero
firings" and shipped a diagnostic instead — reasonable, if the diagnostic
comes with a stopping condition. It didn't. At three weeks and four hosts
the diagnostic had still recorded nothing, and the question "do we have
data yet?" had to be answered from scratch on 2026-09-13, because nothing
in the original PR said what "enough evidence of zero" would look like or
when to stop waiting for it.

A detector carried indefinitely against a measured zero is the withdrawn
fix's mistake in a cheaper disguise: it still leaves the underlying
question unanswered, it just does so more quietly. The fix is procedural,
not technical — write the exit criterion (threshold + date) into the PR
that ships the detection, not into a later retro.

## A zero from a missing key reads identically to a real zero

**A zero from a key that does not exist looks exactly like a real zero.**
When measuring an absence, print the object's actual keys before trusting a
count, and prove the recording channel works by finding some *other* value
it captured.

On 2026-09-13 a probe for a `pages_authored` field returned "0 pages
authored" across 19 runs. The field has never existed in that schema —
the zero was a `undefined` read as falsy, not a measurement. It sat next
to a genuine finding-count zero from the same snapshots, and the second
zero only became credible once a different field, `prose_contamination_rescued`,
turned up populated in those same snapshots — proof the recording channel
does capture what runs write, which is what made the neighboring zero
trustworthy rather than merely absent.

The rule generalizes past this one incident: report a measured absence
only alongside a positive control — some other value from the same
channel that you can show was actually recorded. A zero with no positive
control next to it is a schema question, not a data point.

## Why these three, together

All three came out of the same short cycle and share a shape: each is a
place where the code did exactly what it was told and the mistake was one
level up — deleting a record nothing referenced as a dependency, shipping
a diagnostic with no defined end, trusting a count without checking that
the field being counted was real. None of the three are caught by tests
in the normal sense; they're caught by asking one extra question before
treating a change (or a report) as complete. That's why they're written as
standing rules in `CLAUDE.md` rather than fixed in place and left behind:
the next cycle that touches accidental persistence, a stand-in detector,
or an absence metric is the one they're for.
