import Link from "next/link";
import { borisTipLink } from "@/app/lib/boris-tips";
import type { Milestone, Progression } from "@/app/lib/progression";

interface Props {
  progression: Progression;
}

// Keep in sync with DETECTORS in scripts/progression.mjs and
// scripts/config-progression.mjs — every dimension that can emit a milestone
// needs a glyph here, otherwise it falls back to •.
const DIMENSION_GLYPH: Record<string, string> = {
  parallel: "‖",
  planning: "△",
  permissions: "◇",
  integrations: "◯",
  automation: "✦",
  memory: "▣",
  "model-effort": "◐",
  learning: "★",
};

export default function ProgressionTimeline({ progression }: Props) {
  if (progression.milestones.length === 0) {
    return (
      <div className="bg-[color:var(--color-panel)] border border-[color:var(--color-line)] rounded-xl p-6 text-sm text-[color:var(--color-mute)]">
        No behavioral milestones detected yet — keep using Claude and
        they&apos;ll appear here.
      </div>
    );
  }

  const sorted = [...progression.milestones].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  return (
    <ol className="relative ml-3 border-l border-[color:var(--color-line)]">
      {sorted.map((m) => (
        <Row key={`${m.sessionId}:${m.milestone}`} milestone={m} />
      ))}
    </ol>
  );
}

function Row({ milestone }: { milestone: Milestone }) {
  const date = milestone.timestamp.slice(0, 10);
  const tip = borisTipLink(milestone.borisTip);
  const glyph = DIMENSION_GLYPH[milestone.dimension] || "•";
  return (
    <li className="relative pl-6 pb-6 last:pb-0">
      <span
        aria-hidden
        className="absolute -left-[6px] top-1 w-3 h-3 rounded-full bg-[color:var(--color-accent)] ring-4 ring-[color:var(--color-bg)]"
      />
      <div className="flex flex-wrap items-baseline gap-3 mb-1">
        <span className="mono text-xs text-[color:var(--color-mute)]">
          {date}
        </span>
        <span className="text-xs uppercase tracking-wider text-[color:var(--color-mute)]">
          <span aria-hidden>{glyph}</span> {milestone.dimension}
        </span>
      </div>
      <div className="text-sm font-medium">{milestone.milestone}</div>
      <div className="text-sm text-[color:var(--color-mute)] mt-1">
        {milestone.evidence}
        {" · "}
        <Link
          href={tip.url}
          className="underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-accent)]"
          title={`${tip.topic} — ${tip.where}`}
        >
          Boris tip {milestone.borisTip}
        </Link>
      </div>
    </li>
  );
}
