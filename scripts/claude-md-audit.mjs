// Deterministic CLAUDE.md auditor. Pure: (target) -> { score, grade, files[], issues[] }.
// Mirrors the claude-md-improver rubric (commands / architecture / patterns /
// conciseness / currency / actionability) with weights 20/20/15/15/15/15 = 100.
//
// Report-only: never writes to CLAUDE.md files. Designed to run headless from
// the morning launchd routine alongside the existing assessment scorer.

import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { homedir } from "node:os";

const FILE_NAMES = new Set(["CLAUDE.md", ".claude.md", ".claude.local.md"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "out",
  "coverage",
  ".turbo",
  ".vercel",
  ".cache",
]);
const STALE_DAYS = 90;
const FRESH_DAYS = 30;
const VERBOSE_LINES = 400;
const THIN_LINES = 15;
const MAX_DEPTH = 6;

export function expandHome(p) {
  if (!p) return p;
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

async function findClaudeMdFiles(root) {
  const found = [];
  const queue = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    let entries = [];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < MAX_DEPTH && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) {
          queue.push({ dir: full, depth: depth + 1 });
        }
      } else if (e.isFile() && FILE_NAMES.has(e.name)) {
        found.push(full);
      }
    }
  }
  return found;
}

export function gradeFor(score) {
  if (score >= 90) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

/**
 * Return the body text under a heading (everything until the next heading of
 * same or higher level, or EOF). Used to verify that "## Architecture" has
 * actual content beneath it, not just a bare heading.
 */
export function sectionBody(content, headingPattern) {
  const re = new RegExp(`^(#{1,6})\\s+(${headingPattern})\\b.*$`, "im");
  const m = content.match(re);
  if (!m) return null;
  const startLevel = m[1].length;
  const startIdx = m.index + m[0].length;
  const rest = content.slice(startIdx);
  const next = rest.match(new RegExp(`^#{1,${startLevel}}\\s`, "m"));
  const body = next ? rest.slice(0, next.index) : rest;
  return body.trim();
}

// Stale-version markers — if a CLAUDE.md still references these, it has rotted
// regardless of how recently the mtime was touched.
const STALE_VERSION_PATTERNS = [
  /\bClaude\s*3(\.\d+)?\b/i,
  /\bSonnet\s*3(\.\d+)?\b/i,
  /\bOpus\s*3(\.\d+)?\b/i,
  /\bclaude\.json\b/i, // legacy config file name
];

// A "specific reference" — backticks, file paths, or fenced code — proves a
// gotcha/notes entry isn't just generic prose.
const SPECIFIC_REF = /(`[^`]+`|\b[\w./-]+\.(?:js|ts|tsx|mjs|json|md|sh|py|go|rs)\b|\bnpm\s+\w+|\bgh\s+\w+|\bvitest\b)/;

export function scoreFile(content, mtimeMs, now = Date.now()) {
  const lines = content.split("\n");
  const headings = lines.filter((l) => /^#{1,6}\s/.test(l));
  const ageDays = Math.max(0, (now - mtimeMs) / (1000 * 60 * 60 * 24));
  const issues = [];

  // commands (20): fenced code blocks containing tooling invocations
  const commandHits = (
    content.match(
      /```(?:bash|sh|zsh|console|shell)?[\s\S]*?(?:npm|pnpm|yarn|bun|cargo|go run|python|make|next|vitest|playwright|docker|kubectl|terraform|vercel|gh)\b[\s\S]*?```/gi
    ) || []
  ).length;
  const commands = Math.min(20, commandHits * 7);
  if (commands < 10) issues.push("commands: few executable command blocks");

  // architecture (20): explicit heading AND substantive body underneath.
  // An empty "## Architecture" heading no longer earns 20 points — the
  // forensic critique enumerated this as a top gameable signal.
  const archHeadingPat = "architecture|structure|layout|directory|key files?|project structure";
  const archBody = sectionBody(content, archHeadingPat);
  let architecture;
  if (archBody && archBody.length >= 80) {
    architecture = 20;
  } else if (archBody) {
    architecture = 10;
    issues.push("architecture: section is thin (<80 chars of body)");
  } else if (headings.length >= 3) {
    architecture = 10;
  } else {
    architecture = 0;
  }
  if (architecture < 15) issues.push("architecture: no Architecture/Structure section");

  // non-obvious patterns (15): gotchas section must contain at least one
  // specific reference (backticks, file paths, or tooling commands). Generic
  // prose like "don't break things" no longer scores 15/15.
  const gotchaPat = "gotchas?|pitfalls?|caveats?|warnings?|notes?|conventions?";
  const gotchaBody = sectionBody(content, gotchaPat);
  let patterns;
  if (gotchaBody && SPECIFIC_REF.test(gotchaBody)) {
    patterns = 15;
  } else if (gotchaBody) {
    patterns = 8;
    issues.push("patterns: Gotchas section has no specific tool/file references");
  } else {
    patterns = 5;
  }
  if (patterns < 10) issues.push("patterns: no Gotchas/Notes section");

  // conciseness (15): penalize > VERBOSE_LINES; penalize very thin
  let conciseness = 15;
  if (lines.length > VERBOSE_LINES) {
    conciseness = 5;
    issues.push(`conciseness: ${lines.length} lines (>${VERBOSE_LINES})`);
  } else if (lines.length < THIN_LINES) {
    conciseness = 5;
    issues.push("conciseness: very thin");
  }

  // currency (15): mtime <= 30d -> 15, <= 90d -> 10, > 90d -> 0
  // Plus: stale version mentions cap currency at 5, regardless of mtime —
  // a freshly-touched file pointing at "Claude 3.5 Sonnet" is not current.
  let currency = ageDays <= FRESH_DAYS ? 15 : ageDays <= STALE_DAYS ? 10 : 0;
  const staleHits = STALE_VERSION_PATTERNS.filter((p) => p.test(content));
  if (staleHits.length > 0) {
    currency = Math.min(currency, 5);
    issues.push(`currency: stale version mentions (${staleHits.length}) — refresh model/config references`);
  }
  if (currency < 10) issues.push(`currency: last edited ${Math.round(ageDays)}d ago`);

  // actionability (15): bullet density relative to headings + imperative verb hits
  const bulletLines = lines.filter((l) => /^\s*[-*]\s/.test(l)).length;
  const imperatives = (content.match(/\b(run|use|prefer|avoid|never|always|don'?t|do not)\b/gi) || []).length;
  const actionability = Math.min(
    15,
    Math.round((bulletLines / Math.max(1, headings.length)) * 3) + Math.min(8, imperatives)
  );
  if (actionability < 8) issues.push("actionability: low imperative density");

  const score = commands + architecture + patterns + conciseness + currency + actionability;
  return {
    score,
    breakdown: { commands, architecture, patterns, conciseness, currency, actionability },
    issues,
    lineCount: lines.length,
    ageDays: Math.round(ageDays),
  };
}

export async function auditTarget({ name, path }) {
  const resolved = expandHome(path);
  if (!resolved || !existsSync(resolved)) {
    return { name: name || path, path: resolved, error: "path not found", files: [], score: null, grade: "F" };
  }
  const paths = await findClaudeMdFiles(resolved);
  const files = [];
  for (const p of paths) {
    let content, st;
    try {
      [content, st] = await Promise.all([readFile(p, "utf8"), stat(p)]);
    } catch {
      continue;
    }
    const r = scoreFile(content, st.mtimeMs);
    files.push({ path: relative(resolved, p), ...r, grade: gradeFor(r.score) });
  }
  if (files.length === 0) {
    return { name: name || path, path: resolved, missing: true, files: [], score: null, grade: "F" };
  }
  const avg = Math.round(files.reduce((a, f) => a + f.score, 0) / files.length);
  return { name: name || path, path: resolved, files, score: avg, grade: gradeFor(avg) };
}

export async function auditAll(targets = []) {
  return Promise.all(targets.map(auditTarget));
}

// Canonical criterion labels and weights. Ordered for display.
export const CRITERIA = [
  { key: "commands", label: "Commands/workflows", max: 20 },
  { key: "architecture", label: "Architecture clarity", max: 20 },
  { key: "patterns", label: "Non-obvious patterns", max: 15 },
  { key: "conciseness", label: "Conciseness", max: 15 },
  { key: "currency", label: "Currency", max: 15 },
  { key: "actionability", label: "Actionability", max: 15 },
];

// Project-detail-free aggregate over runs[]. Safe to print to Slack or share publicly.
// Counts unscoreable runs (missing CLAUDE.md, path errors) without naming them.
// Averages each rubric criterion across all scored files for a more meaningful headline.
export function summarize(runs = []) {
  const scoreable = runs.filter((r) => typeof r.score === "number");
  const missing = runs.filter((r) => r.missing).length;
  const errors = runs.filter((r) => r.error).length;
  const files = scoreable.flatMap((r) => r.files);
  const distribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const f of files) distribution[f.grade] = (distribution[f.grade] || 0) + 1;
  const avg = files.length
    ? Math.round(files.reduce((a, f) => a + f.score, 0) / files.length)
    : null;
  const avgBreakdown = files.length
    ? Object.fromEntries(
        CRITERIA.map(({ key }) => [
          key,
          Math.round(files.reduce((a, f) => a + (f.breakdown?.[key] ?? 0), 0) / files.length),
        ])
      )
    : null;
  return {
    targets: runs.length,
    targetsScored: scoreable.length,
    targetsMissing: missing,
    targetsError: errors,
    files: files.length,
    avgScore: avg,
    avgGrade: avg == null ? null : gradeFor(avg),
    distribution,
    avgBreakdown,
  };
}
