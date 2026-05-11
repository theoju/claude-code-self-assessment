import { notFound } from "next/navigation";
import {
  loadAssessment,
  tierColor,
  tierLabel,
  trendGlyph,
} from "@/app/lib/assessment";
import { explainerFor, plusTenPath } from "@/app/lib/dimension-explainer";
import PageNav from "@/app/components/PageNav";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const assessment = await loadAssessment();
  const dim = assessment.dimensions.find((d) => d.id === id);
  if (!dim) return { title: "Dimension not found" };
  return { title: `${dim.title} — Self-Assessment dashboard` };
}

export default async function DimensionPage({ params }: Props) {
  const { id } = await params;
  const assessment = await loadAssessment();
  const dim = assessment.dimensions.find((d) => d.id === id);
  if (!dim) notFound();

  const explainer = explainerFor(id);
  const path = plusTenPath(dim);
  const deficit = Math.max(0, dim.target - dim.score);
  const hasExecution = dim.executionScore !== null;

  return (
    <main className="max-w-[1200px] mx-auto px-8 py-12">
      <PageNav
        current="dimension"
        context={{ label: dim.title, parentKey: "dashboard" }}
      />

      <header className="mb-12 border-b border-[color:var(--color-line)] pb-8">
        <div className="flex items-baseline gap-3 text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
          <span>Dimension</span>
          <span>·</span>
          <span className="mono">weight ×{dim.weight}</span>
          <span>·</span>
          <span className={`mono ${tierColor(dim.tier)}`}>
            {tierLabel(dim.tier)}
          </span>
          <span>·</span>
          <span className="mono">
            {trendGlyph(dim.trend)} {dim.trend}
          </span>
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mb-4">
          {dim.title}
        </h1>
        <div className="flex items-baseline gap-4 flex-wrap">
          <span className="mono text-5xl font-semibold text-[color:var(--color-accent)]">
            {dim.score}
          </span>
          <span className="text-lg text-[color:var(--color-mute)]">
            / {dim.target} workshop · {deficit} pts to go
          </span>
          {hasExecution ? (
            <span className="mono text-sm text-[color:var(--color-mute)]">
              · execution {dim.executionScore} / {dim.target}
            </span>
          ) : null}
        </div>
        {explainer ? (
          <p className="text-[color:var(--color-mute)] max-w-3xl leading-relaxed mt-4">
            {explainer.what}
          </p>
        ) : null}
        {dim.gapReason ? (
          <p className="text-sm text-[color:var(--color-mute)] mt-3 italic">
            Gap: {dim.gapReason}
          </p>
        ) : null}
      </header>
      <div className="max-w-3xl">
        {explainer ? (
          <section className="mb-10">
            <h2 className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
              Workshop formula
            </h2>
            <div className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-xl p-5">
              <div className="text-sm mb-3">
                <span className="mono text-[color:var(--color-accent)]">
                  base {explainer.base}
                </span>{" "}
                <span className="text-[color:var(--color-mute)]">
                  + contributions below, clamped to 0–100, then normalized to
                  target.
                </span>
              </div>
              <ul className="space-y-2 text-sm">
                {explainer.formula.map((t, i) => (
                  <li key={i} className="flex items-baseline gap-3">
                    <span className="mono text-xs text-[color:var(--color-mute)] w-16 shrink-0">
                      +{t.max} max
                    </span>
                    <span>
                      <span className="text-[color:var(--color-text)] font-medium">
                        {t.label}
                      </span>
                      <span className="text-[color:var(--color-mute)]">
                        {" "}
                        — {t.contributes}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section className="grid md:grid-cols-2 gap-5 mb-10">
          <div>
            <h2 className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
              Workshop signals
            </h2>
            {dim.evidence.length ? (
              <ul className="list-disc list-outside ml-4 space-y-1.5 text-sm text-[color:var(--color-text)]">
                {dim.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[color:var(--color-mute)]">
                No positive workshop signals for this dimension yet.
              </p>
            )}
          </div>
          <div>
            <h2 className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
              Workshop gaps
            </h2>
            {dim.gaps.length ? (
              <ul className="list-disc list-outside ml-4 space-y-1.5 text-sm text-[color:var(--color-bad)]">
                {dim.gaps.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[color:var(--color-mute)]">
                No outstanding gaps.
              </p>
            )}
          </div>
        </section>

        {hasExecution ? (
          <section className="grid md:grid-cols-2 gap-5 mb-10">
            <div>
              <h2 className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
                Execution evidence
              </h2>
              {dim.executionEvidence.length ? (
                <ul className="list-disc list-outside ml-4 space-y-1.5 text-sm text-[color:var(--color-text)]">
                  {dim.executionEvidence.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[color:var(--color-mute)]">
                  No execution evidence captured.
                </p>
              )}
            </div>
            <div>
              <h2 className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
                Execution gaps
              </h2>
              {dim.executionGaps.length ? (
                <ul className="list-disc list-outside ml-4 space-y-1.5 text-sm text-[color:var(--color-bad)]">
                  {dim.executionGaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[color:var(--color-mute)]">
                  No execution gaps recorded.
                </p>
              )}
            </div>
          </section>
        ) : null}

        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
            What would move you +10
          </h2>
          {path ? (
            <div className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-xl p-5">
              <div className="text-sm font-medium text-[color:var(--color-text)] mb-1">
                {path.step}
              </div>
              <div className="text-xs text-[color:var(--color-mute)]">
                {path.rationale}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[color:var(--color-mute)]">
              No next-action recorded for this dimension. Add one in{" "}
              <span className="mono text-[color:var(--color-text)]">
                app/data/rubric.json
              </span>
              .
            </p>
          )}
        </section>

        <section className="mb-10">
          <h2 className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
            All next actions for this dimension
          </h2>
          <ul className="space-y-2 text-sm">
            {dim.nextActions.map((a) => (
              <li
                key={a.id}
                className={`bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-lg p-3 flex items-baseline gap-3 ${a.satisfied ? "opacity-60" : ""}`}
              >
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[color:var(--color-panel-2)] border border-[color:var(--color-line)] shrink-0">
                  {a.effort}
                </span>
                <span className={`flex-1 ${a.satisfied ? "line-through" : ""}`}>
                  {a.action}
                </span>
                {a.satisfied ? (
                  <span
                    className="text-[10px] mono text-[color:var(--color-good)] shrink-0"
                    title={
                      a.satisfiedWhen
                        ? `Satisfied: ${a.satisfiedWhen}`
                        : "Already done"
                    }
                  >
                    ✓ done
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
