import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { getDictionary } from "@/i18n/server";
import { requireMethodologist } from "@/server/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).nav.progress };
}

export default async function ProgressPage() {
  await requireMethodologist();
  const t = await getDictionary();
  return (
    <AppShell active="progress">
      <h1 className="mb-5 text-h1">{t.nav.progress}</h1>
    </AppShell>
  );
}
