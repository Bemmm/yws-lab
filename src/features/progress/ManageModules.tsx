"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setModulesAction } from "@/app/progress/actions";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useT } from "@/i18n/client";
import { Dialog } from "./Dialog";
import { errorMessage, fmt } from "./format";

const ALL = Array.from({ length: 12 }, (_, i) => i + 1);

type Notice =
  | { kind: "ok" }
  | { kind: "error"; text: string; details?: string[] }
  | { kind: "conflict"; modules: number[] };

export function ManageModules({
  cohortId,
  modules,
  version,
  scoredModules,
  readOnly,
}: {
  cohortId: string;
  modules: number[];
  version: number;
  /** Modules that already carry scores (cannot be removed). */
  scoredModules: { moduleNumber: number; students: number; scores: number }[];
  readOnly: boolean;
}) {
  const t = useT().progress;
  const router = useRouter();
  const [picked, setPicked] = useState<number[]>([]);
  const [removing, setRemoving] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, start] = useTransition();
  const available = ALL.filter((n) => !modules.includes(n));

  const submit = (next: number[], after?: () => void) => {
    setNotice(null);
    start(async () => {
      try {
        const r = await setModulesAction(cohortId, next, version);
        if (r.ok) {
          setPicked([]);
          setNotice({ kind: "ok" });
          router.refresh();
        } else if (r.error.code === "version_conflict") {
          setNotice({ kind: "conflict", modules: r.error.currentModules });
        } else if (r.error.code === "module_has_scores") {
          setNotice({
            kind: "error",
            text: fmt(t.modules.hasScores, { list: r.error.modules.map((m) => m.moduleNumber).join(", "), n: r.error.affectedCount }),
            details: r.error.modules.map((m) => fmt(t.modules.hasScoresDetail, { n: m.moduleNumber, students: m.students, scores: m.scores })),
          });
        } else {
          setNotice({ kind: "error", text: errorMessage(t, r.error) });
        }
      } catch {
        setNotice({ kind: "error", text: t.errors.generic });
      }
      after?.();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {readOnly ? <div className="p-alert p-alert-warn">{t.modules.archived}</div> : null}
      {notice?.kind === "ok" ? (
        <div role="status" className="p-alert p-alert-ok">
          {t.modules.saved}
        </div>
      ) : null}
      {notice?.kind === "error" ? (
        <div role="alert" className="p-alert p-alert-error">
          {notice.text}
          {notice.details ? (
            <ul className="m-0 list-disc pl-5 font-medium">
              {notice.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {notice?.kind === "conflict" ? (
        <div role="alert" className="p-alert p-alert-warn">
          {t.modules.conflictTitle}
          <p>{fmt(t.modules.conflictBody, { list: notice.modules.length ? notice.modules.join(", ") : t.dash })}</p>
          <div>
            <Button size="sm" onClick={() => router.refresh()}>
              {t.modules.refresh}
            </Button>
          </div>
        </div>
      ) : null}

      <Card title={t.modules.selected}>
        {modules.length === 0 ? (
          <p>{t.modules.noneSelected}</p>
        ) : (
          <ul className="p-picklist">
            {modules.map((n) => {
              const scored = scoredModules.find((m) => m.moduleNumber === n);
              return (
                <li key={n} className="p-row" style={{ justifyContent: "space-between" }}>
                  <span className="text-body-strong">
                    {fmt(t.stage.module, { n })}
                    {scored ? (
                      <span className="p-muted block">{fmt(t.modules.scoredDetail, { scores: scored.scores, students: scored.students })}</span>
                    ) : null}
                  </span>
                  {readOnly || scored ? null : (
                    <Button variant="danger" size="sm" disabled={pending} onClick={() => setRemoving(n)} aria-label={fmt(t.modules.remove, { n })}>
                      {fmt(t.modules.remove, { n })}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card title={t.modules.available}>
        <p>{t.modules.intro}</p>
        {available.length === 0 ? (
          <p>{t.modules.noneAvailable}</p>
        ) : (
          <fieldset className="m-0 border-0 p-0" disabled={readOnly || pending}>
            <legend className="p-visually-hidden">{t.modules.available}</legend>
            <div className="p-numgrid">
              {available.map((n) => (
                <label key={n} className="p-num">
                  <input
                    type="checkbox"
                    checked={picked.includes(n)}
                    onChange={(e) => setPicked((p) => (e.target.checked ? [...p, n].sort((a, b) => a - b) : p.filter((x) => x !== n)))}
                  />
                  {fmt(t.modules.pick, { n })}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <Button
            disabled={readOnly || pending || picked.length === 0}
            onClick={() => submit([...modules, ...picked])}
            title={picked.length === 0 ? t.modules.addNone : undefined}
          >
            {pending ? t.saving : fmt(t.modules.add, { n: picked.length })}
          </Button>
        </div>
      </Card>

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={fmt(t.modules.removeTitle, { n: removing ?? "" })}
        actions={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t.cancel}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const n = removing!;
                submit(modules.filter((m) => m !== n), () => setRemoving(null));
              }}
            >
              {t.modules.removeConfirm}
            </Button>
          </>
        }
      >
        {t.modules.removeBody}
      </Dialog>
    </div>
  );
}
