import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function claudeHome() {
  return process.env.CLAUDE_HOME || join(homedir(), ".claude");
}

export async function safeReadJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

export async function safeReaddir(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}
