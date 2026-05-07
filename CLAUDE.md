# Project memory: claude-code-mastery

A local Next.js 16 dashboard that scores Claude Code usage against Boris Cherny's
87 workflow tips. Reads `~/.claude/` and `~/.claude/usage-data/` directly — no
Anthropic API calls, no telemetry uploaded.

## Scoring model

Two independent axes, never collapsed:

- **Platform Setup** — derived from `~/.claude/settings.json`, `agents`,
  `commands`, `skills`, `plans`, `projects/*/memory`. *"Are the tools in
  place?"*
- **Execution** — derived from `~/.claude/usage-data/{facets,session-meta}/*.json`
  (the cooked telemetry `/insights` reads). Optionally scans
  `projects/*/*.jsonl` transcripts for the `★ Insight` banner (learning mode),
  worktree usage, and skill attribution. *"Are you using them?"*

Each per-dimension score is normalized to 100: `clamp(round(rawScore / target × 100))`.
The raw values are preserved alongside (`rawScore`, `rawTarget`, `executionRawScore`)
for audit. **Never re-introduce the old `overall / 89` form.**

Nine of twelve dims have Execution scorers. The remaining three (Model & Effort,
Memory & Context, Terminal & Customization) route to *unmeasured* via
`gapReason` because the relevant signals never reach the cooked telemetry.
Unmeasured ≠ scored zero — the radar marks them with italic labels and a
footnote.

## Where things live

```
scripts/
  signals.mjs            # Platform Setup signals (~/.claude/)
  insights-signals.mjs   # Execution signals (~/.claude/usage-data/)
  _usage-data.mjs        # facets/session-meta loaders + scanTranscriptModes()
  score.mjs              # rules → scores, normalize() per dim
  progression.mjs        # milestone walker (first plan mode, first skill, etc)
  run-assessment.mjs     # entry point (npm run assess)
  claude-md-audit.mjs    # report-only CLAUDE.md health audit
app/
  page.tsx               # main dashboard (Platform Setup tile + Execution tile + radar)
  components/RadarChart.tsx  # SVG radar; italic + 0.65 opacity + ¹ tspan for unmeasured-ex dims
  methodology/page.tsx   # full formula breakdown for each scorer
  data/
    rubric.json          # committed: titles, weights, targets, Boris tip refs
    assessment.json      # gitignored: latest snapshot
    assessment-history.json  # gitignored: trend series (90 entries rolling)
    insights-narrative.md    # gitignored: user-imported /insights markdown
.claude/commands/
  self-assessment.md     # /self-assessment slash command
  refresh-insights.md    # /refresh-insights slash command
```

## Tests

```bash
npx vitest run            # 189 tests, ~3s
```

If a test fails after a scoring change, update the fixture in
`scripts/__tests__/_fixtures.mjs makeInsights()` rather than weakening the
assertion. Fixture should reflect the full insights-signals contract; missing
fields cascade into NaN scores.

## Hard rules

- **Never auto-run `/insights`.** It's token-heavy. The `/refresh-insights`
  skill files output that `/insights` already produced in the user's session;
  it must not invoke `/insights` itself.
- **Don't paraphrase the `/insights` narrative** when filing it. Write
  verbatim. The dashboard's value depends on faithfully presenting Anthropic's
  analysis, not the dashboard's interpretation.
- **Don't post to Slack** unless `slack.enabled: true` AND `SLACK_WEBHOOK_URL`
  is set. The dashboard's CLAUDE.md health summary is aggregate-only on
  shareable surfaces (Slack, console) — no project names, paths, or per-file
  issues — but per-target detail in `assessment.json` is local-only.
- **Empirically verify telemetry fields before scoring against them.** The
  original PR 9 plan assumed an `outputStyle` field that doesn't exist; a
  60-transcript survey killed it before the code was wrong. Use the same
  approach for any new Execution scorer.

## Conventions

- Slash commands and Skills are reusable assets — when you ship a repeatable
  workflow (e.g. `/refresh-insights`), prefer creating it under
  `.claude/commands/` over leaving it as in-line instructions.
- PR stack discipline: stack PRs base-on-base via `gh pr create --base`. When
  GitHub auto-closes a PR because its base branch was deleted, retarget
  surviving PRs to `main` *before* squash-merging the parent.
- `--delete-branch` doesn't always work cleanly inside a worktree (gh deletes
  the remote branch; local cleanup may need `git fetch --prune` afterward).

## Privacy

- All scoring is local. No data leaves the machine unless Slack is enabled.
- `app/data/insights-narrative.md` and `~/.claude/usage-data/report.html` are
  user-driven imports (gitignored / served only on localhost).
- The dashboard never reuses Anthropic's `/insights` prompt template, never
  calls any Anthropic API, and includes explicit non-affiliation language in
  `app/methodology/page.tsx` (Attribution section).
