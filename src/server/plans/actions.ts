"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDictionary } from "@/i18n/server";
import { format } from "@/i18n/format";
import { getCurrentAccount, requireAccount } from "@/server/auth/session";
import { createPlan, deletePlan, disableShare, duplicatePlan, enableShare, savePlan } from "./service";

/**
 * Server actions behind the editor and the library. Identity always comes from the session
 * (`requireAccount()` where a redirect to sign-in is right; `getCurrentAccount()` in mutations that must answer
 * `unauthorized` so the editor keeps unsaved edits on screen); ids from the client only select a row inside the caller's own plans.
 */

export type SavePlanResult =
  | { status: "ok"; version: number; updatedAt: string }
  | { status: "conflict"; latestVersion: number }
  | { status: "not_found" }
  | { status: "invalid" }
  | { status: "unauthorized" }
  | { status: "error" };

/** Never log document text; log the plan id and an error code only. */
function logFailure(op: string, id: string, err: unknown) {
  const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "unknown";
  console.error(`plans.${op} failed`, { id, code });
}

export async function savePlanAction(id: string, document: unknown, expectedVersion: number): Promise<SavePlanResult> {
  const account = await getCurrentAccount();
  if (!account) return { status: "unauthorized" };
  try {
    const res = await savePlan(account.id, id, document, expectedVersion);
    if (res.status === "ok") return { status: "ok", version: res.version, updatedAt: res.updatedAt.toISOString() };
    return res;
  } catch (err) {
    logFailure("save", id, err);
    return { status: "error" };
  }
}

/** Create an empty plan in the account's language and open it. */
export async function createPlanAction(): Promise<void> {
  const account = await requireAccount();
  const t = await getDictionary();
  const { id } = await createPlan(account.id, {
    title: t.builder.defaults.programTitle,
    setTitle: format(t.builder.defaults.setTitle, { n: 1 }),
  });
  revalidatePath("/plans");
  redirect(`/plans/${id}`);
}

export async function duplicatePlanAction(id: string): Promise<{ status: "ok" | "not_found" | "unauthorized" }> {
  const account = await getCurrentAccount();
  if (!account) return { status: "unauthorized" };
  const t = await getDictionary();
  const res = await duplicatePlan(account.id, id, { copySuffix: t.plans.copySuffix, untitled: t.plans.untitled });
  if (!res) return { status: "not_found" };
  revalidatePath("/plans");
  return { status: "ok" };
}

export async function deletePlanAction(id: string): Promise<{ status: "ok" | "not_found" | "unauthorized" }> {
  const account = await getCurrentAccount();
  if (!account) return { status: "unauthorized" };
  const ok = await deletePlan(account.id, id);
  revalidatePath("/plans");
  return { status: ok ? "ok" : "not_found" };
}

export async function enableShareAction(id: string): Promise<{ status: "ok"; shareToken: string } | { status: "not_found" | "unauthorized" | "error" }> {
  const account = await getCurrentAccount();
  if (!account) return { status: "unauthorized" };
  try {
    const res = await enableShare(account.id, id);
    if (!res) return { status: "not_found" };
    revalidatePath("/plans");
    return { status: "ok", shareToken: res.shareToken };
  } catch (err) {
    logFailure("enableShare", id, err);
    return { status: "error" };
  }
}

export async function disableShareAction(id: string): Promise<{ status: "ok" | "not_found" | "unauthorized" | "error" }> {
  const account = await getCurrentAccount();
  if (!account) return { status: "unauthorized" };
  try {
    const ok = await disableShare(account.id, id);
    if (ok) revalidatePath("/plans");
    return { status: ok ? "ok" : "not_found" };
  } catch (err) {
    logFailure("disableShare", id, err);
    return { status: "error" };
  }
}
