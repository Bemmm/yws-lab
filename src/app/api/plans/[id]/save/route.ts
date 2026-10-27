import { NextResponse } from "next/server";
import { getAccountFromRequest } from "@/server/auth/session";
import { keepaliveBodySchema } from "@/server/plans/save-request";
import { savePlan } from "@/server/plans/service";

export const dynamic = "force-dynamic";

/**
 * Final-flush endpoint for `fetch(..., { keepalive: true })` on pagehide (YWSLAB-70). A server action cannot be
 * used there: it is not guaranteed to survive navigation. Same rules as `savePlanAction`: session cookie identity,
 * owner-scoped plan, zod envelope + full document validation, versioned save with save ids.
 *
 * Browsers cap keepalive bodies at 64 KiB; the client skips bodies over 60 000 bytes. The server accepts up to
 * 256 KB so a non-keepalive caller is not penalised, and answers 413 beyond that.
 */
const MAX_BODY_BYTES = 256 * 1024;

const STATUS = { ok: 200, conflict: 409, not_found: 404, invalid: 400 } as const;

function json(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  // CSRF: the session cookie is SameSite=Lax, and browsers that send Fetch Metadata must say same-origin.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return json({ status: "unauthorized" }, 403);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json({ status: "invalid" }, 415);
  }

  const account = await getAccountFromRequest(request);
  if (!account) return json({ status: "unauthorized" }, 401);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ status: "invalid" }, 413);
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return json({ status: "invalid" }, 413);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return json({ status: "invalid" }, 400);
  }
  const body = keepaliveBodySchema.safeParse(raw);
  if (!body.success) return json({ status: "invalid" }, 400);

  const { id } = await ctx.params;
  try {
    const res = await savePlan(account.id, id, body.data.document, body.data.expectedVersion, body.data.meta);
    if (res.status === "ok") return json({ status: "ok", version: res.version, updatedAt: res.updatedAt.toISOString() }, 200);
    if (res.status === "conflict") return json({ status: "conflict", latestVersion: res.latestVersion }, STATUS.conflict);
    return json({ status: res.status }, STATUS[res.status]);
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? String((err as { code: unknown }).code) : "unknown";
    console.error("plans.save(keepalive) failed", { id, code });
    return json({ status: "error" }, 500);
  }
}
