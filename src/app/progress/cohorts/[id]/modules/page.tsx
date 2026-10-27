import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ManageModules } from "@/features/progress/ManageModules";
import { unwrap } from "@/features/progress/server";
import { getDictionary } from "@/i18n/server";
import { requireMethodologist } from "@/server/auth/session";
import { getCohort, moduleScoreCounts } from "@/server/progress/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).progress.modules.title };
}

export default async function ModulesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireMethodologist();
  const { id } = await params;
  const [dict, cohort, scored] = await Promise.all([
    getDictionary(),
    getCohort(id).then(unwrap),
    moduleScoreCounts(id).then(unwrap),
  ]);
  const t = dict.progress;
  return (
    <AppShell active="progress">
      <div className="p-page" style={{ maxWidth: 760 }}>
        <div>
          <Link href={`/progress/cohorts/${cohort.id}`} className="p-link-quiet">
            ← {t.modules.back}
          </Link>
        </div>
        <h1 className="text-h1">{t.modules.title}</h1>
        <ManageModules
          cohortId={cohort.id}
          modules={cohort.modules}
          version={cohort.version}
          scoredModules={scored}
          readOnly={cohort.status === "archived"}
        />
      </div>
    </AppShell>
  );
}
