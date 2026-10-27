import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { notFound } from "next/navigation";
import { PreviewClient } from "@/features/builder/preview/preview-client";
import { shareThrottleKey } from "@/server/plans/client-ip";
import { allow } from "@/server/plans/rate-limit";
import { getSharedPlan } from "@/server/plans/service";

// Cached nowhere: revocation must take effect on the very next request.
export const dynamic = "force-dynamic";

// Once per request, so metadata + page do not double-count against the rate limit.
const lookup = cache(async (token: string) => {
  const h = await headers();
  // A throttled caller gets the same neutral 404 as an invalid token: no signal about token validity.
  // Key: client IP from Render's headers, else the token itself (see client-ip.ts).
  if (!allow(shareThrottleKey(h, token), 60, 60_000)) return null;
  return getSharedPlan(token);
});

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const program = await lookup(token);
  // Omit the key (rather than `title: undefined`) so an untitled or invalid link still gets the layout's default <title>.
  const title = program?.title.trim();
  return { ...(title ? { title } : {}), robots: { index: false, follow: false } };
}

/** Public read-only page. Not an app route: no shell, no account, no owner data. */
export default async function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const program = await lookup(token);
  if (!program) notFound();
  return <PreviewClient initialProgram={program} publicView />;
}
