import { orderStages } from "@/server/progress/calc";
import { stageLabel, type PT } from "./format";

/** Point 0 and Final fixed around the cohort's selected modules in numeric order. */
export function StageChips({ modules, t }: { modules: number[]; t: PT }) {
  const stages = orderStages(modules);
  return (
    <ol className="p-chips" aria-label={t.cohort.stages}>
      {stages.map((s) => (
        <li key={s} className={`p-chip ${s === "point0" || s === "final" ? "p-chip-fixed" : ""}`}>
          {stageLabel(t, s)}
        </li>
      ))}
    </ol>
  );
}
