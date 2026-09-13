---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/233
synthesized_into: []
doc_kind: decision
---

# Handoff prompt: checkout-path clarification

`docs/superpowers/cce-170-173-handoff-prompt.md` is a cross-repo handoff
prompt — it's meant to be pasted into a session rooted in
`engineering-docs-agent`, not read from this repo. Three of its evidence
citations are written as `claude-code-self-assessment/...` paths, because
that's this repo's real name. On the machine the prompt actually runs on,
though, this repo isn't checked out under that name — it's checked out at
`~/Projects/claude-extensions`. Follow the citations literally from the
handoff session and you get `ENOENT`: `~/Projects/claude-code-self-assessment`
doesn't exist there.

PR #233 fixes that, but not by renaming the citations. A rename was tried
first and reverted. The repo's name — `claude-code-self-assessment` — is the
durable identifier; the local directory name is a per-machine accident. Making
the citations match the checkout would have split the document across two
names for one repo, which is worse than the original problem: it trades a
followable-but-wrong path for an unfollowable-but-right one, on a document
that already can't be edited from the session that needs it (the same
cross-repo write fence documented in this repo's `CLAUDE.md` blocks
`engineering-docs-agent`-rooted sessions from writing back here).

The fix landed as an additive clarifying paragraph in the handoff prompt
itself, immediately after the write-fence explanation: it states plainly that
every `claude-code-self-assessment/...` path in the prompt lives in this
repo, checked out locally at `~/Projects/claude-extensions` under a different
directory name, and that following the paths literally will return `ENOENT`
on the other name. The citations keep asserting the true repo identity; the
note supplies the missing local-checkout mapping so a session can actually
walk the evidence trail instead of guessing at it.

The underlying lesson generalizes past this one prompt: a handoff document
that crosses repo checkouts should never assume the reader's local directory
name matches the repo's canonical name. Citing the canonical name and adding
a checkout-location note is the more durable shape than trying to keep path
citations in sync with wherever a given machine happens to have cloned the
repo.
