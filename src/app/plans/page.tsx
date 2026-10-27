import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PlansLibrary, type LibraryItem } from "@/features/builder/library/plans-library";
import { format, formatDate, plural } from "@/i18n/format";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireAccount } from "@/server/auth/session";
import { createPlanAction } from "@/server/plans/actions";
import { LIBRARY_PAGE_SIZE, listPlans } from "@/server/plans/service";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).plans.title };
}

const MAX_PAGES = 10;

export default async function PlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const account = await requireAccount();

  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().slice(0, 120);
  const page = Math.min(MAX_PAGES, Math.max(1, Math.floor(Number(typeof sp.page === "string" ? sp.page : 1)) || 1));
  const [t, locale] = await Promise.all([getDictionary(), getLocale()]);
  const { items, hasMore } = await listPlans(account.id, { query: q, limit: LIBRARY_PAGE_SIZE * page });

  const cards: LibraryItem[] = items.map((p) => ({
    id: p.id,
    title: p.title,
    previewSrcs: p.previewSrcs,
    setsLabel: plural(locale, t.plans.sets, p.setsCount),
    asanasLabel: format(t.plans.asanas, { filled: p.filledSlotsCount, total: p.slotsCount }),
    updatedLabel: format(t.plans.updated, { date: formatDate(locale, p.updatedAt) }),
    shareToken: p.shareToken,
  }));
  const moreHref = `/plans?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`;

  return (
    <AppShell active="plans">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h1">{t.plans.title}</h1>
        <form action={createPlanAction}>
          <Button type="submit">{t.plans.newPlan}</Button>
        </form>
      </div>

      <form method="get" role="search" className="mb-5 flex max-w-xl items-end gap-2">
        <label className="y-field flex-1">
          <span className="sr-only">{t.plans.searchLabel}</span>
          <input name="q" type="search" defaultValue={q} maxLength={120} placeholder={t.plans.searchPlaceholder} className="y-input" />
        </label>
        <Button type="submit" variant="secondary">
          {t.plans.searchButton}
        </Button>
      </form>

      {cards.length === 0 ? (
        <Card>
          {q ? (
            <p>{format(t.plans.noResults, { q })}</p>
          ) : (
            <>
              <h2>{t.plans.emptyTitle}</h2>
              <p>{t.plans.emptyBody}</p>
              <form action={createPlanAction}>
                <Button type="submit">{t.plans.newPlan}</Button>
              </form>
            </>
          )}
        </Card>
      ) : (
        <>
          <PlansLibrary items={cards} />
          {hasMore && page < MAX_PAGES && (
            <div className="mt-6 flex justify-center">
              <Link href={moreHref} className="y-btn y-btn-secondary">
                {t.plans.showMore}
              </Link>
            </div>
          )}
        </>
      )}
    </AppShell>
  );
}
