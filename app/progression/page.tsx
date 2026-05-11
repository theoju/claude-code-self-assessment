import PageNav from "@/app/components/PageNav";
import ProgressionTimeline from "@/app/components/ProgressionTimeline";
import { loadProgression } from "@/app/lib/progression";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Progression — Claude Code Self-Assessment",
};

export default async function ProgressionPage() {
  const progression = await loadProgression();
  const captured = progression?.capturedAt
    ? new Date(progression.capturedAt).toISOString().slice(0, 10)
    : null;
  const milestoneCount = progression?.milestones?.length ?? 0;
  const sessionsWalked = progression?.sessionsWalked ?? 0;
  const lookback =
    progression?.lookbackDays != null
      ? `${progression.lookbackDays} days`
      : "full history";

  return (
    <main className="max-w-[1200px] mx-auto px-8 py-12">
      <PageNav current="progression" />
      <header className="mb-12 border-b border-[color:var(--color-line)] pb-8">
        <div className="flex items-baseline gap-3 text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
          <span>Claude Code Self-Assessment</span>
          <span>·</span>
          <span>Progression</span>
          {progression && (
            <>
              <span>·</span>
              <span className="mono">
                {milestoneCount} milestone{milestoneCount === 1 ? "" : "s"} ·{" "}
                {sessionsWalked} sessions walked · lookback {lookback}
              </span>
            </>
          )}
          {captured && (
            <>
              <span>·</span>
              <span className="mono">{captured}</span>
            </>
          )}
        </div>
        <h1 className="text-4xl font-semibold tracking-tight mb-3">
          Milestones from your /insights history.
        </h1>
        <p className="text-[color:var(--color-mute)] max-w-3xl leading-relaxed">
          A timeline of &quot;first&quot; events detected by walking session
          metadata in{" "}
          <span className="mono text-[color:var(--color-text)]">
            ~/.claude/usage-data
          </span>{" "}
          and (when transcripts are opted in) the raw{" "}
          <span className="mono text-[color:var(--color-text)]">
            ~/.claude/projects/*/*.jsonl
          </span>{" "}
          files. Each milestone maps to a dimension in the rubric and the Boris
          tip that motivates it.
        </p>
      </header>

      {progression ? (
        <>
          <ProgressionTimeline progression={progression} />
          {!progression.transcriptsScanned && (
            <p className="text-xs text-[color:var(--color-mute)] mt-6 max-w-3xl">
              Transcript-derived milestones (auto/plan mode adoption, worktrees,
              skills) are skipped — set{" "}
              <span className="mono text-[color:var(--color-text)]">
                scoring.includeTranscripts
              </span>{" "}
              to{" "}
              <span className="mono text-[color:var(--color-text)]">true</span>{" "}
              in{" "}
              <span className="mono text-[color:var(--color-text)]">
                assessment.config.json
              </span>{" "}
              to enable.
            </p>
          )}
        </>
      ) : (
        <div className="bg-[color:var(--color-panel)] border border-dashed border-[color:var(--color-line)] rounded-xl p-6 text-sm text-[color:var(--color-mute)] leading-relaxed max-w-3xl">
          No progression data yet. Run{" "}
          <span className="mono text-[color:var(--color-text)]">
            npm run assess
          </span>{" "}
          to scan{" "}
          <span className="mono text-[color:var(--color-text)]">
            ~/.claude/usage-data
          </span>{" "}
          for milestone events.
        </div>
      )}
    </main>
  );
}
