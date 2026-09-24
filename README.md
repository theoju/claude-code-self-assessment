# Claude Code Self-Assessment

A personal dashboard that scores your day-to-day Claude Code usage against
[Boris Cherny's workflow tips](https://howborisusesclaudecode.com) and a
12-dimension Self-Assessment rubric. It reads signals directly from
`~/.claude/`. There is no telemetry and no external service; nothing leaves
your machine unless you enable the Slack notifier.

![Dashboard overview — two-axis scoring (Platform Setup vs Execution), 12-dimension radar, milestone progression, and the headline read.](docs/site-src/images/self-assessment-dashboard.png)

**Documentation:** <https://theoju.github.io/claude-code-self-assessment/>

## What it measures

Every score sits on one of two axes, and the two are never collapsed into a
single composite:

| Axis               | Question                     | Source                                                                                    |
| ------------------ | ---------------------------- | ----------------------------------------------------------------------------------------- |
| **Platform Setup** | Are the tools in place?      | `~/.claude/settings.json`, `agents`, `commands`, `skills`, `plans`, project memory        |
| **Execution**      | Are you actually using them? | `~/.claude/usage-data/` (the cooked telemetry `/insights` reads), plus opt-in transcripts |

The diagnostic case is a large gap between them: every tool installed, none of
them fired.

Both axes are scored across the same **12 dimensions**: automation,
permissions, model and effort tuning, parallelism, verification, memory,
planning, integrations, customization, scheduled work, remote and mobile, and
learning.

- **Deterministic.** Signals → rules → number, normalized per dimension to a
  100-point scale (`raw / target × 100`). Every number traces to a signal.
- **Honest about gaps.** When a dimension has no Execution data in the window,
  the radar marks it unmeasured (italic label and a footnote) instead of
  scoring it zero.
- **Trended.** Each run appends to `app/data/assessment-history.json`. After
  two runs the ↗/↘/→ arrows reflect real changes, not vibes.
- **Local.** The dashboard runs on `localhost`. An optional Slack post at
  07:15 is the only thing that leaves the machine.

```
Claude Code Self-Assessment — Engineer
Platform Setup  78 / 100
Execution       63 / 100 (observed practice)

   46 / 100  →  Automation — Hooks, Commands, Agents (raw 41/90)
   65 / 100  →  Permissions & Safety (raw 55/85) · ex  24
   78 / 100  →  Model & Effort Tuning (raw 70/90)
   …
```

## Quick start

```bash
git clone https://github.com/theoju/claude-code-self-assessment.git
cd claude-code-self-assessment
npm install
npm run setup          # creates assessment.config.json and .env.local from examples
npm run assess:print   # score your setup, print to terminal
npm run dev            # open http://localhost:3737
```

That's the whole loop. Everything below is optional.

Set your display name in `assessment.config.json`. You never need to change
`rubric.json` for personal use; the only reason to send a rubric change
upstream is to retune the shared target profile.

## Daily use

Two slash commands ship in `.claude/commands/`:

- **`/self-assessment`** runs `npm run assess` and reports the Platform Setup
  and Execution scores, trend deltas, and the top three priority actions
  (ranked by weight × deficit). Treat it like a morning standup with your
  toolchain. Full guide: [`docs/site-src/self-assessment.md`](docs/site-src/self-assessment.md).
- **`/refresh-insights`** files the markdown summary from a `/insights` run in
  the current session into `app/data/insights-narrative.md`, verbatim. It
  never invokes `/insights` itself.

### Weekly refresh with `/insights`

`/insights` is Claude Code's built-in report. It is token-heavy, so run it
yourself about once a week; `/self-assessment` is cheap enough to run daily.
The weekly form chains all three:

```text
/insights

/refresh-insights && /self-assessment \
  --claude-md-target <name>=<absolute-path-to-project-root> \
  --include-transcripts \
  --insights-lookback 30
```

| Step                | Effect                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/insights`         | Writes the HTML report and prints the markdown narrative into the session. **Not invoked by this dashboard.** |
| `/refresh-insights` | Files that markdown verbatim into `app/data/insights-narrative.md` (gitignored).                              |
| `/self-assessment`  | Runs `npm run assess`, scores both axes, posts to Slack if configured.                                        |

On daily runs, drop the first two.

### `/self-assessment` flags

The same flags work on `npm run assess`.

| Flag                                         | Meaning                                                                                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--claude-md-target <name=path>` or `<path>` | Audit a CLAUDE.md file at `<path>`. With `name=path`, the report labels it `<name>`; with a bare path, the name defaults to the last directory segment. Repeat the flag for multiple targets. Path can use `~`. |
| `--include-transcripts`                      | Scan the last N days of `~/.claude/projects/*/*.jsonl` transcripts for behavioral signals (skill invocation, plan-mode usage, ★ Insight banners, worktree usage).                                               |
| `--no-transcripts`                           | Skip the transcript scan even when `scoring.includeTranscripts: true` in config. Wins over `--include-transcripts`.                                                                                             |
| `--insights-lookback <N>`                    | How many days back to read from `~/.claude/usage-data/`. Defaults to 30 (or `scoring.insightsLookbackDays` in config).                                                                                          |
| `--no-slack`                                 | Skip the Slack post even when `slack.enabled: true`. Useful for ad-hoc local runs.                                                                                                                              |
| `--print`                                    | Print the full block of dimension scores to stdout in addition to the summary.                                                                                                                                  |

### Surfacing the `/insights` analysis in the dashboard

Two opt-in paths show Claude's own analysis next to the scores. Both read
files already on your disk; neither captures anything automatically.

1. **HTML report button.** `/insights` writes a full report to
   `~/.claude/usage-data/report.html`. When the file exists, the dashboard
   shows an "Open Claude's full /insights report" button that serves it
   locally through `/api/insights-report`.
2. **Inline markdown summary.** File the narrative into
   `app/data/insights-narrative.md` by any of three paths:

   ```bash
   /refresh-insights                   # in Claude Code: files the markdown verbatim
   pbpaste | npm run import-insights   # pipe the macOS clipboard
   # or paste into app/data/insights-narrative.md directly
   ```

The markdown file is gitignored, rendered locally, and never posted to Slack.

## Optional setup

### Slack notifier

1. Create an Incoming Webhook at <https://api.slack.com/apps> (new app → add
   the Incoming Webhooks feature → add to a channel).
2. Paste the URL into `.env.local` as `SLACK_WEBHOOK_URL=...`. `.env.local` is
   gitignored.
3. Check that `slack.enabled` is `true` in `assessment.config.json` (the
   default).
4. `npm run assess` now posts a scored card with strengths, biggest gaps, and
   an "Open dashboard" button linking to `publish.publicUrl`
   (default `http://localhost:3737`).

The button only works on your own machine, because the dashboard is local.
That is intentional: the score is personal.

### Daily 07:15 run

Uses a macOS `launchd` LaunchAgent. If the Mac is asleep at 07:15, the run
fires when it next wakes.

```bash
npm run schedule:install     # one-time
launchctl start com.$(whoami).claude-self-assessment   # fire once to test
npm run schedule:uninstall   # remove
```

The installer reads `SLACK_WEBHOOK_URL` from `.env.local` and bakes it into
`~/Library/LaunchAgents/com.<you>.claude-self-assessment.plist`.
[`ROUTINE.md`](./ROUTINE.md) explains why `/schedule` can't do this job:
Anthropic-cloud routines can't read your local `~/.claude/`.

### Tuning the rubric

`app/data/rubric.json` is the target profile. Each dimension has a `weight`
(1–3, how high-leverage the area is) and a `target` (0–100, what "good" looks
like). Each axis's overall score is the weight-normalized mean of its
per-dimension scores.

Change those two numbers per dimension to match your team's philosophy. A
security-first team might set `permissions` to weight 3 and target 95; a
research lab might raise `learning` to 3 and drop `scheduled` to 1.

A new dimension needs a matching scorer in `scripts/score.mjs`, keyed on `id`.
Without one, it renders with score 0 and a "not-touched" tier.

## How it works

### Architecture

<a href="https://theoju.github.io/claude-code-self-assessment/diagrams/self-assessment.architecture.html">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/site-src/diagrams/self-assessment.architecture.preview.dark.svg">
    <img alt="Self-Assessment architecture: the /self-assessment skill and the 07:15 launchd job both enter run-assessment.mjs, which threads signals through score.mjs and rank-next-actions.mjs into app/data/, then optionally posts to Slack." src="docs/site-src/diagrams/self-assessment.architecture.preview.light.svg">
  </picture>
</a>

The `/self-assessment` skill and the 07:15 `launchd` job both enter
`scripts/run-assessment.mjs`. Its `main()` calls each stage in turn: gather
signals, score them in `score.mjs`, rank next actions in
`rank-next-actions.mjs`, write the results to `app/data/`, and optionally post
to Slack. The modules do not call each other.
[Open the interactive diagram →](https://theoju.github.io/claude-code-self-assessment/diagrams/self-assessment.architecture.html)

### Scoring data flow

<a href="https://theoju.github.io/claude-code-self-assessment/diagrams/scoring.dataflow.html">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/site-src/diagrams/scoring.dataflow.preview.dark.svg">
    <img alt="Scoring data flow: config state and cooked telemetry, plus opt-in transcripts, flow through the two independent axes, Platform Setup and Execution, into assessment.json, the dashboard, and the optional Slack post." src="docs/site-src/diagrams/scoring.dataflow.preview.light.svg">
  </picture>
</a>

Config state feeds Platform Setup; cooked telemetry (plus opt-in transcripts)
feeds Execution. The two axes stay separate all the way through to
`assessment.json`, the dashboard, and the Slack post.
[Open the interactive diagram →](https://theoju.github.io/claude-code-self-assessment/diagrams/scoring.dataflow.html)

The interactive versions support pan, zoom, search, light and dark themes, and
guided views. Specs and rendering instructions live in
[`docs/site-src/diagrams/`](docs/site-src/diagrams/index.md).

### Scoring pipeline

1. **`scripts/signals.mjs`** reads the Platform Setup inputs:
   `~/.claude/settings.json` (effort level, hooks, permissions, enabled
   plugins), the contents of `~/.claude/agents`, `commands`, `skills`, and
   `plans`, and MEMORY.md files under `~/.claude/projects/*/memory`.
2. **`scripts/insights-signals.mjs`** and **`scripts/_usage-data.mjs`** read
   the Execution inputs from `~/.claude/usage-data/{facets,session-meta}/*.json`.
   With `--include-transcripts`, they also scan `~/.claude/projects/*/*.jsonl`
   for the `★ Insight` banner (learning mode), worktree usage, skill
   attribution, and posture commands such as `/clear` and `/compact`.
3. **`scripts/score.mjs`** applies deterministic rules per dimension and
   normalizes each to 100. All twelve dimensions have an Execution scorer.
   Model & Effort is only partly measured: Opus usage is scored from
   transcripts, while effort level remains settings-only.
4. **`scripts/rank-next-actions.mjs`** drops satisfied next actions and ranks
   the rest by weight × deficit.
5. **`scripts/run-assessment.mjs`** writes `app/data/assessment.json`, appends
   to `assessment-history.json`, and posts to Slack if configured.
6. The Next.js app renders `rubric.json` plus `assessment.json`. The
   [`/methodology`](http://localhost:3737/methodology) page breaks down the
   formula behind every scorer.

### Probe coverage

Every score traces to a **probe**: a named signal read from your local Claude
Code state. `app/data/probe-catalog.json` lists 50 of them.

| Axis label | Source layer                       | Meaning                                                                          |
| ---------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| **P**      | Settings, filesystem, plugins      | Config: "is it installed?" Feeds Platform Setup.                                 |
| **P\***    | Transcripts (`projects/*/*.jsonl`) | A usage signal that gates a Platform Setup next action, not the Execution radar. |
| **A**      | Runtime (`~/.claude.json`)         | Adoption: capped credit on the Execution axis.                                   |
| **E**      | Cooked telemetry (`usage-data/`)   | The Execution radar vertices: "are you using it?"                                |
| **P+E**    | —                                  | Scored on both axes.                                                             |

Boris's upstream corpus has 87 tips; this repo tracks a canonical set of 75.
Each of the 75 carries a status: ✅ 53 predicate-backed probes · 📊 12 shared
scorer signals · 🗣 3 behavioral coaching (not auto-detected) · ❌ 7 not yet
tracked.

The full per-probe registry and the tip-by-tip matrix live in the tracker,
[`docs/superpowers/specs/2026-05-25-probe-implementation-status.md`](docs/superpowers/specs/2026-05-25-probe-implementation-status.md).
Its header counts are enforced in CI by `scripts/__tests__/tracker-counts.test.mjs`.

## Project layout

```
app/
  page.tsx                  # dashboard: Platform Setup + Execution tiles, radar
  components/               # RadarChart, ProgressionTimeline, InsightsNarrative, PageNav
  methodology/              # formula breakdown per scorer; probes/ lists predicate checks
  progression/              # milestone timeline
  dimensions/[id]/          # per-dimension drilldown
  tips/[n]/                 # Boris tip detail
  api/insights-report/      # serves ~/.claude/usage-data/report.html locally
  data/
    rubric.json             # titles, weights, targets, next-actions   ← committed
    probe-catalog.json      # signal → source metadata                ← committed
    assessment.json         # latest scored snapshot                  ← gitignored
    assessment-history.json # trend series                            ← gitignored
scripts/
  signals.mjs               # Platform Setup signals
  insights-signals.mjs      # Execution signals
  _usage-data.mjs           # telemetry loaders, transcript scanners
  score.mjs                 # rules → scores
  predicate.mjs             # satisfiedWhen DSL evaluator
  rank-next-actions.mjs     # top-N next actions
  run-assessment.mjs        # entry point (npm run assess)
  slack.mjs                 # webhook payload + poster
  launchd/                  # LaunchAgent template + installer
.claude/commands/           # /self-assessment, /refresh-insights
docs/site-src/              # documentation site source (mkdocs), diagrams
```

## What's committed vs. what's yours

The rubric and scoring engine are generic. Everything identifying (display
name, channel, webhook, and your actual scores) stays on your machine.

| File / path                                                     | Status        | Why                                                                                                                                   |
| --------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `assessment.config.example.json`, `.env.example`                | **committed** | templates                                                                                                                             |
| `app/data/rubric.json`                                          | **committed** | the static rubric everyone shares                                                                                                     |
| `app/data/boris-tip-index.json`                                 | **committed** | volume/tab routing metadata for `/tips/N` (small index, our own work)                                                                 |
| `.claude/commands/*.md`                                         | **committed** | the slash commands                                                                                                                    |
| `app/data/boris-tips-content.json`                              | gitignored    | snapshot of the `/boris` skill (third-party content), regenerated by the `npm install` postinstall hook from `~/.claude/skills/boris` |
| `.claude/settings.local.json`                                   | gitignored    | per-user permissions                                                                                                                  |
| `assessment.config.json`                                        | gitignored    | your display name, webhook channel                                                                                                    |
| `.env.local`                                                    | gitignored    | your webhook secret                                                                                                                   |
| `app/data/assessment.json`, `assessment-history.json`           | gitignored    | your scored snapshot and trend series                                                                                                 |
| `.launchd.{out,err}.log`                                        | gitignored    | runtime output from the LaunchAgent                                                                                                   |
| `~/Library/LaunchAgents/com.<you>.claude-self-assessment.plist` | outside repo  | lives in your `$HOME`                                                                                                                 |

## FAQ

**Why not use `/schedule` for the daily run?**
`/schedule` routines run in Anthropic's cloud. They can't read your local
`~/.claude/` directory, which is exactly what the scorer reads. `launchd` is
the local equivalent.

**Does the dashboard need to be deployed?**
No. The default config points at `http://localhost:3737`. If you want the
Slack "Open dashboard" button to work from your phone, deploy the Next.js app
(`vercel deploy --prod`) and update `publish.publicUrl`.

**Why are my scores lower than I expected?**
Scoring rewards what _you_ built (custom agents, commands, hooks), not what
plugins provide. Boris's rule is "if you do something 2×/day, make it a
skill." Set `scoring.includePluginSkillsAsPersonal: true` in
`assessment.config.json` if you disagree.

**Where do Boris's tips come from?**
The `boris` skill at `~/.claude/skills/boris` (installed with the
`andrej-karpathy-skills` or `claude-code-workflows` marketplace). The rubric's
`borisTips` field cross-references section numbers.

**Is `/ship` part of this repo?**
No. The rubric scores authorship of a personal `/ship` slash command (Boris
tip 5) as the highest-weighted automation next action, but `/ship` lives in
your personal `~/.claude/commands/` so it works in any repo. See
[`docs/site-src/ship-pattern.md`](docs/site-src/ship-pattern.md) for a
one-page summary, or the
[full 8-stage design spec](docs/superpowers/specs/2026-05-09-ship-slash-command-design.md).

## Attribution

This is an **independent, open-source community tool**. It is **not
affiliated with, endorsed by, or sponsored by Anthropic**.

- It reads files that Claude Code writes to your local `~/.claude/` directory
  during normal use (settings, installed plugins, project memory, and the
  per-session telemetry under `~/.claude/usage-data/`) and computes its own
  scores.
- The Execution axis and the progression timeline use the same local data
  files that Claude Code's built-in `/insights` command reads. This project
  does **not** reuse `/insights` output, replicate its UI, or call any
  Anthropic API. References to `/insights` describe the data source format
  only.
- "Claude", "Claude Code", and "/insights" are trademarks of Anthropic, used
  here only to identify the platform this tool complements.

Acknowledgements:

- **Anthropic** for building Claude Code and exposing the local
  `~/.claude/usage-data/` telemetry that makes the Execution axis possible.
- **Boris Cherny** ([@bcherny on X](https://x.com/bcherny)), author of the
  workflow tips the rubric weights are derived from.
- **Daniel An** ([@CarolinaCherry on GitHub](https://github.com/CarolinaCherry)),
  creator of [howborisusesclaudecode.com](https://howborisusesclaudecode.com)
  and compiler of the `/boris` skill that `/self-assessment`
  cross-references. Tip content is rendered from a local snapshot of that
  skill via the dashboard's `/tips/N` route.

If you work at Anthropic and any of this attribution should be tightened (or
relaxed), please open an issue.

## License

[MIT](./LICENSE) © 2026 Theo Jungeblut.

Not covered by the MIT grant (also documented in `LICENSE`):

- _Trademarks._ "Claude", "Claude Code", and `/insights` are trademarks of
  Anthropic, used nominatively. The MIT license grants no trademark rights.
- _Tip content._ `app/data/boris-tips-content.json` is a snapshot of Boris
  Cherny's tips compiled by Daniel An. It is included for cross-referencing
  only; redistributing the tip text outside that role requires permission
  from the original authors.
