import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreviewClient } from "@/features/builder/preview/preview-client";
import { getDictionary } from "@/i18n/server";
import { requireAccount } from "@/server/auth/session";
import { getPlan } from "@/server/plans/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).builder.preview.title, robots: { index: false, follow: false } };
}

/** Owner preview + print, without the app shell. Without access: the same 404 as a missing plan. */
export default async function PlanPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const account = await requireAccount();
  const { id } = await params;
  const found = await getPlan(account.id, id);
  if (!found) notFound();
  return <PreviewClient initialProgram={found.program} backHref={`/plans/${id}`} />;
}
