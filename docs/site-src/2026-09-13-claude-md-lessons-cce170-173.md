---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/238
synthesized_into: []
doc_kind: decision
---

# CLAUDE.md lessons from the CCE-170/171/172/173 cycle

PR #238 touched no source code. It added three rules to `CLAUDE.md`, and
each one exists because something on the CCE-170 through CCE-173 cycle cost
real time before the lesson was written down. None of these are general
principles restated for tidiness — they're specific failures, generalized
just far enough to be checkable the next time the same shape shows up.

## Check what reads a file before you stop persisting it

CCE-170 (PR #265, in `engineering-docs-agent`) did the right thing:
it stopped a host from committing `.engineering-docs-agent/current_run.json`,
a file that had been landing in git by mistake. The fix itself wasn't wrong.
What was invisible at review time is that the file's git history was the
only durable archive of the CCE-141 diagnostic firings — data that CCE-172
is gated on. Removing the accidental commit didn't just clean up the repo;
it deleted the one place that record lived.

The generalized rule, now in `CLAUDE.md`:

> A file committed by mistake is still a record, and something may depend
> on it. Grep for readers of the artifact — including analyses and
> git-history mining — before removing it, and if something depends on it,
> replace the channel in the same PR.

The failure mode here isn't "the fix was wrong" — it's that the dependency
was on a side effect (git history as an accidental archive), not on a
declared interface, so no amount of reading the code that touched the file
would have surfaced it. The check has to be a search across analyses and
git-history mining, not just call sites.

This is filed as CCE-174; the design is at
`docs/superpowers/specs/2026-09-13-cce172-shortening-observations-design.md`.

## A withdrawn fix replaced by detection needs its own expiration date

CCE-141 withdrew a repair against a stated bar — "a measured production
value of zero firings" — and shipped a diagnostic in its place. The
diagnostic had no exit criterion: no threshold written down for when the
withdrawn fix should be reopened, and no date at which zero findings would
mean deleting the detector instead of carrying it forward indefinitely.

Three weeks and four hosts later, it had recorded nothing, and the
question "do we have data yet?" had to be answered from scratch on
2026-09-13 — reconstructing a decision that should have been sitting in
the PR that shipped the detector.

The rule this produced:

> State the threshold that opens the follow-up and the date at which zero
> findings means delete the detector. A detector carried indefinitely for
> a measured zero is the withdrawn fix's mistake in a cheaper disguise.

The framing matters: shipping detection instead of a fix is a legitimate
call when the fix's cost isn't yet justified by evidence. But detection
without an expiration date isn't a decision — it's a deferral that looks
like one, and it reproduces exactly the ambiguity the withdrawal was
supposed to resolve.

## A zero from a missing key is indistinguishable from a real zero

Mid-cycle, a probe for `pages_authored` reported "0 pages authored" across
19 runs. That looked like a real, if disappointing, measurement. It wasn't
one — the field has never existed in that schema. The probe was reading a
key that was never written, and a missing-key zero renders identically to
a genuine-absence zero on every surface that displays it.

The zero only became trustworthy once a different value —
`prose_contamination_rescued` — was found populated in the same snapshots,
proving the recording channel actually captures what the runs write. Without
that second data point, "0 pages authored" and "the field doesn't exist"
were not distinguishable from the report alone.

The rule:

> When measuring an absence, print the object's actual keys before trusting
> a count, and prove the recording channel works by finding some other
> value it captured. Report a measured absence only with that positive
> control alongside it.

This is the same discipline as a control group in any other measurement:
a null result only means something if you've shown the measurement
apparatus is capable of producing a non-null result under the same
conditions.

## Why these three landed together

All three rules trace back to the same underlying pattern: a control or
cleanup that is correct on its own terms but leaves an invisible gap —
a dependency nobody declared, a decision nobody dated, a measurement
nobody validated. None of the three required new code to fix; they
required writing down, at the moment the gap was found, exactly what
check would have caught it. That's the bar `CLAUDE.md` entries in this
repo are held to, and it's why PR #238 is docs-only.
