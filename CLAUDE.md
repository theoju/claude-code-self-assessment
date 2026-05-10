# Project memory: claude-code-self-assessment

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
  _usage-data.mjs        # facets/session-meta loaders + scanTranscriptInvocations()
  _history-data.mjs      # history.jsonl scanner — catches side-channel slash
                         # commands (/btw, /clear, /compact) the session JSONL misses
  _fs-utils.mjs          # claudeHome / safeReadJson / safeReaddir
  score.mjs              # rules → scores, normalize() per dim
  progression.mjs        # milestone walker (first plan mode, first skill, etc)
  config-progression.mjs # config-side milestones (settings/hooks/agents)
  run-assessment.mjs     # entry point (npm run assess) — 07:15 routine
  run-coverage.mjs       # 06:00 coverage routine (vitest + V8 + e2e + bench)
  claude-md-audit.mjs    # report-only CLAUDE.md health audit
  slack.mjs              # buildSlackMessage() + postToSlack() — Slack post shape
  boris-tips.mjs         # canonical Boris-tip metadata (titles, anchors)
  snapshot-boris-tips.mjs# fetches /boris skill content (postinstall) → gitignored
  import-insights.mjs    # CLI: file /insights markdown into app/data
  setup.sh               # one-shot bootstrap (config + .env.local + LaunchAgent)
  launchd/               # macOS LaunchAgent installers for both routines
  __tests__/             # vitest suites (mirrors scripts/ layout)
    integration/         # gatherSignals + full pipeline against a tmp HOME
  __benchmarks__/        # vitest bench: assessment / score / slack hot paths
app/
  page.tsx               # main dashboard (Platform Setup tile + Execution tile + radar)
  components/
    RadarChart.tsx       # SVG radar; italic + 0.65 opacity + ¹ tspan for unmeasured-ex dims
    ClaudeMdHealth.tsx   # aggregate CLAUDE.md audit tile
    InsightsNarrative.tsx# verbatim /insights markdown renderer
    ProgressionTimeline.tsx # milestone timeline (progression.mjs + config-progression.mjs)
  methodology/page.tsx   # full formula breakdown for each scorer
  dimensions/[id]/       # per-dimension drill-down (rubric + nextActions)
  tips/[n]/              # per-Boris-tip page
  api/insights-report/route.ts # localhost-only proxy to ~/.claude/usage-data/report.html
  lib/
    assessment.ts        # typed loader for app/data/assessment.json
    boris-tips.ts        # rubric ↔ tip cross-walk
    coverage.ts          # loader for app/data/coverage.json
    dimension-explainer.ts # per-dim copy
    insights-narrative.ts  # markdown loader
    progression.ts       # milestone loader
  data/
    rubric.json          # committed: titles, weights, targets, Boris tip refs, nextActions
    boris-tip-index.json # committed: tip-number → metadata index
    assessment.json      # gitignored: latest snapshot
    assessment-history.json  # gitignored: trend series (90 entries rolling)
    progression.json / progression-config.json # gitignored: milestone state
    coverage.json / coverage-history.json      # gitignored: 06:00 routine output
    insights-narrative.md    # gitignored: user-imported /insights markdown
    boris-tips-content.json  # gitignored: snapshot of third-party /boris skill content
.claude/commands/
  self-assessment.md     # /self-assessment slash command
  refresh-insights.md    # /refresh-insights slash command
.claude/skills/
  self-assessment/       # SKILL.md packaged form (mirrors the command)
e2e/                     # Playwright tests (web vitals + smoke)
```

## Tests

```bash
npx vitest run            # ~340 unit/integration tests, ~3s
npm run test:unit         # excludes integration suite
npm run test:integration  # gatherSignals + full pipeline against a tmp HOME
npm run test:bench        # vitest bench (scripts/__benchmarks__/)
npm run test:e2e          # Playwright (web vitals) — needs dev server
npm run test:coverage     # V8 coverage report
```

If a test fails after a scoring change, update the fixture in
`scripts/__tests__/_fixtures.mjs` (`makeSignals` / `makeInsights` /
`makeAssessment`) rather than weakening the assertion. Fixture should reflect
the full insights-signals + assessment contract; missing fields cascade into
NaN scores. `makeAssessment` must always include `executionOverall` so the
two-axis Slack/console renderers don't fall back to the unmeasured form.

## Daily routines (macOS launchd)

Two LaunchAgents run back-to-back; both reuse `SLACK_WEBHOOK_URL` from
`.env.local`, baked into the plist at install:

| Time  | Script                       | Purpose                                       |
| ----- | ---------------------------- | --------------------------------------------- |
| 06:00 | `scripts/run-coverage.mjs`   | Vitest + V8 coverage, integration, bench, e2e |
| 07:15 | `scripts/run-assessment.mjs` | Re-score 12 dims + audit CLAUDE.md targets    |

The 75-minute gap means the dashboard reflects fresh coverage by the time the
Self-Assessment summary arrives. Install/uninstall via `npm run
schedule:install` and `npm run schedule:coverage:install` (each has a
matching `:uninstall`). Why not `/schedule`? It runs in the cloud and can't
read your local `~/.claude/` — which is exactly the signal source.

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
- **Slash-command probes take `Math.max` of both scanners.** The transcript
  scanner (`scanTranscriptInvocations` over `projects/*/*.jsonl`) misses
  side-channel commands like `/btw` that never reach the main session loop;
  the history scanner (`scanHistoryJsonl` over `~/.claude/history.jsonl`)
  catches typed prompts but misses commands fired by other commands (e.g.
  `/loop` invoked by `/ship`). `run-assessment.mjs:maxProbe()` reads both and
  returns the larger value. When you add a new slash-command probe, wire it
  through `maxProbe` — never read a single source.

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
- Cross-references between sibling docs/skills/commands should be
  bidirectional. When you add a pointer in one direction (e.g. PR #26 made
  `/refresh-insights` point to `/self-assessment`), check whether the
  reverse direction also needs one. PR #27 closed the loop in the
  `self-assessment` SKILL.md `## Pointers` section after a re-audit caught
  the asymmetry. Default to symmetric; one-way pointers age into stale
  asymmetric trees.
- Committed README/doc assets live in `docs/images/`. The `.gitignore`
  rule `dashboard-*.png` exists to keep ad-hoc tooling/test screenshots
  out of the repo — name committed assets around it (e.g.
  `mastery-dashboard.png`) rather than adding a per-file `!exception`
  that future contributors have to maintain.

## Privacy

- All scoring is local. No data leaves the machine unless Slack is enabled.
- `app/data/insights-narrative.md` and `~/.claude/usage-data/report.html` are
  user-driven imports (gitignored / served only on localhost).
- The dashboard never reuses Anthropic's `/insights` prompt template, never
  calls any Anthropic API, and includes explicit non-affiliation language in
  `app/methodology/page.tsx` (Attribution section).
