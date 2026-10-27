import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanEditor } from "@/features/builder/plan-editor";
import { getDictionary } from "@/i18n/server";
import { requireAccount } from "@/server/auth/session";
import { getPlan } from "@/server/plans/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).plans.title };
}

/** Editor: full-bleed (no app shell), owner only. A foreign or missing id is a plain 404. */
export default async function PlanEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await requireAccount();
  const { id } = await params;
  const found = await getPlan(account.id, id);
  if (!found) notFound();
  return (
    <PlanEditor
      planId={id}
      initialProgram={found.program}
      initialVersion={found.version}
      initialShareToken={found.shareToken}
    />
  );
}
