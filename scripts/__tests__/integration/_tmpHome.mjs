// Build a fake ~/.claude tree in a tmp dir for integration tests.
// Each helper returns the absolute path so the test can clean up after.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function makeTmpClaudeHome(spec = {}) {
  const root = mkdtempSync(join(tmpdir(), "claude-home-"));
  // Always create the directory structure even if empty so safeReaddir returns []
  for (const dir of ["agents", "commands", "skills", "plans", "sessions", "projects"]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  if (spec.settings !== undefined) {
    writeFileSync(join(root, "settings.json"), JSON.stringify(spec.settings, null, 2));
  }
  // Substantive fixture bodies: signals.mjs filters out files <50 chars or
  // without an action verb. Each body below clears both bars so the fixture
  // matches what real personal agents/commands/skills/plans look like.
  const AGENT_BODY =
    "Use this agent to verify the application before ship. Run tests and check the result.";
  const COMMAND_BODY =
    "Run the deploy pipeline. Verify outputs and review the diff before pushing.";
  const SKILL_BODY =
    "Use this skill to generate the daily summary. Read inputs, write the report, and commit.";
  const PLAN_BODY =
    "Run migration on staging first. Verify results, then deploy to prod and update the runbook.";
  for (const file of spec.agents || []) {
    writeFileSync(join(root, "agents", file), AGENT_BODY);
  }
  for (const file of spec.commands || []) {
    writeFileSync(join(root, "commands", file), COMMAND_BODY);
  }
  for (const skill of spec.skills || []) {
    mkdirSync(join(root, "skills", skill), { recursive: true });
    writeFileSync(join(root, "skills", skill, "SKILL.md"), SKILL_BODY);
  }
  for (const project of spec.projectsWithMemory || []) {
    const memDir = join(root, "projects", project, "memory");
    mkdirSync(memDir, { recursive: true });
    writeFileSync(join(memDir, "notes.md"), "remember this");
  }
  if (spec.statusline) writeFileSync(join(root, "statusline.sh"), "#!/bin/bash\necho hi");
  if (spec.keybindings) writeFileSync(join(root, "keybindings.json"), "{}");
  if (spec.claudeMd) writeFileSync(join(root, "CLAUDE.md"), "# global rules");

  for (let i = 0; i < (spec.plans || 0); i++) {
    writeFileSync(join(root, "plans", `plan-${i}.md`), PLAN_BODY);
  }

  if (spec.usageData) {
    const sessionDir = join(root, "usage-data", "session-meta");
    const facetsDir = join(root, "usage-data", "facets");
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(facetsDir, { recursive: true });
    for (const s of spec.usageData.sessions || []) {
      writeFileSync(
        join(sessionDir, `${s.id}.json`),
        JSON.stringify({ session_id: s.id, ...s.meta }),
      );
      if (s.facet) {
        writeFileSync(
          join(facetsDir, `${s.id}.json`),
          JSON.stringify({ session_id: s.id, ...s.facet }),
        );
      }
    }
    if (spec.usageData.hookFires) {
      writeFileSync(
        join(root, "hook-fires.jsonl"),
        spec.usageData.hookFires.map((f) => JSON.stringify(f)).join("\n"),
      );
    }
  }

  return root;
}

export function makeTmpProjectRoot(spec = {}) {
  const root = mkdtempSync(join(tmpdir(), "claude-project-"));
  if (spec.claudeMd) writeFileSync(join(root, "CLAUDE.md"), "# project rules");
  if (spec.projectSettings !== undefined) {
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "settings.local.json"),
      JSON.stringify(spec.projectSettings, null, 2),
    );
  }
  const PROJECT_AGENT_BODY =
    "Use this agent to verify the application before ship. Run tests and check the result.";
  const PROJECT_COMMAND_BODY =
    "Run the deploy pipeline. Verify outputs and review the diff before pushing.";
  for (const file of spec.projectAgents || []) {
    mkdirSync(join(root, ".claude", "agents"), { recursive: true });
    writeFileSync(join(root, ".claude", "agents", file), PROJECT_AGENT_BODY);
  }
  for (const file of spec.projectCommands || []) {
    mkdirSync(join(root, ".claude", "commands"), { recursive: true });
    writeFileSync(join(root, ".claude", "commands", file), PROJECT_COMMAND_BODY);
  }
  return root;
}

export function cleanup(...paths) {
  for (const p of paths) rmSync(p, { recursive: true, force: true });
}
