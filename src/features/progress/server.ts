import "server-only";
import { notFound } from "next/navigation";
import type { Result } from "@/server/progress/service";

/** Missing / malformed ids are a plain 404; real faults surface to the error boundary. */
export function unwrap<T>(r: Result<T>): T {
  if (r.ok) return r.value;
  if (r.error.code === "not_found" || r.error.code === "invalid_input") notFound();
  throw new Error(`progress: ${r.error.code}`);
}

export async function resolveParams<T extends Record<string, string | string[] | undefined>>(sp: Promise<T> | undefined): Promise<T> {
  return sp ? await sp : ({} as T);
}
