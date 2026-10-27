import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { DynamicsPill } from "@/components/DynamicsPill";
import { GroupBadge } from "@/components/GroupBadge";
import { SkillBar } from "@/components/SkillBar";
import { StatStrip } from "@/components/StatStrip";
import { EnrollmentControls } from "@/features/progress/EnrollmentControls";
import { attentionReason, fmt, formatGain, formatLevel, pillStatus, stageLabel } from "@/features/progress/format";
import { HistoryTable } from "@/features/progress/HistoryTable";
import { StageNotes } from "@/features/progress/StageNotes";
import { assessHref, cohortHref, parseFilters } from "@/features/progress/nav";
import { resolveParams, unwrap } from "@/features/progress/server";
import { getDictionary, getLocale } from "@/i18n/server";
import { requireMethodologist } from "@/server/auth/session";
import { COMPETENCIES } from "@/server/progress/competencies";
import { getStudentProgress } from "@/server/progress/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.progress };
}

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; enrollmentId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireMethodologist();
  const { id, enrollmentId } = await params;
  const filters = parseFilters(await resolveParams(searchParams));
  const [dict, locale, view] = await Promise.all([getDictionary(), getLocale(), getStudentProgress(enrollmentId).then(unwrap)]);
  if (view.cohort.id !== id) notFound();
  const t = dict.progress;
  const p = view.progress;
  const archived = view.enrollment.archived;
  const readOnly = view.cohort.status === "archived";
  const reason = attentionReason(t, p.dynamics, locale);

  const currentStage = p.currentStage
    ? p.currentStageScored === 16
      ? stageLabel(t, p.currentStage)
      : fmt(t.student.currentStagePartial, { stage: stageLabel(t, p.currentStage), k: p.currentStageScored })
    : t.student.currentStageNone;

  return (
    <AppShell active="progress">
      <div className="p-page">
        <div>
          <Link href={cohortHref(id, filters)} className="p-link-quiet">
            ← {t.student.backToCohort}
          </Link>
        </div>

        <header className="flex flex-col gap-3">
          <div>
            <h1 className="text-h1" style={{ overflowWrap: "anywhere" }}>
              {view.student.displayName}
            </h1>
            <p className="p-muted mt-1">
              {t.student.cohort}: {view.cohort.name} · {t.student.startingProfile}: {t.profile[view.enrollment.startingProfile]}
              {archived ? ` · ${t.archived}` : ""}
            </p>
          </div>
          {archived ? <div className="p-alert p-alert-warn">{t.student.archivedNotice}</div> : null}
          <EnrollmentControls
            enrollmentId={view.enrollment.id}
            cohortId={id}
            profile={view.enrollment.startingProfile}
            archived={archived}
            readOnly={readOnly}
            filters={filters}
          />
        </header>

        <StatStrip
          label={t.student.currentStage}
          items={[
            { label: t.student.currentStage, value: currentStage },
            {
              label: t.student.latestLevel,
              value:
                p.currentLevel !== null && p.currentLevelStage
                  ? fmt(t.student.latestLevelAt, { level: formatLevel(p.currentLevel, locale), stage: stageLabel(t, p.currentLevelStage) })
                  : t.dash,
            },
            {
              label: t.student.gain,
              value: p.gainFromPoint0 !== null ? formatGain(p.gainFromPoint0, locale) : t.dash,
              tone: p.gainFromPoint0 !== null && p.gainFromPoint0 > 0 ? "good" : "default",
            },
          ]}
        />
        <div className="flex flex-col gap-1">
          <div className="p-row">
            <span className="text-body-strong">{t.student.dynamics}:</span>
            <DynamicsPill status={pillStatus(p.dynamics.label)}>{t.dynamics[p.dynamics.label]}</DynamicsPill>
          </div>
          {reason ? <p className="p-reason">{reason}</p> : null}
        </div>

        {archived || readOnly ? null : (
          <nav aria-label={t.student.assessStage} className="flex flex-col gap-2">
            <h2 className="text-h2">{t.student.assessStage}</h2>
            <ul className="p-chips">
              {view.stages.map((s) => (
                <li key={s.stage}>
                  {s.availability.available ? (
                    <Link href={assessHref(id, enrollmentId, s.stage, filters)} className="p-chip">
                      {stageLabel(t, s.stage)}
                      {s.scored > 0 ? <span className="p-muted">{s.scored}/16</span> : null}
                    </Link>
                  ) : (
                    <span className="p-chip p-chip-locked" title={t.student.assessLocked}>
                      {stageLabel(t, s.stage)}
                      <span className="p-visually-hidden"> · {t.student.assessLocked}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        )}

        <section aria-labelledby="skills-h" className="flex flex-col gap-4">
          <h2 id="skills-h" className="text-h2">
            {t.student.skillsTitle}
          </h2>
          <div className="p-two">
            {(["basic", "system"] as const).map((g) => (
              <section key={g} aria-label={t.group[g]} className="flex flex-col gap-4 rounded-xl bg-bg-card p-5">
                <div>
                  <GroupBadge group={g}>{t.group[g]}</GroupBadge>
                </div>
                {COMPETENCIES.filter((c) => c.group === g).map((c) => {
                  const cp = p.competencies.find((x) => x.code === c.code)!;
                  return (
                    <SkillBar
                      key={c.code}
                      group={g}
                      label={t.competency[c.code]}
                      value={cp.currentValue}
                      fromStart={cp.changeFromPoint0}
                      fromPrev={cp.changeFromPrior}
                      fromStartLabel={t.student.fromStart}
                      fromPrevLabel={t.student.fromPrev}
                      emptyLabel={t.unassessed}
                    />
                  );
                })}
              </section>
            ))}
          </div>
        </section>

        <section aria-labelledby="hist-h" className="flex flex-col gap-3">
          <div>
            <h2 id="hist-h" className="text-h2">
              {t.student.historyTitle}
            </h2>
            <p className="p-muted">{t.student.historyHint}</p>
            <p className="p-muted">{t.student.legend}</p>
          </div>
          <HistoryTable view={view} t={t} locale={locale} />
          <StageNotes view={view} t={t} />
        </section>
      </div>
    </AppShell>
  );
}
