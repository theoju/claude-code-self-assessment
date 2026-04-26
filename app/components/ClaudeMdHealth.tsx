import type {
  ClaudeMdReport,
  ClaudeMdRun,
  ClaudeMdSummary,
  Grade,
} from "@/app/lib/assessment";
import { CRITERIA, gradeColor } from "@/app/lib/assessment";

const GRADE_ORDER: Grade[] = ["A", "B", "C", "D", "F"];

export default function ClaudeMdHealth({ report }: { report: ClaudeMdReport }) {
  const { summary, runs, auditedAt } = report;
  const auditedDate = new Date(auditedAt).toISOString().slice(0, 10);
  const totalGraded = GRADE_ORDER.reduce(
    (a, g) => a + (summary.distribution[g] || 0),
    0
  );

  return (
    <section className="mb-16">
      <header className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <h2 className="text-lg uppercase tracking-[0.15em] text-[color:var(--color-mute)]">
          CLAUDE.md health
        </h2>
        <span className="text-xs text-[color:var(--color-mute)]">
          report-only · audited {auditedDate}
        </span>
      </header>

      <div className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-xl p-6">
        {/* Aggregate — same shape as the Slack/console summary. Safe to share. */}
        <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start mb-6">
          <div className="flex items-baseline gap-3">
            {summary.avgScore == null ? (
              <span className="text-3xl text-[color:var(--color-mute)]">—</span>
            ) : (
              <>
                <span
                  className={`text-5xl font-semibold tracking-tight ${gradeColor(summary.avgGrade)}`}
                >
                  {summary.avgScore}
                </span>
                <span
                  className={`text-2xl mono ${gradeColor(summary.avgGrade)}`}
                >
                  {summary.avgGrade}
                </span>
              </>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <Stat label="Targets" value={summary.targets} />
              <Stat label="Files" value={summary.files} />
              {summary.targetsMissing > 0 && (
                <Stat
                  label="No CLAUDE.md"
                  value={summary.targetsMissing}
                  tone="warn"
                />
              )}
              {summary.targetsError > 0 && (
                <Stat
                  label="Errors"
                  value={summary.targetsError}
                  tone="bad"
                />
              )}
            </div>

            {totalGraded > 0 && (
              <GradeDistribution
                distribution={summary.distribution}
                total={totalGraded}
              />
            )}
          </div>
        </div>

        {summary.avgBreakdown && summary.files > 0 && (
          <CriterionBreakdown summary={summary} />
        )}

        <p className="text-xs text-[color:var(--color-mute)] leading-relaxed border-t border-[color:var(--color-line)] pt-4 mt-4">
          The numbers above are the only thing posted to Slack — no project
          names, paths, or per-file issues. The per-target list below is
          local-only.
        </p>

        {/* Per-target detail — local only. Collapsed by default. */}
        {runs.length > 0 && (
          <details className="mt-4 group">
            <summary className="cursor-pointer text-xs uppercase tracking-wider text-[color:var(--color-mute)] hover:text-[color:var(--color-text)] transition select-none">
              <span className="mono mr-2 group-open:rotate-90 inline-block transition-transform">
                ▸
              </span>
              Per-target detail ({runs.length})
            </summary>
            <ul className="mt-4 space-y-2">
              {runs.map((r, i) => (
                <RunRow key={`${r.name}-${i}`} run={r} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "bad";
}) {
  const valueColor =
    tone === "bad"
      ? "text-[color:var(--color-bad)]"
      : tone === "warn"
        ? "text-[color:var(--color-warn)]"
        : "text-[color:var(--color-text)]";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`mono font-medium ${valueColor}`}>{value}</span>
      <span className="text-xs uppercase tracking-wider text-[color:var(--color-mute)]">
        {label}
      </span>
    </span>
  );
}

function CriterionBreakdown({ summary }: { summary: ClaudeMdSummary }) {
  if (!summary.avgBreakdown) return null;
  const filesLabel = summary.files === 1 ? "1 file" : `${summary.files} files`;
  return (
    <div className="border-t border-[color:var(--color-line)] pt-4 mt-4">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h3 className="text-xs uppercase tracking-wider text-[color:var(--color-mute)]">
          Criterion breakdown
        </h3>
        <span className="text-[10px] text-[color:var(--color-mute)]">
          avg across {filesLabel}
        </span>
      </div>
      <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {CRITERIA.map((c) => {
          const v = summary.avgBreakdown![c.key];
          const pct = (v / c.max) * 100;
          const tone = criterionTone(v, c.max);
          return (
            <li key={c.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <span className="text-[color:var(--color-text)]">{c.label}</span>
                <span className={`mono text-xs ${tone.text}`}>
                  {v}/{c.max}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[color:var(--color-panel-2)] overflow-hidden">
                <div
                  className={`h-full ${tone.bar} opacity-80`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function criterionTone(v: number, max: number): { text: string; bar: string } {
  const ratio = v / max;
  if (ratio >= 0.9) return { text: "text-[color:var(--color-good)]", bar: "bg-[color:var(--color-good)]" };
  if (ratio >= 0.7) return { text: "text-[color:var(--color-accent)]", bar: "bg-[color:var(--color-accent)]" };
  if (ratio >= 0.5) return { text: "text-[color:var(--color-warn)]", bar: "bg-[color:var(--color-warn)]" };
  return { text: "text-[color:var(--color-bad)]", bar: "bg-[color:var(--color-bad)]" };
}

function GradeDistribution({
  distribution,
  total,
}: {
  distribution: Record<Grade, number>;
  total: number;
}) {
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-[color:var(--color-panel-2)]">
        {GRADE_ORDER.map((g) => {
          const count = distribution[g] || 0;
          if (count === 0) return null;
          const pct = (count / total) * 100;
          return (
            <div
              key={g}
              className={gradeBarColor(g)}
              style={{ width: `${pct}%` }}
              title={`${g}: ${count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
        {GRADE_ORDER.map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-sm ${gradeBarColor(g)}`}
              aria-hidden
            />
            <span className={`mono ${gradeColor(g)}`}>{g}</span>
            <span className="text-[color:var(--color-mute)]">
              {distribution[g] || 0}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function gradeBarColor(grade: Grade): string {
  switch (grade) {
    case "A":
      return "bg-[color:var(--color-good)]";
    case "B":
      return "bg-[color:var(--color-accent)]";
    case "C":
      return "bg-[color:var(--color-warn)]";
    case "D":
    case "F":
      return "bg-[color:var(--color-bad)]";
  }
}

function RunRow({ run }: { run: ClaudeMdRun }) {
  if (run.error) {
    return (
      <li className="flex items-baseline justify-between gap-3 py-2 px-3 rounded-md bg-[color:var(--color-panel-2)] text-sm">
        <span className="font-medium">{run.name}</span>
        <span className="text-xs text-[color:var(--color-bad)] mono">
          {run.error}
        </span>
      </li>
    );
  }
  if (run.missing) {
    return (
      <li className="flex items-baseline justify-between gap-3 py-2 px-3 rounded-md bg-[color:var(--color-panel-2)] text-sm">
        <span className="font-medium">{run.name}</span>
        <span className="text-xs text-[color:var(--color-warn)]">
          no CLAUDE.md found
        </span>
      </li>
    );
  }
  return (
    <li className="rounded-md bg-[color:var(--color-panel-2)] text-sm">
      <details className="group">
        <summary className="flex items-baseline justify-between gap-3 py-2 px-3 cursor-pointer select-none">
          <span className="inline-flex items-baseline gap-2">
            <span className="mono text-[color:var(--color-mute)] text-xs group-open:rotate-90 inline-block transition-transform">
              ▸
            </span>
            <span className="font-medium">{run.name}</span>
            <span className="text-xs text-[color:var(--color-mute)]">
              {run.files.length} file{run.files.length === 1 ? "" : "s"}
            </span>
          </span>
          <span className="inline-flex items-baseline gap-2">
            <span className={`mono font-medium ${gradeColor(run.grade)}`}>
              {run.score}
            </span>
            <span className={`mono text-xs ${gradeColor(run.grade)}`}>
              {run.grade}
            </span>
          </span>
        </summary>
        <ul className="space-y-2 px-3 pb-3 pt-1">
          {run.files.map((f, i) => (
            <li
              key={`${f.path}-${i}`}
              className="border-l-2 border-[color:var(--color-line)] pl-3 py-1"
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="mono text-xs">{f.path}</span>
                <span className="inline-flex items-baseline gap-2">
                  <span className={`mono text-xs ${gradeColor(f.grade)}`}>
                    {f.score} ({f.grade})
                  </span>
                  <span className="text-[10px] text-[color:var(--color-mute)]">
                    {f.lineCount} lines · {f.ageDays}d old
                  </span>
                </span>
              </div>
              {f.issues.length > 0 && (
                <ul className="text-xs text-[color:var(--color-mute)] space-y-0.5 mt-1">
                  {f.issues.map((issue, j) => (
                    <li key={j}>· {issue}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
