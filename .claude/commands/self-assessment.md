---
description: Score my Claude Code usage against Boris Cherny's 87 tips and the Mastery rubric. Updates the dashboard data file, appends to history, and (if configured) posts the summary to Slack.
argument-hint: [--no-slack] [--print] [--include-transcripts] [--no-transcripts] [--insights-lookback N] [--progression-lookback N|none] [--claude-md-target name=path]
allowed-tools: Bash(node:*), Bash(npm:*), Read, Write
---

# /self-assessment

Run the deterministic assessment pipeline. Scoring reads real signals from the current machine — `~/.claude/settings.json`, `~/.claude/agents`, `~/.claude/commands`, `~/.claude/skills`, `~/.claude/projects/*/memory`, installed plugins — and writes a fresh snapshot.

## Steps

1. Run the scorer:
   ```bash
   npm run assess -- $ARGUMENTS
   ```
   This writes `app/data/assessment.json` (current) and appends to `app/data/assessment-history.json` (trend series, gitignored). If the Slack webhook is configured and `slack.enabled: true`, it also posts a summary.

2. Report back to the user with:
   - **Platform Setup** and **Execution** scores (each out of 100) and the Δ between them. The diagnostic case is a high Δ — every tool installed, none of them fired.
   - Which dimensions improved (↗) or slipped (↘) since the previous snapshot.
   - The top 3 priority actions (weight × deficit). Note which side of the deficit they fall on (Platform Setup vs Execution).
   - CLAUDE.md health summary (if any `claudeMd` targets are configured): aggregate stats only — total targets, files scanned, average score/grade, and grade distribution. **No project names, paths, or per-file issues** are included so the report is safe to share.
   - The dashboard URL from `assessment.config.json#publish.publicUrl` — or note that the local dev server is running at http://localhost:3737 if they started it with `npm run dev`.

3. If `SLACK_WEBHOOK_URL` is missing and `slack.enabled: true`, tell the user one line: "Set SLACK_WEBHOOK_URL in `.env.local` (see `.env.example`) to enable Slack posts."

## Configuration

- `assessment.config.json` (copy from `.example`): non-secret config — display name, Slack channel, public URL, and default scoring window/transcript settings.
- `.env.local`: `SLACK_WEBHOOK_URL=...` — the webhook secret, never committed.

## Scoring overrides (for one-shot runs)

These flags override `scoring.*` in `assessment.config.json` for a single run, so you don't have to edit the config to do a deep scan.

- `--include-transcripts` — opt in to scanning `~/.claude/projects/*/*.jsonl` (expensive — hundreds of MB on active users). Enables auto/plan/worktree/skill milestones and the bypass-stopped detector.
- `--no-transcripts` — force the scan off even when config has it on.
- `--insights-lookback N` — set the Execution-axis aggregation window in days. Default 30. Use 90 for a smoother weekly read.
- `--progression-lookback N|none` — set the milestone-timeline window. `none` = full history (default). Set to a number when you only want recent milestones.

**Recipes:**
- Cheap daily run (default): `npm run assess`
- Weekly deep run: `npm run assess -- --include-transcripts --insights-lookback 90`
- Quick check, transcripts off even if config enables them: `npm run assess -- --no-transcripts --no-slack`

## Surfacing Claude's own /insights narrative in the dashboard

If you also want the rich narrative output of the built-in `/insights` command rendered alongside the dashboard's scoring:

1. Run `/insights` in Claude Code.
2. File the markdown summary using whichever path you prefer:
   - `/refresh-insights` — slash command that writes the summary verbatim from the current session's output (thin wrapper, never auto-runs `/insights`).
   - `pbpaste | npm run import-insights` — pipe the macOS clipboard.
   - Paste manually into `app/data/insights-narrative.md`.
3. Refresh the dashboard.

The file is gitignored, never uploaded, never posted to Slack, never auto-captured. The dashboard renders it locally in a clearly-attributed section. To remove it, delete the file.

## Notes

- Scoring rules live in `scripts/score.mjs`. They are deterministic so trends reflect real config changes, not Claude's mood.
- The rubric metadata (titles, weights, Boris tip references, target scores) lives in `app/data/rubric.json`. Update it there if you want to retune the target profile.
- Boris tip references in the dashboard (and Slack post) are clickable. They point at the dashboard's own `/tips/N` route, which renders the tip content from a local snapshot of `~/.claude/skills/boris/SKILL.md`. The upstream site (`howborisusesclaudecode.com`) has no per-tip URLs (verified by crawl Apr 2026 — no hash routing, no query handling, no per-tip endpoints), so each `/tips/N` page also offers an "Open on howborisusesclaudecode.com ↗" link with a hint to manually navigate to the right volume/tab.
- When Boris ships a new "Part": (1) update the boris skill from `https://howborisusesclaudecode.com/api/install`, (2) extend `app/data/boris-tip-index.json` with the new section→{volume,tab,label} entries, (3) run `npm run snapshot:boris-tips` to regenerate `app/data/boris-tips-content.json`.
- For cloud routines (7:15 AM scheduled run), see `ROUTINE.md`.
