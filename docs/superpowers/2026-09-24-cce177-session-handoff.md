# Session handoff — 2026-09-24, docs-agent pipeline

Written at a clean stop: PR #284 merged, nothing in flight, one scheduled routine armed.

**Supersedes `cce-177-handoff-prompt.md`** (2026-09-23, commit `270f21e`). That file
predates PR #283 and #284, does not know CCE-185 exists, and its launch check sends
you at the write-fenced clone — see the fence note below.

**How to use this file.** Start a fresh session, paste **Prompt 1** (context), then
paste **Prompt 2** (what to do). They also work pasted together. Prompt 1 asserts no
tasks; Prompt 2 carries all the instructions.

---

## ⚠️ Read this before anything else

`~/Projects/eda-cce181` is on branch `fix/CCE-177-source-collector-output-ceiling`
with **10+ commits that exist only on this machine** — no remote branch, never
pushed. Last commit `6c7e218`, 2026-09-23 20:54 PDT. That work was authored by a
different session than the one writing this file.

The repo's own CLAUDE.md records a 2026-08-26 incident where a hook and a 25-test
harness were permanently lost to an ephemeral location. Push that branch first:

```bash
git -C ~/Projects/eda-cce181 push -u origin fix/CCE-177-source-collector-output-ceiling
```

Do not rebase, squash, or reset it — treat it as another session's in-progress work.

---

# PROMPT 1 — Context

Paste this into a fresh session.

---

You are picking up work on the `theoju/engineering-docs-agent` nightly documentation
pipeline. This message is context only — do not start any task from it.

## Repos, and a write fence that will cost you an hour if you miss it

- `~/Projects/engineering-docs-agent` — the canonical clone. **It is write-fenced**
  (`touch: .wprobe: Operation not permitted`) from an inherited seatbelt profile plus
  a user-tier deny rule. Reads work; `git fetch` does not (it cannot write
  `.git/FETCH_HEAD`). Do not try to repair this — it needs a terminal tab that is not
  a descendant of another Claude process.
- `~/Projects/eda-cce181` — **the same repo**
  (`git@github.com:theoju/engineering-docs-agent.git`), **writable**, pytest 8.2.0
  present. Full suite ≈ 4–8 minutes. **Do all work here.** A previous session asked
  for a relaunch four times before noticing this clone one directory over.
- `~/Projects/claude-extensions` — writable; pushes to
  `theoju/claude-code-self-assessment`. Holds specs, handoffs and prototypes under
  `docs/superpowers/`.

## What the pipeline is

A nightly GitHub Actions workflow (07:07 UTC) turns merged PRs into documentation and
advances a **baseline** cursor in `.engineering-docs-agent/state.json`
(`last_successful_run.head_sha`). A PR whose page fails to land is _held back_, and
the baseline may not advance past it — one stuck PR blocks everything behind it. The
cursor is consume-once: a window it skips is never re-read.

## Current state (verified 2026-09-24T04:00Z)

- `main` tip `f836898` (CCE-185 pin) on top of `137240e` (CCE-169 window cap).
- Baseline `37f288581f2cf1987e5a531b1477bdb48385a9b9`, `completed_at`
  `2026-09-22T12:31:07.715055+00:00`.
- Run #282 (2026-09-23) did **not** advance: source-collector returned schema-invalid
  output (missing required `prs`), classifying the run _blind_.
- Same failure on 3 of the last 6 nights — 09-18, 09-20, 09-23. That is CCE-177.
- Full suite on `main`: **1644 passed, 4 skipped**.

## What landed in the previous session

- **PR #284** (`f836898`) — merged. One test, zero production change: pins the `i > 0`
  clause in the admission gate. Mutation-verified green-with / red-without.
- **PR #283** (`137240e`) — CCE-169 window cap, merged by another session. Bounds the
  review window to the oldest N PRs before admission; default 10, **default-ON**. The
  2026-09-24 nightly is its first production exercise.
- **PR #259** on `theoju/claude-code-self-assessment` — **still open**. Captures a
  throwaway logic prototype and its retraction.

## A correction you must not re-derive

A logic prototype was built to answer "which PR should the stall escape forgive?" It
reported a confident **silent freeze** when `i == 0` (budget exhausted before any PR
was admitted). That became ticket **CCE-185**.

**It was wrong.** The real admission gate reads:

```python
if deadline is not None and i > 0 and clock() > deadline:
```

`and i > 0` means the gate never truncates before admitting the oldest PR, so `prs` is
never emptied and CCE-178's blocker scan always has a candidate. The prototype had
ported the truncation but **not the guard on it**, and accepted `admittedCount: 0` as
a legal state.

It was caught because the end-to-end test written to reproduce the defect **passed on
first run**. Consequences:

- **CCE-185 Defect 1 does not exist.** Do not act on it. The ticket carries a full
  retraction.
- **CCE-185 Defect 2 is unverified** — it rests on a synthetic `advanceRefused` flag
  never checked against the real CCE-109 anchoring guards.
- The "CCE-169 does not subsume CCE-185" analysis **also falls**; its decisive
  scenario was Defect 1 inside a cap.
- What survives: the `i > 0` clause is load-bearing, and is now pinned.

**Transferable lesson, recorded in PR #259:** a logic prototype is worth only its
fidelity at the exact clause under test. Port the guard, not just the operation.

## History worth knowing

The deferral / cursor / forgiveness machinery has taken six shipped corrections —
CCE-109, 140, 144, 151, 175, 178 — each fixing the previous fix. The pipeline has
frozen silently for multiple weeks **twice**, and both times every nightly run
reported green. There is **no baseline-age alarm**; `baseline_age` appears only inside
`orchestrator_runner.py`.

## Scheduled

A one-time cloud routine fires **2026-09-24T08:15:00Z** and emails
theo.jungeblut@gmail.com, subject `docs-agent: baseline ADVANCED` / `STUCK` /
`UNKNOWN`. Routine: https://claude.ai/code/routines/trig_013uj8TfG1mr5qeXrBLKAPkU
If that mail has arrived, its verdict beats re-deriving the state.

## Standing constraints

- Branch `<type>/CCE-<number>-<slug>`; PR title contains the CCE key. No direct
  commits to `main`.
- **Merge only on a green integrated suite** — merge `main` into your branch locally
  and run the full `python3 -m pytest`. GitHub's mergeable flag is not sufficient, and
  branch protection forces checks to re-run after any push to the head.
- Do **not** change the classification of any `time_budget_exceeded` call site
  (CCE-144). The authoring site has only 2 guarding tests; treat changes near it as
  untested.
- Do **not** reintroduce citation repair (CCE-141 — detection only; no `write_text` in
  `scripts/citation_repair.py`).
- `tests/scripts/` stays a non-package (no `__init__.py`); import via
  `from scripts.lint import ...`.
- Run `scripts/prune_merged_branches.py --apply` after any batch of merges.

---

# PROMPT 2 — What to do

Paste this after Prompt 1.

---

Work the following in order, in `~/Projects/eda-cce181`.

**Step 0 — protect unpushed work (2 minutes, first).**
That clone is on `fix/CCE-177-source-collector-output-ceiling` with 10+ commits that
exist nowhere else. Push the branch as-is:
`git push -u origin fix/CCE-177-source-collector-output-ceiling`. Do not rebase or
reset — another session authored it. Then report what is on it.

**Step 1 — read the verdict (5 minutes).** Check whether the 08:15Z email arrived, or
read state directly:

```bash
gh api repos/theoju/engineering-docs-agent/contents/.engineering-docs-agent/state.json \
  --jq .content | base64 -d | python3 -m json.tool | head -25
gh run list --repo theoju/engineering-docs-agent --workflow=docs-agent-nightly.yml --limit 3
```

Did `last_successful_run.head_sha` move off `37f28858…`? Report any new `skipped_prs`
entries — each is a permanently undocumented PR.

**Step 2 — CCE-177 (the priority).** Source-collector returns schema-invalid output
(missing required `prs`) on 3 of the last 6 nights; it is why run #282 did not
advance. Substantial work already exists on the Step-0 branch — **read it before
writing anything** and continue it rather than restarting. The recorded next
diagnostic: capture the raw pre-rescue source-collector payload on a blind night, to
separate truncation from malformed-but-complete output.

**Step 3 — baseline-age alarm (~2 hours).** A scheduled job that fails loudly when
`last_successful_run.completed_at` exceeds N days, independent of run status. Both
multi-week freezes were invisible because every run was green. Needs no orchestrator
change: read `state.json` from `main`, compare to now, exit non-zero. This is the
control that would have caught both incidents, and it is cheaper than either fix it
would have surfaced.

**Step 4 — dispose of CCE-185 (1 minute).** Defect 1 is retracted and its pin is
merged. Either close the ticket, or re-scope it to Defect 2 **only after** someone
reproduces Defect 2 against the real runner. Left as filed, a retracted ticket looks
actionable.

**Step 5 — then the existing queue.** CCE-176 (voice-sample 20KB cap), then the three
CLAUDE.md changes in the recorded order 3 → 1 → 2 (see
`docs/superpowers/2026-09-13-cce101-eligibility-claim-followup.md` in
`~/Projects/claude-extensions`). CCE-155 (resumable page groups) is the successor
risk — the window cap bounds the window, but not the first page group.

**Also open:** PR #259 on `theoju/claude-code-self-assessment` (prototype capture +
retraction). Merge or close it; it is documentation only.

**What not to do.** Do not chase CCE-185 Defect 2 ahead of CCE-177. Do not add another
mechanism to the deferral/forgiveness machine without a production failure to point
at — six shipped corrections so far, and the last investigation produced a confident
defect report for a state the code cannot enter. When a model and the source disagree,
the source wins: check the guard, not just the operation.
