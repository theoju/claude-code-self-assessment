# self-assessment — signals

What the scorer reads, what it writes, and how counts are kept honest.

## Default-mode reads

The scorer always inspects local-only state on the host machine. Nothing leaves the box unless Slack is configured.

From `~/.claude/`:

- `settings.json` — `effortLevel`, `permissions.allow`/`deny`, `skipDangerousModePermissionPrompt`, `hooks` (events + total count), `enabledPlugins`, env vars (notably `CLAUDE_CODE_AUTO_COMPACT_WINDOW`).
- `agents/*.md`, `commands/*.md`, `skills/*` — counts of personal craft.
- `plans/`, `sessions/` — directory sizes for activity signal.
- `projects/*/memory/` — per-project memory file counts.
- `statusline.sh`, `keybindings.json` — presence checks (custom UX configured?).
- `CLAUDE.md` — global personality memo.
- `usage-data/session-meta/` and `usage-data/facets/` — session telemetry the harness writes (sessions in window, tool counts, friction counts, outcome buckets).
- `hook-fires.jsonl` — optional telemetry for hook execution. **Absent by default** (Claude Code does not emit this); see "How counts stay honest" below.

From the project root:

- `.claude/settings.local.json` — project-scoped permissions.
- `.claude/agents/*.md`, `.claude/commands/*.md` — project-scoped craft.
- `CLAUDE.md` — project-scoped personality memo.

`scoring.insightsLookbackDays` (default 30) caps the window for session-meta/facets/hook-fires.

## Behavioral-mode reads (`includeTranscripts: true` or `--include-transcripts`)

When opted in, the scorer additionally walks `~/.claude/projects/*/conversations*.jsonl` to count, per session in the window:

- Plan-mode entries (`/plan`, `EnterPlanMode` tool calls)
- Auto-mode entries
- Bypass-permissions entries
- Worktree state events (real worktree usage, not just commands)
- Learning-mode session matches

This is **expensive** — full transcript scan each run, slow on large histories. Off by default; turn on once a baseline exists.

## What gets written

- `app/data/assessment.json` — current snapshot. Re-rendered by the dashboard at `npm run dev` (http://localhost:3737).
- `app/data/assessment-history.json` — gitignored trend series. Local only.
- Slack webhook (if `slack.enabled: true` and `SLACK_WEBHOOK_URL` is set) — fire-and-forget summary post. Failures log a warning; they don't fail the run.

The CLAUDE.md auditor (when `claudeMd.targets` is configured) reads each target but writes **nothing** — `mode: "report-only"` is the only mode shipped, and the scorer reports aggregate stats only (no paths or per-file detail).

## How counts stay honest

The scoring code has a few deliberate gates that prevent spurious credit:

- **Three-state `hookFireCount`.** `~/.claude/hook-fires.jsonl` may be absent (Claude Code doesn't emit it by default). The scorer distinguishes `null` ("no telemetry — trust the config") from `0` ("file exists, no fires in window — gate credit") from `N>0` ("warm, full credit"). Without this, every fresh user would get hard-zeroed on hook execution. See [`gotchas.md`](./gotchas.md) → "Hook execution score capped despite many hooks configured".
- **Plugin-skill filtering.** Marketplace-installed skills don't count toward personal-craft Automation by default (`includePluginSkillsAsPersonal: false`). Flip the flag explicitly if the user wants them counted.
- **Built-in MCP connectors not attributed.** `mcp__claude_ai_*` tool calls aren't credited as plugin usage — only `mcp__plugin_<name>_*` is. Built-ins shouldn't inflate the plugin score.
- **Null-vs-zero discipline for transcript signals.** `planModeSessionCount` and friends start as `null` and stay `null` when transcripts weren't scanned. Scoring predicates must treat that as "we didn't look," not "user didn't do it."

## Privacy

Default and behavioral modes both stay on the local machine. The Slack post is the only outbound traffic, and it's intentionally aggregated:

- Scores and Δ — yes.
- Top-3 priority actions (rubric-derived strings) — yes.
- CLAUDE.md health — **aggregate only** (totals, average, distribution). No project names, no paths, no per-file issues.
- No transcript content. No tool-call details. No personal craft file names.

If the user wants to share more context, they can do so manually in the Slack thread.
