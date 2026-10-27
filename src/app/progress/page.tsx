import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import { DynamicsPill } from "@/components/DynamicsPill";
import { CreateCohortForm } from "@/features/progress/CreateCohortForm";
import { fmt, formatDate } from "@/features/progress/format";
import { resolveParams, unwrap } from "@/features/progress/server";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMethodologist } from "@/server/auth/session";
import { listCohorts } from "@/server/progress/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.progress };
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams?: Promise<{ list?: string; archived?: string }>;
}) {
  await requireMethodologist();
  const sp = await resolveParams(searchParams);
  const [dict, locale, cohorts] = await Promise.all([getDictionary(), getLocale(), listCohorts().then(unwrap)]);
  const t = dict.progress;

  const active = cohorts.filter((c) => c.status === "active");
  if (active.length === 1 && !sp.list && !sp.archived) redirect(`/progress/cohorts/${active[0]!.id}`);

  const showArchived = sp.archived === "1";
  const visible = showArchived ? cohorts : active;
  const hasArchived = cohorts.some((c) => c.status === "archived");

  return (
    <AppShell active="progress">
      <div className="p-page">
        <div>
          <h1 className="text-h1">{t.title}</h1>
          <p className="p-muted mt-1">{t.subtitle}</p>
        </div>

        <section aria-labelledby="cohorts-h" className="flex flex-col gap-3">
          <div className="p-row" style={{ justifyContent: "space-between" }}>
            <h2 id="cohorts-h" className="text-h2">
              {t.cohorts.title}
            </h2>
            {hasArchived ? (
              <Link
                href={showArchived ? "/progress?list=1" : "/progress?list=1&archived=1"}
                className="y-btn y-btn-secondary y-btn-sm"
                aria-pressed={showArchived}
              >
                {showArchived ? t.cohorts.hideArchived : t.cohorts.showArchived}
              </Link>
            ) : null}
          </div>
          {visible.length === 0 ? (
            <Card>
              <p>{cohorts.length === 0 ? t.cohorts.empty : t.cohorts.emptyActive}</p>
            </Card>
          ) : (
            <div className="p-cards">
              {visible.map((c) => (
                <Card key={c.id} as="article" aria-labelledby={`c-${c.id}`}>
                  <div className="p-row" style={{ justifyContent: "space-between" }}>
                    <h3 id={`c-${c.id}`} className="text-h3" style={{ overflowWrap: "anywhere" }}>
                      {c.name}
                    </h3>
                    <DynamicsPill status={c.status === "active" ? "steady" : "pending"}>
                      {c.status === "active" ? t.active : t.archived}
                    </DynamicsPill>
                  </div>
                  <p>{fmt(t.cohorts.students, { n: c.activeEnrollments })}</p>
                  <p>{c.modules.length ? fmt(t.cohorts.modules, { list: c.modules.join(", ") }) : t.cohorts.noModules}</p>
                  {c.startDate || c.endDate ? (
                    <p>{fmt(t.cohorts.dates, { from: formatDate(c.startDate, locale) || t.dash, to: formatDate(c.endDate, locale) || t.dash })}</p>
                  ) : null}
                  <div>
                    <Link href={`/progress/cohorts/${c.id}`} className="y-btn y-btn-primary">
                      {t.cohorts.open}
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <CreateCohortForm />
      </div>
    </AppShell>
  );
}
