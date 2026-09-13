#!/usr/bin/env python3
"""PROTOTYPE — throwaway. Does the false CCE-101 claim reach the page-author agent?

Question it settles: `engineering-docs-agent/CLAUDE.md` documents auto-merge
eligibility wrongly (stale since CCE-140). CLAUDE.md is fed to page-author via
`state_io.load_voice_samples`, but that caps at 20KB and truncates. If the false
claim falls outside the cap, the defect is documentation-only. If inside, the
claim is an INPUT to the agent that writes published docs.

WHY THIS LIVES IN claude-code-self-assessment RATHER THAN THE REPO IT TESTS
    The diagnosing session's sandbox profile fences writes to the subject repo
    (repo-fence postmortem, reusable lesson 7). Reads work, writes do not.

RUN IT
    cd ~/Projects/engineering-docs-agent
    PYTHONDONTWRITEBYTECODE=1 .venv/bin/python3 \
        ~/Projects/claude-extensions/docs/superpowers/artifacts/2026-09-13-cce101-voice-sample-probe.py

    PYTHONDONTWRITEBYTECODE is load-bearing: the agent stages with `git add -A .`,
    so a stray __pycache__ would land in a docs PR.
"""
import sys
from pathlib import Path

import yaml

# Run from the subject repo's root. Insert the REPO ROOT (not scripts/) so the
# dotted namespace path resolves -- CLAUDE.md's CCE-122 rule forbids putting
# scripts/ itself on sys.path, which would shadow the namespace package.
sys.path.insert(0, str(Path.cwd()))

from scripts.state_io import load_voice_samples

CLAIM = "Eligible = non-partial AND zero fact-checker warnings"
repo_root = Path.cwd()

cfg_path = repo_root / ".engineering-docs-agent" / "config.yml"
config = yaml.safe_load(cfg_path.read_text()) or {}

print("=== inputs ===")
print(f"repo_root      : {repo_root}")
print(f"CLAUDE.md bytes: {len((repo_root / 'CLAUDE.md').read_text())}")
print(f"voice override : {(repo_root / 'docs-agent-voice.md').exists()}")
print(f"sample_paths   : {(config.get('voice') or {}).get('sample_paths')}")

samples = load_voice_samples(repo_root, config)

print("\n=== what load_voice_samples actually returned ===")
total = 0
for s in samples:
    n = len(s["content"])
    total += n
    print(f"  {s['path']:<20} {n:>6} chars  (running total {total})")
print(f"  {'TOTAL':<20} {total:>6} chars   cap=20000")

print("\n=== does the false claim survive the cap? ===")
hit = None
for s in samples:
    if CLAIM in s["content"]:
        hit = s
        break

if hit is None:
    print("VERDICT: TRUNCATED AWAY — claim never reaches the agent.")
    print("         Defect is documentation-only.")
    sys.exit(0)

off = hit["content"].find(CLAIM)
print(f"VERDICT: PRESENT in {hit['path']} at offset {off} of {len(hit['content'])}")
print(f"         {len(hit['content']) - off} chars of margin before truncation.")
print("         The false claim is an INPUT to the agent that writes published docs.")
print("\n=== the text the agent receives ===")
start = max(0, off - 60)
print("   ..." + hit["content"][start : off + 240].replace("\n", " ") + "...")
