import type * as React from "react";
import { cx } from "./cx";

export interface StatStripProps {
  label?: string;
  items: { label: React.ReactNode; value: React.ReactNode; tone?: "default" | "good" }[];
}

export function StatStrip({ label, items }: StatStripProps) {
  return (
    <section className="y-stats" aria-label={label}>
      {items.map((it, i) => (
        <div key={i}>
          <div className="y-stat-label">{it.label}</div>
          <div className={cx("y-stat-value", it.tone === "good" && "y-stat-value-good")}>{it.value}</div>
        </div>
      ))}
    </section>
  );
}
