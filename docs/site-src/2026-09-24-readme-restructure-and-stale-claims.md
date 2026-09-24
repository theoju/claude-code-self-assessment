---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/261
synthesized_into: []
doc_kind: decision
---

# Decision: restructure the README into a landing page and correct its stale claims

## Context

`README.md` is the first thing a GitHub visitor sees, and by the time
of PR #261 it had drifted from the repo it described. The scorer
count, the probe count, and a launchd claim were all wrong, and the
section order buried the "how do I actually run this" content below
narrative. Separately, the repo's two archify diagrams
(`docs/site-src/diagrams/self-assessment.architecture.html` and
`docs/site-src/diagrams/scoring.dataflow.html`) had no representation
on GitHub at all — GitHub's markdown renderer can't execute the
interactive HTML archify produces, so the diagrams catalog was
invisible to anyone who hadn't already found their way to the
published docs site.

## Decision

Rewrite `README.md` as a landing page with a fixed section order —
what it measures, quick start, daily use, optional setup, how it
works, project layout, what's committed vs. what's yours, FAQ,
attribution, license — and fix every claim in it against the current
code rather than against memory of an earlier version.

### Section order as a landing page, not a narrative

The new order front-loads the two-axis scoring model and a five-line
quick start (`git clone` → `npm install` → `npm run setup` → `npm run
assess:print` → `npm run dev`) before any of the optional-setup detail
(Slack notifier, the daily launchd job, rubric tuning). Everything
past "That's the whole loop" is explicitly marked optional.

### Corrected claims

Four numbers and one behavioral claim were wrong and are now sourced
from the code that produces them:

- **All twelve dimensions have an Execution scorer.** The README now
  states this plainly in the scoring-pipeline walkthrough, rather than
  describing Execution scoring as partial.
- **The probe catalog has 50 entries.** `app/data/probe-catalog.json`
  is cited directly as the source of that count.
- **Per-axis scoring, not a collapsed overall.** The two-axis table
  (Platform Setup vs. Execution) is now the first thing under "What it
  measures," matching the CLAUDE.md rule that the two axes are never
  collapsed on any rendering surface.
- **A real, working clone URL** —
  `git clone https://github.com/theoju/claude-code-self-assessment.git`
  — replaces whatever placeholder or stale remote the quick start
  previously carried.
- **The 87-vs-75 tip-count distinction is now spelled out inline**:
  "Boris's upstream corpus has 87 tips; this repo tracks a canonical
  set of 75," with the status breakdown (53 predicate-backed, 12
  shared scorer signals, 3 behavioral coaching, 7 not yet tracked)
  immediately after. This mirrors the "how many Boris tips" convention
  already recorded in `CLAUDE.md` — three different correct numbers
  answering three different questions, and a README that states only
  one of them without qualification is how that confusion starts.

### The launchd wake claim

Both `README.md` and `ROUTINE.md` now describe the daily 07:15 job the
same way: "If the Mac is asleep at 07:15, the run fires when it next
wakes." `scripts/launchd/install.sh` prints the matching line at
install time — "Next run: 07:15 daily (if the Mac is asleep, it runs
on next wake)." The correction is about direction of causation: a
`StartCalendarInterval` LaunchAgent runs on the next wake after its
scheduled time, it does not itself wake a sleeping Mac. Stating it the
other way around would set an expectation `launchd` can't meet.

### Diagrams get a GitHub-renderable preview

`scripts/diagram-previews.mjs` is new. For every
`docs/site-src/diagrams/*.html` archify build, it lifts the
server-rendered inline `<svg>` out of the page, inlines the page's
`<style>` blocks (stripped of comments and `@font-face` rules, since
GitHub's image proxy renders the SVG in isolation and font embedding
is most of the byte weight), and writes a light and a dark variant —
`<name>.preview.light.svg` and `<name>.preview.dark.svg` — beside the
source HTML. `README.md` embeds both diagrams as `<picture>` elements
(dark `<source>`, light `<img>` fallback), each wrapped in a link to
the diagram's live page on the published docs site, so a GitHub
visitor sees the static picture but still lands on the interactive
version — pan, zoom, search, guided views — one click away.

Regenerating a diagram's HTML without regenerating its previews is
now a caught drift bug, not a style nit:
`scripts/__tests__/diagram-previews.test.mjs` reads every committed
`.html` back through the same `toPreviewSvg()` function and asserts
byte-equality against the committed `.preview.{light,dark}.svg` pair,
so `npx vitest run` fails if the two fall out of sync. The regenerate
step (`node ~/.claude/skills/archify/bin/archify.mjs deliver
architecture ... && node scripts/diagram-previews.mjs`) is documented
in `docs/site-src/diagrams/index.md`'s "Regenerate or add one"
section.

### License text shortened to a link

The README previously reproduced the full MIT license text inline.
It now links to `[MIT](./LICENSE)` and keeps only the two carve-outs
that aren't covered by the MIT grant — trademarks ("Claude", "Claude
Code", `/insights`) and the third-party Boris-tip content snapshotted
into `app/data/boris-tips-content.json` — as short prose rather than
reproducing the license body a second time.

## Consequences

- The README's numeric claims (scorer coverage, probe count, tip
  count) now trace to the same files that produce the dashboard's own
  numbers, so a future scorer or probe change that doesn't also touch
  the README will read as visibly stale rather than silently wrong.
- Anyone landing on the GitHub repo page now sees both architecture
  diagrams without leaving GitHub, with a direct path to the
  interactive versions on the docs site.
- Diagram regeneration is now a two-command step
  (`archify deliver` then `node scripts/diagram-previews.mjs`), and
  skipping the second command is caught by CI rather than discovered
  by a visitor seeing a stale picture.
- The launchd wake-behavior claim is now consistent across all three
  places it's stated: `README.md`, `ROUTINE.md`, and the installer's
  own printed output.

## References

- `README.md` — the restructured landing page.
- `ROUTINE.md` — the daily-routine doc, corrected alongside the README.
- `scripts/launchd/install.sh` — installer, corrected print statement.
- `scripts/diagram-previews.mjs` — the new SVG preview generator.
- `scripts/__tests__/diagram-previews.test.mjs` — the drift-detection
  test pinning previews to their source HTML.
- `docs/site-src/diagrams/index.md` — diagram catalog, documents the
  regenerate-and-refresh-previews workflow.
