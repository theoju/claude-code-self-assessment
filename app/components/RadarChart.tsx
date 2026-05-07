import type { Dimension } from "@/app/lib/assessment";

interface Props {
  dimensions: Dimension[];
  size?: number;
  showExecution?: boolean;
}

export default function RadarChart({ dimensions, size = 480, showExecution = false }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 70;
  const n = dimensions.length;

  const pointAt = (value: number, i: number) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const r = (value / 100) * radius;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r] as const;
  };

  const scorePath =
    dimensions
      .map((d, i) => {
        const [x, y] = pointAt(d.score, i);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";

  const targetPath =
    dimensions
      .map((d, i) => {
        const [x, y] = pointAt(d.target, i);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ") + " Z";

  // Null executionScores would collapse to the centre and distort the polygon —
  // skip them, leaving the shape visibly sparse on unmeasured axes.
  const executionVertices: Array<{ x: number; y: number; i: number }> = showExecution
    ? dimensions
        .map((d, i) => {
          if (d.executionScore == null) return null;
          const [x, y] = pointAt(d.executionScore, i);
          return { x, y, i };
        })
        .filter((v): v is { x: number; y: number; i: number } => v !== null)
    : [];

  const executionPath =
    executionVertices.length >= 2
      ? executionVertices
          .map((v, i) => `${i === 0 ? "M" : "L"}${v.x.toFixed(1)},${v.y.toFixed(1)}`)
          .join(" ") + " Z"
      : null;

  const rings = [20, 40, 60, 80, 100];

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto">
      {rings.map((v) => (
        <circle
          key={v}
          cx={cx}
          cy={cy}
          r={(v / 100) * radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={v === 100 ? 1 : 0.5}
          strokeDasharray={v === 100 ? undefined : "2 3"}
        />
      ))}
      {dimensions.map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(angle) * radius}
            y2={cy + Math.sin(angle) * radius}
            stroke="var(--color-line)"
            strokeWidth={0.5}
          />
        );
      })}

      <path d={targetPath} fill="var(--color-accent)" fillOpacity={0.08} stroke="var(--color-accent)" strokeOpacity={0.6} strokeDasharray="4 3" strokeWidth={1} />
      <path d={scorePath} fill="var(--color-good)" fillOpacity={0.2} stroke="var(--color-good)" strokeWidth={1.5} />

      {executionPath && (
        <path
          d={executionPath}
          fill="var(--color-warn)"
          fillOpacity={0.1}
          stroke="var(--color-warn)"
          strokeWidth={1.25}
          strokeDasharray="3 3"
        />
      )}

      {dimensions.map((d, i) => {
        const [x, y] = pointAt(d.score, i);
        return <circle key={d.id} cx={x} cy={y} r={3} fill="var(--color-good)" />;
      })}

      {executionVertices.map((v) => (
        <circle key={`exec-${dimensions[v.i].id}`} cx={v.x} cy={v.y} r={2.5} fill="var(--color-warn)" />
      ))}

      {dimensions.map((d, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lx = cx + Math.cos(angle) * (radius + 26);
        const ly = cy + Math.sin(angle) * (radius + 26);
        const anchor =
          Math.abs(Math.cos(angle)) < 0.2 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
        const label = d.title.split(" — ")[0].split("&")[0].trim();
        // When showExecution is on but this dim has no measurement, mark the
        // label as unmeasured (italic + dimmed) and append a ¹ superscript
        // pointing at the footnote rendered next to the radar legend.
        const unmeasured = showExecution && d.executionScore == null;
        return (
          <text
            key={`lbl-${d.id}`}
            x={lx}
            y={ly}
            fontSize={11}
            fill="var(--color-mute)"
            fontStyle={unmeasured ? "italic" : undefined}
            opacity={unmeasured ? 0.65 : 1}
            textAnchor={anchor}
            dominantBaseline="middle"
          >
            {label}
            {unmeasured ? (
              <tspan dx={2} dy={-3} fontSize={9}>
                ¹
              </tspan>
            ) : null}
          </text>
        );
      })}
    </svg>
  );
}
