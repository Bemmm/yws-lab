import type * as React from "react";
import { cx, type CompetencyGroup } from "./cx";

export interface GroupBadgeProps {
  group?: CompetencyGroup;
  /** Localized group name; supplied by the caller. */
  children?: React.ReactNode;
}

export function GroupBadge({ group = "basic", children }: GroupBadgeProps) {
  return <span className={cx("y-group", `y-group-${group}`)}>{children}</span>;
}
