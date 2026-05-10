import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanTranscriptInvocations } from "../_usage-data.mjs";

let projectsRoot;
beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), "transcripts-"));
});
afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

function writeSession(name, lines) {
  const dir = join(projectsRoot, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.jsonl`), lines.join("\n"));
}

const userText = (text, ts = "2026-05-09T12:00:00Z") =>
  JSON.stringify({
    type: "user",
    timestamp: ts,
    message: { role: "user", content: text },
  });

const assistantText = (text, ts = "2026-05-09T12:00:01Z") =>
  JSON.stringify({
    type: "assistant",
    timestamp: ts,
    message: {
      role: "assistant",
      content: [{ type: "text", text }],
    },
  });

const assistantToolUse = (name, ts = "2026-05-09T12:00:01Z") =>
  JSON.stringify({
    type: "assistant",
    timestamp: ts,
    message: {
      role: "assistant",
      content: [{ type: "tool_use", name, input: {} }],
    },
  });

describe("scanTranscriptInvocations", () => {
  it("returns zeros when projectsRoot is empty", async () => {
    const r = await scanTranscriptInvocations({
      projectsRoot,
      now: new Date("2026-05-10T00:00:00Z"),
      lookbackDays: 30,
    });
    expect(r).toEqual({
      goCommandUses: 0,
      batchCommandUses: 0,
      focusCommandUses: 0,
      scheduleCommandUses: 0,
      babysitLoopUses: 0,
      planThenLaunchSessions: 0,
    });
  });

  it("counts /go, /batch, /focus, /schedule slash commands", async () => {
    writeSession("s1", [
      userText("/go run the tests"),
      userText("/batch update fixtures"),
      userText("/focus"),
      userText("/schedule daily"),
      userText("/go"),
      userText("hello /go inline does not count"),
    ]);
    const r = await scanTranscriptInvocations({
      projectsRoot,
      now: new Date("2026-05-10T00:00:00Z"),
      lookbackDays: 30,
    });
    expect(r.goCommandUses).toBe(2);
    expect(r.batchCommandUses).toBe(1);
    expect(r.focusCommandUses).toBe(1);
    expect(r.scheduleCommandUses).toBe(1);
  });

  it("counts babysit-loop sessions (1 per session if both /loop and /babysit present)", async () => {
    writeSession("s1", [
      userText("/loop 30m"),
      userText("/babysit"),
      userText("/loop 30m"),
    ]);
    writeSession("s2", [userText("/loop")]);
    writeSession("s3", [userText("/loop"), userText("/babysit")]);
    const r = await scanTranscriptInvocations({
      projectsRoot,
      now: new Date("2026-05-10T00:00:00Z"),
      lookbackDays: 30,
    });
    expect(r.babysitLoopUses).toBe(2);
  });

  it("detects plan-then-launch (ExitPlanMode followed by tool_use within 2 messages)", async () => {
    writeSession("s1", [
      assistantToolUse("ExitPlanMode"),
      assistantToolUse("Edit"),
    ]);
    writeSession("s2", [
      assistantToolUse("ExitPlanMode"),
      assistantText("let me explain the plan first..."),
      assistantText("more narration"),
      assistantToolUse("Edit"),
    ]);
    writeSession("s3", [
      assistantToolUse("ExitPlanMode"),
      assistantText("ok"),
      assistantToolUse("Bash"),
    ]);
    const r = await scanTranscriptInvocations({
      projectsRoot,
      now: new Date("2026-05-10T00:00:00Z"),
      lookbackDays: 30,
    });
    expect(r.planThenLaunchSessions).toBe(2);
  });

  it("respects lookback window via timestamps", async () => {
    writeSession("recent", [userText("/go", "2026-05-09T00:00:00Z")]);
    writeSession("ancient", [userText("/go", "2026-01-01T00:00:00Z")]);
    const r = await scanTranscriptInvocations({
      projectsRoot,
      now: new Date("2026-05-10T00:00:00Z"),
      lookbackDays: 30,
    });
    expect(r.goCommandUses).toBe(1);
  });
});
