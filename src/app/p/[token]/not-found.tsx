import { Card } from "@/components/Card";
import { Logo } from "@/components/Logo";
import { getDictionary } from "@/i18n/server";

/** Identical for invalid, malformed, revoked and deleted-plan tokens: no title, no owner, no hint. */
export default async function SharedPlanUnavailable() {
  const t = await getDictionary();
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-page p-4">
      <Card className="w-full max-w-sm items-center text-center">
        <Logo alt={t.app.name} size={72} />
        <h1 className="text-h2">{t.builder.shared.unavailableTitle}</h1>
        <p>{t.builder.shared.unavailableBody}</p>
      </Card>
    </main>
  );
}
