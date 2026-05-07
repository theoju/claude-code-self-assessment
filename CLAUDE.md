# Project memory: claude-code-mastery

A local Next.js 16 dashboard that scores Claude Code usage against Boris Cherny's
87 workflow tips. Reads `~/.claude/` and `~/.claude/usage-data/` directly — no
Anthropic API calls, no telemetry uploaded.

## Scoring model

Two independent axes, never collapsed:

- **Platform Setup** — derived from `~/.claude/settings.json`, `agents`,
  `commands`, `skills`, `plans`, `projects/*/memory`. _"Are the tools in
  place?"_
- **Execution** — derived from `~/.claude/usage-data/{facets,session-meta}/*.json`
  (the cooked telemetry `/insights` reads). Optionally scans
  `projects/*/*.jsonl` transcripts for the `★ Insight` banner (learning mode),
  worktree usage, and skill attribution. _"Are you using them?"_

Each per-dimension score is normalized to 100: `clamp(round(rawScore / target × 100))`.
The raw values are preserved alongside (`rawScore`, `rawTarget`, `executionRawScore`)
for audit. **Never re-introduce the old `overall / 89` form.**

Nine of twelve dims have Execution scorers. The remaining three (Model & Effort,
Memory & Context, Terminal & Customization) route to _unmeasured_ via
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
npx vitest run            # 223 tests, ~3s
```

If a test fails after a scoring change, update the fixture in
`scripts/__tests__/_fixtures.mjs` (`makeSignals` / `makeInsights` /
`makeAssessment`) rather than weakening the assertion. Fixture should reflect
the full insights-signals + assessment contract; missing fields cascade into
NaN scores. `makeAssessment` must always include `executionOverall` so the
two-axis Slack/console renderers don't fall back to the unmeasured form.

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
- **Never collapse the two axes on any rendering surface.** Platform Setup
  and Execution scores must each be presented separately on the dashboard,
  the methodology page, the console printer (`run-assessment.mjs`), and the
  Slack post (`scripts/slack.mjs`). The Slack rule is now machine-enforced
  by `scripts/__tests__/slack.test.mjs` — the regression test asserts
  `not.toMatch(/\*Overall\*/)`. Don't weaken it. The legacy `overall / 89`
  form is permanently retired.
- **Verify before claiming.** Before documenting a CLI flag's accepted forms
  (or any other contract claim), read the parser and run a one-shot
  invocation. PR #22 documented `--claude-md-target` as `name=path` only;
  `parseTargetSpec` actually accepts a bare path too. Cost: a follow-up PR
  to fix the docs. Pattern: _premature root-cause commitment_ —
  exactly the friction class the `/insights` report flags.

## Conventions

- Slash commands and Skills are reusable assets — when you ship a repeatable
  workflow (e.g. `/refresh-insights`), prefer creating it under
  `.claude/commands/` over leaving it as in-line instructions.
- PR stack discipline: stack PRs base-on-base via `gh pr create --base`. When
  GitHub auto-closes a PR because its base branch was deleted, retarget
  surviving PRs to `main` _before_ squash-merging the parent.
- `--delete-branch` doesn't always work cleanly (inside or outside a
  worktree) — `gh` deletes the remote branch but the local remote-tracking
  ref persists. Run `git fetch --prune` after the merge to clear it.
- Sourcing `.env.local` for local runs: `scripts/run-assessment.mjs` reads
  `process.env.SLACK_WEBHOOK_URL` directly and does not auto-load
  `.env.local`. The LaunchAgent gets it via `EnvironmentVariables` in the
  plist (baked at install). For ad-hoc local runs that should post to
  Slack, prefix with `set -a; source .env.local; set +a;`.

## Privacy

- All scoring is local. No data leaves the machine unless Slack is enabled.
- `app/data/insights-narrative.md` and `~/.claude/usage-data/report.html` are
  user-driven imports (gitignored / served only on localhost).
- The dashboard never reuses Anthropic's `/insights` prompt template, never
  calls any Anthropic API, and includes explicit non-affiliation language in
  `app/methodology/page.tsx` (Attribution section).
