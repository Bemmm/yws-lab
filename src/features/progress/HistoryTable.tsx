import { Fragment } from "react";
import { COMPETENCIES } from "@/server/progress/competencies";
import type { StudentProgressView } from "@/server/progress/service";
import { fmt, formatLevel, stageLabel, type PT } from "./format";
import { Sparkline } from "./Sparkline";

/** Rows: total / basic / system level, 16 competencies. Columns: Point 0, selected modules, Final (empty stages stay visible). */
export function HistoryTable({ view, t, locale }: { view: StudentProgressView; t: PT; locale: string }) {
  const { stages } = view;
  const stageIds = stages.map((s) => s.stage);

  const levelCell = (s: (typeof stages)[number], kind: "level" | "basicLevel" | "systemLevel") => {
    if (s.complete) return <td key={s.stage}>{formatLevel(s[kind], locale)}</td>;
    if (s.scored > 0) {
      return (
        <td key={s.stage} className="p-partial">
          {fmt(t.student.partialCell, { k: s.scored })}
        </td>
      );
    }
    return (
      <td key={s.stage} className="p-empty">
        {t.dash}
      </td>
    );
  };

  const levelRow = (label: string, kind: "level" | "basicLevel" | "systemLevel") => (
    <tr className="p-hist-level">
      <th scope="row">{label}</th>
      {stages.map((s) => levelCell(s, kind))}
      <td className="p-empty">{t.dash}</td>
    </tr>
  );

  return (
    <div className="p-scroll" role="region" aria-label={t.student.historyTitle} tabIndex={0}>
      <table className="p-hist">
        <caption className="p-visually-hidden">{t.student.historyTitle}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="p-visually-hidden">{t.student.competency}</span>
            </th>
            {stages.map((s) => (
              <th key={s.stage} scope="col">
                {stageLabel(t, s.stage)}
              </th>
            ))}
            <th scope="col">{t.student.trend}</th>
          </tr>
        </thead>
        <tbody>
          {levelRow(t.student.rowTotal, "level")}
          {levelRow(t.student.rowBasic, "basicLevel")}
          {levelRow(t.student.rowSystem, "systemLevel")}
          {(["basic", "system"] as const).map((g) => (
            <Fragment key={g}>{groupRows(g)}</Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );

  function groupRows(group: "basic" | "system") {
    return (
      <>
        <tr className="p-group-row">
          <th scope="colgroup" colSpan={stages.length + 2}>
            {t.group[group]}
          </th>
        </tr>
        {COMPETENCIES.filter((c) => c.group === group).map((c) => {
          const values = stages.map((s) => s.scores[c.code]);
          return (
            <tr key={c.code}>
              <th scope="row">{t.competency[c.code]}</th>
              {values.map((v, i) =>
                v === null ? (
                  <td key={stageIds[i]} className="p-empty">
                    {t.dash}
                  </td>
                ) : (
                  <td key={stageIds[i]}>{v}</td>
                ),
              )}
              <td>
                <Sparkline values={values} stages={stageIds} label={t.competency[c.code]} group={group} t={t} />
              </td>
            </tr>
          );
        })}
      </>
    );
  }
}
