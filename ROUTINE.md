# Daily routines

Two launchd jobs run back-to-back every morning:

| Time  | Routine     | Script                              | What it does                                                        | Posts to                                       |
|-------|-------------|-------------------------------------|---------------------------------------------------------------------|------------------------------------------------|
| 06:00 | Coverage    | `scripts/run-coverage.mjs`          | Vitest + V8 coverage, integration suite, benches, Playwright web vitals | Slack — links to `/coverage`               |
| 07:15 | Mastery     | `scripts/run-assessment.mjs`        | Re-scores 12 Boris dimensions on the **Platform Setup** + **Execution** axes from `~/.claude/` and `~/.claude/usage-data/` + audits CLAUDE.md targets (report-only) | Slack — links to `/`                           |

The 75-minute gap means the dashboard reflects fresh coverage by the time the Mastery summary arrives. Both routines reuse the same `SLACK_WEBHOOK_URL` from `.env.local`.

# Morning assessment routine

Runs `/self-assessment` at **07:15 every day**, posts the summary to Slack, and links back to the local dashboard.

## CLAUDE.md health (report-only)

The Mastery routine also audits any repos listed under `claudeMd.targets` in `assessment.config.json`. It scores each target's `CLAUDE.md` files against the `claude-md-improver` rubric (commands / architecture / patterns / conciseness / currency / actionability).

**Shareable surfaces (Slack, console print) show aggregates only** — total targets, files scanned, average score/grade, grade distribution. No project names, paths, or per-file issues. So screenshots can go in any channel without leaking which repos you track. Per-target detail (paths, issues, breakdown) lives in the local `app/data/assessment.json` and dashboard.

**It never edits CLAUDE.md** — for actual fixes, run `/claude-md-management:claude-md-improver` interactively against a specific repo.

You can also run it ad-hoc against a single path:

```bash
node scripts/run-assessment.mjs --print --no-slack --claude-md-target "work-monorepo=~/Projects/work-monorepo"
```

## Why not `/schedule`?

`/schedule` creates a cloud-hosted routine on Anthropic infrastructure. It can't read your local `~/.claude/` directory, which is exactly the data the scorer needs. So we use **macOS launchd** instead — it runs locally against real signals and can wake the laptop if it's asleep at 07:15.

The dashboard itself stays local (`http://localhost:3737`). The Slack message includes that link — it only resolves on your own machine, which is the right behavior for a private dashboard.

## Setup — 5 commands

```bash
# 1. Copy config templates
cp assessment.config.example.json assessment.config.json
cp .env.example .env.local

# 2. Edit .env.local and paste your Slack webhook URL
#    (Create one at https://api.slack.com/apps → Incoming Webhooks)

# 3. Edit assessment.config.json — set user.displayName and slack.channel

# 4. Verify it works end-to-end
node scripts/run-assessment.mjs --print

# 5. Install the 07:15 daily LaunchAgent
./scripts/launchd/install.sh
```

The installer:
- Reads `SLACK_WEBHOOK_URL` from `.env.local` and bakes it into the LaunchAgent.
- Creates `~/Library/LaunchAgents/com.<you>.claude-mastery.plist`.
- Loads it into `launchctl`.
- Tells you how to test, inspect logs, and uninstall.

## Verify

```bash
launchctl list | grep claude-mastery      # confirm it's loaded
launchctl start com.$(whoami).claude-mastery   # fire it now, for testing
tail .launchd.out.log .launchd.err.log    # see what happened
```

Fire once with `launchctl start` to confirm Slack receives the message before you rely on it.

## If you ever want to keep the dashboard online

If you change your mind and want the Slack link clickable from phones/other devices:

```bash
vercel deploy --prod
# Then: edit assessment.config.json → set publish.publicUrl to the Vercel URL
```

This is optional. Nothing about the local setup assumes it.

## Alternatives to launchd

- **`/loop 24h node scripts/run-assessment.mjs`** — runs from Claude Code itself, capped at 3 days per invocation, laptop must be awake. Fine for trying it out, not great for permanence.
- **`cron`** — works, but silently skips runs if the laptop is asleep. Use `launchd` on macOS.

## Uninstall

```bash
./scripts/launchd/install.sh uninstall
```

# Coverage routine (06:00 daily)

Runs `scripts/run-coverage.mjs` which:

1. Executes Vitest on the `unit` project with V8 coverage → writes `coverage/coverage-summary.json`
2. Executes Vitest on the `integration` project (real fs against tmp `~/.claude` trees)
3. Runs Vitest benchmarks (scorers, full pipeline, slack-msg) → `coverage/bench.json`
4. Runs Playwright e2e + web-vitals (LCP, CLS, INP) — boots the dev server automatically
5. Aggregates into `app/data/coverage.json` and appends to `app/data/coverage-history.json` (90-entry rolling)
6. Posts a Slack summary with status, coverage %, deltas vs prior run, and a link to `/coverage`

## Setup — 4 commands

```bash
# 1. Install Vitest + Playwright + testing-library
npm install

# 2. One-time browser download for Playwright
npx playwright install chromium

# 3. Verify locally without posting to Slack
npm run coverage:print

# 4. Install the 06:00 daily LaunchAgent
./scripts/launchd/install-coverage.sh
```

## Verify

```bash
launchctl list | grep claude-coverage         # confirm loaded
launchctl start com.$(whoami).claude-coverage # fire it now, for testing
tail .launchd-coverage.out.log .launchd-coverage.err.log
```

## Skip flags for fast local iteration

```bash
node scripts/run-coverage.mjs --no-e2e --no-bench --print --no-slack
```

## Uninstall

```bash
./scripts/launchd/install-coverage.sh uninstall
```

## Sharing

`scripts/launchd/install.sh` derives the LaunchAgent label from `whoami`, reads the webhook from the teammate's `.env.local`, and baked-in paths come from `$(pwd)` at install time. A teammate clones → copies the two `.example` files → runs the installer → they have their own routine against their own `~/.claude/` and their own Slack channel. Zero edits required.
