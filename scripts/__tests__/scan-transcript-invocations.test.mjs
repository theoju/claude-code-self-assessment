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

// Non-semantic interleaved row — system_reminder injection. Real
// transcripts pack 1-3 of these between every assistant turn; the
// scanner must skip past them when locating the "next assistant turn"
// after ExitPlanMode.
const attachment = (ts = "2026-05-09T12:00:01Z") =>
  JSON.stringify({ type: "attachment", timestamp: ts });

// CLI markup shape — what a user actually-typed slash command looks
// like in current transcripts. The bare `/cmd` text form is also
// supported as a fallback (see `extractSlashCommands`).
const userMarkup = (cmd, ts = "2026-05-09T12:00:00Z") =>
  JSON.stringify({
    type: "user",
    timestamp: ts,
    message: {
      role: "user",
      content: `<command-message>${cmd}</command-message>\n<command-name>${cmd}</command-name>`,
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

  it("detects plan-then-launch: counts when first assistant turn after ExitPlanMode is a tool_use", async () => {
    writeSession("s1", [
      assistantToolUse("ExitPlanMode"),
      assistantToolUse("Edit"),
    ]);
    writeSession("s2", [
      assistantToolUse("ExitPlanMode"),
      assistantText("let me explain the plan first..."),
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
    // s1 counts: first assistant turn after ExitPlanMode is a tool_use.
    // s2 + s3 do NOT count: first assistant turn is text narration —
    // exactly the anti-pattern Boris tip 65 calls out.
    expect(r.planThenLaunchSessions).toBe(1);
  });

  it("plan-then-launch skips type=attachment system-reminder rows", async () => {
    // Real transcripts interleave attachment rows between assistant
    // turns; the old "next 2 messages" window got consumed by them and
    // returned 0 even when a tool_use actually followed. The fix is to
    // skip non-(user|assistant) rows when locating the next turn.
    writeSession("s1", [
      assistantToolUse("ExitPlanMode"),
      JSON.stringify({ type: "user", timestamp: "2026-05-09T12:00:01Z" }),
      attachment(),
      attachment(),
      attachment(),
      assistantToolUse("Bash"),
    ]);
    const r = await scanTranscriptInvocations({
      projectsRoot,
      now: new Date("2026-05-10T00:00:00Z"),
      lookbackDays: 30,
    });
    expect(r.planThenLaunchSessions).toBe(1);
  });

  it("counts <command-name> markup slash commands (real CLI shape)", async () => {
    writeSession("s1", [
      userMarkup("/loop"),
      userMarkup("/loop"),
      userMarkup("/babysit"),
      userMarkup("/focus"),
      userMarkup("/go"),
    ]);
    const r = await scanTranscriptInvocations({
      projectsRoot,
      now: new Date("2026-05-10T00:00:00Z"),
      lookbackDays: 30,
    });
    expect(r.focusCommandUses).toBe(1);
    expect(r.goCommandUses).toBe(1);
    expect(r.babysitLoopUses).toBe(1);
  });

  it("strips plugin prefix from <command-name> markup", async () => {
    // /superpowers:focus and /myplugin:go should still register as
    // /focus and /go respectively. The prefix strip mirrors how the
    // user invokes them — the action is the same regardless of which
    // plugin namespace surfaced it.
    writeSession("s1", [
      userMarkup("/superpowers:focus"),
      userMarkup("/myplugin:go"),
    ]);
    const r = await scanTranscriptInvocations({
      projectsRoot,
      now: new Date("2026-05-10T00:00:00Z"),
      lookbackDays: 30,
    });
    expect(r.focusCommandUses).toBe(1);
    expect(r.goCommandUses).toBe(1);
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
