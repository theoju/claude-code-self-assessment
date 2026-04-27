# `/self-assessment` — user guide

A deterministic scorer for how you actually use Claude Code, compared against
Boris Cherny's 87 workflow tips and a 12-dimension mastery rubric.

The score is reproducible: same machine state → same number. Trends only move
when both the score *and* the underlying signals change, so day-to-day noise
doesn't masquerade as progress.

---

## Invoking

From inside this repo (anywhere Claude Code can see `.claude/commands/`):

```
/self-assessment
```

That runs `npm run assess` with no extra args. To pass flags through:

```
/self-assessment --include-transcripts
/self-assessment --claude-md-target /Users/you/Projects/your-repo/
/self-assessment --no-slack
```

Or run it directly from the shell:

```bash
npm run assess
npm run assess -- --include-transcripts
npm run assess -- --claude-md-target /Users/you/Projects/your-repo/
npm run assess:print            # alias: --print
```

### Flags

| Flag | Effect |
|---|---|
| `--include-transcripts` | Opt in to behavioral signals (see below). Off by default for privacy. |
| `--claude-md-target <name=path>` or `<path>` | Audit one or more CLAUDE.md targets. Repeatable. Path can use `~`. |
| `--no-slack` | Skip the Slack post even if `slack.enabled: true`. |
| `--no-write` | Don't write `assessment.json` / append to history. Useful for dry runs. |
| `--print` | Print the human-readable summary even when running in CI. |

---

## What it reads

**Always (config audit, default mode):**
- `~/.claude/settings.json` — `effortLevel`, `skipDangerousModePermissionPrompt`, `permissions.allow/deny`, `hooks`, `enabledPlugins`, `env`
- `~/.claude/agents/*.md` — personal agents (substantive only)
- `~/.claude/commands/*.md` — personal slash commands (substantive only)
- `~/.claude/skills/*` — personal skills (must contain a substantive markdown file)
- `~/.claude/plans/*` — saved plans (substantive only — empty stubs ignored)
- `~/.claude/projects/*/memory/*` — auto-memory MEMORY.md files
- `~/.claude/routines/*` — cloud routine configs
- `~/.claude/statusline.sh`, `~/.claude/keybindings.json`, `~/.claude/chrome-extension`
- This project's `.claude/settings.local.json` and CLAUDE.md
- The configured CLAUDE.md targets in `assessment.config.json#claudeMd.targets`

**Only with `--include-transcripts` (behavior audit, opt-in):**
- `~/.claude/projects/*/*.jsonl` — your conversation transcripts, last 30 days
- `~/.claude/hook-fires.jsonl` — hook fire journal (if installed)

Aggregate counters only ever land in `assessment.json` and the Slack post —
never raw prompts or turns.

---

## What it writes

| File | Contents | Committed? |
|---|---|---|
| `app/data/assessment.json` | Current score snapshot | Yes (but gitignored in practice — overwritten each run) |
| `app/data/assessment-history.json` | Append-only trend series (last 90 entries) | **Gitignored** |
| Slack channel (if configured) | Summary message with score, deltas, top actions | n/a |

---

## How scoring works

1. **`scripts/signals.mjs`** reads the local Claude Code state above.
2. **`scripts/transcript-signals.mjs`** (opt-in) parses 30 days of transcripts.
3. **`scripts/score.mjs`** runs one deterministic scorer per dimension. Each
   returns `{ score, evidence[], gaps[] }`. Open the file — every number is
   traceable to a signal.
4. The overall score is a weight-normalized mean across the 12 dimensions.
5. **Trends** require both `|delta| ≥ noiseFloor` (default 5, override per
   dimension in `rubric.json`) AND a change in the evidence/gaps set. A
   single config edit no longer registers as a trend by itself.

Tiers (per dimension): `not-touched < 30 ≤ starter < 55 ≤ developing < 70 ≤ solid < 85 ≤ advanced`.

---

## Reading the output

```
Claude Code Mastery — Theo
Overall 68 / 89

   33 / 90  →  Automation — Hooks, Commands, Agents
   91 / 95  ↗  Verification — The #1 Tip
   35 / 85  ↘  Permissions & Safety
   …
```

- `score / target` per dimension.
- `↗` improving, `↘` slipping, `→` flat, `✦` new (no prior history).
- Top of file is current overall, weighted by dimension importance.

For the full breakdown — formula, contributing signals, the highest-leverage
move that would push the score +10 — open the dashboard:

```bash
npm run dev               # http://localhost:3737
```

Each dimension card on the home page links to `/dimensions/<id>`.

---

## Behavioral signals (opt-in)

The default score is a **configuration audit**: did you toggle the right
knobs? Useful, but you can max it out without ever using Claude Code well.

`--include-transcripts` upgrades it to a **mastery audit** by reading
`~/.claude/projects/*/*.jsonl` and deriving 30-day aggregates:

| Signal | Feeds into |
|---|---|
| Subagent dispatch frequency | `parallel` |
| Plan-mode utilization on multi-file (≥3 file edits) sessions | `planning` |
| Verify-before-ship rate (Bash invocations of `npm test`/`vitest`/`playwright`/etc. before `git commit`/`git push`/`gh pr create`) | `verification` |
| Auto-mode adoption (≥10-turn sessions in auto mode) | `permissions` |
| `bypassPermissions` usage | `permissions` (penalty) |
| Tool-use distribution + per-plugin invocation gating | `integrations` |
| Hook fires from `~/.claude/hook-fires.jsonl` | `automation` |

When transcripts are enabled:
- **Configured-but-silent hooks** lose most of their bonus (anti-gaming: "wire 4 empty hooks for +32 points" no longer works).
- **Installed-but-never-invoked plugins** are gated (anti-gaming: "spray 25 plugins for free score" no longer works).

### Privacy

- Only **aggregate counters** (counts, ratios) land in `assessment.json`.
- Raw prompts, tool inputs, and message text **never** leave the transcript
  parser.
- Off by default — set `scoring.includeTranscripts: true` in
  `assessment.config.json`, or pass `--include-transcripts` per run.

### Hook fire journal (optional)

`automation` scores higher when hooks actually fire (not just exist). To
enable hook-fire counting, install the journal hook:

```bash
node scripts/install-journal-hook.mjs
```

It writes `~/.claude/hooks/journal.sh` (executable) and prints a
`settings.json` snippet to merge into `~/.claude/settings.json`. After the
next session, `~/.claude/hook-fires.jsonl` will accumulate one JSONL line per
hook fire and feed back into your next assessment.

---

## CLAUDE.md health

If you pass `--claude-md-target <path>` (or list targets in
`assessment.config.json#claudeMd.targets`), each target's `CLAUDE.md` files
are scored on a 6-criterion 100-point rubric:

| Criterion | Max | What earns it |
|---|---|---|
| Commands/workflows | 20 | Fenced code blocks containing real tooling invocations |
| Architecture clarity | 20 | An `## Architecture`/`## Structure` heading with ≥80 chars of body |
| Non-obvious patterns | 15 | A `## Gotchas`/`## Notes` section with specific tool/file references (not generic prose) |
| Conciseness | 15 | Between 15 and 400 lines |
| Currency | 15 | mtime ≤ 30d (15) / ≤ 90d (10). Capped at 5 if stale version mentions like `Claude 3`/`Sonnet 3.5`/`claude.json` are present |
| Actionability | 15 | Bullet density × heading count + imperative-verb hits (`run`, `use`, `prefer`, `avoid`, …) |

Output is **report-only** (never edits CLAUDE.md) and only aggregate stats
appear in the Slack post — no project names, paths, or per-file issues.

---

## Configuration

`assessment.config.json` (copy from `.example`, **never commit secrets**):

```json
{
  "user": { "displayName": "Theo" },
  "slack": {
    "enabled": true,
    "channel": "#claude-code-mastery",
    "webhookEnvVar": "SLACK_WEBHOOK_URL"
  },
  "publish": { "publicUrl": "https://your-deployed-url.example" },
  "scoring": {
    "includePluginSkillsAsPersonal": false,
    "includeTranscripts": false
  },
  "claudeMd": {
    "enabled": true,
    "targets": [
      { "name": "main-repo", "path": "~/Projects/main-repo" }
    ]
  }
}
```

`.env.local`:

```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
```

The webhook secret is read from the env var named in
`slack.webhookEnvVar` (default `SLACK_WEBHOOK_URL`).

---

## Tuning the rubric

Targets, weights, Boris-tip references, noise floors, and next-action lists
live in `app/data/rubric.json`. Edit there to retune. The dashboard and Slack
post both read from this file at runtime — no rebuild needed.

To add a new dimension:
1. Add a `{ id, title, weight, target, rubricArea, borisTips, noiseFloor, nextActions }` entry.
2. Add a matching `SCORERS[id]` function in `scripts/score.mjs`.
3. Add an entry to `EXPLAINERS[id]` in `app/lib/dimension-explainer.ts` so the explainer page renders.

Tests in `scripts/__tests__/score.test.mjs` (unit) and
`scripts/__tests__/anti-gaming.test.mjs` (integration spot-check) will catch
most regressions.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Slack post skipped: SLACK_WEBHOOK_URL not set` | `.env.local` missing the webhook | Add `SLACK_WEBHOOK_URL=…` to `.env.local`. |
| All dimensions show `→ flat` even after a real change | Change was below noise floor (5 pts) or evidence didn't actually shift | Make a more substantive change, or temporarily lower the dimension's `noiseFloor` in `rubric.json`. |
| `automation` score didn't go up after adding hooks | Hooks fire 0 times in the journal (transcripts mode) | Install the journal hook and use Claude Code in a real session, then re-run. |
| Dashboard shows stale data | The page is statically rendered against the last `assessment.json` | Re-run `npm run assess` and reload the page. |
| `--include-transcripts` is slow on a large `~/.claude/projects/` | Streaming all transcripts | Cap by deleting old session JSONLs you don't need, or accept the wait — it stays under a few seconds for hundreds of sessions. |

---

## Daily routine

A macOS `launchd` plist runs `/self-assessment` at 07:15 every day and posts
the result to Slack. See `ROUTINE.md` for setup.

---

## See also

- `README.md` — project overview, quick start, signal sources
- `ROUTINE.md` — cloud / launchd scheduled run
- `.claude/commands/self-assessment.md` — the slash-command spec itself
- `scripts/score.mjs` — every scoring rule, transparent and editable
- `app/lib/dimension-explainer.ts` — formula descriptions rendered on `/dimensions/<id>`
