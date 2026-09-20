---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/238
synthesized_into: []
doc_kind: decision
---

# Process rules from the CCE-170/171/172/173 cycle

PR #238 added three rules to this repo's `CLAUDE.md`. No code changed — the
PR is process memory only, distilled from three separate incidents in the
same work cycle. Each rule below cost real time to learn; they're recorded
here so the next person doesn't pay for them twice.

## Check readers before removing accidental persistence

A file committed by mistake is still a record, and something downstream may
depend on it as a data source even though nothing formally "imports" it.

CCE-170 (PR #265 in `engineering-docs-agent`) correctly stopped hosts from
committing `.engineering-docs-agent/current_run.json` — that file had no
business being tracked. But its git history turned out to be the only
durable archive of CCE-141's diagnostic firings, and that history was
exactly the data CCE-172 needed. The fix itself was right; the consequence
was invisible at review time because the dependency ran through a side
effect (git history as an accidental log), not through an interface anyone
would have grepped for.

The rule going forward: before removing accidental persistence, grep for
readers of the artifact — including analyses and git-history mining, not
just code that opens the file. If something depends on it, replace the
channel in the same PR rather than deleting the only copy. Filed as
**CCE-174**; design at
`docs/superpowers/specs/2026-09-13-cce172-shortening-observations-design.md`.

## Detection shipped in place of a withdrawn fix needs an exit criterion

If a real fix gets withdrawn in favor of shipping a diagnostic instead, the
same PR must state the threshold that opens the follow-up work, and the
date at which zero findings means the detector should just be deleted.

CCE-141 withdrew its repair against "a measured production value of zero
firings" and shipped a detection-only diagnostic with no such criterion
attached. At three weeks and four hosts it had still recorded nothing, and
the question "do we have enough data yet?" had to be re-derived from
scratch on 2026-09-13 — work that a stated exit criterion would have made
a lookup instead of an investigation.

A detector carried indefinitely against a measured zero is the withdrawn
fix's original mistake, just wearing a cheaper disguise.

## A zero from a key that doesn't exist looks exactly like a real zero

When you're measuring an absence, print the object's actual keys before
trusting the count — and pair any reported zero with a positive control
that proves the recording channel actually works.

On 2026-09-13, a probe for `pages_authored` returned "0 pages authored"
across 19 runs. The field has never existed in that schema, so the zero
was structurally guaranteed regardless of what actually happened. The
finding-count zero sitting next to it in the same report was real, but it
only became credible once `prose_contamination_rescued` turned up populated
in the same snapshots — proving the channel does record what runs write,
which is what made the neighboring zero trustworthy rather than just
another instance of the same schema mismatch.

The pattern to apply: report a measured absence only alongside a positive
control from the same channel. A zero with no control next to it is not
yet distinguishable from a key that was never there.
