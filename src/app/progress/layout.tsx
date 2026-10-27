import type { ReactNode } from "react";
import { requireMethodologist } from "@/server/auth/session";
import "@/styles/progress.css";

/**
 * Guard at the layout too: it renders before the loading.tsx shell is streamed, so a non-methodologist
 * gets a real 404 status (not a 200 shell that turns into "not found" later). Pages and actions still check themselves.
 */
export default async function ProgressLayout({ children }: { children: ReactNode }) {
  await requireMethodologist();
  return children;
}
