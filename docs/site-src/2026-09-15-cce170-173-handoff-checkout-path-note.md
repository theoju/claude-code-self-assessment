---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/233
synthesized_into: []
doc_kind: decision
---

# Checkout path note: CCE-170/173 handoff prompt

The CCE-170/171/172/173 handoff prompt at
`docs/superpowers/cce-170-173-handoff-prompt.md` cites evidence paths prefixed
`claude-code-self-assessment/...` throughout — the retrospective at
`docs/superpowers/retrospectives/2026-08-26-repo-fence-postmortem.md`, the
probe script at
`docs/superpowers/artifacts/2026-09-12-cce171-citation-probe.py`, and the
fence-hook evidence directory at
`docs/superpowers/retrospectives/artifacts/2026-08-26-repo-fence/`. All three
are real paths inside this repo. What's not guaranteed is where this repo is
*checked out* on the machine reading the prompt.

## The clarification

A session working the CCE-170/173 handoff hit ENOENT on all three cited paths
because it resolved them against

```
~/Projects/claude-code-self-assessment
```

— which doesn't exist on that machine. The repo is checked out at
`~/Projects/claude-extensions` instead. The prompt's own §"Where to read those
paths" section already says this explicitly: every `claude-code-self-assessment/...`
path in the prompt "lives in the repo the prompt was written from —
`theoju/claude-code-self-assessment`, checked out locally at
`~/Projects/claude-extensions` under a different directory name."

The mismatch is between two things that are allowed to diverge and, on this
machine, do:

- the repo's identity — its GitHub name, `theoju/claude-code-self-assessment`,
  which is what the handoff prompt uses as a path prefix because it's the
  durable identifier that survives a re-clone into any directory; and
- the repo's on-disk directory name — whatever the local checkout happens to
  be named, `claude-extensions` in this case.

Path prefixes in cross-session handoff prompts are written against the first
one. A session reading the prompt has to resolve them against the second.

## Why the fix is additive, not a rename

The PR that clarifies this (#233) adds a note to the handoff prompt rather
than rewriting the `claude-code-self-assessment/...` prefixes to
`claude-extensions/...`. Rewriting would fix this one machine's checkout name
and break on the next: the directory name is a local, mutable fact, while the
repo name is the identifier that stays correct across re-clones, forks, and
other machines. The handoff prompt is meant to be pasted into fresh sessions
on whatever host is doing the CCE-170/171/172/173 work next, so the citation
prefix has to stay pinned to the identity that's guaranteed to still mean
something — the repo name — with a note telling the reader how to resolve it
locally.

## Takeaway

If a handoff prompt (or any cross-session artifact) cites paths prefixed with
a repo name and following them literally returns ENOENT, check whether the
repo is checked out under a different directory name before concluding the
cited paths are wrong. `git remote -v` or the repo's own CLAUDE.md/README
identity strings are the fastest way to confirm which repo a differently-named
checkout actually is.
