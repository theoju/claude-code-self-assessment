# Morning assessment routine

Runs `/self-assessment` at **07:15 every day**, posts the summary to Slack, and links back to the local dashboard.

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
launchctl start com.theo.claude-mastery   # fire it now, for testing
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

## Sharing

`scripts/launchd/install.sh` derives the LaunchAgent label from `whoami`, reads the webhook from the teammate's `.env.local`, and baked-in paths come from `$(pwd)` at install time. A teammate clones → copies the two `.example` files → runs the installer → they have their own routine against their own `~/.claude/` and their own Slack channel. Zero edits required.
