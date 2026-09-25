---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/266
synthesized_into: []
doc_kind: decision
---

# CCE-183: the payload/output bounds audit

This page indexes three documents that PR #266 committed into
`docs/superpowers/artifacts/` (plus a handoff prompt at
`docs/superpowers/cce-183-handoff-prompt.md`): the CCE-183 audit of unbounded
agent payload and output fields in the sibling `engineering-docs-agent`
pipeline — the plugin that builds this repo's docs site. They'd existed only
as untracked files in a working tree, which this repo's session-hygiene rule
treats as a loss risk (the 2026-08-26 incident is the reference case: a hook
and its test harness were permanently lost from an ephemeral location). These
three are the primary source for CCE-183 and the measurement CCE-177 shipped
on, so they're now git history instead of a working-tree artifact that could
vanish the same way.

This page is a pointer and a summary, not a restatement. Read the artifacts
directly for the full census and the verification trail.

## What the audit found

A subagent dispatch in the `engineering-docs-agent` orchestrator serializes
its whole input dict with a bare `json.dumps` into a single argv element
before spawning `claude -p`, and nothing in that pipeline measures the
resulting length before the spawn. The audit's headline measurement: on
`ubuntu-latest`, the binding ceiling on that single argv element is Linux's
`MAX_ARG_STRLEN` — 131,072 bytes — not the roughly 1 MB `ARG_MAX` that a
naive read of the platform limits would suggest. The synthesis artifact
pins the effective value at 131,071 bytes measured against a
`python:3.12-slim` container.

The audit's own framing is important: this is presented as the third time
the same defect has been paid for one field at a time, each fix landing
downstream of a choke point that still measures nothing. The proposed
response is accordingly architectural — bound serialized payload size once,
at the dispatch layer — rather than another per-field cap.

## Two independent overflow paths

The handoff prompt is explicit that a single byte-budget fix does not close
the incident that motivated the ticket, because two different failure modes
are in play:

- **Path A — the agent's own tool ingestion.** This is what caused the
  2026-09-23 production failure (run `35862057776`, exit 1, PR #282). The
  source-collector agent's *dispatch payload* is five scalars, on the order
  of 300 bytes — a payload-size budget at the dispatch choke point would
  have measured that and passed cleanly. The actual overflow came from
  130,203 characters of Jira issue descriptions and 92,635 characters of PR
  bodies that the agent pulled in itself, through its own granted tools
  (`Bash`, `Read`, `WebFetch`), well after dispatch. The binding constraint
  there was the model's own output-token limit, which nothing in the
  pipeline measures.
- **Path B — payload serialization at dispatch.** This is the
  `MAX_ARG_STRLEN` path described above. It did not fire in the incident
  that prompted the audit, but the audit's critique pass notes it is worse
  when it does: the dispatch helper catches only `FileNotFoundError`, so an
  oversized argv raises an uncaught `OSError` that escapes the run's own
  `try`/`finally` and the process's `sys.exit` wrapper as a bare traceback
  — no classified failure reason, no persisted state, strictly worse than
  the incident's outcome (which at least produced a schema-validation
  error).

An earlier single-fix draft addressed only Path B. A second, adversarial
pass — the critique document — caught that the fix as drafted wouldn't have
prevented the actual incident, which is why both paths are now tracked
together.

## Scope of the fix

Per the synthesis document's proposal, five items, in order:

1. Bound payload size once, at the dispatch layer that every call site
   funnels through — not per field — and widen the narrow exception
   handler so an oversized payload fails loud instead of crashing past the
   classification system.
2. Declare every payload field's disposition (fixed vs. elastic, with a
   trim order) at its call site rather than in a central policy registry —
   a registry shape was tried and rejected for a related classification
   effort because keys collided across call sites.
3. Add a coverage test, modeled on the existing AST-walk pattern used for
   call-site classification elsewhere in that pipeline, so a new dispatch
   site can't ship without a declared disposition.
4. Reclassify an over-budget payload as a degraded (not blind) failure,
   with a named reason, so a trimmed run stays out of watermark advancement
   instead of either silently succeeding or crashing untracked.
5. Log the measured payload size on every dispatch, so the next incident is
   diagnosed from a number instead of reconstructed from a schema error
   naming the wrong field — which is what happened this time: the actual
   failure surfaced as a missing required property, not a size error.

## Corrections applied before commit

Two corrections were made to the working-tree originals before they were
committed, both verified against source rather than re-asserted:

- A related ticket cited as already shipped is not — it's still in the
  backlog, and the cap it was believed to fix predates the ticket by four
  months. The cap **is** the defect that ticket describes, not a
  remediation for it.
- A function held up in the first draft as the pattern worth copying (the
  repo's one existing payload-size bound, on voice-sample text) turned out
  to have three of its own defects on inspection: no per-source floor, a
  loop-exit condition that only ever fires on a degenerate empty-file case
  rather than doing the budget-exhaustion job it looks like it does, and no
  signal in its output distinguishing a whole file from a truncated
  fragment. It remains the only working payload-size bound in that
  pipeline, but it's cited in the audit as a cautionary example rather than
  a template.

## Status

CCE-183 is open and fully specified; nothing from the fix list above has
been implemented yet. This repo's own docs pipeline is a live user of the
`engineering-docs-agent` orchestrator, so the same dispatch-choke-point gap
applies to every nightly run that builds this site — worth watching for
when diagnosing a future docs-agent run that fails with an unhelpful schema
error rather than a clear size complaint.
