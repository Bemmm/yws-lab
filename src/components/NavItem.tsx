import Link from "next/link";
import type * as React from "react";
import { cx } from "./cx";

export interface NavItemProps {
  label: React.ReactNode;
  href?: string;
  icon?: React.ReactNode;
  count?: number;
  countTone?: "brand" | "muted";
  active?: boolean;
}

export function NavItem({ label, href = "#", icon, count, countTone, active }: NavItemProps) {
  return (
    <Link href={href} className="y-nav" aria-current={active ? "page" : undefined}>
      {icon ?? null}
      <span className="y-nav-label">{label}</span>
      {count != null ? (
        <span className={cx("y-nav-count", countTone === "muted" && "y-nav-count-muted")}>{count}</span>
      ) : null}
    </Link>
  );
}
