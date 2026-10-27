import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import { CohortFilters } from "@/features/progress/CohortFilters";
import { fmt, formatDate } from "@/features/progress/format";
import { GroupSummaryView } from "@/features/progress/GroupSummaryView";
import { cohortHref, parseFilters, studentHref } from "@/features/progress/nav";
import { resolveParams, unwrap } from "@/features/progress/server";
import { StageChips } from "@/features/progress/StageChips";
import { StudentCard } from "@/features/progress/StudentCard";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMethodologist } from "@/server/auth/session";
import { getCohortOverview, listArchivedEnrollments } from "@/server/progress/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.progress };
}

export default async function CohortPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMethodologist();
  const { id } = await params;
  const filters = parseFilters(await resolveParams(searchParams));
  const [dict, locale, overview, archivedList] = await Promise.all([
    getDictionary(),
    getLocale(),
    getCohortOverview(id, { startingProfile: filters.profile, dynamics: filters.dynamics }).then(unwrap),
    listArchivedEnrollments(id).then(unwrap),
  ]);
  const t = dict.progress;
  const { cohort, cards, totalActive } = overview;
  const readOnly = cohort.status === "archived";
  const hasFilters = !!(filters.profile || filters.dynamics);

  return (
    <AppShell active="progress">
      <div className="p-page">
        <div>
          <Link href="/progress?list=1" className="p-link-quiet">
            ← {t.cohort.allCohorts}
          </Link>
        </div>

        <header className="flex flex-col gap-3">
          <div className="p-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div className="min-w-0">
              <h1 className="text-h1" style={{ overflowWrap: "anywhere" }}>
                {cohort.name}
              </h1>
              <p className="p-muted mt-1">
                {readOnly ? t.archived : t.active}
                {cohort.startDate || cohort.endDate
                  ? ` · ${fmt(t.cohorts.dates, { from: formatDate(cohort.startDate, locale) || t.dash, to: formatDate(cohort.endDate, locale) || t.dash })}`
                  : ""}
                {` · ${fmt(t.cohort.studentsCount, { n: totalActive })}`}
              </p>
            </div>
            {readOnly ? null : (
              <div className="p-row">
                <Link href={`/progress/cohorts/${cohort.id}/modules`} className="y-btn y-btn-secondary">
                  {t.cohort.manageModules}
                </Link>
                <Link href={`/progress/cohorts/${cohort.id}/enroll`} className="y-btn y-btn-primary">
                  {t.cohort.addStudent}
                </Link>
              </div>
            )}
          </div>
          {readOnly ? <div className="p-alert p-alert-warn">{t.cohort.readOnly}</div> : null}
          <StageChips modules={cohort.modules} t={t} />
          {cohort.modules.length === 0 ? <p className="p-muted">{t.cohort.noModulesYet}</p> : null}
        </header>

        {totalActive === 0 ? (
          <Card>
            <h2>{t.cohort.emptyTitle}</h2>
            <p>{t.cohort.emptyBody}</p>
            {readOnly ? null : (
              <div>
                <Link href={`/progress/cohorts/${cohort.id}/enroll`} className="y-btn y-btn-primary">
                  {t.cohort.addStudent}
                </Link>
              </div>
            )}
          </Card>
        ) : (
          <>
            <GroupSummaryView overview={overview} t={t} locale={locale} />
            <section aria-labelledby="students-h" className="flex flex-col gap-3">
              <h2 id="students-h" className="text-h2">
                {dict.nav.progress}
              </h2>
              <CohortFilters filters={filters} shown={cards.length} total={totalActive} />
              {cards.length === 0 ? (
                <Card>
                  <h3 className="text-h3">{t.cohort.noMatchTitle}</h3>
                  <p>{t.cohort.noMatchBody}</p>
                  {hasFilters ? (
                    <div>
                      <Link href={cohortHref(cohort.id)} className="y-btn y-btn-secondary">
                        {t.cohort.resetFilters}
                      </Link>
                    </div>
                  ) : null}
                </Card>
              ) : (
                <div className="p-cards">
                  {cards.map((c) => (
                    <StudentCard
                      key={c.enrollmentId}
                      card={c}
                      cohortId={cohort.id}
                      modules={cohort.modules}
                      filters={filters}
                      readOnly={readOnly}
                      t={t}
                      locale={locale}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {archivedList.length > 0 ? (
          <details className="rounded-lg bg-bg-card p-4">
            <summary className="cursor-pointer text-body-strong" style={{ minHeight: "var(--tap-min)", display: "flex", alignItems: "center" }}>
              {fmt(t.cohort.archivedEnrollments, { n: archivedList.length })}
            </summary>
            <p className="p-muted mb-2">{t.cohort.archivedEnrollmentsHint}</p>
            <ul className="p-picklist">
              {archivedList.map((a) => (
                <li key={a.enrollmentId}>
                  <Link href={studentHref(cohort.id, a.enrollmentId, filters)} className="p-link-quiet">
                    {a.displayName}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </AppShell>
  );
}
