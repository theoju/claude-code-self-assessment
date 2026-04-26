---
description: Score my Claude Code usage against Boris Cherny's 87 tips and the Mastery rubric. Updates the dashboard data file, appends to history, and (if configured) posts the summary to Slack.
argument-hint: [--no-slack] [--quiet] [--claude-md-target <name=path>]
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
   - The overall score and target.
   - Which dimensions improved (↗) or slipped (↘) since the previous snapshot.
   - The top 3 priority actions (weight × deficit).
   - CLAUDE.md health summary (if any `claudeMd` targets are configured): aggregate stats only — total targets, files scanned, average score/grade, and grade distribution. **No project names, paths, or per-file issues** are included so the report is safe to share.
   - The dashboard URL from `assessment.config.json#publish.publicUrl` — or note that the local dev server is running at http://localhost:3737 if they started it with `npm run dev`.

3. If `SLACK_WEBHOOK_URL` is missing and `slack.enabled: true`, tell the user one line: "Set SLACK_WEBHOOK_URL in `.env.local` (see `.env.example`) to enable Slack posts."

## Configuration

- `assessment.config.json` (copy from `.example`): non-secret config — display name, Slack channel, public URL.
- `.env.local`: `SLACK_WEBHOOK_URL=...` — the webhook secret, never committed.

## Notes

- Scoring rules live in `scripts/score.mjs`. They are deterministic so trends reflect real config changes, not Claude's mood.
- The rubric metadata (titles, weights, Boris tip references, target scores) lives in `app/data/rubric.json`. Update it there if you want to retune the target profile.
- Boris tip references in the dashboard (and Slack post) are clickable. They point at the dashboard's own `/tips/N` route, which renders the tip content from a local snapshot of `~/.claude/skills/boris/SKILL.md`. The upstream site (`howborisusesclaudecode.com`) has no per-tip URLs (verified by crawl Apr 2026 — no hash routing, no query handling, no per-tip endpoints), so each `/tips/N` page also offers an "Open on howborisusesclaudecode.com ↗" link with a hint to manually navigate to the right volume/tab.
- When Boris ships a new "Part": (1) update the boris skill from `https://howborisusesclaudecode.com/api/install`, (2) extend `app/data/boris-tip-index.json` with the new section→{volume,tab,label} entries, (3) run `npm run snapshot:boris-tips` to regenerate `app/data/boris-tips-content.json`.
- For cloud routines (7:15 AM scheduled run), see `ROUTINE.md`.
