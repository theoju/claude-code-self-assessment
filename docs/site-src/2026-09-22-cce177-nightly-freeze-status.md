---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/252
synthesized_into: []
doc_kind: decision
---

# CCE-177: nightly freeze status (2026-09-22)

This page tracks the status of the `engineering-docs-agent` nightly docs
pipeline freeze first reported under CCE-175. It supersedes the CCE-175
handoff prompt (`docs/superpowers/cce-175-handoff-prompt.md`), which was
still being drafted when the underlying fix landed.

## CCE-175 is fixed — the freeze is not lifted

CCE-175 was fixed and merged: PR #274,
`fix(orchestrator): break the deferral deadlock with a stall clock`, merged
to `theoju/engineering-docs-agent` `main` at `c5dc23b2` on
2026-09-21T04:03:55Z. Its diagnosis matches what the handoff prompt had
converged on after an earlier false finding was corrected: the
`deferral_counts` counters increment correctly inside each nightly run, but
are discarded whenever that run's PR closes unmerged. Because the baseline
never advances, the skip-valve threshold of 3 is unreachable — not because
counting was broken, but because the base it counts from never moves.

That fix addresses the *degraded* path — a nightly that runs and produces a
`state.json`, just with a baseline that won't advance. It does not touch a
second, separate failure mode: a **blind** run, which emits no `state.json`
at all. The stall clock PR #274 introduced has nothing to write to in that
case.

**The freeze has not lifted.** Two of the last three nightlies were blind:

- `#271` (2026-09-18): `schema_invalid: source-collector: 'prs' is a
  required property`
- `#273` (2026-09-20): the same `schema_invalid: source-collector: 'prs' is
  a required property`

Both failed before the point in the pipeline where `state.json` is written,
so neither run left the stall clock anything to act on.

## What's next

This gap is tracked as a new ticket, **CCE-177**, and it is where the live
work now sits. The CCE-175 handoff prompt is kept — marked superseded at the
top — for two things worth preserving: its method warning about resolving PR
refs explicitly rather than trusting `FETCH_HEAD` after a silenced fetch
failure, and the record of the false finding it corrected along the way (see
CCE-175 comments 16047 and 16090). Do not work from that prompt directly;
its established-root-cause section describes the deferral-deadlock issue
that PR #274 already closed, not the blind-run failures CCE-177 now covers.

## Summary

| Item | Status |
| --- | --- |
| CCE-175 (deferral deadlock, degraded-path counters) | Fixed — PR #274, merged 2026-09-21T04:03:55Z at `c5dc23b2` |
| Nightly freeze | Still active — 2 of last 3 nightlies blind (`#271`, `#273`) |
| Blind-run root cause (`schema_invalid: source-collector: 'prs' is a required property`) | Open — tracked as CCE-177 |
| CCE-175 handoff prompt | Superseded; retained for its method warning and false-finding record |
