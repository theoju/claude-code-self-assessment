---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/238
synthesized_into: []
doc_kind: decision
---

# Lessons from the CCE-170 incident cycle

PR #238 didn't touch application code. It added three rules to `CLAUDE.md`,
distilled from a run of linked incidents — CCE-170 through CCE-174, with
CCE-141 as the originating detector — that are worth understanding on their
own, not just as bullet points in project memory.

## Don't remove accidental persistence without checking what reads it

CCE-170 (PR #265, in `engineering-docs-agent`) stopped a host from committing
`.engineering-docs-agent/current_run.json`. That fix was correct — the file
was never meant to be tracked. But its git history turned out to be the only
durable archive of CCE-141 diagnostic firings, and CCE-172 was gated on that
data.

The general shape: a file committed by mistake is still a record, and
something downstream may depend on it — not on the interface, but on the side
effect of it existing in git history. Before you remove accidental
persistence, grep for readers of the artifact, including analyses and
git-history mining that never showed up as a normal "consumer." If something
depends on it, replace the channel in the same PR rather than after the fact.
Filed as CCE-174; design at
`docs/superpowers/specs/2026-09-13-cce172-shortening-observations-design.md`.

## A stopgap detector needs an exit criterion in the same PR

CCE-141 withdrew a fix against the condition "a measured production value of
zero firings," then shipped a diagnostic in its place with no stated
threshold or date for when that condition would be considered met. Three
weeks and four hosts later, it had recorded nothing, and answering "do we
have data yet?" meant reconstructing the question from scratch on
2026-09-13.

The rule this produced: when detection ships in place of a withdrawn fix,
state the threshold that opens the follow-up and the date at which zero
findings means delete the detector — in the same PR that ships the
detector, not as a TODO to revisit later. A detector carried indefinitely
against a measured zero is the withdrawn fix's original mistake in a
cheaper disguise: it still costs upkeep, and now it also costs the
rediscovery effort every time someone asks whether it's still needed.

## A zero from a missing field looks exactly like a real zero

On 2026-09-13, a probe for `pages_authored` reported "0 pages authored"
across 19 runs. The field has never existed in that schema — the zero was a
JavaScript default from reading an absent key, not a measurement. It sat
next to a real finding-count zero, and the two were indistinguishable until
`prose_contamination_rescued` turned up in the same snapshots, proving the
recording channel actually captures what runs write.

The rule: before trusting a count, print the object's actual keys. Report a
measured absence only alongside a positive control — some other value the
same channel captured — that proves the channel works. Without that check,
"the schema has no such field" and "the field is reliably zero" render
identically, and only one of them is a finding.

## Why this landed here

None of the three rules are specific to this repo's scoring model — they're
process lessons about persistence, withdrawn fixes, and absence-as-evidence
that surfaced during work on a sibling project (`engineering-docs-agent`)
under the shared `CCE` Jira key. They're recorded in `CLAUDE.md` because
future agents working across either repo need them, and captured here as a
standalone decision record since `CLAUDE.md` itself isn't part of the
published docs lens.
