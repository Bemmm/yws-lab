"use client";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useT } from "@/i18n/client";

export default function ProgressError({ reset }: { error: Error; reset: () => void }) {
  const t = useT().progress;
  return (
    <div className="p-page" style={{ padding: 16 }}>
      <Card>
        <h1 className="text-h2">{t.errors.title}</h1>
        <p>{t.errors.body}</p>
        <div>
          <Button onClick={reset}>{t.retry}</Button>
        </div>
      </Card>
    </div>
  );
}
