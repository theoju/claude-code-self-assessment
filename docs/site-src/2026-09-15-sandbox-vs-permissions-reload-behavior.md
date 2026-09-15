---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/234
synthesized_into: []
doc_kind: decision
---

# Sandbox vs. permissions: two reload semantics, one easy misdiagnosis

`~/.claude/settings.json` has two layers that look like one config surface
but behave nothing alike once a session is already running. Mixing them up
cost two engineering sessions on 2026-09-12 — a `sandbox.filesystem.denyWrite`
entry had already been removed, and removing it again (twice) looked like
the fix hadn't taken effect.

## The two layers

| Layer                       | When it's read                                                                 | Mid-session edits |
| ---------------------------- | -------------------------------------------------------------------------------- | ------------------ |
| `permissions.*`               | Re-evaluated live against every tool call                                       | **Take effect immediately** — no restart |
| `sandbox.filesystem.denyWrite` | Compiled into a macOS seatbelt profile once, at process launch, and inherited by every child process | **No effect until the terminal application is fully quit** |

The `permissions.*` finding comes from the repo-fence postmortem's T2 test:
a `deny` rule was confirmed to beat a conflicting `allow` with the settings
file re-read mid-session, no restart required. That result does **not**
generalize to `sandbox.filesystem.*`. A follow-up test (T4, added
2026-09-12 to the same postmortem) asked the same question of the sandbox
layer and got the opposite answer: editing `sandbox.filesystem.denyWrite`
does nothing to a live session. Restarting Claude Code from inside the same
sandboxed process tree doesn't clear it either — the seatbelt profile is
inherited by the child, not re-derived from the settings file. Only fully
quitting the terminal application forces a fresh profile compile.

## The diagnostic tell

If you can't tell which layer is blocking a write, don't guess from the
settings file — read the error:

- **`EPERM`** (plus unrelated commands like `ps` or `kill` failing with
  "operation not permitted") → the **sandbox** layer. A seatbelt profile is
  blocking syscalls, and the fix requires a full quit-and-relaunch, not
  another settings edit.
- **`EACCES`** → the **permissions** layer. A `settings.json` rule is
  blocking one tool call, and it's already live — re-editing the file will
  actually take effect on the next call.

## Why this matters

Treating the two layers as one — "settings changes are live, I checked" —
reads as confirmation that a sandbox fix landed when it hasn't. The
2026-09-12 incident: a `denyWrite` entry was removed, the removal was
correct and complete, but the running session kept behaving as though it
were still present. Two sessions were spent re-removing an entry that was
already gone, because the earlier "no restart needed" finding was read as
covering both layers instead of just `permissions.*`.

If you hit a blocked write and the settings file already looks correct,
check the error code before touching the config again. `EPERM` means stop
editing and go restart the terminal; `EACCES` means the edit hasn't
propagated yet or the rule itself is wrong.

## Source

Full detail — the T1–T4 verification table and the complete "reusable
lessons" list — lives in the repo-fence postmortem:
`docs/superpowers/retrospectives/2026-08-26-repo-fence-postmortem.md`
(T2/T4 rows, and reusable lesson 7, "Two config layers, opposite reload
semantics"). That document isn't published to this site — it's retained
as internal retrospective content — so this page carries the durable
lesson forward for anyone diagnosing a similar sandbox-vs-permissions
mismatch.
