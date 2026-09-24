# CCE-183 handoff — agent payload/output bounds

**Written:** 2026-09-24T04:14Z (2026-09-23 21:14 PDT)
**Predecessor session:** write-fenced on `theoju/engineering-docs-agent`; diagnosis and Jira only, zero code written.
**Paste the "Proceed prompt" at the bottom into a fresh session.**

---

## 0. Before anything else — the write fence

The predecessor session was write-fenced and could not fix anything. Confirm you are not:

```
cd /Users/theo/Projects/engineering-docs-agent && touch .wprobe && rm .wprobe && echo WRITES OK
```

If it prints `Operation not permitted`, **stop**. Diagnosis: `echo $CLAUDE_CODE_CHILD_SESSION` returns `1`, meaning this session inherited a seatbelt profile from a parent Claude process. Writes to `~` and the scratchpad still succeed; only the project path is denied (EPERM, not EACCES). Fix: relaunch from a terminal tab that is not a descendant of another Claude process.

Two hooks will interrupt you. Handle them rather than fighting them:

1. **Fact-forcing gate** — before your _first_ Bash command, print (a) the request in one sentence, (b) what that command verifies. Then re-issue the same command. A similar gate fires before `Write` on a new file.
2. **graphify** — run one `graphify query "<question>"` before grepping source files. Once per session is enough.

---

## 1. Where things stand

| Ticket                       | State                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **CCE-175** pipeline freeze  | **Resolved.** PR #274 (baseline-age stall clock), narrowed by #276 (forgive only the prefix blocker). Verified in production. |
| **CCE-183** payload bounds   | **Open, fully specified.** Widened from a per-field cap to an architectural fix. Nothing implemented.                         |
| **CCE-176** voice-sample cap | Backlog, queued behind CCE-183.                                                                                               |
| PR #282                      | Open, unmerged, `(partial)` — the failed 2026-09-23 run.                                                                      |

### CCE-175 is genuinely fixed — do not reinvestigate

Verified against production state on 2026-09-22:

- Baseline moved `12c3125c` (2026-08-22, 31 days stale) → `37f28858` (2026-09-22).
- `deferral_counts` went from a frozen `{#221: 1}` to **18 live entries** — the counter ratchets again because the docs PR now merges and promotes `state.json`.
- PR #280 auto-merged. First docs-agent PR to merge in a month.
- **Only one PR was abandoned:** `skipped_prs` holds `#221` alone, one page (`core/whats-new.md`). PR #276 landed before the stall clock first fired, so the window was processed rather than discarded wholesale.

**The `pr_by_number` filtering-asymmetry hypothesis in the original CCE-175 brief was REFUTED.** `deferred_pages_by_pr` is initialized empty each run and never read from state; its sole writer takes `pr_number` from `per_target` batches, which come from `summaries`, which are only appended inside the window loop — and the cached-summary append explicitly overrides `"pr_number": pr["number"]` _after_ the dict spread. `admission_deferred` is a slice of `prs`. So both sets are closed under the window and cannot diverge. The `if n in pr_by_number` guard is defensive dead code, not a defect. Do not re-derive this.

---

## 2. The live defect: CCE-183

`https://designitright.atlassian.net/browse/CCE-183` — read it first; it is complete and current.

### The incident

Run `35862057776`, 2026-09-23T12:41:16Z, exit 1, produced PR #282. Digest in full:

```
- prose_contamination_rescued: source-collector
- schema_invalid: source-collector: 'prs' is a required property
```

`source-collector` is blocking, so `schema_invalid` is blind-by-default (CCE-144) → exit 1, watermark frozen, auto-merge refused. **Every interlock behaved correctly.** The bug is upstream.

### It is NOT a subscription or rate limit

Ruled out from the forensics artifact, not inferred:

```
returncode 0 | stop_reason end_turn | stderr 0 bytes | service_tier standard
duration_ms 1073087 (17.9 min, 36 turns, 34 tool calls) | cost $2.66 | output_tokens 114052
```

The agent finished normally and produced _more than it could return_. stdout was 90,684 bytes of Jira prose (CCE-150's body, escaped `\n` intact), no `prs` key, unparseable as JSON.

### Two independent overflow paths — this is the core insight

A first draft proposed one byte budget at the dispatch choke point. **An adversarial critic refuted it against the motivating incident.** Both controls are needed:

**Path A — the agent's own tool ingestion. Caused the incident.**
source-collector's _payload_ is five scalars, ~300 bytes. The 130,203 chars of Jira descriptions and 92,635 of PR bodies entered via the agent's **own tools** — `agents/source-collector.md` grants `Bash`/`Read`/`WebFetch` and the agent runs `gh api` and `curl` against Jira itself. A payload budget would have measured 300 bytes and passed. The binding ceiling was the model's **output-token** limit; nothing measures tokens, and `base_argv` carries no `--max-turns` or output-size flag.

**Path B — payload serialization. Unfired, and worse when it fires.**
Every dispatch reaches one line in `scripts/orchestrator_runner.py:dispatch_subagent`:

```python
prompt = _EXECUTION_FRAMING.format(payload=json.dumps(inputs))
```

That becomes a **single argv element**. `ubuntu-latest` caps one element at `MAX_ARG_STRLEN` = 131,072 bytes (measured 131,071 in `python:3.12-slim`) — not the ~1 MB `ARG_MAX`. Nothing measures `len(prompt)` anywhere in `scripts/`. `dispatch_subagent` catches only `FileNotFoundError`, so `OSError(E2BIG)` escapes it, escapes `run`'s `except`-less `try:`/`finally:`, and exits via `sys.exit(main())` as a traceback — **no `add_partial`, no classified reason, no persisted state.** It bypasses CCE-144 entirely.

### The choke point, verified

It is in `dispatch_subagent`, **one frame below `dispatch_validated`**. `dispatch_validated` → `dispatch_subagent`; `dispatch_verified` → `dispatch_validated`; **`scripts/verify_runner.py` calls `dispatch_subagent` directly**, so bounding at `dispatch_validated` leaves a live site uncovered. **11** payload-constructing call sites (8 in `orchestrator_runner.py`, 3 in `verify_runner.py`).

**Load-bearing caveat:** the dry-run branch returns _before_ the serialization line. This repo's convention is that all tests use the dry-run path, so a budget placed there is production-only and the fixture suite would never exercise it — the exact CCE-141 measurement-(b) failure shape. **The test must call `dispatch_subagent` with `dry_run_dir=None` and a stubbed `subprocess.run`.**

---

## 3. Established facts — do not re-derive

| Fact                                                        | Value                                                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Truncation sites in `scripts/`                              | 28 total: **27** bound error/display strings, **1** bounds subagent text, **0** bound an output         |
| The 1                                                       | `scripts/state_io.py:load_voice_samples`, `cap = 20_000` — the **working control case, not a defect**   |
| `maxLength`/`maxItems`/`maxProperties` in `agents/schemas/` | **zero across all 8 files**                                                                             |
| Jira descriptions, current pending window                   | 110,505 chars / 30 issues; 27 of 30 over 2 KB                                                           |
| Raw ADF vs flattened                                        | ~2.7x                                                                                                   |
| PR bodies, worst contiguous 20-PR span                      | 91,374 chars                                                                                            |
| PR bodies, worst 14 days                                    | 233,185 chars                                                                                           |
| `jira_context` dedupe                                       | none; `jira_keys` has no `uniqueItems` (PR #238: 16 raw matches / 6 unique keys)                        |
| `_clip_prs_to_window`                                       | returns `prs` **unfiltered** when `last_sha` is empty — a fresh host's window is the whole repo history |

Nightly cron is `7 7 * * *` but **actual starts are 12:11–13:51 UTC** (GitHub defers scheduled workflows). Do not schedule checks for 07:07.

Failure pattern is ~50%, tracking window size: Sep 18 fail, 19 ok, 20 fail, 21 ok, 22 ok, 23 fail.

---

## 4. Work, ranked

1. **Widen `except FileNotFoundError` → `except OSError` in `dispatch_subagent`.** Three lines. Closes a crash-outside-classification bug independent of any cap. Smallest real step; do this first. Fold in `jira_lookup`'s `issue["key"]` bare subscript — `jira_issues` is typed with no `items`, so a schema-valid entry lacking `key` raises `KeyError` in the same `except`-less `try:`.
2. **Path A controls** — `maxLength`/`maxItems` across `agents/schemas/`, an explicit fetch budget in each agent contract (not prose), and an output-token ceiling in `base_argv`. **This is the one that closes the actual incident.**
3. **Path B byte budget** at the serialization line, ceiling below 131,072, measured in **bytes** not chars (`json.dumps` defaults `ensure_ascii=True`, so 20,000 non-ASCII chars → ~120 KB).
4. **`fixed`/`elastic` field disposition** declared at each call site with a deterministic trim order, plus a coverage test mirroring `tests/orchestrator/test_classification_coverage.py` (AST walk + meta-test over a fixture probe + population tripwire).
5. **Reclassify overflow as `degraded`** with `payload_trimmed: <agent> <bytes>/<ceiling>`, and log measured size per dispatch as `info_only`.

---

## 5. Traps — read before editing

- **Do not change the classification of any `time_budget_exceeded` call site.** Marking one blind reinstates the CCE-109 doom loop. Guards: `tests/orchestrator/test_time_budget.py`, `test_deferral_skip.py`, `test_cursor_backed_merge.py`. The **authoring site is the thinnest-guarded (2 tests)** — treat changes near it as untested.
- **Do not build a central field-policy registry.** One was prototyped and rejected for CCE-144: keys collide in `verify_runner` and registries decay. Enforce at the call site.
- **Do not reintroduce citation repair** in any form (CCE-141 — detection only; there must never be a `write_text` in `scripts/citation_repair.py`).
- **`tests/scripts/` must stay a non-package** — no `__init__.py`. Import via `from scripts.lint import ...`, never `sys.path.insert`.
- **Schema + agent `.md` must change in lockstep** — `tests/agents/test_schema_md_sync.py` asserts `json.loads`-equality. Then regenerate contract docs with `scripts/contracts_doc.py`; never hand-edit `docs/site-src/api/contracts/*.schema.md`.
- Branch `fix/CCE-183-<slug>`, PR title contains `CCE-183`, no direct commits to `main`. Merge only on a green _integrated_ suite (merge `main` into your branch locally, run full `python3 -m pytest`).
- Run `scripts/prune_merged_branches.py --apply` after any batch of merges.

### One unverified claim — confirm before acting

`_pr_changed_files` reads `.path` while real source-collector output may key file entries `filename`. If true, `grounding`, `source_paths`, and a created page's `source_files` frontmatter are **silently empty** on that arm. The helper side is verified; the archive side is not. Check against run `35862057776`'s forensics artifact before acting on it.

---

## 6. Artifacts

- `docs/superpowers/artifacts/2026-09-23-cce183-payload-audit-synthesis.md` — full audit (24,869 B)
- `docs/superpowers/artifacts/2026-09-23-cce183-payload-audit-critique.md` — the completeness critique that refuted the first draft (7,469 B)
- Forensics: `gh run download 35862057776 -n docs-agent-subagent-forensics-35862057776-1` — **GitHub expires artifacts; re-download before it ages out.**
- Audit provenance: 6 search angles → 138 raw findings → 76 unique → 3 adversarial lenses each → ~55 distinct confirmed. 236 agents.

## 7. Queued behind CCE-183 — do not start

CCE-176 (voice-sample cap), then the three CLAUDE.md changes in order 3 → 1 → 2 per `docs/superpowers/2026-09-13-cce101-eligibility-claim-followup.md`.

---

## Proceed prompt — paste this into the new session

> Work CCE-183 in `theoju/engineering-docs-agent`.
>
> First: `cd /Users/theo/Projects/engineering-docs-agent && touch .wprobe && rm .wprobe && echo WRITES OK`. If it prints `Operation not permitted`, stop and tell me — the session inherited a stale seatbelt profile and must be relaunched from a terminal tab that is not a descendant of another Claude process.
>
> Then read `~/Projects/claude-extensions/docs/superpowers/cce-183-handoff-prompt.md` in full, and the Jira ticket CCE-183. Everything in them is established — do not re-derive it, and do not re-investigate CCE-175, which is fixed.
>
> Use `superpowers:systematic-debugging` and TDD. Start with item 1 of section 4 (widen `except FileNotFoundError` to `except OSError` in `dispatch_subagent`, plus the `jira_lookup` `KeyError`) — failing test first, and note that the test must exercise `dispatch_subagent` with `dry_run_dir=None` and a stubbed `subprocess.run`, because the dry-run branch returns before the line under test.
>
> Stop and check with me before starting item 2, so we can agree the Path A design before code.
>
> Respect every trap in section 5, especially: never change a `time_budget_exceeded` classification, and no central field-policy registry.
