import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AssessmentForm } from "@/features/progress/AssessmentForm";
import { stageLabel } from "@/features/progress/format";
import { parseFilters, studentHref } from "@/features/progress/nav";
import { resolveParams, unwrap } from "@/features/progress/server";
import { getDictionary } from "@/i18n/server";
import { requireMethodologist } from "@/server/auth/session";
import { getStageForm, getStudentProgress } from "@/server/progress/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).progress.assess.title };
}

export default async function AssessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; enrollmentId: string; stage: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMethodologist();
  const { id, enrollmentId, stage } = await params;
  const filters = parseFilters(await resolveParams(searchParams));
  const [dict, view, form] = await Promise.all([
    getDictionary(),
    getStudentProgress(enrollmentId).then(unwrap),
    getStageForm(enrollmentId, stage).then(unwrap),
  ]);
  if (view.cohort.id !== id || !view.stages.some((s) => s.stage === stage)) notFound();
  const t = dict.progress;
  const locked = !form.availability.available;

  return (
    <AppShell active="progress">
      <div className="p-page" style={{ maxWidth: 980 }}>
        <div>
          <Link href={studentHref(id, enrollmentId, filters)} className="p-link-quiet">
            ← {view.student.displayName}
          </Link>
        </div>
        <header className="rounded-xl bg-bg-card p-5 md:sticky md:top-2 md:z-10">
          <p className="p-muted">{t.assess.title}</p>
          <h1 className="text-h2" style={{ overflowWrap: "anywhere" }}>
            {view.student.displayName}
          </h1>
          <p className="p-muted">
            {view.cohort.name} · <b>{stageLabel(t, stage)}</b>
          </p>
        </header>
        <AssessmentForm
          key={`${enrollmentId}:${stage}`}
          enrollmentId={enrollmentId}
          cohortId={id}
          stage={stage}
          initialVersion={form.version}
          initialScores={form.scores}
          previous={form.previous}
          readOnly={form.readOnly}
          locked={locked}
          stages={view.stages.map((s) => ({ stage: s.stage, availability: s.availability }))}
          filters={filters}
        />
      </div>
    </AppShell>
  );
}
