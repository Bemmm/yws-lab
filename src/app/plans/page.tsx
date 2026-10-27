import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/Card";
import { getDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).plans.title };
}

export default async function PlansPage() {
  const t = await getDictionary();
  return (
    <AppShell active="plans">
      <h1 className="mb-5 text-h1">{t.plans.title}</h1>
      <Card>
        <p>{t.plans.placeholder}</p>
      </Card>
    </AppShell>
  );
}
