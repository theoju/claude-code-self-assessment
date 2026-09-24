# Handoff prompt — CCE-177 / 174 / 172 / 176 (paste into a fresh session)

Written 2026-09-23 from a session write-fenced to the subject repo (reads and
`gh` only). Everything below the rule is the prompt; state was verified against
`state.json` on `main` and the nightly PR bodies on the date given.

---

Work four tickets in `~/Projects/engineering-docs-agent` (Jira project `CCE`,
host `theoju/engineering-docs-agent`).

**Launch check, before anything else.** Open this session from a **new terminal
tab** — not from a shell that is a descendant of another Claude process, or it
inherits that process's seatbelt profile and lands write-fenced. Confirm with:

```
touch .wprobe && rm .wprobe && echo WRITES OK
```

If that prints `Operation not permitted`, stop and relaunch from a clean tab.
The profile is compiled at process launch and cannot be reloaded by editing
settings.

**Read first:** the repo's `CLAUDE.md`, then each ticket in Jira. The summaries
below are what a prior session verified from production data; that session did
not read the full description of CCE-177 or CCE-176, so treat those two as
pointers, not briefings.

## State as of 2026-09-23 23:30Z

- The 31-day baseline freeze is **over**. `last_successful_run` advanced to
  `2026-09-22T12:31` when nightly PR #280 auto-merged. CCE-175, CCE-178,
  CCE-179, CCE-180, CCE-181 and CCE-182 are all Done.
- Nightly PR **#282** (created 2026-09-23T12:59, `partial`) is **open** and its
  body carries `schema_invalid: source-collector: 'prs' is a required
property` — CCE-177's exact signature. The same signature appears in #271
  (09-18) and #273 (09-20).
- Open tickets: **CCE-177**, **CCE-176**, **CCE-174**, **CCE-172**, all Backlog.

## Order of work, and why

1. **CCE-177 — blind nightlies.** `source-collector` returns output missing
   `prs`, so the run writes no `state.json` at all. This is the live defect: it
   hit three of the last six nights, including last night. It also disarms the
   CCE-175 stall clock, because a blind run leaves the clock nothing to write.
   Fix this before anything else, or the pipeline's safety net is only as good
   as the nights it actually runs.
2. **CCE-174 — durable counter**, then **CCE-172**, which is blocked on it.
   The design is merged in the sibling repo:
   `~/Projects/claude-extensions/docs/superpowers/specs/2026-09-13-cce172-shortening-observations-design.md`
   (PR #236, `134bb38`). It proposes `citation_shortening_observations` =
   `{total_ever, recent[200 FIFO]}` in `state.json`, mirroring
   `merge_skipped_pr_records` (`state_io.py`, around `:286-309`) — append-only,
   idempotent on `(page, cited, candidate)`, and it must never seed the key.
   Re-verify those line numbers before relying on them.

   The spec carries an exit criterion: **`total_ever >= 20`, or 90 days from
   2026-08-22**, after which zero findings means deleting the CCE-141 detector
   rather than carrying it further. Honour it; it is the point of the ticket.

3. **CCE-176 — voice-sample cap** silently discards a configured sample and the
   newest half of `CLAUDE.md`. Lowest urgency, but it is silent data loss, so
   do not let it age out.

## Constraints that have cost time before

- `PYTHONDONTWRITEBYTECODE=1` on every Python invocation inside this repo. The
  agent stages with `git add -A .`, so a stray `__pycache__` lands in a docs PR.
- Write PR and commit bodies to a **file** and pass `--body-file` / `-F`. The
  destructive-command hook scans literal command text including heredoc bodies,
  so a body that merely quotes a blocked pattern blocks the whole command.
- Jira writes are authorised **per action**, not per session. Ask before each
  `createJiraIssue`, `addCommentToJiraIssue` or `transitionJiraIssue`.
- Do not rewind the baseline by hand. It is moving again on its own.
- Do not work from `docs/superpowers/cce-175-handoff-prompt.md` in the sibling
  repo. It is marked superseded and CCE-175 is Done.

## Method warnings from the cycle that just closed

- **Path-divergent tests are not coverage.** CCE-175 shipped a defect behind a
  green end-to-end test: the test asserted the right value on the branch reached
  by `time_budget_seconds=100`, while production takes the other branch. Assert
  the value on the path production actually takes.
- **When a prototype and a test agree, check whether they share the same wrong
  assumption** before treating the agreement as corroboration. That is how the
  same defect got confirmed twice.
- **A zero from a key that never existed looks exactly like a real zero.** Print
  the object's real keys before trusting a count, and prove the recording
  channel works by finding some other value it captured.
- **Verify before claiming.** Read the code and run the one-shot invocation
  rather than reasoning from a function's name or a document's summary.

## What to report back

For each ticket: the PR number, what was measured rather than inferred, and
anything the fix deliberately did not cover. If CCE-177's root cause turns out
to sit outside `source-collector`, say so before fixing anything downstream of
it.
