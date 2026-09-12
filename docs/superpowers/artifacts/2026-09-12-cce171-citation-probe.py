#!/usr/bin/env python3
"""Evidence probe for CCE-171 findings 1 and 3 (engineering-docs-agent).

Primary source behind the measurements in CCE-171 comment 15973 and in
`docs/superpowers/cce-170-173-handoff-prompt.md` §2. Captured 2026-09-12.

WHY THIS LIVES IN claude-code-self-assessment RATHER THAN THE REPO IT TESTS
    The subject repo is write-fenced from this session root by a native
    `permissions.deny` rule (see
    `docs/superpowers/retrospectives/2026-08-26-repo-fence-postmortem.md`).
    Reads work, writes do not, so the evidence is committed on this side.

RUN IT
    cd ~/Projects/engineering-docs-agent
    PYTHONDONTWRITEBYTECODE=1 .venv/bin/python3 \
        ~/Projects/claude-extensions/docs/superpowers/artifacts/2026-09-12-cce171-citation-probe.py

    PYTHONDONTWRITEBYTECODE is load-bearing, not hygiene theatre: the agent
    stages with `git add -A .`, so a stray __pycache__ would land in a docs PR.

WHAT IT ESTABLISHES
    Finding 3 — `_resolves` does no normalisation. Its four arms are plain
    joins plus `.exists()`, and pathlib's `/` never collapses `..`; the
    un-collapsed path reaches stat(2) and the kernel walks it out of the repo.
    A citation naming a sibling repo passes the BLOCKING lint.

    Finding 1 — ENAMETOOLONG propagates. An over-long token raises OSError out
    of `_resolves` AND out of `_resolve_target`. The second is the one the
    ticket missed: `_resolve_target` is called at citation_exists.py:544,
    outside the try that opens at :547, so the symbol loop has the same
    unguarded defect as the paths loop at :511-527.

MEASURED OUTPUT, 2026-09-12 (macOS, errno 63 = ENAMETOOLONG)
    token                                           extracted  resolves  error
    docs/../../claude-extensions/README.md          True       True
    ../claude-extensions/README.md                  True       True
    a/../scripts/lint/citation_exists.py            True       False
    docs/../../../../etc/passwd                     False      None
    /etc/passwd                                     False      None
    README.md                                       False      None
    orchestrator_runner.py:128                      False      None
    docs/<3000 x z>.md                              True       None      OSError(errno=63)

    Read the `/etc/passwd` row carefully — it is NOT evidence of containment.
    The token is rejected by `_REPO_PATH_RE` for lacking an extension and
    never reaches `_relativize`. Containment is demonstrated by the absolute
    in-sibling-repo case in the second table instead. Citing the passwd row as
    proof of anything invites dismissal of a real defect.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))

from scripts.lint.citation_exists import (  # noqa: E402
    _relativize,
    _resolve_target,
    _resolves,
    extract_citations,
)

REPO_ROOT = Path.cwd()

# Deliberately empty: the `rel in files` arm is safe by construction (git
# ls-files cannot emit a `..` component), so an empty tracked-set forces every
# case down the on-disk `.exists()` fallback — the arm actually under test.
TRACKED: set[str] = set()
DOCS_DIR = "docs"
BUILD_DIR = ""
ROOTS: tuple[str, ...] = ()

CASES = [
    "docs/../../claude-extensions/README.md",
    "../claude-extensions/README.md",
    "a/../scripts/lint/citation_exists.py",
    "docs/../../../../etc/passwd",
    "/etc/passwd",
    "README.md",
    "orchestrator_runner.py:128",
    "docs/" + ("z" * 3000) + ".md",
]


def probe(token: str):
    """Reproduce the check_path paths-loop body for one token.

    Mirrors citation_exists.py:511-527 — extract, `_relativize`, `_resolves` —
    rather than calling check_path, which would need a markdown file written
    inside the fenced repo.
    """
    extracted = token in extract_citations(f"see `{token}` here")["paths"]
    rel = _relativize(token, REPO_ROOT) if extracted else None
    if rel is None:
        return extracted, None, None, None
    try:
        return (
            extracted,
            rel,
            _resolves(rel, REPO_ROOT, TRACKED, DOCS_DIR, BUILD_DIR, ROOTS),
            None,
        )
    except OSError as exc:
        return extracted, rel, None, f"OSError(errno={exc.errno})"


def main() -> None:
    if not (REPO_ROOT / "scripts" / "lint" / "citation_exists.py").exists():
        sys.exit("run from the engineering-docs-agent checkout root")

    print(f"{'token':48} {'extracted':10} {'resolves':9} error")
    for token in CASES:
        extracted, _, resolves, err = probe(token)
        label = token if len(token) <= 46 else token[:43] + "..."
        print(f"{label:48} {str(extracted):10} {str(resolves):9} {err or ''}")

    # Finding 3's fix-location evidence: the absolute arm ALREADY normalises
    # and contains, which is exactly the asymmetry that makes _relativize the
    # right place to fix the relative arm.
    print("\n_relativize absolute arm (containment already works):")
    for token in (
        "/etc/passwd",
        str(Path.home() / "Projects/claude-extensions/README.md"),
    ):
        print(f"  {token:60} -> {_relativize(token, REPO_ROOT)}")

    # Finding 1's missed call site.
    print("\n_resolve_target (citation_exists.py:544, OUTSIDE the try at :547):")
    try:
        _resolve_target("docs/" + ("z" * 3000) + ".md", REPO_ROOT, ROOTS)
        print("  long token -> no raise")
    except OSError as exc:
        print(
            f"  long token -> OSError(errno={exc.errno})  <-- same defect as the paths loop"
        )


if __name__ == "__main__":
    main()
