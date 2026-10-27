"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { archiveEnrollmentAction, restoreEnrollmentAction, setStartingProfileAction } from "@/app/progress/actions";
import { Button } from "@/components/Button";
import { useT } from "@/i18n/client";
import { Dialog } from "./Dialog";
import { errorMessage } from "./format";
import { cohortHref, PROFILES, type CohortFilters, type Profile } from "./nav";

/** Starting-profile edit and archive / restore (with confirmation) for one enrollment. */
export function EnrollmentControls({
  enrollmentId,
  cohortId,
  profile,
  archived,
  readOnly,
  filters,
}: {
  enrollmentId: string;
  cohortId: string;
  profile: Profile;
  archived: boolean;
  readOnly: boolean;
  filters: CohortFilters;
}) {
  const t = useT().progress;
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<Profile>(profile);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const saveProfile = () =>
    start(async () => {
      try {
        const r = await setStartingProfileAction(enrollmentId, value);
        if (r.ok) {
          setEditing(false);
          setMsg({ ok: true, text: t.student.profileSaved });
          router.refresh();
        } else setMsg({ ok: false, text: errorMessage(t, r.error) });
      } catch {
        setMsg({ ok: false, text: t.errors.generic });
      }
    });

  const toggleArchive = () =>
    start(async () => {
      try {
        const r = await (archived ? restoreEnrollmentAction(enrollmentId) : archiveEnrollmentAction(enrollmentId));
        if (r.ok) {
          setConfirm(false);
          if (archived) router.refresh();
          else router.push(cohortHref(cohortId, filters));
        } else {
          setConfirm(false);
          setMsg({ ok: false, text: errorMessage(t, r.error) });
        }
      } catch {
        setConfirm(false);
        setMsg({ ok: false, text: t.errors.generic });
      }
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="p-row">
        {readOnly ? null : (
          <>
            <Button variant="secondary" size="sm" onClick={() => { setValue(profile); setEditing((v) => !v); }} aria-expanded={editing}>
              {t.student.editProfile}
            </Button>
            <Button variant={archived ? "secondary" : "danger"} size="sm" onClick={() => setConfirm(true)}>
              {archived ? t.student.restore : t.student.archive}
            </Button>
          </>
        )}
      </div>
      {editing ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="p-visually-hidden">{t.student.startingProfile}</legend>
          <div className="p-picklist">
            {PROFILES.map((p) => (
              <label key={p} className="p-radio">
                <input type="radio" name="edit-profile" checked={value === p} onChange={() => setValue(p)} />
                <div>
                  <b>{t.profile[p]}</b>
                  <span>{t.profile[`${p}Hint` as const]}</span>
                </div>
              </label>
            ))}
          </div>
          <p className="p-muted">{t.student.profileNote}</p>
          <div className="p-row">
            <Button size="sm" onClick={saveProfile} disabled={pending || value === profile}>
              {pending ? t.saving : t.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t.cancel}
            </Button>
          </div>
        </fieldset>
      ) : null}
      {msg ? (
        <div role={msg.ok ? "status" : "alert"} className={`p-alert ${msg.ok ? "p-alert-ok" : "p-alert-error"}`}>
          {msg.text}
        </div>
      ) : null}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={archived ? t.student.restoreTitle : t.student.archiveTitle}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {t.cancel}
            </Button>
            <Button variant={archived ? "primary" : "danger"} onClick={toggleArchive} disabled={pending}>
              {archived ? t.student.restoreConfirm : t.student.archiveConfirm}
            </Button>
          </>
        }
      >
        {archived ? t.student.restoreBody : t.student.archiveBody}
      </Dialog>
    </div>
  );
}
