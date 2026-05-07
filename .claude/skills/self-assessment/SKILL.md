---
name: self-assessment
description: Score Claude Code mastery against Boris Cherny's 87 tips and the two-axis Platform Setup vs Execution rubric. Trigger on "self-assessment", "score my Claude Code usage", "mastery audit", "run /self-assessment", "how am I using Claude Code".
---

# self-assessment

Hub for the `/self-assessment` slash command. Spokes:

- [`gotchas.md`](./gotchas.md) — failure modes and their fixes
- [`signals.md`](./signals.md) — what gets read, what gets written, anti-gaming gates
- [`setup.md`](./setup.md) — first-run config prompt flow

## What to do

1. **Check setup first.** If `assessment.config.json` is missing, walk the user through `setup.md` before running anything.
2. **Run the scorer:** `npm run assess -- $ARGUMENTS`. This writes `app/data/assessment.json` (current snapshot) and appends to `app/data/assessment-history.json` (gitignored trend series). If `slack.enabled: true` and `SLACK_WEBHOOK_URL` is set in `.env.local`, it also posts a Slack summary.
3. **Report back** with the contract below. Don't add prose; users want the numbers.

## Reporting contract

- **Platform Setup** and **Execution** scores out of 100, plus the Δ between them. The diagnostic case is a high Δ — every tool installed, none of them fired.
- Dimensions that improved (↗) or slipped (↘) since the previous snapshot.
- **Top 3 priority actions** ranked by weight × deficit. Note which side each falls on (Platform Setup vs Execution).
- **CLAUDE.md health summary** — only if `claudeMd.targets` is configured. Aggregate stats only: total targets, files scanned, average score/grade, grade distribution. **No project names, paths, or per-file issues** — the report must be safe to share.
- The dashboard URL from `assessment.config.json#publish.publicUrl`, or note that `npm run dev` serves it locally at http://localhost:3737.

## Pointers

- Slack not configured? `gotchas.md` covers the missing-webhook path.
- Want behavioral signals (plan-mode rate, verify-before-ship, worktree usage)? See `signals.md` → "Behavioral mode".
- Full user guide: [`docs/self-assessment.md`](../../../docs/self-assessment.md).
