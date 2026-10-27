import type * as React from "react";
import { cx, type Dynamics } from "./cx";

export type { Dynamics };

const MARKS: Partial<Record<Dynamics, string>> = {
  steady: "▲",
  rapid: "▲▲",
  stagnation: "■",
  attention: "!",
};

export interface DynamicsPillProps {
  status?: Dynamics;
  /** Localized label; supplied by the caller (no built-in copy). */
  children?: React.ReactNode;
}

export function DynamicsPill({ status = "pending", children }: DynamicsPillProps) {
  const mark = MARKS[status];
  return (
    <span className={cx("y-pill", `y-pill-${status}`)}>
      {mark ? (
        <span className="y-pill-mark" aria-hidden="true" style={{ marginRight: 6 }}>
          {mark}
        </span>
      ) : null}
      {children}
    </span>
  );
}
