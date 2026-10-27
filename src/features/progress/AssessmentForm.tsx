"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { saveStageAction } from "@/app/progress/actions";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { GroupBadge } from "@/components/GroupBadge";
import { useT } from "@/i18n/client";
import type { StageId } from "@/server/progress/calc";
import { COMPETENCIES, type CompetencyCode } from "@/server/progress/competencies";
import type { StageAvailability } from "@/server/progress/calc";
import { Dialog } from "./Dialog";
import {
  countAssessed,
  isDirty,
  parseScoreInput,
  sliderKey,
  sliderPosition,
  toDraft,
  toPayload,
  type Draft,
} from "./draft";
import { fmt, saveErrorMessage, stageLabel, type PT } from "./format";
import { assessHref, studentHref, type CohortFilters } from "./nav";

export interface StageOption {
  stage: StageId;
  availability: StageAvailability;
}

function lockedText(t: PT, a: StageAvailability): string | null {
  if (a.available) return null;
  switch (a.reason) {
    case "prior_unscored":
      return fmt(t.assess.stageLockedPrior, { stage: stageLabel(t, a.requires) });
    case "final_needs_module":
      return t.assess.stageLockedFinal;
    case "not_configured":
      return t.assess.stageLockedNotConfigured;
    default:
      return t.assess.stageLockedUnknown;
  }
}

type Banner = { kind: "conflict" } | { kind: "network" } | { kind: "error"; text: string } | null;

export function AssessmentForm({
  enrollmentId,
  cohortId,
  stage,
  initialVersion,
  initialScores,
  previous,
  readOnly,
  locked,
  stages,
  filters,
}: {
  enrollmentId: string;
  cohortId: string;
  stage: StageId;
  initialVersion: number;
  initialScores: Record<CompetencyCode, number | null>;
  previous: Record<CompetencyCode, { stage: StageId; score: number } | null>;
  readOnly: boolean;
  /** The stage is not open yet: show the explanation instead of the rows. */
  locked: boolean;
  stages: StageOption[];
  filters: CohortFilters;
}) {
  const t = useT().progress;
  const router = useRouter();
  const [base, setBase] = useState<Draft>(() => toDraft(initialScores));
  const [version, setVersion] = useState(initialVersion);
  const [draft, setDraft] = useState<Draft>(() => toDraft(initialScores));
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const [guard, setGuard] = useState<{ href: string } | null>(null);
  const leaving = useRef(false);

  const dirty = !readOnly && isDirty(base, draft);
  const assessed = countAssessed(draft);
  const backHref = studentHref(cohortId, enrollmentId, filters);

  const edit = (code: CompetencyCode, value: number | null) => {
    setSavedMsg(false);
    setDraft((d) => ({ ...d, [code]: value }));
  };

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setBanner(null);
    setSavedMsg(false);
    try {
      const r = await saveStageAction(enrollmentId, stage, toPayload(draft), version);
      if (r.ok) {
        setBase(toDraft(r.value.scores));
        setVersion(r.value.version);
        setSavedMsg(true);
        return true;
      }
      if (r.error.code === "stage_conflict") {
        // Show the latest saved values; the attempted edit stays in the fields.
        setBase(toDraft(r.error.currentScores));
        setVersion(r.error.currentVersion);
        setBanner({ kind: "conflict" });
      } else {
        setBanner({ kind: "error", text: saveErrorMessage(t, r.error.code) });
      }
      return false;
    } catch {
      setBanner({ kind: "network" });
      return false;
    } finally {
      setSaving(false);
    }
  }, [draft, enrollmentId, stage, t, version]);

  const navigate = useCallback(
    (href: string) => {
      leaving.current = true;
      router.push(href);
    },
    [router],
  );
  const guarded = useCallback(
    (href: string) => {
      if (dirty) setGuard({ href });
      else navigate(href);
    },
    [dirty, navigate],
  );

  // Hard navigation / tab close.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // In-app link clicks (nav rail, back links) while there are unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.origin !== window.location.origin) return;
      if (a.pathname + a.search === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setGuard({ href: a.pathname + a.search });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty]);

  const lockedStages = stages.filter((s) => !s.availability.available);
  const groups = (["basic", "system"] as const).map((g) => ({ group: g, items: COMPETENCIES.filter((c) => c.group === g) }));

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={t.assess.stageSelector} className="flex flex-col gap-2">
        <ul className="p-chips">
          {stages.map((s) => {
            const ok = s.availability.available;
            const href = assessHref(cohortId, enrollmentId, s.stage, filters);
            return (
              <li key={s.stage}>
                <button
                  type="button"
                  className={`p-chip ${ok ? "" : "p-chip-locked"} ${s.stage === stage ? "p-chip-current" : ""}`}
                  aria-current={s.stage === stage ? "step" : undefined}
                  aria-disabled={ok ? undefined : "true"}
                  aria-describedby={ok ? undefined : `lock-${s.stage}`}
                  onClick={() => (ok && s.stage !== stage ? guarded(href) : undefined)}
                >
                  {stageLabel(t, s.stage)}
                </button>
              </li>
            );
          })}
        </ul>
        {lockedStages.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {lockedStages.map((s) => (
              <li key={s.stage} id={`lock-${s.stage}`} className="p-muted">
                <b>{stageLabel(t, s.stage)}.</b> {lockedText(t, s.availability)}
              </li>
            ))}
          </ul>
        ) : null}
      </nav>

      {readOnly ? <div className="p-alert p-alert-warn">{t.assess.readOnly}</div> : null}

      {banner?.kind === "conflict" ? (
        <div role="alert" className="p-alert p-alert-warn">
          {t.assess.conflictTitle}
          <p>{t.assess.conflictBody}</p>
          <div className="p-row">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setDraft(base);
                setBanner(null);
              }}
            >
              {t.assess.loadSaved}
            </Button>
          </div>
        </div>
      ) : null}
      {banner?.kind === "network" ? (
        <div role="alert" className="p-alert p-alert-error">
          {t.assess.networkTitle}
          <p>{t.assess.networkBody}</p>
          <div>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {t.retry}
            </Button>
          </div>
        </div>
      ) : null}
      {banner?.kind === "error" ? (
        <div role="alert" className="p-alert p-alert-error">
          {t.assess.errorTitle}
          <p>{banner.text}</p>
        </div>
      ) : null}

      {locked ? (
        <Card title={t.assess.lockedHeading}>
          <p>{lockedText(t, stages.find((x) => x.stage === stage)?.availability ?? { available: false, reason: "unknown_stage" })}</p>
          <div>
            <Button variant="secondary" onClick={() => guarded(backHref)}>
              {t.back}
            </Button>
          </div>
        </Card>
      ) : null}

      {(locked ? [] : groups).map(({ group, items }) => {
        const k = items.filter((c) => draft[c.code] !== null).length;
        return (
          <Card key={group} as="section" aria-labelledby={`g-${group}`}>
            <div className="p-row" style={{ justifyContent: "space-between" }}>
              <h2 id={`g-${group}`} className="m-0">
                <GroupBadge group={group}>{t.group[group]}</GroupBadge>
              </h2>
              <span className="p-muted">{fmt(t.assess.groupCount, { k, n: items.length })}</span>
            </div>
            <div>
              {items.map((c) => {
                const label = t.competency[c.code];
                const value = draft[c.code];
                const prev = previous[c.code];
                const saved = base[c.code];
                const showSaved = banner?.kind === "conflict" && saved !== value;
                return (
                  <div key={c.code} className="p-assess-row">
                    <div className="p-area-label">
                      <label htmlFor={`n-${c.code}`} className="p-assess-label">
                        {label}
                      </label>
                      <span className="p-assess-hint">
                        {prev ? fmt(t.assess.previous, { score: prev.score, stage: stageLabel(t, prev.stage) }) : t.assess.previousNone}
                      </span>
                      {showSaved ? (
                        <span className="p-saved-marker">
                          {saved === null ? t.assess.conflictSavedNone : fmt(t.assess.conflictSaved, { score: saved })}
                        </span>
                      ) : null}
                    </div>
                    <input
                      type="range"
                      className={`p-slider p-area-slider ${group === "system" ? "p-slider-system" : ""}`}
                      min={0}
                      max={10}
                      step={1}
                      value={sliderPosition(value)}
                      data-empty={value === null}
                      disabled={readOnly}
                      aria-label={fmt(t.assess.slider, { label })}
                      aria-valuetext={value === null ? t.unassessed : `${value}`}
                      onChange={(e) => edit(c.code, Number(e.target.value))}
                      onPointerUp={(e) => {
                        // An unassessed row rests at 0: a tap on it should still record the position.
                        if (value === null) edit(c.code, Number((e.target as HTMLInputElement).value));
                      }}
                      onKeyDown={(e) => {
                        const next = sliderKey(e.key, value);
                        if (next !== null) {
                          e.preventDefault();
                          edit(c.code, next);
                        }
                      }}
                    />
                    <input
                      id={`n-${c.code}`}
                      className="y-input p-assess-num p-area-num"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={2}
                      value={value === null ? "" : String(value)}
                      placeholder={t.dash}
                      disabled={readOnly}
                      aria-label={fmt(t.assess.number, { label })}
                      onChange={(e) => {
                        const parsed = parseScoreInput(e.target.value);
                        if (parsed !== undefined) edit(c.code, parsed);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-area-clear"
                      disabled={readOnly || value === null}
                      aria-label={fmt(t.assess.clearRow, { label })}
                      onClick={() => edit(c.code, null)}
                    >
                      {t.assess.clear}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}

      {locked ? null : (
      <div className="p-sticky-bar">
        <div role="status" aria-live="polite" className="text-body-strong">
          {fmt(t.assess.assessed, { k: assessed })}
          {savedMsg && !dirty ? <span className="ml-3 text-mint-ink">{t.assess.saved}</span> : null}
        </div>
        <div className="p-row">
          <Button variant="secondary" onClick={() => guarded(backHref)}>
            {t.assess.cancel}
          </Button>
          <Button onClick={() => void save()} disabled={readOnly || saving || !dirty}>
            {saving ? t.saving : t.assess.save}
          </Button>
        </div>
      </div>
      )}

      <Dialog
        open={guard !== null}
        onClose={() => setGuard(null)}
        title={t.assess.unsavedTitle}
        actions={
          <>
            <Button variant="ghost" onClick={() => setGuard(null)}>
              {t.assess.stay}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const href = guard!.href;
                setGuard(null);
                navigate(href);
              }}
            >
              {t.assess.discard}
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                const href = guard!.href;
                if (await save()) {
                  setGuard(null);
                  navigate(href);
                } else {
                  setGuard(null);
                }
              }}
            >
              {t.assess.saveAndLeave}
            </Button>
          </>
        }
      >
        {t.assess.unsavedBody}
      </Dialog>
    </div>
  );
}
