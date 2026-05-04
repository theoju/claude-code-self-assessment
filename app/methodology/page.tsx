import Link from "next/link";

export const dynamic = "force-static";

export const metadata = { title: "Methodology — Claude Code Mastery" };

export default function MethodologyPage() {
  return (
    <main className="max-w-3xl mx-auto px-8 py-12 prose-invert">
      <div className="text-xs uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-3">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-accent)]">
          ← Dashboard
        </Link>
      </div>
      <h1 className="text-4xl font-semibold tracking-tight mb-6">Methodology</h1>

      <Section title="Two axes, not one composite">
        <p>
          Mastery here is scored on two independent axes rather than collapsed into a single number.
          A composite would obscure the very thing this dashboard exists to surface — the gap between
          how Claude Code is <em>configured</em> and how it&apos;s actually <em>used</em>.
        </p>
        <ul>
          <li>
            <strong className="text-[color:var(--color-good)]">Workshop</strong> — derived from your
            local <span className="mono">~/.claude</span> setup: settings, plugins, custom
            agents/commands/skills, hooks, project memory, and CLAUDE.md health. It answers:{" "}
            <em>are the tools in place?</em>
          </li>
          <li>
            <strong className="text-[color:var(--color-warn)]">Execution</strong> — derived from
            behavioral signals in <span className="mono">~/.claude/usage-data</span> (the same files{" "}
            <span className="mono">/insights</span> reads). It answers: <em>are you using them?</em>
          </li>
        </ul>
        <p>
          The diagnostic case is a high Workshop score paired with a low Execution score — every
          tool installed, none of them used. The <strong>Δ</strong> readout on the dashboard makes
          this gap explicit.
        </p>
      </Section>

      <Section title="Why Execution is sparse (6 of 12 dimensions)">
        <p>
          Not every dimension has a behavioral signal we can measure cheaply. The first wave covers
          the six where session-level evidence exists in <span className="mono">/insights</span>:
        </p>
        <ul>
          <li><strong>Permissions &amp; Safety</strong> — auto-mode ratio, bypass penalty</li>
          <li><strong>Parallel Execution &amp; Subagents</strong> — subagent dispatch ratio, worktree usage (when transcripts opted in)</li>
          <li><strong>Planning &amp; Delegation</strong> — plan mode adoption within multi-task sessions</li>
          <li><strong>Integrations</strong> — share of installed plugins that actually fired tool calls</li>
          <li><strong>Verification</strong> — friction-event miss rate (buggy_code + wrong_approach per session)</li>
          <li><strong>Automation &amp; Hooks</strong> — hook fires per session plus a bonus when personal agents are in use</li>
        </ul>
        <p>
          The radar leaves the other six dimensions visually blank on the Execution polygon —{" "}
          <em>unmeasured</em>, not <em>scored zero</em>. Filling them in is a future iteration once
          the signal is reliable.
        </p>
      </Section>

      <Section title="Lookback windows">
        <p>
          Two configurable windows control how far back signals are read, in{" "}
          <span className="mono">assessment.config.json</span>:
        </p>
        <ul>
          <li>
            <span className="mono">scoring.insightsLookbackDays</span> — default <strong>30</strong>.
            Aggregation window for Execution scoring. A short window favours recent habits; a long
            one rewards consistency.
          </li>
          <li>
            <span className="mono">scoring.progressionLookbackDays</span> — default{" "}
            <strong>null</strong> (full history). The progression timeline walks all sessions to
            detect &quot;first&quot; events that may have happened months ago. The{" "}
            &quot;stopped using bypass&quot; detector additionally requires recent overall activity
            so it doesn&apos;t fire for users who simply stopped using Claude.
          </li>
          <li>
            <span className="mono">scoring.includeTranscripts</span> — default <strong>false</strong>.
            Opt-in scan of raw <span className="mono">~/.claude/projects/*/*.jsonl</span> transcripts
            to detect permission-mode adoption, worktree usage, and skill attribution. Skipped by
            default because the scan is expensive (hundreds of MB on active users).
          </li>
        </ul>
      </Section>

      <Section title="Gap reasons, not silent zeros">
        <p>
          When an Execution score is missing, the <span className="mono">gapReason</span> field
          tells you <em>why</em> rather than rendering as 0. Common reasons:
        </p>
        <ul>
          <li><em>No /insights data yet</em> — <span className="mono">~/.claude/usage-data</span> is absent (fresh install)</li>
          <li><em>Insufficient session count</em> — fewer sessions in the lookback window than the dimension requires</li>
          <li><em>Transcript opt-in required</em> — the dimension needs raw transcripts and the flag is off</li>
        </ul>
      </Section>

      <Section title="Weights and overall scoring">
        <p>
          Each dimension carries a weight 1–3 reflecting how much it compounds daily work, sourced
          from Boris Cherny&apos;s ranking on{" "}
          <a className="underline" href="https://howborisusesclaudecode.com" target="_blank" rel="noreferrer">
            howborisusesclaudecode.com
          </a>
          . Workshop overall and Execution overall are both weight-normalized means over their
          respective per-dimension scores. Priority actions are sorted by{" "}
          <span className="mono">weight × (target − score)</span>.
        </p>
      </Section>

      <Section title="Privacy">
        <p>
          All reads are local. No data leaves the machine unless you explicitly enable Slack posting.
          The dashboard renders from <span className="mono">app/data/assessment.json</span>,{" "}
          <span className="mono">app/data/progression.json</span>, and (optionally){" "}
          <span className="mono">app/data/insights-narrative.md</span>. The first two are produced by{" "}
          <span className="mono">scripts/run-assessment.mjs</span>; the third is something you put there
          explicitly (see below).
        </p>
      </Section>

      <Section title="The /insights narrative — opt-in, user-driven">
        <p>
          The dashboard&apos;s scoring is independent of <span className="mono">/insights</span>: it reads
          the same raw <span className="mono">~/.claude/usage-data/</span> files but computes its own
          Workshop and Execution scores. If you also want Claude&apos;s own narrative analysis surfaced
          here, you can capture the output of <span className="mono">/insights</span> once and drop it
          in <span className="mono">app/data/insights-narrative.md</span>.
        </p>
        <pre className="bg-[color:var(--color-panel-2)] p-3 rounded text-xs overflow-x-auto">
{`# In Claude Code:
/insights
# Then either:
pbpaste | npm run import-insights
# or paste manually into app/data/insights-narrative.md`}
        </pre>
        <p>
          The file is gitignored, never uploaded, never posted to Slack, and rendered locally with the
          same markdown helper used elsewhere in the dashboard. It&apos;s your output on your machine —
          this tool just renders it. We don&apos;t auto-capture <span className="mono">/insights</span>{" "}
          output, don&apos;t reuse Anthropic&apos;s prompt template, and don&apos;t persist anything beyond
          the file you create.
        </p>
      </Section>

      <Section title="Attribution &amp; relationship to Claude Code">
        <p>
          This is an <strong>independent, open-source community tool</strong>. It is{" "}
          <strong>not affiliated with, endorsed by, or sponsored by Anthropic</strong>.
        </p>
        <p>
          The dashboard analyzes files that Claude Code writes to your local{" "}
          <span className="mono">~/.claude/</span> directory during normal use — settings,
          installed plugins, project memory, and the per-session telemetry under{" "}
          <span className="mono">~/.claude/usage-data/</span>. Those are <em>your</em> files
          on <em>your</em> machine; the dashboard just reads them and computes its own scores.
        </p>
        <p>
          References to <span className="mono">/insights</span> describe the Claude Code
          built-in command that reads the same local data files. We don&apos;t reuse{" "}
          <span className="mono">/insights</span> output, replicate its UI, or call any
          Anthropic API. <em>&quot;Claude&quot;</em>, <em>&quot;Claude Code&quot;</em>, and{" "}
          <em>&quot;/insights&quot;</em> are trademarks of Anthropic, used here only to identify
          the platform this tool complements — not to imply endorsement.
        </p>
        <p>
          Workflow tip ranking and the underlying methodology come from Boris Cherny&apos;s{" "}
          <a className="underline" href="https://howborisusesclaudecode.com" target="_blank" rel="noreferrer">
            howborisusesclaudecode.com
          </a>
          , reproduced under fair use as cross-references; tip content is fetched at install
          time from a snapshot of the public site.
        </p>
        <p>
          License: MIT. Issues, PRs, and rubric improvements welcome on GitHub.
        </p>
      </Section>

      <div className="mt-12 text-xs text-[color:var(--color-mute)]">
        <Link href="/" className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-accent)]">
          ← Back to dashboard
        </Link>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-lg uppercase tracking-[0.15em] text-[color:var(--color-mute)] mb-4">
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed [&_ul]:list-disc [&_ul]:ml-6 [&_ul]:space-y-1.5 [&_ul]:my-3 [&_a]:text-[color:var(--color-accent)]">
        {children}
      </div>
    </section>
  );
}
