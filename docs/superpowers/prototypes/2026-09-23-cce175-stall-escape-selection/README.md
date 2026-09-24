# Which PR should the stall escape forgive?

Throwaway logic prototype, 2026-09-23. Captured as a primary source per
`mattpocock-skills:prototype` step 5. **Not production code — do not import.**

Open `prototype.html` by double-clicking it. Everything is inline; nothing to install.

## The question

`scripts/orchestrator_runner.py` in `theoju/engineering-docs-agent` advances a
baseline cursor over merged PRs, oldest-first. A PR whose page did not land is
_held back_, and the cursor may not advance past it. CCE-175 added a stall clock
that forgives a held-back PR — abandoning its documentation permanently — once the
baseline has not moved for `deferral_skip_threshold + 1` days. CCE-178 narrowed
that from "forgive everything deferred" to "forgive the oldest deferred PR".

**Which PR should be forgiven, and when?** Forgive too eagerly and work that was
never attempted is destroyed. Forgive too cautiously and the pipeline freezes
silently — which it did for 31 days (baseline pinned at `12c3125c`, 2026-08-22).

## Why it needed a prototype

Reading the code suggested a one-word fix. The prototype falsified it in one
scenario and then surfaced a second, independent defect that code reading had not
touched at all.

## Rules compared

| rule          | selection                                                                    |
| ------------- | ---------------------------------------------------------------------------- |
| `current`     | first PR in `prs` (the **post-truncation** admitted prefix) that is deferred |
| `windowScan`  | first PR in `window_prs` (full window) that is deferred                      |
| `cursorAware` | `windowScan`, but only if the baseline cannot already move                   |
| `prefixStuck` | `windowScan`, but only if the unforgiven cursor prefix is **empty**          |

## Results

| scenario                             | `current`         | `windowScan`       | `cursorAware`      | `prefixStuck`       |
| ------------------------------------ | ----------------- | ------------------ | ------------------ | ------------------- |
| 1. normal stuck night                | forgive 221       | ✓                  | ✓                  | ✓                   |
| 2. nothing attempted (`i == 0`)      | **SILENT FREEZE** | ✓                  | ✓                  | ✓                   |
| 3. healthy night                     | no loss           | ✓                  | ✓                  | ✓                   |
| 4. stalled, prefix clean             | no loss           | **loses 224**      | ✓                  | ✓                   |
| 5. stuck front + backlog             | forgive 219       | ✓                  | ✓                  | ✓                   |
| 6. advance refused by CCE-109 guards | **SILENT FREEZE** | lost, still frozen | lost, still frozen | frozen, unexplained |

Reproduce with `node run.js`.

## Does the CCE-169 window cap subsume this? No.

Asked 2026-09-23 because most of the complexity here — `admission_deferred`,
`time_truncated`, the two-population `held_back`, the `prs` vs `window_prs`
asymmetry — exists only because a run admits an unbounded window and then
truncates it mid-flight. If CCE-169 bounds the window before admission, does
`prs == window_prs` make Defect 1 unreachable rather than merely guarded?

| scenario                                | `current`           | verdict              |
| --------------------------------------- | ------------------- | -------------------- |
| 7. cap=10, the capped window drains     | moved, nothing lost | Defect 1 unreachable |
| 8. cap=10, first PR's group undrainable | **SILENT FREEZE**   | Defect 1 unchanged   |

**The cap bounds the window; it does not bound the first page group.** `i == 0`
is caused by the oldest PR's group being larger than the budget, which is
orthogonal to how many PRs the window holds. That is CCE-155 (resumable page
groups, still Backlog), and CCE-169's own ticket records the production
instance on the ADIS host:

```
time_budget_exceeded: authored 3/152 page batches (budget 2340s); deferring the rest
time_budget_no_advance_no_cursor: truncated run had no admitted PR with a usable merge_sha
```

A run that authored 3 of 152 batches could not finish the first PR's group.
Capping that window at 10 PRs changes 152 to something smaller and leaves the
first group exactly as undrainable.

**The cap also costs a signal.** Today an operator can see a stall because the
window is visibly enormous. Under a cap the window is always small, so a
first-group stall looks like a healthy run against a short window. That makes
CCE-185 Part 2 — emit a stall reason whenever `_stalled and not
baseline_moved`, independent of `_forgive` — _more_ load-bearing after CCE-169
lands, not less.

Ship both. They are orthogonal: CCE-169 bounds how much work a run faces,
CCE-185 makes the escape reachable and the failure audible.

## Verdict — two independent parts

**Part 1 — selection.** `_blocker` scans `prs`, which has had the
admission-deferred tail removed at the `prs = prs[:i]` truncation, while
`held_back` is built from `deferred_pages_by_pr | admission_deferred`. When
`i == 0` — the time budget exhausted before admitting a single PR — `prs` is
empty, `_blocker` is `None`, nothing is forgiven, `held_back` is the whole
window, and the baseline cannot move. Scan `window_prs` instead, **and forgive
only when the unforgiven cursor prefix is empty.**

The prefix-empty condition is load-bearing. Scenario 4 shows `windowScan` alone
abandoning PR 224 — a PR the run never attempted — in a case where today's code
is correct. That is CCE-178's first-deferral loss returning by another route, and
it is the only cell in the matrix where a proposed fix is _worse_ than the status
quo.

**Part 2 — decouple the diagnostic from the action.** CCE-178 guards the
`deferral_stall_escape` reason on `if _forgive:`. Scenario 6 holds the baseline
via the CCE-109 anchoring guards rather than via `held_back`; forgiveness cannot
help there, so the correct rule declines to forgive — and then records nothing.
Emit a stall reason whenever `_stalled and not baseline_moved`, independent of
whether anything was forgiven. Otherwise the honest rule and the broken rule are
indistinguishable from the outside, which is how 31 days passed unnoticed.

## Scope note

The prototype models `partition_deferrals`, `advance_cursor_list`, the complement
writer, and the CCE-178 blocker selection as of `13511b6c`. It does **not** model
merge gating, `blind` classification, or the CCE-169 window cap. `advanceRefused`
is a single boolean standing in for the whole CCE-109 guard family.

## Status

Design validated, **not implemented**. The session that produced this could not
write to the `engineering-docs-agent` tree (inherited seatbelt profile) and so
could not run `pytest` against a candidate patch. Implementation needs an
unfenced session; write the scenario-2 and scenario-6 tests first, red.
