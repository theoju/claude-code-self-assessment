import Link from "next/link";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluatePredicate } from "@/app/lib/assessment";

export const dynamic = "force-static";
export const metadata = {
  title: "Probes — Claude Code Self-Assessment",
};

type SourceKey =
  | "settings"
  | "filesystem"
  | "plugins"
  | "transcripts"
  | "history";

interface CatalogEntry {
  source: SourceKey;
  path: string;
  description: string;
}

interface RubricAction {
  id?: string;
  action: string;
  effort?: string;
  satisfiedWhen?: string;
}

interface RubricDimension {
  id: string;
  title: string;
  nextActions?: RubricAction[];
}

interface ProbeRow {
  dimId: string;
  actionId: string;
  actionText: string;
  predicate: string;
  signal: string;
  catalog: CatalogEntry | null;
  satisfied: boolean;
  currentValue: unknown;
}

const SOURCE_META: Record<
  SourceKey,
  { title: string; blurb: string; order: number }
> = {
  settings: {
    title: "~/.claude/settings.json & CLI config",
    blurb:
      "Root-level config fields and derived booleans from hooks/permissions. Plus ~/.claude.json runtime state (MCP servers, browser/remote opt-ins).",
    order: 1,
  },
  filesystem: {
    title: "~/.claude/{agents,commands,skills,memory}",
    blurb:
      "Personal-assets filesystem scans. What exists determines what's installed.",
    order: 2,
  },
  plugins: {
    title: "Plugins & external tools",
    blurb:
      "enabledPlugins map (anchored regex match) plus PATH detection for external CLIs.",
    order: 3,
  },
  transcripts: {
    title: "Transcripts (projects/*/*.jsonl)",
    blurb:
      "Session-derived behavioral signals computed by scanning past assistant turns. Requires --include-transcripts.",
    order: 4,
  },
  history: {
    title: "Shell command history (~/.claude/history.jsonl)",
    blurb:
      "Typed slash commands recorded by Claude Code. PR #47 MAX-merges these with transcript scans because /btw is side-channel and never lands in projects/*/*.jsonl.",
    order: 5,
  },
};

function extractPrimarySignal(predicate: string): string {
  const firstAtom = predicate.split("&")[0].trim().replace(/^!/, "").trim();
  // Strip operator and RHS to get the LHS path
  const opMatch = firstAtom.match(/^([a-zA-Z_]+)/);
  return opMatch ? opMatch[1] : firstAtom;
}

function loadJson<T>(relPath: string): T {
  return JSON.parse(
    readFileSync(join(process.cwd(), "app", "data", relPath), "utf8"),
  ) as T;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    if (v.length <= 3) return `[${v.join(", ")}]`;
    return `[${v.slice(0, 2).join(", ")}, …${v.length - 2} more]`;
  }
  if (typeof v === "string") return v.length > 40 ? v.slice(0, 37) + "…" : v;
  return String(v);
}

export default function ProbesPage() {
  const rubric = loadJson<{ dimensions: RubricDimension[] }>("rubric.json");
  const assessment = loadJson<{
    capturedAt?: string;
    signalsSummary: Record<string, unknown>;
  }>("assessment.json");
  const catalogRaw =
    loadJson<Record<string, CatalogEntry | object>>("probe-catalog.json");
  const catalog: Record<string, CatalogEntry> = Object.fromEntries(
    Object.entries(catalogRaw).filter(([k]) => !k.startsWith("_")),
  ) as Record<string, CatalogEntry>;

  const sig = assessment.signalsSummary;

  // Walk every nextAction; partition into predicated (probes) vs unpredicated (coaching).
  const probes: ProbeRow[] = [];
  let coachingCount = 0;
  for (const dim of rubric.dimensions) {
    for (const a of dim.nextActions ?? []) {
      if (!a.satisfiedWhen) {
        coachingCount += 1;
        continue;
      }
      const signal = extractPrimarySignal(a.satisfiedWhen);
      probes.push({
        dimId: dim.id,
        actionId: a.id ?? signal,
        actionText: a.action,
        predicate: a.satisfiedWhen,
        signal,
        catalog: catalog[signal] ?? null,
        satisfied: evaluatePredicate(a.satisfiedWhen, sig),
        currentValue: sig[signal],
      });
    }
  }

  // Group by source category. Probes whose primary signal is missing from the
  // catalog fall into "unclassified" so the editor knows to extend the catalog.
  const groups = new Map<SourceKey | "unclassified", ProbeRow[]>();
  for (const p of probes) {
    const key: SourceKey | "unclassified" = p.catalog?.source ?? "unclassified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const orderedSources: Array<SourceKey | "unclassified"> = [
    "settings",
    "filesystem",
    "plugins",
    "transcripts",
    "history",
    "unclassified",
  ];

  const totalSat = probes.filter((p) => p.satisfied).length;
  const captured = assessment.capturedAt
    ? new Date(assessment.capturedAt)
        .toISOString()
        .slice(0, 16)
        .replace("T", " ")
    : "unknown";

  return (
    <main className="max-w-5xl mx-auto px-8 py-12 prose-invert">
      <div className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
        <Link
          href="/methodology"
          className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-accent)]"
        >
          ← Methodology
        </Link>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight mb-3">Probes</h1>
      <p className="text-sm text-[color:var(--color-mute)] mb-6 leading-relaxed">
        {probes.length} predicate-backed checks across{" "}
        {Object.keys(SOURCE_META).length} data sources. Each next-action with a{" "}
        <span className="mono">satisfiedWhen</span> predicate is a probe; the
        predicate evaluates against this run&apos;s{" "}
        <span className="mono">signalsSummary</span> snapshot. Unpredicated
        actions ({coachingCount}) are behavioral coaching that can&apos;t be
        auto-detected — they appear as priorities only when their dimension has
        score headroom.
      </p>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-10 border-y border-[color:var(--color-line)] py-3">
        <div>
          <span className="text-[color:var(--color-mute)]">
            Probes satisfied:
          </span>{" "}
          <strong className="text-[color:var(--color-good)]">
            {totalSat} / {probes.length}
          </strong>
        </div>
        <div>
          <span className="text-[color:var(--color-mute)]">Last assessed:</span>{" "}
          <span className="mono">{captured} UTC</span>
        </div>
        <div>
          <span className="text-[color:var(--color-mute)]">
            Unpredicated actions:
          </span>{" "}
          {coachingCount}
        </div>
      </div>

      {orderedSources.map((source) => {
        const rows = groups.get(source);
        if (!rows || rows.length === 0) return null;
        rows.sort((a, b) => a.signal.localeCompare(b.signal));
        const meta =
          source === "unclassified"
            ? {
                title: "Unclassified (missing from probe-catalog.json)",
                blurb:
                  "These probes weren't found in app/data/probe-catalog.json. Add an entry keyed by the signal name to populate path + description.",
              }
            : SOURCE_META[source];
        const sat = rows.filter((r) => r.satisfied).length;
        return (
          <section key={source} className="mb-12">
            <h2 className="text-lg uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-1">
              § {source === "unclassified" ? "?" : SOURCE_META[source].order} ·{" "}
              {meta.title}
            </h2>
            <p className="text-xs text-[color:var(--color-mute)] mb-3 leading-relaxed max-w-3xl">
              {meta.blurb} —{" "}
              <span className="mono">
                {sat} / {rows.length}
              </span>{" "}
              satisfied.
            </p>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="text-left text-[color:var(--color-mute)] uppercase tracking-wider">
                    <th className="py-2 pr-3 font-medium">Signal</th>
                    <th className="py-2 pr-3 font-medium">Predicate</th>
                    <th className="py-2 pr-3 font-medium">What it checks</th>
                    <th className="py-2 pr-3 font-medium">Source path</th>
                    <th className="py-2 pr-3 font-medium">Your value</th>
                    <th className="py-2 pr-3 font-medium text-center">✓</th>
                    <th className="py-2 pl-3 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={`${r.dimId}-${r.actionId}`}
                      className="border-t border-[color:var(--color-line)] align-top"
                    >
                      <td className="py-2 pr-3 mono whitespace-nowrap">
                        {r.signal}
                      </td>
                      <td className="py-2 pr-3 mono text-[color:var(--color-mute)]">
                        {r.predicate}
                      </td>
                      <td className="py-2 pr-3 leading-snug max-w-md">
                        {r.catalog?.description ?? (
                          <span className="text-[color:var(--color-warn)]">
                            no catalog entry
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 mono text-[color:var(--color-mute)] text-[11px]">
                        {r.catalog?.path ?? "—"}
                      </td>
                      <td className="py-2 pr-3 mono whitespace-nowrap">
                        {formatValue(r.currentValue)}
                      </td>
                      <td
                        className="py-2 pr-3 text-center font-semibold"
                        style={{
                          color: r.satisfied
                            ? "var(--color-good)"
                            : "var(--color-warn)",
                        }}
                      >
                        {r.satisfied ? "✓" : "✗"}
                      </td>
                      <td className="py-2 pl-3 leading-snug">
                        <Link
                          href={`/dimensions/${r.dimId}`}
                          className="text-[color:var(--color-accent)] hover:underline"
                        >
                          {r.dimId}
                        </Link>
                        <span className="text-[color:var(--color-mute)]">
                          {" — "}
                          {r.actionText.length > 90
                            ? r.actionText.slice(0, 87) + "…"
                            : r.actionText}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <div className="mt-12 text-xs text-[color:var(--color-mute)]">
        <Link
          href="/methodology"
          className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-accent)]"
        >
          ← Methodology
        </Link>
        {" · "}
        <Link
          href="/"
          className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-accent)]"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
