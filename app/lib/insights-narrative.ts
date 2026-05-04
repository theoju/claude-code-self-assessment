import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const NARRATIVE_PATH = join(process.cwd(), "app", "data", "insights-narrative.md");

function reportHtmlPath() {
  const claudeHome = process.env.CLAUDE_HOME || join(homedir(), ".claude");
  return join(claudeHome, "usage-data", "report.html");
}

export interface InsightsNarrative {
  body: string;
  capturedAt: string;
}

export interface InsightsReportFile {
  capturedAt: string;
  byteSize: number;
}

// User pastes the output of Claude Code's /insights into this file. We read it
// verbatim, render it locally, never upload it. Treated as user-owned content,
// not part of the repo (gitignored).
export async function loadInsightsNarrative(): Promise<InsightsNarrative | null> {
  if (!existsSync(NARRATIVE_PATH)) return null;
  try {
    const body = (await readFile(NARRATIVE_PATH, "utf8")).trim();
    if (!body) return null;
    const capturedAt = statSync(NARRATIVE_PATH).mtime.toISOString();
    return { body, capturedAt };
  } catch {
    return null;
  }
}

// Detects ~/.claude/usage-data/report.html — the static HTML artifact Claude
// Code writes when the user runs /insights. We don't read its content here
// (the route /api/insights-report streams it on demand); we just confirm it
// exists and surface the mtime so the dashboard can show "your last run".
export function detectInsightsReportFile(): InsightsReportFile | null {
  const path = reportHtmlPath();
  if (!existsSync(path)) return null;
  try {
    const stat = statSync(path);
    return { capturedAt: stat.mtime.toISOString(), byteSize: stat.size };
  } catch {
    return null;
  }
}
