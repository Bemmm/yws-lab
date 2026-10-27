import { Card } from "@/components/Card";
import { orderStages, type DynamicsLabel } from "@/server/progress/calc";
import { COMPETENCIES } from "@/server/progress/competencies";
import type { CohortOverview } from "@/server/progress/service";
import { fmt, formatGain, stageLabel, type PT } from "./format";

const ORDER: DynamicsLabel[] = ["rapid", "steady", "stagnation", "attention", "only_point0", "point0_incomplete"];

/** Whole-cohort summary: never affected by the card filters. Denominators are always shown. */
export function GroupSummaryView({ overview, t, locale }: { overview: CohortOverview; t: PT; locale: string }) {
  const { summary, totalActive, cohort } = overview;
  const stages = orderStages(cohort.modules);
  return (
    <section aria-labelledby="summary-h" className="flex flex-col gap-3">
      <div>
        <h2 id="summary-h" className="text-h2">{t.summary.title}</h2>
        <p className="p-muted">{fmt(t.summary.scope, { n: totalActive })}</p>
      </div>
      <div className="p-two">
        <Card title={t.summary.dynamics}>
          <p className="p-muted">{t.summary.dynamicsHint}</p>
          <div className="p-tiles">
            {ORDER.map((l) => (
              <div key={l} className="p-tile">
                <b>{summary.dynamicsCounts[l]}</b>
                <span>{t.dynamics[l]}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title={t.summary.completeByStage}>
          <p className="p-muted">{t.summary.completeByStageHint}</p>
          <div className="p-tiles">
            {stages.map((s) => (
              <div key={s} className="p-tile">
                <b>
                  {summary.completeByStage[s] ?? 0}
                  <span style={{ fontSize: "var(--text-caption)", fontWeight: 600, marginLeft: 4 }}>/ {totalActive}</span>
                </b>
                <span>{stageLabel(t, s)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title={t.summary.gain}>
        <p className="p-muted">{t.summary.gainHint}</p>
        <div className="p-two" style={{ gap: "var(--space-6)" }}>
          {(["basic", "system"] as const).map((g) => (
            <div key={g}>
              <h3 className="mb-1 text-body-strong">{t.group[g]}</h3>
              <ul className="p-gain-list">
                {COMPETENCIES.filter((c) => c.group === g).map((c) => {
                  const row = summary.competencyGain[c.code];
                  return (
                    <li key={c.code} className={`p-gain-${g}`}>
                      <i aria-hidden="true" />
                      <span>{t.competency[c.code]}</span>
                      <strong>{row.mean !== null ? formatGain(row.mean, locale) : t.summary.noGain}</strong>
                      <span className="p-muted">({fmt(t.summary.of, { k: row.students, n: totalActive })})</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
