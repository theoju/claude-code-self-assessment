import Link from "next/link";
import { renderMarkdown } from "@/app/lib/boris-content";
import type {
  InsightsNarrative,
  InsightsReportFile,
} from "@/app/lib/insights-narrative";

interface Props {
  narrative: InsightsNarrative | null;
  reportFile: InsightsReportFile | null;
}

const REPORT_BUTTON_CLASS =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[color:var(--color-accent)] text-[color:var(--color-bg)] text-xs font-medium hover:opacity-90 transition-opacity";

function ReportButton({ reportFile }: { reportFile: InsightsReportFile }) {
  const date = reportFile.capturedAt.slice(0, 10);
  const kb = (reportFile.byteSize / 1024).toFixed(0);
  return (
    <a
      href="/api/insights-report"
      target="_blank"
      rel="noreferrer"
      className={REPORT_BUTTON_CLASS}
    >
      Open Claude&apos;s full /insights report ↗
      <span className="opacity-70">
        · {date} · {kb} KB
      </span>
    </a>
  );
}

export default function InsightsNarrativeSection({
  narrative,
  reportFile,
}: Props) {
  if (!narrative && !reportFile) return <InsightsNarrativeEmpty />;

  return (
    <section className="mb-16">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg uppercase tracking-[0.15em] text-[color:var(--color-mute)]">
          From <span className="mono">/insights</span>
        </h2>
        {reportFile && <ReportButton reportFile={reportFile} />}
      </div>

      {narrative && (
        <>
          <div className="text-xs text-[color:var(--color-mute)] mono mb-2">
            captured narrative · imported {narrative.capturedAt.slice(0, 10)}
          </div>
          <div
            className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-xl p-6 text-sm leading-relaxed max-h-[24rem] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[color:var(--color-line)] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[color:var(--color-mute)] [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_p]:my-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2 [&_code]:mono [&_code]:text-[color:var(--color-accent)] [&_pre]:bg-[color:var(--color-panel-2)] [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-3 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2"
            style={{
              scrollbarColor: "var(--color-line) transparent",
              scrollbarWidth: "thin",
            }}
          >
            {renderMarkdown(narrative.body)}
          </div>
        </>
      )}

      {!narrative && reportFile && (
        <div className="bg-[color:var(--color-panel)] border border-dashed border-[color:var(--color-line)] rounded-xl p-5 text-sm text-[color:var(--color-mute)] leading-relaxed">
          Claude&apos;s full HTML report is on your disk from your last{" "}
          <span className="mono">/insights</span> run on{" "}
          {reportFile.capturedAt.slice(0, 10)}. Click the button above to open
          it. Optionally, you can also paste a markdown summary into{" "}
          <span className="mono">app/data/insights-narrative.md</span> for
          inline rendering here.
        </div>
      )}

      <p className="text-xs text-[color:var(--color-mute)] mt-3 leading-relaxed">
        {reportFile && (
          <>
            HTML report served locally from{" "}
            <span className="mono">~/.claude/usage-data/report.html</span> via{" "}
            <span className="mono">/api/insights-report</span>. Static file
            written by Claude Code; this dashboard doesn&apos;t generate or
            modify it.{" "}
          </>
        )}
        {narrative && (
          <>
            Inline narrative captured by you when you ran{" "}
            <span className="mono">/insights</span>; rendered from{" "}
            <span className="mono">app/data/insights-narrative.md</span>{" "}
            (gitignored). Not redistributed and not posted to Slack.{" "}
          </>
        )}
        <Link
          href="/methodology"
          className="hover:text-[color:var(--color-accent)]"
        >
          Why this is safe →
        </Link>
      </p>
    </section>
  );
}

export function InsightsNarrativeEmpty() {
  return (
    <section className="mb-16">
      <h2 className="text-lg uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-4">
        From <span className="mono">/insights</span>
      </h2>
      <div className="bg-[color:var(--color-panel)] border border-dashed border-[color:var(--color-line)] rounded-xl p-6 text-sm text-[color:var(--color-mute)] leading-relaxed space-y-3">
        <p>
          No <span className="mono">/insights</span> data found on disk yet. The
          dashboard scores your usage from raw signal files independently; if
          you also want Claude&apos;s own analysis surfaced here, run{" "}
          <span className="mono">/insights</span> once in Claude Code.
        </p>
        <pre className="bg-[color:var(--color-panel-2)] p-3 rounded text-xs overflow-x-auto">
          {`# In Claude Code, run:
/insights
# Then refresh this page — a button to open the full HTML
# report will appear (Claude Code writes it to
# ~/.claude/usage-data/report.html on disk).
#
# Optional: also paste a markdown summary inline:
pbpaste | npm run import-insights`}
        </pre>
        <p>
          Both artifacts stay on your machine. Nothing is uploaded, posted to
          Slack, or auto-captured.
        </p>
      </div>
    </section>
  );
}
