---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/238
synthesized_into: []
doc_kind: decision
---

# New CLAUDE.md hard rules from the CCE-170/171/172/173 cycle

PR #238 added three rules to this repo's `CLAUDE.md`. No code changed —
`CLAUDE.md` is project instructions, read by Claude Code as project memory,
not an importable module — but each rule encodes a failure mode that cost
real time during the CCE-170/171/172/173 work cycle. This page exists so the
rules are discoverable without reading `CLAUDE.md` end to end.

## Check what reads a file before removing accidental persistence

A file committed by mistake is still a record, and something may depend on
it. CCE-170 (PR #265 in `engineering-docs-agent`) correctly stopped hosts
committing `.engineering-docs-agent/current_run.json` — that file shouldn't
have been tracked. But its git history turned out to be the only durable
archive of the CCE-141 diagnostic firings that CCE-172 was gated on. The
removal was the right call; the consequence was invisible at review time
because the dependency ran through a side effect (git history as an archive),
not through an interface.

The rule this produced: before deleting an accidentally-persisted artifact,
grep for its readers — including analyses and git-history mining — and if
something depends on it, replace the channel in the same PR.

## A detection-only fix needs a stated exit criterion, in the same PR

If you withdraw a repair and ship detection instead, state up front what
threshold opens the follow-up and what "we're done, delete the detector"
looks like. CCE-141 withdrew its repair against "a measured production value
of zero firings" but shipped the diagnostic without ever writing down that
criterion. Three weeks and four hosts later it had recorded nothing, and the
question "do we have data yet?" had to be reconstructed from scratch on
2026-09-13 instead of being answered by re-reading the PR.

A detector left running indefinitely against a measured zero is the
withdrawn fix's original mistake, just wearing a cheaper disguise.

## A zero from a nonexistent key looks exactly like a real zero

When you're measuring an absence, print the object's actual keys before you
trust a count — and pair the reported zero with a positive control proving
the recording channel captures *something* real. On 2026-09-13 a probe for
`pages_authored` reported "0 pages authored" across 19 runs. The field has
never existed in that schema, so every one of those runs was silently
reading `undefined` and reporting it as zero. The adjacent finding-count zero
in the same snapshots was real — but it only became credible once
`prose_contamination_rescued` turned up in the same data, proving the
recording channel does capture values when they exist.

The rule: report a measured absence only alongside a positive control from
the same channel.

## Why this matters here

None of these three incidents happened in this repo — they're carried in
from the shared `CCE` Jira project this repo tracks work in (see
`CLAUDE.md` §Issue tracking) and from work in sibling repos in the same
engineering context. They're recorded here as hard rules, not conventions,
because each one previously reproduced as an actual incident rather than a
hypothetical risk. Postmortem detail for the repo-fence-adjacent incidents
in this same tracking window lives at
`docs/superpowers/retrospectives/2026-08-26-repo-fence-postmortem.md`.
