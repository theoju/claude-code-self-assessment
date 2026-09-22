# Incident: the docs-agent baseline has been frozen for 23 days

**Host:** `theoju/engineering-docs-agent` (the dogfood host).
**Frozen since:** 2026-08-22. Last merged nightly: PR #240, same day.
**Status:** **Resolved 2026-09-21** — see _Resolution_ below. The open
sub-question was never answered; the fix removed its relevance.
**Diagnosed:** 2026-09-14, from a session write-fenced to the subject repo
(reads and `gh` only — see repo-fence postmortem, reusable lesson 7).
**Baseline on this host:** **advanced to `2026-09-22T12:31`** — the first
promotion since 2026-08-22. The 09-22 nightly (PR #280) auto-merged at 13:10Z
after the stall escape forgave the oldest deferred PR. PR #275, the pre-fix
09-21 run, was closed as superseded.

## Resolution (2026-09-21)

Fixed in `engineering-docs-agent` — not by answering the sub-question below,
but by removing the counter from the escape path entirely:

- **CCE-175 / PR #274** — the hatch now keys off
  `last_successful_run.completed_at`, which already lives on the default branch
  and was written but never read. It measures time since anything was promoted.
  A night that holds nothing back is cursor-backed, so it auto-merges, and
  merging resets the clock: progress and clock-reset are the same event.
  `resolve_deferral_stall_days` derives its default as `threshold + 1`, keeping
  the clock a time-domain mirror of the counter.
- **CCE-178 / PR #276** — the first production firing exposed two defects in
  that fix. Emptying `held_back` routed the run through the `else` branch with
  `advance_cursor_backed = False`, so the forgiven run still could not merge —
  the same deadlock one layer up; the flag is now `bool(skipped_numbers)`.
  Separately the escape forgave every deferred PR, including two at **0**
  deferrals that were blocked by an unrelated page, so forgiveness is now
  limited to the prefix blocker.
- **CCE-179 / PR #277** — both lessons recorded in the plugin's `CLAUDE.md`.

**What this note got right:** the deadlock itself — a counter that persists
only on merge, in the one state where nothing merges. PR #274's own measurement
reproduces it on the sibling host.

**What is still unexplained:** the asymmetry described under _Open
sub-question_. On `claude-code-self-assessment` the counts **did** increment on
the run branch (`{#235: 2, #236: 2, #240: 1, #243: 1}` against
`{#235: 1, #236: 1}` on `main`), while on this host the branch map was
byte-identical to `main` — no increment at all. The second-defect hypothesis
was neither confirmed nor refuted. It gates nothing now, because the escape no
longer reads the counter.

**One reading below is wrong, corrected by the first successful run.** This
note treats `#221: 1` as a fossil carried forward from a PR that had left the
window. It had not left. PR #280's log reads `forgiving the oldest deferred PR
#221`, `skipped after 1 consecutive deferrals (threshold 3);
pages=core/whats-new.md`, and CCE-178 forgives **only** the prefix blocker — so
#221, a source PR merged 2026-08-14, was the live blocker for the whole
31.2-day stall, pinned at 1. That sharpens the open question instead of
answering it: the increment never ran for the one PR that was deferred every
single night.

## Symptom

Every nightly since at least 2026-09-09 opens a PR, reports `partial`, and
leaves `last_successful_run` untouched at `12c3125c` / `2026-08-22`. The window
has grown to 15 PRs, which is now itself enough to trip `time_budget_exceeded`.

## The proximate cause rotates; the outcome does not

| Night | Content failure        | Structural outcome               |
| ----- | ---------------------- | -------------------------------- |
| 09-09 | `lint_block`           | `held_back_no_advance_no_cursor` |
| 09-10 | `lint_block`           | same                             |
| 09-11 | `schema_invalid`       | same                             |
| 09-12 | `time_budget_exceeded` | same                             |
| 09-13 | `time_budget_exceeded` | same                             |
| 09-14 | `schema_invalid`       | same                             |

Three different triggers, one invariant result, plus `auto_merge_skipped:
partial_run` on all six. **Fixing any single trigger changes nothing** — they
are interchangeable entry points into the same trap. This is why the
investigation did not stop at `schema_invalid: page-author: None is not of type
'string'`, which is merely the newest one.

## Root cause: the release valve is behind the door it is meant to open

1. Any content failure defers a page belonging to the OLDEST in-window PR.
2. `held_back` becomes non-empty, so CCE-151's cursor walk runs. Because the
   held PR is the first one, the cursor prefix is empty: `cursor is None`,
   `advance_sha = prior_baseline_sha`, `advance_cursor_backed = False`.
3. The run is `partial` with `advance_cursor_backed = False`, so CCE-140's gate
   in `_maybe_auto_merge` returns `skip("partial_run")`.
4. The PR stays open. `state.json` — which carries `deferral_counts` — exists
   only on that PR branch. D2 auto-close sweeps it the next night
   (`auto_close_succeeded`).
5. The next run reads `main`'s `state.json`: same baseline, same counts.
6. Goto 1.

CCE-140 built the deferral-skip hatch precisely against this: _"Skip after 3
consecutive deferrals... A loud, recorded loss beats an indefinite silent
stall."_ But the counter that arms the hatch is persisted in the artifact the
stall prevents from landing. **The valve can never reach its own threshold.**

This is the CCE-109 doom loop reinstated by a route neither CCE-140 nor CCE-151
closed. It is NOT a recurrence of CCE-152 — that fix (`fc65ab8`, PR #227) is in
`main` and predates every failing night; the structural signature is identical
but the cause differs.

## Evidence

- `origin/main:.engineering-docs-agent/state.json` →
  `deferral_counts: {"theoju/engineering-docs-agent#221": 1}`,
  `last_successful_run.completed_at: 2026-08-22T07:37:35`.
- The 2026-09-14 run branch (`docs-agent/2026-09-14T13`) writes the
  **byte-identical** map. Unchanged across 23 days and ~23 runs.
- `resolve_deferral_threshold` default is 3 (`DEFAULT_DEFERRAL_SKIP_THRESHOLD`).
- `gh pr list --state merged` — no `docs(agent)` PR merged after #240 (2026-08-22).
- Run log 34851678226: `schema_invalid` at 14:00:27 (first authoring dispatch),
  `held_back_no_advance_no_cursor` at 14:25:09.

## Open sub-question — likely a SECOND defect

The held-back PR should receive `count + 1` each run: `next_deferral_counts`
increments anything in `window_pr_numbers` and `still_deferred_numbers`, and
CCE-151 correctly hoisted `still_deferred` out of the `if time_truncated:`
block. Yet the written map shows **no entry for any currently-held PR** — only
the stale `#221: 1`, which by the function's third rule ("not in this window at
all -> carried forward unchanged") looks like a leaked entry from a PR that left
the window long ago.

So the held PR is not reaching both of those sets. Until that is explained, the
deadlock is permanent rather than self-healing after three nights. Note the
asymmetry at the two construction sites (`scripts/orchestrator_runner.py`, the
CCE-151 cursor-walk block):

```python
_deferred_all = list(admission_deferred) + [
    pr_by_number[n] for n in sorted(deferred_pages_by_pr) if n in pr_by_number   # filtered
]
held_back = (set(deferred_pages_by_pr) | {...}) - skipped_numbers                # unfiltered
```

`held_back` freezes the cursor using the raw keys; the counter only ever sees
keys that survive `n in pr_by_number`. Any key present in one and absent from
the other freezes the baseline while starving the counter — exactly the observed
behaviour. A JSON string-vs-int key mismatch was checked and **ruled out**: both
maps are built in-memory each run from `pr.get("number")` and never round-trip
through JSON. The surviving candidate is a PR present in `deferred_pages_by_pr`
but absent from `prs` / `window_prs`.

### Narrowed 2026-09-16 (source reading, nothing executed)

Three corrections to the framing above, all read from
`scripts/orchestrator_runner.py`. No run was performed.

**1. `window_prs` is not a candidate — it is always the full window.** The
snapshot is taken at `:2247` (`window_prs = list(prs)`, commented "the full
window, oldest-first, before admission truncation") and the only truncation,
`prs = prs[:i]`, is at `:2284`. `pr_by_number` is built at `:2378`, after the
cut. So `window_pr_numbers` contains every held PR, always. Drop "absent from
`window_prs`" from the hypothesis; the asymmetry is `deferred_pages_by_pr` vs
`prs` alone.

**2. The counter does not merely fail to increment — it actively deletes.**
Because a held PR is always in the window, rule 3 ("not in this window at all
-> carried forward unchanged") never protects it. It always lands on the
pop-or-increment branch of `next_deferral_counts` (`:764-769`), so on every
night it is absent from `still_deferred_numbers` its key is `pop`ped. That is
why no held PR ever appears in the map, and it confirms `#221: 1` as a fossil:
#221 has genuinely left the window, so rule 3 does carry it forward. Starvation
was the gentler reading; deletion is what the code does.

> **Wrong, corrected 2026-09-22.** #221 had not left the window — it was the
> oldest deferred PR and the live blocker, which is why the CCE-178 escape
> forgave it. See _Resolution_ above.

**3. `partition_deferrals` is exonerated.** `:731-738` splits on count vs
threshold and drops nothing, so it cannot be the leak.

**Consequence for where to look:** the leak can only occur on a
**non-truncated** night. On a `time_budget_exceeded` night,
`admission_deferred = prs[i:]` enters `_deferred_all` **unfiltered** (`:3008`),
so those PRs do reach `still_deferred` and should increment in-run. Of the six
nights tabulated above, only 09-09, 09-10 (`lint_block`) and 09-11, 09-14
(`schema_invalid`) qualify.

This also means the run-branch `state.json` alone cannot separate the two
defects: on a truncated night an in-run increment should appear and does not,
which the primary root cause already explains (increments exist only on
branches that never merge) without invoking the second defect at all.

## Observability gap found on the way

The nightly log (457 lines) never names which PRs were admitted, deferred, or
held back. The entire diagnosis had to come from diffing `state.json` between
`main` and a run branch. Any fix should log the held-back set.

## Recommended next steps

> **Superseded 2026-09-21.** Steps 1 and 3 were overtaken by CCE-175 (#274) and
> CCE-178 (#276) — see _Resolution_ above. Step 4, the hand rewind, was not
> taken. Kept verbatim for the record.

1. **Reproduce locally** in an unfenced session: run the orchestrator dry-run
   against the real `state.json` and window. Per the 2026-09-16 narrowing, this
   is now **one** question rather than four sets — print
   `set(deferred_pages_by_pr) - set(pr_by_number)` **on a non-truncated night**
   (`time_truncated is False`). A non-empty result names the blocking PR and
   settles the sub-question; an empty result falsifies the second-defect
   hypothesis entirely and sends the investigation back to the primary cause.
   `window_prs` and `still_deferred` no longer need printing —
   `window_pr_numbers` is provably the full window, and `still_deferred` is
   derivable from the difference above. CLAUDE.md's diagnostic reflex for
   CCE-151 says the same: print `deferred_pages_by_pr` and `held_back` before
   suspecting the linter.
2. **Do not** fix `schema_invalid` or the lint block first. The table above
   shows those rotate; the next night simply picks a different trigger.
3. **Structural fix direction:** the deferral counter must advance somewhere
   that does not depend on the blocked PR merging, or the skip hatch must key
   off something durable (run count since baseline, or a timestamp on
   `last_successful_run`) rather than a counter that only persists on merge.
4. **Operational unblock** is a separate decision with real data loss: a
   hand-written baseline rewind abandons documentation of the 15 in-window PRs.
   CCE-151's own incident needed exactly that recovery. Do not do it silently.

## Tickets

**CCE-175** — _Baseline deadlock: the deferral-skip hatch can never arm, because
its counter persists only on merge._ Filed 2026-09-14 as a Bug, carrying the
full analysis. This note remains the primary source. **Done 2026-09-21** via
PR #274, with follow-ups **CCE-178** (#276 — the two defects in that fix) and
**CCE-179** (#277 — the lessons, in the plugin's `CLAUDE.md`), both Done.

Related but distinct, all shipped and all in `main`: CCE-109 (the original doom
loop), CCE-140 (the cursor-backed advance and the skip hatch), CCE-151 (the
cursor walk on every path), CCE-152 (the PR-boundary authoring cut). CCE-175 is
the gap none of them closed.
