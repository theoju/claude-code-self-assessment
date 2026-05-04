# Claude Code Mastery

A personal dashboard that scores your day-to-day Claude Code usage against
[Boris Cherny's 87 workflow tips](https://howborisusesclaudecode.com) and a
mastery rubric. Reads signals directly from `~/.claude/` — no telemetry, no
external service, nothing leaves your machine unless you enable the Slack
notifier.

- **12 dimensions**: automation, permissions, model/effort tuning, parallelism,
  verification, memory, planning, integrations, customization, scheduled work,
  remote/mobile, and learning.
- **Deterministic scoring**: signals → rules → number. The same config always
  produces the same score, so trend arrows (↗/↘/→) reflect real changes rather
  than vibes.
- **Trend history**: each run appends to `app/data/assessment-history.json`
  (gitignored). After two runs you get meaningful directionality.
- **Optional Slack ping** at 07:15 daily via macOS `launchd`. The dashboard
  stays local; the Slack message is the delivery vehicle.

```
Claude Code Mastery — Engineer
Overall 66 / 89

   33 / 90  ↗  Automation — Hooks, Commands, Agents
   40 / 85  →  Permissions & Safety
   70 / 90  →  Model & Effort Tuning
   …
```

## Quick start

```bash
git clone <this repo> claude-mastery
cd claude-mastery
npm install
npm run setup          # creates assessment.config.json and .env.local from examples
npm run assess:print   # score your setup, print to terminal
npm run dev            # open http://localhost:3737
```

That's the whole loop. Everything else is optional polish.

## How scoring works

1. **`scripts/signals.mjs`** reads your local Claude Code state:
   `~/.claude/settings.json` (effort level, hooks, permissions, enabled
   plugins), the contents of `~/.claude/agents`, `~/.claude/commands`,
   `~/.claude/skills`, `~/.claude/plans`, and MEMORY.md files under
   `~/.claude/projects/*/memory`.
2. **`scripts/score.mjs`** applies deterministic rules per dimension. Each rule
   is a small function that returns `{score, evidence, gaps}`. Open the file —
   every number is traceable to a signal.
3. **`scripts/run-assessment.mjs`** orchestrates: signals → score → write
   `app/data/assessment.json`, append `app/data/assessment-history.json`, post
   to Slack if configured.
4. The Next.js app reads `app/data/rubric.json` (static metadata) + the
   generated `assessment.json` and renders the dashboard.

To retune targets or add a dimension, edit `app/data/rubric.json` and add a
matching scorer in `scripts/score.mjs`. Frontend picks it up automatically.

## `/self-assessment` slash command

Ships in `.claude/commands/self-assessment.md`, so `/self-assessment` is
available in any Claude Code session inside this repo. It calls
`npm run assess` and reports back the overall score, trend deltas, and the top
three weight×deficit priority actions.

Treat it like a morning standup with your toolchain.

## Slack notifier (optional)

1. Create an Incoming Webhook at <https://api.slack.com/apps> (new app → add
   Incoming Webhooks feature → add to channel).
2. Paste the URL into `.env.local` as `SLACK_WEBHOOK_URL=...`. `.env.local` is
   gitignored.
3. Set `slack.enabled: true` in `assessment.config.json` (it's true by default).
4. `npm run assess` will now post a scored card with strengths, biggest gaps,
   and an "Open dashboard" button linking to `publish.publicUrl`
   (default: `http://localhost:3737`).

The card link only works on your own machine because the dashboard is local.
That's intentional — the score is personal.

## Daily 07:15 run (optional)

Uses macOS `launchd`. Laptop is woken from sleep if needed; missed runs fire on
next wake.

```bash
npm run schedule:install     # one-time
launchctl start com.$(whoami).claude-mastery   # fire once to test
npm run schedule:uninstall   # remove
```

The installer reads `SLACK_WEBHOOK_URL` from `.env.local` and bakes it into
`~/Library/LaunchAgents/com.<you>.claude-mastery.plist`. See
[`ROUTINE.md`](./ROUTINE.md) for the full explanation of why `/schedule`
doesn't work here (Anthropic-cloud routines can't read your local
`~/.claude/`).

## Project layout

```
app/
  layout.tsx, page.tsx, globals.css   # Next.js 16 App Router
  components/RadarChart.tsx           # hand-rolled SVG radar
  lib/assessment.ts                   # loader + stats helpers
  data/
    rubric.json                       # static: titles, weights, targets, next-actions  ← committed
    assessment.json                   # current scored snapshot                          ← gitignored
    assessment-history.json           # trend series                                    ← gitignored
scripts/
  signals.mjs                         # read ~/.claude/
  score.mjs                           # rules → scores
  slack.mjs                           # webhook payload + poster
  run-assessment.mjs                  # entry point (npm run assess)
  setup.sh                            # first-run bootstrap
  launchd/
    claude-mastery.plist.template     # LaunchAgent template
    install.sh                        # substitutes placeholders, loads via launchctl
.claude/
  commands/self-assessment.md         # ships the /self-assessment slash command
assessment.config.example.json        # template for per-user config
.env.example                          # template for webhook secret
ROUTINE.md                            # scheduling deep dive
```

## What's committed vs. what's yours

| File / path | Status | Why |
|---|---|---|
| `assessment.config.example.json` | **committed** | template |
| `.env.example` | **committed** | documents `SLACK_WEBHOOK_URL` |
| `app/data/rubric.json` | **committed** | the static rubric everyone shares |
| `.claude/commands/self-assessment.md` | **committed** | the slash command |
| `.claude/settings.local.json` | gitignored | per-user permissions |
| `assessment.config.json` | gitignored | your display name, webhook channel |
| `.env.local` | gitignored | your webhook secret |
| `app/data/assessment.json` | gitignored | your scored snapshot |
| `app/data/assessment-history.json` | gitignored | your trend series |
| `.launchd.{out,err}.log` | gitignored | runtime output from the LaunchAgent |
| `~/Library/LaunchAgents/com.<you>.claude-mastery.plist` | outside repo | lives in your `$HOME` |

The rubric and scoring engine are generic. Everything identifying — display
name, channel, webhook, and your actual scores — stays on your machine.

## Sharing this repo

Fork it or push it under your own account. A new user's experience:

```bash
git clone <your-fork>
cd <your-fork>
npm install
npm run setup
# edit assessment.config.json → their displayName
# (optional) edit .env.local → their webhook
npm run assess:print
npm run dev
```

No PRs touching `rubric.json` are needed per-user. Retunes of the target
profile (e.g. raising the permissions target) are the only reason to send a PR
back upstream.

## Tuning the rubric

`app/data/rubric.json` is the target profile. Each dimension has a `weight`
(1–3, how high-leverage the area is) and a `target` (0–100, what "good" looks
like). The overall score is a weight-normalized mean.

Change those two numbers per dimension to match your team's philosophy. A
security-first team might weight `permissions: 3` and `target: 95`; a research
lab might push `learning: 3` and drop `scheduled: 1`.

New dimensions need a matching scorer function in `scripts/score.mjs` keyed on
`id`. Without one, the dimension renders with score 0 and a "not-touched" tier.

## FAQ

**Why not use `/schedule` for the daily run?**
`/schedule` routines run in Anthropic's cloud. They don't have access to your
local `~/.claude/` directory, which is exactly what the scorer reads. `launchd`
is the local equivalent that can still wake your laptop.

**Does the dashboard need to be deployed?**
No. The default config points at `http://localhost:3737`. If you want the
Slack "Open dashboard" button to work from your phone, deploy the Next.js app
(`vercel deploy --prod`) and update `publish.publicUrl`.

**Why are scores lower than I expected?**
Scoring rewards what *you* built (custom agents, commands, hooks), not what
plugins provide. Boris's rule is "if you do something 2×/day, make it a skill."
Score accordingly. Set `scoring.includePluginSkillsAsPersonal: true` in
`assessment.config.json` if you disagree.

**Where do Boris's tips come from?**
The `boris` skill at `~/.claude/skills/boris` (installed with the
`andrej-karpathy-skills` or `claude-code-workflows` marketplace). The rubric's
`borisTips` field cross-references section numbers.

## Surfacing Claude's `/insights` narrative

The dashboard scores your usage from raw signals on its own. If you'd also like Claude's
own narrative analysis (the rich text `/insights` produces) rendered alongside the
scoring, you can capture it manually:

```bash
# In Claude Code:
/insights
# Copy the output, then either:
pbpaste | npm run import-insights   # macOS clipboard
# or paste it into app/data/insights-narrative.md directly
```

The file is gitignored, rendered locally, never uploaded, and never posted to Slack.
Refresh the dashboard and you'll see a "From `/insights`" section with the captured
text. Re-run `/insights` and re-import to refresh; delete the file to remove the
section. The dashboard never auto-captures `/insights` output.

## Attribution & relationship to Claude Code

This is an **independent, open-source community tool**. It is **not affiliated
with, endorsed by, or sponsored by Anthropic**.

What the dashboard actually does:

- Reads files that Claude Code writes to your local `~/.claude/` directory
  during normal use — settings, installed plugins, project memory, and the
  per-session telemetry under `~/.claude/usage-data/`. Those are your files on
  your machine; this tool just reads them and computes its own scores.
- The Execution-axis scoring and the progression timeline rely on the same
  local data files that Claude Code's built-in `/insights` command reads.
  This project does **not** reuse `/insights` output, replicate its UI, or
  call any Anthropic API. References to `/insights` in the dashboard describe
  the data source format only.
- "Claude", "Claude Code", and "/insights" are trademarks of Anthropic, used
  here only to identify the platform this tool complements — not to imply
  endorsement or partnership.

Acknowledgements:

- **Anthropic** for building Claude Code and exposing the local
  `~/.claude/usage-data/` telemetry that makes the Execution axis possible.
- **Boris Cherny** ([howborisusesclaudecode.com](https://howborisusesclaudecode.com))
  for the workflow-tip ranking that the rubric weights are derived from. Tip
  content is fetched at install time from a snapshot of the public site and
  cross-referenced via the dashboard's `/tips/N` route.

If you work at Anthropic and any of this attribution should be tightened
(or relaxed), please open an issue on this repo.

## License

MIT.
