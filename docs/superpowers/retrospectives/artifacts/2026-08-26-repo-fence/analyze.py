#!/usr/bin/env python3
# ---------------------------------------------------------------------------
# PRESERVATION NOTE (added 2026-09-09, not part of the original file)
#
# Kept as a primary source for the repo-fence postmortem. It does NOT run
# as-is: it reads the two classifier regexes out of ~/.claude/hooks/repo-fence.sh,
# and that hook was deleted on 2026-08-26 when the fence was replaced by native
# `permissions.deny` rules.
#
# To re-run it you must restore a HOOK file containing the two regex lines in
# the shapes the `re.search` calls below expect. The REDIR pattern survives
# verbatim in `repo-fence-patterns.txt`; the VERB pattern does NOT — only a
# partial transcription survives. Read the postmortem's "What was lost"
# section before trusting any re-run.
#
# Everything below this banner is the file as it stood on 2026-08-26.
# ---------------------------------------------------------------------------
"""Phase 1 instrumentation for repo-fence.sh.

Shows WHICH decision point resolves each command, instead of only the final
exit code. The two classifier regexes are read out of the shipped hook itself,
so this analysis cannot drift from what actually runs.
"""

import re
import subprocess
from pathlib import Path

HOOK = Path.home() / ".claude/hooks/repo-fence.sh"
HERE = Path(__file__).parent
REPO = "/tmp/fakerepo"

src = HOOK.read_text()
verb_pat = re.search(r"if printf '%s' \"\$CMD\" \| grep -qE '(.+?)'; then", src).group(
    1
)
redir_pat = re.search(
    r"elif printf '%s' \"\$CMD\" \| grep -qE '(.+?)'; then", src
).group(1)


def grep_e(pattern: str, text: str) -> bool:
    """Use the real grep -E: POSIX ERE is not Python's re dialect."""
    return (
        subprocess.run(
            ["grep", "-qE", pattern], input=text, text=True, capture_output=True
        ).returncode
        == 0
    )


rows = []
for line in (HERE / "corpus.tsv").read_text().splitlines():
    if not line.strip():
        continue
    truth, cmd, why = line.split("\t")
    verb = grep_e(verb_pat, cmd)
    redir = grep_e(redir_pat, cmd)
    names = REPO in cmd
    verdict = "BLOCK" if ((verb or redir) and names) else "ALLOW"
    rows.append((truth, verdict, verb, redir, names, cmd, why))

w = max(len(r[5]) for r in rows)
print(f"{'COMMAND':<{w}} | verb | redir | names | GOT   | WANT")
print("-" * (w + 38))
wrong = 0
for truth, verdict, verb, redir, names, cmd, why in rows:
    bad = truth != verdict
    wrong += bad
    mark = "   <-- WRONG: " + why if bad else ""
    print(
        f"{cmd:<{w}} | {'Y' if verb else '.':^4} | {'Y' if redir else '.':^5} | "
        f"{'Y' if names else '.':^5} | {verdict:<5} | {truth:<5}{mark}"
    )

fn = sum(1 for t, v, *_ in rows if t == "BLOCK" and v == "ALLOW")
fp = sum(1 for t, v, *_ in rows if t == "ALLOW" and v == "BLOCK")
print()
print(
    f"{len(rows)} commands: {wrong} wrong  ({fn} false NEGATIVE, {fp} false POSITIVE)"
)
print()
print("Both error directions are produced by the SAME stage -- classifying an")
print("unbounded language by surface text. False negatives are spellings the")
print("patterns do not recognise; false positives are innocent text that")
print("resembles a spelling they do. Neither is fixable by editing the pattern:")
print("tightening it to kill a false positive widens the false-negative set,")
print("and vice versa.")
