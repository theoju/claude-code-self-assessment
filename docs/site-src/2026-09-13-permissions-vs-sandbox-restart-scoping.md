---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/234
synthesized_into: []
doc_kind: decision
---

# `permissions.*` vs `sandbox.filesystem.*`: two config layers, opposite reload semantics

A finding from the repo-fence work
(`docs/superpowers/retrospectives/2026-08-26-repo-fence-postmortem.md`) needed
a correction, and the correction is worth its own page: two settings layers
that both live under `~/.claude/settings.json`-style config reload on
opposite schedules, and conflating them costs real sessions.

## The original claim was too broad

The postmortem's T2 test asked "does a `deny` rule beat an existing `allow`,
without restarting?" and confirmed **yes** — a `permissions.deny` entry took
effect mid-session, no restart required. That result is correct, but it was
initially read as a general statement about Claude Code config reload. It
isn't. It's scoped to `permissions.*` rules specifically.

## The correction: `sandbox.filesystem.*` is a different layer

A follow-up test (T4, added 2026-09-12) asked whether T2's "no restart"
finding generalizes to `sandbox.filesystem.denyWrite`. It does not:

- `permissions.*` rules are **re-read mid-session**. Edit the settings file,
  and the next tool call sees the change.
- `sandbox.filesystem.*` rules are **compiled into a macOS seatbelt profile
  at process launch**. The kernel holds that profile for the life of the
  process, every child process inherits it, and nothing short of fully
  quitting the sandboxed terminal application reloads it. Restarting Claude
  Code *inside the same sandboxed process tree* just re-inherits the stale
  profile — it doesn't help.

The postmortem's reusable-lessons list now carries this as lesson 7: two
config layers, opposite reload semantics. `permissions.*` is live-reloaded;
`sandbox.filesystem.*` is fixed for the process's lifetime and can only be
tightened, never loosened, until the terminal quits.

## Cost of the unscoped version

Two sessions on 2026-09-12 were spent re-removing a `sandbox.filesystem.denyWrite`
entry that had *already* been removed from `settings.json`. The config was
correct the whole time — the stale seatbelt profile from an earlier process
launch was masking that, and because T2 had been read as covering both
layers, the obvious next step ("check the file again") kept confirming the
config was fine without explaining why the write kept failing.

## The diagnostic tell

Before assuming a `permissions.deny` edit didn't take effect, check which
layer is actually blocking:

| Symptom | Layer | Fix |
| --- | --- | --- |
| `EACCES` | `permissions.*` | Edit `settings.json`; takes effect on the next tool call, no restart |
| `EPERM`, especially alongside unrelated commands (`ps`, `kill`) also failing with "operation not permitted" | `sandbox.filesystem.*` | Fully quit the sandboxed terminal application, not just Claude Code |

If unrelated commands outside your edit's scope are also failing with
"operation not permitted," that's the sandbox signature, not a settings
problem — a `permissions` rule only ever blocks the tool it names.

## Takeaway

When a config layer's reload behavior is verified empirically (as T2 did),
scope the finding to the specific config key tested, not to "config" in
general. `~/.claude/settings.json` multiplexes at least two independently
enforced layers with different lifecycles, and a result proven for one does
not transfer to the other without its own test.
