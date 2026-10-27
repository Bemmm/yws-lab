import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EnrollForm } from "@/features/progress/EnrollForm";
import { unwrap } from "@/features/progress/server";
import { getDictionary } from "@/i18n/server";
import { requireMethodologist } from "@/server/auth/session";
import { getCohort } from "@/server/progress/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).progress.enroll.title };
}

export default async function EnrollPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMethodologist();
  const { id } = await params;
  const [dict, cohort] = await Promise.all([getDictionary(), getCohort(id).then(unwrap)]);
  const t = dict.progress;
  return (
    <AppShell active="progress">
      <div className="p-page" style={{ maxWidth: 760 }}>
        <div>
          <Link href={`/progress/cohorts/${cohort.id}`} className="p-link-quiet">
            ← {t.modules.back}
          </Link>
        </div>
        <h1 className="text-h1">{t.enroll.title}</h1>
        {cohort.status === "archived" ? <div className="p-alert p-alert-warn">{t.cohort.readOnly}</div> : null}
        <EnrollForm cohortId={cohort.id} readOnly={cohort.status === "archived"} />
      </div>
    </AppShell>
  );
}
