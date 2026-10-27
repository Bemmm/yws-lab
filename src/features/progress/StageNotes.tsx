import type { StudentProgressView } from "@/server/progress/service";
import { stageLabel, type PT } from "./format";

/** Curator observations per stage, in stage order. Stages without a note are omitted. */
export function StageNotes({ view, t }: { view: StudentProgressView; t: PT }) {
  const items = view.stages.filter((s) => s.note !== null);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="notes-h" className="flex flex-col gap-2">
      <h3 id="notes-h" className="text-body-strong">
        {t.student.observationsTitle}
      </h3>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {items.map((s) => (
          <li key={s.stage} data-testid={`note-${s.stage}`}>
            <b>{stageLabel(t, s.stage)}</b>
            <p className="m-0" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {s.note}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
