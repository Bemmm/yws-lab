import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, ilike, isNull, sql } from "drizzle-orm";
import { cloneWithNewIds, newProgram, programStats, TITLE_MAX, type Program, type ProgramStats } from "@/features/builder/model";
import { getDb } from "@/server/db/client";
import { plan } from "@/server/db/schema";
import { stableStringify, validatePlanDocument } from "./document";

/**
 * Plan domain service. Every function takes the caller's `accountId` explicitly and scopes every query by
 * `owner_id = accountId AND deleted_at IS NULL`: a plan of another account is indistinguishable from a
 * missing one. Document text is never logged.
 */

export const LIBRARY_PAGE_SIZE = 24;
const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

export type PlanSummary = ProgramStats & {
  id: string;
  title: string;
  updatedAt: Date;
  shareActive: boolean;
  /** Owner-only: lets the library show the link again. */
  shareToken: string | null;
};

export type SaveOutcome =
  | { status: "ok"; version: number; updatedAt: Date }
  | { status: "conflict"; latestVersion: number }
  | { status: "not_found" }
  | { status: "invalid" };

const owned = (accountId: string, id: string) =>
  and(eq(plan.id, id), eq(plan.ownerId, accountId), isNull(plan.deletedAt));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isPlanId = (id: string) => UUID_RE.test(id);

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listPlans(
  accountId: string,
  opts: { query?: string; limit?: number } = {},
): Promise<{ items: PlanSummary[]; hasMore: boolean }> {
  const limit = Math.max(1, Math.min(opts.limit ?? LIBRARY_PAGE_SIZE, 240));
  const q = opts.query?.trim();
  const rows = await getDb()
    .select({
      id: plan.id,
      title: plan.title,
      document: plan.document,
      shareToken: plan.shareToken,
      updatedAt: plan.updatedAt,
    })
    .from(plan)
    .where(and(eq(plan.ownerId, accountId), isNull(plan.deletedAt), q ? ilike(plan.title, `%${escapeLike(q)}%`) : undefined))
    .orderBy(desc(plan.updatedAt), desc(plan.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    title: r.title,
    updatedAt: r.updatedAt,
    shareActive: r.shareToken !== null,
    shareToken: r.shareToken,
    ...programStats(r.document as Program),
  }));
  return { items, hasMore: rows.length > limit };
}

/** New empty plan (one set of 6 empty slots). Titles are localized by the caller. */
export async function createPlan(accountId: string, titles: { title: string; setTitle: string }): Promise<{ id: string }> {
  const id = randomUUID();
  const doc = newProgram(id, titles.title.slice(0, TITLE_MAX), titles.setTitle);
  await getDb().insert(plan).values({ id, ownerId: accountId, title: doc.title, document: doc });
  return { id };
}

export type OwnedPlan = { program: Program; version: number; shareToken: string | null; updatedAt: Date };

/** Owner-only read; `null` for a missing, deleted or foreign plan (callers answer notFound). */
export async function getPlan(accountId: string, id: string): Promise<OwnedPlan | null> {
  if (!isPlanId(id)) return null;
  const [row] = await getDb()
    .select({ document: plan.document, version: plan.version, shareToken: plan.shareToken, updatedAt: plan.updatedAt })
    .from(plan)
    .where(owned(accountId, id))
    .limit(1);
  if (!row) return null;
  return { program: { ...(row.document as Program), id }, version: row.version, shareToken: row.shareToken, updatedAt: row.updatedAt };
}

/**
 * Versioned full-document save. The conditional UPDATE is atomic: it applies only when `version` still equals
 * `expectedVersion`. A stale version is a `conflict` unless the stored content equals the incoming content
 * (a retry whose first attempt already landed), which is answered `ok` so a retry never conflicts with itself.
 */
export async function savePlan(accountId: string, id: string, document: unknown, expectedVersion: number): Promise<SaveOutcome> {
  if (!isPlanId(id)) return { status: "not_found" };
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return { status: "invalid" };
  const checked = validatePlanDocument(document, id);
  if (!checked.ok) return { status: "invalid" };
  const doc = checked.doc;
  const db = getDb();

  const [updated] = await db
    .update(plan)
    .set({ document: doc, title: doc.title, version: sql`${plan.version} + 1`, updatedAt: new Date() })
    .where(and(owned(accountId, id), eq(plan.version, expectedVersion)))
    .returning({ version: plan.version, updatedAt: plan.updatedAt });
  if (updated) return { status: "ok", ...updated };

  const [current] = await db
    .select({ document: plan.document, version: plan.version, updatedAt: plan.updatedAt })
    .from(plan)
    .where(owned(accountId, id))
    .limit(1);
  if (!current) return { status: "not_found" };
  if (stableStringify(current.document) === stableStringify(doc)) {
    return { status: "ok", version: current.version, updatedAt: current.updatedAt };
  }
  return { status: "conflict", latestVersion: current.version };
}

/** Copy with new ids, no share token, a localized "(copy)" suffix truncated to fit the title cap; appears on top. */
export async function duplicatePlan(
  accountId: string,
  id: string,
  opts: { copySuffix: string; untitled: string },
): Promise<{ id: string } | null> {
  const source = await getPlan(accountId, id);
  if (!source) return null;
  const newId = randomUUID();
  const suffix = ` ${opts.copySuffix}`;
  const base = (source.program.title.trim() || opts.untitled).slice(0, Math.max(0, TITLE_MAX - suffix.length));
  const doc = { ...cloneWithNewIds(source.program, newId), title: `${base}${suffix}` };
  await getDb().insert(plan).values({ id: newId, ownerId: accountId, title: doc.title, document: doc });
  return { id: newId };
}

/** Soft delete; also revokes the share link. */
export async function deletePlan(accountId: string, id: string): Promise<boolean> {
  if (!isPlanId(id)) return false;
  const rows = await getDb()
    .update(plan)
    .set({ deletedAt: new Date(), shareToken: null, shareEnabledAt: null })
    .where(owned(accountId, id))
    .returning({ id: plan.id });
  return rows.length > 0;
}

function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Idempotent: returns the existing token, or issues a new one atomically (COALESCE keeps a concurrent winner). */
export async function enableShare(accountId: string, id: string): Promise<{ shareToken: string } | null> {
  if (!isPlanId(id)) return null;
  const [row] = await getDb()
    .update(plan)
    .set({
      shareToken: sql`coalesce(${plan.shareToken}, ${newShareToken()})`,
      shareEnabledAt: sql`coalesce(${plan.shareEnabledAt}, now())`,
    })
    .where(owned(accountId, id))
    .returning({ shareToken: plan.shareToken });
  return row?.shareToken ? { shareToken: row.shareToken } : null;
}

/** Revoke: the token becomes NULL, so the old URL fails at once; re-enabling issues a different token. */
export async function disableShare(accountId: string, id: string): Promise<boolean> {
  if (!isPlanId(id)) return false;
  const rows = await getDb()
    .update(plan)
    .set({ shareToken: null, shareEnabledAt: null })
    .where(owned(accountId, id))
    .returning({ id: plan.id });
  return rows.length > 0;
}

/** Public read by token: the document without any owner data, or `null` for every failure. */
export async function getSharedPlan(token: string): Promise<Program | null> {
  if (!SHARE_TOKEN_RE.test(token)) return null;
  const [row] = await getDb()
    .select({ document: plan.document })
    .from(plan)
    .where(and(eq(plan.shareToken, token), isNull(plan.deletedAt)))
    .limit(1);
  if (!row) return null;
  return { ...(row.document as Program), id: "shared" };
}
