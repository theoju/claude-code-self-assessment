---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/251
synthesized_into: []
doc_kind: decision
---

# CCE-175: correcting a stale-ref finding in the deferral-counter handoff

PR #251 corrects three claims in the CCE-175 handoff prompt
(`docs/superpowers/cce-175-handoff-prompt.md`) that PR #250 had shipped a
session earlier. The error traces to a single root cause: the analysis
compared `origin/main` against a `FETCH_HEAD` that wasn't what it looked
like.

## What went wrong

An earlier pass on CCE-175 needed to inspect PR #272's `state.json` diff.
The fetch that was supposed to resolve that PR's ref —
`git fetch origin pull/272/head:pr272` — failed silently under a
`2>/dev/null` redirect. `FETCH_HEAD` was left pointing at `origin/main`
from a prior operation, so the subsequent diff compared `main` against
`main`. Reading no difference, the pass concluded the nightly's
`state.json` diff was "semantically empty" and recommended treating a
manual merge of the degraded nightly as a way to resolve the underlying
counter issue. That conclusion was a tautology dressed as a finding: it
never actually inspected PR #272's content.

## What PR #251 corrects

Re-resolving the ref properly (`gh pr diff <N>`, or
`gh pr view <N> --json headRefOid` followed by `git show <sha>:<path>`)
shows PR #272 does compute a real `deferral_counts` diff — 15 entries,
with `#221` incremented to 2 and fourteen window PRs newly at 1. Because
PR #272 never merges, `main` keeps the stale `{"...#221": 1}`, and the
next nightly run recomputes from that same stale base and lands on 2
again. The counters increment correctly inside each run; they are
discarded because the run that computed them never merges.

That reframes the manual-merge option. A degraded run's `state.json`
write is promotable: merging PR #272 by hand advances
`completed_at` while leaving `last_successful_run.head_sha` unchanged,
which persists the deferral counters to `main` **without** advancing the
watermark past undocumented work. It is recovery, not a fix — the
threshold-of-3 skip valve still arms itself by abandoning the held-back
PRs rather than documenting them. PR #251 replaces PR #250's "resolves
the underlying issue" framing with this narrower, verified claim.

## The reusable lesson

Never let a fetch failure reach a comparison, and never pipe one to
`/dev/null`. A ref that silently fails to resolve leaves the previous
`FETCH_HEAD` value in place, which is indistinguishable from a
successful fetch until something else looks wrong. Resolve every PR ref
explicitly and check the resolution succeeded before diffing against it.

## Current status

`docs/superpowers/cce-175-handoff-prompt.md` itself is marked superseded
as of 2026-09-20: CCE-175 was closed by a different mechanism (a stall
clock in the orchestrator's deferral logic, landed in
`theoju/engineering-docs-agent`) rather than by acting on either PR #250's
or PR #251's manual-merge recommendation. The freeze that motivated
CCE-175 did not fully lift — a subset of nightly runs fail before writing
`state.json` at all, which the stall clock has nothing to promote, and
that gap is now tracked separately. This page exists to record the
correction itself — the stale-ref failure mode and the corrected
counter-persistence claim — not as current operational guidance for
CCE-175.
