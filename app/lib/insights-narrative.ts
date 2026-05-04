import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

const NARRATIVE_PATH = join(process.cwd(), "app", "data", "insights-narrative.md");

export interface InsightsNarrative {
  body: string;
  capturedAt: string;
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
