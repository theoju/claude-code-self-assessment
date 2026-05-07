# self-assessment — gotchas

Failure modes, their causes, and their fixes. Read when scoring behaves unexpectedly.

## All dimensions show `→ flat` after a real change

Two conditions must **both** hold for a trend arrow to flip:

1. `|delta| ≥ noiseFloor` (default 5; per-dimension override in `app/data/rubric.json`).
2. The evidence/gap signal set actually changed.

This is intentional anti-noise — single-config-edit wobbles no longer masquerade as trends. Don't lower noise floors casually; make a more substantive change or wait for compounding effect.

## `assessment.config.json` missing

**Cause:** First run, no config copied yet.
**Fix:** Defer to `setup.md`'s first-run flow before invoking the scorer. Don't run `npm run assess` until the config is in place — it will fall back to defaults like `displayName: "Engineer"` and the user won't know why their Slack post is wrong.

## Slack post silently doesn't fire

**Cause:** `slack.enabled: true` in config, but `SLACK_WEBHOOK_URL` is unset (or set in shell env, not `.env.local`).
**Fix:** Check `.env.local`. If missing or empty, tell the user one line — "Set `SLACK_WEBHOOK_URL` in `.env.local` (see `.env.example`)" — and let the run continue without Slack. Do **not** invent or paste a webhook URL.

The webhook env var name comes from `slack.webhookEnvVar` in `assessment.config.json` (default `SLACK_WEBHOOK_URL`), and is read from `.env.local` only — never from `assessment.config.json` itself. Do not paste secrets into the JSON.

## `automation` didn't rise after adding hooks

In transcripts mode (`--include-transcripts` or `scoring.includeTranscripts: true`), configured-but-silent hooks lose most of their credit. Anti-gaming: "wire 4 empty hooks for +32 points" no longer works.

To get execution-grade credit: run `/insights` once in Claude Code to seed `~/.claude/usage-data/`, then re-run `/self-assessment`. Hook-fire counts are read from `~/.claude/usage-data/session-meta/*.json`.

## `integrations` didn't rise after installing plugins

Same anti-gaming gate: installed-but-never-invoked plugins are penalized in transcripts mode. Use the plugin once before re-scoring.

## Plugin-provided skills inflate the Automation score

**Cause:** `scoring.includePluginSkillsAsPersonal: true` counts marketplace-installed skills as personal craft. The scorer otherwise filters them out so the score reflects what the user has actually authored.
**Fix:** Leave it `false` unless the user explicitly wants plugin skills to count. The default is right for almost everyone.

## Behavioral mode reports zeros for transcript-derived signals

**Cause:** `scoring.includeTranscripts: false` (or no `--include-transcripts` flag), or no `~/.claude/projects/*.jsonl` exists yet.
**Fix:** Set the flag in config or pass `--include-transcripts` on the CLI. Confirm transcripts exist with `ls ~/.claude/projects/*/conversations*.jsonl 2>/dev/null | head`. Remember: transcript scanning is expensive — full history each run.

## Hook execution score capped despite many hooks configured

**Cause:** `~/.claude/usage-data/session-meta/` is empty or hasn't been seeded yet. The scorer reads hook-fire counts from the session-meta JSON files written by Claude Code's `/insights` command. Without that data it falls back to "trust the config" credit (`hookFireCount: null`).
**Fix:** Run `/insights` once in Claude Code to seed `~/.claude/usage-data/`, then re-run `/self-assessment`. If `/insights` has been run and counts are still zero, that's expected for brand-new setups — note it in the report rather than chasing a fix.

## `--include-transcripts` feels slow

It streams every JSONL in `~/.claude/projects/`. Stays under a few seconds for hundreds of sessions. If it's longer, lower `--insights-lookback` to narrow the window or prune old session files rather than disabling the flag — you'd lose the behavioral signal for nothing.

## CLAUDE.md report leaks paths

It shouldn't — the Slack/summary path is aggregate-only by design. If you ever see project names, paths, or per-file issues in the output, that's a bug in `scripts/score.mjs`. Fix it there rather than redacting downstream.

## `displayName` shows up wrong in Slack

**Cause:** Slack post pulls from `assessment.config.json#user.displayName`. The example file ships with `"Engineer"` — easy to miss when copying the example.
**Fix:** Edit `assessment.config.json` (not `assessment.config.example.json`) and re-run. The dashboard reads the same key, so both update in one place.

## `--insights-lookback 0` and `--progression-lookback 0` mean "zero days," not "disable"

**Cause:** Both flags accept an integer. Passing `0` silently produces an empty window and zero counts.
**Fix:** To disable the progression timeline, use `--progression-lookback none` (or `progressionLookbackDays: null` in config). `--insights-lookback` doesn't have a "disable" form — pick a window like `30` or larger.

## Boris tip links 404 upstream

`howborisusesclaudecode.com` has no per-tip URLs (verified by crawl Apr 2026 — no hash routing, no query handling, no per-tip endpoints). The dashboard renders tip content from a local snapshot in `app/data/boris-tips-content.json` and offers a manual-navigate hint to the right volume/tab.

When Boris ships a new "Part":

1. Refresh the boris skill: `https://howborisusesclaudecode.com/api/install`.
2. Extend `app/data/boris-tip-index.json` with new section→{volume,tab,label} entries.
3. Run `npm run snapshot:boris-tips` to regenerate `app/data/boris-tips-content.json`.

## Dashboard shows stale data

The page is statically rendered against the last `assessment.json`. Re-run `npm run assess` and reload.
