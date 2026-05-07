import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { NextResponse } from "next/server";

// Serves ~/.claude/usage-data/report.html — the static HTML artifact Claude
// Code writes when the user runs /insights. We don't generate, edit, or
// redistribute it; we just stream the file the user already has on disk.
// The route only exists locally on the user's machine (Next dev/prod on
// localhost). No upstream calls, no caching, no persistence.
export const dynamic = "force-dynamic";

function reportPath() {
  const claudeHome = process.env.CLAUDE_HOME || join(homedir(), ".claude");
  return join(claudeHome, "usage-data", "report.html");
}

export async function GET() {
  const path = reportPath();
  if (!existsSync(path)) {
    return new NextResponse("No /insights report found at ~/.claude/usage-data/report.html. Run /insights in Claude Code first.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const html = await readFile(path, "utf8");
  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // No-cache so a fresh /insights run shows up immediately on refresh.
      "cache-control": "no-store",
    },
  });
}
