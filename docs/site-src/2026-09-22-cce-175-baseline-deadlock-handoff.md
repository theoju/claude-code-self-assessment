---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/250
synthesized_into: []
doc_kind: decision
---

# CCE-175: baseline deadlock handoff prompt (and its supersession)

This is an incident/decision record, not a how-to. It exists so a future
reader hitting a similar deferral-counter freeze doesn't re-derive the
diagnosis from scratch, and so the handoff artifact PR #250 shipped isn't
mistaken for live guidance after the ticket closed.

## What PR #250 added

PR #250 added `docs/superpowers/cce-175-handoff-prompt.md` — a pasteable
prompt for opening a **fresh, unfenced session** against
`theoju/engineering-docs-agent` to resume CCE-175, the baseline deadlock that
had frozen that repo's nightly docs pipeline since 2026-08-22. The prompt
front-loads what was already established from production data (so a new
session doesn't re-derive it) and restates three standing constraints that
any session touching that code path must honor regardless of which ticket
it's working:

- **CCE-109** — never reclassify a `time_budget_exceeded` call site as
  blind; that reinstates the doom loop CCE-109 fixed.
- **CCE-141** — don't reintroduce citation repair in any form; detection
  only, no `write_text` in the repair path.
- **CCE-122** — `tests/scripts/` stays a non-package; import via
  `from scripts.lint import ...`, never `sys.path.insert`.

The prompt also carries a method warning worth keeping independent of the
ticket's outcome: an earlier pass on CCE-175 concluded a nightly's
`state.json` diff was "semantically empty" because a failed
`git fetch origin pull/272/head:pr272` was piped to `/dev/null`, leaving
`FETCH_HEAD` pointing at `origin/main` — so the comparison was `main` against
`main`, and the tautology read as a finding. Resolve a PR ref explicitly
(`gh pr diff <N>`, or `gh pr view <N> --json headRefOid` + `git show
<sha>:<path>`) and never let a silenced fetch failure reach a comparison.

## The ticket closed while the handoff prompt was being written

The handoff document is now marked superseded as of 2026-09-20, with an
inline notice added directly to it — worth restating here because the PR
summary that motivated this page describes CCE-175 as still open, and it
isn't:

- **CCE-175 is Done.** PR #274 in `engineering-docs-agent`
  (`fix(orchestrator): break the deferral deadlock with a stall clock`)
  merged to `main` at `c5dc23b2` on 2026-09-21T04:03:55Z. Its write-up
  reaches the same root cause the handoff prompt's "established from
  production data" section had already pinned: `deferral_counts` increments
  correctly inside each nightly run, but is discarded whenever that run's PR
  closes unmerged — so the base never advances, and the threshold of 3 that
  arms the skip valve is unreachable not because counting fails, but because
  nothing ever persists a non-fossil count to `main`.
- **The freeze did not lift.** The stall clock in PR #274 addresses the
  *degraded* path (a nightly that completes but can't advance the
  watermark). It does nothing for a *blind* run, which emits no
  `state.json` at all. Two of the three nightlies immediately preceding the
  fix were blind — `schema_invalid: source-collector: 'prs' is a required
  property` on both #271 (2026-09-18) and #273 (2026-09-20) — so the stall
  clock had nothing to write on either occasion.
- Live work continues under a new ticket, **CCE-177**, scoped to the blind
  path specifically. CCE-175's constraints (CCE-109 / CCE-141 / CCE-122)
  still apply there — they're properties of the code paths involved, not of
  the ticket number.

## Why this is worth a page here

Two things generalize past this one incident:

1. **A handoff artifact can go stale before its first use.** PR #250 shipped
   a resume-work prompt for an investigation that closed out from under it a
   day later. The prompt itself was correct — CCE-175's actual root cause
   matched its diagnosis — but "kept for its method warning, not its recovery
   plan" is the right posture for anyone who finds it via search rather than
   via the ticket.
2. **"Green and merged" doesn't mean "the symptom is gone."** The stall
   clock fix was scoped to the deadlock's degraded-run case and correctly
   left the blind-run case to a follow-up ticket rather than silently
   expanding scope. If you're triaging a similar freeze and a fix has
   already landed, check which of the pipeline's failure modes it actually
   covers before assuming the freeze cleared.

If you land here investigating a live freeze on
`theoju/engineering-docs-agent`, start at CCE-177, not CCE-175.
