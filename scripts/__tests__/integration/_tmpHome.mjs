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
  for (const file of spec.agents || []) {
    writeFileSync(join(root, "agents", file), "agent");
  }
  for (const file of spec.commands || []) {
    writeFileSync(join(root, "commands", file), "command");
  }
  for (const skill of spec.skills || []) {
    mkdirSync(join(root, "skills", skill), { recursive: true });
    writeFileSync(join(root, "skills", skill, "SKILL.md"), "skill");
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
    writeFileSync(join(root, "plans", `plan-${i}.md`), "plan");
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
  for (const file of spec.projectAgents || []) {
    mkdirSync(join(root, ".claude", "agents"), { recursive: true });
    writeFileSync(join(root, ".claude", "agents", file), "agent");
  }
  for (const file of spec.projectCommands || []) {
    mkdirSync(join(root, ".claude", "commands"), { recursive: true });
    writeFileSync(join(root, ".claude", "commands", file), "command");
  }
  return root;
}

export function cleanup(...paths) {
  for (const p of paths) rmSync(p, { recursive: true, force: true });
}
