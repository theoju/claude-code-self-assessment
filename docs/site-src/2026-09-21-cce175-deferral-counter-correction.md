---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/251
synthesized_into: []
doc_kind: decision
---

# CCE-175 deferral-counter investigation: a diff-methodology correction

PR #250 landed a handoff doc for CCE-175 — the engineering-docs-agent nightly
baseline deadlock — with a diff comparison that turned out to be comparing
`main` against itself. An hour later, PR #251 corrected it. This page records
what was wrong, what the corrected investigation actually found, and the
general lesson worth keeping regardless of how CCE-175 itself resolved.

## What went wrong with the original diff

The original investigation ran `git fetch origin pull/272/head:pr272` to pull
down the nightly PR under review. The fetch failed, silently, because its
output was piped to `/dev/null`. `FETCH_HEAD` was left pointing at
`origin/main` from an earlier command, so the subsequent diff compared `main`
against `main`. It read the tautological "no difference" as a finding.

That one silent failure produced three separate wrong conclusions:

- **The deferral counter looked stuck.** It isn't. Re-run against the actual
  nightly PR (via `gh pr diff`, not a locally re-resolved `FETCH_HEAD`) shows
  the counter computing fifteen entries per run — `#221` incrementing to 2,
  plus fourteen window PRs newly counted at 1. The counting logic works; what's
  actually stuck is the baseline that would let those counts persist (see
  below).
- **Merge-as-promotion looked dead across the board.** It's dead only for
  *blind* nightly runs — a schema-invalid collector run emits no `state.json`
  at all, so there's nothing to promote. A *degraded* run's `state.json` write
  is promotable: it advances `completed_at` while leaving
  `last_successful_run.head_sha` untouched, which is exactly what makes a
  manual merge of it safe.
- **The ~132-line diff looked like formatting churn.** It isn't — it's real
  content once you're actually diffing the PR branch instead of `main` against
  itself.

## The reversed recommendation

Because a degraded run's `state.json` genuinely is promotable, the corrected
doc reverses the original guidance: manually merging a degraded nightly PR is
a legitimate way to persist deferral counters forward without advancing the
watermark past undocumented work — *provided* you verify
`last_successful_run.head_sha` is unchanged in the diff before each merge.
Skip that check and a couple of merged nightlies could arm the deferral
threshold without any real code having moved the baseline.

The corrected doc also retracts an "unstable serializer" theory that had been
floated to explain the earlier (illusory) empty diff. There was no serializer
instability — there was a fetch failure feeding a comparison that should never
have run at all.

## Root cause status

To be clear about scope: this correction is about the diff methodology, not
about CCE-175's root cause. The original root-cause finding — the counters
increment correctly inside each run and are then discarded because the
carrying PR never merges, so the baseline never moves and the threshold of 3
is unreachable — stands. It's confirmed by the corrected diff, not
superseded by it. (CCE-175 was later closed by a stall-clock fix in a
follow-up PR; the freeze itself turned out to have a second, still-open half
in blind — as opposed to degraded — nightly runs, tracked separately. Neither
of those later developments changes anything in this correction.)

## The general lesson

The reusable warning here isn't specific to CCE-175:

**Resolve a PR ref explicitly, and check that the resolution succeeded before
you diff against it.** Use `gh pr diff <N>`, or `gh pr view <N> --json
headRefOid` followed by `git show <sha>:<path>`. Never let a fetch failure
reach a comparison — and never pipe a fetch failure to `/dev/null`, because
that's exactly what turns a loud error into a silent wrong answer.
