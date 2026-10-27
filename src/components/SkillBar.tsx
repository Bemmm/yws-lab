import type * as React from "react";
import { cx, type CompetencyGroup } from "./cx";

export interface SkillBarProps {
  label: React.ReactNode;
  group?: CompetencyGroup;
  value?: number | null;
  display?: React.ReactNode;
  fromStart?: number;
  fromPrev?: number;
  fromStartLabel?: string;
  fromPrevLabel?: string;
  emptyLabel?: string;
  compact?: boolean;
}

function sign(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

function deltaClass(n: number): string {
  return n > 0 ? "y-delta-up" : n < 0 ? "y-delta-down" : "y-delta-zero";
}

export function SkillBar({
  label,
  group = "basic",
  value,
  display,
  fromStart,
  fromPrev,
  fromStartLabel,
  fromPrevLabel,
  emptyLabel,
  compact,
}: SkillBarProps) {
  const has = value != null;
  const filled = has ? Math.max(0, Math.min(10, Math.round(value))) : 0;
  const deltas: React.ReactNode[] = [];
  if (fromStart != null) {
    deltas.push(
      <span key="s" className={deltaClass(fromStart)}>
        {[sign(fromStart), fromStartLabel].filter(Boolean).join(" ")}
      </span>,
    );
  }
  if (fromPrev != null) {
    deltas.push(
      <span key="p" className={deltaClass(fromPrev)}>
        {[sign(fromPrev), fromPrevLabel].filter(Boolean).join(" ")}
      </span>,
    );
  }
  const text = typeof label === "string" ? label : "";
  return (
    <div className={cx("y-skill", `y-skill-${group}`, compact && "y-skill-compact")}>
      <div className="y-skill-head">
        <span className="y-skill-label">{label}</span>
        {has ? (
          <span className="y-skill-value">
            {String(display ?? value)}
            <small>/10</small>
          </span>
        ) : (
          <span className="y-skill-empty">{emptyLabel}</span>
        )}
      </div>
      <div
        className="y-skill-cells"
        role="img"
        aria-label={has ? `${text}: ${value}/10` : `${text}: ${emptyLabel ?? ""}`}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={cx("y-skill-cell", i < filled && "y-skill-on")} />
        ))}
      </div>
      {deltas.length > 0 && !compact ? <div className="y-skill-deltas">{deltas}</div> : null}
    </div>
  );
}
