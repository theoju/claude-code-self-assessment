# Probe Closure & Validation — Design Spec

**Date:** 2026-05-10
**Source artifact:** `docs/tip-classification-2026-05-10.md` (87-tip classification, v3, 30-day basis)

## Goal

Lift measurable-tip coverage from **28/87 (32%) → ~42/87 (48%)** by closing the easy-tier probe gaps and auditing four existing probes that look like they're returning false negatives. Use validation agents at every step to challenge probe logic before code lands.

## Scope

**In scope (V1 + P1 + P2 + P6 from the v3 doc analysis):**

- **V1** — Audit and fix 4 suspicious existing probes: tips 1 (`worktreeAliasCount`), 14 (`hasVerifyAgent`), 28 (`hasIsolatedAgent`), 31 (`babysitLoopUses`).
- **P1** — Add 8 easy slash-command probes: tips 29 (`/simplify`), 33+54 (`/btw`), 60 (`/voice`), 63 (`/clear`+`/compact`), 69 (`/fewer-permission-prompts`), 53 (fork-events).
- **P2** — Add 4 settings-flag probes: tips 21 (sandboxing), 26 (output style), 41 (PostCompact hook), 45 (auto-dream).
- **P6** — Add 2 project-local-config probes: tips 32 (code-review plugin), 40 (per-worktree `/color`).

**Out of scope (deferred to follow-up brainstorms):**

- **P3** — CLI flag detection (`--name`, `--bare`, `--add-dir`, `--agent`). Needs the data source identified first.
- **P4** — Transcript-schema explorations (Opus model, plan-mode entries, voice origins, Slack-paste, long-running, auto-naming, iOS, Cowork, Desktop). Each needs schema sampling.
- **P5** — Prose-pattern probes (66, 68, 70). High false-positive risk; classify as Coaching.

## Success criteria

1. All 4 V1 probes audited; each either passes adversarial review unchanged or is fixed with a failing-test-first commit.
2. 14 new probes shipped with TDD coverage matching v0.9.0 quality bar (one unit test per probe minimum, plus updates to `expectedKeys` and the inline snapshot in `build-signals-summary.test.mjs`, plus updates to `ALL_SATISFIED_SIGNALS` in `rubric-predicates.test.ts`).
3. Predicate coverage moves from 30/34 rubric `nextActions` to ≥ 40/34.
4. `npm run assess` against the user's real environment shows a stable Setup/Execution score (within ±2 of pre-merge baseline) — new probes that flip Missed→Passed lift dimensions naturally; nothing should regress.

## Architecture

Probes feed three layers:

```
~/.claude/settings.json   ─┐
~/.claude.json             ├──▶  scripts/signals.mjs (config readers)
~/.claude/agents/, etc.   ─┘
                                       │
~/.claude/projects/*/*.jsonl  ─▶  scripts/_usage-data.mjs (transcript scanners)
                                       │
~/.claude/usage-data/         ─▶  scripts/insights-signals.mjs (facets/session-meta)
                                       │
                                       ▼
                       scripts/run-assessment.mjs#buildSignalsSummary
                                       │
                                       ▼
                       signalsSummary (flat keys, 46 today)
                                       │
                       ┌───────────────┼─────────────────┐
                       ▼               ▼                 ▼
            app/data/rubric.json   app/lib/        scripts/score.mjs
            (predicates)           assessment.ts    (formula bonuses)
                                   (predicate engine)
```

Each new probe touches:

1. Reader function in `signals.mjs` (config-side) or `_usage-data.mjs` (transcript-side).
2. Forwarded key in `buildSignalsSummary` in `run-assessment.mjs`.
3. Predicate in `rubric.json` (if a next-action exists).
4. Tests in `scripts/__tests__/` matching existing patterns.
5. Optional: score formula bonus in `score.mjs` (skip unless calibration justifies it; default to predicate-only).

## Validation-Agent Pattern (the key new mechanism)

Three agent types, dispatched at specific lifecycle points:

### A. Schema-Sampling Agent (Explore subagent)

**When:** Before coding any P2 / P6 probe, and as part of every V1 audit.

**Input:** A specific file path or glob pattern, plus the field name(s) to confirm.

**Task:**

- Sample at least 5 real instances of the file.
- Report whether the field exists, its shape, value distribution, and any edge cases (nulls, type coercion, missing keys).
- Recommend: build the probe / defer (field absent) / accept-as-coaching (field exists but value unreliable).

**Output:** A short structured report. The implementer subagent must read this report before writing the failing test.

### B. Adversarial Code-Reviewer Agent (`pr-review-toolkit:code-reviewer` subagent)

**When:** After the implementer subagent's first green commit, before the next task starts.

**Input:** The probe implementation file + its test file + git SHA range.

**Task:**

- Propose at least 3 adversarial cases (e.g. "what if the settings file has the field but the value is null?", "what if user has the alias but in `~/.bashrc` not `~/.zshrc`?", "what if the regex matches a substring but not a full word?").
- Verify the test file covers each case OR document why it doesn't matter.

**Output:** Pass / Fail. Implementer must address each adversarial case before merging.

### C. Probe-Logic Challenger Agent (general-purpose subagent)

**When:** Only for V1 audits.

**Input:** The existing probe code + its current observed value + behavioral evidence that contradicts it.

**Task:** Deeply read the probe, compare to behavior, propose root cause and fix.

**Output:** Probe is correct (closed, document why) / probe has bug X (fix Y) / probe is irreparable (replace with new approach).

## Hypotheses for V1 audits

Going in, my best-guess root causes for the 4 suspicious probes:

| Tip | Probe                           | Hypothesis                                                                                                                                                          |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `worktreeAliasCount=0`          | Probe likely scans only `~/.zshrc`; missing `~/.bashrc`, `~/.config/fish/config.fish`, or alias formats other than literal `alias za=`.                             |
| 14  | `hasVerifyAgent=false`          | Regex `/^verify/i` only matches files starting with "verify"; should also count `pr-review-toolkit` agents and `ship.md` skill which IS the user's verify pipeline. |
| 28  | `hasIsolatedAgent=false`        | The `settings.hasIsolatedAgent` flag is set somewhere — probably needs a scan of agent file content for an `isolation: worktree` line.                              |
| 31  | `babysitLoopUses` requires both | Definition probably too strict. `/loop` invocations alone should also count toward "scheduled & autonomous workflows" adoption.                                     |

Each hypothesis must be confirmed/refuted by Agent C before the failing test is written.

## Risks

1. **V1 audits may resolve as rubric-wording fixes rather than probe-code fixes.** Build flexibility into each task: probe-fix OR rubric-fix is acceptable.
2. **P2 fields may not exist in `~/.claude/settings.json`.** Auto-dream (45) is a likely casualty per the existing Bucket C analysis. The Schema-Sampling Agent gates inclusion of each P2 tip; if a field is absent, that tip becomes "accept-as-coaching" and is appended to the Bucket C decision spec.
3. **Score-formula calibration:** New probes that flip from Missed→Passed will lift dimension scores. The default for this spec is predicate-only (no score formula change); if the resulting overall score moves more than ±2, calibrate in a separate follow-up PR.
4. **MCP availability blip** noted in the v3 doc (mcpServersConnected went 7→0→7 across runs) is orthogonal to this spec and may need its own investigation.

## Delivery shape

3 sequential PRs (matches the user's established pattern from PRs #40–#44):

1. **PR-V1: Existing-probe audits** — fixes for the 4 suspicious probes. Smallest unit, highest information value.
2. **PR-P1: Slash-command extensions** — 8 new slash-command probes. Mechanical, low risk, follows the v0.9.0 /rewind precedent exactly.
3. **PR-P2+P6: Settings flags + project-local configs** — 4 settings-flag probes + 2 project-local-config probes. Schema-Sampling Agents gate inclusion of each tip.

Each PR uses the Adversarial Code-Reviewer Agent before merge.

## Out of scope (deferred for follow-up)

- P3 (CLI flags) and P4 (transcript-schema) probes.
- P5 prose-pattern probes (recommend permanent classification as Coaching).
- Score-formula calibration of new probes' impact on dimension scores.
- Backfill of the 12 missing tips (76–87) into `boris-tip-index.json` + `boris-tips-content.json`.
- Investigation of the MCP availability blip.
