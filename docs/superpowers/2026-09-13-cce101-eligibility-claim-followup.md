# Follow-up: the CCE-101 auto-merge eligibility claim in engineering-docs-agent

**Status:** open. One-paragraph fix, not yet applied.
**Origin:** PR #225 (`theoju/engineering-docs-agent`), opened 2026-08-14, closed
2026-09-13 as superseded. Two of its three corrections had landed by other
routes; this one had not.

## The defect

`engineering-docs-agent/CLAUDE.md` states, in the CCE-101 auto-merge bullet:

> Eligible = non-partial AND zero fact-checker warnings AND no human commits on the PR;

Both halves are false, and have been since CCE-140.

`_maybe_auto_merge` (`scripts/orchestrator_runner.py`) evaluates a gate chain,
cheapest first:

```
policy != auto                        -> policy_manual
merge_veto_reason(partial_reasons)    -> merge_vetoed
blind                                 -> blind_run    (CCE-144)
partial and not advance_cursor_backed -> partial_run  (CCE-140)
human-edit guard
CCE-109 budget / bounded checks poll
```

1. **Plain non-partial is not the test.** CCE-140 narrowed it to
   `partial and not advance_cursor_backed`, so a cursor-backed partial run may
   merge. Every run this pipeline produces is partial; the unconditional block
   meant auto-merge never fired at all, which is why CCE-140 exists.
2. **Fact-checker warnings are not an eligibility input.** The function's own
   docstring says so: "Fact-checker warnings are NOT an eligibility input
   (CCE-140 / spec Decision 4)." `fact_warnings` appears only in the signature
   and docstring, never in the eligibility body — it is retained so callers'
   kwargs need no change. Warnings ride the PR body, digest and notification.

## The fix

One surgical replacement in `CLAUDE.md`. Anchor verified unique on 2026-09-13.

Find:

```
Eligible = non-partial AND zero fact-checker warnings AND no human commits on the PR;
```

Replace with:

```
Eligibility is a gate chain, evaluated in `_maybe_auto_merge` in this order: `policy != auto` → `merge_veto_reason` → `blind` (CCE-144) → `partial and not advance_cursor_backed` (CCE-140) → human-edit guard → checks poll — read the chain there rather than restating it here. Two corrections to the original wording, both wrong since CCE-140: plain **non-partial is not the test** (a cursor-backed partial run may merge), and **fact-checker warnings are NOT an eligibility input** (CCE-140 Decision 4) — they ride the PR body, digest, and notification only, and `fact_warnings` survives in the signature purely so callers' kwargs need no change;
```

Nothing else in the bullet changes.

## Two traps

- **Do not resurrect PR #225's branch** (`docs/CCE-151-c1-cursor-advance-residual`).
  Its second hunk rewrites the CCE-144 bullet and still describes the complement
  writer as holding a PR out of the advance "only on the time-truncated path",
  with merge-as-promotion as the containment. That is the defect CCE-151 fixed;
  `main` now strikes the sentence and marks it corrected in place. Merging that
  branch would reinstate a fixed defect's description as current.
- **Mind the PR title.** `extract_keys` in `scripts/jira_transition_on_merge.py`
  reads `CCE-\d+` keys from the title only and transitions them to Done on
  merge. CCE-101 and CCE-140 are already Done, so either resolves to
  `already_done` and returns before the comment step — a clean no-op. Do not put
  a not-yet-implemented key in the title.

## Why this note exists rather than the fix

Diagnosed from a session whose sandbox profile fenced writes to
`engineering-docs-agent` (see the repo-fence postmortem, lesson 7). Reads and
`gh` worked; file writes did not. Captured here the day it was produced rather
than left in a session transcript.
