# Diagrams

Interactive architecture diagrams of this repo, generated with the
[archify](https://github.com/tt-a1i/archify) skill from the source files they
describe. Each one is a standalone HTML page — pan, zoom, search, light/dark
themes, and per-node links back to the exact file and line it was rendered
from. Every node's source reference is verified against the pinned commit at
render time, so a diagram cannot silently drift into describing code that
moved.

## Catalog

| Diagram                                                                 | What it shows                                                                                                                                                                                                             | Spec                                                                     | Rendered from                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [Self-Assessment skill architecture](self-assessment.architecture.html) | How `/self-assessment` runs: the skill and the 07:15 launchd job both enter `run-assessment.mjs`, which threads signals through `score.mjs` and `rank-next-actions.mjs` into `app/data/`, then optionally posts to Slack. | [`self-assessment.architecture.json`](self-assessment.architecture.json) | [`0a94b8a`](https://github.com/theoju/claude-code-self-assessment/commit/0a94b8a8bd0fddde6103bc4ec017d417ce03ffc5) |

Each diagram carries three guided views (chapters that focus a subset of the
nodes) and a set of summary cards stating the invariants the picture alone
can't — for example that `main()` calls each stage itself rather than the
modules calling each other.

## Regenerate or add one

The `.json` spec is the source of truth; the `.html` is a build artifact
committed beside it so the docs site can serve it. To re-render after the
code moves:

```bash
node ~/.claude/skills/archify/bin/archify.mjs deliver architecture \
  docs/site-src/diagrams/<name>.architecture.json \
  docs/site-src/diagrams/<name>.architecture.html \
  --quality showcase --repo-root .
```

`deliver` is the acceptance gate: it re-validates the spec, verifies every
`sources` path and line against `--repo-root`, and only then commits the HTML.
A non-zero exit leaves the previous artifact untouched. Update
`meta.repository.revision` to the commit you rendered against, and add a row
to the catalog above in the same change.

To add a diagram, write a new spec in this directory, deliver it here, and add
its row. Both files must live under `docs/site-src/` — `mkdocs build --strict`
rejects links to targets outside the docs directory.
