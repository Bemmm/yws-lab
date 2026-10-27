"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCohortAction } from "@/app/progress/actions";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { useT } from "@/i18n/client";
import { errorMessage } from "./format";

export function CreateCohortForm() {
  const t = useT().progress;
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || name.trim().length > 80) {
      setError(t.cohorts.nameHint);
      return;
    }
    start(async () => {
      try {
        const r = await createCohortAction({ name, startDate: startDate || null, endDate: endDate || null });
        if (r.ok) router.push(`/progress/cohorts/${r.value.id}`);
        else setError(errorMessage(t, r.error));
      } catch {
        setError(t.cohorts.createdError);
      }
    });
  };

  return (
    <Card title={t.cohorts.createTitle}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Input
          label={t.cohorts.name}
          hint={t.cohorts.nameHint}
          value={name}
          maxLength={80}
          required
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          error={error && !name.trim() ? error : undefined}
        />
        <div className="p-two">
          <Input type="date" label={t.cohorts.startDate} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <Input type="date" label={t.cohorts.endDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        {error && name.trim() ? (
          <div role="alert" className="p-alert p-alert-error">
            {error}
          </div>
        ) : null}
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? t.saving : t.cohorts.create}
          </Button>
        </div>
      </form>
    </Card>
  );
}
