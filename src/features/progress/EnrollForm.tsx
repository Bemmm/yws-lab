"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { enrollAction, searchStudentsAction } from "@/app/progress/actions";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { useT } from "@/i18n/client";
import type { StudentRecord } from "@/server/progress/service";
import { errorMessage, fmt } from "./format";
import { PROFILES, studentHref, type Profile } from "./nav";

export function EnrollForm({ cohortId, readOnly }: { cohortId: string; readOnly: boolean }) {
  const t = useT().progress;
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentRecord[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StudentRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ enrollmentId: string; archived: boolean } | null>(null);
  const [touched, setTouched] = useState(false);
  const [pending, start] = useTransition();
  const seq = useRef(0);

  // Debounced roster search by name / contact.
  useEffect(() => {
    const q = query.trim();
    const mine = ++seq.current;
    if (!q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset the list when the query is cleared
      setResults(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const r = await searchStudentsAction(q);
        if (mine === seq.current) setResults(r.ok ? r.value : []);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    setDuplicate(null);
    if (!profile) return;
    if (!selected && !(creating && name.trim())) return;
    start(async () => {
      try {
        const r = await enrollAction({
          cohortId,
          startingProfile: profile,
          student: selected
            ? { studentId: selected.id }
            : { newStudent: { displayName: name, contact: contact || null, note: note || null } },
        });
        if (r.ok) {
          router.push(studentHref(cohortId, r.value.id));
        } else if (r.error.code === "already_enrolled") {
          setDuplicate({ enrollmentId: r.error.enrollmentId, archived: r.error.archived });
        } else if (r.error.code === "duplicate_contact") {
          setError(t.enroll.duplicateContact);
        } else {
          setError(errorMessage(t, r.error));
        }
      } catch {
        setError(t.errors.generic);
      }
    });
  };

  const needPerson = touched && !selected && !(creating && name.trim());

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Card title={t.enroll.searchTitle}>
        <Input
          type="search"
          label={t.enroll.searchLabel}
          hint={t.enroll.searchHint}
          value={query}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        <div aria-live="polite">
          {searching ? <p className="p-muted">{t.enroll.searching}</p> : null}
          {results && !searching && results.length === 0 ? <p>{t.enroll.noResults}</p> : null}
        </div>
        {results && results.length > 0 ? (
          <fieldset className="m-0 border-0 p-0">
            <legend className="p-visually-hidden">{t.enroll.results}</legend>
            <div className="p-picklist">
              {results.map((s) => (
                <label key={s.id} className="p-radio">
                  <input
                    type="radio"
                    name="student"
                    checked={selected?.id === s.id}
                    onChange={() => {
                      setSelected(s);
                      setCreating(false);
                      setDuplicate(null);
                    }}
                  />
                  <div>
                    <b>
                      {s.displayName}
                      {s.archived ? <span className="p-muted"> · {t.enroll.archivedBadge}</span> : null}
                    </b>
                    {s.contact ? <span>{s.contact}</span> : null}
                  </div>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        {selected ? (
          <p role="status" className="text-body-strong" style={{ color: "var(--ink)" }}>
            {fmt(t.enroll.selected, { name: selected.displayName })}
          </p>
        ) : null}
      </Card>

      <Card title={t.enroll.newTitle}>
        {!creating ? (
          <div>
            <Button
              variant="secondary"
              onClick={() => {
                setCreating(true);
                setSelected(null);
              }}
            >
              {t.enroll.newToggle}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input
              label={t.enroll.name}
              value={name}
              maxLength={120}
              required
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              error={touched && !name.trim() ? t.enroll.nameRequired : undefined}
            />
            <Input
              label={t.enroll.contact}
              hint={t.enroll.contactHint}
              value={contact}
              maxLength={200}
              autoComplete="off"
              onChange={(e) => setContact(e.target.value)}
            />
            <label className="y-field">
              {t.enroll.note}
              <textarea className="p-textarea" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
              <span className="y-field-hint">{t.enroll.noteHint}</span>
            </label>
          </div>
        )}
      </Card>

      <Card title={t.enroll.profileTitle}>
        <fieldset className="m-0 border-0 p-0" aria-describedby={touched && !profile ? "profile-err" : undefined}>
          <legend className="p-visually-hidden">{t.enroll.profileTitle}</legend>
          <div className="p-picklist">
            {PROFILES.map((p) => (
              <label key={p} className="p-radio">
                <input type="radio" name="profile" checked={profile === p} onChange={() => setProfile(p)} />
                <div>
                  <b>{t.profile[p]}</b>
                  <span>{t.profile[`${p}Hint` as const]}</span>
                </div>
              </label>
            ))}
          </div>
        </fieldset>
        {touched && !profile ? (
          <p id="profile-err" role="alert" className="y-field-error">
            {t.enroll.profileRequired}
          </p>
        ) : null}
      </Card>

      {needPerson ? (
        <div role="alert" className="p-alert p-alert-error">
          {t.enroll.pickOrCreate}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="p-alert p-alert-error">
          {error}
        </div>
      ) : null}
      {duplicate ? (
        <div role="alert" className="p-alert p-alert-warn">
          {duplicate.archived ? t.enroll.alreadyInArchived : t.enroll.alreadyIn}
          <div>
            <Link href={studentHref(cohortId, duplicate.enrollmentId)} className="y-btn y-btn-secondary y-btn-sm">
              {t.enroll.openExisting}
            </Link>
          </div>
        </div>
      ) : null}

      <div className="p-row">
        <Button type="submit" size="lg" disabled={pending || readOnly}>
          {pending ? t.enroll.adding : t.enroll.add}
        </Button>
        <Link href={`/progress/cohorts/${cohortId}`} className="y-btn y-btn-ghost">
          {t.cancel}
        </Link>
      </div>
    </form>
  );
}
