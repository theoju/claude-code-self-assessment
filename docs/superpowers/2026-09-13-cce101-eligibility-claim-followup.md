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

---

# Decisions taken 2026-09-16

Four questions were put to the operator; all four recommendations were accepted.
This section is the ready-to-apply result. Nothing below has been applied —
the diagnosing session remained write-fenced to `engineering-docs-agent`.

Apply in the order given: **change 3 first** (it moves text), then **change 1**
(it edits text that change 3 may have moved), then **change 2**.

## Change 1 — the CCE-101 eligibility correction (Q1: delete the duplication)

Rejected: correcting the sentence in place. It has already gone stale twice —
CCE-140 rewrote the gate, CCE-144 added the `blind` check, and neither updated
the bullet. Re-syncing a duplicate a third time buys one more cycle.

Also rejected: adding a test that asserts the documented gate order matches the
code. That builds a verifier for a duplicate which need not exist; deleting the
duplicate makes the verifier unnecessary.

The replacement text is in the section above ("The fix"), unchanged. Its shape
is the decision: it names the gates in order and then says *read the chain at
`_maybe_auto_merge`* rather than restating it. The anchor was verified unique
on 2026-09-13; re-verify before applying.

## Change 2 — a new CLAUDE.md meta-bullet (Q3: invariant + why, not mechanism)

The bullets that stayed true state **why**. The bullets that rotted transcribe
**how**. Make that a rule rather than a pattern, and add it to CLAUDE.md:

```
- **State the invariant and why it holds; point at code for the mechanism.**
  A bullet that transcribes a mechanism has a shelf life — "Eligible =
  non-partial AND zero fact-checker warnings" was true when written and wrong
  two tickets later, because nothing ties a CLAUDE.md behavioral claim to the
  code it describes. A bullet that states the invariant and its reason survives
  refactoring: "a blind run cannot auto-merge, because a cursor-backed advance
  proves what the run SAW and a blind run did not see" stays true across any
  reordering of the gate chain. When the mechanism genuinely must be findable,
  name the function and stop — the reader can run `grep`, and the function
  cannot drift from itself. Reference: CCE-101 eligibility claim, stale from
  CCE-140 (2026-06) until 2026-09.
```

## Change 3 — ordering convention (Q4: adopt now, independent of CCE-176)

**Why now rather than after CCE-176.** CCE-176 records that
`load_voice_samples` truncates at 20,000 chars and that CLAUDE.md is 41,475 —
so the newest 52% never reaches `page-author`. Because the file is append-only
by convention, every new lesson lands precisely where the agent cannot read it.
Fixing the loader fixes today's cap; a file ordered to degrade gracefully
survives whatever the cap becomes next.

Adopt: **most load-bearing invariants first; provenance, incident narratives
and trap lists after.** If a cap truncates, it should cut history, not rules.

This composes with change 2 — invariants are short and belong at the top;
the "four traps this touched", incident timelines, run IDs and spec links are
exactly what should fall below any cut.

The reordering pass is a large diff with no behavioral change. Do it as its own
PR, never mixed with a content edit, so the diff stays reviewable.

**Measured starting point (2026-09-13, CLAUDE.md at 41,475 chars):**

| | Above the 20,000 cut | Below (invisible to the agent) |
| --- | --- | --- |
| Bullets | 22 | 4 |
| Notable | the stale CCE-101 claim at offset 8,075 | CCE-124, 139, 141, 151 and the whole SDD fidelity-gate section |

The compounding case worth fixing first: the agent reads the stale CCE-101
claim and is structurally prevented from reaching the CCE-144 bullet that
contradicts it.

## Not decided here

Whether change 3 warrants its own CCE ticket. It is recorded here either way;
CCE-176 covers the loader defect, not the authoring convention.
