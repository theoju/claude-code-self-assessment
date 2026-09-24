## 1. Modality not searched

**The agent's own tool-call ingestion surface** — `tools:` frontmatter → `--allowedTools` → the subagent running `gh api`, `curl`, `Read`, `WebFetch` itself. The search angle: *"for each `agents/*.md`, what does the Procedure instruct the agent to FETCH, and what field-selection or size bound does that instruction impose?"*

This is not a gap at the margin — it is the modality that produced the incident. The source-collector payload is five scalars:

```
scripts/orchestrator_runner.py:2172-2179
        jira_payload = config.get("sources", {}).get("jira")
        sc_inputs = {
            "last_sha": ..., "head_sha": head_sha, "repo": repo,
            "pr_branch_filter": ["docs-agent/*"],
        }
        if jira_payload: sc_inputs["jira"] = jira_payload
```

The 130,203 chars of Jira descriptions and 92,635 of PR bodies entered via the agent's own tools: `agents/source-collector.md:5-8` grants `Bash`/`Read`/`WebFetch`; `:294` is the only bound on files and it is prose ("truncate to 200 entries"); `:164` records the agent running `curl` against Jira directly. A byte budget at the dispatch choke point would have measured ~300 bytes for that dispatch and passed. **The draft's central fix does not address its own motivating incident on the source-collector arm.**

Corollary the six angles also miss: the binding ceiling in the incident was the model's **output-token** limit, not `MAX_ARG_STRLEN`. Nothing measures tokens, and `base_argv` (`scripts/orchestrator_runner.py:1099-1116`) carries no `--max-turns` or output-size flag.

## 2. Asserted but not verified

**"Twelve dispatch call sites across `scripts/orchestrator_runner.py` and `scripts/verify_runner.py`."** I count **eleven** payload-constructing sites: `orchestrator_runner.py:2180, 2304, 2550, 2639, 2805, 2906, 3314, 3477` plus `verify_runner.py:44, 74, 117`. (`:1239` and `:1345` are inside the helpers themselves.) Missing evidence: the draft names no twelfth site. More consequentially, the count conceals a routing error — `verify_runner.py:44` calls **`dispatch_subagent` directly**, bypassing `dispatch_validated` entirely, so recommendation #1 as written ("bound at `dispatch_validated`") misses a live site.

Second, unverified: **"every archived real source-collector output keys file entries `filename`."** The helper side is verified (`scripts/orchestrator_runner.py:1813  name = f.get("path") if isinstance(f, dict) else f`). The archive side is not: `.engineering-docs-agent/` holds only `config.yml`, `current_run.json`, `stale-prs-archive/`, `state.example.json`, `state.json`, and `grep -rl filename` over it returns nothing. Missing evidence: a `DOCS_AGENT_DEBUG_DIR` forensics `*.stdout.txt`, or run 35862057776's stdout.

## 3. CONFIRMED findings that are wrong

Checked the two weakest:

**`content-validator-paths-input` — wrong, and self-contradictory.** It appears in **both** CONFIRMED and REFUTED. The payload (`scripts/orchestrator_runner.py:2639-2645`) is `{"paths": authored, "config_path", "voice_samples", "plugin_root"}`; `authored` is a list of page-path strings, count-bounded by pages authored this run, each NAME_MAX-class. REFUTED is correct; the CONFIRMED entry should be struck. The draft's own table has no such row, so the finding list and the table disagree.

**`voice-samples-20kb-cap` — a category error, filed three times.** It appears as `voice-samples-20kb-cap`, `voice-samples-20kb-cap-CONFIRMED-ONLY-D`, and `voice-samples-bounded-THE-PATTERN`, while the table calls it "Not a defect: the control case." Verified bound: `scripts/state_io.py:348 cap = 20_000`, `:374 snippet = text[: max(0, cap - total)]`, `:379 if total >= cap: break`. Counting a working bound three times as an unbounded-payload finding inflates the census. (The char-vs-byte `ensure_ascii` observation is correct and should survive as its own finding.)

Related hygiene: the 63-entry CONFIRMED list holds ~55 distinct items — `page-author-source-paths-input` ×2, `notifier-digest-partial-reasons` ×3, plus the above.

## 4. Verified myself: is there a single serialization choke point?

**Yes — one line, and it is in `dispatch_subagent`, not `dispatch_validated`.**

```
scripts/orchestrator_runner.py:1098
    prompt = _EXECUTION_FRAMING.format(payload=json.dumps(inputs))
```

```
scripts/orchestrator_runner.py:1135-1138
    try:
        r = subprocess.run(argv, **run_kwargs)
    except FileNotFoundError:
        return None
```

Every production dispatch reaches `:1098`: `dispatch_validated` (defined `:1208`) calls `dispatch_subagent` at `:1239`; `dispatch_verified` calls `dispatch_validated` at `:1345`; `verify_runner.py:44` calls `dispatch_subagent` directly. So the bound is implementable as a single measurement — **but it must go in `dispatch_subagent`, one frame lower than the draft specifies**, or `verify_runner.py:44` is uncovered.

Three caveats the draft does not state:

- **The dry-run branch returns before `:1098`** (fixture reads at `scripts/orchestrator_runner.py:1080-1096`). Per this repo's own convention that all tests use the dry-run path, a budget at `:1098` is production-only and the fixture suite would never exercise it — the exact shape of the CCE-141 measurement (b) failure, where a feature was green while untested through the path production uses. The test has to call `dispatch_subagent` with `dry_run_dir=None` and a stubbed `subprocess.run`.
- **The uncaught-`OSError` claim is confirmed.** `except FileNotFoundError` at `:1137` is the only handler; `FileNotFoundError` is an `OSError` subclass, so `E2BIG` is not caught. `run`'s body opens `try:` at `:2154` and closes `finally:` at `:3332` with no `except` at that level; `main` returns `run(...)` at `:4413` under `sys.exit(main())` at `:4422` with no top-level handler. An oversized argv does crash outside CCE-144 classification.
- **`jira_lookup = {issue["key"]: issue for issue in jira_issues}` (`:2224`) is the same bug class, not a separate minor one.** `jira_issues` is typed `{"type": "array"}` with no `items` (`agents/schemas/source_collector.schema.json`), so a schema-valid entry lacking `key` raises `KeyError` inside that same except-less `try:` — an uncaught crash outside classification, identical in consequence to the E2BIG path. The draft files it under "stays separate"; it belongs with item 1.

Draft claims I verified as correct, for the record: zero `maxLength`/`maxItems`/`maxProperties` across all eight files in `agents/schemas/`; no `len(prompt)`/`MAX_ARG`/`E2BIG`/size-`encode()` anywhere in `scripts/` (only unrelated hits at `scaffold_workflow.py:37`, `jira_transition_on_merge.py:97`); `_clip_prs_to_window` returns `prs` unfiltered on empty `last_sha` (`:974`, guard at `:996`); `digest["lint_failures"]` and `digest["partial_reasons"]` are the **same list object** (`:3303-3304`); `jira_context` built with no dedupe (`:2301-2303`); `sorted(grounding)` serialized twice in one page-author payload (`:2530` `source_files=`, `:2559` `source_paths`); `available_sections` is the all-lens dict `available_sections_by_lens`, dirs only, non-recursive (`:2228-2243`); and the draft's correction to CLAUDE.md is right — `_maybe_auto_merge`'s docstring states `fact_warnings` "is retained in the signature only so the caller's kwargs" (`:4091`), so fact warnings gate nothing.

No subagents were spawned: this session has no Task/spawn tool, only `SendMessage` to already-running peers.