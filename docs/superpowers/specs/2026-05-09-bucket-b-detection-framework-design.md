# Bucket B Detection Framework — Design Spec

## Goal

Close 8 detection gaps in the self-assessment rubric where the action is detectable but unwired. Builds three new signal-source classes (ship-journal reader, transcript-invocation scanner, shell-rc reader), then predicates 8 unpredicated next-actions against the resulting signals. Detection-only — no score-formula changes. Mirrors PR #37 / PR #38 pattern.

## Background

The 2026-05-09 audit found 17 of 34 next-actions (50%) unpredicated. Triaging by detectability:

- **Bucket A** (config flag exists, just unwired): `verification/chrome-extension`, `remote/remote-control` — handled in a separate small PR.
- **Bucket B** (this spec): 8 actions detectable from session/journal/shell artifacts.
- **Bucket C** (genuinely behavioral, ~5 actions): outside this spec; product decision.

Q2 (`branch-diff`) and Q6 (`plan-then-launch`) are the originating questions; both fall in Bucket B alongside 6 others. Combined design avoids re-deriving primitives across 6+ separate PRs.

## Architecture

Three new gatherers added alongside the existing `gatherSignals` reads. Each produces a flat shape forwarded through `buildSignalsSummary` and consumed by the predicate engine. No score-formula changes.

```
gatherSignals
  ├─ existing reads (settings, plugins, MCP, ~/.claude.json)
  ├─ gatherShipJournal()        ← new: ~/.claude/ship/journal.jsonl
  ├─ scanTranscriptInvocations()← new: ~/.claude/projects/*/*.jsonl
  └─ gatherShellAliases()       ← new: ~/.zshrc, ~/.bashrc

buildSignalsSummary  ← new: forwards 8 new flat keys

evaluatePredicate    ← unchanged: reads new keys via existing grammar
```

## New components

### 1. Ship-journal reader

**File:** `scripts/signals.mjs` (new helper + pure parser)

**Pure parser:** `parseJournalLine(line: string): Entry | null` — accepts JSONL line, returns parsed object on valid JSON, `null` on malformed (skip silently — same fault tolerance as `parseMcpListOutput`).

**Gatherer:** `gatherShipJournal(opts: { lookbackDays }): { stage2Count, lastRunAt, totalRuns }`

Reads `~/.claude/ship/journal.jsonl` line by line; filters entries to those within `lookbackDays`. Counts entries where `stage === 2` (verify-agent dispatched). `totalRuns` counts entries where `outcome === "shipped"`. Empty/missing file → all zeros.

### 2. Transcript-invocation scanner

**File:** `scripts/_usage-data.mjs` (new export, parallel to existing `scanTranscriptModes`)

**Function:** `scanTranscriptInvocations(path, opts): InvocationCounts`

Walks `~/.claude/projects/*/*.jsonl` transcripts within lookback. Returns:

```ts
{
  goCommandUses: number,         // /go invocations
  batchCommandUses: number,      // /batch invocations
  focusCommandUses: number,      // /focus invocations
  scheduleCommandUses: number,   // /schedule invocations
  babysitLoopUses: number,       // sessions with both /loop and /babysit
  planThenLaunchSessions: number // plan-mode-exit followed by tool call within 2 messages
}
```

**Slash-command counts:** match user-message lines starting with `^/<cmd>(\s|$)` for `go`, `batch`, `focus`, `schedule`. Babysit-loop is a session-level metric: 1 per session if both `/loop` and `/babysit` appear.

**Plan-then-launch detection:** find each session's plan-mode exits (transcript marker — exact format determined at implementation time by sampling existing transcripts). For each exit, examine the next 2 messages: count the session if any of those is a tool call (rather than text-only narration). Predicate is "≥1 such session in window."

### 3. Shell-rc reader

**File:** `scripts/signals.mjs` (new helper)

**Function:** `gatherShellAliases(): { worktreeAliasCount }`

Reads `~/.zshrc` and `~/.bashrc` (whichever exists; both if both). Counts distinct lines matching `/^\s*alias\s+(za|zb|zc)=/m`. Returns the count (0 if no rc file or no matches).

## Predicate wiring

`buildSignalsSummary` forwards 8 new keys:

```ts
shipVerifyStageRecent: signals.shipJournal?.stage2Count ?? 0,
shipsRecent: signals.shipJournal?.totalRuns ?? 0,
goCommandUses: signals.transcriptInvocations?.goCommandUses ?? 0,
batchCommandUses: signals.transcriptInvocations?.batchCommandUses ?? 0,
focusCommandUses: signals.transcriptInvocations?.focusCommandUses ?? 0,
scheduleCommandUses: signals.transcriptInvocations?.scheduleCommandUses ?? 0,
babysitLoopUses: signals.transcriptInvocations?.babysitLoopUses ?? 0,
planThenLaunchSessions: signals.transcriptInvocations?.planThenLaunchSessions ?? 0,
worktreeAliasCount: signals.shellAliases?.worktreeAliasCount ?? 0,
```

`app/data/rubric.json` gets `satisfiedWhen` added to 8 actions:

| Dim/Action                  | Predicate                   |
| --------------------------- | --------------------------- |
| `verification/branch-diff`  | `shipVerifyStageRecent>=1`  |
| `planning/plan-then-launch` | `planThenLaunchSessions>=1` |
| `verification/go-reflex`    | `goCommandUses>=3`          |
| `parallel/batch-sweep`      | `batchCommandUses>=1`       |
| `customization/focus-mode`  | `focusCommandUses>=1`       |
| `scheduled/babysit-loop`    | `babysitLoopUses>=1`        |
| `scheduled/promote-routine` | `scheduleCommandUses>=1`    |
| `parallel/worktree-aliases` | `worktreeAliasCount>=3`     |

Threshold of 3 for `goCommandUses` (vs 1 for the others) reflects Boris's framing of `/go` as a _reflex_, not a one-time sample — a single use is a try, not adoption.

## Data flow (worked example: branch-diff)

1. User runs `/ship` on a branch. /ship Stage 2 dispatches the verify-agent and writes `{ts, stage: 2, ...}` to `~/.claude/ship/journal.jsonl`.
2. Next `npm run assess` invokes `gatherSignals`.
3. `gatherShipJournal` reads the journal, parses each line via `parseJournalLine`, counts entries with `stage === 2` within the 14-day window. Returns `{ stage2Count: N, ... }`.
4. `buildSignalsSummary` forwards `shipVerifyStageRecent: N`.
5. `evaluatePredicate("shipVerifyStageRecent>=1", summary)` returns `true` for any N ≥ 1.
6. The action `verification/branch-diff` is marked satisfied; disappears from priority lists.

## Testing

**Pure parsers** (unit tests, synthesized fixtures inline):

- `parseJournalLine` — valid stage entry, valid outcome entry, malformed JSON, empty string, non-JSON line. Mirrors `parse-mcp-list-output.test.mjs`.
- Slash-command regex — match `^/go`, `^/go arg`, ignore `say /go later`, `// /go in comment`.
- `gatherShellAliases` — temp file with 3 aliases, temp file with 0, temp file missing. Test fixture path injection (don't read real `~/.zshrc` in tests).

**Integration test** for `scanTranscriptInvocations`:

- Synthesize 2-3 small transcript JSONL files in a temp dir
- Verify counts and plan-then-launch detection across multi-session input
- Reuse the existing `_usage-data.test.mjs` fixture pattern

**Predicate sweep guard:** all 8 new keys added to `ALL_SATISFIED_SIGNALS` in `rubric-predicates.test.ts` so any typo in `satisfiedWhen` strings fails the sweep.

**Snapshot:** `build-signals-summary.test.mjs` inline snapshot updated with 8 new keys in alphabetical order.

**Subprocess skip:** `gatherShipJournal` and `gatherShellAliases` read files (no subprocess); they should run in tests. `scanTranscriptInvocations` similarly file-based — runs in tests against synthesized fixtures, not real `~/.claude/projects/`.

## Error handling

| Failure                                         | Behavior                                                                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `~/.claude/ship/journal.jsonl` missing          | Empty result; all counts = 0                                                                                           |
| Malformed JSON line                             | Skip line; continue parsing rest                                                                                       |
| `~/.zshrc` and `~/.bashrc` both missing         | `worktreeAliasCount: 0`                                                                                                |
| Transcript file unreadable                      | Skip file (existing pattern); continue with others                                                                     |
| Plan-mode marker format differs across versions | Implementation samples real transcripts during dev; spec doesn't lock format. Open question (§ below) tracks the risk. |

## Out of scope

- **Score-formula changes.** Predicates only, like PR #37/#38. The integrations dim still uses `min(70, plugins.length * 3)` etc.
- **Bucket A items** (Q1 Chrome verification dim, Q5 remote control) — separate small PR with config-file reads.
- **Bucket C items** (auto-dream, rewind-reflex, goal-constraints-template, spaced-repetition-skill, per-worktree-color) — genuinely behavioral; product decision needed about whether to detect, accept as coaching, or move to a separate dashboard surface.
- **Refactoring `scanTranscriptModes`.** New scanner runs alongside; existing one untouched.
- **/ship journal schema versioning.** Reader is tolerant to extra fields; if /ship adds new keys later, no change needed unless we want to predicate against them.

## Success criteria

- 8 actions newly predicated; rubric coverage moves from 17/34 → 25/34 (74%).
- Existing tests pass; new tests cover parsers + scanner integration.
- `npm run assess` against the user's real environment marks ≥3 of the 8 newly-predicated actions satisfied (concrete proof the wiring works end-to-end). Specifically: `branch-diff` (journal has stage:2 entries from this session), `worktree-aliases` (if user has them), `batchCommandUses` if they've used /batch.
- No score deltas: Platform Setup and Execution scores remain unchanged across before/after runs (predicates affect TODO visibility, not scores).
- 14-day default lookback respected; `--insights-lookback` flag continues to work.

## Open questions (deferred)

1. **Plan-mode transcript marker format.** Resolved at implementation time by sampling existing transcripts. If the marker isn't reliably detectable, fall back to "weak" definition (any plan-mode use) — but flag explicitly in the PR description.
2. **`/loop /babysit` detection precision.** Per-session "both commands appear" is the cheap version. A stricter version would require detecting `/loop 30m /babysit` as a single composite invocation. Punt unless cheap version produces false positives.
3. **Whether to add `shipsRecent` as a milestone trigger.** Outside this spec; would belong in `progression.mjs`.

## Related artifacts

- Investigation report: this conversation, prior turn (Q1-Q6 Phase-1 evidence).
- Sibling PR: Bucket A (Chrome verification dim + remote-control) — small follow-up, ~10 lines.
- Pattern reference: PR #35 / #37 / #38 — same detection-gap closure shape.

## Implementation note

The implementation plan must include sampling the user's existing `~/.claude/projects/*/*.jsonl` transcripts during the plan-mode-marker detection task to confirm the regex/marker format before locking the predicate. This empirical validation step prevents the "PR #9 outputStyle field that didn't exist" failure mode flagged in CLAUDE.md.
