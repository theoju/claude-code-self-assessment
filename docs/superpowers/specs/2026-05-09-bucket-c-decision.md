# Bucket C Decision Spec

## Goal

Decide for each of 6 unpredicated rubric next-actions: **instrument**, **accept-as-coaching**, or **move-to-separate-surface**. Each "instrument" decision becomes a follow-up implementation PR; "accept-as-coaching" stays unpredicated and renders as guidance rather than a TODO; "move-to-separate-surface" exits the rubric entirely.

## Telemetry inventory (what `~/.claude/` exposes)

Surfaces v0.8 already reads:

- `~/.claude/settings.json` — config
- `~/.claude/agents/`, `~/.claude/commands/`, `~/.claude/skills/` — personal customization
- `~/.claude/projects/*/memory/` — auto-memory
- `~/.claude/usage-data/{facets,session-meta}/*.json` — Anthropic's cooked telemetry
- `~/.claude/projects/*/*.jsonl` — transcripts (markup, plan-mode, slash commands)
- `~/.claude/ship/journal.jsonl` — /ship lifecycle journal
- `~/.claude.json` — CLI runtime state (`claudeInChromeDefaultEnabled`, `hasUsedRemoteControl`)
- `~/.zshrc`, `~/.bashrc` — worktree aliases

Surfaces NOT yet read (potential signal sources):

- `~/.claude/history.jsonl` — global slash-command history (1.1MB on this machine)
- `~/.claude/file-history/` — per-project edited-file history
- `~/.claude/chrome/chrome-native-host` — Chrome bridge presence (alternate Chrome detection)
- `~/.claude/plans/` — saved plans (50+ on this machine, already counted as `plansCount`)
- Transcript field `origin.kind` — empirically only `task-notification` observed; iOS shape unconfirmed
- Transcript field `clientType` / `platform` — not present in sampled transcripts

## Per-action analysis

### `memory/auto-dream` (Boris tip 45)

**Action text:** "Run /memory and enable auto-dream"

**Detectability:** No `autoDream` key found in `~/.claude/settings.json`. Auto-dream may be a runtime toggle in `/memory` UI without persistent file-system state. `~/.claude/projects/*/memory/` content might encode dream output, but distinguishing "dream-enabled" from "dream-disabled" without a config flag would require pattern-matching memory content — high false-positive risk.

**Cost:** Unknown until auto-dream's persistent state shape is documented by Anthropic.

**Recommendation:** **accept-as-coaching.** No reliable signal exists today. Revisit if Anthropic surfaces an `autoDream` settings field.

---

### `memory/rewind-reflex` (Boris tip 62)

**Action text:** "Get into the /rewind reflex when Claude goes sideways"

**Detectability:** `<command-name>/rewind</command-name>` appears in transcripts. Empirically: 2 invocations across all of this machine's transcripts. Markup detection is exact (no false positives).

**Cost:** ~30 min — extend `TARGET_COMMANDS` in `_usage-data.mjs` with `"rewind"`, add `rewindCommandUses` forwarding, add predicate `rewindCommandUses>=1` to the rubric, plus tests.

**Recommendation:** **instrument.** Trivial cost, high-fidelity signal, behavioral relevance.

---

### `planning/goal-constraints-template` (Boris tip 66)

**Action text:** "Adopt a template: Goal / Constraints / Acceptance Criteria at top of every non-trivial prompt"

**Detectability:** Prompt-shape, not slash command. Would require regex matching on user-message text for the literals "Goal", "Constraints", "Acceptance Criteria" near the top. False-positive risk: a user discussing the _concept_ would trigger the same regex. Reliability medium-low.

**Cost:** Medium implementation + ongoing tuning. The CLAUDE.md design rule explicitly warns: _"false positives erode trust faster than missed dismissals."_

**Recommendation:** **accept-as-coaching.** Pattern adherence is intentional behavior; pattern-matching prose for the words doesn't reliably reflect adoption.

---

### `customization/per-worktree-color` (Boris tip 40)

**Action text:** "Set per-worktree /color so parallel sessions are distinguishable at a glance"

**Detectability:** No `colorPerWorktree` or `colorScheme` key found in `~/.claude/settings.json`. `/color` is likely a per-session client-side toggle without persistent state. Per-worktree configuration would surface in `~/.claude/projects/<project>/settings.local.json` if it persisted there — needs sampling across multiple projects to confirm.

**Cost:** Trivial IF a persistent flag exists; otherwise impossible without new instrumentation.

**Recommendation:** **accept-as-coaching** pending a survey across multiple projects' `settings.local.json`. If a persistent color flag turns up, promote to "instrument" in a follow-up.

---

### `remote/ios-task` (Boris tip 46)

**Action text:** "Try kicking off one task from iOS this week"

**Detectability:** Transcript field `origin.kind` exists — but across this machine's recent transcripts, the only observed kind is `task-notification` (1723 occurrences). No iOS-originated transcripts present in the corpus to confirm the iOS marker shape. The user has _used_ Remote Control (`hasUsedRemoteControl: true` in `~/.claude.json`) which is correlated, but Remote Control is already its own predicated action (PR #39).

**Cost:** Trivial pattern-match if shape were known; impossible to validate without an actual iOS-originated session in the user's data.

**Recommendation:** **accept-as-coaching for now.** Move to "instrument" once an iOS-originated session shape is empirically observed. Document the unknown in `CLAUDE.md` so future contributors know to sample first.

---

### `learning/spaced-repetition-skill` (Boris tip 15)

**Action text:** "Optional: build a spaced-repetition skill for parts of the codebase you want to retain"

**Detectability:** A custom skill in `~/.claude/skills/<name>/SKILL.md`. Detection: scan `personalSkills` (already gathered) for skill names matching `/^(spaced|repetition|review|retain|recall|flashcard)/i`. The user's current skills (`boris`, `ship`, `thariq-skills`) don't match — predicate would correctly evaluate false. False-positive risk: low (skill names are deliberate; matching keywords correlates well with spaced-repetition intent).

**Cost:** Trivial — predicate-only, no new signal needed (`personalSkills` array already in `signalsSummary`). Add a regex evaluator function or extend predicate grammar to support `personalSkills~spaced|repetition|review|retain`. Cost ~45 min including grammar extension + tests.

**Recommendation:** **instrument**, but the predicate-grammar extension (regex match against array) is a small ergonomics improvement worth doing once and reusing. Group with any future array-regex predicate.

## Decision summary

| Action                               | Decision                                        | Effort to instrument     |
| ------------------------------------ | ----------------------------------------------- | ------------------------ |
| `memory/auto-dream`                  | accept-as-coaching                              | Unknown (Anthropic-side) |
| `memory/rewind-reflex`               | **instrument**                                  | ~30 min                  |
| `planning/goal-constraints-template` | accept-as-coaching                              | N/A                      |
| `customization/per-worktree-color`   | accept-as-coaching (pending survey)             | TBD if flag exists       |
| `remote/ios-task`                    | accept-as-coaching (pending iOS session sample) | ~30 min once shape known |
| `learning/spaced-repetition-skill`   | **instrument** (with grammar extension)         | ~45 min                  |

**Net:** 2 actions instrumentable today, 4 stay as coaching. Predicate coverage moves 27/34 → 29/34 (85%) after the instrument-now items land.

## Follow-up implementation plan

The two "instrument now" decisions become a single follow-up PR:

1. Extend `TARGET_COMMANDS` with `"rewind"` → forward `rewindCommandUses` → predicate `memory/rewind-reflex` with `rewindCommandUses>=1`.
2. Extend predicate grammar to support array-regex (`personalSkills~spaced|repetition|...`) → predicate `learning/spaced-repetition-skill`.

Estimated total: ~75 min, single small PR.

## UI consideration (deferred to a separate PR)

Currently the dashboard renders unpredicated actions identically to predicated-but-unsatisfied ones. After this spec lands, "accept-as-coaching" actions should be visually distinguishable — perhaps under a "Behavioral coaching" subhead rather than the priority/TODO list. Out of scope for this spec; flagged as a follow-up for the dashboard rendering layer.

## Out of scope

- Implementation of any "instrument" decisions — that's the follow-up PR above.
- Settings.local.json sampling for `colorPerWorktree` — needs the user's per-project state across several projects.
- iOS shape sampling — requires the user to actually originate one session from iOS first.
- Score-formula changes — predicates only, when instrumented.
