import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// Fail-soft JSON loader: returns null when the file is missing or unparseable.
// Loaders use this to keep page rendering working before the first
// /self-assessment run produces app/data/*.json.
export async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}
