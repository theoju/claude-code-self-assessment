import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatherInsightsSignals } from "../insights-signals.mjs";

let dir;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "insights-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeFacet(claudeHome, sessionId, body) {
  const path = join(claudeHome, "usage-data", "facets", `${sessionId}.json`);
  mkdirSync(join(claudeHome, "usage-data", "facets"), { recursive: true });
  writeFileSync(path, JSON.stringify({ session_id: sessionId, ...body }));
}

function writeMeta(claudeHome, sessionId, body) {
  const path = join(claudeHome, "usage-data", "session-meta", `${sessionId}.json`);
  mkdirSync(join(claudeHome, "usage-data", "session-meta"), { recursive: true });
  writeFileSync(path, JSON.stringify({ session_id: sessionId, ...body }));
}

function writeTranscript(claudeHome, projectDir, sessionId, lines) {
  const path = join(claudeHome, "projects", projectDir, `${sessionId}.jsonl`);
  mkdirSync(join(claudeHome, "projects", projectDir), { recursive: true });
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

const NOW = "2026-05-04T12:00:00.000Z";
const TWENTY_DAYS_AGO = "2026-04-14T12:00:00.000Z";
const SIXTY_DAYS_AGO = "2026-03-05T12:00:00.000Z";

describe("gatherInsightsSignals", () => {
  it("returns null when ~/.claude/usage-data is absent", async () => {
    const result = await gatherInsightsSignals({ claudeHome: dir, now: NOW });
    expect(result).toBeNull();
  });

  it("returns empty-but-shaped result when usage-data exists with no sessions", async () => {
    mkdirSync(join(dir, "usage-data", "facets"), { recursive: true });
    mkdirSync(join(dir, "usage-data", "session-meta"), { recursive: true });
    const result = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(result).toMatchObject({
      sessionsAnalyzed: 0,
      lookbackDays: 30,
      subagentSessionCount: 0,
      mcpSessionCount: 0,
    });
  });

  it("filters sessions outside lookback window by start_time", async () => {
    writeMeta(dir, "in", {
      start_time: TWENTY_DAYS_AGO,
      uses_task_agent: true,
      uses_mcp: true,
      tool_counts: { Bash: 5, TaskCreate: 2 },
      git_commits: 3,
    });
    writeMeta(dir, "out", {
      start_time: SIXTY_DAYS_AGO,
      uses_task_agent: true,
      uses_mcp: true,
      tool_counts: { Bash: 10, TaskCreate: 4 },
      git_commits: 7,
    });
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.sessionsAnalyzed).toBe(1);
    expect(r.subagentSessionCount).toBe(1);
    expect(r.mcpSessionCount).toBe(1);
    expect(r.gitCommitsTotal).toBe(3);
    expect(r.taskInvocationsTotal).toBe(2);
  });

  it("includes all sessions when lookbackDays is null (full history)", async () => {
    writeMeta(dir, "recent", { start_time: TWENTY_DAYS_AGO, uses_task_agent: true });
    writeMeta(dir, "ancient", { start_time: SIXTY_DAYS_AGO, uses_task_agent: false });
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: null });
    expect(r.sessionsAnalyzed).toBe(2);
    expect(r.subagentSessionCount).toBe(1);
  });

  it("aggregates friction and outcome counts from facets", async () => {
    writeMeta(dir, "s1", { start_time: TWENTY_DAYS_AGO });
    writeMeta(dir, "s2", { start_time: TWENTY_DAYS_AGO });
    writeFacet(dir, "s1", {
      outcome: "fully_achieved",
      friction_counts: { buggy_code: 2, wrong_approach: 1 },
    });
    writeFacet(dir, "s2", {
      outcome: "mostly_achieved",
      friction_counts: { buggy_code: 1 },
    });
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.frictionCounts).toEqual({ buggy_code: 3, wrong_approach: 1 });
    expect(r.outcomeCounts).toEqual({ fully_achieved: 1, mostly_achieved: 1 });
  });

  it("counts multi_task session_type from facets", async () => {
    writeMeta(dir, "s1", { start_time: TWENTY_DAYS_AGO });
    writeMeta(dir, "s2", { start_time: TWENTY_DAYS_AGO });
    writeMeta(dir, "s3", { start_time: TWENTY_DAYS_AGO });
    writeFacet(dir, "s1", { session_type: "multi_task" });
    writeFacet(dir, "s2", { session_type: "multi_task" });
    writeFacet(dir, "s3", { session_type: "single_task" });
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.multiTaskSessionCount).toBe(2);
  });

  it("attributes plugin tool invocations from mcp__plugin_<name>__* prefix", async () => {
    writeMeta(dir, "s1", {
      start_time: TWENTY_DAYS_AGO,
      tool_counts: {
        Bash: 10,
        mcp__plugin_atlassian_atlassian__createJiraIssue: 3,
        mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql: 5,
        mcp__plugin_slack_slack__slack_send_message: 2,
      },
    });
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.toolInvocationsByPlugin).toEqual({
      atlassian: 8,
      slack: 2,
    });
    expect(r.toolInvocationsTotal).toBe(20);
  });

  it("ingests hook-fires.jsonl when present, filtered by window", async () => {
    writeMeta(dir, "s1", { start_time: TWENTY_DAYS_AGO });
    writeFileSync(
      join(dir, "hook-fires.jsonl"),
      [
        { timestamp: TWENTY_DAYS_AGO, event: "PostToolUse" },
        { timestamp: TWENTY_DAYS_AGO, event: "Stop" },
        { timestamp: SIXTY_DAYS_AGO, event: "Stop" },
      ]
        .map((l) => JSON.stringify(l))
        .join("\n"),
    );
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.hookFireCount).toBe(2);
    expect(r.hookFiresByEvent).toEqual({ PostToolUse: 1, Stop: 1 });
  });

  it("returns hookFireCount=0 when hook-fires.jsonl absent", async () => {
    writeMeta(dir, "s1", { start_time: TWENTY_DAYS_AGO });
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.hookFireCount).toBe(0);
    expect(r.hookFiresByEvent).toEqual({});
  });

  it("does not scan transcripts unless includeTranscripts=true", async () => {
    writeMeta(dir, "s1", { start_time: TWENTY_DAYS_AGO });
    writeTranscript(dir, "proj", "s1", [
      { type: "user", permissionMode: "auto", timestamp: TWENTY_DAYS_AGO },
    ]);
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.transcriptsScanned).toBe(false);
    expect(r.autoModeSessionCount).toBeUndefined();
  });

  it("scans transcripts when opted in, attributing permissionMode events to sessions", async () => {
    writeMeta(dir, "auto-only", { start_time: TWENTY_DAYS_AGO });
    writeMeta(dir, "bypass-only", { start_time: TWENTY_DAYS_AGO });
    writeMeta(dir, "mixed", { start_time: TWENTY_DAYS_AGO });
    writeMeta(dir, "no-mode", { start_time: TWENTY_DAYS_AGO });

    writeTranscript(dir, "proj-a", "auto-only", [
      { type: "user", permissionMode: "auto", timestamp: TWENTY_DAYS_AGO },
      { type: "user", permissionMode: "auto", timestamp: TWENTY_DAYS_AGO },
    ]);
    writeTranscript(dir, "proj-a", "bypass-only", [
      { type: "user", permissionMode: "bypassPermissions", timestamp: TWENTY_DAYS_AGO },
    ]);
    writeTranscript(dir, "proj-b", "mixed", [
      { type: "user", permissionMode: "auto", timestamp: TWENTY_DAYS_AGO },
      { type: "user", permissionMode: "plan", timestamp: TWENTY_DAYS_AGO },
      { type: "user", permissionMode: "bypassPermissions", timestamp: TWENTY_DAYS_AGO },
    ]);
    writeTranscript(dir, "proj-b", "no-mode", [
      { type: "user", timestamp: TWENTY_DAYS_AGO },
    ]);

    const r = await gatherInsightsSignals({
      claudeHome: dir,
      now: NOW,
      lookbackDays: 30,
      includeTranscripts: true,
    });
    expect(r.transcriptsScanned).toBe(true);
    expect(r.autoModeSessionCount).toBe(2);
    expect(r.bypassPermissionsSessionCount).toBe(2);
    expect(r.planModeSessionCount).toBe(1);
  });

  it("counts worktree-state events as worktree usage when scanning transcripts", async () => {
    writeMeta(dir, "wt-session", { start_time: TWENTY_DAYS_AGO });
    writeMeta(dir, "no-wt", { start_time: TWENTY_DAYS_AGO });
    writeTranscript(dir, "proj-a", "wt-session", [
      { type: "worktree-state", worktreeSession: { worktreeName: "x" } },
      { type: "user", permissionMode: "auto", timestamp: TWENTY_DAYS_AGO },
    ]);
    writeTranscript(dir, "proj-b", "no-wt", [
      { type: "user", timestamp: TWENTY_DAYS_AGO },
    ]);
    const r = await gatherInsightsSignals({
      claudeHome: dir,
      now: NOW,
      lookbackDays: 30,
      includeTranscripts: true,
    });
    expect(r.worktreeUsageSessionCount).toBe(1);
  });

  it("drops sessions without a start_time when window is constrained", async () => {
    writeMeta(dir, "no-start", { uses_task_agent: true });
    writeMeta(dir, "good", { start_time: TWENTY_DAYS_AGO, uses_task_agent: true });
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.sessionsAnalyzed).toBe(1);
    expect(r.subagentSessionCount).toBe(1);
  });

  it("survives malformed JSON files without throwing", async () => {
    mkdirSync(join(dir, "usage-data", "session-meta"), { recursive: true });
    mkdirSync(join(dir, "usage-data", "facets"), { recursive: true });
    writeFileSync(join(dir, "usage-data", "session-meta", "bad.json"), "{not json");
    writeMeta(dir, "good", { start_time: TWENTY_DAYS_AGO, uses_task_agent: true });
    const r = await gatherInsightsSignals({ claudeHome: dir, now: NOW, lookbackDays: 30 });
    expect(r.sessionsAnalyzed).toBe(1);
    expect(r.subagentSessionCount).toBe(1);
  });
});
