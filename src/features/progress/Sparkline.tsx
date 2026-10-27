import type { CompetencyGroup } from "@/components/cx";
import { fmt, stageLabel, type PT } from "./format";
import { sparkGeometry } from "./sparkline";

/** Inline SVG mini history: common 0-10 axis, only assessed stages plotted, with a text alternative. */
export function Sparkline({
  values,
  stages,
  label,
  group,
  t,
}: {
  values: (number | null)[];
  stages: string[];
  label: string;
  group: CompetencyGroup;
  t: PT;
}) {
  const g = sparkGeometry(values);
  const text = values.some((v) => v !== null)
    ? fmt(t.student.trendAlt, {
        label,
        values: values
          .map((v, i) => (v === null ? null : `${stageLabel(t, stages[i]!)} ${v}`))
          .filter(Boolean)
          .join(", "),
      })
    : fmt(t.student.trendNone, { label });
  return (
    <svg
      className={`p-spark p-spark-${group}`}
      width={g.width}
      height={g.height}
      viewBox={`0 0 ${g.width} ${g.height}`}
      role="img"
      aria-label={text}
    >
      {g.grid.map((l) => (
        <line key={l.value} className="p-grid" x1={0} x2={g.width} y1={l.y} y2={l.y} />
      ))}
      {g.line ? <polyline className="p-line" points={g.line} /> : null}
      {g.points.map((p) => (
        <circle key={p.index} cx={p.x} cy={p.y} r={3} />
      ))}
    </svg>
  );
}
