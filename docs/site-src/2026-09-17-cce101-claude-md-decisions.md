---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/243
synthesized_into: []
doc_kind: decision
---

# CCE-101 CLAUDE.md follow-up: decisions taken 2026-09-16

engineering-docs-agent's CLAUDE.md carries a stale auto-merge eligibility
claim, tracked as CCE-101. The defect and its fix are written up in full at
`docs/superpowers/2026-09-13-cce101-eligibility-claim-followup.md`; this page
records the four decisions taken against that write-up on 2026-09-16. All four
recommendations were accepted. None of them had been applied as of the
decision date — the diagnosing session was write-fenced to
engineering-docs-agent (see the repo-fence lesson in this repo's CLAUDE.md),
so the note captures ready-to-apply text rather than a landed change.

## The claim being corrected

The auto-merge bullet in question reads, in its stale form:

```
Eligible = non-partial AND zero fact-checker warnings AND no human commits on the PR;
```

Both conjuncts are wrong, and have been since CCE-140: eligibility narrowed to
"partial and not cursor-backed" rather than plain non-partial (so a
cursor-backed partial run can merge), and fact-checker warnings were made an
explicit non-input by CCE-140 Decision 4 — they ride the PR body, digest, and
notification, never the eligibility check itself. The bullet was never
updated when the gate changed, twice.

## Q1 — fix the eligibility claim by removing the duplication

**Decision: delete the duplication, don't re-sync it.**

Rejected alternative: correct the sentence in place. It has already drifted
twice — CCE-140 rewrote the gate and CCE-144 added the `blind` check, and
neither update touched the bullet. Re-syncing a hand-written duplicate a third
time only buys one more drift cycle.

Also rejected: adding a test asserting the documented gate order matches the
code. That builds a verifier to keep a duplicate honest, when removing the
duplicate removes the need for the verifier.

The accepted replacement names the gate chain in order and then points at the
function that implements it rather than restating the mechanism:

```
Eligibility is a gate chain, evaluated in `_maybe_auto_merge` in this order: `policy != auto` → `merge_veto_reason` → `blind` (CCE-144) → `partial and not advance_cursor_backed` (CCE-140) → human-edit guard → checks poll — read the chain there rather than restating it here. Two corrections to the original wording, both wrong since CCE-140: plain **non-partial is not the test** (a cursor-backed partial run may merge), and **fact-checker warnings are NOT an eligibility input** (CCE-140 Decision 4) — they ride the PR body, digest, and notification only, and `fact_warnings` survives in the signature purely so callers' kwargs need no change;
```

The anchor for this replacement was verified unique on 2026-09-13 and needs
re-verification before applying, since the file has moved since.

## Q2 — file the voice-sample truncation defect separately

**Decision: file a new ticket rather than fold it into this change.**

The finding that surfaced while investigating this note — the voice-sample
loader truncates input at 20,000 characters while engineering-docs-agent's
CLAUDE.md measured 41,475 at the time, so the newest 52% of the file never
reaches the page-authoring step — is a loader defect, not a claim-accuracy
defect. It's
tracked as its own ticket, CCE-176, so the loader fix and the eligibility-text
fix can land independently. Q4 below explains why the reordering decision
doesn't wait on CCE-176 landing.

## Q3 — add a meta-bullet convention: invariant and why, not mechanism

**Decision: adopt a house rule for how CLAUDE.md bullets should be written**,
motivated directly by this defect. The bullets that stayed true across
refactors state *why* something holds; the ones that rotted transcribed *how*
it currently works. The accepted bullet text:

```
- **State the invariant and why it holds; point at code for the mechanism.**
  A bullet that transcribes a mechanism has a shelf life — "Eligible =
  non-partial AND zero fact-checker warnings" was true when written and wrong
  two tickets later, because nothing ties a CLAUDE.md behavioral claim to the
  code it describes. A bullet that states the invariant and its reason survives
  refactoring: "a blind run cannot auto-merge, because a cursor-backed advance
  proves what the run SAW and a blind run did not see" stays true across any
  reordering of the gate chain. When the mechanism genuinely must be findable,
  name the function and stop — the reader can run `grep`, and the function
  cannot drift from itself. Reference: CCE-101 eligibility claim, stale from
  CCE-140 (2026-06) until 2026-09.
```

## Q4 — adopt an ordering convention now, independent of CCE-176

**Decision: adopt immediately**, rather than waiting for the CCE-176 loader
fix. The convention: **most load-bearing invariants first; provenance,
incident narratives, and trap lists after.** If a loader cap truncates a
CLAUDE.md file, it should cut history, not rules — and CLAUDE.md is
append-only by convention, so every new lesson currently lands exactly where
a truncating reader can't see it. At the 2026-09-13 measurement (41,475 chars
against the 20,000-char cap), 22 bullets sat above the cut and 4 below it,
including the CCE-124, 139, 141, and 151 entries and the entire SDD
fidelity-gate section. The worst case was compounding: an agent reading only
the first 20,000 characters would hit the stale CCE-101 claim near the top of
the file and be structurally prevented from reaching the CCE-144 bullet that
contradicts it.

Fixing the loader (CCE-176) fixes today's 20,000-char cap; ordering the file
to degrade gracefully survives whatever the cap becomes next — which is why
this decision doesn't wait on that ticket. It composes with Q3: invariants
are short and belong at the top, and traps, incident timelines, run IDs, and
spec links are exactly what should fall below any future cut.

The reordering pass itself is a large diff with no behavioral change, and is
to be done as its own PR, never mixed with a content edit, so the diff stays
reviewable.

## Application order

The three text changes are **not** independent edits — apply them in this
order:

1. **Ordering pass first** (Q4) — it moves text, and the other two changes
   edit text that the reordering may relocate.
2. **Eligibility correction second** (Q1) — edits the (now possibly moved)
   auto-merge bullet.
3. **New meta-bullet third** (Q3) — a pure addition, safe to land last.

## Not decided

Whether the Q4 ordering convention warrants its own CCE ticket, separate from
CCE-176. It's recorded here regardless of that outcome: CCE-176 covers the
loader defect only, not the authoring convention.
