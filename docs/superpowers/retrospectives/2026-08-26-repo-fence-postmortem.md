# Repo-fence postmortem — 2026-08-26

A `PreToolUse` hook was designed, built, installed, measured, and deleted inside
a single session. It was replaced by native `permissions.deny` rules. Recorded
here because the hook was wrong in a way that is easy to rebuild by accident,
and because the measurement that killed it is worth keeping.

Not published to the docs site — `mkdocs` builds from `docs/site-src/` only
(`mkdocs.yml:4`), and this contains machine-local paths.

Primary sources: `artifacts/2026-08-26-repo-fence/`
(`corpus.tsv`, `analyze.py`, `repo-fence-patterns.txt`).

---

## What ran

| Stage                      | Outcome                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| Parallel-session forensics | 3 session roots confirmed writing into one repo; 12 files from >1 root |
| `repo-fence.sh` built      | 117 lines, 25-test harness, installed — "passed 25, failed 0"          |
| Thermo-nuclear review      | 3 defect classes: A1 bypass, A2 dead escape hatch, A3 false positives  |
| Systematic debugging       | A1 + A3 = one root cause; A2 = a separate one                          |
| Prototype (measurement)    | **11 of 17 commands wrong** — 7 false negative, 4 false positive       |
| Approach re-ranking        | native `permissions.deny` and worktrees beat the hook on every axis    |
| Verification (T1/T2/T3)    | all three unknowns resolved YES                                        |
| Hook removed               | `PreToolUse` 7 → 6 entries; three files deleted                        |
| Native fence deployed      | `claude-extensions` 2 rules; ADIS tracked settings 5 rules             |

## The incident that prompted it

Between **2026-08-07 and 2026-08-22**, three different Claude session roots
wrote into `engineering-docs-agent` concurrently. Twelve files were written from
more than one root; `orchestrator_runner.py` was written from all three. On
**2026-08-16**, a session rooted in `advanced-data-importer` and a session
rooted in `claude-extensions` edited the same files within the same UTC second,
and one session was asked to apply another session's uncommitted work.

No lost commits were found — the 2026-08-14 to 2026-08-20 history verified
clean. That is weaker evidence than it looks: **uncommitted cross-session work
leaves no trace at all**, so a clean log cannot rule the damage out. That
asymmetry is why a preventive control was wanted rather than a detective one.

## The hook, and why it was wrong

`repo-fence.sh` anchored on the session's `transcript_path` (which encodes the
project root fixed at session start — `cwd` drifts, and `CLAUDE_PROJECT_DIR` is
empirically **not set** in the hook environment). Given the session's home repo,
it then classified the _command text_:

```
BLOCK  iff  (VERB matches OR REDIR matches) AND command text contains the fenced path
```

Three defects were found. Root-cause analysis collapsed them into two causes.

**A1 (bypass) and A3 (false positives) are the same cause.** The hook classifies
an _unbounded language_ — every shell spelling that can write a file — by
surface text. That produces both error directions simultaneously and
irreducibly. False negatives are spellings the patterns do not recognise
(`git -C <path> commit`, a write through `python3 -c`, a script named by path
only). False positives are innocent text that resembles a spelling they do (`->`
inside a quoted string, a `cp` _out of_ the repo, the repo path mentioned in a
comment). **Tightening the pattern to kill a false positive widens the false
negative set, and vice versa.** No pattern fixes both, because the target of a
shell command is not recoverable from its text without parsing the shell.

**A2 (the `REPO_FENCE=off` escape hatch) is a process-boundary defect.** The
documented override never worked. The hook is spawned _before_ the command's
shell exists, so `REPO_FENCE=off <command>` sets a variable in a shell the hook
cannot see. It was documented in three places and tested in none.

## The evidence

`analyze.py` read the two classifier regexes **out of the shipped hook itself**,
so the analysis could not drift from what actually ran, and replayed a
17-command labelled corpus through them using the real `grep -E` (POSIX ERE is
not Python's dialect).

| Result                                     | Count  |
| ------------------------------------------ | ------ |
| Commands                                   | 17     |
| **Wrong**                                  | **11** |
| False negative (should BLOCK, was ALLOWed) | 7      |
| False positive (should ALLOW, was BLOCKed) | 4      |

A ~35% accuracy rate on a corpus written by the hook's own author — the
favourable case, since it contains only the failure modes already imagined.

Two findings from that measurement are worth carrying forward:

- **The prototype disproved the author's own proposed fix.** A "DEFER on any
  mention of the fenced path" strategy scored _worse_ (8 wrong, 7 false
  positives) than simply patching the patterns (5 wrong). The fix that felt
  obviously safer was measurably worse.
- **The hook was blind to the most likely future case.** It cannot see two
  sessions both opened _in_ the agent repo — which became the normal case as
  soon as users were advised to open sessions there.

### The hook blocked the command that installed its replacement

While writing the `permissions.deny` rule into `claude-extensions`' own settings
file, the hook fired:

```
repo-fence: BLOCKED -- this session's home is '-Users-theo-Projects-claude-extensions',
but '/Users/theo/Projects/engineering-docs-agent' may only be MODIFIED from a session
opened in that repo.
```

The command was writing to `claude-extensions`. It merely _contained_ the fenced
repo's path as a JSON string value, next to a `>` redirect. A live instance of
A3, produced by the hook against its own replacement.

## What replaced it

Six approaches were re-scored against the actual incidents rather than against
command-classification accuracy:

| All 7 incidents | Observed-only | Approach                               |
| --------------- | ------------- | -------------------------------------- |
| 93%             | 90%           | Worktree per session                   |
| 93%             | 90%           | Repo lock file                         |
| 71%             | **90%**       | **Native `permissions.deny`**          |
| 57%             | 50%           | Dirty-tree guard                       |
| 50%             | 70%           | Text-matching hook (the one installed) |
| 29%             | 10%           | git pre-commit / pre-push              |

Native deny won on the observed incidents and needs no custom code. Three
uncertainties blocked it; all three were tested empirically and resolved YES:

| Test | Question                                              | Result                                                                                         |
| ---- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| T1   | Does a _project_ deny reach outside the project tree? | Yes — an `Edit` on `/private/tmp/…` was denied from a `claude-extensions` session              |
| T2   | Does `deny` beat an existing `allow`?                 | Yes — `Bash(cat *)` was allowed, `cat` still blocked. `permissions.*` is re-read mid-session, no restart — but this does NOT generalise; see T4 |
| T3   | Does an `Edit(...)` deny also stop `Write`?           | Yes — same denial                                                                              |
| T4   | Does T2's "no restart" hold for `sandbox.filesystem.denyWrite`? | **No** — added 2026-09-12. The sandbox profile is compiled at process launch and never re-read; removing the entry changed nothing until the terminal was fully quit |

**Why this works where the hook could not:** deny rules are evaluated against
the tool call's **resolved `file_path`**, after the harness has normalised it.
The path could be relative, symlinked, or `../`-traversed and still resolve into
the fenced prefix. A decidable question replaced an undecidable one.

### Deployed state

| Root                                            | Rules                                                      |
| ----------------------------------------------- | ---------------------------------------------------------- |
| `claude-extensions/.claude/settings.local.json` | `Edit`, `Write`                                            |
| ADIS tracked `.claude/settings.json`            | `Edit`, `Write`, `NotebookEdit` (+ 2 pre-existing kubectl) |
| ADIS roots covered                              | 15 of 17                                                   |

The ADIS fence lives in the **tracked** `settings.json` (git-negated at that
repo's `.gitignore:83`), not `settings.local.json`. That is the load-bearing
choice: a tracked file materialises in every worktree checkout, whereas
`settings.local.json` fences exactly one project root. ADIS has 17 roots.

`NotebookEdit` was added by the follow-up session and is a genuine improvement —
it is a third file-writing tool and the original rule pair missed it.

### Two residuals, accepted

1. **Bash writes are outside the fence.** `Bash` deny rules match command
   strings, not resolved paths, so `echo x > <fenced path>` is not blocked. Only
   `Edit`, `Write`, and `NotebookEdit` are covered. Accepted because the observed
   incidents went through file tools.
2. **Worktrees on branches predating the commit are uncovered.** The `**` glob
   matches one prefix, and a tracked settings file only reaches a worktree once
   its branch contains the commit. Two ADIS worktrees are currently in this
   state; they inherit the rule on rebase.

## The `//` trap

The rule must be written with a **doubled** slash:

```json
"deny": ["Edit(//Users/theo/Projects/engineering-docs-agent/**)"]
```

The doubled form is verified working (T1–T3 above, plus live write attempts from
two different repos).

The failure mode of the single-slash form — `Edit(/Users/...)` being parsed as a
gitignore-style pattern rooted at the settings file's own directory, and
therefore fencing nothing — is the follow-up session's analysis and was **not**
independently verified here. Treat it as the likely explanation, not an
established fact.

What _is_ established regardless: a mis-scoped rule still parses as valid JSON
and still passes lint. **Only a live write attempt distinguishes a working fence
from an inert one.** Never ship one of these rules without step T1.

## What was lost

The scratchpad was wiped between 2026-08-26 and 2026-09-09. Gone:
`repo-fence.sh` (117 lines), its 25-test harness, both prototype HTML files, and
the archive copies made at removal.

Recovered into `artifacts/` from the session transcript before it aged out:
`corpus.tsv` (complete) and `analyze.py` (complete). The `REDIR` regex survives
verbatim; the `VERB` regex survives only as a partial transcription with
elisions, so **the 11-of-17 result cannot be regenerated** — it stands as a
recorded measurement against the real hook, not a reproducible one.

Root cause of the loss: the prototype skill's final step — "capture the
prototype as a primary source; commit it to a throwaway branch" — was never
executed. The analysis lived only in an ephemeral scratchpad for fourteen days.

## Reusable lessons

1. **Classify the decidable thing.** A control that must decide "does this
   mutate X?" should read a resolved path, not command text. If the only
   available input is text in an unbounded language, both error directions are
   irreducible and the control is not worth building.
2. **A passing test suite measures the cases you imagined.** 25/25 green, then
   65% wrong on a 17-command corpus written by the same author. The corpus found
   what the suite could not because it enumerated _spellings_ rather than
   confirming behaviour.
3. **Measure the fix you believe in before shipping it.** The author's preferred
   remedy scored worse than doing nothing clever.
4. **Prefer the platform's control to a custom one**, even when the custom one
   is already written. The native rule is shorter, faster, evaluated earlier,
   and cannot drift.
5. **Test an escape hatch or delete it.** A2 was documented three times and
   worked zero times.
6. **Capture throwaway analysis the day you produce it.** Scratchpads do not
   survive two weeks.
7. **Two config layers, opposite reload semantics.** `permissions.*` is re-read
   mid-session (T2). `sandbox.filesystem.*` is compiled into a macOS seatbelt
   profile at process launch, inherited by every child, and can only be
   tightened — never loosened — for the life of that process tree. Editing it
   does nothing until the terminal application is fully quit; restarting Claude
   Code from inside the same sandboxed tree re-inherits the old profile. Two
   sessions were spent on 2026-09-12 re-removing a `denyWrite` entry that was
   already gone, because T2 was read as covering both layers. The tell is
   `EPERM` rather than `EACCES`, plus unrelated commands (`ps`, `kill`) failing
   with "operation not permitted": a settings rule blocks one tool, a seatbelt
   profile blocks syscalls.

## Open at time of writing

- Three Jira tickets never filed: **CCE-167** (`_relativize` extraction
  defects), **CCE-168** (`state_io.py` documents `current_run.json` as
  gitignored when it is tracked on hosts, breaking auto-merge's `git checkout`),
  and a **CCE-141 follow-up** — that ticket's acceptance criteria
  (`page-author` regression tests) were never implemented; only the silent
  failure was fixed.
- `engineering-docs-agent` code findings, needing a session in that repo: the
  citation run-cap's `already` counter recovers its state by string-matching its
  own output prefix (rename the prefix and the cap silently never fires);
  `citation_repair.py` is ~16% code to ~64% docstring; its design spec has two
  sections both numbered "Post-implementation correction 4".
- Eight `settings.json.bak*` files now accumulate in `~/.claude`, two of them
  from this session (`.bak-repo-fence-20260826191839`,
  `.bak-before-fence-removal`).
