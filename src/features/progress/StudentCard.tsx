import Link from "next/link";
import { Card } from "@/components/Card";
import { DynamicsPill } from "@/components/DynamicsPill";
import { SkillBar } from "@/components/SkillBar";
import type { OverviewCard } from "@/server/progress/service";
import { attentionReason, formatGain, formatLevel, fmt, pillStatus, stageLabel, type PT } from "./format";
import { assessHref, nextAssessStage, studentHref, type CohortFilters } from "./nav";

export function StudentCard({
  card,
  cohortId,
  modules,
  filters,
  readOnly,
  t,
  locale,
}: {
  card: OverviewCard;
  cohortId: string;
  modules: number[];
  filters: CohortFilters;
  readOnly: boolean;
  t: PT;
  locale: string;
}) {
  const reason = attentionReason(t, card.dynamics, locale);
  const open = studentHref(cohortId, card.enrollmentId, filters);
  const assess = assessHref(
    cohortId,
    card.enrollmentId,
    nextAssessStage(modules, card.currentStage, card.currentStageScored),
    filters,
  );
  const partial =
    card.currentStage && card.currentLevelStage !== card.currentStage
      ? fmt(t.card.partial, { stage: stageLabel(t, card.currentStage), k: card.currentStageScored })
      : null;

  return (
    <Card as="article" className="p-student" aria-labelledby={`st-${card.enrollmentId}`}>
      <div>
        <h3 id={`st-${card.enrollmentId}`}>
          <Link href={open} className="p-link-quiet" style={{ color: "inherit", fontWeight: 800 }}>
            {card.displayName}
          </Link>
        </h3>
        <p className="p-muted">{t.profile[card.startingProfile]}</p>
      </div>

      <div className="p-metrics">
        <div className="p-metric">
          <small>{t.card.level}</small>
          <b>
            {card.currentLevel !== null && card.currentLevelStage
              ? fmt(t.card.levelAt, { level: formatLevel(card.currentLevel, locale), stage: stageLabel(t, card.currentLevelStage) })
              : t.dash}
          </b>
        </div>
        <div className="p-metric">
          <small>{t.card.gain}</small>
          <b>{card.gainFromPoint0 !== null ? formatGain(card.gainFromPoint0, locale) : t.card.noGain}</b>
        </div>
      </div>
      {card.currentLevel === null ? <p className="p-muted">{partial ?? t.card.noLevel}</p> : partial ? <p className="p-muted">{partial}</p> : null}

      <div>
        <DynamicsPill status={pillStatus(card.dynamics.label)}>{t.dynamics[card.dynamics.label]}</DynamicsPill>
        {reason ? <p className="p-reason" style={{ marginTop: 6 }}>{reason}</p> : null}
      </div>

      <div className="flex flex-col gap-3">
        <SkillBar
          compact
          group="basic"
          label={t.card.basicBar}
          value={card.basicLevel}
          display={card.basicLevel !== null ? formatLevel(card.basicLevel, locale) : undefined}
          emptyLabel={t.dash}
        />
        <SkillBar
          compact
          group="system"
          label={t.card.systemBar}
          value={card.systemLevel}
          display={card.systemLevel !== null ? formatLevel(card.systemLevel, locale) : undefined}
          emptyLabel={t.dash}
        />
      </div>

      <div className="p-row mt-auto pt-1">
        {readOnly ? null : (
          <Link href={assess} className="y-btn y-btn-primary">
            {t.card.assess}
          </Link>
        )}
        <Link href={open} className="y-btn y-btn-secondary">
          {t.card.open}
        </Link>
      </div>
    </Card>
  );
}
