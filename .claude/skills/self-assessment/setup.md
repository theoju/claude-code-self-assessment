# self-assessment — setup

First-run flow when `assessment.config.json` is missing.

## When to read this

Check at start: `test -f assessment.config.json`. If missing, walk the user through the flow below before running the scorer. Don't fall through to defaults — the user gets a Slack post addressed to "Engineer" and won't know why.

## First-run prompt flow

Ask the user, in this order:

1. **Display name** — "What name should the dashboard and Slack post use?" (e.g. "Theo").
2. **Slack** — "Should runs post to Slack? (y/n)". If yes:
   - Channel name (e.g. `#claude-code-mastery`).
   - Tell them to add `SLACK_WEBHOOK_URL=...` to `.env.local`. **Do not invent or paste a webhook URL** — it must come from the user.
3. **Public dashboard URL** (optional) — "Is the dashboard deployed somewhere public? Paste the URL or skip — defaults to http://localhost:3737."
4. **CLAUDE.md targets** (optional) — "Want to audit any project CLAUDE.md files each morning? Paste paths or skip."

Then:

```bash
cp assessment.config.example.json assessment.config.json
```

Patch the values per the user's answers. The example file (verbatim from main):

```json
{
  "$schema": "Copy to assessment.config.json and edit. Never commit the real file.",
  "user": {
    "displayName": "Engineer",
    "claudeHome": "~/.claude"
  },
  "slack": {
    "enabled": true,
    "channel": "#claude-code-mastery",
    "username": "Claude Code Mastery",
    "iconEmoji": ":chart_with_upwards_trend:",
    "postOnScoreDelta": 0,
    "webhookEnvVar": "SLACK_WEBHOOK_URL"
  },
  "publish": {
    "publicUrl": "http://localhost:3737",
    "comment": "Set to your deployed URL (e.g. https://claude-mastery.vercel.app) so the Slack message links somewhere useful."
  },
  "scoring": {
    "includePluginSkillsAsPersonal": false,
    "insightsLookbackDays": 30,
    "progressionLookbackDays": null,
    "includeTranscripts": false,
    "comment": "includePluginSkillsAsPersonal — count plugin-provided agents/commands toward Automation. Default false. insightsLookbackDays — window for /insights-derived counters (auto-mode use, friction counts, etc.). Default 30. progressionLookbackDays — window for the milestone timeline; null = use full session history. includeTranscripts — opt in to scanning ~/.claude/projects/*.jsonl for permission-mode and worktree usage. Expensive — scans full transcript history. Off by default."
  },
  "claudeMd": {
    "enabled": true,
    "mode": "report-only",
    "targets": [{ "name": "your-repo", "path": "~/Projects/your-repo" }],
    "comment": "Audited deterministically each morning. Report-only — never edits CLAUDE.md. Add a target per repo you want tracked."
  }
}
```

The `comment` fields are real guidance — keep them when patching. Don't strip them.

## What goes where

| File                             | Contents                                                                      | Committed?          |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| `assessment.config.json`         | Non-secret config: display name, Slack channel, public URL, CLAUDE.md targets | **no** (gitignored) |
| `.env.local`                     | Secrets: `SLACK_WEBHOOK_URL=...`                                              | **no** (gitignored) |
| `assessment.config.example.json` | Template with placeholder values                                              | yes                 |

## After first run

Tell the user:

- The score lives in `app/data/assessment.json` and re-renders on the dashboard at `npm run dev` (http://localhost:3737).
- Trends accrue in `app/data/assessment-history.json` (gitignored — local only).
- The cloud routine in `ROUTINE.md` can run this on a schedule once they're happy with the manual flow.

## Behavioral signals (later toggle)

Don't enable on first run. The default config audit is enough to start. Once they have a baseline, mention they can:

- Set `scoring.includeTranscripts: true` to add transcript-derived behavioral aggregates (plan-mode usage, auto-mode entries, worktree usage).
- Tune `scoring.insightsLookbackDays` if 30 is too narrow or too wide for their cadence.

See [`signals.md`](./signals.md) for the full list of what behavioral mode adds — and the cost (full transcript scan each run).
