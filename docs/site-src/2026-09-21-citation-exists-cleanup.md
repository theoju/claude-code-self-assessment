---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/255
synthesized_into: []
doc_kind: decision
---

# Citation-exists cleanup: site-wide sweep (PR #255)

`citation_exists` is a Tier-1 block in the docs-agent lint: a page carrying a
citation the checker can't resolve fails the first PR that touches it,
regardless of whether that PR is the one that introduced the bad citation.
PR #255 audited all 29 published pages, found 3 failing with 6 bad citations
between them, and brought the site to 0 failing. It's a follow-up to PR #254,
which cleared the same trap class across the rest of the site.

None of the 6 were typos. Each came from a recognizable pattern, and each
pattern is worth naming so the next contributor doesn't reintroduce it.

## The three failure patterns

**Stale intra-repo paths.** Two pages cited paths under `docs/` when the
target had actually moved to `docs/site-src/` at some point after the
citation was written. The docs tree restructured; the citing sentence didn't.
This is the plain case `citation_exists` exists to catch, and it's also the
easiest one to reintroduce — a doc that cites a sibling doc by path is
correct the day it's written and silently wrong the day the sibling moves.

**Illustrative paths treated as real citations.** One scoring-criteria row
described a GitHub Action workflow file using an example path, qualified "or
similar," to make the shape concrete:

```
.github/workflows/claude.yml
```

That's a reasonable thing to want to say, but a backticked path asserts the
artifact exists in this repo — no such file does, "or similar" or not. The
fix was to drop the path and describe the artifact in prose instead ("a
Claude GitHub Action workflow file"), not to add the path to a
citation-exemption list. An exemption would have kept a path-shaped token
that reads as a citation on a site where every other backticked path is one;
prose that doesn't look like a citation is the correct fix for a genuinely
illustrative example, not a bypass of the check.

**Path-shaped references to files in an undeclared private repo.** The
`/ship` skill's implementation — the hub `SKILL.md` plus its stage spokes
(pre-flight, test-detection, jira-update, and so on) — lives in the
maintainer's personal `~/.claude/skills/ship/`, not in this repo, and per
[`docs/site-src/ship-pattern.md`](https://theoju.github.io/claude-code-self-assessment/ship-pattern/)
it's deliberately never checked into a project repo. Three references to
those spoke files were written as path-shaped tokens, which `citation_exists`
correctly flagged as unresolvable. The fix rewrote them as plain spoke names
in prose — "a `pre-flight` spoke," not a backticked path — rather than citing
them under a repo prefix. That's the right call independent of the lint: the
spokes actually live in a private personal config repo that this site's
`external_repos` list has no entry for. Citing an undeclared prefix is
correctly treated as an ordinary (and here, non-existent) repo path and
blocked; declaring the prefix just to make the citation resolve would have
published the layout of a private repo that has no reason to be public.
Describing the spokes by name captures the same information for a reader
without asserting a path that either 404s or leaks.

## Why this is a recognizable trap class, not three unrelated bugs

All three share a root cause: a backticked path is a promise — "this exists,
here" — and each of these was written when something *near* that promise was
true (the doc used to live there; a file like this exists somewhere; the
private repo really does have a spoke by that name) rather than when the
promise itself was true. `citation_exists` can't distinguish "this drifted"
from "this was never meant literally" from "this exists but not here" — it
can only tell you the literal promise doesn't hold. Reading the failure as
"which of the three did I mean" is the fix in all three cases: restore the
path if the target moved, drop to prose if the path was never real, or name
the thing without a path if it's real but off-limits to cite.

## Related, deliberately out of scope here

The PR body also flagged a related but separate failure mode — a page-author
agent emitting citations that assume a plugin-repo layout while documenting
plugin work on a non-plugin host — as needing its own ticket. That's a
generation-time problem (what an authoring agent assumes about repo shape),
distinct from the drift-and-illustration problems this sweep cleaned up, and
isn't covered here.
