---
status: draft
sources:
  - https://github.com/theoju/claude-code-self-assessment/pull/234
synthesized_into: []
doc_kind: decision
---

# Repo-fence postmortem — 2026-08-26

A `PreToolUse` hook was designed, built, installed, measured, and deleted
inside a single session. It was replaced by native `permissions.deny` rules.
Recorded here because the hook was wrong in a way that is easy to rebuild by
accident, and because the measurement that killed it is worth keeping.

This is a generalized write-up of an internal incident across a set of
sibling repositories. Machine-local paths from the original record have been
replaced with placeholders below; the shape of the failure and the fix is
unchanged.

## What ran

| Stage                      | Outcome                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| Parallel-session forensics | 3 session roots confirmed writing into one repo; 12 files from >1 root |
| Text-classifier hook built | 117 lines, 25-test harness, installed — "passed 25, failed 0"          |
| Thermo-nuclear review      | 3 defect classes: bypass, dead escape hatch, false positives           |
| Systematic debugging       | Bypass + false-positives = one root cause; escape hatch = a separate one |
| Prototype (measurement)    | **11 of 17 commands wrong** — 7 false negative, 4 false positive       |
| Approach re-ranking        | native `permissions.deny` and worktrees beat the hook on every axis    |
| Verification (T1/T2/T3)    | all three unknowns resolved YES                                        |
| Hook removed               | `PreToolUse` 7 → 6 entries; three files deleted                        |
| Native fence deployed      | one repo's local settings got 2 rules; another's tracked settings got 5 |

## The incident that prompted it

Over roughly two weeks, three different Claude session roots wrote into one
shared agent repository concurrently. Twelve files were written from more
than one root; one orchestrator module was written from all three. On one
occasion, a session rooted in one repo and a session rooted in another edited
the same files within the same UTC second, and one session was asked to
apply another session's uncommitted work.

No lost commits were found — the surrounding history verified clean. That is
weaker evidence than it looks: **uncommitted cross-session work leaves no
trace at all**, so a clean log cannot rule the damage out. That asymmetry is
why a preventive control was wanted rather than a detective one.

## The hook, and why it was wrong

The hook anchored on the session's `transcript_path` (which encodes the
project root fixed at session start — `cwd` drifts, and `CLAUDE_PROJECT_DIR`
is empirically **not set** in the hook environment). Given the session's home
repo, it then classified the _command text_:

```
BLOCK  iff  (VERB matches OR REDIR matches) AND command text contains the fenced path
```

Three defects were found. Root-cause analysis collapsed them into two causes.

**Bypass and false-positives are the same cause.** The hook classifies an
_unbounded language_ — every shell spelling that can write a file — by
surface text. That produces both error directions simultaneously and
irreducibly. False negatives are spellings the patterns do not recognise
(`git -C <path> commit`, a write through `python3 -c`, a script named by path
only). False positives are innocent text that resembles a spelling they do
(`->` inside a quoted string, a `cp` _out of_ the repo, the repo path
mentioned in a comment). **Tightening the pattern to kill a false positive
widens the false-negative set, and vice versa.** No pattern fixes both,
because the target of a shell command is not recoverable from its text
without parsing the shell.

**The escape hatch is a process-boundary defect.** The documented override
(an environment variable meant to disable the hook for one invocation) never
worked. The hook is spawned _before_ the command's shell exists, so setting
that variable ahead of the command sets it in a shell the hook cannot see. It
was documented in three places and tested in none.

## The evidence

The analysis script read the two classifier regexes **out of the shipped
hook itself**, so it could not drift from what actually ran, and replayed a
17-command labelled corpus through them using the real `grep -E` (POSIX ERE
is not Python's dialect).

| Result                                     | Count  |
| ------------------------------------------ | ------ |
| Commands                                   | 17     |
| **Wrong**                                  | **11** |
| False negative (should BLOCK, was ALLOWed) | 7      |
| False positive (should ALLOW, was BLOCKed) | 4      |

A ~35% accuracy rate on a corpus written by the hook's own author — the
favourable case, since it contains only the failure modes already imagined.

Two findings from that measurement are worth carrying forward:

- **The prototype disproved the author's own proposed fix.** A "block on any
  mention of the fenced path" strategy scored _worse_ (8 wrong, 7 false
  positives) than simply patching the patterns (5 wrong). The fix that felt
  obviously safer was measurably worse.
- **The hook was blind to the most likely future case.** It cannot see two
  sessions both opened _in_ the agent repo — which became the normal case as
  soon as users were advised to open sessions there.

### The hook blocked the command that installed its replacement

While writing the `permissions.deny` rule into one repo's own settings file,
the hook fired and blocked the write — because the command merely _contained_
the fenced repo's path as a JSON string value, next to a `>` redirect. A live
instance of the false-positive defect, produced by the hook against its own
replacement.

## What replaced it

Six approaches were re-scored against the actual incidents rather than
against command-classification accuracy:

| All 7 incidents | Observed-only | Approach                               |
| ---------------- | ------------- | -------------------------------------- |
| 93%              | 90%           | Worktree per session                   |
| 93%              | 90%           | Repo lock file                         |
| 71%              | **90%**       | **Native `permissions.deny`**          |
| 57%              | 50%           | Dirty-tree guard                       |
| 50%              | 70%           | Text-matching hook (the one installed) |
| 29%              | 10%           | git pre-commit / pre-push              |

Native deny won on the observed incidents and needs no custom code. Three
uncertainties blocked it; all three were tested empirically and resolved YES —
plus a fourth test, added after a later incident, that found a real limit:

| Test | Question                                                        | Result                                                                                                                                        |
| ---- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | Does a _project_ deny reach outside the project tree?             | Yes — an `Edit` on a path outside the project was denied from a session rooted elsewhere                                                       |
| T2   | Does `permissions.deny` beat an existing `allow`?                 | Yes — a broad `Bash` allow rule was in place, the fenced command was still blocked. `permissions.*` is re-read mid-session, no restart needed — **but this does NOT generalise to every settings layer; see T4** |
| T3   | Does an `Edit(...)` deny also stop `Write`?                       | Yes — same denial                                                                                                                                |
| T4   | Does T2's "no restart" hold for filesystem-sandbox deny rules?    | **No.** A macOS filesystem-sandbox profile is compiled at process launch and never re-read; removing an entry from it changed nothing until the terminal application was fully quit |

**Why this works where the hook could not:** deny rules are evaluated against
the tool call's **resolved `file_path`**, after the harness has normalised
it. The path could be relative, symlinked, or `../`-traversed and still
resolve into the fenced prefix. A decidable question replaced an undecidable
one.

### Deployed state

| Root                                | Rules                                                       |
| ------------------------------------ | ------------------------------------------------------------ |
| One repo's local settings           | `Edit`, `Write`                                               |
| A second repo's tracked settings     | `Edit`, `Write`, `NotebookEdit` (+ 2 pre-existing unrelated rules) |
| Coverage on the second repo's worktrees | 15 of 17                                                  |

The load-bearing choice on the second repo was placing the fence in the
**tracked** settings file rather than a local one: a tracked file
materialises in every worktree checkout on `git pull`/rebase, whereas a local
settings file fences exactly one project root. That repo runs 17 worktrees.

`NotebookEdit` was added in a follow-up pass and is a genuine improvement —
it is a third file-writing tool and the original two-rule pair missed it.

### Two residuals, accepted

1. **Bash writes are outside the fence.** `Bash` deny rules match command
   strings, not resolved paths, so `echo x > <fenced path>` is not blocked.
   Only `Edit`, `Write`, and `NotebookEdit` are covered. Accepted because the
   observed incidents went through file tools.
2. **Worktrees on branches predating the fence commit are uncovered.** A glob
   rule matches one prefix, and a tracked settings file only reaches a
   worktree once its branch contains the commit that added the rule. A couple
   of worktrees were in this state at deploy time; they inherit the rule on
   rebase.

## The doubled-slash requirement

The rule must be written with a **doubled** leading slash inside the tool
pattern:

```json
"deny": ["Edit(//absolute/path/to/fenced-repo/**)"]
```

The doubled form is verified working (T1–T3 above, plus live write attempts
from two different repos).

The likely explanation for the single-slash failure mode — `Edit(/path/...)`
being parsed as a gitignore-style pattern rooted at the settings file's own
directory, and therefore fencing nothing — was not independently verified in
this incident and should be treated as the probable cause, not an established
fact.

What _is_ established regardless: a mis-scoped rule still parses as valid
JSON and still passes lint. **Only a live write attempt distinguishes a
working fence from an inert one.** Never ship one of these rules without
that check.

## Reusable lessons

1. **Classify the decidable thing.** A control that must decide "does this
   mutate X?" should read a resolved path, not command text. If the only
   available input is text in an unbounded language, both error directions
   are irreducible and the control is not worth building.
2. **A passing test suite measures the cases you imagined.** 25/25 green,
   then 65% wrong on a 17-command corpus written by the same author. The
   corpus found what the suite could not because it enumerated _spellings_
   rather than confirming behaviour.
3. **Measure the fix you believe in before shipping it.** The author's
   preferred remedy scored worse than doing nothing clever.
4. **Prefer the platform's control to a custom one**, even when the custom
   one is already written. The native rule is shorter, faster, evaluated
   earlier, and cannot drift.
5. **Test an escape hatch or delete it.** The documented override was written
   three times and worked zero times.
6. **Capture throwaway analysis the day you produce it.** Ephemeral
   scratchpads do not survive two weeks — the underlying corpus and analysis
   script for this postmortem's headline number were partially lost before
   they were committed anywhere durable.
7. **Two config layers can have opposite reload semantics — don't assume one
   covers the other.** `permissions.*` rules are re-read mid-session with no
   restart (T2 above). A filesystem-sandbox deny layer, by contrast, is
   compiled into a fixed profile at process launch, inherited by every child
   process, and can only be tightened — never loosened — for the life of that
   process tree; editing it does nothing until the host application is fully
   quit, and restarting the agent from inside the same sandboxed tree
   re-inherits the old profile (T4 above). Two sessions were burned
   re-removing a sandbox deny entry that was already gone, because the
   mid-session-reload behavior of the first layer was assumed to hold for the
   second. The diagnostic tell: a blocked write from the first layer surfaces
   as `EACCES`; a blocked syscall from the sandbox layer surfaces as `EPERM`,
   often alongside unrelated commands (e.g. process inspection or signalling)
   also failing with "operation not permitted." A settings rule blocks one
   tool call; a sandbox profile blocks syscalls underneath every tool.

## Takeaway

When a control needs to answer "does this action touch a protected path?",
prefer a mechanism that evaluates the action's already-resolved target over
one that pattern-matches the action's surface text — and when a fix depends
on a platform layer reloading its config, verify that specific layer's reload
behavior rather than assuming it matches a sibling layer's.
