// Boris tip index — Node-side helpers for scripts (mirrors app/lib/boris-tips.ts).
// Internal URL: dashboard /tips/N (renders the tip content from the local snapshot).
// External URL: howborisusesclaudecode.com homepage (no per-tip URL exists upstream).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const INDEX = JSON.parse(
  readFileSync(join(HERE, "..", "app", "data", "boris-tip-index.json"), "utf8")
);

const SITE = INDEX.site;
const TIPS = INDEX.tips;

export function borisTipLink(n) {
  const e = TIPS[String(n)];
  if (!e) {
    return {
      n,
      url: `/tips/${n}`,
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

export function parseBorisTipList(csv) {
  return (csv || "")
    .split(/\s*,\s*/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
    .map(borisTipLink);
}

/**
 * Render a CSV tip list as Slack mrkdwn. Each link points at the local
 * dashboard's per-tip page so clicking actually shows the tip content
 * (the upstream site has no per-tip URLs).
 */
export function formatTipsForSlack(csv, dashboardBaseUrl) {
  const tips = parseBorisTipList(csv);
  if (tips.length === 0) return "";
  const base = (dashboardBaseUrl || "").replace(/\/$/, "");
  return tips.map((t) => `<${base}${t.url}|§${t.n}>`).join(" ");
}
