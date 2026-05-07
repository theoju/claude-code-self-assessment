# self-assessment — gotchas

Failure modes seen in the wild. Each entry: symptom → cause → fix.

### `assessment.config.json` missing

**Cause:** First run, no config copied yet.
**Fix:** Defer to `setup.md`'s first-run flow before invoking the scorer. Don't run `npm run assess` until the config is in place — it will fall back to defaults like `displayName: "Engineer"` and the user won't know why their Slack post is wrong.

### Slack post silently doesn't fire

**Cause:** `slack.enabled: true` in config, but `SLACK_WEBHOOK_URL` is unset (or set in shell env, not `.env.local`).
**Fix:** Check `.env.local`. If missing or empty, tell the user one line — "Set `SLACK_WEBHOOK_URL` in `.env.local` (see `.env.example`)" — and let the run continue without Slack. Do **not** invent or paste a webhook URL.

### Plugin-provided skills inflate the Automation score

**Cause:** `scoring.includePluginSkillsAsPersonal: true` counts marketplace-installed skills as personal craft. The scorer otherwise filters them out so the score reflects what the user has actually authored.
**Fix:** Leave it `false` unless the user explicitly wants plugin skills to count. The default is right for almost everyone.

### Behavioral mode reports zeros for transcript-derived signals

**Cause:** `scoring.includeTranscripts: false` (or no `--include-transcripts` flag), or no `~/.claude/projects/*.jsonl` exists yet.
**Fix:** Set the flag in config or pass `--include-transcripts` on the CLI. Confirm transcripts exist with `ls ~/.claude/projects/*/conversations*.jsonl 2>/dev/null | head`. Remember: transcript scanning is expensive — full history each run.

### Hook execution score capped despite many hooks configured

**Cause:** `~/.claude/hook-fires.jsonl` is absent. Claude Code does **not** emit this file by default — so unless the user has wired a `PostToolUse` (or similar) hook in `settings.json` that appends to it, every run reports `hookFireCount: null` and the scorer falls back to "trust the config" credit.
**Fix:** If the user wants execution-grade credit (not just configuration credit), they need a hook that writes to `~/.claude/hook-fires.jsonl`. Otherwise this is expected — note it in the report rather than chasing a fix.

### CLAUDE.md health summary leaks paths or names

**Cause:** The auditor returns per-target detail; it's tempting to paste it into the report verbatim.
**Fix:** Report **only** aggregate stats: total targets, files scanned, average score/grade, grade distribution. **No project names, no paths, no per-file issues.** This is a hard privacy boundary — the Slack post must be safe to share.

### `displayName` shows up wrong in Slack

**Cause:** Slack post pulls from `assessment.config.json#user.displayName`. The example file ships with `"Engineer"` — easy to miss when copying the example.
**Fix:** Edit `assessment.config.json` (not `assessment.config.example.json`) and re-run. The dashboard reads the same key, so both update in one place.

### `--insights-lookback 0` and `--progression-lookback 0` mean "zero days," not "disable"

**Cause:** Both flags accept an integer. Passing `0` silently produces an empty window and zero counts.
**Fix:** To disable the progression timeline, use `--progression-lookback none` (or `progressionLookbackDays: null` in config). `--insights-lookback` doesn't have a "disable" form — pick a window like `30` or larger.
