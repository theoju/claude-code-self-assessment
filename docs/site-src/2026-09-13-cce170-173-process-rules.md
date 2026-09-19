---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/238
synthesized_into: []
doc_kind: decision
---

# CCE-170–173: three process rules from one work cycle

PR #238 doesn't touch application code — it's a `CLAUDE.md`-only change that
files three process rules into the "Hard rules" section, each pulled from a
specific cost incurred during the CCE-170/171/172/173 cycle rather than
written down as abstract good practice. If you're reading `CLAUDE.md` end to
end, they now live there; this page is the narrative version, with the
incidents that produced them kept alongside the rule.

## 1. Check what reads a file before you stop committing it

CCE-170 removed `.engineering-docs-agent/current_run.json` from being
committed by mistake. That was the right call on its own terms — accidental
persistence is a bug. But the file's git history turned out to be the only
durable archive of the CCE-141 diagnostic firings that CCE-172 depends on.
Nobody caught the dependency at review time, because it wasn't a dependency
on an interface (an import, a documented read path) — it was a dependency on
a side effect (the fact that git happened to be keeping every version of a
file nobody meant to commit).

The rule this produced, now in `CLAUDE.md`: **before fixing accidental
persistence, check what reads it.** A file committed by mistake is still a
record, and something may depend on it. Grep for readers of the artifact —
including analyses and git-history mining — before removing it, and if
something depends on it, replace the channel in the same PR. The gap is
tracked as CCE-174, with the design at
`docs/superpowers/specs/2026-09-13-cce172-shortening-observations-design.md`.

If you're about to stop committing something, the check isn't "does anything
`import` or `require` this file" — it's "has anything ever been read out of
its history."

## 2. A detection-only fix needs its own exit criterion, in the same PR

CCE-141 withdrew a repair and shipped a diagnostic in its place, with the
stated condition for closing the loop being "a measured production value of
zero firings." That's a reasonable bar in principle, but it never said *when*
zero would count, or what threshold would reopen the follow-up. Three weeks
and four hosts later, the diagnostic had still recorded nothing — and the
question "do we have data yet?" had to be answered from scratch on
2026-09-13, because nothing about the original withdrawal said how to answer
it.

The rule: **detection shipped in place of a withdrawn fix needs an exit
criterion in the same PR.** State the threshold that opens the follow-up and
the date at which zero findings means delete the detector. A detector
carried indefinitely against a measured zero is the withdrawn fix's mistake
in a cheaper disguise — you've traded "we shipped something wrong" for
"we shipped something we can't tell is right," which costs the same
re-investigation later.

## 3. A zero from a key that doesn't exist looks exactly like a real zero

While investigating a different signal, a probe for `pages_authored`
returned "0 pages authored" across 19 runs. The number was true in the
narrowest sense — the count was in fact zero — but only because the field
has never existed in that schema. It wasn't measuring absence of pages; it
was measuring absence of a key. The finding-count zero it sat next to was a
real measurement, and it only became trustworthy once
`prose_contamination_rescued` turned up in the same snapshots, proving the
recording channel actually captures values when there's something to
capture.

The rule: **when measuring an absence, print the object's actual keys before
trusting a count, and prove the recording channel works by finding some
other value it captured.** Report a measured absence only alongside that
positive control. Without one, a zero from a typo and a zero from a genuinely
empty result are indistinguishable from the outside.

## Why file all three together

None of these three came from a design review or a retrospective template —
each is a rule extracted directly from a specific cost paid during CCE-170
through CCE-173. PR #238 is the mechanical act of writing them into
`CLAUDE.md`'s "Hard rules" section so the next cycle doesn't repay the same
cost. There's no code diff to review here; the artifact *is* the three
paragraphs now in `CLAUDE.md`.
