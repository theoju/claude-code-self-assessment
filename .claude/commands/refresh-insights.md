# /refresh-insights

Imports the markdown summary printed by Claude Code's `/insights` command into the dashboard's inline narrative section. **User-initiated**: nothing is auto-captured. The summary is written verbatim to `app/data/insights-narrative.md` (gitignored), rendered locally on the dashboard, and never uploaded or posted to Slack.

This is a convenience wrapper for the manual flow:

```bash
# Manual equivalent (still works):
pbpaste | npm run import-insights
```

## Steps

1. **Verify `/insights` has run in this session.** Look back through the conversation for the structured output (project areas, interaction style, friction analysis, suggestions, on-the-horizon). If it's not present, **stop and ask the user to run `/insights` first** — do not invoke it autonomously.

2. **Locate the markdown summary** in the most recent `/insights` output. It's the human-readable section, typically starting with `# Claude Code Insights` and containing `## At a Glance`, `## Project Areas`, `## Interaction Style`, etc. **Skip the raw JSON block** — only the markdown narrative goes into the file.

3. **Write the summary verbatim** to `app/data/insights-narrative.md` using the Write tool. Overwrite any existing content. Preserve every section heading and phrase exactly as Anthropic's `/insights` output rendered them. Do not paraphrase, re-format, or strip attributions.

4. **Confirm to the user** with: the file path, byte count, and a reminder that the dashboard re-renders on browser refresh (no `npm run assess` required for the narrative — it's read at request time).

## What NOT to do

- **Don't paraphrase or augment.** Write the markdown verbatim. The dashboard's value depends on faithfully presenting Anthropic's analysis, not the dashboard's interpretation of it.
- **Don't include the raw JSON data block** that `/insights` also prints. The dashboard renders markdown, not JSON.
- **Don't call any Anthropic API.** `/insights` runs in the user's local Claude Code session; this skill only files its output.
- **Don't auto-run `/insights`** if the user didn't ask. If the user types `/refresh-insights` without having run `/insights` first in this session, prompt them to run it and stop. Auto-firing `/insights` would burn tokens silently and surprise the user.
- **Don't post to Slack** or any external destination. The narrative file is local-only by design.

## Configuration

None. The destination is fixed at `app/data/insights-narrative.md`. To remove the inline narrative section entirely, delete that file:

```bash
rm app/data/insights-narrative.md
```

The "FROM /INSIGHTS" section disappears from the dashboard; the "Open Claude's full /insights report" button (if `~/.claude/usage-data/report.html` exists) remains.

## Why a separate command rather than a flag on `/self-assessment`

Different cadence. `/self-assessment` runs daily (cheap), `/insights` runs weekly-ish (token-heavy). Bundling them would either over-spend tokens or hide the `/insights` invocation from the user. Keeping `/refresh-insights` separate makes the data flow explicit: *you* decide when to refresh the narrative.

## Privacy & attribution

- The markdown lives in a gitignored file. It does not get committed.
- The dashboard renders it inline under a "FROM /INSIGHTS · captured narrative" header so it's clear the content is from Anthropic's `/insights` command, not from the dashboard's own analysis.
- The dashboard's scoring is independent of `/insights` content — it reads `~/.claude/usage-data/` JSON directly. The narrative is purely additive presentation.
