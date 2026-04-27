#!/usr/bin/env node
// Install the hook-journal script at ~/.claude/hooks/journal.sh and print the
// settings.json snippet to wire it up. Idempotent: re-running just refreshes
// the file. Never edits settings.json automatically — that's a manual step.

import { copyFile, mkdir, chmod } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "templates", "journal-hook.sh");
const HOME = process.env.CLAUDE_HOME || join(homedir(), ".claude");
const HOOKS_DIR = join(HOME, "hooks");
const DEST = join(HOOKS_DIR, "journal.sh");

async function main() {
  if (!existsSync(SRC)) {
    console.error(`Template missing: ${SRC}`);
    process.exit(1);
  }
  await mkdir(HOOKS_DIR, { recursive: true });
  await copyFile(SRC, DEST);
  await chmod(DEST, 0o755);
  console.log(`Installed: ${DEST}`);
  console.log(`Now add this to ${join(HOME, "settings.json")}#hooks (merge with existing):`);
  console.log(JSON.stringify(
    {
      hooks: {
        PostToolUse: [
          {
            matcher: "Write|Edit",
            hooks: [{ type: "command", command: `${DEST} PostToolUse Write|Edit` }],
          },
        ],
        Stop: [{ hooks: [{ type: "command", command: `${DEST} Stop` }] }],
      },
    },
    null,
    2,
  ));
  console.log(`\nFires are written to ${join(HOME, "hook-fires.jsonl")} and counted by /self-assessment when scoring.includeTranscripts is true.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
