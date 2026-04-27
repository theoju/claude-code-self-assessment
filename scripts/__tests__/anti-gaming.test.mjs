import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gatherSignals } from "../signals.mjs";
import { scoreAll } from "../score.mjs";
import { readFile } from "node:fs/promises";

let tmpHome;
let tmpProject;
let originalHome;
let rubric;

beforeAll(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), "claude-home-"));
  tmpProject = await mkdtemp(join(tmpdir(), "proj-"));
  originalHome = process.env.CLAUDE_HOME;
  process.env.CLAUDE_HOME = tmpHome;

  // Simulate the 12-attack list against an empty profile:
  //  - 4 empty hook files (will be detected, but hookFires stays 0 once
  //    behavior is on — gated)
  //  - 4 empty agent stubs (heading-only files)
  //  - 4 empty command stubs
  //  - 4 empty skill dirs
  //  - 25 enabled plugins (none invoked → gated)
  //  - 50 empty plan files
  //  - empty CLAUDE.md
  //  - 10 wildcard allowlist entries
  await writeFile(
    join(tmpHome, "settings.json"),
    JSON.stringify({
      effortLevel: "xhigh",
      skipDangerousModePermissionPrompt: false,
      permissions: {
        allow: Array.from({ length: 10 }, (_, i) => `Bash(echo${i}*)`),
      },
      hooks: {
        PostToolUse: [{ matcher: "X", hooks: [{ type: "command", command: "true" }] }],
        Stop: [{ hooks: [{ type: "command", command: "true" }] }],
        SessionStart: [{ hooks: [{ type: "command", command: "true" }] }],
        PostCompact: [{ hooks: [{ type: "command", command: "true" }] }],
      },
      enabledPlugins: Object.fromEntries(
        Array.from({ length: 25 }, (_, i) => [`plugin-${i}@1`, true]),
      ),
    }),
  );

  for (const [dir, names] of [
    ["agents", ["a.md", "b.md", "c.md", "d.md"]],
    ["commands", ["c1.md", "c2.md", "c3.md", "c4.md"]],
  ]) {
    const d = join(tmpHome, dir);
    await mkdir(d, { recursive: true });
    for (const n of names) {
      // Heading-only stub — no body, no action verbs.
      await writeFile(join(d, n), "# Stub\n## Subhead\n");
    }
  }
  // Empty skill dirs: 4 directories, no markdown content.
  const skillsDir = join(tmpHome, "skills");
  await mkdir(skillsDir, { recursive: true });
  for (const s of ["s1", "s2", "s3", "s4"]) {
    await mkdir(join(skillsDir, s));
    await writeFile(join(skillsDir, s, "SKILL.md"), "# Skill\n");
  }
  // 50 empty plan files
  const plansDir = join(tmpHome, "plans");
  await mkdir(plansDir, { recursive: true });
  for (let i = 0; i < 50; i++) {
    await writeFile(join(plansDir, `plan-${i}.md`), "# Plan\n");
  }

  // Read rubric for scoreAll.
  rubric = JSON.parse(
    await readFile(new URL("../../app/data/rubric.json", import.meta.url), "utf8"),
  );
});

afterAll(async () => {
  if (originalHome === undefined) delete process.env.CLAUDE_HOME;
  else process.env.CLAUDE_HOME = originalHome;
  await rm(tmpHome, { recursive: true, force: true });
  await rm(tmpProject, { recursive: true, force: true });
});

describe("anti-gaming attack list", () => {
  it("a fully-faked profile (empty stubs + plugin spray) ceiling stays under 'solid'", async () => {
    const signals = await gatherSignals(tmpProject);
    // Empty stubs filtered out by isSubstantive.
    expect(signals.personalAgents).toHaveLength(0);
    expect(signals.personalCommands).toHaveLength(0);
    expect(signals.personalSkills).toHaveLength(0);
    expect(signals.plansCount).toBe(0);
    // Raw counts still visible for diagnostics.
    expect(signals.raw.personalAgents).toHaveLength(4);
    expect(signals.raw.plansCount).toBe(50);

    // Turn on behavioral gating with no transcripts → plugins gated to 5,
    // hooks counted as silent (only baseline credit).
    signals.behavior = {
      transcriptsEnabled: true,
      sessions: 0,
      toolCounts: {},
      agentDispatches: 0,
      planModeRate: 0,
      shipVerifyRate: 0,
      shipSessions: 0,
      multiFileSessions: 0,
      multiFilePlanRate: 0,
      autoModeLongSessions: 0,
      bypassPermSessions: 0,
      hookFires: 0,
    };
    const scored = scoreAll(rubric, signals);

    // Ceiling sanity: every dimension stays under "solid" (< 70) or stays
    // capped where its baseline allows. The crucial ones from the attack list:
    const get = (id) => scored.scores.find((s) => s.id === id).score;
    expect(get("automation")).toBeLessThan(55); // 4 empty hooks + 0 fires + 0 substantive = baseline 25 + 5
    expect(get("integrations")).toBeLessThan(70); // 25 plugins gated to 5 active
    expect(get("memory")).toBeLessThan(70); // empty plans don't credit
    expect(get("scheduled")).toBeLessThan(70); // no real loop commands
    // Overall: must NOT reach the "solid" tier (overall ≥ 70).
    expect(scored.overall).toBeLessThan(70);
  });
});
