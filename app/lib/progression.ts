import { join } from "node:path";
import { readJson } from "./_read-json";

export interface Milestone {
  timestamp: string;
  dimension: string;
  milestone: string;
  borisTip: number;
  evidence: string;
  sessionId: string;
}

export interface Progression {
  capturedAt: string;
  lookbackDays: number | null;
  sessionsWalked: number;
  transcriptsScanned: boolean;
  milestones: Milestone[];
}

const PROGRESSION_PATH = join(process.cwd(), "app", "data", "progression.json");

export function loadProgression(): Promise<Progression | null> {
  return readJson<Progression>(PROGRESSION_PATH);
}
