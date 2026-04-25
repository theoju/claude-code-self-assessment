import RadarChart from "@/app/components/RadarChart";
import ClaudeMdHealth from "@/app/components/ClaudeMdHealth";
import {
  loadAssessment,
  computeStats,
  tierColor,
  tierLabel,
  trendGlyph,
} from "@/app/lib/assessment";

export const dynamic = "force-dynamic";

export default async function Page() {
  const assessment = await loadAssessment();
  const dims = assessment.dimensions;
  const stats = computeStats(dims);
  const sorted = [...dims].sort((a, b) => b.weight * (b.target - b.score) - a.weight * (a.target - a.score));
  const strengths = [...dims].filter((d) => d.score >= 80).sort((a, b) => b.score - a.score);
  const needsWork = [...dims].filter((d) => d.target - d.score >= 25).sort((a, b) => b.weight * (b.target - b.score) - a.weight * (a.target - a.score));
  const notTouched = dims.filter((d) => d.score < 50);
  const capturedDate = new Date(assessment.capturedAt).toISOString().slice(0, 10);
  const headerName = assessment.user ? `${assessment.user}'s` : "Your";

  return (
    <main className="max-w-[1200px] mx-auto px-8 py-12">
      <header className="mb-12 border-b border-[color:var(--color-line)] pb-8">
        <div className="flex items-baseline gap-3 text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
          <span>Claude Code Mastery</span>
          <span>·</span>
          <span>Personal Assessment</span>
          <span>·</span>
          <span className="mono">{capturedDate}</span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mb-3">
          {headerName} Claude Code execution, scored.
        </h1>
        <p className="text-[color:var(--color-mute)] max-w-3xl leading-relaxed">
          Compared against Boris Cherny's 87 workflow tips (howborisusesclaudecode.com)
          and the Claude Code Mastery rubric. Scoring is evidence-based — signals pulled from
          <span className="mono text-[color:var(--color-text)]"> ~/.claude/settings.json</span>,
          installed plugins, custom agents/commands/skills directories, and project memory.
          The Mastery share link was not publicly reachable (403); dimensions reflect the
          rubric's canonical mastery categories.
        </p>
      </header>

      <section className="grid grid-cols-12 gap-10 mb-16">
        <div className="col-span-12 md:col-span-7">
          <RadarChart dimensions={dims} />
          <div className="flex items-center gap-6 text-xs text-[color:var(--color-mute)] mt-4 justify-center">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-[color:var(--color-good)] opacity-70" /> Your score
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-0.5 bg-[color:var(--color-accent)]" /> Target
            </span>
          </div>
        </div>

        <div className="col-span-12 md:col-span-5 flex flex-col justify-center">
          <div className="mb-8">
            <div className="text-xs uppercase tracking-wider text-[color:var(--color-mute)] mb-2">
              Overall weighted score
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-7xl font-semibold tracking-tight text-[color:var(--color-accent)]">
                {assessment.overall}
              </span>
              <span className="text-xl text-[color:var(--color-mute)]">/ {assessment.targetOverall} target</span>
            </div>
            <div className="text-sm text-[color:var(--color-mute)] mt-2">
              {assessment.targetOverall - assessment.overall} points from your target profile · weighted by leverage
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-8 text-center text-xs">
            {(["advanced", "solid", "developing", "starter", "not-touched"] as const).map((t) => (
              <div key={t} className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-lg py-3">
                <div className={`text-2xl font-semibold ${tierColor(t)}`}>{stats.byTier[t]}</div>
                <div className="text-[color:var(--color-mute)] uppercase tracking-wide text-[10px] mt-1">
                  {tierLabel(t)}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-xl p-5">
            <div className="text-xs uppercase tracking-wider text-[color:var(--color-mute)] mb-3">
              Headline read
            </div>
            <p className="text-sm leading-relaxed">
              You are <span className="text-[color:var(--color-accent)] font-medium">advanced on surface-area</span>{" "}
              (25 plugins, strong memory hygiene, explanatory mode, planning discipline) but{" "}
              <span className="text-[color:var(--color-bad)] font-medium">starter on codified workflow</span>{" "}
              — zero personal hooks, commands, or agents — and carrying 4.6-era model/permission settings
              into the 4.7 era. The biggest wins are a handful of small configuration edits.
            </p>
          </div>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-lg uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-6">
          Top priority actions — highest impact × weight first
        </h2>
        <ol className="space-y-3">
          {stats.priorityActions.map((a, i) => (
            <li
              key={i}
              className="flex items-start gap-4 bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-lg p-4"
            >
              <span className="mono text-[color:var(--color-accent)] text-sm w-6 shrink-0 pt-0.5">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="flex-1">
                <div className="text-xs uppercase tracking-wider text-[color:var(--color-mute)] mb-1">
                  {a.title} · weight {a.weight} · −{a.deficit} pts gap
                </div>
                <div className="text-sm">{a.action}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {assessment.claudeMd && <ClaudeMdHealth report={assessment.claudeMd} />}

      <section className="grid md:grid-cols-3 gap-6 mb-16">
        <Panel title="Strengths — keep running these" tone="good">
          <ul className="space-y-2 text-sm">
            {strengths.map((d) => (
              <li key={d.id} className="flex items-baseline gap-2">
                <span className="mono text-xs text-[color:var(--color-mute)] w-10">{d.score}</span>
                <span>{d.title}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Needs focus — real gap, real leverage" tone="warn">
          <ul className="space-y-2 text-sm">
            {needsWork.map((d) => (
              <li key={d.id} className="flex items-baseline gap-2">
                <span className="mono text-xs text-[color:var(--color-bad)] w-10">−{d.target - d.score}</span>
                <span>{d.title}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Barely touched" tone="bad">
          <ul className="space-y-2 text-sm">
            {notTouched.map((d) => (
              <li key={d.id} className="flex items-baseline gap-2">
                <span className="mono text-xs text-[color:var(--color-mute)] w-10">{d.score}</span>
                <span>{d.title}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <section>
        <h2 className="text-lg uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-6">
          Detailed readout — 12 dimensions, sorted by leverage × gap
        </h2>
        <div className="space-y-6">
          {sorted.map((d) => (
            <article
              key={d.id}
              className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-xl p-6"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-xl font-semibold">{d.title}</h3>
                  <div className="text-xs text-[color:var(--color-mute)] mt-1">
                    Rubric: {d.rubricArea} · Boris §{d.borisTips}
                  </div>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-sm text-[color:var(--color-mute)]">weight ×{d.weight}</span>
                  <span className={`text-sm mono ${tierColor(d.tier)}`}>
                    {tierLabel(d.tier)}
                  </span>
                  <span className="text-sm text-[color:var(--color-mute)]">
                    {trendGlyph(d.trend)} {d.trend}
                  </span>
                  <span className="mono text-2xl font-semibold text-[color:var(--color-accent)]">
                    {d.score}
                  </span>
                  <span className="text-sm text-[color:var(--color-mute)]">/ {d.target}</span>
                </div>
              </header>

              <div className="relative h-2 rounded-full bg-[color:var(--color-panel-2)] mb-5">
                <div
                  className="absolute top-0 left-0 h-full rounded-full bg-[color:var(--color-good)] opacity-70"
                  style={{ width: `${d.score}%` }}
                />
                <div
                  className="absolute top-0 h-full w-0.5 bg-[color:var(--color-accent)]"
                  style={{ left: `${d.target}%` }}
                  title={`target ${d.target}`}
                />
              </div>

              <p className="text-sm text-[color:var(--color-text)] leading-relaxed mb-5">
                {d.summary}
              </p>

              <div className="grid md:grid-cols-3 gap-5 text-sm">
                <Column label="Evidence observed">
                  {d.evidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </Column>
                <Column label="Gaps">
                  {d.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </Column>
                <Column label="Next actions">
                  {d.nextActions.map((a, i) => (
                    <li key={i} className="text-[color:var(--color-text)]">{a}</li>
                  ))}
                </Column>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="mt-16 pt-6 border-t border-[color:var(--color-line)] text-xs text-[color:var(--color-mute)]">
        <p>
          Scoring methodology: each dimension is weighted 1–3 by leverage (how much it compounds daily
          work per Boris's own ranking). Overall score is a weight-normalized mean. Gaps are target − score;
          priority actions are sorted by weight × gap. Trends marked <span className="mono">✦ new</span> reflect
          features shipped in April 2026 (Opus 4.7 family).
        </p>
      </footer>
    </main>
  );
}

function Panel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const toneColor =
    tone === "good"
      ? "var(--color-good)"
      : tone === "warn"
      ? "var(--color-warn)"
      : "var(--color-bad)";
  return (
    <div
      className="bg-[color:var(--color-panel)] border rounded-xl p-5"
      style={{ borderColor: toneColor + "40" }}
    >
      <div
        className="text-xs uppercase tracking-wider mb-4"
        style={{ color: toneColor }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function Column({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-mute)] mb-2">
        {label}
      </div>
      <ul className="list-disc list-outside ml-4 space-y-1.5 text-[color:var(--color-mute)]">
        {children}
      </ul>
    </div>
  );
}
