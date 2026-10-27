"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import { DYNAMICS_FILTERS, filtersQuery, PROFILES, type CohortFilters as Filters } from "./nav";
import { fmt } from "./format";

/** Filters change the visible cards only (via the query string); the group summary is never affected. */
export function CohortFilters({ filters, shown, total }: { filters: Filters; shown: number; total: number }) {
  const t = useT().progress;
  const router = useRouter();
  const pathname = usePathname();
  const go = (next: Filters) => router.replace(`${pathname}${filtersQuery(next)}`, { scroll: false });
  const active = !!(filters.profile || filters.dynamics);

  return (
    <div role="group" aria-label={t.filters.title} className="p-row" style={{ alignItems: "flex-end" }}>
      <label className="y-field">
        {t.filters.profile}
        <select
          className="p-select"
          value={filters.profile ?? ""}
          onChange={(e) => go({ ...filters, profile: (e.target.value || undefined) as Filters["profile"] })}
        >
          <option value="">{t.filters.any}</option>
          {PROFILES.map((p) => (
            <option key={p} value={p}>
              {t.profile[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="y-field">
        {t.filters.dynamics}
        <select
          className="p-select"
          value={filters.dynamics ?? ""}
          onChange={(e) => go({ ...filters, dynamics: (e.target.value || undefined) as Filters["dynamics"] })}
        >
          <option value="">{t.filters.any}</option>
          {DYNAMICS_FILTERS.map((d) => (
            <option key={d} value={d}>
              {t.dynamics[d]}
            </option>
          ))}
        </select>
      </label>
      {active ? (
        <Link href={pathname} replace scroll={false} className="y-btn y-btn-secondary">
          {t.cohort.resetFilters}
        </Link>
      ) : null}
      <p className="p-muted" role="status" style={{ marginBottom: 12 }}>
        {fmt(t.filters.showing, { k: shown, n: total })}
      </p>
    </div>
  );
}
