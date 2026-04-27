import type { Tier } from "./assessment";

export interface SummaryInput {
  id: string;
  title: string;
  score: number;
  target: number;
  tier: Tier;
  evidence: string[];
  gaps: string[];
}

/**
 * Generate a per-dimension summary from live signals + score + tier.
 *
 * Avoids the prior hardcoded prose that quietly went stale (e.g. assuming the
 * user was on 4.6 defaults). Each line below leans on actual evidence/gaps
 * pulled from the scorer, so the summary always matches what was measured.
 */
export function buildSummary(input: SummaryInput): string {
  const { id, score, target, tier, evidence, gaps } = input;
  const deficit = Math.max(0, target - score);
  const lead = leadByTier(tier, deficit);
  const ev = bestEvidence(id, evidence);
  const gap = bestGap(id, gaps);

  const parts: string[] = [lead];
  if (ev) parts.push(ev);
  if (gap) parts.push(gap);
  return parts.join(" ");
}

function leadByTier(tier: Tier, deficit: number): string {
  if (tier === "advanced") return "Dialed in.";
  if (tier === "solid") return `Solid — ${deficit} point${deficit === 1 ? "" : "s"} from target.`;
  if (tier === "developing") return `Developing — meaningful gap (${deficit} pts).`;
  if (tier === "starter") return `Starter — sizeable gap (${deficit} pts) and high leverage.`;
  return "Not yet engaged.";
}

function bestEvidence(_id: string, evidence: string[]): string | null {
  if (!evidence?.length) return null;
  // Pick the most concrete item — usually the first, but bias toward ones
  // that mention specific numbers/names.
  const ranked = [...evidence].sort(
    (a, b) => specificity(b) - specificity(a)
  );
  return `Working: ${truncate(ranked[0])}`;
}

function bestGap(_id: string, gaps: string[]): string | null {
  if (!gaps?.length) return null;
  const ranked = [...gaps].sort((a, b) => specificity(b) - specificity(a));
  return `Highest-leverage gap: ${truncate(ranked[0])}`;
}

function specificity(s: string): number {
  // More numbers, more proper nouns, more @paths = more concrete.
  let n = 0;
  if (/\d+/.test(s)) n += 2;
  if (/[A-Z][a-z]+/.test(s)) n += 1;
  if (/[/~.]/.test(s)) n += 1;
  if (/Boris tip|tip \d+/i.test(s)) n += 1;
  return n;
}

function truncate(s: string, max = 180): string {
  return s.length <= max ? s : s.slice(0, max - 1).replace(/[.,;:]?\s*$/, "") + "…";
}
