import Link from "next/link";
import { renderMarkdown } from "@/app/lib/boris-content";
import type { InsightsNarrative } from "@/app/lib/insights-narrative";

interface Props {
  narrative: InsightsNarrative;
}

export default function InsightsNarrativeSection({ narrative }: Props) {
  const date = narrative.capturedAt.slice(0, 10);
  return (
    <section className="mb-16">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg uppercase tracking-[0.15em] text-[color:var(--color-mute)]">
          From <span className="mono">/insights</span> — your captured narrative
        </h2>
        <span className="text-xs text-[color:var(--color-mute)] mono">imported {date}</span>
      </div>
      <div className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-xl p-6 text-sm leading-relaxed [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_p]:my-2 [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:my-2 [&_code]:mono [&_code]:text-[color:var(--color-accent)] [&_pre]:bg-[color:var(--color-panel-2)] [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-3 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2">
        {renderMarkdown(narrative.body)}
      </div>
      <p className="text-xs text-[color:var(--color-mute)] mt-3 leading-relaxed">
        Captured by you when you ran Claude Code&apos;s <span className="mono">/insights</span> command. Rendered locally
        from <span className="mono">app/data/insights-narrative.md</span> on your machine and gitignored. Not
        redistributed and not posted to Slack. To refresh: re-run <span className="mono">/insights</span> in Claude
        Code, copy the output, and overwrite the file (or pipe through{" "}
        <span className="mono">npm run import-insights</span>).{" "}
        <Link href="/methodology" className="hover:text-[color:var(--color-accent)]">
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
        From <span className="mono">/insights</span> — your captured narrative
      </h2>
      <div className="bg-[color:var(--color-panel)] border border-dashed border-[color:var(--color-line)] rounded-xl p-6 text-sm text-[color:var(--color-mute)] leading-relaxed space-y-3">
        <p>
          No narrative captured yet. The dashboard scores your usage from raw signal files; if you also want
          Claude&apos;s own analysis surfaced here, capture the output of{" "}
          <span className="mono">/insights</span> once and drop it in{" "}
          <span className="mono">app/data/insights-narrative.md</span>.
        </p>
        <pre className="bg-[color:var(--color-panel-2)] p-3 rounded text-xs overflow-x-auto">
{`# In Claude Code, run:
/insights
# Copy the output, then:
pbpaste | npm run import-insights
# or just paste it into app/data/insights-narrative.md`}
        </pre>
        <p>
          The file stays on your machine, is gitignored, and is rendered locally. Refresh the dashboard to
          see it appear here.
        </p>
      </div>
    </section>
  );
}
