import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdir, writeFile, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scoreFile, gradeFor, auditTarget, expandHome, summarize, CRITERIA } from "../claude-md-audit.mjs";

const NOW = new Date("2026-04-25T07:15:00.000Z").getTime();
const days = (n) => NOW - n * 24 * 60 * 60 * 1000;

const STRONG_CLAUDE_MD = `# Project

## Quick Start

\`\`\`bash
npm install
npm run dev
\`\`\`

## Architecture

- \`app/\` — Next.js App Router pages
- \`scripts/\` — node CLIs powering the launchd routine
- \`app/data/\` — assessment + coverage JSON written by scripts

## Commands

\`\`\`bash
npm test
npm run coverage
vitest run
\`\`\`

## Gotchas

- Never run with skipDangerousModePermissionPrompt
- Always prefer Edit over Write for known files
- Do not commit \`.env.local\`

## Notes

Use \`npm run assess\` to refresh the dashboard data.
`;

const THIN_CLAUDE_MD = `# Tiny\n\nProject.\n`;

const VERBOSE_CLAUDE_MD = `# Wall of text\n\n${"prose line.\n".repeat(500)}`;

describe("gradeFor", () => {
  it.each([
    [95, "A"],
    [70, "B"],
    [50, "C"],
    [30, "D"],
    [10, "F"],
  ])("score %i -> %s", (score, expected) => {
    expect(gradeFor(score)).toBe(expected);
  });
});

describe("scoreFile", () => {
  it("scores a strong CLAUDE.md highly", () => {
    const r = scoreFile(STRONG_CLAUDE_MD, days(7), NOW);
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.breakdown.commands).toBeGreaterThanOrEqual(14);
    expect(r.breakdown.architecture).toBe(20);
    expect(r.breakdown.patterns).toBe(15);
    expect(r.breakdown.currency).toBe(15);
  });

  it("flags conciseness on a verbose file", () => {
    const r = scoreFile(VERBOSE_CLAUDE_MD, days(1), NOW);
    expect(r.breakdown.conciseness).toBe(5);
    expect(r.issues.some((i) => i.startsWith("conciseness:"))).toBe(true);
  });

  it("flags conciseness on a thin file", () => {
    const r = scoreFile(THIN_CLAUDE_MD, days(1), NOW);
    expect(r.breakdown.conciseness).toBe(5);
  });

  it("decays currency to 0 after 90 days", () => {
    const r = scoreFile(STRONG_CLAUDE_MD, days(120), NOW);
    expect(r.breakdown.currency).toBe(0);
    expect(r.issues.some((i) => i.startsWith("currency:"))).toBe(true);
  });

  it("gives partial currency between 30 and 90 days", () => {
    const r = scoreFile(STRONG_CLAUDE_MD, days(60), NOW);
    expect(r.breakdown.currency).toBe(10);
  });

  it("flags an empty Architecture heading instead of awarding 20 (anti-gaming)", () => {
    const empty = `# Project\n\n## Architecture\n\n## Commands\n\n\`\`\`bash\nnpm test\n\`\`\`\n## Gotchas\n\n- Avoid \`rm -rf\`\n`;
    const r = scoreFile(empty, days(7), NOW);
    expect(r.breakdown.architecture).toBeLessThan(20);
    expect(r.issues.some((i) => i.startsWith("architecture:"))).toBe(true);
  });

  it("downgrades Gotchas section that lacks specific tool/file references", () => {
    const generic = `# Project\n\n## Architecture\n\nThe app/ directory holds the Next.js routes and scripts/ holds the node CLIs powering the daily routine.\n\n## Gotchas\n\n- Be careful\n- Don't break things\n- Avoid mistakes\n\n## Commands\n\n\`\`\`bash\nnpm test\n\`\`\`\n`;
    const r = scoreFile(generic, days(7), NOW);
    expect(r.breakdown.patterns).toBeLessThan(15);
    expect(r.issues.some((i) => /specific tool\/file/.test(i))).toBe(true);
  });

  it("caps currency at 5 when the file mentions stale model/config versions", () => {
    const stale = STRONG_CLAUDE_MD + "\n\n## Notes\n\nWe still target Claude 3.5 Sonnet for cost reasons.\n";
    const r = scoreFile(stale, days(1), NOW);
    expect(r.breakdown.currency).toBeLessThanOrEqual(5);
    expect(r.issues.some((i) => /stale version/.test(i))).toBe(true);
  });

  it("caps currency at 5 when the file mentions claude.json (legacy config)", () => {
    const stale = STRONG_CLAUDE_MD + "\n\nSee `claude.json` for old config.\n";
    const r = scoreFile(stale, days(1), NOW);
    expect(r.breakdown.currency).toBeLessThanOrEqual(5);
  });
});

describe("expandHome", () => {
  it("expands ~ and ~/", () => {
    expect(expandHome("~/foo")).toMatch(/\/foo$/);
    expect(expandHome("/abs/path")).toBe("/abs/path");
  });
});

describe("auditTarget", () => {
  let tmpRoot;
  let absentRoot;

  beforeAll(async () => {
    tmpRoot = join(tmpdir(), `claude-md-audit-test-${Date.now()}`);
    await mkdir(join(tmpRoot, "packages", "api"), { recursive: true });
    await writeFile(join(tmpRoot, "CLAUDE.md"), STRONG_CLAUDE_MD);
    await writeFile(join(tmpRoot, "packages", "api", "CLAUDE.md"), THIN_CLAUDE_MD);
    // Make the thin one ancient so currency hits 0.
    const ancient = new Date(days(180));
    await utimes(join(tmpRoot, "packages", "api", "CLAUDE.md"), ancient, ancient);

    absentRoot = join(tmpdir(), `claude-md-audit-empty-${Date.now()}`);
    await mkdir(absentRoot, { recursive: true });
  });

  afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
    await rm(absentRoot, { recursive: true, force: true });
  });

  it("audits multiple CLAUDE.md files in one target", async () => {
    const result = await auditTarget({ name: "fixture", path: tmpRoot });
    expect(result.name).toBe("fixture");
    expect(result.files).toHaveLength(2);
    expect(result.score).toBeGreaterThan(0);
    expect(result.grade).toMatch(/^[A-F]$/);
    const strong = result.files.find((f) => f.path === "CLAUDE.md");
    expect(strong.score).toBeGreaterThanOrEqual(80);
  });

  it("returns missing:true when the target has no CLAUDE.md", async () => {
    const result = await auditTarget({ name: "empty", path: absentRoot });
    expect(result.missing).toBe(true);
    expect(result.files).toEqual([]);
    expect(result.score).toBeNull();
  });

  it("returns error when path doesn't exist", async () => {
    const result = await auditTarget({ name: "nope", path: "/no/such/path/xyz" });
    expect(result.error).toBe("path not found");
  });
});

describe("summarize (project-detail-free aggregate)", () => {
  const bd = (overrides = {}) => ({
    commands: 20,
    architecture: 20,
    patterns: 15,
    conciseness: 15,
    currency: 15,
    actionability: 15,
    ...overrides,
  });

  it("aggregates scores, files, and grade distribution across runs", () => {
    const runs = [
      {
        name: "alpha",
        score: 88,
        grade: "B",
        files: [
          { path: "CLAUDE.md", score: 92, grade: "A", breakdown: bd() },
          { path: "pkg/CLAUDE.md", score: 84, grade: "B", breakdown: bd({ commands: 14, currency: 10 }) },
        ],
      },
      {
        name: "beta",
        score: 60,
        grade: "C",
        files: [{ path: "CLAUDE.md", score: 60, grade: "C", breakdown: bd({ commands: 7, architecture: 10, patterns: 5, currency: 10, actionability: 8 }) }],
      },
    ];
    const s = summarize(runs);
    expect(s.targets).toBe(2);
    expect(s.targetsScored).toBe(2);
    expect(s.files).toBe(3);
    expect(s.avgScore).toBe(Math.round((92 + 84 + 60) / 3));
    expect(s.avgGrade).toBe("B");
    expect(s.distribution).toEqual({ A: 1, B: 1, C: 1, D: 0, F: 0 });
    // Criterion averages
    expect(s.avgBreakdown).not.toBeNull();
    expect(s.avgBreakdown.commands).toBe(Math.round((20 + 14 + 7) / 3));
    expect(s.avgBreakdown.architecture).toBe(Math.round((20 + 20 + 10) / 3));
    expect(s.avgBreakdown.currency).toBe(Math.round((15 + 10 + 10) / 3));
  });

  it("exposes CRITERIA with stable order, labels, and maxes", () => {
    expect(CRITERIA.map((c) => c.key)).toEqual([
      "commands",
      "architecture",
      "patterns",
      "conciseness",
      "currency",
      "actionability",
    ]);
    expect(CRITERIA.map((c) => c.max)).toEqual([20, 20, 15, 15, 15, 15]);
    expect(CRITERIA.find((c) => c.key === "commands").label).toBe("Commands/workflows");
  });

  it("counts missing and errored targets without naming them", () => {
    const runs = [
      { name: "alpha", missing: true, files: [], score: null },
      { name: "beta", error: "path not found", files: [], score: null },
      {
        name: "gamma",
        score: 70,
        grade: "B",
        files: [{ path: "CLAUDE.md", score: 70, grade: "B", breakdown: bd() }],
      },
    ];
    const s = summarize(runs);
    expect(s.targets).toBe(3);
    expect(s.targetsScored).toBe(1);
    expect(s.targetsMissing).toBe(1);
    expect(s.targetsError).toBe(1);
    expect(s.files).toBe(1);
    expect(s.avgScore).toBe(70);
    // No target names should appear in the aggregate output
    expect(JSON.stringify(s)).not.toMatch(/alpha|beta|gamma/);
  });

  it("returns null avg when nothing was scoreable", () => {
    const s = summarize([{ name: "x", missing: true, files: [], score: null }]);
    expect(s.avgScore).toBeNull();
    expect(s.avgGrade).toBeNull();
    expect(s.files).toBe(0);
  });

  it("handles empty input", () => {
    const s = summarize([]);
    expect(s.targets).toBe(0);
    expect(s.files).toBe(0);
    expect(s.avgScore).toBeNull();
  });
});
