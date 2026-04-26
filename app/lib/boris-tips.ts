import indexJson from "@/app/data/boris-tip-index.json";

export interface BorisTipEntry {
  topic: string;
  volume: number;
  tab: number;
  label: string;
}

const SITE = (indexJson as { site: string }).site;
const TIPS = (indexJson as { tips: Record<string, BorisTipEntry> }).tips;

export interface BorisTipLink {
  n: number;
  /** Internal dashboard URL — renders the tip content from the local snapshot. */
  url: string;
  /** Upstream homepage. The site has no per-tip URLs (verified Apr 2026). */
  externalUrl: string;
  topic: string;
  /** Manual navigation hint, e.g. "Vol 1 → hooks". */
  where: string;
  /** True if `n` was unknown — caller may want to render plain text. */
  unknown: boolean;
}

export function borisTipLink(n: number): BorisTipLink {
  const e = TIPS[String(n)];
  if (!e) {
    return {
      n,
      url: SITE,
      externalUrl: SITE,
      topic: `tip ${n}`,
      where: SITE.replace(/^https?:\/\//, ""),
      unknown: true,
    };
  }
  return {
    n,
    url: `/tips/${n}`,
    externalUrl: SITE,
    topic: e.topic,
    where: `Vol ${e.volume} → ${e.label}`,
    unknown: false,
  };
}

/** Parse a comma-separated tip list (the rubric's `borisTips` field). */
export function parseBorisTipList(csv: string): BorisTipLink[] {
  return csv
    .split(/\s*,\s*/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
    .map(borisTipLink);
}
