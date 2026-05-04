#!/usr/bin/env node
// Reads /insights output from stdin and writes it to
// app/data/insights-narrative.md so the dashboard can render it.
//
// Usage:
//   pbpaste | npm run import-insights        # macOS clipboard
//   npm run import-insights < my-output.md   # from a file

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "app", "data", "insights-narrative.md");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const body = (await readStdin()).trim();
if (!body) {
  console.error("import-insights: empty input. Pipe /insights output into stdin.");
  process.exit(1);
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, body + "\n");
console.log(`Wrote ${body.length} chars to ${OUT}`);
console.log("Refresh the dashboard to see it rendered.");
